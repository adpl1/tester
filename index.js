import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

let currentUser=null, userData=null, cart=[], currentStore=null, storeProducts=[], allStores=[], allBanners=[], homeProducts=[], currentOrder=null, chatUnsub=null, ordersUnsub=null, orderDetailUnsub=null, pickedLocation=null, customPickedLocation=null, mapInstance=null, customMapInstance=null, activeMarker=null, customMarker=null, bannerTimer=null, bannerIndex=0, deliveryEstimate={fee:0,km:0,courier:null}, homeProductsPage=1, homeProductsPageSize=8, storeProductsPage=1, storeProductsPageSize=8, ordersPage=1, ordersPageSize=6, courierWatchId=null;

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
window.$ = $;
window.$$ = $$;

window.toast = (msg, type='') => {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show '+type;
  setTimeout(()=>t.classList.remove('show'), 2500);
};

window.showScreen = (id) => {
  $$('.screen').forEach(s=>{
    s.classList.remove('active');
    s.style.display = 'none';
    s.style.zIndex = '0';
  });
  const target = $('#'+id);
  if (target) {
    target.classList.add('active');
    target.style.display = 'block';
    target.style.zIndex = '10';
    if(id === 'checkoutScreen'){
      pickedLocation = null;
      setTimeout(()=>{
        renderCart();
        requestAnimationFrame(()=>requestAnimationFrame(()=>initCheckoutMap()));
      }, 350);
    }
  }
  $$('.nav-item').forEach(n=>{
    n.classList.toggle('active', n.dataset.nav===id);
  });
  if($('#bottomNav')) $('#bottomNav').style.display = id==='chatScreen' ? 'none' : (currentUser ? 'flex' : 'none');
  window.scrollTo(0,0);
  document.querySelectorAll('.screen').forEach(s=>s.scrollTop=0);
};

$$('.nav-item').forEach(n=>n.addEventListener('click',()=>showScreen(n.dataset.nav)));
// Auth forms removed - handled in login.html
function mapErr(e){
  const c=e.code||'';
  if(c.includes('email-already'))return 'البريد مسجل مسبقاً';
  if(c.includes('invalid-email'))return 'بريد غير صالح';
  if(c.includes('weak-password'))return 'كلمة المرور ضعيفة';
  if(c.includes('wrong-password')||c.includes('invalid-credential')||c.includes('user-not-found'))return 'بيانات الدخول غير صحيحة';
  if(c.includes('too-many'))return 'محاولات كثيرة، حاول لاحقاً';
  return e.message||'حدث خطأ';
}

window.logout = async () => { try{await signOut(auth)}catch(e){} };

onAuthStateChanged(auth, async (user)=>{
  if(user){
    currentUser=user;
    const snap=await getDoc(doc(db,'users',user.uid));
    if(snap.exists()) userData=snap.data();
    else { userData={uid:user.uid,name:user.email.split('@')[0],email:user.email,role:'user'}; await setDoc(doc(db,'users',user.uid),userData); }
    if(userData.role!=='user'){ toast('هذا الحساب ليس حساب مستخدم','error'); await signOut(auth); return; }
    loadSettings();
    initApp();
  } else {
    currentUser=null; userData=null;
    // توجيه لصفحة تسجيل الدخول
    window.location.replace('login.html');
  }
});

async function loadSettings(){
  try{
    const s = await getDoc(doc(db,'settings','main'));
    if(s.exists() && s.data().loginLogo){
      $('#authLogo').innerHTML = `<img src="${s.data().loginLogo}" alt="logo">`;
    }
  }catch(e){}
}

function initApp(){
  $('#helloName').textContent = userData.name||'صديقنا';
  $('#homeAvatar').textContent = (userData.name||'?').charAt(0);
  $('#profAvatar').textContent = (userData.name||'?').charAt(0);
  $('#profName').textContent = userData.name||'-';
  $('#profEmail').textContent = userData.email||'-';
  $('#bottomNav').style.display='flex';
  $('#homeScreen').style.display='block';
  showScreen('homeScreen');
  loadHome();
  subscribeOrders();
}

async function loadHome(){
  // Banners
  try{
    const bs = await getDocs(collection(db,'banners'));
    allBanners = bs.docs.map(d=>({id:d.id,...d.data()}));
    renderBanners();
  }catch(e){}

  // Stores
  const storesUnsub = onSnapshot(collection(db,'stores'), (snap)=>{
    allStores = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderStores();
    renderGlobalCats();
  });

  // Home products
  try{
    const ps = await getDocs(collection(db,'products'));
    homeProducts = ps.docs.map(d=>({id:d.id,...d.data()}));
    homeProductsPage = 1;
    renderHomeProducts();
  }catch(e){}
}


function renderBanners(){
  if(!allBanners.length){ $('#bannersSection').style.display='none'; clearInterval(bannerTimer); bannerTimer=null; return; }
  $('#bannersSection').style.display='block';
  $('#bannersList').innerHTML = allBanners.map(b=>`<div class="banner">${b.imageUrl?`<img src="${b.imageUrl}">`:''}<div class="overlay">${b.title||''}</div></div>`).join('');
  startBannerAutoplay();
}

function startBannerAutoplay(){
  clearInterval(bannerTimer);
  bannerIndex = 0;
  const list = $('#bannersList');
  const items = list ? list.querySelectorAll('.banner') : [];
  if(items.length < 2) return;
  bannerTimer = setInterval(()=>{
    const currentList = $('#bannersList');
    if(!currentList) return;
    const currentItems = currentList.querySelectorAll('.banner');
    if(currentItems.length < 2) return;
    bannerIndex = (bannerIndex + 1) % currentItems.length;
    // استخدام scrollLeft بدلاً من scrollIntoView لمنع تمرير الصفحة
    const itemWidth = currentItems[0].offsetWidth + 12; // عرض البانر + الفجوة
    currentList.scrollTo({left: bannerIndex * itemWidth, behavior:'smooth'});
  }, 5000);
}

