// Tiny static server for previewing www/ during development
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, 'www');
http.createServer((req, res) => {
  const rel = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(root, rel);
  fs.readFile(p, (e, d) => {
    if (e) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(d);
  });
}).listen(8123, () => console.log('serving on 8123'));
