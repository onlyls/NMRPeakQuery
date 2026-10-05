/**
 * scripts/lib/solvent-reference.mjs
 *
 * 氘代溶剂的「参考表」数据（三级来源，非一级文献）。
 *
 * 用途：为 UI 的「溶剂参考卡」提供物理性质与溶剂自身峰的参考值，
 * 并为一级文献未覆盖的溶剂提供仅有参考值的条目（referenceOnly）。
 *
 * 来源：
 *   - Sigma-Aldrich, "NMR Deuterated Solvent Properties Reference Chart"
 *          （25 °C；本表溶剂峰与物性的主来源；补 CIL 未收录的 2-Propanol-d8、Pyridine-d5）
 *   - Sigma-Aldrich, "NMR Chemical Shifts of Impurities"（杂质化学位移表）
 *   - CIL  Cambridge Isotope Laboratories, "NMR Solvent Data Chart"（NMR_SDC.pdf）
 *          295 K / Varian Gemini 200 MHz；含介电常数
 *
 * 重要：参考表与三篇一级文献的口径不同（如 CDCl3 残余峰参考表作 7.24，文献作 7.26；
 * 水峰 CIL 只给粗略值），因此这里的数据与 SolventMeta.signals（文献值）分开存放，
 * 不参与合并、不覆盖文献值，仅在 UI 中单独标注为「参考值」。
 */

/** 参考表来源描述（写入 meta.sources） */
export const SOLVENT_REFERENCE_SOURCE = {
  id: 'solventReference',
  citation:
    'Sigma-Aldrich, NMR Deuterated Solvent Properties Reference Chart; ' +
    'Sigma-Aldrich, NMR Chemical Shifts of Impurities; ' +
    'Cambridge Isotope Laboratories, NMR Solvent Data Chart (NMR_SDC)',
  doi: '',
  /** 厂商参考表的原始出处（页脚渲染为超链接） */
  urls: [
    {
      label: 'Sigma-Aldrich 氘代溶剂性质参考表',
      href: 'https://www.sigmaaldrich.cn/CN/en/technical-documents/technical-article/analytical-chemistry/nuclear-magnetic-resonance/nmr-deuterated-solvent-properties-reference',
    },
    {
      label: 'Sigma-Aldrich 杂质化学位移表',
      href: 'https://www.sigmaaldrich.cn/CN/en/technical-documents/technical-article/analytical-chemistry/nuclear-magnetic-resonance/1h-nmr-and-13c-nmr-chemical-shifts-of-impurities-chart',
    },
  ],
  usedPart: '溶剂物理性质表 + 残余质子/水/¹³C 溶剂峰参考值表',
};

/**
 * @typedef {Object} ReferenceSignal
 * @property {'residual'|'water'|'solventCarbon'} kind
 * @property {'1H'|'13C'} nucleus
 * @property {number} shift
 * @property {string} [multiplicity]
 * @property {number[]} [coupling]  J_HD（¹H 残余峰）或 J_CD（¹³C 溶剂峰），单位 Hz
 * @property {string} [note]
 */

/**
 * @typedef {Object} SolventReferenceEntry
 * @property {string} [cas]
 * @property {number} [mw]                  分子量 (g/mol)
 * @property {number} [density]             密度 (g/mL)
 * @property {number} [meltingPoint]        熔点 (°C)
 * @property {number} [boilingPoint]        沸点 (°C)
 * @property {number} [dielectricConstant]  介电常数
 * @property {string} [physicalNote]        物理量口径说明（如沸点为区间）
 * @property {string} [source]              该条主来源（cil | sigma）
 * @property {ReferenceSignal[]} signals
 */

