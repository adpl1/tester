import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3wjOh1IZLS5cK8dH0fB6nwKH50iXvFhk",
  authDomain: "ahmad-b755f.firebaseapp.com",
  projectId: "ahmad-b755f",
  storageBucket: "ahmad-b755f.firebasestorage.app",
  messagingSenderId: "1086597289816",
  appId: "1:1086597289816:web:efe60451f04837b75e772d",
  measurementId: "G-E41VP56DLZ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(()=>{});

let currentUser=null, userData=null, currentOrder=null, allOrders=[], currentFilter='available', ordersUnsub=null, chatUnsub=null, orderUnsub=null, courierWatchId=null, courierSyncBusy=false;

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
window.$ = $;
window.$$ = $$;

// === نظام الإشعارات (صوت + Notification API) ===
function requestNotifPermission(){
  try{ if('Notification' in window && Notification.permission==='default') Notification.requestPermission().catch(()=>{}); }catch(e){}
}
document.addEventListener('click', requestNotifPermission, { once:true });

function showNotification(title, body, tag){
  try{
    if(!('Notification' in window) || Notification.permission!=='granted') return;
    const opts = { body: body||'', icon: './favicon.png', badge: './favicon.png', tag: tag||'adpl-d', vibrate:[300,150,300,150,300], renotify:true };
    if(navigator.serviceWorker && navigator.serviceWorker.ready){
      navigator.serviceWorker.ready.then(reg => reg.showNotification(title, opts)).catch(()=>{ try{ new Notification(title, opts); }catch(_){} });
    } else { new Notification(title, opts); }
  }catch(e){}
}

// === الأصوات ===
function _beep(ctx, freqs, dur, gain){
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type='sine';
  freqs.forEach((f,i)=> o.frequency.setValueAtTime(f, ctx.currentTime + i*(dur/freqs.length)));
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+dur);
  o.start(ctx.currentTime); o.stop(ctx.currentTime+dur);
}
function playSound(type){
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    if(type==='order'){
      // صوت طلب جديد مستمر تقريباً 2 ثانية (نغمات متتابعة)
      const pattern = [0, 250, 500, 750, 1000, 1250, 1500, 1750];
      pattern.forEach(t => setTimeout(()=>{
        try{ _beep(ctx, [520,780,1040], 0.22, 0.22); }catch(_){}
      }, t));
      // اهتزاز للجوال
      try{ navigator.vibrate && navigator.vibrate([200,100,200,100,200,100,200,100,200]); }catch(_){}
      setTimeout(()=>ctx.close().catch(()=>{}), 2500);
    } else if(type==='accept'){
      _beep(ctx, [880,1100], 0.35, 0.2);
      setTimeout(()=>ctx.close().catch(()=>{}), 800);
    } else if(type==='chat'){
      _beep(ctx, [800,1000], 0.3, 0.12);
      setTimeout(()=>ctx.close().catch(()=>{}), 800);
    }
  }catch(e){}
}

