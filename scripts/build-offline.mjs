/* ============================================================================
 * build-offline.mjs — 生成可在「无网条件」下使用的单文件离线版
 *
 * 产物（输出到 release/）：
 *   NMRPeakQuery-offline.html    单文件版：CSS/JS/数据集全部内联，双击即用
 *
 * 用法：npm run build:offline
 *
 * 说明：离线版不需要任何后端。数据集内联，AI 助手在无网时不可用
 *       （其状态探测失败会被静默降级，不影响其余功能）。
 * ========================================================================== */
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const releaseDir = join(root, 'release');
const tmpDir = join(root, '.offline-tmp');
const singleFile = join(releaseDir, 'NMRPeakQuery-offline.html');
const datasetPath = join(root, 'public', 'data', 'nmr_data_v1.json');

const log = (...a) => console.log('[offline]', ...a);

/** 类型检查，保证发布的产物对应一份可通过 tsc 的源码 */
function typeCheck() {
  log('类型检查 tsc --noEmit …');
  execFileSync(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'], {
    cwd: root,
    stdio: 'inherit',
  });
}

/* -------------------------------- 单文件版 -------------------------------- */

/** 将 dist 中 index.html 引用的样式表 / 脚本内联为单文件 */
async function buildSingleFile() {
  log('构建单文件 HTML →', singleFile);
  await rm(tmpDir, { recursive: true, force: true });

  await build({
    root,
    configFile: false,
    base: './',
    plugins: [react()],
    build: {
      outDir: tmpDir,
      emptyOutDir: true,
      target: 'es2020',
      assetsInlineLimit: 100_000_000, // 其余小资源全部转 data URL
      cssCodeSplit: false,
      modulePreload: false,
      reportCompressedSize: false,
      rollupOptions: {
        // 打成单个 IIFE，便于用普通 <script> 内联 —— file:// 双击也能执行
        output: {
          format: 'iife',
          inlineDynamicImports: true,
          entryFileNames: 'assets/app.js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
    logLevel: 'warn',
  });

  let html = await readFile(join(tmpDir, 'index.html'), 'utf8');

  // 移除 modulepreload（若有）——单文件无需预加载
  html = html.replace(/<link\b[^>]*\brel="modulepreload"[^>]*>\s*/gi, '');

  // 内联样式表
  html = await replaceAsync(html, /<link\b[^>]*\brel="stylesheet"[^>]*>/gi, async (tag) => {
    const href = tag.match(/\bhref="([^"]+)"/i)?.[1];
    if (!href) return tag;
    const css = await readFile(assetPath(tmpDir, href), 'utf8');
    return `<style>\n${css}\n</style>`;
  });

  // 内联数据集 + 引导脚本（需先于应用脚本执行，故随脚本一起插入）
  const dataLiteral = JSON.stringify(JSON.parse(await readFile(datasetPath, 'utf8'))).replace(
    /</g,
    '\\u003c',
  );
  const boot = offlineBoot(dataLiteral);

  // 内联脚本：产物为 IIFE，用普通 <script> 内联（file:// 双击也可执行）。
  // 普通脚本在解析时立即执行，必须移到 <body> 末尾，确保 #root 已存在。
  const chunks = [];
  html = await replaceAsync(
    html,
    /<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>/gi,
    async (tag, src) => {
      const js = (await readFile(assetPath(tmpDir, src), 'utf8'))
        .replace(/<\/script/gi, '<\\/script')
        .replace(/<!--/g, '<\\!--');
      chunks.push(js);
      return ''; // 先从 <head> 移除，随后统一注入到 </body> 之前
    },
  );
  const bundle = `${boot}<script>\n${chunks.join('\n')}\n</script>`;
  html = html.includes('</body>') ? html.replace('</body>', `${bundle}</body>`) : html + bundle;

  await mkdir(releaseDir, { recursive: true });
  await writeFile(singleFile, html, 'utf8');
  await rm(tmpDir, { recursive: true, force: true });
}

/** 相对引用（./assets/x.js、/assets/x.js）解析为 dist 内的绝对路径 */
function assetPath(dir, href) {
  return join(dir, href.replace(/^\.?\//, ''));
}

/** String.replace 的异步版本 */
async function replaceAsync(str, regex, replacer) {
  const jobs = [];
  str.replace(regex, (...args) => {
    jobs.push(replacer(...args));
    return '';
  });
  const results = await Promise.all(jobs);
  let i = 0;
  return str.replace(regex, () => results[i++]);
}

/** 离线引导：内联数据集，并让 file:// 下也能正常取到数据 */
function offlineBoot(dataLiteral) {
  return `<script>
/* ===== NMRPeakQuery 离线引导 =====
 * 1) 内联数据集，file:// 下也能加载（浏览器不允许 fetch 本地 JSON）；
 * 2) 数据集下载链接改为 Blob 下载；
 * 3) /api/ai/* 探测在离线时自然失败并被应用静默降级。 */
window.__NMR_OFFLINE_DATA__ = ${dataLiteral};
(function () {
  var KEY = 'nmr_data_v1.json';
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = '';
    try {
      url = typeof input === 'string' ? input : (input && input.url) || '';
    } catch (e) {}
    if (url.indexOf(KEY) !== -1) {
      return Promise.resolve(
        new Response(JSON.stringify(window.__NMR_OFFLINE_DATA__), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );
    }
    return nativeFetch ? nativeFetch(input, init) : Promise.reject(new Error('fetch unavailable'));
  };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[download]') : null;
    if (!a || (a.getAttribute('href') || '').indexOf(KEY) === -1) return;
    e.preventDefault();
    var blob = new Blob([JSON.stringify(window.__NMR_OFFLINE_DATA__)], { type: 'application/json' });
    var u = URL.createObjectURL(blob);
    var t = document.createElement('a');
    t.href = u;
    t.download = KEY;
    document.body.appendChild(t);
    t.click();
    t.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 1000);
  }, true);
})();
</script>
`;
}

/* ---------------------------------- 主流程 --------------------------------- */

typeCheck();
await mkdir(releaseDir, { recursive: true });
await buildSingleFile();

log('完成。产物：', singleFile, '→ 双击即可用，零依赖');