/** @type {Record<string, SolventReferenceEntry>} */
export const SOLVENT_REFERENCE = {
  /* ---------------------- 文献已覆盖的 12 种 ---------------------- */
  cdcl3: {
    cas: '865-49-6',
    mw: 120.38,
    density: 1.5,
    meltingPoint: -63.5,
    boilingPoint: 61.5,
    dielectricConstant: 4.8,
    physicalNote: '沸点文献区间 61–62 °C，取 61.5',
    source: 'cil',
    signals: [
      { kind: 'residual', nucleus: '1H', shift: 7.24, multiplicity: 's' },
      { kind: 'solventCarbon', nucleus: '13C', shift: 77.23, multiplicity: 't', coupling: [32] },
      { kind: 'water', nucleus: '1H', shift: 1.5, multiplicity: 'br' },
    ],
  },
  dcm_d2: {
    cas: '1665-00-5',
    mw: 86.95,
    density: 1.35,
    meltingPoint: -95,
    boilingPoint: 39.75,
    dielectricConstant: 8.9,
    source: 'cil',
    signals: [
      { kind: 'residual', nucleus: '1H', shift: 5.32, multiplicity: 't', coupling: [1.1] },
      { kind: 'solventCarbon', nucleus: '13C', shift: 54.0, multiplicity: 'quint', coupling: [27.2] },
      { kind: 'water', nucleus: '1H', shift: 1.5, multiplicity: 'br' },
    ],
  },
  acetone_d6: {
    cas: '666-52-4',
    mw: 64.12,
    density: 0.87,
    meltingPoint: -94,
    boilingPoint: 56.5,
    dielectricConstant: 20.7,
    source: 'cil',
    signals: [
      { kind: 'residual', nucleus: '1H', shift: 2.05, multiplicity: 'quint', coupling: [2.2] },
      { kind: 'solventCarbon', nucleus: '13C', shift: 206.68, multiplicity: 's', coupling: [0.9] },
      { kind: 'solventCarbon', nucleus: '13C', shift: 29.92, multiplicity: 'sept', coupling: [19.4] },
      { kind: 'water', nucleus: '1H', shift: 2.8, multiplicity: 'br' },
    ],
  },
  dmso_d6: {
    cas: '2206-27-1',
    mw: 84.17,
    density: 1.19,
    meltingPoint: 18.55,
    boilingPoint: 189,
    dielectricConstant: 46.7,
    source: 'cil',
    signals: [
      { kind: 'residual', nucleus: '1H', shift: 2.5, multiplicity: 'quint', coupling: [1.9] },
      { kind: 'solventCarbon', nucleus: '13C', shift: 39.51, multiplicity: 'sept', coupling: [21.0] },
      { kind: 'water', nucleus: '1H', shift: 3.3, multiplicity: 'br' },
    ],
  },
  c6d6: {
    cas: '1076-43-3',
    mw: 84.15,
    density: 0.95,
    meltingPoint: 5.5,
    boilingPoint: 80.1,
    dielectricConstant: 2.3,
    source: 'cil',
    signals: [
      { kind: 'residual', nucleus: '1H', shift: 7.16, multiplicity: 's' },
      { kind: 'solventCarbon', nucleus: '13C', shift: 128.39, multiplicity: 't', coupling: [24.3] },
      { kind: 'water', nucleus: '1H', shift: 0.4, multiplicity: 'br' },
    ],
  },
  cd3cn: {
    cas: '2206-26-0',
    mw: 44.07,
    density: 0.84,
    meltingPoint: -45,
    boilingPoint: 81.6,
    dielectricConstant: 37.5,
    source: 'cil',
    signals: [
      { kind: 'residual', nucleus: '1H', shift: 1.94, multiplicity: 'quint', coupling: [2.5] },
      { kind: 'solventCarbon', nucleus: '13C', shift: 118.69, multiplicity: 's' },
      { kind: 'solventCarbon', nucleus: '13C', shift: 1.39, multiplicity: 'sept', coupling: [21] },
      { kind: 'water', nucleus: '1H', shift: 2.1, multiplicity: 'br' },
    ],
  },
  cd3od: {
    cas: '811-98-3',
    mw: 36.07,
    density: 0.89,
    meltingPoint: -97.8,
    boilingPoint: 64.7,
    dielectricConstant: 32.7,
    source: 'cil',
    signals: [
      { kind: 'residual', nucleus: '1H', shift: 3.31, multiplicity: 'quint', coupling: [1.7] },
      { kind: 'solventCarbon', nucleus: '13C', shift: 49.15, multiplicity: 'sept', coupling: [21.4] },
      { kind: 'water', nucleus: '1H', shift: 4.87, multiplicity: 's', note: 'OH（HOD）' },
      { kind: 'water', nucleus: '1H', shift: 4.9, multiplicity: 'br' },
    ],
  },
  d2o: {
    cas: '7789-20-0',
    mw: 20.03,
    density: 1.11,
    meltingPoint: 3.81,
    boilingPoint: 101.42,
    dielectricConstant: 78.5,
    source: 'cil',
    signals: [
      {
        kind: 'water',
        nucleus: '1H',
        shift: 4.8,
        multiplicity: 'br',
        note: 'HDO 峰；相对 DSS = 4.80，相对 TSP = 4.81；随温度显著变化',
      },
    ],
  },
  thf_d8: {
    cas: '1693-74-9',
    mw: 80.16,
    density: 0.99,
    meltingPoint: -108.5,
    boilingPoint: 66,
    dielectricConstant: 7.6,
    source: 'cil',
    signals: [
      { kind: 'residual', nucleus: '1H', shift: 3.58, multiplicity: 's' },
      { kind: 'residual', nucleus: '1H', shift: 1.73, multiplicity: 's' },
      { kind: 'solventCarbon', nucleus: '13C', shift: 67.57, multiplicity: 'quint', coupling: [22.2] },
      { kind: 'solventCarbon', nucleus: '13C', shift: 25.37, multiplicity: 'quint', coupling: [20.2] },
      { kind: 'water', nucleus: '1H', shift: 2.45, multiplicity: 'br' },
    ],
  },
  toluene_d8: {
    cas: '2037-26-5',
    mw: 100.19,
    density: 0.94,
    meltingPoint: -95,
    boilingPoint: 110.6,
    dielectricConstant: 2.4,
    source: 'cil',
    signals: [
      { kind: 'residual', nucleus: '1H', shift: 7.09, multiplicity: 'm' },
      { kind: 'residual', nucleus: '1H', shift: 7.0, multiplicity: 's' },
      { kind: 'residual', nucleus: '1H', shift: 6.98, multiplicity: 'quint' },
      { kind: 'residual', nucleus: '1H', shift: 2.09, multiplicity: 'quint', coupling: [2.3] },
      { kind: 'solventCarbon', nucleus: '13C', shift: 137.86, multiplicity: 's' },
      { kind: 'solventCarbon', nucleus: '13C', shift: 129.24, multiplicity: 't', coupling: [23] },
      { kind: 'solventCarbon', nucleus: '13C', shift: 128.33, multiplicity: 't', coupling: [24] },
      { kind: 'solventCarbon', nucleus: '13C', shift: 125.49, multiplicity: 't', coupling: [24] },
      { kind: 'solventCarbon', nucleus: '13C', shift: 20.4, multiplicity: 'sept', coupling: [19] },
      { kind: 'water', nucleus: '1H', shift: 0.94, multiplicity: 'br' },
    ],
  },
  tfe_d3: {
    cas: '77253-67-9',
    mw: 103.06,
    density: 1.41,
    meltingPoint: -43.5,
    boilingPoint: 74.05,
    source: 'cil',
    signals: [
      { kind: 'residual', nucleus: '1H', shift: 5.02, multiplicity: 's', note: 'OH' },
      { kind: 'residual', nucleus: '1H', shift: 3.88, multiplicity: 'm', coupling: [2], note: '4×3 裂分' },
      { kind: 'solventCarbon', nucleus: '13C', shift: 126.3, multiplicity: 'q' },
      { kind: 'solventCarbon', nucleus: '13C', shift: 61.5, multiplicity: 'm', coupling: [22], note: '4×5 裂分' },
      { kind: 'water', nucleus: '1H', shift: 5, multiplicity: 'br' },
    ],
  },
  // 注：chlorobenzene_d5 在 CIL / Sigma 两份参考表中均未收录，故此处无参考数据。

  /* --------------- 文献未覆盖、仅有参考值的 9 种（新增溶剂） --------------- */
  acoh_d4: {
    cas: '1186-52-3',
    mw: 64.08,
    density: 1.12,
    meltingPoint: 16.7,
    boilingPoint: 118,
    dielectricConstant: 6.1,
    source: 'cil',
    signals: [
      { kind: 'residual', nucleus: '1H', shift: 2.04, multiplicity: 'quint', coupling: [2.2], note: 'CHD2' },
      { kind: 'residual', nucleus: '1H', shift: 11.65, multiplicity: 's', note: 'COOH' },
      { kind: 'solventCarbon', nucleus: '13C', shift: 178.99, multiplicity: 's', note: 'COOH' },
      { kind: 'solventCarbon', nucleus: '13C', shift: 20.0, multiplicity: 'sept', coupling: [20] },
      { kind: 'water', nucleus: '1H', shift: 11.5, multiplicity: 'br' },
    ],
  },
  cyclohexane_d12: {
    cas: '1735-17-7',
    mw: 96.24,
    density: 0.89,
    meltingPoint: 6.47,
    boilingPoint: 80.7,
    dielectricConstant: 2.0,
    source: 'cil',
    signals: [
      { kind: 'residual', nucleus: '1H', shift: 1.38, multiplicity: 's' },
      { kind: 'solventCarbon', nucleus: '13C', shift: 26.43, multiplicity: 'quint', coupling: [19] },
      { kind: 'water', nucleus: '1H', shift: 0.8, multiplicity: 'br' },
    ],
  },
  dmf_d7: {
    cas: '4472-41-7',
    mw: 80.14,
    density: 1.03,
    meltingPoint: -61,
    boilingPoint: 153,
    dielectricConstant: 36.7,
    source: 'cil',
    signals: [
      { kind: 'residual', nucleus: '1H', shift: 8.03, multiplicity: 's', note: 'CHO' },
      { kind: 'residual', nucleus: '1H', shift: 2.92, multiplicity: 'quint', coupling: [1.9] },
      { kind: 'residual', nucleus: '1H', shift: 2.75, multiplicity: 'quint', coupling: [1.9] },
      { kind: 'solventCarbon', nucleus: '13C', shift: 163.15, multiplicity: 't', coupling: [29.4] },
      { kind: 'solventCarbon', nucleus: '13C', shift: 34.89, multiplicity: 'sept', coupling: [21.0] },
      { kind: 'solventCarbon', nucleus: '13C', shift: 29.76, multiplicity: 'sept', coupling: [21.1] },
      { kind: 'water', nucleus: '1H', shift: 3.5, multiplicity: 'br' },
    ],
  },
  dioxane_d8: {
    cas: '17647-74-4',
    mw: 96.16,
    density: 1.13,
    meltingPoint: 11.8,
    boilingPoint: 101.1,
    dielectricConstant: 2.2,
    source: 'cil',
    signals: [
      { kind: 'residual', nucleus: '1H', shift: 3.53, multiplicity: 'm' },
      { kind: 'solventCarbon', nucleus: '13C', shift: 66.66, multiplicity: 'quint', coupling: [21.9] },
      { kind: 'water', nucleus: '1H', shift: 2.4, multiplicity: 'br' },
    ],
  },
  ethanol_d6: {
    cas: '1516-08-1',
    mw: 52.11,
    density: 0.89,
    meltingPoint: -114.1,
    boilingPoint: 78.5,
    dielectricConstant: 24.5,
    source: 'cil',
    signals: [
      { kind: 'residual', nucleus: '1H', shift: 5.19, multiplicity: 's', note: 'OH' },
      { kind: 'residual', nucleus: '1H', shift: 3.56, multiplicity: 's', note: 'CHD2' },
      { kind: 'residual', nucleus: '1H', shift: 1.11, multiplicity: 'm', note: 'CH3' },
      { kind: 'solventCarbon', nucleus: '13C', shift: 56.96, multiplicity: 'quint', coupling: [22] },
      { kind: 'solventCarbon', nucleus: '13C', shift: 17.31, multiplicity: 'sept', coupling: [19] },
      { kind: 'water', nucleus: '1H', shift: 5.3, multiplicity: 'br' },
    ],
  },
  isopropanol_d8: {
    cas: '22739-76-0',
    mw: 68.14,
    density: 0.89,
    meltingPoint: -89.5,
    boilingPoint: 82,
    source: 'sigma',
    signals: [
      { kind: 'residual', nucleus: '1H', shift: 5.12, multiplicity: 's', note: 'OH' },
      { kind: 'residual', nucleus: '1H', shift: 3.89, multiplicity: 'br', note: 'CH' },
      { kind: 'solventCarbon', nucleus: '13C', shift: 62.9, multiplicity: 't', coupling: [21.5] },
    ],
  },
  pyridine_d5: {
    cas: '7291-22-7',
    mw: 84.13,
    density: 1.05,
    meltingPoint: -42,
    boilingPoint: 114.4,
    source: 'sigma',
    signals: [
      { kind: 'residual', nucleus: '1H', shift: 8.71, multiplicity: 'br', note: 'H2/6' },
      { kind: 'residual', nucleus: '1H', shift: 7.55, multiplicity: 'br', note: 'H4' },
      { kind: 'residual', nucleus: '1H', shift: 7.19, multiplicity: 'br', note: 'H3/5' },
      { kind: 'solventCarbon', nucleus: '13C', shift: 149.9, multiplicity: 't', coupling: [27.5] },
      { kind: 'solventCarbon', nucleus: '13C', shift: 135.5, multiplicity: 't', coupling: [24.5] },
      { kind: 'solventCarbon', nucleus: '13C', shift: 123.5, multiplicity: 't', coupling: [25] },
    ],
  },
  tfa_d: {
    cas: '599-00-8',
    mw: 115.03,
    density: 1.49,
    meltingPoint: -15.4,
    boilingPoint: 72.4,
    source: 'cil',
    signals: [
      { kind: 'residual', nucleus: '1H', shift: 11.5, multiplicity: 's', note: 'COOH' },
      { kind: 'solventCarbon', nucleus: '13C', shift: 164.2, multiplicity: 'q', note: 'COOH' },
      { kind: 'solventCarbon', nucleus: '13C', shift: 116.6, multiplicity: 'q', note: 'CF3' },
      { kind: 'water', nucleus: '1H', shift: 11.5, multiplicity: 'br' },
    ],
  },
  tetrachloroethane_d2: {
    mw: 169.86,
    density: 1.62,
    meltingPoint: -44,
    boilingPoint: 146.5,
    dielectricConstant: 8.2,
    source: 'cil',
    signals: [
      { kind: 'residual', nucleus: '1H', shift: 6.0, multiplicity: 's', note: 'CHD' },
      { kind: 'solventCarbon', nucleus: '13C', shift: 73.78, multiplicity: 't' },
    ],
  },
};

