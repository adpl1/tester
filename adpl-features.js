/* ============================================================
   ADPL Features Layer - يضيف الـ19 ميزة فوق الكود الأصلي
   لا يلمس الكود الأصلي. يعمل بالكامل عبر إضافة DOM وLocalStorage
   مع دعم اختياري لـ Supabase للمحادثة والمزامنة الفورية.
   ============================================================ */
(function(){
'use strict';

// ============== الإعدادات ==============
// (اختياري) لتفعيل المحادثة الفورية بين الأجهزة، ضع المفاتيح هنا:
const SUPABASE_URL = '';   // مثل: https://xxx.supabase.co
const SUPABASE_KEY = '';   // المفتاح العام (anon)
let sb = null;
if (SUPABASE_URL && SUPABASE_KEY && window.supabase) {
  try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch(e){}
}

const PAGE = window.ADPL_PAGE || 'index';
const LS = {
  get(k, def){ try{ const v=localStorage.getItem('adpl_'+k); return v?JSON.parse(v):def; }catch(_){return def;} },
  set(k, v){ try{ localStorage.setItem('adpl_'+k, JSON.stringify(v)); }catch(_){} },
};

// ============== أدوات مشتركة ==============
function el(tag, attrs={}, ...children){
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v])=>{
    if(k==='class') e.className=v;
    else if(k==='html') e.innerHTML=v;
    else if(k.startsWith('on')) e[k.toLowerCase()]=v;
    else if(v!=null) e.setAttribute(k,v);
  });
  children.flat().forEach(c=>{ if(c==null) return; e.appendChild(typeof c==='string'?document.createTextNode(c):c); });
  return e;
}
function fmtTime(ts){ const d=new Date(ts); return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0'); }
function fmtAgo(ts){ const s=Math.floor((Date.now()-ts)/1000); if(s<60)return 'الآن'; if(s<3600)return Math.floor(s/60)+' د'; if(s<86400)return Math.floor(s/3600)+' س'; return Math.floor(s/86400)+' ي'; }

// ============== 5 + Toast (يختفي تلقائياً) ==============
function ensureToastContainer(){
  let c = document.querySelector('.adpl-toast-container');
  if(!c){ c = el('div',{class:'adpl-toast-container'}); document.body.appendChild(c); }
  return c;
}
function toast(msg, type='info', duration=3500){
  const c = ensureToastContainer();
  const icons = {success:'fa-circle-check', danger:'fa-circle-exclamation', warning:'fa-triangle-exclamation', info:'fa-circle-info'};
  const t = el('div',{class:'adpl-toast '+type}, el('i',{class:'fas '+(icons[type]||icons.info)}), el('span',{},msg));
  c.appendChild(t);
  setTimeout(()=>{ t.classList.add('fade-out'); setTimeout(()=>t.remove(), 320); }, duration);
  return t;
}
window.adplToast = toast;

// أتمتة: أي عنصر بكلاس .alert أو .notice موجود في صفحة ride لمدة طويلة → يُخفى
function autoDismissOldAlerts(){
  document.querySelectorAll('.alert, .notice, .toast, [data-auto-dismiss]').forEach(n=>{
    if(n.dataset.adplDismissed) return;
    n.dataset.adplDismissed='1';
    setTimeout(()=>{ n.style.transition='opacity .4s'; n.style.opacity='0'; setTimeout(()=>{ n.style.display='none'; },420); }, 4000);
  });
}

// ============== مركز الإشعارات (17) ==============
function getNotifs(){ return LS.get('notifs_'+PAGE, []); }
function setNotifs(n){ LS.set('notifs_'+PAGE, n); updateBellBadge(); }
function pushNotif(title, body, type='info'){
  const n = getNotifs();
  n.unshift({id:Date.now(), title, body, type, ts:Date.now(), read:false});
  setNotifs(n.slice(0,50));
  // إشعار متصفح إن كان مسموحاً
  if('Notification' in window && Notification.permission==='granted'){
    try{ new Notification(title, {body, icon:'favicon.png'}); }catch(_){}
  }
}
window.adplNotify = pushNotif;

function updateBellBadge(){
  const bell = document.querySelector('.adpl-bell');
  if(!bell) return;
  const unread = getNotifs().filter(n=>!n.read).length;
  let b = bell.querySelector('.adpl-bell-badge');
  if(unread>0){
    if(!b){ b = el('span',{class:'adpl-bell-badge'}); bell.appendChild(b); }
    b.textContent = unread>9?'9+':unread;
  } else if(b){ b.remove(); }
}

function buildBell(){
  if(document.querySelector('.adpl-bell')) return;
  const bell = el('button',{class:'adpl-bell','aria-label':'الإشعارات', onclick:toggleNotifPanel}, el('i',{class:'fas fa-bell'}));
  document.body.appendChild(bell);

  const panel = el('div',{class:'adpl-notif-panel',id:'adplNotifPanel'},
    el('div',{class:'adpl-notif-head'},
      el('h4',{},'الإشعارات'),
      el('button',{class:'adpl-notif-clear', onclick:()=>{ setNotifs([]); renderNotifs(); }},'مسح الكل')
    ),
    el('div',{class:'adpl-notif-list',id:'adplNotifList'})
  );
  document.body.appendChild(panel);
  updateBellBadge();
  // طلب إذن إشعارات المتصفح
  if('Notification' in window && Notification.permission==='default'){
    setTimeout(()=>Notification.requestPermission().catch(()=>{}), 4000);
  }
}
function renderNotifs(){
  const list = document.getElementById('adplNotifList'); if(!list) return;
  const ns = getNotifs();
  list.innerHTML='';
  if(!ns.length){ list.appendChild(el('div',{class:'adpl-notif-empty'},'لا توجد إشعارات حالياً')); return; }
  ns.forEach(n=>{
    const icons = {warning:'fa-triangle-exclamation',danger:'fa-circle-exclamation',success:'fa-circle-check',info:'fa-bell'};
    list.appendChild(el('div',{class:'adpl-notif-item '+(n.type||'')},
      el('div',{class:'adpl-notif-icon'}, el('i',{class:'fas '+(icons[n.type]||icons.info)})),
      el('div',{class:'adpl-notif-content'},
        el('h5',{}, n.title),
        el('p',{}, n.body),
        el('span',{class:'adpl-notif-time'}, fmtAgo(n.ts))
      )
    ));
  });
  // وسم كمقروءة
  const ns2 = ns.map(n=>({...n, read:true})); setNotifs(ns2);
}
function toggleNotifPanel(){
  const p = document.getElementById('adplNotifPanel'); if(!p) return;
  if(p.classList.contains('active')){ p.classList.remove('active'); }
  else { renderNotifs(); p.classList.add('active'); }
}
document.addEventListener('click', (e)=>{
  const p = document.getElementById('adplNotifPanel');
  if(!p||!p.classList.contains('active')) return;
  if(!p.contains(e.target) && !e.target.closest('.adpl-bell')) p.classList.remove('active');
});

// ============== 2 + المحادثة ==============
const CHAT_KEY = (orderId)=>'chat_'+orderId;
const ROLE = ()=> ({captain:'كابتن', delivery:'مندوب', index:'عميل', ride:'عميل', admin:'مدير'})[PAGE]||'مستخدم';

function buildChatUI(){
  if(document.getElementById('adplChat')) return;
  const w = el('div',{class:'adpl-chat',id:'adplChat'},
    el('div',{class:'adpl-chat-header'},
      el('button',{class:'adpl-chat-back', onclick:closeChat}, el('i',{class:'fas fa-arrow-right'})),
      el('div',{class:'adpl-chat-info'}, el('h4',{id:'adplChatTitle'},'محادثة'), el('p',{id:'adplChatSub'},'متصل')),
      el('span',{class:'adpl-chat-status'})
    ),
    el('div',{class:'adpl-chat-body',id:'adplChatBody'}),
    el('form',{class:'adpl-chat-input', onsubmit:(e)=>{e.preventDefault(); sendChatMsg();}},
      el('input',{id:'adplChatInput', placeholder:'اكتب رسالتك...', autocomplete:'off'}),
      el('button',{class:'adpl-chat-send', type:'submit'}, el('i',{class:'fas fa-paper-plane'}))
    )
  );
  document.body.appendChild(w);
}
let currentChatOrderId = null;
let chatChannel = null;
function openChat(orderId, peerName){
  buildChatUI();
  currentChatOrderId = orderId;
  document.getElementById('adplChatTitle').textContent = peerName || 'محادثة الطلب #'+orderId;
  document.getElementById('adplChat').classList.add('active');
  renderChatMsgs();
  // اشترك في القناة لمزامنة فورية
  if(sb){
    if(chatChannel) sb.removeChannel(chatChannel);
    chatChannel = sb.channel('chat-'+orderId);
    chatChannel.on('broadcast',{event:'msg'}, (p)=>{
      const msgs = LS.get(CHAT_KEY(orderId), []);
      if(!msgs.find(m=>m.id===p.payload.id)){
        msgs.push(p.payload); LS.set(CHAT_KEY(orderId), msgs); renderChatMsgs();
      }
    }).subscribe();
  } else {
    // مزامنة بين تبويبات نفس المتصفح
    window.addEventListener('storage', onStorageChat);
  }
}
function onStorageChat(e){
  if(e.key==='adpl_'+CHAT_KEY(currentChatOrderId)) renderChatMsgs();
}
function closeChat(){
  document.getElementById('adplChat').classList.remove('active');
  if(chatChannel && sb){ sb.removeChannel(chatChannel); chatChannel=null; }
  window.removeEventListener('storage', onStorageChat);
}
function sendChatMsg(){
  const inp = document.getElementById('adplChatInput');
  const text = inp.value.trim(); if(!text||!currentChatOrderId) return;
  const msg = {id:Date.now()+Math.random(), from:PAGE, role:ROLE(), text, ts:Date.now()};
  const msgs = LS.get(CHAT_KEY(currentChatOrderId), []); msgs.push(msg);
  LS.set(CHAT_KEY(currentChatOrderId), msgs);
  if(sb && chatChannel){ chatChannel.send({type:'broadcast', event:'msg', payload:msg}); }
  inp.value=''; renderChatMsgs();
}
function renderChatMsgs(){
  const body = document.getElementById('adplChatBody'); if(!body||!currentChatOrderId) return;
  const msgs = LS.get(CHAT_KEY(currentChatOrderId), []);
  body.innerHTML='';
  if(!msgs.length){ body.appendChild(el('div',{class:'adpl-chat-empty'},'ابدأ المحادثة الآن')); }
  msgs.forEach(m=>{
    const mine = m.from===PAGE;
    body.appendChild(el('div',{class:'adpl-msg '+(mine?'me':'them')},
      el('div',{},m.text),
      el('span',{class:'adpl-msg-time'}, fmtTime(m.ts))
    ));
  });
  body.scrollTop = body.scrollHeight;
}
window.adplOpenChat = openChat;

// ============== 1 + إنهاء الرحلة ==============
function getOrderState(id){ return LS.get('order_state_'+id, {status:'active'}); }
function setOrderState(id, s){ LS.set('order_state_'+id, s); }
function completeOrder(id, info={}){
  setOrderState(id, {status:'completed', completedAt:Date.now(), ...info});
  pushNotif('اكتملت الرحلة بنجاح', 'الطلب #'+id+' تم إغلاقه. يمكنك مشاهدته فقط.', 'success');
  toast('تم إنهاء الرحلة بنجاح ✓','success');
  // 11: طلب التقييم
  setTimeout(()=>openRatingModal(id, info.peer||'الطرف الآخر'), 600);
  // 12: حساب المستحقات (للمندوب/الكابتن)
  if(PAGE==='captain'||PAGE==='delivery'){
    addEarning(id, info.amount||0);
  }
  return true;
}
window.adplCompleteOrder = completeOrder;
window.adplIsCompleted = (id)=> getOrderState(id).status==='completed';

// ============== 11 + التقييم ==============
function openRatingModal(orderId, peerName){
  const id = 'adplRate_'+orderId;
  if(document.getElementById(id)) return;
  let stars = 0;
  const renderStars = ()=>{
    return [1,2,3,4,5].map(n=>el('i',{class:'fas fa-star'+(n<=stars?' active':''), onclick:()=>{ stars=n; redraw(); }})).reverse();
  };
  const modal = openModal('قيّم '+peerName, (body)=>{
    body.id=id;
    body.appendChild(el('p',{style:'text-align:center;color:#6B7280;margin-bottom:14px'},'كيف كانت تجربتك؟'));
    const sw = el('div',{class:'adpl-stars adpl-rate-input',style:'justify-content:center;display:flex;margin:14px 0'}, ...renderStars());
    body.appendChild(sw);
    const ta = el('textarea',{placeholder:'تعليق (اختياري)',style:'width:100%;background:#F8F9FB;border:1px solid #E8EBF0;border-radius:12px;padding:12px;font-family:inherit;outline:none;min-height:80px;margin:10px 0'});
    body.appendChild(ta);
    const btn = el('button',{class:'adpl-btn adpl-btn-primary', onclick:()=>{
      if(!stars){ toast('اختر تقييماً من 1 إلى 5','warning'); return; }
      saveRating(orderId, peerName, stars, ta.value);
      toast('شكراً لتقييمك! ⭐','success');
      closeModal();
    }},'إرسال التقييم');
    body.appendChild(btn);
    function redraw(){ sw.innerHTML=''; renderStars().forEach(s=>sw.appendChild(s)); }
  });
}
function saveRating(orderId, peer, stars, comment){
  const all = LS.get('ratings', []);
  all.push({orderId, peer, stars, comment, ts:Date.now(), by:PAGE});
  LS.set('ratings', all);
}
function avgRating(by){
  const all = LS.get('ratings', []).filter(r=>by?r.by===by:true);
  if(!all.length) return 0;
  return (all.reduce((s,r)=>s+r.stars,0)/all.length);
}
function starsHTML(n){
  return '<span class="adpl-stars">'+[5,4,3,2,1].map(i=>'<i class="fas fa-star'+(i<=Math.round(n)?' active':'')+'"></i>').join('')+'</span>';
}
window.adplStarsHTML = starsHTML;

// ============== Modal مساعد ==============
function openModal(title, builder, opts={}){
  closeModal();
  const back = el('div',{class:'adpl-modal-backdrop active', onclick:(e)=>{ if(e.target===back) closeModal(); }});
  const modal = el('div',{class:'adpl-modal '+(opts.center?'center':'')},
    el('div',{class:'adpl-modal-header'}, el('h3',{},title), el('button',{class:'adpl-modal-close', onclick:closeModal}, el('i',{class:'fas fa-xmark'}))),
  );
  const body = el('div',{class:'adpl-modal-body'});
  modal.appendChild(body);
  back.appendChild(modal);
  document.body.appendChild(back);
  builder(body, modal);
  return back;
}
function closeModal(){ document.querySelectorAll('.adpl-modal-backdrop').forEach(m=>m.remove()); }
window.adplOpenModal = openModal; window.adplCloseModal = closeModal;

// ============== 7 + تعديل الملف الشخصي ==============
function getProfile(){ return LS.get('profile', {name:'مستخدم ادبل', phone:'', avatar:'', bio:''}); }
function setProfile(p){ LS.set('profile', p); }
function openProfileEditor(){
  const p = getProfile();
  openModal('تعديل الملف الشخصي', (body)=>{
    const avatar = el('div',{class:'adpl-account-avatar',style:'margin:0 auto 14px'}, p.avatar?el('img',{src:p.avatar}):document.createTextNode((p.name||'؟')[0]));
    body.appendChild(avatar);
    const file = el('input',{type:'file', accept:'image/*', style:'display:none', onchange:(e)=>{
      const f=e.target.files[0]; if(!f) return;
      const r = new FileReader(); r.onload=()=>{ avatar.innerHTML=''; avatar.appendChild(el('img',{src:r.result})); avatar.dataset.src=r.result; }; r.readAsDataURL(f);
    }});
    body.appendChild(file);
    body.appendChild(el('button',{class:'adpl-btn adpl-btn-ghost',style:'margin-bottom:14px', onclick:()=>file.click()},'تغيير الصورة'));
    const mkField = (label, key, type='text')=>{
      const wrap = el('div',{style:'margin-bottom:12px'});
      wrap.appendChild(el('label',{style:'display:block;font-size:13px;color:#6B7280;margin-bottom:6px;font-weight:600'}, label));
      const inp = el('input',{type, value:p[key]||'', style:'width:100%;background:#F8F9FB;border:1px solid #E8EBF0;border-radius:10px;padding:12px;font-family:inherit;outline:none', 'data-key':key});
      wrap.appendChild(inp); body.appendChild(wrap);
    };
    mkField('الاسم','name'); mkField('رقم الهاتف','phone','tel'); mkField('نبذة','bio');
    body.appendChild(el('button',{class:'adpl-btn adpl-btn-primary', onclick:()=>{
      const np = {...p};
      body.querySelectorAll('input[data-key]').forEach(i=>{ np[i.dataset.key]=i.value; });
      if(avatar.dataset.src) np.avatar = avatar.dataset.src;
      setProfile(np); toast('تم حفظ التعديلات','success'); closeModal(); renderAccountTab();
    }},'حفظ'));
  });
}
window.adplEditProfile = openProfileEditor;

// ============== 8 + المفضلة + 9 تفاصيل المنتج ==============
function getFavs(){ return LS.get('favorites', []); }
function setFavs(f){ LS.set('favorites', f); }
function isFav(id){ return getFavs().some(f=>f.id===id); }
function toggleFav(prod){
  const f = getFavs(); const i = f.findIndex(x=>x.id===prod.id);
  if(i>=0){ f.splice(i,1); toast('أُزيل من المفضلة','info'); }
  else { f.push(prod); toast('أُضيف للمفضلة ❤','success'); }
  setFavs(f); refreshFavButtons();
}
window.adplToggleFav = toggleFav;
function refreshFavButtons(){
  document.querySelectorAll('.adpl-fav-btn').forEach(b=>{
    const id = b.dataset.id;
    b.classList.toggle('active', isFav(id));
    b.querySelector('i').className = isFav(id)?'fas fa-heart':'far fa-heart';
  });
}
function openProductDetail(prod){
  openModal('تفاصيل المنتج', (body)=>{
    body.appendChild(el('img',{class:'adpl-product-img', src:prod.image||'https://via.placeholder.com/600x400/FFE8DD/FF5A1F?text=ADPL'}));
    body.appendChild(el('h2',{class:'adpl-product-title'}, prod.name));
    body.appendChild(el('div',{class:'adpl-product-price'}, (prod.price||0)+' ر.س'));
    if(prod.tags){
      const meta = el('div',{class:'adpl-product-meta'});
      prod.tags.forEach(t=>meta.appendChild(el('span',{class:'adpl-meta-pill'},t)));
      body.appendChild(meta);
    }
    body.appendChild(el('p',{class:'adpl-product-desc'}, prod.description||'منتج عالي الجودة من ادبل. اطلبه الآن واستمتع بالتوصيل السريع.'));
    body.appendChild(el('div',{class:'adpl-product-cta'},
      el('button',{class:'adpl-btn adpl-btn-ghost', onclick:()=>toggleFav(prod)}, el('i',{class:isFav(prod.id)?'fas fa-heart':'far fa-heart'}),'مفضلة'),
      el('button',{class:'adpl-btn adpl-btn-primary', onclick:()=>{
        const cart = LS.get('cart', []); cart.push(prod); LS.set('cart',cart);
        toast('أُضيف للسلة','success'); closeModal();
      }}, el('i',{class:'fas fa-cart-plus'}),'أضف للسلة')
    ));
  });
}
window.adplOpenProduct = openProductDetail;

// ============== 6 (إزالة المربع الأسود) + 3 (تثبيت الرأس) في صفحة ride ==============
function rideFixes(){
  if(PAGE!=='ride') return;
  document.body.classList.add('adpl-ride-page');
  // إزالة عناصر فارغة في شريط التبويب السفلي
  const cleanEmpty = ()=>{
    document.querySelectorAll('.tabbar, .bottom-nav, [class*="bottomnav"]').forEach(bar=>{
      Array.from(bar.children).forEach(ch=>{
        const txt = ch.textContent.trim();
        const hasIcon = ch.querySelector('i,svg,img');
        if(!txt && !hasIcon){ ch.remove(); }
      });
    });
  };
  cleanEmpty();
  setInterval(cleanEmpty, 2500);
  // تأكيد ثبات الرأس
  const h = document.querySelector('.header');
  if(h){ h.style.position='sticky'; h.style.top='0'; h.style.zIndex='100'; }
  // إخفاء التنبيهات تلقائياً
  setInterval(autoDismissOldAlerts, 1500);
}

// ============== 4 + بحث ذكي ==============
// مطابقة جزئية + Levenshtein خفيف للأخطاء الإملائية
function smartScore(query, text){
  if(!query) return 0;
  const q = query.trim().toLowerCase();
  const t = (text||'').toLowerCase();
  if(t.includes(q)) return 100 - (t.indexOf(q)*0.5);
  // مطابقة بادئة جزئية لكل كلمة في النص
  const parts = t.split(/\s+/);
  let best = 0;
  for(const p of parts){
    if(p.startsWith(q)) best = Math.max(best, 80);
    else if(p.includes(q)) best = Math.max(best, 60);
    // مطابقة جزئية للحروف الأولى
    let i=0,j=0,m=0;
    while(i<q.length && j<p.length){
      if(q[i]===p[j]){ m++; i++; }
      j++;
    }
    if(m===q.length) best = Math.max(best, 50 + m);
  }
  return best;
}
function smartSearch(items, query, opts={}){
  // items: [{name, ...}]
  const q = (query||'').trim();
  if(!q) return items.slice(0, opts.limit||50);
  const scored = items.map(it=>({
    item: it,
    score: smartScore(q, it.name) + smartScore(q, it.tags?it.tags.join(' '):'')*.4
  })).filter(x=>x.score>20);
  scored.sort((a,b)=>{
    // قرّب الأقرب جغرافياً عند تساوي النتيجة
    if(Math.abs(a.score-b.score)<5 && a.item.distance!=null && b.item.distance!=null) return a.item.distance-b.item.distance;
    return b.score-a.score;
  });
  return scored.slice(0, opts.limit||20).map(s=>s.item);
}
window.adplSmartSearch = smartSearch;

// تطبيق البحث الذكي تلقائياً على أي input مع data-adpl-search
function bindSearchInputs(){
  document.querySelectorAll('input[data-adpl-search]').forEach(inp=>{
    if(inp.dataset.adplBound) return; inp.dataset.adplBound='1';
    const target = inp.dataset.adplSearch; // مفتاح بيانات
    const wrap = inp.closest('.input-wrap, .field, div') || inp.parentElement;
    wrap.style.position='relative';
    const dd = el('div',{class:'adpl-search-results'}); wrap.appendChild(dd);
    inp.addEventListener('input', ()=>{
      const data = (window.ADPL_DATA && window.ADPL_DATA[target]) || [];
      const res = smartSearch(data, inp.value, {limit:8});
      dd.innerHTML='';
      if(!inp.value.trim()||!res.length){ dd.classList.remove('active'); return; }
      res.forEach(r=>{
        dd.appendChild(el('div',{class:'adpl-search-result', onclick:()=>{
          dd.classList.remove('active');
          if(r.onSelect) r.onSelect(r);
          else if(window.adplOnSearchSelect) window.adplOnSearchSelect(r, target);
        }},
          el('i',{class:'fas '+(r.icon||'fa-store')+' lead'}),
          el('div',{class:'info'}, el('h5',{},r.name), el('p',{},r.subtitle||'')),
          r.distance!=null ? el('div',{class:'dist'}, r.distance.toFixed(1)+' كم') : null
        ));
      });
      dd.classList.add('active');
    });
    document.addEventListener('click', (e)=>{ if(!wrap.contains(e.target)) dd.classList.remove('active'); });
  });
}

// ============== 12 + المستحقات + كود التصفير ==============
const DUES_THRESHOLD = 1000;
const COMMISSION_RATE = 0.05; // 5%
function getDues(){ return LS.get('dues_'+PAGE, 0); }
function setDues(v){ LS.set('dues_'+PAGE, v); }
function addEarning(orderId, amount){
  const e = LS.get('earnings_'+PAGE, []);
  e.push({orderId, amount, ts:Date.now()});
  LS.set('earnings_'+PAGE, e);
  // اقتطاع 5%
  const dues = getDues() + amount*COMMISSION_RATE;
  setDues(dues);
  if(dues>=DUES_THRESHOLD){
    pushNotif('تنبيه مستحقات','وصلت مستحقاتك للحد الأقصى ('+DUES_THRESHOLD+' ر.س). يجب السداد قبل قبول طلبات جديدة.','danger');
  }
}
function canAcceptOrders(){ return getDues() < DUES_THRESHOLD; }
window.adplCanAccept = canAcceptOrders;

// أكواد التصفير (تُدار من المدير)
function getCodes(){ return LS.get('admin_codes', [
  {code:'WELCOME100', value:100, active:true},
  {code:'CLEAR500', value:500, active:true}
]); }
function setCodes(c){ LS.set('admin_codes', c); }
function redeemCode(code){
  const codes = getCodes();
  const c = codes.find(x=>x.code===code.trim().toUpperCase() && x.active);
  if(!c) return {ok:false, msg:'الكود غير صحيح أو منتهي'};
  setDues(getDues() - c.value);
  // علّم الكود مستخدم
  c.usedBy = (c.usedBy||[]); c.usedBy.push({page:PAGE,ts:Date.now()}); setCodes(codes);
  return {ok:true, msg:'تم خصم '+c.value+' ر.س من المستحقات'};
}
window.adplRedeemCode = redeemCode;

// ============== 10 + صفحة أرباحي (للكابتن/المندوب) ==============
function buildEarningsScreen(){
  if(PAGE!=='captain' && PAGE!=='delivery') return;
  if(document.getElementById('adplEarningsScreen')) return;
  const e = LS.get('earnings_'+PAGE, []);
  const total = e.reduce((s,x)=>s+(x.amount||0), 0);
  const completed = e.length;
  const ratings = LS.get('ratings', []).filter(r=>r.by!==PAGE);
  const avg = avgRating();
  const dues = getDues();
  const screen = el('div',{class:'screen adpl-earnings',id:'adplEarningsScreen'},
    el('div',{class:'adpl-earnings-card'},
      el('h3',{},'إجمالي أرباحك'),
      el('p',{class:'adpl-earnings-amount'}, total.toFixed(2)+' ر.س'),
      el('div',{class:'adpl-earnings-stats'},
        el('div',{class:'adpl-earnings-stat'}, el('div',{class:'v'}, String(completed)), el('div',{class:'l'},'طلبات مكتملة')),
        el('div',{class:'adpl-earnings-stat'}, el('div',{class:'v',html:avg.toFixed(1)+' ★'}), el('div',{class:'l'},'تقييمك'))
      )
    ),
    el('div',{class:'adpl-dues-card '+(dues>=DUES_THRESHOLD?'danger':'')},
      el('h4',{},'المستحقات للشركة (5% من كل طلب)'),
      el('p',{class:'adpl-dues-amount'}, dues.toFixed(2)+' ر.س'),
      dues>=DUES_THRESHOLD ? el('div',{class:'adpl-dues-warn'}, el('i',{class:'fas fa-triangle-exclamation'}),'يجب السداد لتتمكن من قبول طلبات جديدة') : null,
      el('div',{class:'adpl-code-box'},
        el('input',{id:'adplCodeInput', placeholder:'كود التصفير', maxlength:'20'}),
        el('button',{onclick:()=>{
          const v = document.getElementById('adplCodeInput').value;
          const r = redeemCode(v);
          toast(r.msg, r.ok?'success':'danger');
          if(r.ok){ buildEarningsScreen(); document.getElementById('adplEarningsScreen').replaceWith(el('div')); buildEarningsScreen(); }
        }},'تطبيق')
      )
    ),
    el('h3',{style:'margin:18px 0 10px;font-size:15px'}, 'سجل الطلبات'),
    ...(e.length? e.slice().reverse().slice(0,20).map(x=>el('div',{class:'adpl-earnings-row'},
      el('div',{}, el('div',{style:'font-weight:800'},'طلب #'+x.orderId), el('div',{style:'font-size:12px;color:#6B7280'}, fmtAgo(x.ts))),
      el('div',{style:'font-weight:900;color:#22C55E'}, '+'+x.amount+' ر.س')
    )) : [el('div',{style:'text-align:center;padding:30px;color:#6B7280'},'لا توجد أرباح بعد')])
  );
  document.body.querySelector('.app, body').appendChild(screen);
}
function showEarnings(){
  // إخفاء كل screens ثم إظهار صفحتنا
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  let scr = document.getElementById('adplEarningsScreen');
  if(!scr){ buildEarningsScreen(); scr = document.getElementById('adplEarningsScreen'); }
  scr.classList.add('active');
}
window.adplShowEarnings = showEarnings;

// إضافة زر "أرباحي" في شريط التبويب للكابتن/المندوب
function addEarningsTab(){
  if(PAGE!=='captain' && PAGE!=='delivery') return;
  const bar = document.querySelector('.bottom-nav, .tabbar, [class*="bottom"]');
  if(!bar || bar.querySelector('[data-adpl-earnings]')) return;
  const item = el('div',{class:'nav-item','data-adpl-earnings':'1', style:'display:flex;flex-direction:column;align-items:center;cursor:pointer;padding:6px;color:#6B7280;font-size:11px;font-weight:700', onclick:showEarnings},
    el('i',{class:'fas fa-wallet',style:'font-size:18px;margin-bottom:2px'}),
    el('span',{},'أرباحي'));
  bar.appendChild(item);
}

// ============== 14 + ETA ==============
function calcETA(distanceKm, avgSpeedKmh){
  // تقدير دقيق نسبياً مع عامل ازدحام تقديري
  const base = (distanceKm / (avgSpeedKmh||30)) * 60; // دقائق
  const trafficFactor = 1 + Math.min(0.4, distanceKm*0.02);
  return Math.max(2, Math.round(base * trafficFactor));
}
window.adplCalcETA = calcETA;
function etaPillHTML(km){
  const m = calcETA(km, 30);
  return '<span class="adpl-eta-pill"><i class="fas fa-clock"></i> ~'+m+' دقيقة</span>';
}
window.adplEtaPillHTML = etaPillHTML;

// ============== 15 + إلغاءات متكررة ==============
function recordCancellation(orderId, by){
  const list = LS.get('cancellations_'+PAGE, []);
  list.push({orderId, by, ts:Date.now()});
  LS.set('cancellations_'+PAGE, list);
  if(list.length===1){
    pushNotif('تحذير','تم تسجيل إلغاء الطلب. تكرار الإلغاء سيؤدي إلى إغلاق الحساب.','warning');
    toast('تحذير: تكرار الإلغاء سيؤدي لإغلاق الحساب','warning',5000);
  } else if(list.length>=2){
    pushNotif('إنذار شديد','تكرر إلغاء الطلبات. سيتم إغلاق حسابك إذا تكرر مرة أخرى.','danger');
    toast('إنذار: قد يُغلق حسابك بسبب تكرار الإلغاء','danger',6000);
  }
  return list.length;
}
window.adplRecordCancel = recordCancellation;

// ============== 16 + تنبيه عدم إغلاق الطلب ==============
function checkPendingOrders(){
  if(PAGE!=='captain' && PAGE!=='delivery') return;
  const orders = LS.get('active_orders_'+PAGE, []);
  const pending = orders.filter(o=>o.acceptedAt && !o.completedAt);
  if(!pending.length){ removePendingBanner(); return; }
  // أقدم طلب
  const oldest = pending.reduce((a,b)=>a.acceptedAt<b.acceptedAt?a:b);
  const ageHrs = (Date.now()-oldest.acceptedAt)/3600000;
  showPendingBanner(oldest);
  if(ageHrs>=24){
    const warned = LS.get('warned_24h_'+oldest.id, false);
    if(!warned){
      pushNotif('تحذير رسمي','مرّ يوم كامل دون إغلاق الطلب #'+oldest.id+'. تكرار ذلك سيؤدي إلى إغلاق الحساب.','danger');
      LS.set('warned_24h_'+oldest.id, true);
    }
  } else if(ageHrs>=1){
    pushNotif('تذكير','لديك طلب لم تُغلقه بعد (#'+oldest.id+'). يُرجى إنهاؤه.','warning');
  }
}
function showPendingBanner(order){
  if(document.getElementById('adplPendingBanner')) return;
  const b = el('div',{class:'adpl-pending-banner',id:'adplPendingBanner', onclick:()=>{
    if(window.adplGoToOrder) window.adplGoToOrder(order.id);
    else toast('افتح الطلب #'+order.id+' وأغلقه','warning');
  }},
    el('i',{class:'fas fa-circle-exclamation'}),
    el('span',{},'يوجد طلب لم تكمله — أكمله أولاً لاستقبال طلبات جديدة'));
  document.body.insertBefore(b, document.body.firstChild);
}
function removePendingBanner(){ const b=document.getElementById('adplPendingBanner'); if(b) b.remove(); }
window.adplRegisterOrder = (id, amount)=>{
  const orders = LS.get('active_orders_'+PAGE, []);
  if(!orders.find(o=>o.id===id)){ orders.push({id, acceptedAt:Date.now(), amount}); LS.set('active_orders_'+PAGE, orders); }
};
window.adplCloseOrder = (id, peer, amount)=>{
  const orders = LS.get('active_orders_'+PAGE, []);
  const o = orders.find(x=>x.id===id); if(o){ o.completedAt=Date.now(); LS.set('active_orders_'+PAGE, orders); }
  completeOrder(id, {peer, amount: amount||(o&&o.amount)||0});
  removePendingBanner();
};

// ============== 18 + لوحة المدير: أكواد + إرسال إشعارات + حسابات مقفلة ==============
function buildAdminFeatures(){
  if(PAGE!=='admin') return;
  // ابحث عن منطقة محتوى رئيسية
  const main = document.querySelector('.content, .main, body');
  if(document.getElementById('adplAdminBlock')) return;
  const block = el('div',{id:'adplAdminBlock',class:'adpl-admin-section'});

  // أكواد
  const codesCard = el('div',{class:'adpl-admin-card'},
    el('h3',{style:'margin:0 0 12px;font-weight:800'},'إدارة أكواد التصفير'),
    el('div',{class:'adpl-form-row'},
      el('input',{id:'adminCodeName',placeholder:'الكود (مثال: CLEAR500)'}),
      el('input',{id:'adminCodeVal',type:'number',placeholder:'القيمة بالريال'}),
      el('select',{id:'adminCodeActive'}, el('option',{value:'1'},'مفعل'), el('option',{value:'0'},'متوقف')),
      el('button',{class:'adpl-btn adpl-btn-primary',style:'min-width:90px', onclick:()=>{
        const code = document.getElementById('adminCodeName').value.trim().toUpperCase();
        const value = parseFloat(document.getElementById('adminCodeVal').value);
        const active = document.getElementById('adminCodeActive').value==='1';
        if(!code||!value){ toast('أكمل الحقول','warning'); return; }
        const codes = getCodes(); codes.push({code, value, active}); setCodes(codes);
        toast('تم إنشاء الكود','success'); renderCodes();
      }},'إضافة')
    ),
    el('table',{class:'adpl-admin-table'},
      el('thead',{}, el('tr',{}, el('th',{},'الكود'), el('th',{},'القيمة'), el('th',{},'الحالة'), el('th',{},'إجراءات'))),
      el('tbody',{id:'adplCodesTbody'})
    )
  );

  // إشعارات للجمهور
  const broadcastCard = el('div',{class:'adpl-admin-card'},
    el('h3',{style:'margin:0 0 12px;font-weight:800'},'إرسال إشعار جماعي'),
    el('input',{id:'broadcastTitle',class:'',placeholder:'عنوان الإشعار',style:'width:100%;padding:10px;border:1px solid #E8EBF0;border-radius:10px;margin-bottom:8px;font-family:inherit'}),
    el('textarea',{id:'broadcastBody',placeholder:'نص الإشعار',style:'width:100%;padding:10px;border:1px solid #E8EBF0;border-radius:10px;margin-bottom:8px;font-family:inherit;min-height:60px'}),
    el('div',{style:'display:flex;gap:8px;margin-bottom:8px'},
      el('select',{id:'broadcastTo',style:'flex:1;padding:10px;border:1px solid #E8EBF0;border-radius:10px;font-family:inherit'},
        el('option',{value:'all'},'الكل'),
        el('option',{value:'index'},'العملاء'),
        el('option',{value:'captain'},'الكباتن'),
        el('option',{value:'delivery'},'المناديب')
      ),
      el('button',{class:'adpl-btn adpl-btn-primary',style:'flex:1', onclick:()=>{
        const t = document.getElementById('broadcastTitle').value.trim();
        const b = document.getElementById('broadcastBody').value.trim();
        const to = document.getElementById('broadcastTo').value;
        if(!t||!b){ toast('أكمل الحقول','warning'); return; }
        const queue = LS.get('broadcast_queue', []);
        queue.push({title:t, body:b, to, ts:Date.now()});
        LS.set('broadcast_queue', queue);
        toast('تم إرسال الإشعار','success');
        document.getElementById('broadcastTitle').value=''; document.getElementById('broadcastBody').value='';
      }},'إرسال')
    )
  );

  // حسابات مقفلة
  const lockedCard = el('div',{class:'adpl-admin-card'},
    el('h3',{style:'margin:0 0 12px;font-weight:800'},'الحسابات المقفلة/المجمدة'),
    el('div',{id:'adplLockedList'})
  );

  block.appendChild(codesCard); block.appendChild(broadcastCard); block.appendChild(lockedCard);
  main.appendChild(block);
  renderCodes(); renderLocked();
}
function renderCodes(){
  const tb = document.getElementById('adplCodesTbody'); if(!tb) return;
  tb.innerHTML='';
  getCodes().forEach((c,i)=>{
    tb.appendChild(el('tr',{},
      el('td',{style:'font-family:monospace;font-weight:800'}, c.code),
      el('td',{}, c.value+' ر.س'),
      el('td',{}, c.active?'مفعل':'متوقف'),
      el('td',{},
        el('button',{class:'adpl-btn adpl-btn-ghost',style:'flex:none;padding:6px 10px;font-size:12px;display:inline-flex;margin-left:6px', onclick:()=>{
          const codes = getCodes(); codes[i].active = !codes[i].active; setCodes(codes); renderCodes();
        }}, c.active?'إيقاف':'تفعيل'),
        el('button',{class:'adpl-btn adpl-btn-danger',style:'flex:none;padding:6px 10px;font-size:12px;display:inline-flex', onclick:()=>{
          if(!confirm('حذف الكود؟')) return;
          const codes = getCodes(); codes.splice(i,1); setCodes(codes); renderCodes();
        }},'حذف')
      )
    ));
  });
}
function renderLocked(){
  const list = document.getElementById('adplLockedList'); if(!list) return;
  const locked = LS.get('locked_accounts', []);
  list.innerHTML='';
  if(!locked.length){ list.appendChild(el('div',{style:'color:#6B7280;text-align:center;padding:20px'},'لا توجد حسابات مجمدة')); return; }
  locked.forEach((a,i)=>{
    list.appendChild(el('div',{style:'display:flex;justify-content:space-between;align-items:center;padding:10px;border-bottom:1px solid #E8EBF0'},
      el('div',{}, el('div',{style:'font-weight:800'},a.name||a.email), el('div',{style:'font-size:12px;color:#6B7280'}, a.role+' — '+(a.reason||'مخالفة'))),
      el('button',{class:'adpl-btn adpl-btn-success',style:'flex:none;padding:8px 14px;font-size:12px', onclick:()=>{
        const ll = LS.get('locked_accounts', []); ll.splice(i,1); LS.set('locked_accounts', ll); renderLocked();
        toast('تم فك الحساب','success');
      }},'فك التجميد')
    ));
  });
}

// تلقّي الإشعارات الجماعية
function pollBroadcasts(){
  const queue = LS.get('broadcast_queue', []);
  const seen = LS.get('broadcast_seen_'+PAGE, []);
  queue.forEach(b=>{
    if(seen.includes(b.ts)) return;
    if(b.to==='all' || b.to===PAGE){
      pushNotif(b.title, b.body, 'info');
    }
    seen.push(b.ts);
  });
  LS.set('broadcast_seen_'+PAGE, seen.slice(-200));
}

// ============== صفحة "حسابي" (للعميل في index) ==============
function buildAccountTab(){
  if(PAGE!=='index') return;
  if(document.getElementById('adplAccountScreen')) return;
  const app = document.querySelector('.app') || document.body;
  const scr = el('div',{class:'screen adpl-account-screen',id:'adplAccountScreen'});
  app.appendChild(scr);
  renderAccountTab();
  // إضافة زر تبويب
  const nav = document.getElementById('bottomNav') || document.querySelector('.bottom-nav, .tabbar');
  if(nav && !nav.querySelector('[data-adpl-account]')){
    const tab = el('div',{class:'nav-item','data-adpl-account':'1', style:'display:flex;flex-direction:column;align-items:center;cursor:pointer;padding:6px;color:#6B7280;font-size:11px;font-weight:700', onclick:showAccount},
      el('i',{class:'fas fa-user',style:'font-size:18px;margin-bottom:2px'}),
      el('span',{},'حسابي'));
    nav.appendChild(tab);
  }
}
function renderAccountTab(){
  const scr = document.getElementById('adplAccountScreen'); if(!scr) return;
  const p = getProfile();
  const favs = getFavs();
  scr.innerHTML='';
  scr.appendChild(el('div',{class:'adpl-account-card'},
    el('div',{class:'adpl-account-avatar'}, p.avatar?el('img',{src:p.avatar}):document.createTextNode((p.name||'؟')[0])),
    el('div',{class:'adpl-account-info'},
      el('h3',{},p.name||'مستخدم ادبل'),
      el('p',{}, p.phone||'لم تضف رقم هاتف بعد'),
      el('div',{html: starsHTML(avgRating()||5)})
    )
  ));
  const menu = el('div',{class:'adpl-account-menu'});
  const items = [
    {icon:'fa-user-pen', label:'تعديل الملف الشخصي', onClick:openProfileEditor},
    {icon:'fa-heart', label:'المفضلة ('+favs.length+')', onClick:openFavoritesPage},
    {icon:'fa-bell', label:'الإشعارات', onClick:toggleNotifPanel},
    {icon:'fa-star', label:'تقييماتي', onClick:openMyRatings},
    {icon:'fa-circle-info', label:'عن التطبيق', onClick:()=>toast('ادبل — توصيل سريع وآمن','info')},
  ];
  items.forEach(it=>{
    menu.appendChild(el('div',{class:'adpl-account-item', onclick:it.onClick},
      el('i',{class:'fas '+it.icon+' lead'}),
      el('span',{},it.label),
      el('i',{class:'fas fa-chevron-left arrow'})
    ));
  });
  scr.appendChild(menu);
}
function showAccount(){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('adplAccountScreen').classList.add('active');
  renderAccountTab();
}
function openFavoritesPage(){
  openModal('المفضلة', (body)=>{
    const favs = getFavs();
    if(!favs.length){
      body.appendChild(el('div',{class:'adpl-fav-empty'}, el('i',{class:'far fa-heart'}), el('p',{},'لا يوجد منتجات في المفضلة')));
      return;
    }
    favs.forEach(p=>{
      body.appendChild(el('div',{style:'display:flex;gap:12px;padding:12px;border-bottom:1px solid #E8EBF0;cursor:pointer', onclick:()=>{ closeModal(); openProductDetail(p); }},
        el('img',{src:p.image||'https://via.placeholder.com/80/FFE8DD/FF5A1F?text=ا',style:'width:64px;height:64px;border-radius:12px;object-fit:cover'}),
        el('div',{style:'flex:1'},
          el('div',{style:'font-weight:800'}, p.name),
          el('div',{style:'color:#FF5A1F;font-weight:800'}, (p.price||0)+' ر.س')
        ),
        el('button',{class:'adpl-fav-btn active', onclick:(e)=>{ e.stopPropagation(); toggleFav(p); openFavoritesPage(); }}, el('i',{class:'fas fa-heart'}))
      ));
    });
  });
}
function openMyRatings(){
  openModal('تقييماتي', (body)=>{
    const all = LS.get('ratings', []).filter(r=>r.by===PAGE);
    if(!all.length){ body.appendChild(el('div',{style:'text-align:center;padding:30px;color:#6B7280'},'لم تقيّم أي طلب بعد')); return; }
    all.slice().reverse().forEach(r=>{
      body.appendChild(el('div',{style:'padding:12px;border-bottom:1px solid #E8EBF0'},
        el('div',{style:'font-weight:800'}, r.peer||('طلب #'+r.orderId)),
        el('div',{html:starsHTML(r.stars)}),
        r.comment ? el('div',{style:'color:#6B7280;margin-top:4px;font-size:13px'}, r.comment) : null
      ));
    });
  });
}

// ============== ربط أزرار "إنهاء الرحلة" تلقائياً ==============
function autoBindCompleteButtons(){
  document.querySelectorAll('button, [role=button]').forEach(b=>{
    if(b.dataset.adplWired) return;
    const txt = (b.textContent||'').trim();
    if(/اكتمال الرحلة|إنهاء الرحلة|اكتمل الطلب|تسليم الطلب|إنهاء الطلب/.test(txt)){
      b.dataset.adplWired='1';
      b.addEventListener('click', (e)=>{
        const orderId = b.dataset.orderId || (window.currentOrderId) || ('o'+Date.now());
        if(window.adplIsCompleted(orderId)){ toast('الرحلة مغلقة بالفعل','info'); e.preventDefault(); return; }
        // فتح تأكيد
        if(!confirm('تأكيد إنهاء الرحلة؟ بعد التأكيد لا يمكن التعديل عليها.')){ e.preventDefault(); return; }
        window.adplCloseOrder(orderId, 'الطرف الآخر', parseFloat(b.dataset.amount||'0'));
        // عطّل الزر
        b.disabled=true; b.style.opacity='.5'; b.textContent='تم الإنهاء ✓';
      }, true);
    }
    if(/إلغاء الطلب|إلغاء الرحلة|cancel order/i.test(txt)){
      b.dataset.adplWired='1';
      b.addEventListener('click', ()=>{
        const orderId = b.dataset.orderId || window.currentOrderId || ('o'+Date.now());
        recordCancellation(orderId, PAGE);
      });
    }
  });
}

// ============== تشغيل ==============
function init(){
  buildBell();
  buildChatUI();
  rideFixes();
  buildAdminFeatures();
  buildAccountTab();
  addEarningsTab();
  bindSearchInputs();
  autoBindCompleteButtons();
  pollBroadcasts();
  checkPendingOrders();
  // مراقبة دورية لإضافة عناصر جديدة
  setInterval(()=>{
    bindSearchInputs();
    autoBindCompleteButtons();
    refreshFavButtons();
    pollBroadcasts();
    checkPendingOrders();
    autoDismissOldAlerts();
  }, 2500);
  console.log('[ADPL Features] جاهز ✓ صفحة:', PAGE);
}

if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', init); }
else init();

})();
