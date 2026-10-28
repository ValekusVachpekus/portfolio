import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const build = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
const dist = resolve(root, 'dist');
const port = Number(process.env.PORT ?? 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = resolve(dist, '.' + pathname);
    if (file !== dist && !file.startsWith(dist + sep)) { response.writeHead(403).end(); return; }
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(await readFile(resolve(dist, '404.html')));
  }
});
server.on('error', error => {
  console.error(`Preview could not start: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
