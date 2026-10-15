import {PHP,PHPRequestHandler} from '@php-wasm/universal';
import {loadNodeRuntime,useHostFilesystem} from '@php-wasm/node';
import fs from 'node:fs/promises';import path from 'node:path';import http from 'node:http';
export const phpQuote=s=>"'"+s.replaceAll('\\','\\\\').replaceAll("'","\\'")+"'";
export async function createPHPServer(port=4174){
 const root=path.resolve('work/test-server');await fs.rm(root,{recursive:true,force:true});await fs.mkdir(root,{recursive:true});
 await fs.cp('public',path.join(root,'public'),{recursive:true});await fs.cp('app',path.join(root,'app'),{recursive:true});
 await fs.writeFile(path.join(root,'config.php'),`<?php return ['dsn'=>'sqlite:${root}/test.sqlite','db_user'=>'','db_password'=>'','storage'=>'${root}/storage','app_url'=>'http://127.0.0.1:${port}','secure_cookie'=>false];`);
 const php=new PHP(await loadNodeRuntime('8.3',{emscriptenOptions:{processId:process.pid}}));useHostFilesystem(php);
 const init=await php.run({code:`<?php require ${phpQuote(root+'/app/bootstrap.php')}; migrate(); db()->prepare('INSERT INTO palle_users(id,username,password_hash) VALUES(?,?,?)')->execute(['00000000-0000-4000-8000-000000000001','test-user',password_hash('TestOnly-12-password',PASSWORD_DEFAULT)]); echo 'OK';`});
 if(init.text!=='OK')throw Error('PHP initialization: '+init.text+' '+init.errors);
 const handler=new PHPRequestHandler({php,documentRoot:root+'/public',absoluteUrl:`http://127.0.0.1:${port}`,cookieStore:false});
 const server=http.createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);let url=req.url;if(new URL(url,'http://localhost').pathname==='/')url='/index.html'+new URL(url,'http://localhost').search;const body=Buffer.concat(chunks);const response=await handler.request({url,method:req.method,headers:req.headers,body:body.length?body:undefined});if(response.errors)console.error('PHP:',response.errors);const headers={...response.headers};if(req.url.includes('.webmanifest'))headers['content-type']=['application/manifest+json'];if(req.url.includes('.js'))headers['content-type']=['text/javascript'];res.writeHead(response.httpStatusCode,headers);res.end(response.bytes);}catch(e){console.error(e);res.writeHead(500);res.end('Test server failed.');}});
 await new Promise((resolve,reject)=>{server.on('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return {php,server,url:`http://127.0.0.1:${port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}
