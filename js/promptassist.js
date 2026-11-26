// Prompt assistant: Chinese annotations + lightweight linting (read-only until the user applies a fix).

import { tagInfo, suggestSimilar, tagsLoaded } from './tags.js';

export function splitTopLevel(text) {
  const parts = [];
  let start = 0;
  let brace = 0;
  let bracket = 0;
  let num = false;
  let rand = false;
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('||', i)) {
      rand = !rand;
      i++;
      continue;
    }
    if (rand) continue;
    if (text.startsWith('::', i)) {
      num = !num;
      i++;
      continue;
    }
    const ch = text[i];
    if (ch === '{') brace++;
    else if (ch === '}') brace = Math.max(0, brace - 1);
    else if (ch === '[') bracket++;
    else if (ch === ']') bracket = Math.max(0, bracket - 1);
    else if ((ch === ',' || ch === '\n') && brace === 0 && bracket === 0 && !num) {
      parts.push({ start, end: i, raw: text.slice(start, i) });
      start = i + 1;
    }
  }
  parts.push({ start, end: text.length, raw: text.slice(start) });
  return parts;
}

function cleanPlain(raw) {
  let s = raw.trim();
  s = s.replace(/^-?\d+(?:\.\d+)?::/, '');
  s = s.replace(/::$/, '');
  s = s.replace(/^[{\[]+/, '').replace(/[}\]]+$/, '');
  s = s.replace(/::/g, '').trim();
  return s;
}

export function stripWeightSyntax(raw) {
  return cleanPlain(raw);
}

export function parseSegmentWeight(raw) {
  const s = (raw || '').trim();
  const m = /^(-?\d+(?:\.\d+)?)::[\s\S]*::$/.exec(s);
  if (m) return Number(m[1]);
  let open = 0;
  for (const ch of s) {
    if (ch === '{') open++;
    else if (ch === '[') open--;
  }
  if (open) return Math.pow(1.05, open);
  return 1;
}

export function formatPrompt(text) {
  if (!text) return text;
  let t = text
    .replace(/[，、]/g, ',')
    .replace(/\u3000/g, ' ')
    .replace(/_/g, ' ');
  let textBlock = '';
  const m = /(^|\n)\s*text\s*:\s*([\s\S]*)$/i.exec(t);
  if (m) {
    textBlock = 'Text: ' + m[2].trim();
    t = t.slice(0, m.index);
  }
  const parts = splitTopLevel(t);
  const out = [];
  const seen = new Set();
  for (const p of parts) {
    let raw = p.raw.trim().replace(/\s+/g, ' ');
    raw = raw.replace(/^[,\s]+|[,\s]+$/g, '');
    if (!raw) continue;
    const wm = /^(-?\d+(?:\.\d+)?)\s*::\s*([\s\S]*?)\s*::$/.exec(raw);
    if (wm) {
      raw = `${Number(wm[1]).toFixed(1)}::${wm[2].trim()}::`;
    } else {
      const plain = cleanPlain(raw);
      if (plain) {
        const info = tagInfo(plain);
        if (info && plain !== plain.toLowerCase() && raw.includes(plain)) {
          raw = raw.replace(plain, info.tag);
        }
      }
    }
    const key = cleanPlain(raw).toLowerCase();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(raw);
  }
  let joined = out.join(', ');
  const openC = (joined.match(/\{/g) || []).length;
  const closeC = (joined.match(/\}/g) || []).length;
  if (openC > closeC) joined += '}'.repeat(openC - closeC);
  const openB = (joined.match(/\[/g) || []).length;
  const closeB = (joined.match(/\]/g) || []).length;
  if (openB > closeB) joined += ']'.repeat(openB - closeB);
  if ((joined.match(/::/g) || []).length % 2 === 1) joined += '::';
  if (textBlock) joined = (joined ? joined + '\n' : '') + textBlock;
  return joined.trim();
}

function lookupOne(raw) {
  const plain = cleanPlain(raw);
  if (!plain) return null;
  const info = tagInfo(plain) || (plain.includes('_') ? tagInfo(plain.replace(/_/g, ' ')) : null);
  return { plain, info };
}

function describeSegment(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^text\s*:/i.test(trimmed)) {
    return { kind: 'text', text: trimmed.replace(/^text\s*:/i, '').trim(), raw: trimmed };
  }
  if (trimmed.startsWith('||') && trimmed.endsWith('||')) {
    const options = trimmed.slice(2, -2).split('|').map((x) => lookupOne(x)).filter(Boolean);
    return { kind: 'random', parts: options, raw: trimmed };
  }
  if (trimmed.includes('|')) {
    const options = trimmed.split('|').map((x) => lookupOne(x)).filter(Boolean);
    return { kind: 'multi', parts: options, raw: trimmed };
  }
  const one = lookupOne(trimmed);
  return { kind: 'tag', plain: one?.plain || '', info: one?.info || null, raw: trimmed };
}

