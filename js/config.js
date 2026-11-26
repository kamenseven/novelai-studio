// NovelAI Studio — model metadata, presets and constants.
// Values mirror the official NovelAI image app (V5 era) so results match.

export const API_BASE = 'https://image.novelai.net';

export const TIERS = { 0: 'Free', 1: 'Paper', 2: 'Tablet', 3: 'Opus' };

/* ------------------------------------------------------------------ models */

export const MODELS = [
  { id: 'nai-diffusion-5-full', label: 'V5 Full', short: 'V5F', family: 'v5', version: 'V5', kind: 'full', subtitle: '最新 · 自然语言 · 透明背景 · 32 角色' },
  { id: 'nai-diffusion-5-curated', label: 'V5 Curated', short: 'V5C', family: 'v5', version: 'V5', kind: 'curated', subtitle: '最新 · 更安全的精选数据集' },
  { id: 'nai-diffusion-5-full-medium', label: 'V5 Full Medium', short: 'V5M', family: 'v5', version: 'V5', kind: 'medium', subtitle: '14 步蒸馏模型 · 更快更省 · 固定 Euler A / Heavy UC' },
  { id: 'nai-diffusion-4-5-full', label: 'V4.5 Full', short: 'V45F', family: 'v45', version: 'V4.5', kind: 'full' },
  { id: 'nai-diffusion-4-5-curated', label: 'V4.5 Curated', short: 'V45C', family: 'v45', version: 'V4.5', kind: 'curated' },
  { id: 'nai-diffusion-4-full', label: 'V4 Full', short: 'V4F', family: 'v4', version: 'V4', kind: 'full' },
  { id: 'nai-diffusion-4-curated-preview', label: 'V4 Curated', short: 'V4C', family: 'v4', version: 'V4', kind: 'curated' },
  { id: 'nai-diffusion-3', label: 'Anime V3', short: 'V3', family: 'v3', version: 'V3', kind: 'full' },
  { id: 'nai-diffusion-furry-3', label: 'Furry V3', short: 'FV3', family: 'furry3', version: 'V3', kind: 'furry' },
];

export const MODEL_MAP = Object.fromEntries(MODELS.map((m) => [m.id, m]));

const INPAINT_IDS = {
  'nai-diffusion-5-full': 'nai-diffusion-5-full-inpainting',
  'nai-diffusion-5-curated': 'nai-diffusion-5-curated-inpainting',
  'nai-diffusion-5-full-medium': 'nai-diffusion-5-full-medium-inpainting',
  'nai-diffusion-4-5-full': 'nai-diffusion-4-5-full-inpainting',
  'nai-diffusion-4-5-curated': 'nai-diffusion-4-5-curated-inpainting',
  'nai-diffusion-4-full': 'nai-diffusion-4-full-inpainting',
  'nai-diffusion-4-curated-preview': 'nai-diffusion-4-curated-inpainting',
  'nai-diffusion-3': 'nai-diffusion-3-inpainting',
  'nai-diffusion-furry-3': 'nai-diffusion-furry-3-inpainting',
};

export function inpaintModelFor(model) {
  return INPAINT_IDS[model] || model;
}

/* ------------------------------------------------------------- capabilities */

const BASE_CAPS = {
  charMax: 0,
  charPos: null,          // 'grid' | 'free'
  textMax: 0,
  transparent: false,
  precise: false,         // precise reference (character / style references)
  outfitRefs: false,
  vibe: false,
  encodedVibe: false,
  smea: false,
  smeaDyn: false,
  dynThresh: false,
  noiseSchedule: false,
  excludeNativeSchedule: false,
  cfgRescale: false,
  cfgDelay: false,
  scaleMax: 10,
  stepsDefault: 23,
  scaleDefault: 5,
  scaleRecommended: [2, 6],
  legacyUC: false,
  qualityGroup: 'v4full',
  ucGroup: 'v4',
  numEmphasis: false,
  negEmphasis: false,
  autoSmea: false,
  upscale: false,
  effort: false,
  furryMode: false,
};

