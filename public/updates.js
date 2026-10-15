// Updates stay waiting until the user has saved their current work.
export function createUpdater({onStatus,onAvailable}){
 let registration,available=false;
 const status=text=>onStatus(text);
 const inspect=()=>{available=!!registration?.waiting;onAvailable(available);if(available)status('Neue Version bereit. Du kannst sie jetzt laden.');};
 function watch(worker){if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='installed')inspect();if(worker.state==='redundant')status('Update konnte nicht geladen werden. Bitte erneut versuchen.');});}
 async function init(){
  if(!('serviceWorker' in navigator))throw Error('App-Updates werden von diesem Browser nicht unterstützt.');
  registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
  registration.addEventListener('updatefound',()=>watch(registration.installing));watch(registration.installing);inspect();
  if(!available)status('Palle ist bereit für die Updatesuche.');
  return registration;
 }
 let ready;
 function ensureReady(){if(!ready)ready=init().catch(error=>{ready=null;throw error;});return ready;}
 ensureReady().catch(()=>status('Updatesuche derzeit nicht erreichbar.'));
 async function check(){
  if(!navigator.onLine)throw Error('Für die Updatesuche brauchst du eine Internetverbindung.');
  status('Suche nach einer neuen Version …');await ensureReady();await registration.update();
  const worker=registration.installing;
  if(worker)await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>finish(Error('Update dauert länger. Bitte gleich erneut prüfen.')),20000);function finish(error){clearTimeout(timeout);worker.removeEventListener('statechange',changed);error?reject(error):resolve();}function changed(){if(worker.state==='installed'||worker.state==='activated')finish();else if(worker.state==='redundant')finish(Error('Update konnte nicht geladen werden.'));}worker.addEventListener('statechange',changed);changed();});
  inspect();if(!available)status('Palle ist auf dem neuesten Stand.');
 }
 async function apply(beforeReload){
  await ensureReady();inspect();if(!registration.waiting)throw Error('Keine neue Version bereit. Bitte zuerst nach Updates suchen.');
  await beforeReload();status('Neue Version wird geladen …');
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>finish(Error('Aktualisierung dauert länger. Bitte Palle schließen und neu öffnen.')),15000);function finish(error){clearTimeout(timeout);navigator.serviceWorker.removeEventListener('controllerchange',changed);error?reject(error):resolve();}function changed(){finish();}navigator.serviceWorker.addEventListener('controllerchange',changed);registration.waiting.postMessage({type:'SKIP_WAITING'});});
  location.reload();
 }
 return {check:async()=>{try{await check();}catch(e){status(e.message);throw e;}},apply:async beforeReload=>{try{await apply(beforeReload);}catch(e){status(e.message);throw e;}}};
}
