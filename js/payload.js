// Builds NovelAI request bodies from UI state (schema current as of V5).

import { MODEL_MAP, capsFor, inpaintModelFor, estimateAnlas } from './config.js';
import { preparePrompt, withUCPreset, estimateTokens } from './prompt.js';
import { blobToB64 } from './api.js';
import { applyPromptTransforms } from './plugins.js';

export function effectiveModel(state) {
  if (state.model === 'nai-diffusion-5-full' && state.effort === 'medium') {
    return 'nai-diffusion-5-full-medium';
  }
  return state.model;
}

export function effectiveParams(state) {
  const model = effectiveModel(state);
  const caps = capsFor(model);
  const medium = model === 'nai-diffusion-5-full-medium';
  return {
    model,
    steps: medium ? 14 : Math.round(Number(state.steps) || caps.stepsDefault),
    scale: Number(state.scale) || caps.scaleDefault,
    sampler: medium ? 'k_euler_ancestral' : state.sampler,
    schedule: caps.noiseSchedule ? state.schedule : 'karras',
    uc: medium ? 'heavy' : state.uc,
    cfgRescale: medium ? 0 : Number(state.cfgRescale) || 0,
    autoSmea: caps.autoSmea ? !!state.autoSmea : false,
    sampleCount: Math.min(4, Math.max(1, Number(state.nSamples) || 1)),
  };
}