function renderGlobalCats(){
  const all = new Set();
  allStores.forEach(s=>(s.categories||[]).forEach(c=>all.add(c)));
  const cats = ['all', ...Array.from(all)];
  $('#catsList').innerHTML = cats.map(c=>`<div class="cat-pill ${c==='all'?'active':''}" data-cat="${escapeAttr(c)}">${c==='all'?'الكل':c}</div>`).join('');
  $$('#catsList .cat-pill').forEach(p=>p.addEventListener('click',()=>{
    $$('#catsList .cat-pill').forEach(x=>x.classList.remove('active'));
    p.classList.add('active');
    renderStores(p.dataset.cat);
  }));
}

function renderStores(filter='all'){
  let list = allStores;
  const q = ($('#searchInput').value||'').trim().toLowerCase();
  if(filter!=='all') list = list.filter(s=>(s.categories||[]).includes(filter));
  if(q) list = list.filter(s=>(s.name||'').toLowerCase().includes(q));
  if(!list.length){ $('#storesList').innerHTML = `<div style="grid-column:1/-1"><div class="empty"><i class="fas fa-store-slash"></i><h4>لا توجد متاجر</h4></div></div>`; return; }
  $('#storesList').innerHTML = list.map(s=>`
    <div class="store-card" data-id="${s.id}">
      <div class="img">${s.logo?`<img src="${s.logo}">`:'<i class="fas fa-store"></i>'}</div>
      <div class="info">
        <h5>${esc(s.name||'متجر')}</h5>
        <p><i class="fas fa-location-dot"></i> ${esc(s.description||'متجر مميز')}</p>
      </div>
    </div>`).join('');
  $$('#storesList .store-card').forEach(c=>c.addEventListener('click',()=>openStore(c.dataset.id)));
}


function renderHomeProducts(){
  const section = $('#homeProductsSection');
  const listEl = $('#homeProductsList');
  const moreBtn = $('#homeProductsMore');
  if(!homeProducts.length){ if(section) section.style.display='none'; return; }
  if(section) section.style.display='block';
  const q = ($('#searchInput').value||'').trim().toLowerCase();
  let list = homeProducts.filter(p=>!q || (p.name||'').toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q));
  const visible = list.slice(0, homeProductsPage * homeProductsPageSize);
  listEl.innerHTML = visible.map(p=>`<div class="product" data-id="${p.id}"><div class="img">${p.image?`<img src="${p.image}">`:'<i class="fas fa-box"></i>'}</div><div class="info"><div><h5>${esc(p.name||'')}</h5><p>${esc(p.description||'')}</p><p style="font-size:11px;color:var(--gray)">${esc(p.storeName||'')} ${p.category?`• ${esc(p.category)}`:''}</p></div><div style="display:flex;justify-content:space-between;align-items:center"><span class="price">${currency(p.price||0)}</span><button class="add" data-id="${p.id}"><i class="fas fa-plus"></i></button></div></div></div>`).join('');
  if(moreBtn){ moreBtn.style.display = list.length > visible.length ? 'block' : 'none'; }
  $$('#homeProductsList .add').forEach(b=>b.addEventListener('click',(e)=>{ e.stopPropagation(); const p=homeProducts.find(x=>x.id===b.dataset.id); if(p) addToCart({...p, storeId:p.storeId||p.storeID||'', storeName:p.storeName||''}); }));
  // لا يوجد click على بطاقة المنتج - فقط زر + يضيف للسلة
}
if(document.getElementById('homeProductsMore')) document.getElementById('homeProductsMore').addEventListener('click',()=>{ homeProductsPage++; renderHomeProducts(); });

$('#searchInput').addEventListener('input', ()=>{ const a=document.querySelector('#catsList .cat-pill.active'); renderStores(a?a.dataset.cat:'all'); renderHomeProducts(); });

async function openStore(id){
  const store = allStores.find(s=>s.id===id); if(!store) return;
  currentStore = store;
  storeProductsPage = 1;
  $('#storeName').textContent = store.name;
  $('#storeDesc').textContent = store.description||'متجر مميز';
  $('#storeBanner').innerHTML = `<div class="back" onclick="showScreen('homeScreen')"><i class="fas fa-chevron-right"></i></div>${store.banner?`<img src="${store.banner}">`:''}`;
  const cats = ['all', ...(store.categories||[])];
  $('#storeCats').innerHTML = cats.map(c=>`<div class="cat-pill ${c==='all'?'active':''}" data-cat="${escapeAttr(c)}">${c==='all'?'الكل':c}</div>`).join('');
  const snap = await getDocs(query(collection(db,'products'), where('storeId','==',id)));
  storeProducts = snap.docs.map(d=>({id:d.id,...d.data()}));
  renderProducts('all');
  $$('#storeCats .cat-pill').forEach(p=>p.addEventListener('click',()=>{
    $$('#storeCats .cat-pill').forEach(x=>x.classList.remove('active'));
    p.classList.add('active');
    renderProducts(p.dataset.cat);
  }));
  showScreen('storeScreen');
}

