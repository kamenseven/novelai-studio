// Shared image actions used by Generate / Gallery / Tools.

import { state, addResult, saveToGallery, gallerySetFav, saveBaseImage, addVibe, emit, save } from './state.js';
import { upscaleImage, directorTool, generateImage, ApiError, readImageMeta } from './api.js';
import { buildRequest, effectiveModel } from './payload.js';
import { capsFor, MODEL_MAP } from './config.js';
import { downloadBlob, sanitizeFilename, t, blobToDataURL, uuid } from './util.js';
import { toast, modal as openModal, confirmDialog, openViewer } from './ui.js';
import { plainPrompt } from './prompt.js';

export function resultFilename(rec) {
  const meta = rec.meta || {};
  const seed = meta.seed ?? rec.seed ?? 0;
  const prompt = plainPrompt(rec.prompt || meta.prompt || '', 90) || 'image';
  return sanitizeFilename(`${seed}-${prompt}`) + '.png';
}

export async function downloadResult(rec) {
  if (!rec?.blob) return;
  downloadBlob(rec.blob, resultFilename(rec));
}

export function metaToSettings(meta) {
  if (!meta) return {};
  const out = {};
  const m = meta.v4_prompt?.caption;
  if (meta.prompt || m?.base_caption) out.prompt = meta.prompt || m.base_caption;
  if (meta.uc || meta.v4_negative_prompt?.caption?.base_caption) {
    out.negative = meta.uc ?? meta.v4_negative_prompt.caption.base_caption ?? '';
  }
  if (meta.steps) out.steps = meta.steps;
  if (meta.scale != null) out.scale = Math.round(meta.scale * 10) / 10;
  if (meta.sampler) out.sampler = meta.sampler;
  if (meta.noise_schedule) out.schedule = meta.noise_schedule;
  if (meta.seed != null) out.seed = String(meta.seed);
  if (meta.n_samples) out.nSamples = Math.min(4, meta.n_samples);
  if (meta.width && meta.height) {
    out.width = meta.width;
    out.height = meta.height;
  }
  if (meta.cfg_rescale != null) out.cfgRescale = meta.cfg_rescale;
  if (meta.sm) out.sm = true;
  if (meta.sm_dyn) out.smDyn = true;
  if (meta.dynamic_thresholding) out.dyn = true;
  if (meta.straight_alpha) out.transparent = true;
  if (meta.normalize_reference_strength_multiple != null) {
    out.normalizeVibes = meta.normalize_reference_strength_multiple !== false;
  }
  // The stored prompt/uc already contain the quality/UC preset text: don't append again.
  out.quality = 'none';
  out.uc = 'none';
  out.activeStyleId = null;
  const model = guessModel(meta);
  if (model) out.model = model;
  const chars = m?.char_captions;
  if (Array.isArray(chars) && chars.length) {
    const charUc = meta.v4_negative_prompt?.caption?.char_captions || [];
    out.characters = chars.map((c, i) => ({
      prompt: c.char_caption || '',
      uc: charUc[i]?.char_caption || '',
      x: c.centers?.[0]?.x ?? 0.5,
      y: c.centers?.[0]?.y ?? 0.5,
      enabled: true,
    }));
    out.charPosMode = chars.some((c) => (c.centers || []).length) ? 'custom' : 'ai';
  } else {
    out.characters = [];
    out.charPosMode = 'ai';
  }
  return out;
}

export function guessModel(meta) {
  const name = (meta?.model_name || '').toLowerCase();
  if (name.includes('medium')) return 'nai-diffusion-5-full-medium';
  if (name.includes('v5')) return 'nai-diffusion-5-full';
  if (name.includes('v4.5')) return 'nai-diffusion-4-5-full';
  if (name.includes('v4')) return 'nai-diffusion-4-full';
  if (name.includes('furry')) return 'nai-diffusion-furry-3';
  if (name.includes('v3')) return 'nai-diffusion-3';
  return null;
}

export async function applyImageMeta(meta) {
  const patch = metaToSettings(meta);
  Object.assign(state, patch);
  state.activeStyleId = null;
  state.mode = 't2i';
  state.baseImage = null;
  state.refs = [];
  if (patch.width && patch.height) {
    state.aspect = 'custom';
    state.size = 'custom';
  } else {
    state.aspect = 'portrait';
    state.size = 'normal';
    state.width = 832;
    state.height = 1216;
  }
  state.vibes = [];
  const caps = capsFor(effectiveModel(state));
  const refs = Array.isArray(meta.reference_image_multiple) ? meta.reference_image_multiple : [];
  if (caps.vibe && refs.length) {
    for (let i = 0; i < refs.length; i++) {
      const b64 = refs[i];
      if (!b64) continue;
      const info = Number(meta.reference_information_extracted_multiple?.[i] ?? 1);
      const strength = Number(meta.reference_strength_multiple?.[i] ?? 0.6);
      await addVibe({
        id: uuid(),
        name: `图片 Vibe ${i + 1}`,
        preview: null,
        info,
        strength,
        encodedB64: caps.encodedVibe ? b64 : null,
        imageB64: caps.encodedVibe ? null : b64,
        encodedInfo: info,
        model: state.model,
        imported: true,
      });
    }
  }
  save();
  emit('applyMeta');
  return patch;
}

