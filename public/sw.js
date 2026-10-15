const CACHE='palle-shell-v4';
const FILES=['./','./index.html','./app.css','./app.js','./domain.js','./store.js','./views.js','./updates.js','./manifest.webmanifest','./assets/palle.png','./assets/icon-192.png','./assets/icon-512.png','./vendor/lucide.min.js','./vendor/zxing.min.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(url=>new Request(url,{cache:'reload'}))))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('palle-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')event.waitUntil(self.skipWaiting());});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.endsWith('.php'))return;
 if(event.request.mode==='navigate'){event.respondWith(caches.match('./index.html').then(cached=>cached||fetch(event.request)));return;}
 event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
self.addEventListener('push',event=>{
 let data={title:'Palle',body:'Im Lager gibt es etwas zu erledigen.',url:'./'};
 try{Object.assign(data,event.data.json());}catch{}
 event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:'./assets/icon-192.png',badge:'./assets/icon-192.png',tag:data.tag||'palle',data:{url:data.url}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const target=new URL(event.notification.data?.url||'./',self.registration.scope);if(target.origin!==self.location.origin)return;
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{const client=windows.find(w=>w.url.startsWith(self.registration.scope));if(client){await client.navigate(target.href);return client.focus();}return clients.openWindow(target.href);}));
});
