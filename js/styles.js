// Style templates: prefix / suffix / negative plus optional model targeting and overrides.

import { MODEL_MAP } from './config.js';

export const STYLE_FAMILIES = [
  { id: 'v5', label: 'V5' },
  { id: 'v45', label: 'V4.5' },
  { id: 'v4', label: 'V4' },
  { id: 'v3', label: 'V3' },
  { id: 'furry3', label: 'Furry V3' },
];

export function familyOf(modelId) {
  return MODEL_MAP[modelId]?.family || 'v5';
}

export function styleApplies(style, modelId) {
  const models = style?.models || [];
  return !models.length || models.includes(familyOf(modelId));
}

export function getActiveStyle(state, modelId) {
  if (!state?.activeStyleId) return null;
  const style = (state.styles || []).find((s) => s.id === state.activeStyleId);
  if (!style) return null;
  return styleApplies(style, modelId) ? style : null;
}

const joinParts = (...parts) =>
  parts
    .map((p) => (p || '').trim())
    .filter(Boolean)
    .join(', ');

export function buildStyledPrompt(style, prompt) {
  if (!style) return prompt || '';
  return joinParts(style.prefix, prompt, style.suffix);
}

export function buildStyledNegative(style, negative) {
  if (!style) return negative || '';
  return joinParts(style.negative, negative);
}

export function newStyle(patch = {}) {
  return {
    id: 'style-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: '新风格',
    prefix: '',
    suffix: '',
    negative: '',
    models: [],
    steps: null,
    scale: null,
    createdAt: Date.now(),
    ...patch,
  };
}

export function sampleStyles() {
  return [
    newStyle({
      name: '示例 · 电影感',
      prefix: 'cinematic lighting, dramatic shadows, film grain, wide shot',
      suffix: 'depth of field, 35mm photo, muted colors',
      negative: 'flat lighting, overexposed, low contrast',
      models: ['v5', 'v45'],
    }),
    newStyle({
      name: '示例 · 柔和动画',
      prefix: 'anime coloring, soft lighting, pastel colors',
      suffix: 'clean lineart, detailed eyes, airy atmosphere',
      negative: 'harsh shadows, oversaturated',
      models: ['v5', 'v45', 'v4'],
    }),
    newStyle({
      name: '示例 · 厚涂',
      prefix: 'painterly, thick brushstrokes, impasto, textured canvas',
      suffix: 'visible brushwork, rich color',
      negative: 'flat colors, vector, clean lineart',
      models: ['v5', 'v45'],
    }),
  ];
}