export async function importMetaFromFile(file) {
  if (!file) return false;
  if (!/image\/png/i.test(file.type) && !/\.png$/i.test(file.name || '')) {
    throw new Error('目前只支持 PNG（NovelAI 元数据保存在 PNG 文本块里）');
  }
  const parsed = await readImageMeta(file);
  if (!parsed?.raw) throw new Error('这张图片没有 NovelAI 生成信息（找不到 Comment 元数据）');
  const raw = parsed.raw;
  const model = MODEL_MAP[guessModel(raw) || '']?.label || raw.model_name || '未知模型';
  const lines = [
    `模型：${model}`,
    `尺寸：${raw.width || '?'} × ${raw.height || '?'} · ${raw.steps || '?'} 步 · CFG ${raw.scale ?? '?'}`,
    `种子：${raw.seed ?? '?'}${raw.n_samples > 1 ? ` · ${raw.n_samples} 张` : ''}`,
    `角色提示词：${raw.v4_prompt?.caption?.char_captions?.length || 0} 个`,
    `Vibe：${raw.reference_image_multiple?.length || 0} 个`,
    `提示词：${String(raw.prompt || '').slice(0, 70)}${String(raw.prompt || '').length > 70 ? '…' : ''}`,
  ];
  const ok = await confirmDialog('从图片导入元数据', lines.join('\n'), { okLabel: '载入' });
  if (!ok) return false;
  await applyImageMeta(raw);
  toast('已从图片载入提示词与参数', 'ok');
  return true;
}

export async function reuseSettings(rec) {
  let meta = rec?.meta?.raw || null;
  if (!meta && rec?.blob) {
    const parsed = await readImageMeta(rec.blob).catch(() => null);
    meta = parsed?.raw || null;
  }
  if (meta) {
    await applyImageMeta(meta);
    toast('已载入生成设置', 'ok');
    return true;
  }
  if (rec?.prompt) state.prompt = rec.prompt;
  if (rec?.seed != null) state.seed = String(rec.seed);
  state.activeStyleId = null;
  save();
  emit('applyMeta');
  toast('已载入设置', 'ok');
  return false;
}

export async function sendToImg2Img(rec) {
  const blob = rec.blob;
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = URL.createObjectURL(blob);
  });
  const dataURL = await blobToDataURL(blob);
  await saveBaseImage({ id: `base-${Date.now()}`, name: 'img2img', dataURL, w: img.width, h: img.height, blob });
  state.mode = 'i2i';
  toast('已作为图生图底图', 'ok');
}

export async function sendToInpaint(rec) {
  await sendToImg2Img(rec);
  state.mode = 'inpaint';
  toast('已作为局部重绘底图', 'ok');
}

/* --------------------------------------------------------------- progress UI */

export function progressModal(title) {
  const label = document.createElement('div');
  label.className = 'progress-label';
  label.textContent = '准备中…';
  const bar = document.createElement('div');
  bar.className = 'progress-bar';
  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  bar.append(fill);
  const img = document.createElement('img');
  img.className = 'progress-preview';
  img.alt = '';
  const body = document.createElement('div');
  body.className = 'progress-body';
  body.append(label, bar, img);
  const m = openModal({ title, body, actions: [], wide: false });
  m.root.classList.add('progress-modal');
  return {
    root: m.root,
    close: m.close,
    set(text, pct, previewURL) {
      label.textContent = text;
      if (pct != null) fill.style.width = `${Math.max(0, Math.min(100, pct * 100))}%`;
      if (previewURL) img.src = previewURL;
    },
  };
}

/* --------------------------------------------------------------------- jobs */

async function runWithProgress(title, fn) {
  const p = progressModal(title);
  try {
    const out = await fn((text, pct, url) => p.set(text, pct, url));
    p.close();
    return out;
  } catch (e) {
    p.close();
    throw e;
  }
}

function toastError(e) {
  if (e?.name === 'AbortError') {
    toast('已取消', 'info');
    return;
  }
  const msg = e instanceof ApiError ? e.message : e?.message || String(e);
  toast(msg, 'error', 5000);
  console.error(e);
}

export async function upscaleResult(rec) {
  try {
    const out = await runWithProgress('放大 4x', async (set) => {
      set('正在放大…', 0.4);
      return upscaleImage({ blob: rec.blob, width: rec.meta?.width || 0, height: rec.meta?.height || 0, model: 'nai-diffusion-5-full' });
    });
    const added = addResult({ blob: out.blob, meta: out.meta }, { mode: 'upscale', seed: out.meta?.seed });
    await saveToGallery(added, { mode: 'upscale', model: effectiveModel(state) });
    toast('放大完成', 'ok');
    return added;
  } catch (e) {
    toastError(e);
  }
}

