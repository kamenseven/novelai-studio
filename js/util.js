// Small DOM / storage / image utilities.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') node.innerHTML = v;
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    if (c instanceof Node) node.append(c);
    else if (typeof c === 'string' && c.trimStart().startsWith('<svg')) node.insertAdjacentHTML('beforeend', c);
    else node.append(document.createTextNode(String(c)));
  }
  return node;
}

export const svg = (id, cls = '') =>
  `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${id}"></use></svg>`;

export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function debounce(fn, ms = 200) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function randomSeed() {
  // NovelAI seeds are uint32.
  return Math.floor(Math.random() * 4294967295);
}

export function formatBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return (n / 1024 ** i).toFixed(i ? 1 : 0) + ' ' + u[i];
}

export function formatDate(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ------------------------------------------------------------------ storage */

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------------- IDB */

let dbPromise;
export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('nai-studio', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('gallery')) {
        const s = db.createObjectStore('gallery', { keyPath: 'id' });
        s.createIndex('created', 'created');
        s.createIndex('fav', 'fav');
      }
      if (!db.objectStoreNames.contains('assets')) {
        const s = db.createObjectStore('assets', { keyPath: 'id' });
        s.createIndex('kind', 'kind');
      }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    try {
      out = fn(s);
    } catch (e) {
      reject(e);
      return;
    }
    t.oncomplete = () => resolve(out?.__result ?? out);
    t.onerror = () => reject(t.error);
  });
}

export const idb = {
  async put(store, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite');
      t.objectStore(store).put(value);
      t.oncomplete = () => resolve(value);
      t.onerror = () => reject(t.error);
    });
  },
  async get(store, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const r = db.transaction(store).objectStore(store).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  },
  async delete(store, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite');
      t.objectStore(store).delete(key);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
  async all(store) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const r = db.transaction(store).objectStore(store).getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  },
  async clear(store) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite');
      t.objectStore(store).clear();
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
};

/* ------------------------------------------------------------------ hashing */

export async function sha256Hex(blob) {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ------------------------------------------------------------------- images */

export function dataURLToBlob(dataURL) {
  const [head, body] = dataURL.split(',');
  const mime = /:(.*?);/.exec(head)?.[1] || 'image/png';
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('无法读取图片'));
    img.src = src;
  });
}

export async function blobToImage(blob) {
  return loadImage(URL.createObjectURL(blob));
}

export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

export async function makeThumb(blob, max = 360) {
  const img = await blobToImage(blob);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * scale));
  c.height = Math.max(1, Math.round(img.height * scale));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return canvasToBlob(c, 'image/webp', 0.82);
}

export async function imageToPngBlob(img, width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  c.getContext('2d').drawImage(img, 0, 0, width, height);
  return canvasToBlob(c, 'image/png');
}