export function analyzePrompt(text, { modelFamily = 'v5' } = {}) {
  if (!text || !tagsLoaded()) return { segments: [], issues: [], stats: { known: 0, translated: 0, unknown: 0 } };
  let src = text;
  let textBlock = null;
  const tm = /\btext\s*:\s*([\s\S]*)$/i.exec(text);
  if (tm) {
    src = text.slice(0, tm.index);
    textBlock = {
      kind: 'text',
      text: tm[1].trim(),
      raw: text.slice(tm.index),
      start: tm.index,
      end: text.length,
    };
  }
  const parts = splitTopLevel(src);
  const segments = [];
  let known = 0;
  let translated = 0;
  let unknown = 0;

  for (const p of parts) {
    if (!p.raw.trim()) continue;
    const seg = describeSegment(p.raw);
    if (!seg) continue;
    const lead = p.raw.length - p.raw.trimStart().length;
    seg.start = p.start + lead;
    seg.end = seg.start + p.raw.trim().length;
    segments.push(seg);
    const infos = seg.kind === 'tag' ? [seg.info] : (seg.parts || []).map((x) => x.info);
    for (const info of infos) {
      if (info) {
        known++;
        if (info.zh) translated++;
      } else unknown++;
    }
  }
  if (textBlock && textBlock.text) segments.push(textBlock);

  const issues = [];
  const add = (issue) => issues.push(issue);

  if (/[，、]/.test(text)) {
    add({
      id: 'cjk-comma',
      level: 'warn',
      message: '检测到中文逗号，建议改为英文逗号',
      fix: (t) => t.replace(/[，、]/g, ','),
    });
  }
  if (/,\s*,/.test(text)) {
    add({
      id: 'double-comma',
      level: 'warn',
      message: '有多余的连续逗号',
      fix: (t) => t.replace(/,\s*,+/g, ','),
    });
  }
  if (/\s+,/.test(text)) {
    add({
      id: 'space-comma',
      level: 'info',
      message: '逗号前有多余空格',
      fix: (t) => t.replace(/\s+,/g, ','),
    });
  }
  if (text.includes('_')) {
    add({
      id: 'underscore',
      level: 'info',
      message: '标签里出现下划线，NovelAI 通常用空格',
      fix: (t) => t.replace(/_/g, ' '),
    });
  }

  const openC = (text.match(/\{/g) || []).length;
  const closeC = (text.match(/\}/g) || []).length;
  if (openC !== closeC) {
    add({
      id: 'brace-balance',
      level: 'warn',
      message: `花括号不平衡（{ ${openC} / } ${closeC}）`,
      fix: openC > closeC ? (t) => t + '}'.repeat(openC - closeC) : (t) => t.replace(/\}+$/, ''),
    });
  }
  const openB = (text.match(/\[/g) || []).length;
  const closeB = (text.match(/\]/g) || []).length;
  if (openB !== closeB) {
    add({
      id: 'bracket-balance',
      level: 'warn',
      message: `方括号不平衡（[ ${openB} / ] ${closeB}）`,
      fix: openB > closeB ? (t) => t + ']'.repeat(openB - closeB) : (t) => t.replace(/\]+$/, ''),
    });
  }
  const colons = (text.match(/::/g) || []).length;
  if (colons % 2 === 1) {
    add({
      id: 'numeric-emphasis',
      level: 'warn',
      message: '数值强调的 :: 没有闭合',
      fix: (t) => t + '::',
    });
  }

  // duplicates
  const seen = new Map();
  for (const seg of segments) {
    const key = seg.kind === 'tag' ? seg.plain.toLowerCase() : seg.raw.toLowerCase();
    if (!key) continue;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const dupKeys = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  if (dupKeys.length) {
    add({
      id: 'duplicate',
      level: 'info',
      message: `有 ${dupKeys.length} 个重复标签`,
      fix: (t) => {
        const seen2 = new Set();
        return splitTopLevel(t)
          .map((p) => p.raw.trim())
          .filter((raw) => {
            const seg = describeSegment(raw);
            const key = seg ? (seg.kind === 'tag' ? seg.plain.toLowerCase() : seg.raw.toLowerCase()) : '';
            if (!key) return true;
            if (seen2.has(key)) return false;
            seen2.add(key);
            return true;
          })
          .join(', ');
      },
    });
  }

  // suspicious single tags
  let fuzzyCount = 0;
  for (const seg of segments) {
    if (fuzzyCount >= 3) break;
    if (seg.kind !== 'tag' || !seg.plain) continue;
    if (seg.info) continue;
    const plain = seg.plain;
    if (/[\u3400-\u9fff]/.test(plain)) continue;
    if (plain.length < 4 || plain.length > 28) continue;
    if ((plain.match(/\s/g) || []).length > 1) continue;
    const similar = suggestSimilar(plain, 1);
    if (!similar.length) continue;
    const best = similar[0];
    fuzzyCount++;
    add({
      id: 'fuzzy-' + plain,
      level: 'warn',
      message: `「${plain}」未收录，可能是「${best.tag}」${best.zh ? '（' + best.zh + '）' : ''}`,
      fix: (t) => t.replace(plain, best.tag),
    });
  }

  // text block length
  const textLimit = modelFamily === 'v5' ? 750 : 118;
  for (const seg of segments) {
    if (seg.kind === 'text' && seg.text.length > textLimit) {
      add({
        id: 'text-length',
        level: 'info',
        message: `Text 内容 ${seg.text.length} 字，超过该模型约 ${textLimit} 字上限`,
      });
      break;
    }
  }

  return {
    segments,
    issues,
    stats: { known, translated, unknown },
  };
}

export function applyAllFixes(text, issues) {
  let out = text;
  for (const issue of issues) {
    if (typeof issue.fix === 'function') {
      try {
        out = issue.fix(out);
      } catch {}
    }
  }
  return out;
}