function renderProducts(cat){
  let list = storeProducts;
  if(cat!=='all') list = list.filter(p=>p.category===cat);
  const listEl = $('#productsList');
  if(!list.length){ listEl.innerHTML = `<div class="empty"><i class="fas fa-box-open"></i><h4>لا توجد منتجات</h4></div>`; return; }
  const visible = list.slice(0, storeProductsPage * storeProductsPageSize);
  listEl.innerHTML = visible.map(p=>`
    <div class="product" data-id="${p.id}">
      <div class="img">${p.image?`<img src="${p.image}">`:'<i class="fas fa-box"></i>'}</div>
      <div class="info">
        <div>
          <h5>${esc(p.name||'')}</h5>
          <p>${esc(p.description||'')}</p>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="price">${currency(p.price||0)}</span>
          <button class="add" data-id="${p.id}"><i class="fas fa-plus"></i></button>
        </div>
      </div>
    </div>`).join('');
  let more = document.getElementById('storeProductsMore');
  if(!more){
    more = document.createElement('button');
    more.id = 'storeProductsMore';
    more.className = 'btn btn-ghost';
    more.style.marginTop = '10px';
    listEl.insertAdjacentElement('afterend', more);
  }
  more.textContent = 'تحميل المزيد';
  more.style.display = list.length > visible.length ? 'block' : 'none';
  more.onclick = ()=>{ storeProductsPage++; renderProducts(cat); };
  $$('#productsList .add').forEach(b=>b.addEventListener('click',(e)=>{
    e.stopPropagation();
    const p = storeProducts.find(x=>x.id===b.dataset.id);
    if(p) addToCart(p);
  }));
  // لا يوجد click على بطاقة المنتج - فقط زر + يضيف للسلة
}


function addToCart(p){
  const pStoreId = p.storeId || (currentStore ? currentStore.id : '');
  const pStoreName = p.storeName || (currentStore ? currentStore.name : '');
  if(cart.length && cart[0].storeId && pStoreId && cart[0].storeId !== pStoreId){
    if(!confirm('سلتك تحتوي على منتجات من متجر آخر. هل تريد إفراغها؟')) return;
    cart = [];
  }
  const existing = cart.find(x=>x.id===p.id);
  if(existing) existing.qty++;
  else cart.push({id:p.id,name:p.name,price:+p.price||0,image:p.image||'',qty:1,storeId:pStoreId,storeName:pStoreName});
  toast('تمت الإضافة للسلة ✓','success');
  updateCartFab();
  saveCart();
  // لا ننتقل للسلة تلقائياً
}

function updateCartFab(){
  const fab = $('#cartFab');
  const count = $('#cartCount');
  const navBadge = $('#cartBadge');
  const navItem = navBadge ? navBadge.closest('.nav-item') : null;
  if(!fab || !count) return;
  const total = cart.reduce((s,i)=>s+i.qty,0);

  if(total){
    fab.classList.add('show');
    count.textContent = total;
    if(navBadge){
      navBadge.textContent = total > 99 ? '99+' : String(total);
      navBadge.style.display = 'flex';
      if(navItem) navItem.classList.add('cart-has-badge');
    }
  } else {
    fab.classList.remove('show');
    if(navBadge){
      navBadge.textContent = '';
      navBadge.style.display = 'none';
      if(navItem) navItem.classList.remove('cart-has-badge');
    }
  }
}

function saveCart(){ try{localStorage.setItem('_cart',JSON.stringify(cart))}catch(e){} }
function loadCart(){ try{const c=localStorage.getItem('_cart'); if(c) cart=JSON.parse(c)}catch(e){} updateCartFab(); }
loadCart();

// Cart screen render
function renderCart(){
  if(!cart.length){ $('#cartList').innerHTML=''; $('#cartEmpty').style.display='block'; $('#cartSummary').style.display='none'; return; }
  $('#cartEmpty').style.display='none'; $('#cartSummary').style.display='block';
  $('#cartList').innerHTML = cart.map((it,i)=>`
    <div class="cart-item">
      <div class="img">${it.image?`<img src="${it.image}">`:'<i class="fas fa-utensils"></i>'}</div>
      <div class="info">
        <h5>${esc(it.name)}</h5>
        <div class="price">${it.price} ل.س</div>
      </div>
      <div class="qty">
        <button data-i="${i}" data-act="-"><i class="fas fa-minus"></i></button>
        <span>${it.qty}</span>
        <button data-i="${i}" data-act="+"><i class="fas fa-plus"></i></button>
      </div>
    </div>`).join('');
  const sub = cart.reduce((s,i)=>s+i.price*i.qty,0);
  const fee = deliveryEstimate.fee || 0;
  $('#subTotal').textContent = currency(sub);
  const feeEl = $('#cartDeliveryFee'); if(feeEl) feeEl.textContent = currency(fee);
  $('#grandTotal').textContent = currency(sub + fee);
  $('#checkItems').textContent = cart.reduce((s,i)=>s+i.qty,0);
  const checkFeeEl = $('#checkDeliveryFee'); if(checkFeeEl) checkFeeEl.textContent = currency(fee);
  $('#checkTotal').textContent = currency(sub + fee);
  $$('#cartList .qty button').forEach(b=>b.addEventListener('click',()=>{
    const i=+b.dataset.i, act=b.dataset.act;
    if(act==='+') cart[i].qty++;
    else { cart[i].qty--; if(cart[i].qty<=0) cart.splice(i,1); }
    saveCart(); updateCartFab(); renderCart();
  }));
}

