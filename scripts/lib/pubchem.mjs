/**
 * scripts/lib/pubchem.mjs
 *
 * PubChem PUG-REST 客户端，用于给数据集补 CAS / 分子式 / 分子量 / SMILES / 中文名。
 *
 * 设计要点：
 *   1. 文献里的 `id` 是不可查询名（normalizeToken 去掉了全部空白），查询一律
 *      走 `CompoundData.nameRaw`；对简称（MTBE / 2-MeTHF / DMPU …）另备别名表，
 *      按顺序逐个尝试，命中即止。
 *   2. PubChem 无官方中文名接口。中文名只能从 synonyms 里筛含 CJK 的条目，
 *      命中率有限，筛不到就留空（不猜、不翻译）。
 *   3. PubChem 已不允许用 CAS 检索，但 CAS 会出现在 synonyms 里，用正则提取。
 *   4. 限速：PUG-REST 上限 5 req/s，这里压到 ≤4.5 req/s，并对 429/503 退避重试。
 *
 * 本模块只负责「取数」，不写缓存、不碰数据集。
 */

const PUG = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
const MIN_INTERVAL_MS = 220;
const MAX_RETRY = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastRequestAt = 0;

/** 全局节流：保证相邻两次请求间隔 ≥ MIN_INTERVAL_MS */
async function throttle() {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

/**
 * GET 一个 PUG-REST JSON 端点。
 * 404 / 400（查询无结果）返回 null；429/503/网络错误按指数退避重试。
 */
async function pugFetch(url) {
  for (let attempt = 0; attempt <= MAX_RETRY; attempt += 1) {
    await throttle();
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.status === 404 || res.status === 400) return null;
      if (res.status === 429 || res.status === 503 || res.status >= 500) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      await sleep(500 * 2 ** attempt);
    }
  }
  return null;
}

/** 名称 → CID（取 PubChem 排序最靠前的匹配），无命中返回 null */
export async function resolveCid(name) {
  const url = `${PUG}/compound/name/${encodeURIComponent(name)}/cids/JSON`;
  const json = await pugFetch(url);
  const cid = json?.IdentifierList?.CID?.[0];
  return Number.isFinite(cid) ? cid : null;
}

/** CID → { formula, mw, smiles, canonicalSmiles, iupacName } */
export async function fetchProperties(cid) {
  const props = 'MolecularFormula,MolecularWeight,SMILES,CanonicalSMILES,IUPACName';
  const url = `${PUG}/compound/cid/${cid}/property/${props}/JSON`;
  const json = await pugFetch(url);
  const p = json?.PropertyTable?.Properties?.[0];
  if (!p) return null;
  const mw = Number.parseFloat(p.MolecularWeight);
  return {
    formula: p.MolecularFormula ?? '',
    mw: Number.isFinite(mw) ? mw : 0,
    smiles: p.SMILES ?? p.CanonicalSMILES ?? '',
    canonicalSmiles: p.CanonicalSMILES ?? '',
    iupacName: p.IUPACName ?? '',
  };
}

/** CID → 全部 synonyms（找不到返回 []） */
export async function fetchSynonyms(cid) {
  const url = `${PUG}/compound/cid/${cid}/synonyms/JSON`;
  const json = await pugFetch(url);
  return json?.InformationList?.Information?.[0]?.Synonym ?? [];
}

const CAS_RE = /^\d{2,7}-\d{2}-\d$/;
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff]/;

/** 从 synonyms 里取第一个 CAS 号（PubChem 已禁用 CAS 检索，只能这样拿） */
export function pickCas(synonyms) {
  return synonyms.find((s) => CAS_RE.test(s.trim()))?.trim() ?? '';
}

/** 从 synonyms 里取第一个含中日韩字符的名称；没有则返回 '' */
export function pickChineseName(synonyms) {
  const hit = synonyms.find((s) => CJK_RE.test(s) && !CAS_RE.test(s.trim()));
  return hit?.trim() ?? '';
}

/**
 * 查询别名表：文献里的简称 / 商品写法 → 更适合 PubChem 的正式名。
 * 只登记「确为同一物质」的等价写法，顺序即尝试顺序（先正式名，后俗称）。
 */