const CAPS = {
  v5: {
    ...BASE_CAPS,
    charMax: 32, charPos: 'free', textMax: 750, transparent: true, precise: true, outfitRefs: true,
    vibe: false, encodedVibe: false, smea: false, smeaDyn: false, dynThresh: false,
    noiseSchedule: false, cfgRescale: true, cfgDelay: false, scaleMax: 10,
    stepsDefault: 23, scaleDefault: 7, scaleRecommended: [4, 9],
    qualityGroup: 'v5', ucGroup: 'v5', numEmphasis: true, negEmphasis: true,
    upscale: true, effort: true, furryMode: true,
  },
  v45: {
    ...BASE_CAPS,
    charMax: 6, charPos: 'grid', textMax: 118, transparent: false, precise: true,
    vibe: true, encodedVibe: true, noiseSchedule: true, excludeNativeSchedule: true,
    cfgRescale: true, cfgDelay: true, scaleMax: 10, stepsDefault: 23, scaleDefault: 5,
    scaleRecommended: [2, 8], qualityGroup: 'v45', ucGroup: 'v45', numEmphasis: true,
    negEmphasis: true, furryMode: true,
  },
  v4: {
    ...BASE_CAPS,
    charMax: 6, charPos: 'grid', textMax: 118, precise: false,
    vibe: true, encodedVibe: true, noiseSchedule: true, excludeNativeSchedule: true,
    cfgRescale: true, cfgDelay: true, scaleDefault: 5.5, qualityGroup: 'v4', ucGroup: 'v4',
    numEmphasis: true, legacyUC: true, furryMode: true,
  },
  v3: {
    ...BASE_CAPS,
    vibe: true, encodedVibe: false, smea: true, smeaDyn: true, dynThresh: true,
    noiseSchedule: true, autoSmea: true, scaleDefault: 5, scaleRecommended: [2, 8],
    qualityGroup: 'v3', ucGroup: 'v3',
  },
  furry3: {
    ...BASE_CAPS,
    vibe: true, encodedVibe: false, smea: true, smeaDyn: true, dynThresh: true,
    noiseSchedule: true, autoSmea: true, scaleDefault: 6.2, scaleRecommended: [3, 9],
    qualityGroup: 'furry3', ucGroup: 'furry3',
  },
};

export function capsFor(modelId) {
  const m = MODEL_MAP[modelId];
  return CAPS[m ? m.family : 'v5'];
}

export function defaultParams(modelId) {
  const m = MODEL_MAP[modelId] || MODELS[0];
  const c = capsFor(modelId);
  return {
    model: modelId,
    width: 832,
    height: 1216,
    scale: c.scaleDefault,
    steps: m.kind === 'medium' ? 14 : c.stepsDefault,
    sampler: 'k_euler_ancestral',
    schedule: capsFor(modelId).noiseSchedule ? 'karras' : 'karras',
    seed: '',
    nSamples: 1,
    sm: false,
    smDyn: false,
    dyn: false,
    cfgRescale: 0,
    autoSmea: false,
    quality: 'standard',
    uc: 'heavy',
    transparent: false,
  };
}

/* --------------------------------------------------------------- quality tags */

const QUALITY = {
  v5: {
    standard: ', very aesthetic, masterpiece, no text',
    light: ', very aesthetic, amazing quality, no text',
  },
  'v45-full': {
    standard: ', location, very aesthetic, masterpiece, no text',
    light: ', location, very aesthetic, masterpiece, no text',
  },
  'v45-curated': {
    standard: ', location, masterpiece, no text, -0.8::feet::, rating:general',
    light: ', location, masterpiece, no text, -0.8::feet::, rating:general',
  },
  'v4-full': {
    standard: ', no text, best quality, very aesthetic, absurdres',
    light: ', no text, best quality, very aesthetic, absurdres',
  },
  'v4-curated': {
    standard: ', rating:general, amazing quality, very aesthetic, absurdres',
    light: ', rating:general, amazing quality, very aesthetic, absurdres',
  },
  v3: {
    standard: ', best quality, amazing quality, very aesthetic, absurdres',
    light: ', best quality, amazing quality, very aesthetic, absurdres',
  },
  furry3: {
    standard: ', {best quality}, {amazing quality}',
    light: ', {best quality}, {amazing quality}',
  },
};

export function qualityGroupFor(modelId) {
  const m = MODEL_MAP[modelId];
  if (!m) return 'v5';
  if (m.family === 'v5') return 'v5';
  if (m.family === 'v45') return m.kind === 'curated' ? 'v45-curated' : 'v45-full';
  if (m.family === 'v4') return m.kind === 'curated' ? 'v4-curated' : 'v4-full';
  if (m.family === 'furry3') return 'furry3';
  return 'v3';
}

export function qualityTags(modelId, preset = 'standard') {
  const g = QUALITY[qualityGroupFor(modelId)];
  return preset === 'none' || !g ? '' : (g[preset] ?? g.standard ?? '');
}

/* ---------------------------------------------------------- undesired content */