// Map for checkout
async function initCheckoutMap(){
  const mapEl = document.getElementById('map');
  if(!mapEl) return;
  if(mapInstance){ mapInstance.remove(); mapInstance=null; }
  mapInstance = L.map('map').setView([24.7136,46.6753],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'}).addTo(mapInstance);
  mapInstance.on('click', async (e)=>{
    pickedLocation = {lat:e.latlng.lat,lng:e.latlng.lng};
    if(activeMarker) mapInstance.removeLayer(activeMarker);
    activeMarker = L.marker(e.latlng).addTo(mapInstance);
    await refreshDeliveryEstimate();
  });
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition((pos)=>{
      const loc=[pos.coords.latitude,pos.coords.longitude];
      mapInstance.setView(loc,16);
      pickedLocation = {lat:pos.coords.latitude,lng:pos.coords.longitude};
      if(activeMarker) mapInstance.removeLayer(activeMarker);
      activeMarker = L.marker(loc).addTo(mapInstance);
      refreshDeliveryEstimate();
    },()=>{}, {enableHighAccuracy:true,timeout:8000,maximumAge:0});
  }
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(mapInstance) mapInstance.invalidateSize();
  }));
}

async function initCustomMap(){
  if(customMapInstance){ customMapInstance.remove(); customMapInstance=null; }
  customMapInstance = L.map('customMap').setView([24.7136,46.6753],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'}).addTo(customMapInstance);
  customMapInstance.on('click', async (e)=>{
    customPickedLocation = {lat:e.latlng.lat,lng:e.latlng.lng};
    if(customMarker) customMapInstance.removeLayer(customMarker);
    customMarker = L.marker(e.latlng).addTo(customMapInstance);
    const est = await estimateDelivery(customPickedLocation);
    const feeBox = document.getElementById('customDeliveryFeeBox');
    if(feeBox) feeBox.textContent = est.courier
      ? `رسوم التوصيل: ${currency(est.fee)} (أقرب مندوب ${est.km.toFixed(1)} كم)`
      : `رسوم التوصيل المقدرة: ${currency(est.fee)}`;
  });
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition((pos)=>{
      const loc=[pos.coords.latitude,pos.coords.longitude];
      customMapInstance.setView(loc,16);
      customPickedLocation = {lat:pos.coords.latitude,lng:pos.coords.longitude};
      if(customMarker) customMapInstance.removeLayer(customMarker);
      customMarker = L.marker(loc).addTo(customMapInstance);
    },()=>{}, {enableHighAccuracy:true,timeout:8000,maximumAge:0});
  }
  setTimeout(()=>customMapInstance.invalidateSize(),200);
}

