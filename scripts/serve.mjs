// 本地预览：静态文件 + History 路由回退（和 vercel.json、deploy/Caddyfile 的规则一致）
// node scripts/serve.mjs [port]
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../site/dist');
const PORT = +(process.argv[2] || process.env.PORT || 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
};

createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end('bad request'); }
  let file = path.join(DIST, rel.endsWith('/') ? rel + 'index.html' : rel);
  // 没有扩展名的路径都交给 index.html；静态文件找不到才 404
  if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) {
    if (path.extname(rel)) { res.writeHead(404); return res.end('not found'); }
    file = path.join(DIST, 'index.html');
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`http://127.0.0.1:${PORT}/`));