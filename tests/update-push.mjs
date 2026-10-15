import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createPHPServer} from './php-server.mjs';
const service=await createPHPServer(4176),root=path.resolve('work/test-server');
const browser=await chromium.launch({headless:true});const context=await browser.newContext({permissions:['notifications'],viewport:{width:393,height:852}}),page=await context.newPage();let failure;
try{
 const noAuth=await context.request.post(service.url+'/api.php?action=push-test',{data:{endpoint:'https://fcm.googleapis.com/test'}});assert.equal(noAuth.status(),401);
 await page.goto(service.url);await page.getByLabel('Benutzername').fill('test-user');await page.getByLabel('Passwort',{exact:true}).fill('TestOnly-12-password');await page.getByRole('button',{name:'Anmelden',exact:true}).click();await page.getByRole('heading',{name:'Alles im Blick.'}).waitFor();
 await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await page.reload();await page.getByRole('button',{name:'Einstellungen',exact:true}).click();
 await page.getByRole('button',{name:'Nach neuer Version suchen',exact:true}).click();await page.getByText('Palle ist auf dem neuesten Stand.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Testnachricht senden',exact:true}).click();await page.getByText('Bitte zuerst Mitteilungen auf diesem Gerät aktivieren.',{exact:true}).waitFor();
 const session=await (await context.request.get(service.url+'/api.php?action=session')).json();const headers={'X-Palle-CSRF':session.csrf};const endpoint='https://fcm.googleapis.com/palle-test';
 const subscription={endpoint,keys:{auth:'test-auth',p256dh:'test-key'}};
 assert.equal((await context.request.post(service.url+'/api.php?action=push-test',{data:{endpoint}})).status(),403);
 assert.equal((await context.request.post(service.url+'/api.php?action=push-test',{headers,data:{endpoint:'https://example.com/push'}})).status(),422);
 assert.equal((await context.request.post(service.url+'/api.php?action=push-test',{headers,data:{endpoint}})).status(),404);
 assert.equal((await context.request.post(service.url+'/api.php?action=subscription',{headers,data:subscription})).status(),200);
 assert.equal((await context.request.post(service.url+'/api.php?action=push-test',{headers,data:{endpoint}})).status(),503);
 let config=await fs.readFile(root+'/config.php','utf8');config=config.replace("'secure_cookie'=>false", "'secure_cookie'=>false,'vapid_public'=>'test-public','vapid_private'=>'test-private','vapid_subject'=>'mailto:test@example.com'");await fs.writeFile(root+'/config.php',config);await fs.mkdir(root+'/vendor');await fs.copyFile('tests/fixtures/web-push.php',root+'/vendor/autoload.php');
 await page.evaluate(endpoint=>{PushManager.prototype.getSubscription=async()=>({endpoint});Object.defineProperty(Notification,'permission',{get:()=>'granted',configurable:true});},endpoint);
 const pushResponse=page.waitForResponse(r=>r.url().includes('action=push-test'),{timeout:5000});await page.getByRole('button',{name:'Testnachricht senden',exact:true}).click();const pushResult=await pushResponse;assert.equal(pushResult.status(),200,await pushResult.text());await page.locator('#push-status').getByText('Testnachricht an den Push-Dienst übergeben. Prüfe deine Mitteilungen.',{exact:true}).waitFor();
 const payload=JSON.parse(await fs.readFile(root+'/push-test-payload.json'));assert.equal(payload.subscription.endpoint,endpoint);assert.equal(payload.message.tag,'palle-test');assert.equal(payload.options.TTL,60);
 assert.equal((await context.request.post(service.url+'/api.php?action=push-test',{headers,data:{endpoint}})).status(),429);
 console.log('PASS push: authentication, CSRF, endpoint allowlist, own subscription, missing configuration, browser test button, transport payload and rate limit');
 // A fresh authenticated session permits testing an expired subscription without waiting.
 const other=await browser.newContext();const login=await other.request.post(service.url+'/api.php?action=login',{data:{username:'test-user',password:'TestOnly-12-password'}});const auth=await login.json(),h={'X-Palle-CSRF':auth.csrf},expired='https://fcm.googleapis.com/expired';await other.request.post(service.url+'/api.php?action=subscription',{headers:h,data:{...subscription,endpoint:expired}});assert.equal((await other.request.post(service.url+'/api.php?action=push-test',{headers:h,data:{endpoint:expired}})).status(),410);assert.equal((await other.request.post(service.url+'/api.php?action=push-test',{headers:h,data:{endpoint:expired}})).status(),404);await other.close();
 // Keep a task and a draft in IndexedDB while activating a changed worker and bundle.
 await page.getByRole('button',{name:'Aufgaben',exact:true}).click();await page.locator('[data-action=new-task]').click();await page.getByLabel('Titel',{exact:true}).fill('Update-Test: Staubsaugen');await page.getByRole('button',{name:'Aufgabe speichern',exact:true}).click();await page.getByRole('button',{name:/Update-Test: Staubsaugen/}).click();await page.getByRole('button',{name:'Dokumentation starten',exact:true}).click();await page.getByRole('button',{name:'Starten',exact:true}).click();await page.getByLabel('Notiz',{exact:true}).fill('Diese offene Notiz muss bleiben.');await page.getByText('Entwurf auf diesem Gerät gesichert.',{exact:true}).waitFor();
 const workURL=page.url();await page.getByRole('button',{name:'Einstellungen',exact:true}).click();
 const sw=await fs.readFile(root+'/public/sw.js','utf8');await fs.writeFile(root+'/public/sw.js',sw.replace('palle-shell-v4','palle-shell-test-update'));await fs.appendFile(root+'/public/app.js','\nglobalThis.palleUpdatedBundle=true;\n');
 await page.getByRole('button',{name:'Nach neuer Version suchen',exact:true}).click();await page.getByRole('button',{name:'Neue Version laden',exact:true}).waitFor();assert.equal(await page.evaluate(()=>globalThis.palleUpdatedBundle),undefined);
 await page.getByRole('button',{name:'Neue Version laden',exact:true}).click();await page.waitForFunction(()=>globalThis.palleUpdatedBundle===true);await page.goto(workURL);await page.getByLabel('Notiz',{exact:true}).waitFor();assert.equal(await page.getByLabel('Notiz',{exact:true}).inputValue(),'Diese offene Notiz muss bleiben.');
 await context.setOffline(true);await page.reload();await page.getByLabel('Notiz',{exact:true}).waitFor();assert.equal(await page.getByLabel('Notiz',{exact:true}).inputValue(),'Diese offene Notiz muss bleiben.');await page.getByRole('button',{name:'Einstellungen',exact:true}).click();await page.getByRole('button',{name:'Nach neuer Version suchen',exact:true}).click();await page.locator('#update-status').getByText('Für die Updatesuche brauchst du eine Internetverbindung.',{exact:true}).waitFor();
 console.log('PASS updates: latest-version check, waiting worker, explicit activation, fresh bundle, draft persistence, offline startup and offline check error');
}catch(e){failure=e;console.error(e);console.error('Toast:',await page.locator('#toast').textContent());await page.screenshot({path:'work/update-push-failure.png'});}finally{await context.close();await browser.close();await service.close();}process.exit(failure?1:0);