$('#placeOrderBtn').addEventListener('click', async ()=>{
  if(!cart.length) return toast('السلة فارغة','error');
  if(!pickedLocation) return toast('حدد الموقع على الخريطة','error');
  $('#placeOrderBtn').disabled=true;
  const sub = cart.reduce((s,i)=>s+i.price*i.qty,0);
  try{
    await addDoc(collection(db,'orders'),{
      userId:currentUser.uid, userName:userData.name, userPhone:userData.phone||'',
      storeId:cart[0].storeId, storeName:cart[0].storeName,
      items:cart.map(i=>({id:i.id,name:i.name,price:i.price,qty:i.qty})),
      subtotal:sub, deliveryFee:deliveryEstimate.fee||0, total:sub+(deliveryEstimate.fee||0),
      location:pickedLocation, address:$('#addressNote').value.trim(), note:$('#deliveryNote').value.trim(),
      status:'pending', type:'store', deliveryId:null, deliveryName:null,
      createdAt:serverTimestamp()
    });
    const _storeName = cart[0]?.storeName || 'المتجر';
    cart=[]; saveCart(); updateCartFab();
    toast('تم إرسال الطلب بنجاح','success');
    playSound('order');
    showNotification('تم إرسال طلبك ✅', 'بانتظار قبول المندوب لطلبك من '+_storeName, 'order-sent');
    showScreen('ordersScreen');
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  $('#placeOrderBtn').disabled=false;
});

window.openCustomOrder = ()=>{
  showScreen('customScreen');
  $('#customStore').value=''; $('#customRequest').value=''; $('#customAddress').value='';
  customPickedLocation=null;
  const feeBox = document.getElementById('customDeliveryFeeBox');
  if(feeBox) feeBox.textContent = 'سيتم احتساب رسوم التوصيل بعد تحديد الموقع';
  setTimeout(initCustomMap,150);
};

$('#submitCustomBtn').addEventListener('click', async ()=>{
  const req=$('#customRequest').value.trim();
  if(!req) return toast('اكتب تفاصيل الطلب','error');
  if(!customPickedLocation) return toast('حدد الموقع','error');
  $('#submitCustomBtn').disabled=true;
  try{
    const customEstimate = await estimateDelivery(customPickedLocation);
    await addDoc(collection(db,'orders'),{
      userId:currentUser.uid, userName:userData.name, userPhone:userData.phone||'',
      storeId:null, storeName:$('#customStore').value.trim()||'طلب مخصص',
      customRequest:req,
      items:[], subtotal:0, deliveryFee:customEstimate.fee||0, total:customEstimate.fee||0,
      location:customPickedLocation, address:$('#customAddress').value.trim(), note:'',
      status:'pending', type:'custom', deliveryId:null, deliveryName:null,
      createdAt:serverTimestamp()
    });
    toast('تم إرسال الطلب','success');
    playSound('order');
    showNotification('تم إرسال طلبك المخصص ✅', 'بانتظار قبول مندوب لتوصيل طلبك', 'order-sent');
    showScreen('ordersScreen');
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  $('#submitCustomBtn').disabled=false;
});

// === نظام الإشعارات (صوت + Notification API) ===
const VAPID_PUBLIC_KEY = 'BMUk6gPnNEIHRtEF1bmaud3SBc8wff-1ZV2KAmk9F-mWX22f5j2hK9Mw8ljp02aNdGHKkMyz5XR6qa_4bDVT_go';

// طلب إذن الإشعارات (يستدعى بعد أول تفاعل)
function requestNotifPermission(){
  try{
    if('Notification' in window && Notification.permission==='default'){
      Notification.requestPermission().catch(()=>{});
    }
  }catch(e){}
}
document.addEventListener('click', requestNotifPermission, { once:true });

// عرض إشعار نظام (يعمل حتى لو التطبيق بالخلفية عبر Service Worker)
function showNotification(title, body, tag){
  try{
    if(!('Notification' in window) || Notification.permission!=='granted') return;
    const opts = { body: body||'', icon: './favicon.png', badge: './favicon.png', tag: tag||'adpl', vibrate:[200,100,200], renotify:true };
    if(navigator.serviceWorker && navigator.serviceWorker.ready){
      navigator.serviceWorker.ready.then(reg => reg.showNotification(title, opts)).catch(()=>{ try{ new Notification(title, opts); }catch(_){} });
    } else {
      new Notification(title, opts);
    }
  }catch(e){}
}

function playSound(type){
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    if(type==='order'){
      // صوت طلب جديد - نغمة تصاعدية
      o.type='sine'; o.frequency.setValueAtTime(440,ctx.currentTime); o.frequency.setValueAtTime(660,ctx.currentTime+0.15); o.frequency.setValueAtTime(880,ctx.currentTime+0.3);
      g.gain.setValueAtTime(0.18,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.6);
      o.start(ctx.currentTime); o.stop(ctx.currentTime+0.6);
    } else if(type==='chat'){
      // صوت رسالة - نغمة قصيرة
      o.type='sine'; o.frequency.setValueAtTime(800,ctx.currentTime); o.frequency.setValueAtTime(1000,ctx.currentTime+0.1);
      g.gain.setValueAtTime(0.12,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.3);
      o.start(ctx.currentTime); o.stop(ctx.currentTime+0.3);
    }
    setTimeout(()=>ctx.close().catch(()=>{}), 1000);
  }catch(e){}
}

// Orders subscription
function subscribeOrders(){
  if(ordersUnsub) ordersUnsub();
  const q = query(collection(db,'orders'), where('userId','==',currentUser.uid));
  let prevStatuses = {};
  let firstLoad = true;
  ordersUnsub = onSnapshot(q, (snap)=>{
    let list = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    // حد 5 طلبات فقط، حذف القديمة تلقائياً
    if(list.length > 5){
      const toDelete = list.slice(5);
      list = list.slice(0,5);
      // حذف الطلبات القديمة المكتملة أو الملغاة فقط
      toDelete.forEach(async o=>{
        if(['delivered','cancelled'].includes(o.status)){
          try{ await updateDoc(doc(db,'orders',o.id),{_hidden:true}); }catch(e){}
        }
      });
    }
    // صوت + إشعار عند تغيير حالة الطلب (ليس عند أول تحميل)
    if(!firstLoad){
      list.forEach(o=>{
        if(prevStatuses[o.id] && prevStatuses[o.id] !== o.status){
          playSound('order');
          const shortId = o.id.slice(-4);
          const storeN = o.storeName || 'طلبك';
          let title='تحديث حالة الطلب', body='';
          if(o.status==='accepted'){ title='تم قبول طلبك 🎉'; body=`المندوب ${o.deliveryName||''} قبل طلبك من ${storeN}`; }
          else if(o.status==='on_way'){ title='طلبك في الطريق 🛵'; body=`المندوب في طريقه إليك بطلب ${storeN}`; }
          else if(o.status==='delivered'){ title='تم تسليم طلبك ✅'; body=`نتمنى أن ينال إعجابك. شكراً لاستخدامك ادبل`; }
          else if(o.status==='cancelled'){ title='تم إلغاء الطلب ❌'; body=`تم إلغاء طلب ${storeN} رقم ${shortId}`; }
          else { body = `الطلب ${shortId}: ${statusLabel(o.status)}`; }
          showNotification(title, body, 'order-'+o.id);
          toast(`${title}`,'success');
        }
      });
    }
    list.forEach(o=>{ prevStatuses[o.id]=o.status; });
    firstLoad = false;
    renderOrders(list);
    const hasPending = list.some(o=>!['delivered','cancelled'].includes(o.status));
    const badge = $('#ordersBadge'); if(badge) badge.style.display = hasPending ? 'block' : 'none';
  });
}

function statusLabel(s){
  return {pending:'قيد انتظار قبول المندوب',accepted:'تم القبول',on_way:'في الطريق',delivered:'تم التسليم',cancelled:'ملغي'}[s]||s;
}
function statusBadgeHtml(s){
  return s==='pending' ? '<i class="fas fa-spinner fa-spin" style="margin-left:6px"></i> قيد انتظار قبول المندوب' : statusLabel(s);
}

function renderOrders(list){
  if(!list.length){ $('#ordersList').innerHTML = `<div class="empty"><i class="fas fa-receipt"></i><h4>لا توجد طلبات</h4><p>ابدأ بتصفح المتاجر</p></div>`; return; }
  $('#ordersList').innerHTML = list.map(o=>`
    <div class="order-card" data-id="${o.id}">
      <div class="order-head"><h5><i class="fas fa-store" style="color:var(--primary);margin-left:4px"></i> ${esc(o.storeName||'طلب')}</h5><span class="badge ${o.status}">${statusBadgeHtml(o.status)}</span></div>
      <p><i class="fas fa-hashtag"></i> رقم الطلب: ${o.id.slice(-6)}</p>
      <p><i class="fas fa-coins"></i> الإجمالي: ${currency(o.total||0)}</p>
      ${o.type==='custom'?`<p><i class="fas fa-wand-magic-sparkles"></i> طلب مخصص</p>`:''}
      ${['pending','accepted'].includes(o.status)?`<button class="btn btn-danger cancel-order-btn" data-order-id="${o.id}" style="margin-top:10px;padding:8px 14px;font-size:13px;width:auto"><i class="fas fa-times-circle"></i> إلغاء الطلب</button>`:''}
    </div>`).join('');
  $$('#ordersList .order-card').forEach(c=>c.addEventListener('click',(e)=>{
    if(e.target.closest('.cancel-order-btn')) return;
    openOrder(c.dataset.id);
  }));
  $$('#ordersList .cancel-order-btn').forEach(btn=>btn.addEventListener('click', async (e)=>{
    e.stopPropagation();
    if(!confirm('هل أنت متأكد من إلغاء الطلب؟')) return;
    btn.disabled = true;
    try{
      await updateDoc(doc(db,'orders',btn.dataset.orderId),{status:'cancelled'});
      toast('تم إلغاء الطلب','success');
    }catch(err){ toast('خطأ: '+err.message,'error'); btn.disabled=false; }
  }));
}

async function openOrder(id){
  if(orderDetailUnsub) orderDetailUnsub();
  orderDetailUnsub = onSnapshot(doc(db,'orders',id),(snap)=>{
    if(!snap.exists()) return;
    currentOrder = {id:snap.id,...snap.data()};
    renderOrderDetail();
  });
  showScreen('orderDetailScreen');
}

let _userTrackWatchId = null;
let _userCourierMarker = null;
let _userRouteLayer = null;

function stopUserTracking(){
  if(_userTrackWatchId !== null){ clearInterval(_userTrackWatchId); _userTrackWatchId = null; }
  _userCourierMarker = null;
  _userRouteLayer = null;
}

async function fetchRouteUser(fromLat, fromLng, toLat, toLng){
  try{
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const json = await res.json();
    const coords = json?.routes?.[0]?.geometry?.coordinates;
    if(coords && coords.length) return coords.map(([lng,lat])=>[lat,lng]);
  }catch(e){}
  return [[fromLat,fromLng],[toLat,toLng]];
}

function renderOrderDetail(){
  const o = currentOrder;
  const itemsHtml = (o.items||[]).map(i=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed var(--border);font-size:13px"><span>${esc(i.name)} × ${i.qty}</span><strong>${i.price*i.qty} ل.س</strong></div>`).join('');
  const isOnWay = o.status==='on_way' && o.deliveryLocation && o.deliveryLocation.lat!=null;
  $('#orderDetailBody').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="font-size:17px;font-weight:800">${esc(o.storeName||'طلب')}</h3>
      <span class="badge ${o.status}">${statusBadgeHtml(o.status)}</span>
    </div>
    ${o.type==='custom'?`<div class="total-card"><p style="font-size:13px;color:var(--gray);margin-bottom:6px">تفاصيل الطلب المخصص:</p><div style="font-size:14px;line-height:1.6">${esc(o.customRequest||'')}</div></div>`:''}
    ${itemsHtml?`<div class="total-card" style="margin-top:10px"><h4 style="font-size:14px;margin-bottom:8px">الأصناف</h4>${itemsHtml}</div>`:''}
    <div class="total-card" style="margin-top:10px">
      <div class="total-row"><span>المجموع</span><strong>${o.subtotal||0} ل.س</strong></div>
      <div class="total-row"><span>رسوم التوصيل</span><strong>${o.deliveryFee||0} ل.س</strong></div>
      <div class="total-row big"><span>الإجمالي</span><strong style="color:var(--primary)">${o.total||0} ل.س</strong></div>
    </div>
    ${o.address?`<div class="total-card" style="margin-top:10px"><h4 style="font-size:14px;margin-bottom:5px"><i class="fas fa-location-dot"></i> العنوان</h4><p style="font-size:13px;color:var(--gray)">${esc(o.address)}</p></div>`:''}
    ${o.deliveryName?`<div class="total-card" style="margin-top:10px;background:linear-gradient(135deg,var(--primary),#FF8A3D);color:white"><h4 style="font-size:14px;margin-bottom:5px;color:white"><i class="fas fa-motorcycle"></i> المندوب</h4><p style="font-size:13px">${esc(o.deliveryName)}</p></div>`:''}
    ${isOnWay?`<div class="map-note" style="margin-top:10px"><i class="fas fa-satellite-dish" style="animation:spin 2s linear infinite"></i> <span>المندوب في الطريق إليك - تتبع مباشر نشط 🔴</span></div>`:''}
    ${['pending','accepted'].includes(o.status)?`<button class="btn btn-danger" id="userCancelBtn" style="margin-top:16px"><i class="fas fa-times-circle"></i> إلغاء الطلب</button>`:''}
    <div id="orderMap" style="margin-top:12px;height:260px;border-radius:16px"></div>
  `;

  // رسم الخريطة مع تتبع المندوب لحظياً
  setTimeout(async ()=>{
    if(window._userOrderMap){ try{ window._userOrderMap.remove(); }catch(e){} window._userOrderMap=null; }
    stopUserTracking();
    if(!o.location || o.location.lat==null) return;
    const m = L.map('orderMap').setView([o.location.lat,o.location.lng],14);
    window._userOrderMap = m;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'}).addTo(m);
    // علامة المستخدم
    const userIcon = L.divIcon({html:'<div style="background:#FF5A1F;width:22px;height:22px;border-radius:50%;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:11px">📍</div>',className:'',iconSize:[22,22],iconAnchor:[11,11]});
    L.marker([o.location.lat,o.location.lng],{icon:userIcon}).addTo(m).bindPopup('موقع التسليم');
    // إذا كان المندوب موجود ارسم موقعه والمسار
    const drawCourier = async (dlat,dlng)=>{
      const courierIcon = L.divIcon({html:'<div style="background:#0EA5E9;width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:14px">🏍</div>',className:'',iconSize:[28,28],iconAnchor:[14,14]});
      if(_userCourierMarker){ _userCourierMarker.setLatLng([dlat,dlng]); }
      else{ _userCourierMarker = L.marker([dlat,dlng],{icon:courierIcon}).addTo(m).bindPopup('المندوب'); }
      try{
        const route = await fetchRouteUser(dlat,dlng,o.location.lat,o.location.lng);
        if(_userRouteLayer) m.removeLayer(_userRouteLayer);
        _userRouteLayer = L.polyline(route,{color:'#0EA5E9',weight:6,opacity:0.85,dashArray:'0'}).addTo(m);
        m.fitBounds(_userRouteLayer.getBounds(),{padding:[30,30]});
      }catch(e){}
    };
    if(o.deliveryLocation && o.deliveryLocation.lat!=null){
      await drawCourier(o.deliveryLocation.lat, o.deliveryLocation.lng);
    }
    m.invalidateSize();
    // تتبع مستمر لحظي كل 4 ثواني
    if(['accepted','on_way'].includes(o.status)){
      _userTrackWatchId = setInterval(async ()=>{
        if(!window._userOrderMap) return;
        try{
          const snap = await getDoc(doc(db,'orders',o.id));
          if(!snap.exists()) return;
          const latest = snap.data();
          if(latest.deliveryLocation && latest.deliveryLocation.lat!=null){
            await drawCourier(latest.deliveryLocation.lat, latest.deliveryLocation.lng);
          }
          // إذا تسلّم الطلب وقف التتبع
          if(['delivered','cancelled'].includes(latest.status)){ stopUserTracking(); }
        }catch(e){}
      }, 4000);
    }
  },200);

  const userCancelBtn = document.getElementById('userCancelBtn');
  if(userCancelBtn) userCancelBtn.addEventListener('click', async ()=>{
    if(!confirm('هل أنت متأكد من إلغاء الطلب؟')) return;
    userCancelBtn.disabled = true;
    try{
      await updateDoc(doc(db,'orders',o.id),{status:'cancelled'});
      toast('تم إلغاء الطلب','success');
      stopUserTracking();
      showScreen('ordersScreen');
    }catch(e){ toast('خطأ: '+e.message,'error'); userCancelBtn.disabled=false; }
  });
}

$('#chatFromOrder').addEventListener('click',()=>{
  if(!currentOrder) return;
  const dot = document.getElementById('chatNotifDot');
  if(dot) dot.classList.remove('show');
  openChat(currentOrder.id);
});

function openChat(orderId){
  if(chatUnsub) chatUnsub();
  $('#chatMessages').innerHTML='';
  const o = currentOrder || {};
  const chatName = o.deliveryName || 'المندوب';
  const chatPhone = o.deliveryPhone || '';
  $('#chatTitle').textContent = chatName;
  $('#chatMeta').textContent = chatPhone ? `الجوال: ${esc(chatPhone)}` : (o.status==='pending' ? 'بانتظار قبول المندوب' : 'معلومات المندوب');
  $('#chatAvatar').textContent = (chatName||'?').trim().charAt(0) || '-';
  // إخفاء النقطة الحمراء عند فتح الدردشة
  const dot = document.getElementById('chatNotifDot');
  if(dot) dot.classList.remove('show');
  let lastMsgCount = 0;
  const q = query(collection(db,'chats',orderId,'messages'), orderBy('timestamp','asc'));
  chatUnsub = onSnapshot(q,(snap)=>{
    const isOnChatScreen = $('#chatScreen').classList.contains('active');
    // صوت إشعار عند وصول رسالة جديدة من المندوب
    if(snap.docs.length > lastMsgCount && lastMsgCount > 0){
      const latest = snap.docs[snap.docs.length-1].data();
      if(latest.from !== currentUser.uid){
        playSound('chat');
        if(!isOnChatScreen){
          const dot2 = document.getElementById('chatNotifDot');
          if(dot2) dot2.classList.add('show');
        }
      }
    }
    lastMsgCount = snap.docs.length;
    $('#chatMessages').innerHTML = snap.docs.map(d=>{
      const m=d.data();
      const mine = m.from===currentUser.uid;
      const body = m.image ? `<img src="${m.image}" alt="صورة">${m.text?`<div>${esc(m.text)}</div>`:''}` : esc(m.text);
      return `<div class="msg ${mine?'me':'other'}">${body}<div class="msg-time">${m.fromName||''}</div></div>`;
    }).join('');
    $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
  });
  window._chatOrderId = orderId;
  showScreen('chatScreen');
}

window.sendMsg = async ()=>{
  const t = $('#chatInput').value.trim(); if(!t||!window._chatOrderId) return;
  $('#chatInput').value='';
  try{
    await addDoc(collection(db,'chats',window._chatOrderId,'messages'),{
      from:currentUser.uid, fromName:userData.name, text:t, timestamp:serverTimestamp()
    });
  }catch(e){toast('خطأ في الإرسال','error')}
};


// Trigger screen-specific
const obs = new MutationObserver(()=>{
  if($('#cartScreen').classList.contains('active')) renderCart();
  if($('#checkoutScreen').classList.contains('active')){ renderCart(); }
});
obs.observe($('#app'),{subtree:true,attributes:true,attributeFilter:['class']});

function esc(s){return String(s||'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]))}
function escapeAttr(s){return esc(s)}

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
function currency(v){ return `${Math.round(+v||0)} ل.س`; }
async function getAvailableCouriers(){
  try{
    const snap = await getDocs(query(collection(db,'users'), where('role','==','delivery')));
    return snap.docs.map(d=>({id:d.id,...d.data()})).filter(u=>u.available && u.currentLocation && u.currentLocation.lat!=null && u.currentLocation.lng!=null);
  }catch(e){ return []; }
}
async function estimateDelivery(location){
  let best = null;
  let bestKm = null;
  const couriers = await getAvailableCouriers();
  couriers.forEach(u=>{
    const km = haversineKm(location, u.currentLocation);
    if(km!=null && (bestKm==null || km < bestKm)) { bestKm = km; best = u; }
  });
  const storePoint = currentStore && (currentStore.location || (currentStore.lat!=null && currentStore.lng!=null ? {lat:+currentStore.lat,lng:+currentStore.lng} : null));
  const storeKm = storePoint ? haversineKm(storePoint, location) : null;
  const km = bestKm ?? storeKm ?? 0;
  const fee = Math.max(2, Math.round(km * 2));
  return {fee, km, courier: best};
}
function setBtnLoading(btn, loading, text){
  if(!btn) return;
  if(loading){
    if(!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${text||'جاري المعالجة'}`;
  }else{
    btn.disabled = false;
    if(btn.dataset.originalHtml){ btn.innerHTML = btn.dataset.originalHtml; delete btn.dataset.originalHtml; }
  }
}
async function refreshDeliveryEstimate(){
  const feeText = $('#cartDeliveryFee');
  const checkFeeText = $('#checkDeliveryFee');
  const estimateText = $('#deliveryEstimateText');
  const noteBox = $('#deliveryEstimateBox');
  if(!pickedLocation){
    deliveryEstimate = {fee:0,km:0,courier:null};
    if(feeText) feeText.textContent = '0 ل.س';
    if(checkFeeText) checkFeeText.textContent = '0 ل.س';
    if(estimateText) estimateText.textContent = 'سيتم احتساب رسوم التوصيل بعد تحديد الموقع';
    if(noteBox) noteBox.style.display = 'flex';
    return;
  }
  const est = await estimateDelivery(pickedLocation);
  deliveryEstimate = est;
  if(feeText) feeText.textContent = currency(est.fee);
  if(checkFeeText) checkFeeText.textContent = currency(est.fee);
  if(estimateText) estimateText.textContent = est.courier ? `أقرب مندوب يبعد تقريباً ${est.km.toFixed(1)} كم، ورسوم التوصيل ${currency(est.fee)}` : `لم يتم العثور على مندوب متاح، ورسوم التوصيل ${currency(est.fee)} محسوبة حسب المسافة`;
}

// ===== PWA Install =====
let _deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredPrompt = e;
  const bar = document.getElementById('pwaInstallBar');
  if(bar) bar.classList.add('show');
});