export const QUERY_ALIASES = {
  '2-methf': ['2-methyltetrahydrofuran', '2-MeTHF'],
  bha: ['butylated hydroxyanisole', '2-tert-butyl-4-hydroxyanisole'],
  bht: ['butylated hydroxytoluene', '2,6-di-tert-butyl-4-methylphenol'],
  cpme: ['cyclopentyl methyl ether', 'methoxycyclopentane'],
  diglyme: ['diethylene glycol dimethyl ether', 'bis(2-methoxyethyl) ether'],
  dmpu: ['1,3-dimethyl-3,4,5,6-tetrahydro-2(1H)-pyrimidinone', 'N,N-dimethylpropyleneurea'],
  etbe: ['tert-butyl ethyl ether', 'ethyl tert-butyl ether'],
  hmpa: ['hexamethylphosphoramide', 'hexamethylphosphoric triamide'],
  mibk: ['4-methyl-2-pentanone', 'methyl isobutyl ketone'],
  mtbe: ['tert-butyl methyl ether', 'methyl tert-butyl ether'],
  tame: ['tert-amyl methyl ether', '2-methoxy-2-methylbutane'],
  '18-crown-6': ['18-crown-6', '1,4,7,10,13,16-hexaoxacyclooctadecane'],
  glycoldiacetate: ['ethylene glycol diacetate', '1,2-diacetoxyethane'],
  'p-cymene': ['4-isopropyltoluene', 'p-cymene'],
  'm-xylene': ['m-xylene', '1,3-dimethylbenzene'],
  'o-xylene': ['o-xylene', '1,2-dimethylbenzene'],
  'p-xylene': ['p-xylene', '1,4-dimethylbenzene'],
  'n-butanol': ['1-butanol'],
  'n-butylacetate': ['butyl acetate'],
  'n-heptane': ['heptane'],
  'n-hexane': ['hexane'],
  'n-pentane': ['pentane'],
  'ethyl-lactate': ['ethyl lactate', 'ethyl (S)-lactate'],
  dimethylacetamide: ['N,N-dimethylacetamide'],
  dimethylformamide: ['N,N-dimethylformamide'],
  dimethylsulfoxide: ['dimethyl sulfoxide'],
  carbondioxide: ['carbon dioxide'],
  carbondisulfide: ['carbon disulfide'],
  carbontetrachloride: ['carbon tetrachloride'],
  hydrogen: ['hydrogen'],

  // 2023（Cseri et al.）：SI 里的写法 PubChem 查不到，给正式名
  'choline-lactate': ['choline lactate', 'L-choline lactate'],
  'cyclohexanone-d6-ketal': ['1,1-dimethoxycyclohexane', 'cyclohexanone dimethyl ketal'],
  'cyrene-hemiacetal': ['cyrene hemiacetal', '2-hydroxy-3-methoxy-dihydrolevoglucosenone'],
  dbn: ['1,5-diazabicyclo[4.3.0]non-5-ene'],
  'dimethyl-2-methylglutarate': ['dimethyl 2-methylpentanedioate', 'dimethyl 2-methylglutarate'],
  gvl: ['gamma-valerolactone', '5-methyloxolan-2-one', '4-valerolactone'],
  'n3-aminopropyl-azepanone': ['1-(3-aminopropyl)azepan-2-one'],
  'n3-aminopropyl-pyrrolidone': ['1-(3-aminopropyl)pyrrolidin-2-one'],
  nndimethyllactamide: ['N,N-dimethyl lactamide', '2-hydroxy-N,N-dimethylpropanamide'],
  pinene: ['alpha-pinene', 'α-pinene', '2,6,6-trimethylbicyclo[3.1.1]hept-2-ene'],
};

/**
 * 明确不富集的化合物：混合物 / 商品名，PubChem 无单一 CID。
 * 硬凑一个 CID 只会污染检索结果，故列白名单跳过。
 */
export const NO_ENRICH = new Set([
  'pump-oil',
  'silicone-grease',
  'apiezon-h-grease',
  // 2023 新增的聚合物 / 混合物 / 商品名，PubChem 无单一 CID
  'peg400',
  'ppg400',
  'priamine1071',
  'tpgs-750-m',
  'methylsoyate',
  'reline',
]);

/**
 * 单个化合物的完整查询：按候选名依次尝试 → CID → properties + synonyms。
 * 返回 { queryName, cid, cas, formula, mw, smiles, canonicalSmiles, iupacName,
 *        chineseName, matchedName }；全部候选都无命中时 cid = null。
 */
export async function queryCompound(id, nameRaw) {
  const candidates = [...new Set([...(QUERY_ALIASES[id] ?? []), ...nameRaw])].filter(Boolean);

  let cid = null;
  let queryName = '';
  for (const name of candidates) {
    cid = await resolveCid(name);
    if (cid) {
      queryName = name;
      break;
    }
  }
  if (!cid) {
    return {
      queryName: candidates[0] ?? '',
      cid: null,
      cas: '',
      formula: '',
      mw: 0,
      smiles: '',
      canonicalSmiles: '',
      iupacName: '',
      chineseName: '',
      matchedName: '',
      triedNames: candidates,
    };
  }

  const props = await fetchProperties(cid);
  const synonyms = await fetchSynonyms(cid);
  return {
    queryName,
    cid,
    cas: pickCas(synonyms),
    formula: props?.formula ?? '',
    mw: props?.mw ?? 0,
    smiles: props?.smiles ?? '',
    canonicalSmiles: props?.canonicalSmiles ?? '',
    iupacName: props?.iupacName ?? '',
    chineseName: pickChineseName(synonyms),
    matchedName: synonyms[0] ?? queryName,
    triedNames: candidates,
  };
}
