'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const root = __dirname;
const port = Number(process.env.COVERING_PORT) || 4173;
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

http.createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  let pathname;
  try {
    const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
    pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  } catch (error) {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }

  const requested = path.resolve(root, `.${pathname}`);
  if (requested !== root && !requested.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.stat(requested, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(requested).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(requested).pipe(response);
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`Covering System: http://127.0.0.1:${port}/`);
  console.log('浏览器中的 WebAssembly 由 covering.hpp 直接编译。');
});