document.getElementById('pwaInstallBtn')?.addEventListener('click', async () => {
  if(!_deferredPrompt) return;
  _deferredPrompt.prompt();
  const { outcome } = await _deferredPrompt.userChoice;
  _deferredPrompt = null;
  const bar = document.getElementById('pwaInstallBar');
  if(bar) bar.classList.remove('show');
});

document.getElementById('pwaCloseBtn')?.addEventListener('click', () => {
  const bar = document.getElementById('pwaInstallBar');
  if(bar) bar.classList.remove('show');
  try{ localStorage.setItem('pwa_dismissed','1'); }catch(e){}
});

// إخفاء الزر إذا تم الإغلاق مسبقاً أو تم التثبيت
try{ if(localStorage.getItem('pwa_dismissed')==='1'){ const bar = document.getElementById('pwaInstallBar'); if(bar) bar.style.display='none !important'; } }catch(e){}

window.addEventListener('appinstalled', () => {
  const bar = document.getElementById('pwaInstallBar');
  if(bar) bar.classList.remove('show');
  _deferredPrompt = null;
});

// تسجيل Service Worker مع تحديث تلقائي عند رفع نسخة جديدة
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      // فحص دوري للتحديثات (كل 60 ثانية)
      setInterval(() => { reg.update().catch(()=>{}); }, 60000);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if(!nw) return;
        nw.addEventListener('statechange', () => {
          if(nw.state === 'installed' && navigator.serviceWorker.controller){
            // إصدار جديد جاهز - فعّله فوراً
            nw.postMessage({ type:'SKIP_WAITING' });
          }
        });
      });
    }).catch(()=>{});

    let _reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if(_reloaded) return;
      _reloaded = true;
      // مسح كل الكاش القديم في المتصفح ثم إعادة التحميل
      if('caches' in window){ caches.keys().then(keys => keys.forEach(k => { if(!k.includes('runtime')) caches.delete(k); })); }
      window.location.reload();
    });

    navigator.serviceWorker.addEventListener('message', (e) => {
      if(e.data && e.data.type === 'SW_UPDATED'){
        try{ toast && toast('تم تحديث التطبيق إلى أحدث إصدار','success'); }catch(_){}
      }
    });
  });
}