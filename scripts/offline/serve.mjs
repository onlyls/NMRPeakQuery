#!/usr/bin/env node
/**
 * NMRPeakQuery 离线版 · 本地静态服务器（零依赖，仅用 Node 内置模块）
 *
 * 用法：
 *   node serve.mjs                 默认端口 5177，自动打开浏览器
 *   node serve.mjs --port 8080     指定端口（被占用时自动 +1 顺延）
 *   node serve.mjs --no-open       不自动打开浏览器
 *
 * 特性：正确 MIME、SPA 回退到 index.html、仅监听 127.0.0.1（不对外暴露）。
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** 解析 URL 为本地绝对路径，并阻止越权访问到 ROOT 之外 */
function resolveSafe(urlPath) {
  let decoded = '/';
  try {
    decoded = decodeURIComponent((urlPath || '/').split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  const abs = normalize(join(ROOT, decoded));
  const base = normalize(ROOT.endsWith(sep) ? ROOT : ROOT + sep);
  return abs === normalize(ROOT) || abs.startsWith(base) ? abs : null;
}

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  const target = resolveSafe(req.url);
  if (!target) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('403 Forbidden');
    return;
  }

  let file = target;
  if (!(await isFile(file))) {
    // 无扩展名（或目录）视为前端路由，回退到 index.html；否则 404
    if (extname(target)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
      return;
    }
    file = join(ROOT, 'index.html');
  }

  res.writeHead(200, {
    'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  const stream = createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
});

function openBrowser(url) {
  const [cmd, cmdArgs] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* 打不开浏览器不影响服务 */
  }
}

function listen(port) {
  return new Promise((resolve, reject) => {
    const onError = (e) => {
      server.removeListener('listening', onListening);
      reject(e);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

const basePort = Number(argValue('--port', process.env.PORT || 5177));
const noOpen = args.includes('--no-open');

for (let i = 0; i < 20; i += 1) {
  const candidate = basePort + i;
  try {
    await listen(candidate);
    const url = `http://127.0.0.1:${candidate}/`;
    console.log('');
    console.log('  NMRPeakQuery 离线版已启动（无需联网）');
    console.log(`  浏览器打开： ${url}`);
    console.log('  停止服务：   在本窗口按 Ctrl+C');
    console.log('');
    if (!noOpen) openBrowser(url);
    break;
  } catch (e) {
    if (e && e.code === 'EADDRINUSE') continue;
    console.error('启动失败：', e);
    process.exit(1);
  }
}