import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, collection, query, where, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3wjOh1IZLS5cK8dH0fB6nwKH50iXvFhk",
  authDomain: "ahmad-b755f.firebaseapp.com",
  projectId: "ahmad-b755f",
  storageBucket: "ahmad-b755f.firebasestorage.app",
  messagingSenderId: "1086597289816",
  appId: "1:1086597289816:web:efe60451f04837b75e772d"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(()=>{});

const SEARCH_RADIUS_KM = 30;
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
window.toast = (m,t='') => { const e=$('#toast'); e.textContent=m; e.className='toast show '+t; setTimeout(()=>e.classList.remove('show'),2500); };
const km = (a,b)=>{ if(!a||!b) return null; const R=6371,toR=x=>x*Math.PI/180; const dLat=toR(b.lat-a.lat),dLng=toR(b.lng-a.lng); const x=Math.sin(dLat/2)**2+Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(x)); };
function esc(s){return String(s||'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]))}

// === الإشعارات والصوت ===
function requestNotifPermission(){ try{ if('Notification' in window && Notification.permission==='default') Notification.requestPermission().catch(()=>{}); }catch(e){} }
document.addEventListener('click', requestNotifPermission, { once:true });
function showNotification(title, body, tag){
  try{
    if(!('Notification' in window) || Notification.permission!=='granted') return;
    const opts = { body: body||'', icon: './favicon.png', badge: './favicon.png', tag: tag||'adpl-c', vibrate:[300,150,300,150,300], renotify:true };
    if(navigator.serviceWorker && navigator.serviceWorker.ready){
      navigator.serviceWorker.ready.then(reg => reg.showNotification(title, opts)).catch(()=>{ try{ new Notification(title, opts); }catch(_){} });
    } else { new Notification(title, opts); }
  }catch(e){}
}
function _beep(ctx, freqs, dur, gain){
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination); o.type='sine';
  freqs.forEach((f,i)=> o.frequency.setValueAtTime(f, ctx.currentTime + i*(dur/freqs.length)));
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+dur);
  o.start(ctx.currentTime); o.stop(ctx.currentTime+dur);
}
function playSound(type){
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    if(type==='ride'){
      // طلب رحلة جديدة - صوت مستمر تقريباً 2 ثانية
      [0,250,500,750,1000,1250,1500,1750].forEach(t=> setTimeout(()=>{ try{ _beep(ctx,[600,900,1200],0.22,0.22); }catch(_){} }, t));
      try{ navigator.vibrate && navigator.vibrate([200,100,200,100,200,100,200,100,200]); }catch(_){}
      setTimeout(()=>ctx.close().catch(()=>{}),2500);
    } else if(type==='accept'){
      _beep(ctx,[880,1100],0.35,0.2);
      setTimeout(()=>ctx.close().catch(()=>{}),800);
    }
  }catch(e){}
}

let currentUser=null, userData=null, currentFilter='incoming', online=false, locWatch=null, currentLoc=null;
let ridesUnsub=null, allRides=[], activeRideId=null, currentRide=null;

