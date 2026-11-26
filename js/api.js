// NovelAI image API client (browser, direct CORS).

import { API_BASE } from './config.js';

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

let token = '';
let base = API_BASE;

export function setToken(t) {
  token = (t || '').trim();
}
export function getToken() {
  return token;
}
export function setBase(b) {
  base = (b || API_BASE).replace(/\/+$/, '') || API_BASE;
}
export function getBase() {
  return base;
}

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'NovelAI-Studio/1.0',
    ...extra,
  };
}

function timeoutSignal(ms, outer) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('请求超时', 'TimeoutError')), ms);
  const onAbort = () => ctrl.abort(outer?.reason);
  if (outer) {
    if (outer.aborted) ctrl.abort(outer.reason);
    else outer.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    done() {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    },
  };
}

async function request(path, { method = 'GET', body, signal, timeout = 120000, raw = false } = {}) {
  if (!token) throw new ApiError('请先在设置中填入 NovelAI Token', 401);
  const t = timeoutSignal(timeout, signal);
  try {
    const res = await fetch(base + path, {
      method,
      headers: authHeaders(body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
      signal: t.signal,
      mode: 'cors',
      cache: 'no-store',
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      let payload = null;
      try {
        const text = await res.text();
        try {
          payload = JSON.parse(text);
          msg = payload.message || payload.error || msg;
        } catch {
          msg = text.slice(0, 300) || msg;
        }
      } catch {}
      if (res.status === 401) msg = 'Token 无效或已过期，请重新登录 NovelAI 获取 Persistent Token';
      if (res.status === 402) msg = 'Anlas 不足';
      if (res.status === 429) msg = '请求过于频繁，请稍后再试';
      throw new ApiError(msg, res.status, payload);
    }
    if (raw) return res;
    return await res.arrayBuffer();
  } catch (e) {
    if (e.name === 'AbortError' || e.name === 'TimeoutError') throw e;
    if (e instanceof ApiError) throw e;
    throw new ApiError(`网络错误：${e.message}（若在中国大陆，请检查代理/VPN）`, 0);
  } finally {
    t.done();
  }
}

/* -------------------------------------------------------------------- unzip */

export async function unzipImages(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const dec = new TextDecoder('utf-8');

  const sig = (o) => view.getUint32(o, true);
  // find EOCD
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (sig(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ApiError('返回数据不是有效的 ZIP', 0);

  const count = view.getUint16(eocd + 10, true);
  let off = view.getUint32(eocd + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (sig(off) !== 0x02014b50) break;
    const method = view.getUint16(off + 10, true);
    const compSize = view.getUint32(off + 20, true);
    const nameLen = view.getUint16(off + 28, true);
    const extraLen = view.getUint16(off + 30, true);
    const commentLen = view.getUint16(off + 32, true);
    const localOff = view.getUint32(off + 42, true);
    const name = dec.decode(bytes.subarray(off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + commentLen;

    if (sig(localOff) !== 0x04034b50) continue;
    const lNameLen = view.getUint16(localOff + 26, true);
    const lExtraLen = view.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const data = bytes.subarray(dataStart, dataStart + compSize);

    let fileBytes;
    if (method === 0) {
      fileBytes = data;
    } else if (method === 8) {
      if (!globalThis.DecompressionStream) throw new ApiError('当前浏览器不支持解压，请换用新版浏览器', 0);
      const ds = new DecompressionStream('deflate-raw');
      const stream = new Blob([data]).stream().pipeThrough(ds);
      fileBytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } else {
      continue;
    }
    const ext = name.toLowerCase().split('.').pop();
    const type = ext === 'webp' ? 'image/webp' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
    out.push({ name, blob: new Blob([fileBytes], { type }) });
  }
  return out;
}

/* -------------------------------------------------------------- png metadata */

export function readPngText(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder('utf-8');
  const latin = new TextDecoder('latin1');
  const out = {};
  let off = 8;
  while (off + 8 <= bytes.length) {
    const len = view.getUint32(off);
    const type = latin.decode(bytes.subarray(off + 4, off + 8));
    const data = bytes.subarray(off + 8, off + 8 + len);
    if (type === 'tEXt') {
      const z = data.indexOf(0);
      if (z > 0) out[latin.decode(data.subarray(0, z))] = latin.decode(data.subarray(z + 1));
    } else if (type === 'iTXt') {
      const z = data.indexOf(0);
      if (z > 0) {
        const key = latin.decode(data.subarray(0, z));
        const compFlag = data[z + 1];
        let p = z + 3;
        const z2 = data.indexOf(0, p);
        const z3 = data.indexOf(0, z2 + 1);
        let text = data.subarray(z3 + 1);
        if (compFlag) {
          // rarely used; skip compressed iTXt
        } else {
          out[key] = dec.decode(text);
        }
      }
    } else if (type === 'zTXt') {
      const z = data.indexOf(0);
      if (z > 0) out[latin.decode(data.subarray(0, z))] = '(compressed)';
    } else if (type === 'IEND') break;
    off += 12 + len;
  }
  return out;
}

export async function readImageMeta(blob) {
  if (!/png/i.test(blob.type) && !blob.type) {
    const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    const isPng = head[0] === 0x89 && head[1] === 0x50;
    if (!isPng) return null;
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  const info = readPngText(bytes);
  let meta = null;
  if (info.Comment) {
    try {
      meta = JSON.parse(info.Comment);
    } catch {}
  }
  const title = info.Title;
  const desc = info.Description;
  const software = info.Software;
  let seed = meta?.seed;
  if (seed == null && desc) {
    const m = /^([0-9]{1,10})$/.exec(desc.trim());
    if (m) seed = Number(m[1]);
  }
  return {
    info,
    raw: meta,
    software,
    title,
    description: desc,
    seed: seed ?? null,
    prompt: meta?.prompt ?? meta?.v4_prompt?.caption?.base_caption ?? desc ?? '',
    negative: meta?.uc ?? meta?.v4_negative_prompt?.caption?.base_caption ?? '',
    model: meta?.model_name || meta?.model || null,
    modelHash: meta?.model_hash || null,
    requestType: meta?.request_type || null,
    reqType: meta?.req_type || null,
    width: meta?.width,
    height: meta?.height,
    steps: meta?.steps,
    scale: meta?.scale,
    sampler: meta?.sampler,
    nSamples: meta?.n_samples,
    seedValue: meta?.seed,
    rawText: info.Comment || '',
  };
}

/* --------------------------------------------------------------- generation */

function parseSSEBlock(block) {
  const lines = block.split('\n');
  let data = '';
  for (const line of lines) {
    const s = line.trimStart();
    if (s.startsWith('data:')) data += s.slice(5).trimStart();
  }
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function streamGenerate({ payload, signal, onProgress, steps }) {
  if (!token) throw new ApiError('请先在设置中填入 NovelAI Token', 401);
  const t = timeoutSignal(600000, signal);
  let res;
  try {
    res = await fetch(base + '/ai/generate-image-stream', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'text/event-stream' }),
      body: JSON.stringify(payload),
      signal: t.signal,
      mode: 'cors',
      cache: 'no-store',
    });
  } catch (e) {
    t.done();
    if (e.name === 'AbortError') throw e;
    throw new ApiError(`网络错误：${e.message}`, 0);
  }
  if (!res.ok) {
    t.done();
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j.message || msg;
    } catch {}
    throw new ApiError(msg, res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const images = [];
  let lastPreview = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const ev = parseSSEBlock(block);
        if (!ev) continue;
        const type = ev.event_type || ev.type;
        if (type === 'intermediate') {
          const blob = base64ToBlob(ev.image, 'image/png');
          lastPreview = blob;
          onProgress?.({ step: ev.step_ix, steps: steps || 0, preview: blob, sigma: ev.sigma });
        } else if (type === 'final') {
          const blob = base64ToBlob(ev.image, 'image/png');
          images.push(await finalize(blob, lastPreview));
          onProgress?.({ step: steps, steps, preview: blob, final: true });
        } else if (ev.error || ev.message) {
          throw new ApiError(ev.error || ev.message, 0);
        }
      }
    }
  } finally {
    t.done();
    try {
      await reader.cancel();
    } catch {}
  }
  if (!images.length) throw new ApiError('生成失败：没有收到图片', 0);
  return images;
}

async function finalize(blob, preview) {
  const meta = await readImageMeta(blob).catch(() => null);
  return { blob, meta, preview };
}

export function base64ToBlob(b64, type = 'image/png') {
  const clean = b64.includes(',') ? b64.split(',')[1] : b64;
  const bin = atob(clean);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

export async function generateImage({ payload, signal, stream = true, onProgress }) {
  if (stream) {
    try {
      return await streamGenerate({ payload, signal, onProgress, steps: payload?.parameters?.steps });
    } catch (e) {
      // If streaming is unavailable (proxy strips SSE, or model rejects), fall back once.
      if (e.name === 'AbortError' || e.status) throw e;
    }
  }
  const buf = await request('/ai/generate-image', { method: 'POST', body: payload, signal, timeout: 600000 });
  const files = await unzipImages(buf);
  const images = [];
  for (const f of files.filter((x) => /\.(png|webp|jpe?g)$/i.test(x.name))) {
    images.push({ blob: f.blob, meta: await readImageMeta(f.blob).catch(() => null) });
  }
  if (!images.length) throw new ApiError('生成失败：压缩包为空', 0);
  return images;
}

/* ----------------------------------------------------------------- upscale */

export async function upscaleImage({ blob, width, height, signal, model = 'nai-diffusion-5-full' }) {
  const image = await blobToB64(blob);
  const buf = await request('/ai/upscale', {
    method: 'POST',
    body: { image, width, height, scale: 4, model },
    signal,
    timeout: 600000,
  });
  const files = await unzipImages(buf);
  const f = files.find((x) => /\.(png|webp)$/i.test(x.name)) || files[0];
  if (!f) throw new ApiError('放大失败：没有图片', 0);
  return { blob: f.blob, meta: await readImageMeta(f.blob).catch(() => null) };
}

/* --------------------------------------------------------------- director */

export async function directorTool({ reqType, blob, width, height, model, extra = {}, signal }) {
  const image = await blobToB64(blob);
  let w = width || 0;
  let h = height || 0;
  if (!w || !h) {
    const { loadImage } = await import('./util.js');
    const img = await loadImage(URL.createObjectURL(blob));
    w = img.width;
    h = img.height;
  }
  const body = {
    req_type: reqType,
    image,
    width: w,
    height: h,
    model,
    use_new_shared_trial: true,
    ...extra,
  };
  const buf = await request('/ai/augment-image', { method: 'POST', body, signal, timeout: 600000 });
  const files = await unzipImages(buf);
  const f = files.find((x) => /\.(png|webp)$/i.test(x.name)) || files[0];
  if (!f) throw new ApiError('处理失败：没有图片', 0);
  return { blob: f.blob, meta: await readImageMeta(f.blob).catch(() => null) };
}

/* -------------------------------------------------------------- encode vibe */

export async function encodeVibe({ blob, model, informationExtracted = 1, signal }) {
  const image = await blobToB64(blob);
  const res = await request('/ai/encode-vibe', {
    method: 'POST',
    body: { image, model, information_extracted: informationExtracted },
    signal,
    timeout: 180000,
    raw: true,
  });
  const buf = await res.arrayBuffer();
  return new Blob([buf], { type: 'application/octet-stream' });
}

export async function blobToB64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/* ------------------------------------------------------------------- user */

export async function getUserData(signal) {
  const buf = await request('/user/data', { signal, timeout: 30000 });
  return JSON.parse(new TextDecoder().decode(buf));
}

export async function getSubscription(signal) {
  const buf = await request('/user/subscription', { signal, timeout: 30000 });
  return JSON.parse(new TextDecoder().decode(buf));
}

/* --------------------------------------------------------------- tag search */

const tagCache = new Map();

export async function suggestTags(model, prompt, signal) {
  const key = `${model}|${prompt}`;
  if (tagCache.has(key)) return tagCache.get(key);
  const q = encodeURIComponent(prompt);
  const buf = await request(`/ai/generate-image/suggest-tags?model=${encodeURIComponent(model)}&prompt=${q}`, {
    signal,
    timeout: 20000,
  });
  const data = JSON.parse(new TextDecoder().decode(buf));
  const tags = (data.tags || [])
    .filter((x) => x.tag)
    .map((x) => ({ tag: x.tag, label: x.tag, count: Number(x.count) || 0, source: 'api' }));
  tagCache.set(key, tags);
  if (tagCache.size > 200) tagCache.delete(tagCache.keys().next().value);
  return tags;
}
