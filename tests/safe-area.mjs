import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const origin='http://127.0.0.1:4175';
const server=spawn(process.execPath,['scripts/preview.mjs'],{env:{...process.env,PORT:'4175'},stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Preview exited: '+code)));});
const browser=await chromium.launch({headless:true});let failure;
try{
 for(const layout of [{name:'iphone-portrait',width:393,height:852,top:59,right:0,bottom:34,left:0},{name:'small-phone',width:320,height:740,top:59,right:0,bottom:34,left:0},{name:'iphone-landscape',width:852,height:393,top:0,right:59,bottom:21,left:59},{name:'desktop',width:1280,height:900,top:0,right:0,bottom:0,left:0}]){
  const context=await browser.newContext({viewport:{width:layout.width,height:layout.height},isMobile:layout.width<1000,hasTouch:layout.width<1000});const page=await context.newPage();
  await page.goto(origin+'/?preview=1');await page.getByRole('heading',{name:'Alles im Blick.'}).waitFor();await page.addStyleTag({content:'.preview-banner{display:none!important}'});
  await page.evaluate(layout=>{for(const key of ['top','right','bottom','left'])document.documentElement.style.setProperty('--safe-'+key,layout[key]+'px');if(layout.top){const status=document.createElement('div');status.id='simulated-status-bar';status.style.cssText=`position:fixed;inset:0 0 auto;height:${layout.top}px;z-index:999;background:#0c1421aa;backdrop-filter:blur(12px);pointer-events:auto`;document.body.append(status);}},layout);
  const settings=page.getByRole('button',{name:'Einstellungen',exact:true});const box=await settings.evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});assert.ok(box.y>=layout.top,layout.name+': settings overlap status bar');assert.ok(box.x>=layout.left&&box.x+box.width<=layout.width-layout.right,layout.name+': settings outside horizontal safe area');
  await settings.click();await page.getByRole('heading',{name:'Palles Werkzeugkasten'}).waitFor();
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));const scrolled=await settings.evaluate(el=>{const r=el.getBoundingClientRect();return {y:r.y,height:r.height};});assert.ok(scrolled.y>=layout.top&&scrolled.y+scrolled.height<layout.height-layout.bottom,layout.name+': sticky settings inaccessible');await settings.click();
  await page.getByRole('button',{name:'Prüfliste anlegen',exact:true}).click();await page.locator('dialog[open]').waitFor();const dialog=await page.locator('dialog[open]').evaluate(el=>{const r=el.getBoundingClientRect();return {y:r.y,height:r.height};});assert.ok(dialog.y>=layout.top-1&&dialog.y+dialog.height<=layout.height-layout.bottom+1,layout.name+': dialog outside safe area');await page.getByRole('button',{name:'Schließen',exact:true}).click();
  await page.getByRole('button',{name:'Heute',exact:true}).click();await page.evaluate(()=>scrollTo(0,0));
  if(layout.width<1000){const button=await page.getByRole('button',{name:'Heute',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return {y:r.y,height:r.height};});assert.ok(button.y+button.height<=layout.height-layout.bottom,layout.name+': nav intersects home indicator');}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,layout.name+': horizontal overflow');
  await page.screenshot({path:'work/safe-area-'+layout.name+'.png',fullPage:false});
  console.log('PASS '+layout.name+': settings clickable, sticky header, safe dialog, safe navigation, no overflow');await context.close();
 }
}catch(e){failure=e;console.error(e);}finally{await browser.close();server.kill();}process.exit(failure?1:0);