const UC = {
  v5: {
    heavy: 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page',
    light: 'lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::',
    human_focus: 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy',
    furry_focus: '{worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic',
  },
  'v45-full': {
    heavy: 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page',
    light: 'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page',
    human_focus: 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy',
    furry_focus: '{worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic',
  },
  'v45-curated': {
    heavy: 'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page',
    light: 'blurry, lowres, upscaled, artistic error, scan artifacts, jpeg artifacts, logo, too many watermarks, negative space, blank page',
    human_focus: 'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, bad anatomy, bad hands, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, @_@, mismatched pupils, glowing eyes, negative space, blank page',
  },
  'v4-full': {
    heavy: 'blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, multiple views, logo, too many watermarks',
    light: 'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing',
  },
  'v4-curated': {
    heavy: 'blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, logo, dated, signature, multiple views, gigantic breasts',
    light: 'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, logo, dated, signature',
  },
  v3: {
    heavy: 'lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract],',
    light: 'lowres, jpeg artifacts, worst quality, watermark, blurry, very displeasing,',
    human_focus: 'lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract], bad anatomy, bad hands, @_@, mismatched pupils, heart-shaped pupils, glowing eyes,',
  },
  furry3: {
    heavy: '{{worst quality}}, [displeasing], {unusual pupils}, guide lines, {{unfinished}}, {bad}, url, artist name, {{tall image}}, mosaic, {sketch page}, comic panel, impact (font), [dated], {logo}, ych, {what}, {where is your god now}, {distorted text}, repeated text, {floating head}, {1994}, {widescreen}, absolutely everyone, sequence, {compression artifacts}, hard translated, {cropped}, {commissioner name}, unknown text, high contrast,',
    light: '{worst quality}, guide lines, unfinished, bad, url, tall image, widescreen, compression artifacts, unknown text,',
  },
};

export function ucGroupFor(modelId) {
  const m = MODEL_MAP[modelId];
  if (!m) return 'v5';
  if (m.family === 'v5') return 'v5';
  if (m.family === 'v45') return m.kind === 'curated' ? 'v45-curated' : 'v45-full';
  if (m.family === 'v4') return m.kind === 'curated' ? 'v4-curated' : 'v4-full';
  if (m.family === 'furry3') return 'furry3';
  return 'v3';
}

export const UC_LABELS = {
  none: '无',
  heavy: 'Heavy',
  light: 'Light',
  human_focus: 'Human Focus',
  furry_focus: 'Furry Focus',
};

export function ucPresets(modelId) {
  const g = UC[ucGroupFor(modelId)] || {};
  return ['none', ...Object.keys(g)];
}

export function ucText(modelId, preset) {
  const g = UC[ucGroupFor(modelId)] || {};
  return preset && preset !== 'none' ? (g[preset] || '') : '';
}

/* ----------------------------------------------------------------- samplers */

export const SAMPLERS = [
  { id: 'k_euler_ancestral', label: 'Euler Ancestral', tag: 'recommended' },
  { id: 'k_euler', label: 'Euler' },
  { id: 'k_dpmpp_2m', label: 'DPM++ 2M' },
  { id: 'k_dpmpp_2m_sde', label: 'DPM++ 2M SDE' },
  { id: 'k_dpmpp_sde', label: 'DPM++ SDE' },
  { id: 'k_dpmpp_2s_ancestral', label: 'DPM++ 2S Ancestral' },
  { id: 'k_dpm_2', label: 'DPM2' },
  { id: 'k_dpm_2_ancestral', label: 'DPM2 Ancestral' },
  { id: 'k_dpmpp_3m_sde', label: 'DPM++ 3M SDE' },
  { id: 'k_dpm_fast', label: 'DPM Fast' },
  { id: 'k_dpm_adaptive', label: 'DPM Adaptive' },
  { id: 'k_lms', label: 'LMS' },
  { id: 'ddim', label: 'DDIM' },
  { id: 'plms', label: 'PLMS' },
  { id: 'ddim_v3', label: 'DDIM v3' },
  { id: 'nai_smea', label: 'SMEA' },
  { id: 'nai_smea_dyn', label: 'SMEA DYN' },
];

export function samplersFor(modelId) {
  const c = capsFor(modelId);
  if (c.smea) return SAMPLERS;
  // V4+ : modern samplers only, no SMEA / legacy PLMS
  return SAMPLERS.filter((s) => !['plms', 'k_lms', 'nai_smea', 'nai_smea_dyn', 'ddim_v3'].includes(s.id));
}

export const NOISE_SCHEDULES = [
  { id: 'native', label: 'Native' },
  { id: 'karras', label: 'Karras' },
  { id: 'exponential', label: 'Exponential' },
  { id: 'polyexponential', label: 'Polyexponential' },
];

export function schedulesFor(modelId) {
  const c = capsFor(modelId);
  if (!c.noiseSchedule) return [];
  return c.excludeNativeSchedule ? NOISE_SCHEDULES.filter((s) => s.id !== 'native') : NOISE_SCHEDULES;
}

/* -------------------------------------------------------------- resolutions */

