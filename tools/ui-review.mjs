// Development only: serves the actual build in an isolated, network-free host fixture.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const flags=new Map(process.argv.slice(2).map(arg=>{const match=/^--(polisher|port)=(.+)$/.exec(arg);if(!match)throw Error('Use --polisher=<built JS> --port=<local port>');return [match[1],match[2]];}));
const port=Number(flags.get('port')||5173);
const routes=new Map([['/','tests/browser-final-ui/index.html'],['/build/miemie-hub.js','build/miemie-hub.js'],['/api/avatars/fixture','tests/browser-final-ui/avatar.svg']]);
if(flags.has('polisher'))routes.set('/build/miemie-polisher.js',pathToFileURL(flags.get('polisher')));
const server=createServer(async(req,res)=>{const file=routes.get(new URL(req.url,'http://localhost').pathname);if(!file){res.writeHead(404);res.end();return;}try{const bytes=await readFile(file instanceof URL?file:new URL('../'+file,import.meta.url));res.writeHead(200,{'Content-Type':String(file).endsWith('.js')?'text/javascript; charset=utf-8':String(file).endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(500);res.end('Run npm run build first.');}});
server.listen(port,'127.0.0.1',()=>console.log('Actual build review: http://127.0.0.1:'+port));