export async function enhanceResult(rec, { prompt, strength = 0.35, noise = 0.1, upscale = false, model } = {}) {
  try {
    let source = rec.blob;
    let meta = rec.meta;
    if (upscale) {
      const up = await runWithProgress('增强 · 先放大', async () => upscaleImage({ blob: source, width: meta?.width || 0, height: meta?.height || 0, model: 'nai-diffusion-5-full' }));
      source = up.blob;
    }
    const temp = {
      ...structuredCloneSafe(state),
      mode: 'i2i',
      prompt: prompt ?? rec.meta?.prompt ?? rec.prompt ?? state.prompt,
      negative: rec.meta?.uc ?? state.negative,
      quality: 'none',
      uc: 'none',
      i2i: { strength, noise },
      vibes: [],
      refs: [],
      characters: [],
    };
    const { body } = await buildRequest(temp, { baseImage: source });
    const images = await runWithProgress('增强 Enhance', async (set) =>
      generateImage({
        payload: body,
        stream: true,
        onProgress: ({ step, steps, preview }) => {
          const url = preview ? URL.createObjectURL(preview) : null;
          set(`增强中… ${step || 0}/${steps || '?'}`, steps ? step / steps : null, url);
        },
      }),
    );
    const img = images[0];
    const added = addResult(img, { mode: 'enhance', seed: img.meta?.seed });
    await saveToGallery(added, { mode: 'enhance', model: body.model, prompt: body.input });
    toast('增强完成', 'ok');
    return added;
  } catch (e) {
    toastError(e);
  }
}

export async function directorResult(rec, { tool, extra = {}, model }) {
  try {
    const out = await runWithProgress('导演工具', async (set) => {
      set('处理中…', 0.5);
      return directorTool({
        reqType: tool,
        blob: rec.blob,
        width: rec.meta?.width,
        height: rec.meta?.height,
        model: model || effectiveModel(state),
        extra,
      });
    });
    const added = addResult({ blob: out.blob, meta: out.meta }, { mode: 'director', reqType: tool });
    await saveToGallery(added, { mode: 'director', model: model || effectiveModel(state), reqType: tool });
    toast('处理完成', 'ok');
    return added;
  } catch (e) {
    toastError(e);
  }
}

export async function runEnhanceDialog(rec) {
  const prompt = document.createElement('textarea');
  prompt.className = 'input';
  prompt.rows = 3;
  prompt.value = rec.meta?.prompt || rec.prompt || state.prompt || '';
  const strength = document.createElement('input');
  strength.type = 'range';
  strength.min = '0.05';
  strength.max = '0.9';
  strength.step = '0.05';
  strength.value = '0.35';
  const noise = document.createElement('input');
  noise.type = 'range';
  noise.min = '0';
  noise.max = '0.9';
  noise.step = '0.05';
  noise.value = '0.1';
  const sVal = document.createElement('span');
  sVal.textContent = strength.value;
  const nVal = document.createElement('span');
  nVal.textContent = noise.value;
  strength.oninput = () => (sVal.textContent = Number(strength.value).toFixed(2));
  noise.oninput = () => (nVal.textContent = Number(noise.value).toFixed(2));
  const up = document.createElement('input');
  up.type = 'checkbox';
  const body = document.createElement('div');
  body.className = 'form-stack';
  body.append(
    elx('label', '字段', '提示词'),
    prompt,
    elx('div', 'slider-line', `强度 ${''}`),
    row(strength, sVal),
    elx('div', 'slider-line', '噪声'),
    row(noise, nVal),
    elx('label', 'check-line', '同时放大 2x（先 4x 放大再增强）'),
  );
  up.className = '';
  body.lastChild.append(up);
  let run = false;
  const m = openModal({
    title: t('enhance'),
    body,
    actions: [
      { label: t('cancel') },
      {
        label: t('apply'),
        primary: true,
        onClick: () => {
          run = true;
        },
      },
    ],
    onClose: () => {
      if (run) {
        enhanceResult(rec, { prompt: prompt.value, strength: Number(strength.value), noise: Number(noise.value), upscale: up.checked });
      }
    },
  });
}

function elx(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  n.textContent = text;
  return n;
}
function row(a, b) {
  const d = document.createElement('div');
  d.className = 'row-line';
  d.append(a, b);
  return d;
}

function structuredCloneSafe(obj) {
  const clone = {};
  for (const [k, v] of Object.entries(obj)) {
    if (['results', 'session', 'account', 'vibes', 'refs', 'baseImage'].includes(k)) continue;
    try {
      clone[k] = structuredClone(v);
    } catch {
      clone[k] = v;
    }
  }
  return clone;
}

export async function toggleFavorite(rec) {
  if (!rec?.id) return;
  const next = !rec.fav;
  await gallerySetFav(rec.id, next);
  rec.fav = next;
  toast(next ? '已收藏' : '已取消收藏', 'ok', 1200);
}

export function showImage(rec) {
  const url = rec.blob ? URL.createObjectURL(rec.blob) : rec.url;
  openViewer(url, { caption: rec.prompt || rec.meta?.prompt || '' });
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
