import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, addDoc, updateDoc, onSnapshot, collection, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = { apiKey:"AIzaSyA3wjOh1IZLS5cK8dH0fB6nwKH50iXvFhk", authDomain:"ahmad-b755f.firebaseapp.com", projectId:"ahmad-b755f", storageBucket:"ahmad-b755f.firebasestorage.app", messagingSenderId:"1086597289816", appId:"1:1086597289816:web:efe60451f04837b75e772d" };
const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
setPersistence(auth, browserLocalPersistence).catch(()=>{});

const BASE_FARE = 5000, PER_KM_TRIP = 1500, PER_KM_PICKUP = 1000, SEARCH_RADIUS_KM = 30;

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const toast = (m,t='') => { const el=$('#toast'); el.textContent=m; el.className='toast show '+t; setTimeout(()=>el.classList.remove('show'),2500); };
const km = (a,b)=>{ const R=6371,toR=x=>x*Math.PI/180; const dLat=toR(b.lat-a.lat),dLng=toR(b.lng-a.lng); const x=Math.sin(dLat/2)**2+Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(x)); };
function esc(s){return String(s||'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]))}

// === الإشعارات والصوت ===
function requestNotifPermission(){ try{ if('Notification' in window && Notification.permission==='default') Notification.requestPermission().catch(()=>{}); }catch(e){} }
document.addEventListener('click', requestNotifPermission, { once:true });
function showNotification(title, body, tag){
  try{
    if(!('Notification' in window) || Notification.permission!=='granted') return;
    const opts = { body: body||'', icon: './favicon.png', badge: './favicon.png', tag: tag||'adpl-r', vibrate:[200,100,200], renotify:true };
    if(navigator.serviceWorker && navigator.serviceWorker.ready){
      navigator.serviceWorker.ready.then(reg => reg.showNotification(title, opts)).catch(()=>{ try{ new Notification(title, opts); }catch(_){} });
    } else { new Notification(title, opts); }
  }catch(e){}
}
function playSound(type){
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.type='sine';
    if(type==='request'){ o.frequency.setValueAtTime(440,ctx.currentTime); o.frequency.setValueAtTime(660,ctx.currentTime+0.15); o.frequency.setValueAtTime(880,ctx.currentTime+0.3);
      g.gain.setValueAtTime(0.2,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.6); o.start(ctx.currentTime); o.stop(ctx.currentTime+0.6);
    } else if(type==='accept'){ o.frequency.setValueAtTime(880,ctx.currentTime); o.frequency.setValueAtTime(1100,ctx.currentTime+0.18);
      g.gain.setValueAtTime(0.22,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.5); o.start(ctx.currentTime); o.stop(ctx.currentTime+0.5);
    } else { o.frequency.setValueAtTime(700,ctx.currentTime); g.gain.setValueAtTime(0.15,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.3); o.start(ctx.currentTime); o.stop(ctx.currentTime+0.3); }
    setTimeout(()=>ctx.close().catch(()=>{}),1200);
  }catch(e){}
}

let user=null, userData=null, map=null, pickupMarker=null, destMarker=null, routeLine=null;
let pickup=null, dest=null, routeKm=0, nearestCaptain=null, nearestKm=null, totalPrice=0;
let activeRideId=null, rideUnsub=null, ordersUnsub=null;
let manualPinMode=false;

// === Pages
window.showPage = (id) => {
  $$('.page').forEach(p=>p.classList.remove('active'));
  $('#'+id).classList.add('active');
  $$('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.nav===id));
  if(id==='homePage') setTimeout(()=>{ if(map) map.invalidateSize(); }, 150);
};
$$('.nav-item').forEach(n=>n.addEventListener('click',()=>showPage(n.dataset.nav)));

// === Auth: redirect to login if not authed
onAuthStateChanged(auth, async u=>{
  if(!u){ window.location.replace('ride-login.html'); return; }
  user = u;
  const ud = await getDoc(doc(db,'users',u.uid));
  userData = ud.exists() ? ud.data() : { name:u.email, phone:'', email:u.email };
  // Initialize map and check active ride
  initMap(); autoGps();
  subscribeOrders();
  const q = query(collection(db,'rides'), where('customerId','==',u.uid), where('status','in',['searching','accepted','arrived','in_progress']));
  const snap = await getDocs(q);
  if(!snap.empty){
    activeRideId = snap.docs[0].id;
    showTracking();
  }
});

function initMap(){
  if(map){ map.invalidateSize(); return; }
  map = L.map('map',{zoomControl:true}).setView([33.5138,36.2765],13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19}).addTo(map);
  map.on('click', e=>{
    if(manualPinMode) return; // ignore clicks while picking via center pin
    if(!pickup){ setPickup(e.latlng); }
    else if(!dest){ setDest(e.latlng); }
    else { resetMap(); setPickup(e.latlng); }
  });
}

function pinIcon(color){ return L.divIcon({className:'',html:`<div style="background:${color};width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.5)"></div>`,iconAnchor:[12,24]}); }

function setPickup(ll){
  pickup={lat:ll.lat,lng:ll.lng};
  if(pickupMarker) pickupMarker.remove();
  pickupMarker = L.marker(ll,{icon:pinIcon('#22D3EE')}).addTo(map).bindPopup('موقعك').openPopup();
  showDestBtn();
}
function setDest(ll){
  dest={lat:ll.lat,lng:ll.lng};
  if(destMarker) destMarker.remove();
  destMarker = L.marker(ll,{icon:pinIcon('#EF4444')}).addTo(map).bindPopup('الوجهة').openPopup();
  drawRoute();
}
function resetMap(){
  pickup=null; dest=null; routeKm=0; nearestCaptain=null; nearestKm=null; totalPrice=0;
  if(pickupMarker){ pickupMarker.remove(); pickupMarker=null; }
  if(destMarker){ destMarker.remove(); destMarker=null; }
  if(routeLine){ routeLine.remove(); routeLine=null; }
  $('#distVal').textContent='—'; $('#captainDistVal').textContent='—'; $('#priceVal').textContent='—';
  $('#confirmBtn').disabled=true;
  exitManualPin();
}
$('#resetMapBtn').onclick = ()=>{ resetMap(); autoGps(); };
$('#useGpsBtn').onclick = ()=> autoGps();

function autoGps(){
  if(!navigator.geolocation){ toast('GPS غير مدعوم','err'); return; }
  $('#mapHint').innerHTML='<i class="fas fa-spinner fa-spin"></i> جاري تحديد موقعك...';
  navigator.geolocation.getCurrentPosition(p=>{
    const ll = L.latLng(p.coords.latitude, p.coords.longitude);
    map.setView(ll,15); setPickup(ll);
    $('#mapHint').innerHTML='<i class="fas fa-check-circle" style="color:var(--success)"></i> تم تحديد موقعك';
    showDestBtn();
  }, ()=>{
    toast('تعذر تحديد موقعك تلقائياً','err');
    $('#mapHint').innerHTML='<i class="fas fa-info-circle"></i> اضغط الخريطة لتحديد موقعك';
    $('#useGpsBtn').classList.remove('hidden');
  });
}

function showDestBtn(){
  $('#destBtn').classList.remove('hidden');
  $('#useGpsBtn').classList.add('hidden');
}

$('#destBtn').onclick = ()=>{
  $('#destPanel').classList.remove('hidden');
  $('#destBtn').classList.add('hidden');
  $('#destSearchInput').focus();
  // Trigger empty search to display nearby places sorted by distance
  searchPlace('');
};

// Nominatim search with proximity bias - shows nearby places sorted by distance
let searchTimeout=null;
$('#destSearchInput').addEventListener('input', e=>{
  clearTimeout(searchTimeout);
  const q = e.target.value.trim();
  searchTimeout = setTimeout(()=>searchPlace(q), 400);
});

async function searchPlace(q){
  const box = $('#searchResults');
  box.classList.add('show');
  box.innerHTML = `<div style="padding:14px;color:var(--muted);text-align:center"><i class="fas fa-spinner fa-spin"></i> جاري البحث...</div>`;
  try{
    let url;
    const lat = pickup?.lat || 33.5138;
    const lng = pickup?.lng || 36.2765;
    if(q.length < 2){
      // Show nearby POIs (shops, restaurants, shopping)
      url = `https://nominatim.openstreetmap.org/search?format=json&q=shop&limit=15&accept-language=ar&viewbox=${lng-0.05},${lat+0.05},${lng+0.05},${lat-0.05}&bounded=1`;
    } else {
      url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=15&accept-language=ar&viewbox=${lng-0.2},${lat+0.2},${lng+0.2},${lat-0.2}&bounded=0`;
    }
    const res = await fetch(url, {headers:{'Accept-Language':'ar'}});
    let data = await res.json();
    if(!Array.isArray(data) || !data.length){ box.innerHTML=`<div style="padding:16px;color:var(--muted);text-align:center"><i class="fas fa-search-minus"></i> لا توجد نتائج</div>`; return; }
    // sort by distance from pickup
    data = data.map(p=>({...p,_d: km({lat,lng},{lat:+p.lat,lng:+p.lon})})).sort((a,b)=>a._d-b._d);
    box.innerHTML = data.map(p=>{
      const name = (p.display_name||'').split(',').slice(0,2).join('، ');
      return `<div class="result-item" data-lat="${p.lat}" data-lng="${p.lon}">
        <div class="res-ic"><i class="fas fa-map-marker-alt"></i></div>
        <div class="res-body"><div class="res-name">${esc(name)}</div><div class="res-dist">${p._d.toFixed(2)} كم</div></div>
      </div>`;
    }).join('');
    box.querySelectorAll('.result-item').forEach(el=>el.addEventListener('click',()=>{
      const ll = L.latLng(+el.dataset.lat, +el.dataset.lng);
      setDest(ll); map.setView(ll,15);
      box.classList.remove('show'); $('#destPanel').classList.add('hidden');
      $('#destSearchInput').value='';
    }));
  }catch(e){ box.innerHTML=`<div style="padding:16px;color:var(--danger);text-align:center">خطأ في البحث</div>`; }
}

// Manual pin: show center pin overlay (offset to right of center via CSS)
$('#manualPinBtn').onclick = ()=>{
  manualPinMode = true;
  $('#centerPin').classList.add('show');
  $('#manualPinHint').classList.remove('hidden');
  $('#confirmManualPin').classList.remove('hidden');
  $('#manualPinBtn').classList.add('active');
  $('#searchResults').classList.remove('show');
  toast('حرّك الخريطة لوضع الدبوس على الموقع','ok');
};

function exitManualPin(){
  manualPinMode = false;
  $('#centerPin').classList.remove('show');
  $('#manualPinHint').classList.add('hidden');
  $('#confirmManualPin').classList.add('hidden');
  $('#manualPinBtn').classList.remove('active');
}

$('#confirmManualPin').onclick = ()=>{
  if(!map) return;
  // The center pin is offset visually (-180% from left). Compute pin actual coordinates by offsetting the map center
  const containerCenter = map.latLngToContainerPoint(map.getCenter());
  // pin tip offset relative to center: visually translated by translate(-180%,-100%) where pin is 34px wide
  // -180% horizontal of pin width (34) = -61.2px from center, -100% vertical = -34px from center
  // But center-pin's anchor (top-left) is at center; transform shifts the visible pin tip.
  // Pin tip is at the 50% top, 50% left of the pin (rotated). We approximate the tip at offset (-61, -17) px from container center.
  const tipX = containerCenter.x + 0;   // visually the pin is to the LEFT of center (right side in RTL view feels intentional)
  const tipY = containerCenter.y + 0;
  // Actually use the rendered pin element position
  const wrapRect = $('#mapWrap').getBoundingClientRect();
  const pinEl = $('#centerPin').querySelector('.pin');
  const pinRect = pinEl.getBoundingClientRect();
  const pxX = (pinRect.left + pinRect.width/2) - wrapRect.left;
  const pxY = (pinRect.top + pinRect.height) - wrapRect.top; // tip is at bottom of rotated square visually
  const ll = map.containerPointToLatLng([pxX, pxY]);
  setDest(ll);
  $('#destPanel').classList.add('hidden');
  $('#destSearchInput').value='';
  exitManualPin();
};

async function drawRoute(){
  if(!pickup||!dest) return;
  const url = `https://router.project-osrm.org/route/v1/driving/${pickup.lng},${pickup.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
  try{
    const res = await fetch(url); const j = await res.json();
    if(j.code!=='Ok'||!j.routes?.length) throw new Error('no');
    const coords = j.routes[0].geometry.coordinates.map(c=>[c[1],c[0]]);
    if(routeLine) routeLine.remove();
    routeLine = L.polyline(coords,{color:'#FFD23F',weight:5,opacity:.9}).addTo(map);
    // fitBounds with padding biased to right (to keep pin offset)
    map.fitBounds(routeLine.getBounds(),{padding:[50,50]});
    routeKm = +(j.routes[0].distance/1000).toFixed(2);
  }catch(e){
    routeKm = +km(pickup,dest).toFixed(2);
    if(routeLine) routeLine.remove();
    routeLine = L.polyline([[pickup.lat,pickup.lng],[dest.lat,dest.lng]],{color:'#FFD23F',weight:4,dashArray:'8,8'}).addTo(map);
    map.fitBounds(routeLine.getBounds(),{padding:[50,50]});
  }
  $('#distVal').textContent = routeKm+' كم';
  await findNearestCaptain();
  computePrice();
}

async function findNearestCaptain(){
  nearestCaptain=null; nearestKm=null;
  // captains live in users collection with role:captain
  let snap;
  try{ snap = await getDocs(query(collection(db,'users'), where('role','==','captain'), where('online','==',true))); }
  catch(_){ snap = await getDocs(query(collection(db,'captains'), where('online','==',true))); }
  let best=null,bestKm=Infinity;
  snap.forEach(d=>{
    const c={id:d.id,...d.data()};
    if(!c.location?.lat) return;
    const dKm = km(pickup, c.location);
    if(dKm < bestKm && dKm <= SEARCH_RADIUS_KM){ bestKm=dKm; best=c; }
  });
  if(best){ nearestCaptain=best; nearestKm=+bestKm.toFixed(2); $('#captainDistVal').textContent = nearestKm+' كم'; }
  else $('#captainDistVal').textContent = 'لا يوجد كابتن قريب';
}

function computePrice(){
  if(!routeKm) return;
  const pickupKm = nearestKm ?? 2;
  totalPrice = Math.round(BASE_FARE + routeKm*PER_KM_TRIP + pickupKm*PER_KM_PICKUP);
  $('#priceVal').textContent = totalPrice.toLocaleString()+' ل.س';
  $('#confirmBtn').disabled=false;
}

$('#confirmBtn').onclick = async ()=>{
  if(!pickup||!dest) return;
  $('#confirmBtn').disabled=true;
  try{
    const ride = {
      customerId: user.uid, customerName: userData.name||'', customerPhone: userData.phone||'',
      pickup, destination: dest, routeKm, captainPickupKm: nearestKm||0, price: totalPrice,
      status:'searching', captainId:null, captainName:null, captainPhone:null, captainLocation:null,
      createdAt: serverTimestamp()
    };
    const ref = await addDoc(collection(db,'rides'), ride);
    activeRideId = ref.id;
    playSound('request');
    showNotification('تم إرسال طلب الرحلة 🚖', 'نبحث الآن عن أقرب كابتن متاح لك', 'ride-sent');
    showTracking();
  }catch(e){ toast('فشل الإنشاء: '+e.message,'err'); $('#confirmBtn').disabled=false; }
};

function showTracking(){
  showPage('trackPage');
  $('#searchingCard').classList.remove('hidden');
  $('#acceptedBox').classList.add('hidden');
  $('#completedBox').classList.add('hidden');
  if(rideUnsub) rideUnsub();
  let prevStatus = null;
  rideUnsub = onSnapshot(doc(db,'rides',activeRideId), snap=>{
    if(!snap.exists()) return;
    const r = snap.data();
    // إشعار عند تغيير الحالة
    if(prevStatus && prevStatus !== r.status){
      if(r.status==='accepted'){
        playSound('accept');
        showNotification('تم قبول رحلتك ✅', `الكابتن ${r.captainName||''} في طريقه إليك`, 'ride-accepted');
      } else if(r.status==='arrived'){
        playSound('accept');
        showNotification('وصل الكابتن 📍', 'الكابتن في موقع الاستلام بانتظارك', 'ride-arrived');
      } else if(r.status==='in_progress'){
        playSound('request');
        showNotification('بدأت الرحلة 🚗', 'في طريقك إلى الوجهة', 'ride-progress');
      } else if(r.status==='completed'){
        playSound('accept');
        showNotification('انتهت الرحلة ✅', 'شكراً لاستخدامك ادبل، وصلت بسلام', 'ride-done');
      } else if(r.status==='cancelled'){
        showNotification('تم إلغاء الرحلة ❌', 'تم إلغاء طلب الرحلة', 'ride-cancel');
      }
    }
    prevStatus = r.status;

    if(r.status==='searching'){
      $('#searchingCard').classList.remove('hidden'); $('#acceptedBox').classList.add('hidden');
    } else if(['accepted','arrived','in_progress'].includes(r.status)){
      $('#searchingCard').classList.add('hidden'); $('#acceptedBox').classList.remove('hidden');
      $('#capName').textContent = r.captainName||'كابتن';
      $('#capPhone').textContent = r.captainPhone||'';
      $('#capAvatar').textContent = (r.captainName||'ك').charAt(0);
      $('#capCallBtn').href = 'tel:'+(r.captainPhone||'');
      $('#trkDist').textContent = r.routeKm+' كم';
      $('#trkPrice').textContent = (+r.price||0).toLocaleString()+' ل.س';
      const sm={accepted:'الكابتن في طريقه إليك',arrived:'الكابتن وصل',in_progress:'الرحلة جارية الآن'};
      $('#statusText').textContent = sm[r.status];
    } else if(r.status==='completed'){
      $('#searchingCard').classList.add('hidden'); $('#acceptedBox').classList.add('hidden'); $('#completedBox').classList.remove('hidden');
    } else if(r.status==='cancelled'){
      toast('تم إلغاء الرحلة','err');
      activeRideId=null; if(rideUnsub) rideUnsub();
      resetMap(); showPage('homePage');
    }
  });
}

$('#cancelSearchBtn').onclick = $('#cancelRideBtn').onclick = async ()=>{
  if(!activeRideId) return;
  if(!confirm('تأكيد إلغاء الطلب؟')) return;
  await updateDoc(doc(db,'rides',activeRideId),{status:'cancelled', cancelledAt:serverTimestamp()});
};
$('#newRideBtn').onclick = ()=>{ activeRideId=null; if(rideUnsub) rideUnsub(); resetMap(); showPage('homePage'); };

// Orders page
function subscribeOrders(){
  if(ordersUnsub) ordersUnsub();
  ordersUnsub = onSnapshot(query(collection(db,'rides'), where('customerId','==',user.uid)), snap=>{
    const list = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    renderOrders(list);
  });
}
function statusLabel(s){return {searching:'يبحث عن كابتن',accepted:'مقبول',arrived:'الكابتن وصل',in_progress:'في الطريق',completed:'مكتمل',cancelled:'ملغي'}[s]||s}
function renderOrders(list){
  const el = $('#ordersList');
  if(!list.length){ el.innerHTML = `<div class="empty"><i class="fas fa-receipt"></i><h4>لا توجد طلبات</h4><p style="font-size:13px;margin-top:6px">اطلب رحلتك الأولى من الرئيسية</p></div>`; return; }
  el.innerHTML = list.map(r=>`
    <div class="order-card" data-id="${r.id}">
      <div class="order-head">
        <strong><i class="fas fa-taxi" style="color:var(--primary);margin-left:6px"></i> رحلة</strong>
        <span class="badge ${r.status}">${statusLabel(r.status)}</span>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px"><i class="fas fa-route"></i> المسافة: ${(+r.routeKm||0).toFixed(2)} كم</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px"><i class="fas fa-user-tie"></i> ${esc(r.captainName||'بانتظار كابتن')}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)">
        <span style="font-size:12px;color:var(--muted)">السعر</span>
        <strong style="color:var(--primary);font-size:16px">${(+r.price||0).toLocaleString()} ل.س</strong>
      </div>
    </div>`).join('');
  el.querySelectorAll('.order-card').forEach(c=>c.addEventListener('click',()=>{
    activeRideId = c.dataset.id;
    showTracking();
  }));
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