window.showScreen = (id) => {
  $$('.screen').forEach(s=>s.classList.remove('active'));
  $('#'+id).classList.add('active');
  $$('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.nav===id));
  if($('#bottomNav')) $('#bottomNav').style.display = currentUser && userData?.status==='active' ? 'flex' : 'none';
};
$$('.nav-item').forEach(n=>n.addEventListener('click',()=>showScreen(n.dataset.nav)));
$$('.tab').forEach(t=>t.addEventListener('click',()=>{
  $$('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
  $('#loginForm').style.display = t.dataset.tab==='login'?'block':'none';
  $('#registerForm').style.display = t.dataset.tab==='register'?'block':'none';
  $('#authErr').classList.remove('show');
}));

window.updateFileLabel = (inputId,labelId) => {
  const f = document.getElementById(inputId).files[0];
  if(f) document.getElementById(labelId).textContent = '✅ '+f.name;
};
function compressImage(file, maxWidth=350, quality=0.5){
  return new Promise(res=>{
    const r=new FileReader();
    r.onload=e=>{const img=new Image();img.onload=()=>{const c=document.createElement('canvas');const ratio=Math.min(maxWidth/img.width,maxWidth/img.height,1);c.width=img.width*ratio;c.height=img.height*ratio;c.getContext('2d').drawImage(img,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',quality));};img.src=e.target.result;};
    r.readAsDataURL(file);
  });
}
function showErr(m){const e=$('#authErr');e.textContent=m;e.classList.add('show')}
function mapErr(e){const c=e.code||'';if(c.includes('email-already'))return 'البريد مسجل';if(c.includes('invalid-email'))return 'بريد غير صالح';if(c.includes('weak-password'))return 'كلمة مرور ضعيفة';if(c.includes('wrong-password')||c.includes('invalid-credential')||c.includes('user-not-found'))return 'بيانات غير صحيحة';return e.message||'خطأ'}

$('#loginBtn').addEventListener('click', async ()=>{
  const email=$('#loginEmail').value.trim(), pass=$('#loginPass').value;
  if(!email||!pass)return showErr('أدخل البيانات');
  $('#loginBtn').disabled=true;
  try{await signInWithEmailAndPassword(auth,email,pass)}catch(e){showErr(mapErr(e))}
  $('#loginBtn').disabled=false;
});

$('#regBtn').addEventListener('click', async ()=>{
  const name=$('#regName').value.trim(), phoneRaw=$('#regPhone').value.trim(), email=$('#regEmail').value.trim(),
        pass=$('#regPass').value, idNumber=$('#regIdNumber').value.trim(),
        car=$('#regCar').value.trim(), plate=$('#regPlate').value.trim(), city=$('#regCity').value.trim();
  if(!name||!phoneRaw||!email||!pass||!idNumber||!car||!plate||!city) return showErr('يرجى تعبئة جميع الحقول');
  if(pass.length<6) return showErr('كلمة المرور 6 أحرف على الأقل');
  if(!/^\d{9,10}$/.test(phoneRaw)) return showErr('رقم هاتف غير صحيح');
  const phone='+963'+phoneRaw;
  const idF=document.getElementById('regIdFront').files[0], idB=document.getElementById('regIdBack').files[0],
        sel=document.getElementById('regSelfie').files[0], lic=document.getElementById('regLicense').files[0],
        veh=document.getElementById('regVehicleImg').files[0];
  if(!idF||!idB||!sel||!lic||!veh) return showErr('يرجى رفع جميع الصور المطلوبة');
  $('#regBtn').disabled=true; $('#regBtn').textContent='جارٍ إنشاء الحساب...';
  try{
    const [selfieB,idFB,idBB,licB,vehB] = await Promise.all([compressImage(sel),compressImage(idF),compressImage(idB),compressImage(lic),compressImage(veh)]);
    const cred = await createUserWithEmailAndPassword(auth,email,pass);
    await setDoc(doc(db,'users',cred.user.uid),{
      uid:cred.user.uid, name, phone, email, idNumber, car, plate, city,
      selfie:selfieB, idFront:idFB, idBack:idBB, license:licB, vehicleImage:vehB,
      role:'captain', status:'pending', online:false, location:null,
      createdAt: serverTimestamp()
    });
  }catch(e){showErr(mapErr(e)); $('#regBtn').disabled=false; $('#regBtn').innerHTML='<i class="fas fa-user-plus"></i> إنشاء حساب كابتن';}
});

window.logout = async ()=>{ try{await signOut(auth)}catch(e){} };

onAuthStateChanged(auth, async (user)=>{
  if(user){
    currentUser=user;
    const snap=await getDoc(doc(db,'users',user.uid));
    if(snap.exists()) userData=snap.data();
    else { userData={uid:user.uid,name:user.email,email:user.email,role:'captain',status:'pending',online:false}; await setDoc(doc(db,'users',user.uid),userData,{merge:true}); }
    if(userData.role!=='captain'){ toast('هذا ليس حساب كابتن','error'); await signOut(auth); return; }
    if(userData.status==='rejected'){ toast('تم رفض حسابك','error'); await signOut(auth); return; }
    if(userData.status==='pending'){
      $$('.screen').forEach(s=>s.classList.remove('active'));
      $('#pendingScreen').classList.add('active');
      $('#bottomNav').style.display='none';
      return;
    }
    initApp();
  } else {
    currentUser=null; userData=null; stopWatching();
    $('#bottomNav').style.display='none';
    showScreen('authScreen');
  }
});

function initApp(){
  $('#helloName').textContent = userData.name||'الكابتن';
  $('#profAvatar').textContent = (userData.name||'?').charAt(0);
  $('#profName').textContent = userData.name||'-';
  $('#profEmail').textContent = userData.email||'-';
  $('#profCar').textContent = userData.car ? `${userData.car} - ${userData.plate||''}` : '';
  online = !!userData.online;
  updateAvail();
  if(online) startWatching();
  showScreen('homeScreen');
  subscribeRides();
}

function updateAvail(){
  $('#availSwitch').classList.toggle('on', online);
  $('#availIcon').style.color = online?'var(--success)':'var(--gray)';
  $('#statusLabel').textContent = online?'متصل':'غير متصل';
}

$('#availSwitch').addEventListener('click', async ()=>{
  if(online){ await goOffline(); } else { await goOnline(); }
});

async function goOnline(){
  if(!navigator.geolocation) return toast('GPS غير مدعوم','error');
  try{
    const pos = await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,timeout:10000}));
    currentLoc = {lat:pos.coords.latitude, lng:pos.coords.longitude};
    await updateDoc(doc(db,'users',currentUser.uid),{online:true, location:currentLoc, lastSeen:serverTimestamp()});
    online=true; updateAvail(); startWatching(); toast('أنت متصل الآن','success');
  }catch(e){toast('تعذّر تحديد موقعك','error')}
}
async function goOffline(){
  await updateDoc(doc(db,'users',currentUser.uid),{online:false, lastSeen:serverTimestamp()});
  online=false; updateAvail(); stopWatching();
}
function startWatching(){
  if(locWatch) return;
  locWatch = navigator.geolocation.watchPosition(async pos=>{
    currentLoc={lat:pos.coords.latitude,lng:pos.coords.longitude};
    try{await updateDoc(doc(db,'users',currentUser.uid),{location:currentLoc,lastSeen:serverTimestamp()})}catch(_){}
    if(activeRideId){ try{await updateDoc(doc(db,'rides',activeRideId),{captainLocation:currentLoc})}catch(_){} }
  },()=>{},{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
}
function stopWatching(){ if(locWatch){ navigator.geolocation.clearWatch(locWatch); locWatch=null; } }

$$('#tabsPills .pill').forEach(p=>p.addEventListener('click',()=>{
  $$('#tabsPills .pill').forEach(x=>x.classList.remove('active'));
  p.classList.add('active');
  currentFilter=p.dataset.filter;
  renderRides();
}));

function subscribeRides(){
  if(ridesUnsub) ridesUnsub();
  let lastSearchingIds = new Set();
  let firstSnap = true;
  ridesUnsub = onSnapshot(collection(db,'rides'),(snap)=>{
    allRides = snap.docs.map(d=>({id:d.id,...d.data()}));
    const mine = allRides.filter(r=>r.captainId===currentUser.uid);
    $('#sTotal').textContent = mine.length;
    $('#sDone').textContent = mine.filter(r=>r.status==='completed').length;
    $('#sActive').textContent = mine.filter(r=>['accepted','arrived','in_progress'].includes(r.status)).length;
    const active = mine.find(r=>['accepted','arrived','in_progress'].includes(r.status));
    activeRideId = active?.id || null;

    // إشعار صوتي عند وصول طلب رحلة جديد قريب
    const searching = allRides.filter(r=>r.status==='searching')
      .map(r=>({...r,_capKm: currentLoc?km(currentLoc,r.pickup):null}))
      .filter(r=>r._capKm===null||r._capKm<=SEARCH_RADIUS_KM);
    const currentIds = new Set(searching.map(r=>r.id));
    const newOnes = searching.filter(r=>!lastSearchingIds.has(r.id));
    if(!firstSnap && newOnes.length && online){
      playSound('ride');
      const r = newOnes[0];
      showNotification('طلب رحلة جديد 🚖', `عميل: ${r.customerName||''} - السعر ${(+r.price||0).toLocaleString()} ل.س`, 'new-ride');
    }
    lastSearchingIds = currentIds;
    firstSnap = false;
    renderRides();
  });
}

function statusLabel(s){return {searching:'بحث',accepted:'مقبول - في الطريق للعميل',arrived:'وصل للعميل',in_progress:'الرحلة جارية',completed:'مكتمل',cancelled:'ملغي'}[s]||s}

function renderRides(){
  let list=[];
  if(currentFilter==='incoming'){
    if(!online){ $('#ridesList').innerHTML=`<div class="empty"><i class="fas fa-toggle-off"></i><h4>أنت غير متصل</h4><p>فعّل الاتصال لاستقبال الطلبات</p></div>`; return; }
    list = allRides.filter(r=>r.status==='searching')
      .map(r=>({...r,_capKm: currentLoc?km(currentLoc,r.pickup):null}))
      .filter(r=>r._capKm===null||r._capKm<=SEARCH_RADIUS_KM)
      .sort((a,b)=>(a._capKm||999)-(b._capKm||999));
  } else if(currentFilter==='active'){
    list = allRides.filter(r=>r.captainId===currentUser.uid && ['accepted','arrived','in_progress'].includes(r.status));
  } else {
    list = allRides.filter(r=>r.captainId===currentUser.uid && ['completed','cancelled'].includes(r.status));
  }
  if(!list.length){ $('#ridesList').innerHTML=`<div class="empty"><i class="fas fa-inbox"></i><h4>لا توجد رحلات</h4></div>`; return; }
  $('#ridesList').innerHTML = list.map(r=>`
    <div class="ride-card" data-id="${r.id}">
      <div class="ride-head"><h5><i class="fas fa-user" style="color:var(--primary)"></i> ${esc(r.customerName||'عميل')}</h5><span class="badge ${r.status}">${statusLabel(r.status)}</span></div>
      <div class="row"><i class="fas fa-route" style="width:14px"></i> ${(+r.routeKm||0).toFixed(1)} كم</div>
      ${r._capKm!=null?`<div class="row"><i class="fas fa-location-arrow" style="width:14px"></i> المسافة إليك: ${r._capKm.toFixed(2)} كم</div>`:''}
      <div class="total"><span>السعر</span><span class="val">${(+r.price||0).toLocaleString()} ل.س</span></div>
    </div>`).join('');
  $$('#ridesList .ride-card').forEach(c=>c.addEventListener('click',()=>openRide(c.dataset.id)));
}

let rideUnsub=null;
function openRide(id){
  if(rideUnsub) rideUnsub();
  rideUnsub = onSnapshot(doc(db,'rides',id),(snap)=>{
    if(!snap.exists()) return;
    currentRide = {id:snap.id,...snap.data()};
    renderRideDetail();
  });
  showScreen('rideScreen');
}

function renderRideDetail(){
  const r=currentRide;
  const pickupNav = `https://www.google.com/maps/dir/?api=1&destination=${r.pickup.lat},${r.pickup.lng}&travelmode=driving&dir_action=navigate`;
  const destNav = `https://www.google.com/maps/dir/?api=1&destination=${r.destination.lat},${r.destination.lng}&travelmode=driving&dir_action=navigate`;
  let actions='';
  if(r.status==='searching') actions = `<button class="btn btn-success" id="acceptBtn"><i class="fas fa-check"></i> قبول الرحلة</button>`;
  else if(r.status==='accepted' && r.captainId===currentUser.uid) actions = `<button class="btn btn-success" id="markArrived"><i class="fas fa-flag-checkered"></i> وصلت للعميل</button>`;
  else if(r.status==='arrived' && r.captainId===currentUser.uid) actions = `<button class="btn btn-primary" id="startRide"><i class="fas fa-play"></i> بدء الرحلة</button>`;
  else if(r.status==='in_progress' && r.captainId===currentUser.uid) actions = `<button class="btn btn-success" id="completeRide"><i class="fas fa-check-double"></i> إنهاء الرحلة</button>`;
  const cancelBtn = (r.captainId===currentUser.uid && ['accepted','arrived','in_progress'].includes(r.status)) ? `<button class="btn btn-danger" id="cancelActive" style="margin-top:8px"><i class="fas fa-xmark"></i> إلغاء الرحلة</button>`:'';

  $('#rideBody').innerHTML = `
    <div class="status-bar"><span class="dot"></span> ${statusLabel(r.status)}</div>
    <div class="total-card">
      <h4><i class="fas fa-user"></i> العميل</h4>
      <div class="total-row"><span>الاسم</span><strong>${esc(r.customerName||'-')}</strong></div>
      <div class="total-row"><span>الهاتف</span><strong><a href="tel:${esc(r.customerPhone||'')}" style="color:var(--primary)">${esc(r.customerPhone||'-')}</a></strong></div>
    </div>
    <div class="total-card">
      <div class="total-row"><span>مسافة الرحلة</span><strong>${(+r.routeKm||0).toFixed(2)} كم</strong></div>
      <div class="total-row big"><span>السعر</span><strong style="color:var(--primary)">${(+r.price||0).toLocaleString()} ل.س</strong></div>
    </div>
    <div class="actions-grid">
      <a href="${pickupNav}" target="_blank" class="btn btn-success"><i class="fas fa-route"></i> توجّه للعميل</a>
      <a href="${destNav}" target="_blank" class="btn btn-success"><i class="fas fa-route"></i> توجّه للوجهة</a>
    </div>
    <div style="margin-top:10px">${actions}</div>
    ${cancelBtn}
  `;
  if($('#acceptBtn')) $('#acceptBtn').onclick = ()=>acceptRide(r.id);
  if($('#markArrived')) $('#markArrived').onclick = ()=>updateDoc(doc(db,'rides',r.id),{status:'arrived',arrivedAt:serverTimestamp()});
  if($('#startRide')) $('#startRide').onclick = ()=>updateDoc(doc(db,'rides',r.id),{status:'in_progress',startedAt:serverTimestamp()});
  if($('#completeRide')) $('#completeRide').onclick = async ()=>{ await updateDoc(doc(db,'rides',r.id),{status:'completed',completedAt:serverTimestamp()}); toast('اكتملت الرحلة','success'); showScreen('homeScreen'); };
  if($('#cancelActive')) $('#cancelActive').onclick = async ()=>{ if(!confirm('تأكيد الإلغاء؟')) return; await updateDoc(doc(db,'rides',r.id),{status:'cancelled',cancelledAt:serverTimestamp()}); showScreen('homeScreen'); };
}

async function acceptRide(rideId){
  if(!currentLoc) return toast('فعّل GPS أولاً','error');
  try{
    await runTransaction(db, async tx=>{
      const ref = doc(db,'rides',rideId);
      const snap = await tx.get(ref);
      if(!snap.exists()) throw new Error('الطلب غير موجود');
      const r = snap.data();
      if(r.status!=='searching' || r.captainId) throw new Error('استلمها كابتن آخر');
      tx.update(ref,{
        status:'accepted', captainId:currentUser.uid,
        captainName:userData.name||'', captainPhone:userData.phone||'',
        captainCar:userData.car||'', captainPlate:userData.plate||'',
        captainLocation:currentLoc, captainPickupKm:km(currentLoc,r.pickup),
        acceptedAt:serverTimestamp()
      });
    });
    toast('تم قبول الرحلة','success');
    playSound('accept');
    showNotification('تم قبول الرحلة ✅', 'توجّه الآن لاستلام العميل', 'ride-accepted-'+rideId);
  }catch(e){toast(e.message||'فشل القبول','error')}
}

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