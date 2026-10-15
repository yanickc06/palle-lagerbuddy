import fs from 'node:fs/promises';import path from 'node:path';
const out=path.resolve('release/palle');await fs.rm(out,{recursive:true,force:true});await fs.mkdir(out,{recursive:true});
for(const dir of ['public','app','bin'])await fs.cp(dir,path.join(out,dir),{recursive:true});
await fs.mkdir(path.join(out,'storage'));await fs.writeFile(path.join(out,'storage','.gitkeep'),'');
for(const file of ['README.md','config.example.php','composer.json'])await fs.copyFile(file,path.join(out,file));
try{await fs.copyFile('composer.lock',path.join(out,'composer.lock'));await fs.cp('vendor',path.join(out,'vendor'),{recursive:true});}catch{}
console.log('Release prepared at '+out);
