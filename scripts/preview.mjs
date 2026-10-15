// Reine Frontend-Vorschau. Kein Ersatz für PHP/MySQL auf Plesk.
import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';
const root=path.resolve('public'),port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname==='/')pathname='/index.html';const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||file.endsWith('.php')){res.writeHead(404);res.end('Nur lokale Frontend-Vorschau.');return;}const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('Nicht gefunden');}});
server.listen(port,'127.0.0.1',()=>console.log(`Palle Vorschau: http://127.0.0.1:${port}/?preview=1`));