/** Fit an image into one of NovelAI's 3 reference canvases (cover + pad). */
export async function fitReferenceCanvas(blob) {
  const img = await blobToImage(blob);
  const ratio = img.width / img.height;
  let target = REF_CANVAS_CHOICE(ratio);
  const c = document.createElement('canvas');
  c.width = target.w;
  c.height = target.h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  const scale = Math.min(c.width / img.width, c.height / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
  return canvasToBlob(c, 'image/png');
}

function REF_CANVAS_CHOICE(ratio) {
  // three official canvases: 1024x1536 (0.667), 1472x1472 (1), 1536x1024 (1.5)
  const options = [
    { w: 1024, h: 1536, r: 1024 / 1536 },
    { w: 1472, h: 1472, r: 1 },
    { w: 1536, h: 1024, r: 1.5 },
  ];
  return options.reduce((best, o) => (Math.abs(o.r - ratio) < Math.abs(best.r - ratio) ? o : best), options[0]);
}

export function sanitizeFilename(s, max = 90) {
  return (s || 'image')
    .replace(/[\n\r"%*/:<>?\\|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max) || 'image';
}

export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}

/* --------------------------------------------------------------------- i18n */

const DICT = {
  zh: {
    generate: '生成',
    gallery: '图库',
    tools: '工具',
    settings: '设置',
    prompt: '提示词',
    negative: '负面提示词 / Undesired Content',
    model: '模型',
    quality: '质量标签',
    resolution: '分辨率',
    advanced: '高级参数',
    steps: '步数 Steps',
    guidance: '引导 Guidance',
    sampler: '采样器',
    schedule: '噪声调度',
    seed: '种子 Seed',
    samples: '张数',
    generateBtn: '生成图片',
    generating: '生成中…',
    cancel: '取消',
    queue: '队列',
    characters: '多角色提示词',
    addCharacter: '添加角色',
    vibe: 'Vibe 迁移',
    vibeHint: '最多 16 张参考图；V4+ 会先编码（每张 2 Anlas）',
    references: '精准参考 Precise Reference',
    refHint: '角色参考 / 风格参考，仅 V4.5 / V5',
    img2img: '图生图',
    inpaint: '局部重绘',
    upload: '上传图片',
    dropHint: '拖入图片，或点击选择',
    strength: '强度 Strength',
    noise: '噪声 Noise',
    mask: '蒙版',
    brush: '画笔',
    clearMask: '清除蒙版',
    invertMask: '反转蒙版',
    transparent: '透明背景',
    history: '历史记录',
    noImages: '还没有图片',
    download: '下载',
    reuse: '载入设置',
    delete: '删除',
    favorite: '收藏',
    upscale: '放大 4x',
    enhance: '增强 Enhance',
    director: '导演工具',
    account: '账号',
    token: 'NovelAI Token',
    tokenHint: '只保存在本机浏览器，不会上传到任何服务器',
    save: '保存',
    test: '测试连接',
    connected: '已连接',
    notConnected: '未连接',
    plugins: '扩展功能',
    about: '关于',
    quality_standard: '标准',
    quality_light: '轻量',
    quality_none: '关闭',
    apply: '应用',
    close: '关闭',
    confirm: '确定',
    copied: '已复制',
    error: '出错了',
    free: '免费',
    estimated: '预计消耗',
    anlas: 'Anlas',
  },
  en: {
    generate: 'Generate',
    gallery: 'Gallery',
    tools: 'Tools',
    settings: 'Settings',
    prompt: 'Prompt',
    negative: 'Undesired Content',
    model: 'Model',
    quality: 'Quality Tags',
    resolution: 'Resolution',
    advanced: 'Advanced',
    steps: 'Steps',
    guidance: 'Prompt Guidance',
    sampler: 'Sampler',
    schedule: 'Noise Schedule',
    seed: 'Seed',
    samples: 'Batch',
    generateBtn: 'Generate',
    generating: 'Generating…',
    cancel: 'Cancel',
    queue: 'Queue',
    characters: 'Character Prompts',
    addCharacter: 'Add character',
    vibe: 'Vibe Transfer',
    vibeHint: 'Up to 16 references; V4+ encodes each (2 Anlas)',
    references: 'Precise Reference',
    refHint: 'Character / style references (V4.5 / V5)',
    img2img: 'Image to Image',
    inpaint: 'Inpaint',
    upload: 'Upload image',
    dropHint: 'Drop an image or click to choose',
    strength: 'Strength',
    noise: 'Noise',
    mask: 'Mask',
    brush: 'Brush',
    clearMask: 'Clear mask',
    invertMask: 'Invert mask',
    transparent: 'Transparent BG',
    history: 'History',
    noImages: 'No images yet',
    download: 'Download',
    reuse: 'Load settings',
    delete: 'Delete',
    favorite: 'Favorite',
    upscale: 'Upscale 4x',
    enhance: 'Enhance',
    director: 'Director Tools',
    account: 'Account',
    token: 'NovelAI Token',
    tokenHint: 'Stored only in this browser, never sent to any server but NovelAI',
    save: 'Save',
    test: 'Test',
    connected: 'Connected',
    notConnected: 'Not connected',
    plugins: 'Extensions',
    about: 'About',
    quality_standard: 'Standard',
    quality_light: 'Light',
    quality_none: 'Off',
    apply: 'Apply',
    close: 'Close',
    confirm: 'OK',
    copied: 'Copied',
    error: 'Error',
    free: 'Free',
    estimated: 'Estimated',
    anlas: 'Anlas',
  },
};

let lang = 'zh';

export function setLang(l) {
  lang = DICT[l] ? l : 'zh';
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
}

export function getLang() {
  return lang;
}

export function t(key, ...args) {
  let s = DICT[lang]?.[key] ?? DICT.zh[key] ?? key;
  args.forEach((a, i) => {
    s = s.replaceAll(`{${i}}`, a);
  });
  return s;
}