/* ============================================================================
 * 低置信度来源：Aberdeen 教材附表
 *
 * 出处：Crews, Rodríguez & Jaspars, "Tables for Organic Structure Analysis"
 *       （University of Aberdeen；SupportingDatas/Tables.pdf）。
 *
 * 仅采用其中「1H NMR shifts of common impurities in various solvents (δ ppm (mult))」
 * 表 Pyridine-d5 列的数据。该表为教材附表（非一级文献），脚注注明转引自
 * J. Org. Chem. 1997, 62, 7512-7515，与其他来源交叉验证差距较大，置信度存疑；
 * 在溶剂元数据存为 uncertainImpurityShifts 供总览，另由 build-dataset 注入为
 * pyridine-d5 的化合物 ¹H 信号（标记 lowConfidence），使其可被检索到，UI 提示「存疑」。
 * ========================================================================== */
export const ABERDEEN_TABLE_SOURCE = {
  id: 'aberdeenTables',
  citation:
    'Crews, Rodríguez & Jaspars, Tables for Organic Structure Analysis ' +
    '(University of Aberdeen) — 杂质表 "1H NMR shifts of common impurities in various solvents"',
  doi: '',
  /** 无 DOI，改用原始 PDF 链接（页脚 / 关于页渲染为超链接） */
  urls: [
    {
      label: 'Tables for Organic Structure Analysis (PDF)',
      href: 'https://homepages.abdn.ac.uk/m.jaspars/pages/OSA/Tables.pdf',
    },
  ],
  usedPart:
    '仅采用杂质表 “1H NMR shifts of common impurities in various solvents” 中 Pyridine-d₅ 列的 ¹H 位移',
};

