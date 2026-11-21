const CACHE = 'jot-v37';
const ASSETS = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-180.png'];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method !== 'GET') return;
  if(!req.url.startsWith(self.location.origin)) return;
  // The page itself: network first, so a new version shows the first time you
  // open it after deploying. Falls back to the saved copy when offline.
  if(req.mode === 'navigate' || req.destination === 'document'){
    e.respondWith(
      fetch(req).then(res=>{
        if(res && res.ok){ const c = res.clone(); caches.open(CACHE).then(k=>k.put(req, c)); }
        return res;
      }).catch(()=> caches.match(req).then(h=> h || caches.match('./index.html')))
    );
    return;
  }
  // Icons and the rest: from the cache, fast and offline.
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res=>{
      if(res && res.ok){ const c = res.clone(); caches.open(CACHE).then(k=>k.put(req,c)); }
      return res;
    }).catch(()=> hit || Response.error()))
  );
});

// ---------------------------------------------------------------------
// Notifications. The buzz from Jot's helper carries only a note id; the
// words are looked up here, from the copy Jot keeps for exactly this.
// iPhone expects every buzz to show something, so a note that has gone
// still shows a plain "Jot reminder".
// ---------------------------------------------------------------------
function remLookup(id){
  return new Promise(res=>{
    try{
      const rq = indexedDB.open('jot-rem', 1);
      rq.onupgradeneeded = ()=> rq.result.createObjectStore('r');
      rq.onerror = ()=> res(null);
      rq.onsuccess = ()=>{
        const db = rq.result;
        try{
          const g = db.transaction('r', 'readonly').objectStore('r').get(id);
          g.onsuccess = ()=>{ db.close(); res(g.result || null); };
          g.onerror = ()=>{ db.close(); res(null); };
        }catch(e){ db.close(); res(null); }
      };
    }catch(e){ res(null); }
  });
}
self.addEventListener('push', e=>{
  let d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(x){}
  e.waitUntil((async ()=>{
    if(d.kind === 'test'){
      return self.registration.showNotification('Jot notifications are on', {
        body: 'This is what a reminder will look like.', tag: 'jot-test', icon: 'icon-192.png'
      });
    }
    const r = d.id ? await remLookup(d.id) : null;
    return self.registration.showNotification(r ? r.text : 'Jot reminder', {
      body: r ? r.body : 'Open Jot to see it',
      tag: 'jot-' + (d.id || 'reminder'),
      icon: 'icon-192.png',
      data: {id: d.id || null}
    });
  })());
});
self.addEventListener('notificationclick', e=>{
  e.notification.close();
  const id = e.notification.data && e.notification.data.id;
  e.waitUntil((async ()=>{
    const wins = await clients.matchAll({type:'window', includeUncontrolled:true});
    for(const c of wins){
      if(id) c.postMessage({open:id});
      if('focus' in c) return c.focus();
    }
    return clients.openWindow('./' + (id ? '?note=' + encodeURIComponent(id) : ''));
  })());
});
