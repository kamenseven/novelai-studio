// App state, persistence, gallery and asset storage.

import { DEFAULT_STATE, MODEL_MAP } from './config.js';
import { loadJSON, saveJSON, idb, uuid, setLang } from './util.js';
import { setToken, setBase } from './api.js';

const KEY = 'nai-studio:state:v1';

export const state = { ...structuredClone(DEFAULT_STATE), account: null, results: [], session: [], activeResultId: null };

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emit(type, detail) {
  for (const fn of listeners) {
    try {
      fn(type, detail);
    } catch (e) {
      console.error(e);
    }
  }
}

let saveTimer;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 250);
}

function doSave() {
  const clean = JSON.parse(JSON.stringify(state, (k, v) => (['results', 'session', 'account', '_abort'].includes(k) ? undefined : v)));
  for (const v of clean.vibes || []) {
    delete v.encodedB64;
  }
  for (const r of clean.refs || []) {
    delete r.b64;
  }
  if (clean.baseImage) delete clean.baseImage.dataURL;
  if (!saveJSON(KEY, clean)) {
    // Most likely quota — drop the least important data and retry once.
    clean.presets = (clean.presets || []).slice(-10);
    clean.chunks = (clean.chunks || []).slice(-30);
    saveJSON(KEY, clean);
  }
}

export async function init() {
  const saved = loadJSON(KEY, null);
  if (saved) {
    for (const k of Object.keys(DEFAULT_STATE)) {
      if (saved[k] !== undefined) {
        state[k] = saved[k];
      }
    }
    if (saved.baseImage) state.baseImage = saved.baseImage;
    if (saved.vibes) state.vibes = saved.vibes;
    if (saved.refs) state.refs = saved.refs;
  }
  setLang(state.lang);
  setToken(state.token);
  setBase(state.base);
  if (state.model === 'nai-diffusion-5-full' && state.effort === 'medium') {
    state.model = 'nai-diffusion-5-full-medium';
  }
  await restoreAssets();
  emit('init');
}

/* -------------------------------------------------------------------- assets */

export async function restoreAssets() {
  let assets = [];
  try {
    assets = await idb.all('assets');
  } catch {
    return;
  }
  const byId = new Map(assets.map((a) => [a.id, a]));
  if (state.baseImage?.id) {
    const a = byId.get(state.baseImage.id);
    if (a?.dataURL) state.baseImage = { ...state.baseImage, ...a };
    else state.baseImage = null;
  }
  state.vibes = (state.vibes || []).filter((v) => {
    if (v.encodedB64) return true;
    const a = byId.get(v.id);
    if (a?.encodedB64) {
      v.encodedB64 = a.encodedB64;
      if (!v.preview) v.preview = a.preview;
      if (!v.blob) v.blob = a.blob;
      return true;
    }
    return false;
  });
  state.refs = (state.refs || []).filter((r) => {
    if (r.b64) return true;
    const a = byId.get(r.id);
    if (a?.b64) {
      r.b64 = a.b64;
      if (!r.preview) r.preview = a.preview;
      return true;
    }
    return false;
  });
}

export async function saveBaseImage(obj) {
  state.baseImage = obj ? { ...obj } : null;
  if (obj) {
    await idb.put('assets', { id: obj.id, kind: 'base', ...obj });
  }
  save();
  emit('baseImage', state.baseImage);
}

export async function addVibe(v) {
  state.vibes.push(v);
  await idb.put('assets', { id: v.id, kind: 'vibe', encodedB64: v.encodedB64, preview: v.preview, name: v.name, blob: v.blob });
  save();
  emit('vibes');
}

export async function updateVibe(id, patch) {
  const v = state.vibes.find((x) => x.id === id);
  if (!v) return;
  Object.assign(v, patch);
  save();
  emit('vibes');
}

export async function removeVibe(id) {
  state.vibes = state.vibes.filter((v) => v.id !== id);
  await idb.delete('assets', id).catch(() => {});
  save();
  emit('vibes');
}

export async function addRef(r) {
  state.refs.push(r);
  await idb.put('assets', { id: r.id, kind: 'ref', b64: r.b64, preview: r.preview, name: r.name });
  save();
  emit('refs');
}

export async function updateRef(id, patch) {
  const r = state.refs.find((x) => x.id === id);
  if (!r) return;
  Object.assign(r, patch);
  save();
  emit('refs');
}

export async function removeRef(id) {
  state.refs = state.refs.filter((r) => r.id !== id);
  await idb.delete('assets', id).catch(() => {});
  save();
  emit('refs');
}

/* ------------------------------------------------------------------- results */

let resultSeq = 0;
export function addResult(img, extra = {}) {
  const r = {
    id: uuid(),
    seq: ++resultSeq,
    blob: img.blob,
    meta: img.meta || null,
    preview: img.preview || null,
    url: URL.createObjectURL(img.blob),
    created: Date.now(),
    ...extra,
  };
  state.results.unshift(r);
  state.activeResultId = r.id;
  emit('results', r);
  window.dispatchEvent(new CustomEvent('nai:results'));
  return r;
}

