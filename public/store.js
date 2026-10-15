let db;
export async function openStore(){
 if(db)return db;
 db=await new Promise((resolve,reject)=>{const r=indexedDB.open('palle-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('cache');r.result.createObjectStore('photos');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return db;
}
async function tx(store,mode,operation){const d=await openStore();return new Promise((resolve,reject)=>{const t=d.transaction(store,mode);const r=operation(t.objectStore(store));t.oncomplete=()=>resolve(r?.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('Lokales Speichern fehlgeschlagen.'));});}
export const getCache=key=>tx('cache','readonly',s=>s.get(key));
export const setCache=(key,value)=>tx('cache','readwrite',s=>s.put(value,key));
export const putPhoto=(key,blob)=>tx('photos','readwrite',s=>s.put(blob,key));
export const getPhoto=key=>tx('photos','readonly',s=>s.get(key));
export const removePhoto=key=>tx('photos','readwrite',s=>s.delete(key));
export async function clearStore(){await tx('cache','readwrite',s=>s.clear());await tx('photos','readwrite',s=>s.clear());}
export async function preparePhoto(file){
 if(file.size>30*1024*1024)throw new Error('Das Foto ist größer als 30 MB. Bitte eine kleinere Datei wählen.');
 const url=URL.createObjectURL(file);const img=new Image();
 try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Dieses Bildformat kann nicht gelesen werden. Bitte JPEG, PNG oder WebP wählen.'));img.src=url;});
 const scale=Math.min(1,2048/Math.max(img.naturalWidth,img.naturalHeight));
 const canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.86));if(!blob)throw new Error('Foto konnte nicht verarbeitet werden.');return blob;
 }finally{URL.revokeObjectURL(url);}
}