export const ASPECTS = [
  { id: 'portrait', label: '竖图', w: 832, h: 1216 },
  { id: 'landscape', label: '横图', w: 1216, h: 832 },
  { id: 'square', label: '方图', w: 1024, h: 1024 },
];

export const SIZE_STEPS = [
  { id: 'small', label: '小', scale: 0.75 },
  { id: 'normal', label: '标准', scale: 1 },
  { id: 'large', label: '大', scale: 1.5 },
];

export function resolutionFor(aspectId, sizeId) {
  const a = ASPECTS.find((x) => x.id === aspectId) || ASPECTS[0];
  const s = SIZE_STEPS.find((x) => x.id === sizeId) || SIZE_STEPS[1];
  const round = (v) => Math.max(64, Math.round((v * s.scale) / 64) * 64);
  return { width: round(a.w), height: round(a.h) };
}

// NovelAI big-canvas sizes used by Precise Reference.
export const REF_CANVASES = [
  { w: 1024, h: 1536 },
  { w: 1472, h: 1472 },
  { w: 1536, h: 1024 },
];

/* ---------------------------------------------------------------- directors */

export const DIRECTORS = [
  { id: 'lineart', label: '线稿 Line Art', desc: '把图像还原成线稿', params: [] },
  { id: 'sketch', label: '草图 Sketch', desc: '生成早期草图版本', params: [] },
  { id: 'colorize', label: '上色 Colorize', desc: '给线稿上色 / 重新着色', params: ['prompt', 'defry'] },
  { id: 'emotion', label: '表情 Emotion', desc: '改变角色表情', params: ['emotion', 'defry'] },
  { id: 'declutter', label: '清理 Declutter', desc: '去除文字、浮动物件等杂乱元素', params: [] },
  { id: 'bg-removal', label: '去背景 Remove BG', desc: '抠出角色（透明背景）', params: [] },
];

export const EMOTIONS = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'excited', 'shy', 'worried', 'scared', 'disgusted'];

/* --------------------------------------------------------------- anlas cost */

export function estimateAnlas({ width, height, steps, nSamples, smea }) {
  const normal = 832 * 1216;
  const px = width * height;
  const stepFactor = Math.max(1, steps) / 28;
  const sampleFactor = Math.max(1, nSamples);
  const smeaFactor = smea ? 1.4 : 1;
  const base = (px / normal) * stepFactor * sampleFactor * smeaFactor;
  // Opus free window: <=28 steps, 1 sample, normal-ish canvas
  if (steps <= 28 && nSamples === 1 && px <= normal * 1.05) return 0;
  return Math.max(1, Math.ceil(base));
}

/* --------------------------------------------------------------------- misc */

export const LIMITS = {
  maxPixels: 4194304,       // 4 MP safety cap
  minDim: 64,
  maxDim: 2048,
  maxSamples: 4,
};

export function validateSize(w, h) {
  const errs = [];
  if (!Number.isFinite(w) || !Number.isFinite(h)) errs.push('尺寸无效');
  if (w % 64 !== 0) errs.push('宽度需为 64 的倍数');
  if (h % 64 !== 0) errs.push('高度需为 64 的倍数');
  if (w < LIMITS.minDim || h < LIMITS.minDim) errs.push('尺寸过小');
  if (w > LIMITS.maxDim || h > LIMITS.maxDim) errs.push('尺寸过大');
  if (w * h > LIMITS.maxPixels) errs.push('总像素超过 4MP');
  return errs;
}

export const DIRECTIONS = {
  negative: -1,
};

export const DEFAULT_STATE = {
  token: '',
  base: API_BASE,
  model: 'nai-diffusion-5-full',
  effort: 'high',
  mode: 't2i',
  prompt: '',
  negative: '',
  quality: 'standard',
  uc: 'heavy',
  aspect: 'portrait',
  size: 'normal',
  width: 832,
  height: 1216,
  steps: 23,
  scale: 7,
  sampler: 'k_euler_ancestral',
  schedule: 'karras',
  seed: '',
  nSamples: 1,
  sm: false,
  smDyn: false,
  dyn: false,
  cfgRescale: 0,
  autoSmea: false,
  transparent: false,
  furry: false,
  characters: [],
  charPosMode: 'ai',       // 'ai' | 'custom'
  styles: [],
  activeStyleId: null,
  batch: { characters: [], outfits: [], actions: [], styleIds: [] },
  batchJob: null,
  vibes: [],
  refs: [],
  i2i: { strength: 0.7, noise: 0 },
  inpaint: { strength: 0.7, brush: 48 },
  baseImage: null,         // { id, dataURL, name, w, h }
  stream: true,
  concurrency: 1,
  theme: 'dark',
  lang: 'zh',
  autosave: true,
  highlight: true,
  showPromptAssist: true,
  showTips: true,
  savePrompts: true,
  presets: [],
  chunks: [],
};
