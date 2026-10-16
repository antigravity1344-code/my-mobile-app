#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist-customer'));
const port = Number(process.env.PORT || 4173);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "frame-ancestors *",
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) {
    send(res, 403, 'Forbidden', 'text/plain');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      fs.readFile(path.join(root, 'index.html'), (fallbackErr, html) => {
        if (fallbackErr) {
          send(res, 404, 'Not found', 'text/plain');
          return;
        }
        send(res, 200, html, types['.html']);
      });
      return;
    }
    send(res, 200, data, types[path.extname(file)] || 'application/octet-stream');
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Paksho web preview on 0.0.0.0:${port} from ${root}`);
});