window.toast = (m,t='') => { const e=$('#toast'); e.textContent=m; e.className='toast show '+t; setTimeout(()=>e.classList.remove('show'),2500); };
window.showScreen = (id) => {
  $$('.screen').forEach(s=>s.classList.remove('active'));
  $('#'+id).classList.add('active');
  $$('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.nav===id));
  if($('#bottomNav')) $('#bottomNav').style.display = id==='chatScreen' ? 'none' : (currentUser ? 'flex' : 'none');
};
$$('.nav-item').forEach(n=>n.addEventListener('click',()=>showScreen(n.dataset.nav)));
$$('.tab').forEach(t=>t.addEventListener('click',()=>{
  $$('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
  $('#loginForm').style.display = t.dataset.tab==='login'?'block':'none';
  $('#registerForm').style.display = t.dataset.tab==='register'?'block':'none';
  $('#authErr').classList.remove('show');
}));

function showErr(m){const e=$('#authErr');e.textContent=m;e.classList.add('show')}
function mapErr(e){
  const c=e.code||'';
  if(c.includes('email-already'))return 'البريد مسجل';
  if(c.includes('invalid-email'))return 'بريد غير صالح';
  if(c.includes('weak-password'))return 'كلمة مرور ضعيفة';
  if(c.includes('wrong-password')||c.includes('invalid-credential')||c.includes('user-not-found'))return 'بيانات غير صحيحة';
  return e.message||'خطأ';
}

// Helper to convert file to base64
window.updateFileLabel = (inputId, labelId) => {
  const file = document.getElementById(inputId).files[0];
  if(file) document.getElementById(labelId).textContent = '✅ ' + file.name;
};
function compressImage(file, maxWidth=400, quality=0.6){
  return new Promise((res)=>{
    const reader = new FileReader();
    reader.onload = e=>{
      const img = new Image();
      img.onload = ()=>{
        const canvas = document.createElement('canvas');
        const ratio = Math.min(maxWidth/img.width, maxWidth/img.height, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        res(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

$('#loginBtn').addEventListener('click', async ()=>{
  const email=$('#loginEmail').value.trim(), pass=$('#loginPass').value;
  if(!email||!pass)return showErr('أدخل البيانات');
  $('#loginBtn').disabled=true;
  try{await signInWithEmailAndPassword(auth,email,pass)}catch(e){showErr(mapErr(e))}
  $('#loginBtn').disabled=false;
});

$('#regBtn').addEventListener('click', async ()=>{
  const name=$('#regName').value.trim();
  const phoneRaw=$('#regPhone').value.trim();
  const email=$('#regEmail').value.trim();
  const pass=$('#regPass').value;
  const idNumber=$('#regIdNumber').value.trim();
  const vehicle=$('#regVehicle').value.trim();
  const city=$('#regCity').value.trim();

  // Validate
  if(!name||!phoneRaw||!email||!pass||!idNumber||!vehicle||!city) return showErr('يرجى تعبئة جميع الحقول المطلوبة');
  if(pass.length<6) return showErr('كلمة المرور 6 أحرف على الأقل');
  // Phone validation: must be digits only, 9-10 digits
  if(!/^\d{9,10}$/.test(phoneRaw)) return showErr('يجب إدخال رقم هاتف صحيح (مثال: 912345678)');
  const phone = '+963' + phoneRaw;

  const idFrontFile = document.getElementById('regIdFront').files[0];
  const idBackFile = document.getElementById('regIdBack').files[0];
  const selfieFile = document.getElementById('regSelfie').files[0];
  const vehicleImgFile = document.getElementById('regVehicleImg').files[0];
  if(!idFrontFile) return showErr('يرجى رفع صورة الهوية (الوجه الأمامي)');
  if(!idBackFile) return showErr('يرجى رفع صورة الهوية (الوجه الخلفي)');
  if(!selfieFile) return showErr('يرجى رفع صورة شخصية (سيلفي)');
  if(!vehicleImgFile) return showErr('يرجى رفع صورة المركبة');

  $('#regBtn').disabled=true;
  $('#regBtn').textContent = 'جارٍ إنشاء الحساب...';
  try{
    const [selfieB64, idFrontB64, idBackB64, vehicleImgB64] = await Promise.all([
      compressImage(selfieFile, 350, 0.5),
      compressImage(idFrontFile, 350, 0.5),
      compressImage(idBackFile, 350, 0.5),
      compressImage(vehicleImgFile, 350, 0.5),
    ]);
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db,'users',cred.user.uid),{
      uid: cred.user.uid,
      name, phone, email, vehicle, city, idNumber,
      selfie: selfieB64,
      idFront: idFrontB64,
      idBack: idBackB64,
      vehicleImage: vehicleImgB64,
      role: 'delivery',
      status: 'pending',
      available: false,
      createdAt: serverTimestamp()
    });
  }catch(e){
    console.error('خطأ التسجيل:', e);
    showErr(mapErr(e));
    $('#regBtn').disabled=false;
    $('#regBtn').innerHTML='<i class="fas fa-user-plus"></i> إنشاء حساب مندوب';
  }
});

window.logout = async () => { try{await signOut(auth)}catch(e){} };

onAuthStateChanged(auth, async (user)=>{
  if(user){
    currentUser=user;
    const snap=await getDoc(doc(db,'users',user.uid));
    if(snap.exists()) {
      userData=snap.data();
    } else {
      userData={uid:user.uid,name:user.email.split('@')[0],email:user.email,phone:'',vehicle:'',city:'',role:'delivery',status:'pending',available:false};
      await setDoc(doc(db,'users',user.uid),userData,{merge:true});
    }
    if(userData.role!=='delivery'){ toast('هذا ليس حساب مندوب','error'); await signOut(auth); return; }
    // Check account status
    if(userData.status==='rejected'){
      toast('تم رفض حسابك من قبل الإدارة','error');
      await signOut(auth);
      return;
    }
    if(userData.status==='pending'){
      $('#bottomNav').style.display='none';
      $$('.screen').forEach(s=>s.classList.remove('active'));
      $('#pendingScreen').classList.add('active');
      return;
    }
    // status === 'active'
    initApp();
  } else {
    currentUser=null; userData=null;
    $('#bottomNav').style.display='none';
    showScreen('authScreen');
  }
});

function initApp(){
  $('#helloName').textContent = userData.name;
  $('#profAvatar').textContent = (userData.name||'?').charAt(0);
  $('#profName').textContent = userData.name;
  $('#profEmail').textContent = userData.email;
  $('#profVehicle').textContent = userData.vehicle ? `مركبة: ${userData.vehicle}` : '';
  $('#bottomNav').style.display='flex';
  showScreen('homeScreen');
  updateSwitch();
  subscribeOrders();
  syncCourierLocation();
}

function updateSwitch(){
  const on = !!userData.available;
  $('#availSwitch').classList.toggle('on', on);
  $('#availIcon').style.color = on?'var(--success)':'var(--gray)';
  $('#statusLabel').textContent = on?'متاح':'غير متاح';
}

$('#availSwitch').addEventListener('click', async ()=>{
  userData.available = !userData.available;
  updateSwitch();
  try{ await updateDoc(doc(db,'users',currentUser.uid),{available:userData.available}); }
  catch(e){toast('خطأ','error')}
  syncCourierLocation();
});

$$('#tabsPills .pill').forEach(p=>p.addEventListener('click',()=>{
  $$('#tabsPills .pill').forEach(x=>x.classList.remove('active'));
  p.classList.add('active');
  currentFilter = p.dataset.filter;
  renderOrders();
}));


function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function haversineKm(a,b){
  if(!a || !b || a.lat==null || a.lng==null || b.lat==null || b.lng==null) return null;
  const toRad = d => d*Math.PI/180;
  const R = 6371;
  const dLat = toRad(b.lat-a.lat);
  const dLng = toRad(b.lng-a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const x = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
async function syncCourierLocation(){
  if(courierWatchId!==null && navigator.geolocation){ navigator.geolocation.clearWatch(courierWatchId); courierWatchId = null; }
  if(!navigator.geolocation || !userData.available) return;
  const push = async (pos)=>{
    if(courierSyncBusy) return;
    courierSyncBusy = true;
    const currentLocation = {lat:pos.coords.latitude, lng:pos.coords.longitude};
    try{ await updateDoc(doc(db,'users',currentUser.uid), {currentLocation, currentLocationUpdatedAt: serverTimestamp()}); }catch(e){}
    courierSyncBusy = false;
  };
  navigator.geolocation.getCurrentPosition(push,()=>{}, {enableHighAccuracy:true,timeout:10000,maximumAge:0});
  courierWatchId = navigator.geolocation.watchPosition(push,()=>{}, {enableHighAccuracy:true,maximumAge:5000,timeout:15000});
}
function playNewOrderAlert(){ playSound('order'); }

function subscribeOrders(){
  if(ordersUnsub) ordersUnsub();
  let lastAvailableIds = new Set();
  let firstSnap = true;
  ordersUnsub = onSnapshot(collection(db,'orders'),(snap)=>{
    allOrders = snap.docs.map(d=>({id:d.id,...d.data()}));
    const availableNow = allOrders.filter(o=>o.status==='pending'&&!o.deliveryId);
    const currentIds = new Set(availableNow.map(o=>o.id));
    const newOnes = availableNow.filter(o=>!lastAvailableIds.has(o.id));
    if(!firstSnap && newOnes.length && userData?.available){
      playNewOrderAlert();
      const o = newOnes[0];
      showNotification('طلب جديد متاح 🚨', `طلب من ${o.storeName||'متجر'} - ${(o.total||0)} ل.س`, 'new-order');
    }
    lastAvailableIds = currentIds;
    firstSnap = false;
    const mine = allOrders.filter(o=>o.deliveryId===currentUser.uid);
    $('#sTotal').textContent = mine.length;
    $('#sDone').textContent = mine.filter(o=>o.status==='delivered').length;
    $('#sActive').textContent = mine.filter(o=>['accepted','on_way'].includes(o.status)).length;
    renderOrders();
  });
}

function statusLabel(s){ return {pending:'قيد انتظار قبول المندوب',accepted:'تم القبول',on_way:'في الطريق',delivered:'تم التسليم',cancelled:'ملغي'}[s]||s; }

function renderOrders(){
  const now = Date.now();
  let list = [];
  if(currentFilter==='available') list = allOrders.filter(o=>{
    if(o.status!=='pending'||o.deliveryId) return false;
    // Only show orders created within last 4 minutes
    const created = o.createdAt?.seconds ? o.createdAt.seconds * 1000 : 0;
    return created && (now - created) <= 4 * 60 * 1000;
  });
  if(currentFilter==='mine_active') list = allOrders.filter(o=>o.deliveryId===currentUser.uid && ['accepted','on_way'].includes(o.status));
  if(currentFilter==='mine_done') list = allOrders.filter(o=>o.deliveryId===currentUser.uid && ['delivered','cancelled'].includes(o.status));
  list.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  const pageSize = 6;
  const visible = list.slice(0, currentFilter==='available' ? pageSize : pageSize * 5);
  if(!list.length){ $('#ordersList').innerHTML = `<div class="empty"><i class="fas fa-inbox"></i><h4>لا توجد طلبات</h4></div>`; return; }
  $('#ordersList').innerHTML = visible.map(o=>`
    <div class="order-card" data-id="${o.id}">
      <div class="order-head"><h5><i class="fas fa-store" style="color:var(--primary)"></i> ${esc(o.storeName||'طلب')}</h5><span class="badge ${o.status}">${statusLabel(o.status)}</span></div>
      <div class="row"><i class="fas fa-user" style="width:14px"></i> ${esc(o.userName||'عميل')}</div>
      <div class="row"><i class="fas fa-phone" style="width:14px"></i> ${esc(o.userPhone||'غير محدد')}</div>
      ${o.type==='custom'?`<div class="row"><i class="fas fa-wand-magic-sparkles" style="width:14px"></i> طلب مخصص</div>`:`<div class="row"><i class="fas fa-box" style="width:14px"></i> ${(o.items||[]).length} أصناف</div>`}
      <div class="total"><span>الإجمالي</span><span class="val">${currency(o.total||0)}</span></div>
    </div>`).join('');
  $$('#ordersList .order-card').forEach(c=>c.addEventListener('click',()=>openOrder(c.dataset.id)));
  let more = document.getElementById('ordersMore');
  if(!more){
    more = document.createElement('button');
    more.id = 'ordersMore';
    more.className = 'btn btn-ghost';
    more.style.marginTop = '10px';
    document.querySelector('#ordersList').insertAdjacentElement('afterend', more);
  }
  more.textContent = 'تحميل المزيد';
  more.style.display = list.length > visible.length ? 'block' : 'none';
  more.onclick = ()=>{ currentFilter = currentFilter; renderOrders(); };
}

function openOrder(id){
  stopTracking();
  if(orderUnsub) orderUnsub();
  orderUnsub = onSnapshot(doc(db,'orders',id),(snap)=>{
    if(!snap.exists()) return;
    currentOrder = {id:snap.id,...snap.data()};
    renderOrderDetail();
  });
  showScreen('orderScreen');
}

function renderOrderDetail(){
  const o = currentOrder;
  const itemsHtml = (o.items||[]).map(i=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed var(--border);font-size:13px"><span>${esc(i.name)} × ${i.qty}</span><strong>${i.price*i.qty} ل.س</strong></div>`).join('');
  let actionBtn = '';
  if(o.status==='pending' && !o.deliveryId) actionBtn = `<button class="btn btn-success" id="acceptBtn"><i class="fas fa-check"></i> قبول الطلب</button>`;
  else if(o.status==='accepted' && o.deliveryId===currentUser.uid) actionBtn = `<button class="btn btn-primary" id="onwayBtn"><i class="fas fa-motorcycle"></i> بدأت التوصيل</button><button class="btn btn-danger" id="cancelBtn" style="margin-top:8px"><i class="fas fa-times-circle"></i> إلغاء الطلب</button>`;
  else if(o.status==='on_way' && o.deliveryId===currentUser.uid) actionBtn = `<div class="map-note" style="margin-top:4px"><i class="fas fa-satellite-dish"></i> التتبع نشط - يتم تحديث موقعك تلقائياً</div><button class="btn btn-success" id="deliveredBtn" style="margin-top:8px"><i class="fas fa-circle-check"></i> تم التسليم</button><button class="btn btn-danger" id="cancelBtn" style="margin-top:8px"><i class="fas fa-times-circle"></i> إلغاء الطلب</button>`;

  $('#orderBody').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="font-size:17px;font-weight:800"><i class="fas fa-store" style="color:var(--primary)"></i> ${esc(o.storeName||'طلب')}</h3>
      <span class="badge ${o.status}">${statusLabel(o.status)}</span>
    </div>
    <div class="total-card">
      <h4><i class="fas fa-user"></i> معلومات العميل</h4>
      <div class="total-row"><span>الاسم</span><strong>${esc(o.userName||'-')}</strong></div>
      <div class="total-row"><span>الهاتف</span><strong><a href="tel:${esc(o.userPhone||'')}" style="color:var(--primary)">${esc(o.userPhone||'-')}</a></strong></div>
    </div>
    ${o.type==='custom'?`<div class="total-card"><h4><i class="fas fa-wand-magic-sparkles"></i> طلب مخصص</h4><p style="font-size:13px;line-height:1.6">${esc(o.customRequest||'')}</p>${o.budget?`<p style="font-size:12px;color:var(--gray);margin-top:6px">الميزانية: ${o.budget} ل.س</p>`:''}</div>`:''}
    ${itemsHtml?`<div class="total-card"><h4><i class="fas fa-box"></i> الأصناف</h4>${itemsHtml}</div>`:''}
    <div class="total-card">
      <div class="total-row"><span>المجموع</span><strong>${currency(o.subtotal||0)}</strong></div>
      <div class="total-row"><span>التوصيل</span><strong>${currency(o.deliveryFee||0)}</strong></div>
      <div class="total-row big"><span>الإجمالي</span><strong style="color:var(--primary)">${currency(o.total||0)}</strong></div>
    </div>
    ${o.address?`<div class="total-card"><h4><i class="fas fa-location-dot"></i> العنوان</h4><p style="font-size:13px">${esc(o.address)}</p></div>`:''}
    ${o.note?`<div class="total-card"><h4><i class="fas fa-note-sticky"></i> ملاحظات</h4><p style="font-size:13px">${esc(o.note)}</p></div>`:''}
    <div id="orderMap" style="margin-top:10px"></div>
    <div style="margin-top:10px">${actionBtn}</div>
  `;

  setTimeout(()=>{
    if(window._orderMap){ try{ window._orderMap.remove(); }catch(e){} }
    window._orderMap = L.map('orderMap').setView([o.location.lat,o.location.lng],15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'}).addTo(window._orderMap);
    // علامة المستخدم
    const userIcon = L.divIcon({html:'<div style="background:#FF5A1F;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3)"></div>',className:'',iconSize:[20,20],iconAnchor:[10,10]});
    L.marker([o.location.lat,o.location.lng],{icon:userIcon}).addTo(window._orderMap).bindPopup('موقع العميل');
    window._orderMap.invalidateSize();
    // إذا كان المندوب في الطريق، ابدأ التتبع التلقائي فوراً
    if(o.status==='on_way' && o.deliveryId===currentUser.uid){
      startTracking(o);
    }
  },200);

  const aBtn=$('#acceptBtn'); if(aBtn) aBtn.addEventListener('click',async ()=>{
    aBtn.disabled=true;
    try{
      await updateDoc(doc(db,'orders',o.id),{status:'accepted',deliveryId:currentUser.uid,deliveryName:userData.name,deliveryPhone:userData.phone||''});
      toast('تم قبول الطلب','success');
      playSound('accept');
      showNotification('تم قبول الطلب ✅', `أنت الآن مسؤول عن طلب ${o.storeName||''} - توجّه لاستلامه`, 'order-accepted-'+o.id);
    }
    catch(e){toast('خطأ','error')}
  });
  const owBtn=$('#onwayBtn'); if(owBtn) owBtn.addEventListener('click',async ()=>{
    owBtn.disabled=true;
    try{
      await updateDoc(doc(db,'orders',o.id),{status:'on_way'});
      toast('في الطريق - يتم فتح الملاحة...','success');
      // فتح Google Maps مع الملاحة الصوتية من موقع المندوب إلى موقع العميل
      if(navigator.geolocation){
        navigator.geolocation.getCurrentPosition((pos)=>{
          const fromLat = pos.coords.latitude;
          const fromLng = pos.coords.longitude;
          const toLat = o.location.lat;
          const toLng = o.location.lng;
          // فتح Google Maps بالملاحة الصوتية
          const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=driving&dir_action=navigate`;
          window.open(gmapsUrl, '_blank');
        },(err)=>{
          // إذا لم يتوفر الموقع الحالي، فتح الخريطة للوجهة فقط
          const toLat = o.location.lat;
          const toLng = o.location.lng;
          const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${toLat},${toLng}&travelmode=driving&dir_action=navigate`;
          window.open(gmapsUrl, '_blank');
        },{enableHighAccuracy:true,timeout:8000,maximumAge:0});
      } else {
        const toLat = o.location.lat;
        const toLng = o.location.lng;
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${toLat},${toLng}&travelmode=driving&dir_action=navigate`,'_blank');
      }
    }catch(e){toast('خطأ','error')}
  });
  const dBtn=$('#deliveredBtn'); if(dBtn) dBtn.addEventListener('click',async ()=>{
    dBtn.disabled=true;
    try{
      stopTracking();
      await updateDoc(doc(db,'orders',o.id),{status:'delivered'});
      toast('تم التسليم','success');
    }catch(e){toast('خطأ','error')}
  });
  const cancelBtn=$('#cancelBtn'); if(cancelBtn) cancelBtn.addEventListener('click',async ()=>{
    if(!confirm('هل أنت متأكد من إلغاء الطلب؟')) return;
    cancelBtn.disabled=true;
    try{
      stopTracking();
      await updateDoc(doc(db,'orders',o.id),{status:'cancelled',deliveryId:null,deliveryName:null,deliveryPhone:null});
      toast('تم إلغاء الطلب','success');
      showScreen('homeScreen');
    }catch(e){toast('خطأ','error');cancelBtn.disabled=false;}
  });
}

let trackWatchId = null;
let routeLayer = null;
let courierMarker = null;

async function fetchRoute(fromLat, fromLng, toLat, toLng){
  try{
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const json = await res.json();
    const coords = json?.routes?.[0]?.geometry?.coordinates;
    if(coords && coords.length) return coords.map(([lng,lat])=>[lat,lng]);
  }catch(e){}
  return [[fromLat,fromLng],[toLat,toLng]];
}

function stopTracking(){
  if(trackWatchId!==null && navigator.geolocation){ navigator.geolocation.clearWatch(trackWatchId); trackWatchId=null; }
  if(routeLayer && window._orderMap){ try{ window._orderMap.removeLayer(routeLayer); }catch(e){} routeLayer=null; }
  if(courierMarker && window._orderMap){ try{ window._orderMap.removeLayer(courierMarker); }catch(e){} courierMarker=null; }
}

async function updateCourierOnMap(lat, lng, o){
  if(!window._orderMap) return;
  const courierIcon = L.divIcon({html:'<div style="background:#0EA5E9;width:24px;height:24px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:12px">🏍</div>',className:'',iconSize:[24,24],iconAnchor:[12,12]});
  if(courierMarker){ courierMarker.setLatLng([lat,lng]); }
  else{ courierMarker = L.marker([lat,lng],{icon:courierIcon}).addTo(window._orderMap).bindPopup('موقعي الحالي'); }
  try{
    const route = await fetchRoute(lat,lng,o.location.lat,o.location.lng);
    if(routeLayer) window._orderMap.removeLayer(routeLayer);
    routeLayer = L.polyline(route,{color:'#0EA5E9',weight:6,opacity:0.85}).addTo(window._orderMap);
    window._orderMap.fitBounds(routeLayer.getBounds(),{padding:[24,24]});
  }catch(e){}
  try{ await updateDoc(doc(db,'orders',o.id),{deliveryLocation:{lat,lng},deliveryLocationUpdatedAt:serverTimestamp()}); }catch(e){}
}

async function startTracking(o){
  if(!navigator.geolocation) return toast('الموقع غير مدعوم على هذا الجهاز','error');
  toast('جاري تحديد موقعك...','');
  stopTracking();
  // موقع فوري أولاً
  navigator.geolocation.getCurrentPosition(
    async (pos)=>{
      await updateCourierOnMap(pos.coords.latitude, pos.coords.longitude, o);
      toast('تم تحديد موقعك - التتبع نشط','success');
    },
    (err)=>{
      let msg = 'تعذر تحديد الموقع';
      if(err.code===1) msg = 'يرجى السماح بالوصول للموقع من إعدادات المتصفح';
      else if(err.code===2) msg = 'الموقع غير متاح، تأكد من تفعيل GPS';
      else if(err.code===3) msg = 'انتهى وقت تحديد الموقع، حاول مجدداً';
      toast(msg,'error');
    },
    {enableHighAccuracy:true, timeout:12000, maximumAge:0}
  );
  // تتبع مستمر كل ثوانٍ
  trackWatchId = navigator.geolocation.watchPosition(
    async (pos)=>{ await updateCourierOnMap(pos.coords.latitude, pos.coords.longitude, o); },
    (err)=>{},
    {enableHighAccuracy:true, maximumAge:3000, timeout:15000}
  );
}

$('#chatBtn').addEventListener('click', ()=>{
  if(!currentOrder) return;
  // إخفاء النقطة الحمراء
  const dot = document.getElementById('chatNotifDot');
  if(dot) dot.classList.remove('show');
  if(chatUnsub) chatUnsub();
  $('#chatMessages').innerHTML='';
  const chatName = currentOrder.userName || 'العميل';
  const chatPhone = currentOrder.userPhone || '';
  $('#chatTitle').textContent = chatName;
  $('#chatMeta').textContent = chatPhone ? `الجوال: ${esc(chatPhone)}` : 'معلومات العميل';
  $('#chatAvatar').textContent = (chatName||'?').trim().charAt(0) || '-';
  let lastMsgCount = 0;
  const q = query(collection(db,'chats',currentOrder.id,'messages'), orderBy('timestamp','asc'));
  chatUnsub = onSnapshot(q,(snap)=>{
    const isOnChat = $('#chatScreen').classList.contains('active');
    if(snap.docs.length > lastMsgCount && lastMsgCount > 0){
      const latest = snap.docs[snap.docs.length-1].data();
      if(latest.from !== currentUser.uid){
        playSound('chat');
        if(!isOnChat){
          const dot2 = document.getElementById('chatNotifDot');
          if(dot2) dot2.classList.add('show');
        }
      }
    }
    lastMsgCount = snap.docs.length;
    $('#chatMessages').innerHTML = snap.docs.map(d=>{
      const m=d.data();
      const mine = m.from===currentUser.uid;
      return `<div class="msg ${mine?'me':'other'}">${esc(m.text)}<div class="msg-time">${m.fromName||''}</div></div>`;
    }).join('');
    $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
  });
  showScreen('chatScreen');
});

window.sendMsg = async ()=>{
  const t = $('#chatInput').value.trim(); if(!t||!currentOrder) return;
  $('#chatInput').value='';
  try{await addDoc(collection(db,'chats',currentOrder.id,'messages'),{from:currentUser.uid,fromName:userData.name,text:t,timestamp:serverTimestamp()})}
  catch(e){toast('خطأ','error')}
};


function currency(v){ return `${Math.round(+v||0)} ل.س`; }
function esc(s){return String(s||'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]))}

// تسجيل Service Worker مع تحديث تلقائي
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      setInterval(() => { reg.update().catch(()=>{}); }, 60000);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing; if(!nw) return;
        nw.addEventListener('statechange', () => {
          if(nw.state==='installed' && navigator.serviceWorker.controller) nw.postMessage({type:'SKIP_WAITING'});
        });
      });
    }).catch(()=>{});
    let _r=false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if(_r) return; _r=true;
      if('caches' in window){ caches.keys().then(keys => keys.forEach(k => { if(!k.includes('runtime')) caches.delete(k); })); }
      window.location.reload();
    });
  });
}