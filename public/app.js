import * as D from './domain.js';
import * as V from './views.js';
import {createUpdater} from './updates.js';
import * as Store from './store.js';
const app=document.getElementById('app'),modal=document.getElementById('modal');
const preview=new URLSearchParams(location.search).get('preview')==='1';
const cacheKey=preview?'preview':'account';
let state=D.emptyState(),revision=0,csrf='',user=null,dirty=false,syncing=false,conflict=false,mutation=0,pendingPhotos=[],route=location.hash.slice(1)||'home',month=D.dateKey().slice(0,7),pushStatus='Mitteilungsstatus wird geprüft …',photoBusy=false,booted=false;
let pushEnabled=false,pushCheck=0;
function pushDisplay(){const label=document.getElementById('push-status');if(label)label.textContent=pushStatus;const activate=document.querySelector('[data-action=push]');if(activate)activate.hidden=pushEnabled;const deactivate=document.querySelector('[data-action=push-off]');if(deactivate)deactivate.hidden=!pushEnabled;}
async function refreshPushStatus(){
 const check=++pushCheck;let message,enabled=false;
 try{
  if(preview)message='Mitteilungen sind in der Vorschau nicht verfügbar.';
  else if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))message='Bitte Palle auf dem iPhone vom Home-Bildschirm öffnen.';
  else{const registration=await navigator.serviceWorker.getRegistration('./');const subscription=await registration?.pushManager.getSubscription();
   enabled=Notification.permission==='granted'&&!!subscription;
   if(enabled){message='Mitteilungen sind auf diesem Gerät aktiviert.';if(navigator.onLine&&user){try{if(!csrf){const session=await api('session');csrf=session.csrf;}await api('subscription',{method:'POST',body:JSON.stringify(subscription)});}catch{message='Auf diesem Gerät aktiviert. Serveranmeldung noch nicht bestätigt; bitte Verbindung oder Anmeldung prüfen.';}}else message='Auf diesem Gerät aktiviert · offline noch nicht mit dem Server geprüft.';}
   else message=Notification.permission==='denied'?'Mitteilungen sind in den Geräteeinstellungen blockiert.':'Mitteilungen sind auf diesem Gerät deaktiviert.';
  }
 }catch{message='Mitteilungsstatus konnte nicht geprüft werden. Bitte erneut öffnen.';}
 if(check===pushCheck){pushEnabled=enabled;pushStatus=message;pushDisplay();}
}
let updateStatus='Noch nicht nach Updates gesucht.',updateAvailable=false,updater;
function updateDisplay(){const status=document.getElementById('update-status');if(status)status.textContent=updateStatus;const button=document.querySelector('[data-action=apply-update]');if(button)button.hidden=!updateAvailable;}
let toastTimer,scanControls,scanGeneration=0,syncTimer;
const photoURLs=new Map();
const api=async(action,options={})=>{
 const headers={...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),'X-Palle-CSRF':csrf,...options.headers};
 const response=await fetch(`api.php?action=${action}`,{credentials:'same-origin',...options,headers});
 const data=await response.json().catch(()=>({error:'Serverantwort konnte nicht gelesen werden. Bitte PHP-Konfiguration prüfen.'}));
 if(!response.ok){const e=new Error(data.error||'Serveranfrage fehlgeschlagen.');e.status=response.status;throw e;}return data;
};
function toast(message,error=false){const el=document.getElementById('toast');el.textContent=message;el.style.background=error?'#4c262d':'#20463f';el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true;},6500);}
function setStatus(){const el=document.getElementById('sync-label');if(el)el.textContent=preview?'Lokal gespeichert':conflict?'Konflikt – bitte prüfen':syncing?'Synchronisiert …':dirty?'Lokal gesichert · ausstehend':navigator.onLine?'Auf Server gespeichert':'Offline · lokal verfügbar';}
async function saveLocal(){await Store.setCache(cacheKey,{state,revision,dirty,pendingPhotos,user});}
function queueSync(){clearTimeout(syncTimer);syncTimer=setTimeout(sync,500);}
let mutationQueue=Promise.resolve(),queuedMutations=0;
function commit(change,options={}){queuedMutations++;const run=mutationQueue.then(()=>performCommit(change,options)).finally(()=>{queuedMutations--;});mutationQueue=run.catch(()=>{});return run;}
async function performCommit(change,{redraw=true}={}){
 const next=structuredClone(state);change(next);
 await Store.setCache(cacheKey,{state:next,revision,dirty:true,pendingPhotos,user});
 state=next;dirty=true;mutation++;if(redraw)render();else setStatus();queueSync();
}
async function sync(){
 if(preview){dirty=false;await saveLocal();setStatus();return;}
 if(syncing||conflict||!dirty||!navigator.onLine||!user)return;
 syncing=true;setStatus();
 try{
  if(!csrf){const session=await api('session');csrf=session.csrf;user=session.user;}
  while(pendingPhotos.length){
   const photoId=pendingPhotos[0];
   const blob=await Store.getPhoto(photoId);if(!blob)throw new Error('Ein Foto fehlt im lokalen Speicher. Bitte die Dokumentation prüfen.');
   const form=new FormData();form.append('id',photoId);form.append('photo',blob,'photo.jpg');await api('photo',{method:'POST',body:form});
   pendingPhotos=pendingPhotos.filter(x=>x!==photoId);await saveLocal();
  }
  const version=mutation;const snapshot=structuredClone(state);
  const result=await api('state',{method:'PUT',body:JSON.stringify({revision,state:snapshot})});
  revision=result.revision;if(mutation===version&&queuedMutations===0)dirty=false;await saveLocal();
 }catch(e){
  if(e.status===409){conflict=true;render();toast('Auf einem anderen Gerät wurde etwas geändert. Deine lokale Arbeit bleibt erhalten.',true);}
  else if(e.status===401){csrf='';toast('Deine Anmeldung ist abgelaufen. Lokale Änderungen bleiben erhalten. Bitte erneut anmelden.',true);loginScreen('Bitte erneut anmelden, um die lokalen Änderungen zu synchronisieren.');}
  else toast('Lokal gespeichert. Synchronisierung noch offen: '+e.message,true);
 }finally{syncing=false;setStatus();if(dirty&&!conflict&&csrf&&navigator.onLine)syncTimer=setTimeout(sync,15000);}
}
function currentNav(){return {device:'devices',work:'home',task:'tasks',shift:'shifts'}[route.split('/')[0]]||route;}
function render(){
 app.innerHTML=`<div class="app-shell">${preview?'<div class="preview-banner">Lokale Vorschau · Daten nur in diesem Browser · keine Serveranmeldung</div>':''}<header class="topbar"><div><div class="brand">palle<span>.</span></div><div class="eyebrow">Dein Lagerkollege</div></div><div class="header-actions"><span class="sync-label" id="sync-label"></span><button class="ghost icon-button" data-route="settings" aria-label="Einstellungen">${V.icon('settings-2')}</button></div></header><main class="main">${conflict?'<div class="conflict"><strong>Auf dem Server gibt es neuere Änderungen.</strong><p>Deine lokale Fassung ist gesichert. Lade sie als Sicherung herunter, bevor du den Serverstand übernimmst.</p><div class="actions"><button data-action="backup">Lokale Sicherung</button><button data-action="resolve-conflict">Serverstand übernehmen</button></div></div>':''}${V.pageContent(route,state,{month,preview,pushStatus,pushEnabled,updateStatus,updateAvailable})}</main><nav class="bottom-nav" aria-label="Hauptnavigation">${[['home','house','Heute'],['devices','boxes','Geräte'],['tasks','list-checks','Aufgaben'],['shifts','clock-3','Arbeitszeit']].map(([key,icon,label])=>`<button data-route="${key}" ${currentNav()===key?'aria-current="page"':''}>${V.icon(icon)}${label}</button>`).join('')}</nav></div>`;
 if(route.startsWith('work/')){for(const key of ['camera-input','gallery-input'])document.getElementById(key).dataset.work=route.split('/')[1];}
 setStatus();pushDisplay();icons();hydratePhotos(app);
}
function icons(){globalThis.lucide?.createIcons();}
function go(next){if(photoBusy){toast('Bitte kurz warten, die Fotos werden noch gesichert.');return;}stopScan();route=next;location.hash=next;render();if(next==='settings')refreshPushStatus();window.scrollTo({top:0});}
function showModal(html){stopScan();modal.innerHTML=`<button class="close ghost" data-action="close-modal" aria-label="Schließen">${V.icon('x')}</button>${html}<p id="form-error" class="error" role="alert"></p>`;if(!modal.open)modal.showModal();icons();hydratePhotos(modal);}
function closeModal(){stopScan();modal.close();modal.innerHTML='';}
function stopScan(){scanGeneration++;scanControls?.stop();scanControls=null;modal.querySelectorAll('video').forEach(v=>{v.srcObject?.getTracks().forEach(t=>t.stop());v.srcObject=null;});}
modal.addEventListener('close',stopScan);
function formError(e){const target=modal.querySelector('#form-error');if(target)target.textContent=e.message;else toast(e.message,true);}
async function photoURL(photoId){
 if(photoURLs.has(photoId))return photoURLs.get(photoId);
 const blob=await Store.getPhoto(photoId);
 const url=blob?URL.createObjectURL(blob):preview?'':`api.php?action=photo&id=${encodeURIComponent(photoId)}`;
 if(blob)photoURLs.set(photoId,url);return url;
}
async function hydratePhotos(container){for(const img of container.querySelectorAll('[data-photo]')){try{const url=await photoURL(img.dataset.photo);if(url)img.src=url;else img.alt='Foto nicht lokal verfügbar';img.onerror=()=>{img.alt='Foto gerade nicht verfügbar';};}catch{img.alt='Foto nicht verfügbar';}}}
async function addPhotos(workId,files){
 if(!files.length)return;D.requireValue(!photoBusy,'Ein Foto wird bereits verarbeitet.');photoBusy=true;
 const ids=[];
 try{
  const w=state.works.find(w=>w.id===workId);D.requireValue(w?.status==='open','Die Dokumentation ist bereits abgeschlossen.');
  for(const [i,file] of [...files].entries()){
   toast(`Foto ${i+1} von ${files.length} wird gesichert …`);
   const blob=await Store.preparePhoto(file),photoId=D.id();await Store.putPhoto(photoId,blob);ids.push(photoId);
  }
  pendingPhotos.push(...ids);
  await commit(s=>D.addEvent(s.works.find(w=>w.id===workId),{photoIds:ids}));
  toast(`${ids.length} Foto(s) lokal gesichert. Die Dokumentation bleibt offen.`);
 }catch(e){
  if(ids.length){pendingPhotos.push(...ids.filter(x=>!pendingPhotos.includes(x)));try{await commit(s=>D.addEvent(s.works.find(w=>w.id===workId),{photoIds:ids}));}catch{toast('Speichern fehlgeschlagen. Bitte die Fotos erneut hinzufügen.',true);}}
  toast(e.message,true);
 }finally{photoBusy=false;}
}
async function startScanner(batch=false){
 const selection=batch?[...modal.querySelectorAll('[name=devices]:checked')].map(i=>i.value):[];
 const task=batch?state.tasks.find(t=>t.id===modal.querySelector('#start-form')?.dataset.task):null;
 const existingForm=batch?new FormData(modal.querySelector('#start-form')):null;
 showModal(`<h2>${batch?'Gerät dazuscannen':'Gerät scannen'}</h2><video id="scanner-video" autoplay muted playsinline></video><p class="muted" id="scan-status">Kamera startet …</p><form id="barcode-form"><label>Barcode alternativ eingeben<input name="barcode" required autocomplete="off" autofocus></label><button class="primary wide" type="submit">Gerät öffnen</button></form>`);
 const generation=scanGeneration;
 const found=async barcode=>{
  stopScan();const d=state.devices.find(d=>d.barcode===barcode.trim());
  if(batch){if(!d){toast('Unbekannter Barcode. Bitte das Gerät zuerst im Geräteverzeichnis anlegen.',true);showModal(V.startForm(state,selection,task));return;}
   showModal(V.startForm(state,[...new Set([...selection,d.id])],task));
   if(existingForm){modal.querySelector('[name=type]').value=existingForm.get('type');modal.querySelector('[name=template]').value=existingForm.get('template');}
   return;
  }
  if(d){closeModal();go('device/'+d.id);}else showModal(V.deviceForm({},barcode.trim()));
 };
 modal.querySelector('#barcode-form').addEventListener('submit',e=>{e.preventDefault();found(new FormData(e.target).get('barcode'));});
 try{
  D.requireValue(window.isSecureContext,'Die Kamera benötigt HTTPS. Alternativ kannst du den Barcode eingeben.');
  D.requireValue(globalThis.ZXingBrowser,'Barcode-Bibliothek konnte nicht geladen werden. Bitte die App neu laden.');
  const reader=new ZXingBrowser.BrowserMultiFormatReader();
  const controls=await reader.decodeFromConstraints({video:{facingMode:{ideal:'environment'}},audio:false},modal.querySelector('#scanner-video'),result=>{if(result&&scanGeneration===generation)found(result.getText());});
  if(scanGeneration!==generation){controls.stop();return;}scanControls=controls;
  modal.querySelector('#scan-status').textContent='Halte den Barcode ruhig und gut beleuchtet ins Bild.';
 }catch(e){const target=modal.querySelector('#scan-status');if(target)target.textContent='Kamera nicht verfügbar: '+e.message;}
}
async function enablePush(){
 ++pushCheck;
 D.requireValue(!preview,'Mitteilungen werden nach der Installation auf deinem Server verfügbar.');
 D.requireValue('serviceWorker' in navigator&&'PushManager' in window,'Bitte Palle auf dem iPhone zum Home-Bildschirm hinzufügen und von dort öffnen.');
 const permission=await Notification.requestPermission();D.requireValue(permission==='granted','Mitteilungen wurden nicht erlaubt. Bitte die iPhone-Einstellungen prüfen.');
 const registration=await navigator.serviceWorker.ready,info=await api('push-info');D.requireValue(info.publicKey,'Web-Push ist auf dem Server noch nicht eingerichtet.');
 let subscription=await registration.pushManager.getSubscription();
 if(!subscription){const padded=info.publicKey+'='.repeat((4-info.publicKey.length%4)%4);const raw=atob(padded.replaceAll('-','+').replaceAll('_','/'));subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(raw,c=>c.charCodeAt(0))});}
 await api('subscription',{method:'POST',body:JSON.stringify(subscription)});pushEnabled=true;pushStatus='Mitteilungen sind auf diesem Gerät aktiviert.';pushDisplay();toast(pushStatus);
}
async function testPush(){
 D.requireValue(!preview,'Die Vorschau verschickt keine Mitteilungen.');
 D.requireValue('serviceWorker' in navigator&&'PushManager' in window,'Bitte Palle vom Home-Bildschirm öffnen.');
 const registration=await navigator.serviceWorker.ready,subscription=await registration.pushManager.getSubscription();
 D.requireValue(subscription&&Notification.permission==='granted','Bitte zuerst Mitteilungen auf diesem Gerät aktivieren.');
 const result=await api('push-test',{method:'POST',body:JSON.stringify({endpoint:subscription.endpoint})});
 pushStatus=result.message;const label=document.getElementById('push-status');if(label)label.textContent=pushStatus;toast(pushStatus);
}
async function saveBeforeUpdate(){
 D.requireValue(!photoBusy&&!modal.open,'Bitte zuerst den offenen Dialog schließen und Fotoverarbeitung abwarten.');
 await draftWrite;await mutationQueue;
 D.requireValue(!queuedMutations&&!syncing,'Bitte kurz warten, Änderungen werden gespeichert oder synchronisiert.');
 await saveLocal();
}
async function disablePush(){
 ++pushCheck;
 D.requireValue(!preview,'Die Vorschau verschickt keine Mitteilungen.');
 const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();
 if(sub){await api('subscription',{method:'DELETE',body:JSON.stringify({endpoint:sub.endpoint})});await sub.unsubscribe();}
 pushEnabled=false;pushStatus='Mitteilungen sind auf diesem Gerät deaktiviert.';pushDisplay();
}
function download(name,data,mime){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:mime}));a.download=name;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);}
async function backup(){
 toast('Sicherung inklusive Fotos wird vorbereitet …');const ids=[...new Set([...state.devices.map(d=>d.photoId).filter(Boolean),...state.works.flatMap(w=>w.events.flatMap(e=>e.photoIds))])];const photos={};
 for(const photoId of ids){let blob=await Store.getPhoto(photoId);if(!blob&&!preview){const r=await fetch(`api.php?action=photo&id=${photoId}`);if(!r.ok)throw new Error('Ein Foto konnte nicht gesichert werden. Bitte die Verbindung prüfen.');blob=await r.blob();}
  if(!blob)throw new Error('Ein Foto fehlt. Die Sicherung wurde nicht vollständig erstellt.');
  photos[photoId]=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
 }
 download(`palle-sicherung-${D.dateKey()}.json`,JSON.stringify({format:'palle-backup-v1',exportedAt:D.iso(),state,photos},null,2),'application/json');toast('Sicherung wurde zum Herunterladen bereitgestellt.');
}
async function freshState(){
 D.requireValue(!preview,'Die lokale Vorschau hat keinen Serverstand.');
 D.requireValue(!syncing&&queuedMutations===0,'Bitte kurz warten, die lokale Speicherung oder Synchronisierung läuft noch.');
 if(dirty&&!confirm('Es gibt lokale Änderungen. Serverstand übernehmen und lokale Änderungen verwerfen? Bitte vorher eine Sicherung herunterladen.'))return;
 const remote=await api('state');state=remote.state;revision=remote.revision;dirty=false;conflict=false;pendingPhotos=[];await saveLocal();render();
}
async function action(name,entity,button){
 switch(name){
 case 'close-modal':if(!photoBusy)closeModal();return;
 case 'clock-in':await commit(s=>D.clockIn(s));toast('Schicht gestartet. Palle ist dabei.');return;
 case 'pause':await commit(s=>D.togglePause(s));return;
 case 'clock-out':await commit(s=>D.clockOut(s));toast('Schicht beendet. Ab in den Feierabend.');return;
 case 'new-device':showModal(V.deviceForm());return;
 case 'edit-device':showModal(V.deviceForm(state.devices.find(d=>d.id===entity)));return;
 case 'scan':await startScanner();return;
 case 'batch-scan':await startScanner(true);return;
 case 'start-work':showModal(V.startForm(state,[entity]));return;
 case 'batch':showModal(V.startForm(state));return;
 case 'task-start':{const t=state.tasks.find(t=>t.id===entity);showModal(V.startForm(state,t.deviceId?[t.deviceId]:[],t));return;}
 case 'add-note':{const text=document.getElementById('work-draft').value;await commit(s=>{const w=s.works.find(w=>w.id===entity);D.addEvent(w,{text});w.draftText='';});toast('Arbeitsschritt gesichert.');return;}
 case 'camera':document.getElementById('camera-input').dataset.work=entity;document.getElementById('camera-input').click();return;
 case 'gallery':document.getElementById('gallery-input').dataset.work=entity;document.getElementById('gallery-input').click();return;
 case 'check-result':await commit(s=>{const w=s.works.find(w=>w.id===entity);D.requireValue(w.status==='open','Dokumentation ist abgeschlossen.');w.checklist[Number(button.dataset.index)].result=button.dataset.value;});return;
 case 'finish-work':D.requireValue(!photoBusy,'Bitte warten, bis alle Fotos gespeichert sind.');showModal(V.finishForm(state.works.find(w=>w.id===entity)));return;
 case 'work-meta':showModal(V.workMetaForm(state,state.works.find(w=>w.id===entity)));return;
 case 'view-photo':{const url=await photoURL(entity);showModal(`<h2>Dokumentationsfoto</h2><img class="photo-view" src="${V.esc(url)}" alt="Dokumentationsfoto in voller Ansicht">`);return;}
 case 'new-task':showModal(V.taskForm(state,{},entity));return;
 case 'edit-task':showModal(V.taskForm(state,state.tasks.find(t=>t.id===entity)));return;
 case 'new-template':showModal(V.templateForm());return;
 case 'edit-template':showModal(V.templateForm(state.templates.find(t=>t.id===entity)));return;
 case 'new-shift':showModal(V.shiftForm());return;
 case 'edit-shift':showModal(V.shiftForm(state.shifts.find(s=>s.id===entity)));return;
 case 'add-pause-fields':modal.querySelector('#pause-fields').insertAdjacentHTML('beforeend',V.pauseFields());return;
 case 'remove-pause-fields':button.closest('.pause-fields').remove();return;
 case 'csv':download(`palle-stunden-${month}.csv`,D.shiftsCsv(state,month),'text/csv;charset=utf-8');return;
 case 'print':window.print();return;
 case 'push':await enablePush();return;
 case 'push-test':await testPush();return;
 case 'check-update':D.requireValue(updater,'Updates gibt es in der installierten App.');await updater.check();return;
 case 'apply-update':await updater.apply(saveBeforeUpdate);return;
 case 'push-off':await disablePush();return;
 case 'backup':await backup();return;
 case 'refresh':case 'resolve-conflict':await freshState();return;
 case 'logout':
  D.requireValue(!dirty&&!syncing&&!queuedMutations&&!pendingPhotos.length,'Bitte zuerst die ausstehenden Änderungen synchronisieren.');
  if(!preview)await api('logout',{method:'POST',body:'{}'});await Store.clearStore();photoURLs.forEach(url=>URL.revokeObjectURL(url));photoURLs.clear();user=null;loginScreen();return;
 }
}
document.addEventListener('click',async e=>{
 const button=e.target.closest('button');if(!button)return;
 if(button.dataset.route){go(button.dataset.route);return;}
 if(!button.dataset.action)return;e.preventDefault();if(button.disabled)return;
 button.disabled=true;try{await action(button.dataset.action,button.dataset.id,button);}catch(e){formError(e);}finally{button.disabled=false;}
});
document.addEventListener('change',async e=>{
 const t=e.target;
 try{
  if(t.id==='camera-input'||t.id==='gallery-input'){await addPhotos(t.dataset.work,[...t.files]);t.value='';}
  else if(t.id==='category-filter'||t.id==='condition-filter')filterDevices();
  else if(t.id==='month-select'){month=t.value;render();}
 }catch(e){toast(e.message,true);}
});
let draftWrite=Promise.resolve();
document.addEventListener('input',e=>{
 const t=e.target;if(t.id==='device-search'){filterDevices();return;}
 if(t.id==='work-draft'||t.dataset.checkNote!==undefined){const value=t.value,workId=t.dataset.work,index=t.dataset.checkNote;
  draftWrite=draftWrite.then(()=>commit(s=>{const w=s.works.find(w=>w.id===workId);if(w?.status!=='open')return;if(index!==undefined)w.checklist[Number(index)].note=value;else w.draftText=value;},{redraw:false})).then(()=>{const target=document.getElementById('draft-status');if(target)target.textContent='Entwurf auf diesem Gerät gesichert.';}).catch(e=>toast('Entwurf konnte nicht gesichert werden: '+e.message,true));
 }
});
function filterDevices(){const q=(document.getElementById('device-search')?.value||'').toLowerCase(),category=document.getElementById('category-filter')?.value,condition=document.getElementById('condition-filter')?.value;document.getElementById('device-list').innerHTML=state.devices.filter(d=>(!category||d.category===category)&&(!condition||d.condition===condition)&&`${d.name} ${d.barcode} ${d.location} ${d.manufacturer} ${d.inventory}`.toLowerCase().includes(q)).map(d=>V.deviceRow(d)).join('')||'<p class="empty">Kein Gerät gefunden.</p>';}
document.addEventListener('submit',async e=>{
 if(e.target.id==='barcode-form')return;e.preventDefault();const form=e.target,values=new FormData(form),entity=form.dataset.id;const button=form.querySelector('[type=submit]');if(button)button.disabled=true;
 try{
  await draftWrite;
  if(form.id==='login-form'){await login(values.get('username'),values.get('password'));return;}
  if(form.id==='device-form'){
   let photoId;const file=values.get('photo');if(file?.size){photoId=D.id();await Store.putPhoto(photoId,await Store.preparePhoto(file));pendingPhotos.push(photoId);}
   let d;await commit(s=>{d=D.saveDevice(s,Object.fromEntries(values),entity||undefined);if(photoId)d.photoId=photoId;});closeModal();go('device/'+d.id);
  }else if(form.id==='start-form'){
   let w;await commit(s=>{w=D.startWork(s,{deviceIds:values.getAll('devices'),type:values.get('type'),templateId:values.get('template'),taskId:form.dataset.task||null});});closeModal();go('work/'+w.id);
  }else if(form.id==='finish-form'){
   await commit(s=>{const w=s.works.find(w=>w.id===entity);if(w.draftText?.trim()){D.addEvent(w,{text:w.draftText});w.draftText='';}D.completeWork(s,entity,Object.fromEntries(values));});closeModal();toast('Dokumentation abgeschlossen. Saubere Arbeit.');
  }else if(form.id==='task-form'){
   await commit(s=>{D.requireValue(!values.get('deviceId')||s.devices.some(d=>d.id===values.get('deviceId')),'Bitte ein Gerät wählen.');D.requireValue(values.get('title').trim(),'Bitte einen Titel eingeben.');const t={id:entity||D.id(),title:values.get('title').trim(),deviceId:values.get('deviceId')||null,type:values.get('type'),due:values.get('due'),repeatDays:Number(values.get('repeatDays')),notes:values.get('notes'),completedAt:null};const old=s.tasks.find(t=>t.id===entity);if(old)Object.assign(old,t);else s.tasks.push(t);});closeModal();
  }else if(form.id==='template-form'){
   await commit(s=>{const items=values.get('items').split('\n').map(s=>s.trim()).filter(Boolean);D.requireValue(items.length,'Bitte mindestens einen Prüfpunkt eingeben.');const t={id:entity||D.id(),name:values.get('name').trim(),category:values.get('category'),items};const old=s.templates.find(t=>t.id===entity);if(old)Object.assign(old,t);else s.templates.push(t);});closeModal();
  }else if(form.id==='shift-form'){
   await commit(s=>{const starts=values.getAll('pauseStart'),ends=values.getAll('pauseEnd');const shift={id:entity||D.id(),start:new Date(values.get('start')).toISOString(),end:values.get('end')?new Date(values.get('end')).toISOString():null,pauses:starts.map((start,i)=>({start:new Date(start).toISOString(),end:ends[i]?new Date(ends[i]).toISOString():null}))};D.validateShift(s,shift);const old=s.shifts.find(s=>s.id===entity);if(old)Object.assign(old,shift);else s.shifts.push(shift);});closeModal();
  }else if(form.id==='work-meta-form'){
   await commit(s=>{const w=s.works.find(w=>w.id===entity),start=new Date(values.get('startedAt')).toISOString(),end=values.get('completedAt')?new Date(values.get('completedAt')).toISOString():null;D.requireValue(!end||Date.parse(end)>=Date.parse(start),'Der Abschluss muss nach dem Beginn liegen.');w.startedAt=start;if(end)w.completedAt=end;w.shiftId=values.get('shiftId')||null;});closeModal();
  }
 }catch(e){if(form.id==='login-form'){document.getElementById('login-error').textContent=e.message;}else formError(e);}finally{if(button)button.disabled=false;}
});
function loginScreen(message=''){
 booted=false;app.innerHTML=`<main class="login"><img src="assets/palle.png" alt="Palle"><h1>Dein Lagerkollege.</h1><p class="muted" style="text-align:center">Geräte, Arbeiten und Arbeitszeiten an einem Platz.</p><form id="login-form"><label>Benutzername<input name="username" autocomplete="username" required></label><label>Passwort<input name="password" type="password" autocomplete="current-password" required></label><p class="error login-status" id="login-error" role="alert">${V.esc(message)}</p><button type="submit" class="primary wide">Anmelden</button></form></main>`;
}
async function login(username,password){
 const session=await api('login',{method:'POST',body:JSON.stringify({username,password})});csrf=session.csrf;user=session.user;
 const cached=await Store.getCache(cacheKey);
 if(cached?.dirty&&cached.user?.id===user.id){state=cached.state;revision=cached.revision;pendingPhotos=cached.pendingPhotos||[];dirty=true;}
 else{const remote=await api('state');state=remote.state;revision=remote.revision;dirty=false;pendingPhotos=[];}
 booted=true;await saveLocal();render();refreshPushStatus();queueSync();
}
async function boot(){
 try{
  await Store.openStore();const cached=await Store.getCache(cacheKey);
  if(preview){state=cached?.state||D.emptyState();user={id:'preview',name:'Lokale Vorschau'};pendingPhotos=cached?.pendingPhotos||[];dirty=false;booted=true;await saveLocal();render();return;}
  let session;
  try{session=await api('session');}catch(e){
   if(e.status===401){loginScreen();return;}
   if(!e.status&&cached?.user){state=cached.state;revision=cached.revision;dirty=cached.dirty;pendingPhotos=cached.pendingPhotos||[];user=cached.user;booted=true;render();refreshPushStatus();toast('Offline gestartet. Änderungen werden lokal gesichert.');return;}
   loginScreen(e.message);return;
  }
  csrf=session.csrf;user=session.user;
  if(cached?.dirty&&cached.user?.id===user.id){state=cached.state;revision=cached.revision;dirty=true;pendingPhotos=cached.pendingPhotos||[];}
  else{const remote=await api('state');state=remote.state;revision=remote.revision;}
  booted=true;await saveLocal();render();refreshPushStatus();queueSync();
 }catch(e){app.innerHTML=`<main class="login"><h1>Speichern nicht möglich.</h1><p>${V.esc(e.message)}</p><p class="muted">Bitte privaten Browsermodus beenden oder Speicherplatz freigeben und Palle neu öffnen.</p></main>`;}
}
window.addEventListener('hashchange',()=>{if(booted){route=location.hash.slice(1)||'home';render();}});
async function refreshIfClean(){if(preview||!user||dirty||syncing||queuedMutations||modal.open||document.hidden)return;const version=mutation;try{const session=await api('session');csrf=session.csrf;const remote=await api('state');if(!dirty&&queuedMutations===0&&mutation===version&&remote.revision!==revision){state=remote.state;revision=remote.revision;await saveLocal();render();}}catch{}}
window.addEventListener('online',()=>{setStatus();queueSync();refreshIfClean();refreshPushStatus();});window.addEventListener('offline',setStatus);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){setStatus();queueSync();refreshIfClean();refreshPushStatus();}});
setInterval(()=>{if(!booted)return;document.querySelectorAll('[data-timer]').forEach(el=>{const s=state.shifts.find(s=>s.id===el.dataset.timer);if(s)el.innerHTML=V.duration(D.shiftMilliseconds(s))+' <small class="muted">Std.</small>';});},1000);
if(!preview){updater=createUpdater({onStatus:text=>{updateStatus=text;updateDisplay();},onAvailable:value=>{updateAvailable=value;updateDisplay();}});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)updater.check().catch(()=>{});});}
boot();
