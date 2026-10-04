/**
 * scripts/enrich-pubchem.mjs
 *
 * 用 PubChem 补全化合物的 CAS / 分子式 / 分子量 / SMILES / 中文名。
 *
 *   public/data/nmr_data_v1.json（化合物 id + nameRaw）
 *        ↓  逐个查询 PubChem PUG-REST
 *   scripts/.cache/pubchem.json（id → { cid, cas, formula, mw, smiles, … }）
 *        ↓  由 build-dataset.mjs 读取并套用
 *   public/data/nmr_data_v1.json（补上富集字段 + meta.external）
 *
 * 为什么拆成「缓存 + 套用」两步：PubChem 查询慢且有网络依赖，
 * 若直接写进数据集，任何一次 parse → build 重跑都会把富集结果冲掉。
 * 缓存落盘后，build 保持幂等；重跑富集脚本会自动跳过已成功的条目。
 *
 * 用法：
 *   node scripts/enrich-pubchem.mjs                 # 增量：跳过已有成功结果
 *   node scripts/enrich-pubchem.mjs --force         # 全量重查
 *   node scripts/enrich-pubchem.mjs --only=mtbe,bht # 只查指定化合物
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryCompound, NO_ENRICH } from './lib/pubchem.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, '.cache');
const DATASET = path.join(ROOT, 'public', 'data', 'nmr_data_v1.json');
const CACHE_FILE = path.join(CACHE, 'pubchem.json');

const argv = process.argv.slice(2);
const force = argv.includes('--force');
const only = argv
  .find((a) => a.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const ds = JSON.parse(fs.readFileSync(DATASET, 'utf8'));
const existing = fs.existsSync(CACHE_FILE)
  ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
  : { source: 'PubChem PUG-REST', entries: {} };
const entries = existing.entries ?? {};

/** 已有且可用（cid 命中，或已明确标记不富集）则视为完成 */
const isDone = (id) => {
  const e = entries[id];
  return Boolean(e) && (e.noEnrich === true || Number.isFinite(e.cid));
};

const targets = ds.compounds.filter((c) => (only ? only.includes(c.id) : true));

const stats = { enriched: 0, cached: 0, unresolved: 0, skipped: 0, noCjk: 0, noCas: 0 };
const unresolved = [];

for (const c of targets) {
  if (!force && isDone(c.id)) {
    stats.cached += 1;
    continue;
  }
  if (NO_ENRICH.has(c.id)) {
    entries[c.id] = {
      cid: null,
      noEnrich: true,
      note: '混合物 / 商品名，PubChem 无单一 CID',
      fetchedAt: new Date().toISOString(),
    };
    stats.skipped += 1;
    console.log(`  --   ${c.id.padEnd(24)} 跳过（混合物/商品名）`);
    continue;
  }

  const r = await queryCompound(c.id, c.nameRaw);
  entries[c.id] = {
    ...r,
    source: 'PubChem',
    fetchedAt: new Date().toISOString(),
  };

  if (!r.cid) {
    stats.unresolved += 1;
    unresolved.push({ id: c.id, nameRaw: c.nameRaw, tried: r.triedNames });
    console.log(`  XX   ${c.id.padEnd(24)} 未命中（试过: ${r.triedNames.join(' / ')}）`);
  } else {
    stats.enriched += 1;
    if (!r.chineseName) stats.noCjk += 1;
    if (!r.cas) stats.noCas += 1;
    console.log(
      `  OK   ${c.id.padEnd(24)} CID ${String(r.cid).padEnd(9)} ${r.formula.padEnd(12)} ` +
        `CAS ${(r.cas || '—').padEnd(13)} 中文 ${r.chineseName || '—'}`,
    );
  }
}

const out = {
  source: 'PubChem PUG-REST',
  fetchedAt: new Date().toISOString(),
  counts: {
    total: Object.keys(entries).length,
    resolved: Object.values(entries).filter((e) => Number.isFinite(e.cid)).length,
    noEnrich: Object.values(entries).filter((e) => e.noEnrich).length,
    unresolved: Object.values(entries).filter((e) => !e.noEnrich && !Number.isFinite(e.cid)).length,
  },
  entries,
};

fs.mkdirSync(CACHE, { recursive: true });
fs.writeFileSync(CACHE_FILE, JSON.stringify(out, null, 1), 'utf8');

/* --------------------------------- 报告 --------------------------------- */

console.log(`\n[pubchem] 缓存写入 ${path.relative(ROOT, CACHE_FILE)}`);
console.log(
  `[pubchem] 本次: 新查 ${stats.enriched}，复用缓存 ${stats.cached}，` +
    `跳过 ${stats.skipped}，未命中 ${stats.unresolved}`,
);
console.log(
  `[pubchem] 覆盖: ${out.counts.resolved}/${ds.compounds.length} 命中 CID，` +
    `${out.counts.noEnrich} 个不富集，${out.counts.unresolved} 个待复核`,
);
console.log(`[pubchem] 缺中文名 ${stats.noCjk} 个，缺 CAS ${stats.noCas} 个`);

if (out.counts.unresolved) {
  console.log('\n待人工复核（PubChem 未命中，需补别名或手动填 CID）:');
  for (const e of Object.entries(entries)) {
    if (!e[1].noEnrich && !Number.isFinite(e[1].cid)) {
      console.log(`  - ${e[0]}  ←  ${JSON.stringify(e[1].triedNames ?? [])}`);
    }
  }
}
