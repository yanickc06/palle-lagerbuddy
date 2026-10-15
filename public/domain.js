export const CATEGORIES = ['Licht','Ton','Video','Rigging','Strom','Zubehör','Specialeffects'];
export const ACTIVITIES = ['Funktionsprüfung','Reinigung','Reparatur','Wartung','Aufladen','Sonstiges'];
export const CONDITIONS = ['Einsatzbereit','Prüfung offen','Defekt','In Reparatur','Außer Betrieb'];
export const id = () => crypto.randomUUID();
export const iso = () => new Date().toISOString();
export const emptyState = () => ({devices:[],works:[],tasks:[],shifts:[],templates:[]});
export function requireValue(value,message){if(!value)throw new Error(message);}
export function dateKey(value=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
export function addDays(date,days){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+Number(days));return d.toISOString().slice(0,10);}
export function currentShift(state){return state.shifts.find(s=>!s.end)||null;}
export function shiftAt(state,at){const t=Date.parse(at);return state.shifts.find(s=>Date.parse(s.start)<=t&&(!s.end||t<=Date.parse(s.end)))?.id||null;}
export function shiftMilliseconds(shift,now=Date.now()){
 const end=shift.end?Date.parse(shift.end):now,start=Date.parse(shift.start);
 const pause=(shift.pauses||[]).reduce((sum,p)=>sum+Math.max(0,Math.min(end,p.end?Date.parse(p.end):end)-Math.max(start,Date.parse(p.start))),0);
 return Math.max(0,end-start-pause);
}
export function validateShift(state,shift){
 const start=Date.parse(shift.start),end=shift.end?Date.parse(shift.end):Infinity;
 requireValue(Number.isFinite(start)&&end>start,'Das Schichtende muss nach dem Beginn liegen.');
 requireValue(start<=Date.now()+60000,'Eine Schicht kann nicht in der Zukunft beginnen.');
 requireValue(!shift.end||end<=Date.now()+60000,'Das Schichtende darf nicht in der Zukunft liegen.');
 let previous=start;
 for(const [i,p] of (shift.pauses||[]).entries()){
  const ps=Date.parse(p.start),pe=p.end?Date.parse(p.end):end;
  requireValue(Number.isFinite(ps)&&ps>=previous&&ps>=start&&pe>ps&&pe<=end,'Pausen müssen innerhalb der Schicht liegen und dürfen sich nicht überschneiden.');
  requireValue(p.end||(!shift.end&&i===shift.pauses.length-1),'Nur die letzte Pause einer laufenden Schicht darf offen sein.');
  previous=pe;
 }
 requireValue(!state.shifts.some(s=>s.id!==shift.id&&start<(s.end?Date.parse(s.end):Infinity)&&Date.parse(s.start)<end),'Die Schicht überschneidet sich mit einer anderen Schicht.');
}
export function clockIn(state,at=iso()){requireValue(!currentShift(state),'Es läuft bereits eine Schicht.');const s={id:id(),start:at,end:null,pauses:[]};validateShift(state,s);state.shifts.push(s);return s;}
export function togglePause(state,at=iso()){
 const s=currentShift(state);requireValue(s,'Bitte zuerst einstempeln.');const p=s.pauses.at(-1);
 if(p&&!p.end)p.end=at;else s.pauses.push({start:at,end:null});
 return s;
}
export function clockOut(state,at=iso()){
 const s=currentShift(state);requireValue(s,'Es läuft keine Schicht.');
 if(s.pauses.at(-1)&&!s.pauses.at(-1).end)s.pauses.at(-1).end=at;s.end=at;validateShift(state,s);return s;
}
export function saveDevice(state,values,deviceId=id()){
 const barcode=String(values.barcode||'').trim(),name=String(values.name||'').trim();
 requireValue(barcode&&name,'Bezeichnung und Barcode fehlen.');
 requireValue(CATEGORIES.includes(values.category),'Bitte eine Kategorie wählen.');
 requireValue(!state.devices.some(d=>d.id!==deviceId&&d.barcode===barcode),'Dieser Barcode gehört bereits zu einem Gerät.');
 const existing=state.devices.find(d=>d.id===deviceId);
 const d={...existing,id:deviceId,name,barcode,category:values.category,manufacturer:values.manufacturer||'',inventory:values.inventory||'',location:values.location||'',condition:values.condition||'Prüfung offen',photoId:existing?.photoId||null};
 if(existing)Object.assign(existing,d);else state.devices.push(d);return d;
}
export function startWork(state,{deviceIds,type,templateId=null,taskId=null,at=iso()}){
 requireValue(deviceIds.length&&deviceIds.every(x=>state.devices.some(d=>d.id===x)),'Bitte mindestens ein Gerät wählen.');
 requireValue(ACTIVITIES.includes(type),'Bitte eine Tätigkeit wählen.');
 const template=state.templates.find(t=>t.id===templateId);
 const w={id:id(),deviceIds:[...new Set(deviceIds)],type,status:'open',startedAt:at,completedAt:null,shiftId:shiftAt(state,at),taskId,events:[],checklist:template?template.items.map(label=>({label,result:'',note:''})):[],result:null};
 state.works.push(w);return w;
}
export function addEvent(work,{text='',photoIds=[],at=iso()}){
 requireValue(work.status==='open','Diese Dokumentation ist bereits abgeschlossen.');
 requireValue(text.trim()||photoIds.length,'Bitte eine Notiz oder mindestens ein Foto hinzufügen.');
 const event={id:id(),at,text:text.trim(),photoIds:[...photoIds]};work.events.push(event);return event;
}
export function completeWork(state,workId,{result,condition,at=iso()}){
 const w=state.works.find(w=>w.id===workId);requireValue(w?.status==='open','Diese Dokumentation ist nicht mehr offen.');
 requireValue(CONDITIONS.includes(condition),'Bitte den Gerätezustand bestätigen.');
 requireValue(['In Ordnung','Fehler festgestellt','Nicht bewertet'].includes(result),'Bitte ein Ergebnis wählen.');
 requireValue(w.checklist.every(p=>['ok','fail','na'].includes(p.result)),'Bitte alle Prüfpunkte bewerten.');
 requireValue(Date.parse(at)>=Date.parse(w.startedAt),'Der Abschluss muss nach dem Beginn liegen.');
 if(w.checklist.some(p=>p.result==='fail'))requireValue(result==='Fehler festgestellt','Mindestens ein Prüfpunkt hat einen Fehler. Bitte das Ergebnis entsprechend setzen.');
 w.status='completed';w.completedAt=at;w.result=result;
 w.deviceIds.forEach(x=>{state.devices.find(d=>d.id===x).condition=condition;});
 const t=state.tasks.find(t=>t.id===w.taskId);
 if(t&&!t.completedAt){t.completedAt=at;if(Number(t.repeatDays)>0)state.tasks.push({...t,id:id(),completedAt:null,due:addDays(dateKey(at),t.repeatDays)});}
 return w;
}
export function csvCell(value){let v=String(value??'');if(/^[\s]*[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"';}
export function shiftsCsv(state,month){
 const rows=[['Datum','Kommen','Gehen','Pause (Minuten)','Netto (Stunden)','Erledigte Arbeiten']];
 const fmt=x=>new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'}).format(new Date(x));
 state.shifts.filter(s=>dateKey(s.start).startsWith(month)).sort((a,b)=>a.start.localeCompare(b.start)).forEach(s=>{
  const end=s.end?Date.parse(s.end):Date.now();const paused=(end-Date.parse(s.start)-shiftMilliseconds(s,end))/60000;
  const works=state.works.filter(w=>w.shiftId===s.id).map(w=>`${w.type} (${w.status==='completed'?'abgeschlossen':'offen'}): ${w.deviceIds.map(x=>state.devices.find(d=>d.id===x)?.name||'Gerät').join(', ')}`).join(' | ');
  rows.push([dateKey(s.start),fmt(s.start),s.end?fmt(s.end):'Offen',Math.round(paused), (shiftMilliseconds(s,end)/3600000).toFixed(2).replace('.',','),works]);
 });return '\ufeff'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n');
}