export async function buildRequest(state, { baseImage, mask, actionOverride } = {}) {
  const model = effectiveModel(state);
  const caps = capsFor(model);
  const ep = effectiveParams(state);
  const isInpaint = actionOverride ? actionOverride === 'infill' : state.mode === 'inpaint';
  const isI2I = actionOverride ? actionOverride === 'img2img' : state.mode === 'i2i';

  const prompt = applyPromptTransforms(
    preparePrompt(state.prompt, model, { quality: state.quality, furry: state.furry }),
    state,
  );
  const negative = withUCPreset(state.negative, model, ep.uc);
  const seed = state.seed === '' || state.seed == null ? undefined : Math.trunc(Number(state.seed)) || 0;

  const chars = (state.characters || []).filter((c) => c && c.prompt && c.prompt.trim());
  const customPos = state.charPosMode === 'custom' && caps.charMax > 0;
  const charCaptions = chars.map((c) => ({
    char_caption: c.prompt.trim(),
    centers: customPos ? [{ x: Number(c.x) || 0.5, y: Number(c.y) || 0.5 }] : [],
  }));
  const characterPrompts = chars.map((c) => ({
    prompt: c.prompt.trim(),
    uc: (c.uc || '').trim(),
    center: { x: Number(c.x) || 0.5, y: Number(c.y) || 0.5 },
    enabled: c.enabled !== false,
  }));
  const charUc = chars
    .filter((c) => (c.uc || '').trim())
    .map((c) => ({
      char_caption: c.uc.trim(),
      centers: customPos ? [{ x: Number(c.x) || 0.5, y: Number(c.y) || 0.5 }] : [],
    }));

  const params = {
    params_version: 4,
    width: Number(state.width),
    height: Number(state.height),
    scale: ep.scale,
    sampler: ep.sampler,
    steps: ep.steps,
    n_samples: ep.sampleCount,
    seed,
    ucPreset: 0,
    ucPresetId: ep.uc,
    qualityToggle: state.quality !== 'none',
    qualityPresetId: state.quality,
    autoSmea: ep.autoSmea,
    dynamic_thresholding: caps.dynThresh ? !!state.dyn : false,
    controlnet_strength: 1,
    legacy: false,
    add_original_image: true,
    use_coords: customPos,
    negative_prompt: negative,
    characterPrompts,
    v4_prompt: {
      use_coords: customPos,
      use_order: true,
      caption: { base_caption: prompt, char_captions: charCaptions },
    },
    v4_negative_prompt: {
      use_coords: customPos,
      use_order: true,
      caption: {
        base_caption: negative,
        char_captions: charUc.map((x) => ({ ...x })),
      },
    },
    reference_image_multiple: [],
    reference_information_extracted_multiple: [],
    reference_strength_multiple: [],
    normalize_reference_strength_multiple: true,
    skip_cfg_above_sigma: null,
  };

  if (caps.cfgRescale) params.cfg_rescale = ep.cfgRescale;
  if (caps.noiseSchedule) params.noise_schedule = ep.schedule;
  else if (MODEL_MAP[model]?.family === 'v5') params.noise_schedule = 'karras';
  if (caps.smea) {
    params.sm = !!state.sm;
    params.sm_dyn = caps.smeaDyn ? !!state.smDyn : false;
    if (params.sm_dyn) params.sm = true;
  }
  if (caps.legacyUC) params.legacy_uc = true;
  if (caps.transparent) {
    params.straight_alpha = !!state.transparent;
    params.tag_hint_transparent_background = !!state.transparent;
  }
  if (caps.charMax === 0) {
    delete params.characterPrompts;
    delete params.v4_prompt;
    delete params.v4_negative_prompt;
    delete params.use_coords;
  }

  // Vibe Transfer
  const vibes = (state.vibes || []).filter((v) => v && (v.encodedB64 || v.imageB64));
  if (vibes.length && caps.vibe) {
    params.reference_image_multiple = vibes.map((v) => v.encodedB64 || v.imageB64);
    params.reference_information_extracted_multiple = vibes.map((v) => Number(v.info ?? 1));
    params.reference_strength_multiple = vibes.map((v) => Number(v.strength ?? 0.6));
    params.normalize_reference_strength_multiple = state.normalizeVibes !== false;
  }

  // Precise Reference (V4.5 / V5)
  const refs = (state.refs || []).filter((r) => r && r.b64 && caps.precise);
  if (refs.length) {
    params.director_reference_images = refs.map((r) => r.b64);
    params.director_reference_descriptions = refs.map((r) => ({
      caption: { base_caption: referenceCaption(r), char_captions: [] },
      legacy_uc: false,
    }));
    params.director_reference_information_extracted = refs.map((r) => Number(r.info ?? 1));
    params.director_reference_strength_values = refs.map((r) => Number(r.strength ?? 0.6));
    params.director_reference_secondary_strength_values = refs.map((r) => 1 - Number(r.fidelity ?? 0.5));
  }

  if (isInpaint) {
    if (!baseImage || !mask) throw new Error('局部重绘需要底图和蒙版');
    params.image = await blobToB64(baseImage);
    params.mask = await blobToB64(mask);
    params.img2img = { strength: Number(state.inpaint?.strength ?? 0.7) };
    params.inpaintImg2ImgStrength = Number(state.inpaint?.strength ?? 0.7);
    params.add_original_image = true;
  } else if (isI2I) {
    if (!baseImage) throw new Error('图生图需要底图');
    params.image = await blobToB64(baseImage);
    params.strength = Number(state.i2i?.strength ?? 0.7);
    params.noise = Number(state.i2i?.noise ?? 0);
  }

  const action = isInpaint ? 'infill' : isI2I ? 'img2img' : 'generate';
  const sendModel = isInpaint ? inpaintModelFor(model) : model;
  const body = { input: prompt, model: sendModel, action, parameters: params };

  return {
    body,
    info: {
      model,
      sendModel,
      action,
      prompt,
      negative,
      chars: chars.map((c) => ({ prompt: c.prompt, uc: c.uc, x: c.x, y: c.y })),
      steps: ep.steps,
      width: params.width,
      height: params.height,
      scale: ep.scale,
      sampler: ep.sampler,
      seed,
      nSamples: ep.sampleCount,
      tokens: estimateTokens(prompt),
      anlas: estimateAnlas({
        width: params.width,
        height: params.height,
        steps: ep.steps,
        nSamples: ep.sampleCount,
        smea: !!(params.sm || params.sm_dyn),
      }),
      hasVibes: params.reference_image_multiple.length > 0,
      hasRefs: refs.length > 0,
    },
  };
}

function referenceCaption(r) {
  const type = r.type === 'style' ? 'style' : r.type === 'both' ? 'character&style' : 'character';
  const desc = (r.description || '').trim();
  return desc ? `${type}, ${desc}` : type;
}

export function modelLabel(id) {
  return MODEL_MAP[id]?.label || id;
}
