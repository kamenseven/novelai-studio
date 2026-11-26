// Prompt helpers: randomizer, emphasis highlighting, token estimate, tag insertion.

import { MODEL_MAP, capsFor, qualityTags, ucText } from './config.js';

/** Expand NovelAI `||a|b|c||` randomizer sections (one random option each). */
export function expandRandomizer(text) {
  if (!text || !text.includes('||')) return text;
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('||', i)) {
      const end = text.indexOf('||', i + 2);
      if (end === -1) {
        out += text.slice(i);
        break;
      }
      const options = text.slice(i + 2, end).split('|');
      out += options[Math.floor(Math.random() * options.length)] ?? '';
      i = end + 2;
    } else {
      out += text[i++];
    }
  }
  return out.replace(/,\s*,+/g, ',').replace(/^\s*,\s*/, '').replace(/\s*,\s*$/, '');
}

/** Rough T5-ish token estimate, good enough for a budget bar. */
export function estimateTokens(text) {
  if (!text) return 0;
  const cjk = (text.match(/[\u3000-\u9fff\uff00-\uffef]/g) || []).length;
  const latin = text.replace(/[\u3000-\u9fff\uff00-\uffef]/g, ' ');
  const words = latin.split(/[\s,;|()\[\]{}]+/).filter(Boolean).length;
  return Math.ceil(cjk * 1.0 + words * 1.35);
}

export function tokenLimit(modelId) {
  const c = capsFor(modelId);
  const m = MODEL_MAP[modelId];
  if (!m) return 512;
  if (m.family === 'v5') return m.id.includes('curated') ? 703 : 1471;
  if (m.family === 'v45' || m.family === 'v4') return 512;
  return 225;
}

/** Append quality tags (NovelAI does this client-side). */
export function withQualityTags(prompt, modelId, preset) {
  if (!preset || preset === 'none') return prompt;
  const extra = qualityTags(modelId, preset);
  if (!extra) return prompt;
  return (prompt || '') + extra;
}

export function withUCPreset(negative, modelId, preset) {
  const presetText = ucText(modelId, preset);
  if (!presetText) return negative || '';
  if (!negative) return presetText;
  return `${presetText}, ${negative}`;
}

/** Detect quoted strings and append a `Text: ...` block for V5 (auto text rendering). */
export function autoTextBlock(prompt, modelId) {
  const m = MODEL_MAP[modelId];
  if (!m || m.family !== 'v5') return prompt;
  if (/\btext:\s/i.test(prompt)) return prompt;
  const quotes = [];
  const re = /[“"「『']([^”"」』'\n]{1,120})[”"」』']/g;
  let mm;
  while ((mm = re.exec(prompt))) {
    const s = mm[1].trim();
    if (s && !quotes.includes(s)) quotes.push(s);
  }
  if (!quotes.length) return prompt;
  return `${prompt}\nText: ${quotes.join('\n')}`;
}

export function preparePrompt(raw, modelId, { quality = 'standard', furry = false } = {}) {
  let p = (raw || '').trim();
  if (furry && capsFor(modelId).furryMode) {
    if (!/^(fur dataset\b|background dataset\b)/i.test(p)) p = 'fur dataset, ' + p;
  }
  p = withQualityTags(p, modelId, quality);
  p = expandRandomizer(p);
  p = autoTextBlock(p, modelId);
  return p.trim();
}

/* -------------------------------------------------------------- highlighting */

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function highlightHTML(text) {
  if (!text) return '';
  let out = '';
  let strong = 0;
  let weak = 0;
  let num = 0;
  let i = 0;
  const n = text.length;

  const open = (cls) => {
    out += `<span class="hl ${cls}">`;
  };
  const close = () => {
    out += '</span>';
  };

  while (i < n) {
    // Randomizer block
    if (text.startsWith('||', i)) {
      const end = text.indexOf('||', i + 2);
      if (end > i) {
        out += `<span class="hl hl-rand">${esc(text.slice(i, end + 2))}</span>`;
        i = end + 2;
        continue;
      }
    }
    // Numeric emphasis: 1.2:: ... ::   (also -0.5::)
    const rest = text.slice(i);
    const m = /^(-?\d+(?:\.\d+)?)::/.exec(rest);
    if (m && num === 0) {
      out += `<span class="hl hl-num">${esc(m[0])}`;
      num = 1;
      i += m[0].length;
      continue;
    }
    if (num > 0 && text.startsWith('::', i)) {
      out += '::</span>';
      num = 0;
      i += 2;
      continue;
    }
    const ch = text[i];
    if (ch === '{') {
      strong++;
      open('hl-strong');
      i++;
      continue;
    }
    if (ch === '}' && strong > 0) {
      strong--;
      close();
      i++;
      continue;
    }
    if (ch === '[') {
      weak++;
      open('hl-weak');
      i++;
      continue;
    }
    if (ch === ']' && weak > 0) {
      weak--;
      close();
      i++;
      continue;
    }
    if (!num && !strong && !weak && /^text:\s/i.test(text.slice(i, i + 6))) {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      out += `<span class="hl hl-text">${esc(text.slice(i, stop))}</span>`;
      i = stop;
      continue;
    }
    // consume run of plain characters
    let j = i + 1;
    while (j < n) {
      const c = text[j];
      if (c === '{' || c === '}' || c === '[' || c === ']') break;
      if (text.startsWith('||', j) || text.startsWith('::', j)) break;
      if (/^-?\d+(?:\.\d+)?::/.test(text.slice(j, j + 20))) break;
      if (!num && !strong && !weak && /^text:\s/i.test(text.slice(j, j + 6))) break;
      j++;
    }
    out += esc(text.slice(i, j));
    i = j;
  }
  while (strong-- > 0) close();
  while (weak-- > 0) close();
  if (num) close();
  return out;
}

/* --------------------------------------------------------------- autocomplete */

export function tagFragmentAt(text, caret) {
  const before = text.slice(0, caret);
  const start = Math.max(before.lastIndexOf(','), before.lastIndexOf('\n'), before.lastIndexOf('|')) + 1;
  const chunk = before.slice(start);
  // only suggest for the last unfinished tag, not natural language sentences
  if (chunk.length > 48 || chunk.trim().length < 1) return null;
  if (/[.!?。！？]/.test(chunk)) return null;
  return { start, end: caret, query: chunk.trim() };
}

export function insertTag(text, caret, tag) {
  const frag = tagFragmentAt(text, caret);
  if (!frag) return { text, caret };
  const before = text.slice(0, frag.start);
  const after = text.slice(frag.end);
  const sep = before && !/[\s,]$/.test(before) ? ', ' : '';
  const insert = sep + tag + ', ';
  const newText = before + insert + after;
  return { text: newText, caret: before.length + insert.length };
}

/** Remove emphasis markers for a readable filename. */
export function plainPrompt(prompt, max = 90) {
  return (prompt || '')
    .replace(/\|\|/g, '')
    .replace(/[{}[\]]/g, '')
    .replace(/-?\d+(?:\.\d+)?::/g, '')
    .replace(/\bText:.*$/gis, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