export function removeResult(id) {
  const r = state.results.find((x) => x.id === id);
  if (r?.url) URL.revokeObjectURL(r.url);
  state.results = state.results.filter((x) => x.id !== id);
  if (state.activeResultId === id) state.activeResultId = state.results[0]?.id || null;
  emit('results');
}

export function setActiveResult(id) {
  state.activeResultId = id;
  emit('results');
}

export function activeResult() {
  return state.results.find((r) => r.id === state.activeResultId) || null;
}

/* ------------------------------------------------------------------- gallery */

export async function saveToGallery(result, info = {}) {
  const { makeThumb } = await import('./util.js');
  let thumb = null;
  try {
    thumb = await makeThumb(result.blob, 420);
  } catch {}
  const rec = {
    id: result.id || uuid(),
    created: result.created || Date.now(),
    blob: result.blob,
    thumb,
    meta: result.meta || null,
    prompt: result.meta?.prompt || result.meta?.v4_prompt?.caption?.base_caption || info.prompt || '',
    negative: result.meta?.uc || '',
    model: result.meta?.model_name || info.model || '',
    modelId: info.model || '',
    seed: result.meta?.seed ?? result.seed ?? null,
    width: result.meta?.width || info.width || 0,
    height: result.meta?.height || info.height || 0,
    steps: result.meta?.steps ?? info.steps,
    scale: result.meta?.scale ?? info.scale,
    sampler: result.meta?.sampler ?? info.sampler,
    mode: info.mode || 't2i',
    reqType: result.meta?.req_type || info.reqType || null,
    refs: info.refs || null,
    chars: info.chars || null,
    fav: false,
    size: result.blob.size,
  };
  await idb.put('gallery', rec);
  emit('gallery');
  return rec;
}

export async function galleryAll() {
  try {
    const all = await idb.all('gallery');
    return all.sort((a, b) => b.created - a.created);
  } catch {
    return [];
  }
}

export async function galleryDelete(id) {
  await idb.delete('gallery', id);
  emit('gallery');
}

export async function gallerySetFav(id, fav) {
  const rec = await idb.get('gallery', id);
  if (!rec) return;
  rec.fav = fav;
  await idb.put('gallery', rec);
  emit('gallery');
}

export async function galleryClear() {
  await idb.clear('gallery');
  emit('gallery');
}

/* ------------------------------------------------------------------- presets */

export function savePreset(name) {
  const id = uuid();
  const data = snapshot();
  state.presets.push({ id, name: name || `预设 ${state.presets.length + 1}`, data, created: Date.now() });
  save();
  emit('presets');
  return id;
}

export function snapshot() {
  const keys = [
    'model', 'effort', 'mode', 'prompt', 'negative', 'quality', 'uc', 'aspect', 'size', 'width', 'height',
    'steps', 'scale', 'sampler', 'schedule', 'seed', 'nSamples', 'sm', 'smDyn', 'dyn', 'cfgRescale',
    'autoSmea', 'transparent', 'furry', 'characters', 'charPosMode', 'i2i', 'inpaint', 'normalizeVibes',
  ];
  const out = {};
  for (const k of keys) out[k] = structuredClone(state[k]);
  out.vibes = state.vibes.map((v) => ({ id: v.id, name: v.name, info: v.info, strength: v.strength }));
  out.refs = state.refs.map((r) => ({ id: r.id, name: r.name, type: r.type, description: r.description, strength: r.strength, fidelity: r.fidelity, info: r.info }));
  return out;
}

export function applyPreset(id) {
  const p = state.presets.find((x) => x.id === id);
  if (!p) return false;
  applySnapshot(p.data);
  return true;
}

export function applySnapshot(data) {
  for (const [k, v] of Object.entries(data)) {
    if (['vibes', 'refs'].includes(k)) continue;
    if (v !== undefined) state[k] = structuredClone(v);
  }
  if (Array.isArray(data.vibes)) {
    const byId = new Map(state.vibes.map((v) => [v.id, v]));
    state.vibes = data.vibes.map((v) => byId.get(v.id)).filter(Boolean);
  }
  if (Array.isArray(data.refs)) {
    const byId = new Map(state.refs.map((r) => [r.id, r]));
    state.refs = data.refs.map((r) => byId.get(r.id)).filter(Boolean);
  }
  save();
  emit('applyPreset');
}

/* -------------------------------------------------------------------- chunks */

export function addChunk(name, text) {
  state.chunks.push({ id: uuid(), name, text });
  save();
  emit('chunks');
}

export function removeChunk(id) {
  state.chunks = state.chunks.filter((c) => c.id !== id);
  save();
  emit('chunks');
}

/* -------------------------------------------------------------------- account */

export function tierName(tier) {
  return { 0: 'Free', 1: 'Paper', 2: 'Tablet', 3: 'Opus' }[tier] || `Tier ${tier}`;
}

export function modelTitle(modelId) {
  return MODEL_MAP[modelId]?.label || modelId;
}