/**
 * 低置信度杂质位移：Aberdeen 教材附表「1H NMR shifts of common impurities in
 * various solvents (δ ppm (mult))」中 Pyridine-d5 列的 ¹H 位移。
 *
 * 该表脚注注明数据转引自 J. Org. Chem. 1997, 62, 7512-7515（Gottlieb 1997）；
 * 与其他来源交叉验证差距较大，仅展示并标注存疑，不参与检索与合并。
 * 其他氘代溶剂列因同样原因不予收录。
 *
 * 注意：附表仅给出「杂质名 + δ (mult)」，未提供任何谱峰归属；
 * 故此处只保留 name / shift / multiplicity 三项，不得臆测补入归属。
 * @type {Record<string, Array<{name:string,shift:number,multiplicity?:string}>>}
 */
export const ABERDEEN_UNCERTAIN_IMPURITIES = {
  pyridine_d5: [
    { name: 'Acetic Acid', shift: 2.13, multiplicity: 's' },
    { name: 'Acetone', shift: 2.0, multiplicity: 's' },
    { name: 'Acetonitrile', shift: 1.85, multiplicity: 's' },
    { name: 'Benzene', shift: 7.33, multiplicity: 's' },
    { name: 't-Butanol', shift: 1.37, multiplicity: 's' },
    { name: 'Chloroform', shift: 8.41, multiplicity: 's' },
    { name: 'Cyclohexane', shift: 1.38, multiplicity: 's' },
    { name: 'Dichloromethane', shift: 5.62, multiplicity: 's' },
    { name: 'Diethyl Ether', shift: 3.38, multiplicity: 'q' },
    { name: 'Diethyl Ether', shift: 1.12, multiplicity: 't' },
    { name: 'DMF', shift: 2.72, multiplicity: 's' },
    { name: 'DMF', shift: 2.66, multiplicity: 's' },
    { name: 'DMSO', shift: 2.49, multiplicity: 's' },
    { name: 'p-Dioxane', shift: 3.61, multiplicity: 's' },
    { name: 'Ethanol', shift: 3.86, multiplicity: 'q' },
    { name: 'Ethanol', shift: 1.29, multiplicity: 't' },
    { name: 'Ethyl Acetate', shift: 4.06, multiplicity: 'q' },
    { name: 'Ethyl Acetate', shift: 1.94, multiplicity: 's' },
    { name: 'Ethyl Acetate', shift: 1.1, multiplicity: 't' },
    { name: 'Methanol', shift: 3.57, multiplicity: 's' },
    { name: 'Petroleum Ether', shift: 1.2, multiplicity: 'bs' },
    { name: 'Petroleum Ether', shift: 0.86, multiplicity: 't' },
    { name: 'i-Propanol', shift: 4.16, multiplicity: 'm' },
    { name: 'i-Propanol', shift: 1.29, multiplicity: 'd' },
    { name: 'n-Propanol', shift: 3.75, multiplicity: 't' },
    { name: 'n-Propanol', shift: 1.7, multiplicity: 'm' },
    { name: 'n-Propanol', shift: 0.97, multiplicity: 't' },
    { name: 'Pyridine', shift: 8.71, multiplicity: 'm' },
    { name: 'Pyridine', shift: 7.58, multiplicity: 'm' },
    { name: 'Pyridine', shift: 7.21, multiplicity: 'm' },
    { name: 'THF', shift: 3.67, multiplicity: 'm' },
    { name: 'THF', shift: 1.64, multiplicity: 'm' },
    { name: 'Toluene', shift: 7.22, multiplicity: 'm' },
    { name: 'Toluene', shift: 2.22, multiplicity: 's' },
    { name: 'Triethylamine', shift: 2.43, multiplicity: 'q' },
    { name: 'Triethylamine', shift: 0.96, multiplicity: 't' },
  ],
};