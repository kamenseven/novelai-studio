// Tools view: standalone upscale / enhance / director tools + plugin tools.

import { state, addResult, saveToGallery, galleryAll } from '../state.js';
import { $, el, svg, escapeHTML, formatBytes, loadImage, downloadBlob } from '../util.js';
import { toast, modal, openViewer, iconBtn, emptyState, select } from '../ui.js';
import {
  upscaleResult, runEnhanceDialog, directorResult, downloadResult, sendToImg2Img, resultFilename,
} from '../actions.js';
import { capsFor, DIRECTORS, EMOTIONS } from '../config.js';
import { registry } from '../plugins.js';
import { effectiveModel } from '../payload.js';

let source = null; // { blob, meta, prompt, name }
let pluginResult = null;

export function mount(container, { navigate }) {
  container.innerHTML = `
    <div class="tools-view">
      <div class="tools-head">
        <div>
          <div class="page-title">工具</div>
          <div class="page-sub">放大、增强与导演工具，也可以从图库或当前结果直接带入</div>
        </div>
      </div>

      <div class="tool-source card" id="toolSource"></div>

      <div class="tool-section-title">图像处理</div>
      <div class="tool-grid" id="toolGrid"></div>

      <div class="tool-section-title" id="pluginTitle" hidden>扩展工具</div>
      <div class="tool-grid" id="pluginGrid"></div>

      <div class="tool-result" id="toolResult" hidden></div>
    </div>`;

  const sourceBox = $('#toolSource', container);
  const grid = $('#toolGrid', container);
  const pluginGrid = $('#pluginGrid', container);
  const pluginTitle = $('#pluginTitle', container);
  const resultBox = $('#toolResult', container);

  buildSource();
  buildTools();
  buildPlugins();
  renderResult();

  window.addEventListener('nai:results', () => {
    if (container.isConnected) renderResult();
  });

  return { refresh: () => { buildSource(); renderResult(); } };

  /* source */

  function buildSource() {
    sourceBox.innerHTML = '';
    const head = el('div', { class: 'card-head' },
      el('span', { class: 'card-title' }, '输入图片'),
      el('div', { class: 'head-actions' },
        el('button', { class: 'btn btn-xs', onclick: pickFile }, svg('upload'), '上传'),
        el('button', { class: 'btn btn-xs', onclick: pickFromGallery }, svg('image'), '图库'),
        el('button', { class: 'btn btn-xs', onclick: useCurrent }, svg('spark'), '当前结果')));
    sourceBox.append(head);
    if (!source) {
      const dz = el('button', { class: 'drop-zone', type: 'button', onclick: pickFile },
        el('div', { class: 'dz-icon' }, svg('image')),
        el('div', { class: 'dz-text' }, '上传一张图片开始'),
        el('div', { class: 'dz-sub' }, '支持 PNG / JPEG / WebP'));
      sourceBox.append(dz);
      return;
    }
    const row = el('div', { class: 'source-row' });
    const img = el('img', { class: 'source-img', src: URL.createObjectURL(source.blob), alt: '' });
    const info = el('div', { class: 'source-info' },
      el('div', { class: 'source-name' }, source.name || 'image.png'),
      el('div', { class: 'source-meta mono' }, `${source.meta?.width || '?'}×${source.meta?.height || '?'} · ${formatBytes(source.blob.size)}`),
      el('div', { class: 'source-prompt dim' }, (source.prompt || '').slice(0, 120) || '（无提示词元数据）'));
    const actions = el('div', { class: 'source-actions' },
      el('button', { class: 'btn btn-xs', onclick: pickFile }, '替换'),
      el('button', { class: 'btn btn-xs', onclick: () => { source = null; buildSource(); } }, '移除'));
    row.append(img, info, actions);
    sourceBox.append(row);
  }

  function pickFile() {
    const input = el('input', { type: 'file', accept: 'image/*' });
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (!f) return;
      source = await analyzeFile(f);
      buildSource();
    });
    input.click();
  }

  async function analyzeFile(f) {
    const { readImageMeta } = await import('../api.js');
    const meta = await readImageMeta(f).catch(() => null);
    return { blob: f, meta, prompt: meta?.prompt || '', name: f.name };
  }

  async function pickFromGallery() {
    const items = await galleryAll();
    const body = el('div', { class: 'pick-grid' });
    if (!items.length) body.append(emptyState('image', '图库为空', '先去生成一些图片吧'));
    for (const rec of items.slice(0, 60)) {
      const b = el('button', { class: 'pick-item' });
      const url = URL.createObjectURL(rec.thumb || rec.blob);
      b.append(el('img', { src: url, alt: '', loading: 'lazy' }));
      b.addEventListener('click', () => {
        source = { blob: rec.blob, meta: rec.meta, prompt: rec.prompt, name: rec.model || 'gallery' };
        URL.revokeObjectURL(url);
        m.close();
        buildSource();
      });
      body.append(b);
    }
    const m = modal({ title: '从图库选择', body, wide: true });
  }

  function useCurrent() {
    const r = state.results.find((x) => x.id === state.activeResultId) || state.results[0];
    if (!r) return toast('还没有生成结果', 'info');
    source = { blob: r.blob, meta: r.meta, prompt: r.meta?.prompt || '', name: 'current.png' };
    buildSource();
    toast('已带入当前结果', 'ok');
  }

  /* tools */

  function buildTools() {
    grid.innerHTML = '';
    const cards = [
      {
        id: 'upscale',
        icon: 'upscale',
        title: '放大 4×',
        desc: 'V5 独立放大器，无提示词影响',
        badge: 'V5',
        run: () => runUpscale(),
      },
      {
        id: 'enhance',
        icon: 'spark',
        title: '增强 Enhance',
        desc: '按提示词二次生成，可同时放大',
        run: () => runEnhance(),
      },
      ...DIRECTORS.map((d) => ({
        id: d.id,
        icon: 'wand',
        title: d.label,
        desc: d.desc,
        run: () => runDirector(d),
      })),
    ];
    for (const c of cards) {
      const card = el('button', { class: 'tool-card', onclick: c.run },
        el('div', { class: 'tool-icon' }, svg(c.icon)),
        el('div', { class: 'tool-main' },
          el('div', { class: 'tool-title' }, c.title, c.badge ? el('span', { class: 'badge' }, c.badge) : null),
          el('div', { class: 'tool-desc' }, c.desc)));
      grid.append(card);
    }
  }

  function buildPlugins() {
    pluginGrid.innerHTML = '';
    const tools = registry.tools;
    pluginTitle.hidden = !tools.length;
    for (const t of tools) {
      const card = el('button', { class: 'tool-card plugin', onclick: () => runPlugin(t) },
        el('div', { class: 'tool-icon' }, svg(t.icon || 'wand')),
        el('div', { class: 'tool-main' },
          el('div', { class: 'tool-title' }, t.name, el('span', { class: 'badge badge-plugin' }, '扩展')),
          el('div', { class: 'tool-desc' }, t.description || '')));
      pluginGrid.append(card);
    }
  }

  function needSource() {
    if (!source) {
      toast('请先选择一张输入图片', 'info');
      return false;
    }
    return true;
  }

  async function runUpscale() {
    if (!needSource()) return;
    await upscaleResult({ blob: source.blob, meta: source.meta, prompt: source.prompt });
    renderResult();
  }

  async function runEnhance() {
    if (!needSource()) return;
    await runEnhanceDialog({ blob: source.blob, meta: source.meta, prompt: source.prompt });
    renderResult();
  }

  async function runDirector(d) {
    if (!needSource()) return;
    if (d.id === 'colorize' || d.id === 'emotion') {
      askDirectorParams(d);
      return;
    }
    await directorResult({ blob: source.blob, meta: source.meta }, { tool: d.id, model: effectiveModel(state) });
    renderResult();
  }

  function askDirectorParams(d) {
    const body = el('div', { class: 'form-stack' });
    let prompt = '';
    let emotion = 'happy';
    let defry = 0;
    if (d.id === 'emotion') {
      body.append(el('div', { class: 'field-label' }, '表情'));
      body.append(select(EMOTIONS.map((e) => ({ value: e, label: e })), emotion, (v) => (emotion = v)));
    } else {
      body.append(el('div', { class: 'field-label' }, '提示词（可选）'));
      const ta = el('textarea', { class: 'input', rows: 2, placeholder: 'red hair, blue eyes' });
      ta.addEventListener('input', () => (prompt = ta.value));
      body.append(ta);
    }
    const val = el('span', { class: 'range-val' }, '0.0');
    const range = el('input', { class: 'range', type: 'range', min: 0, max: 4, step: 0.1, value: 0 });
    range.addEventListener('input', () => {
      defry = Number(range.value);
      val.textContent = defry.toFixed(1);
    });
    body.append(el('div', { class: 'range-line' },
      el('div', { class: 'range-head' }, el('span', null, d.id === 'emotion' ? '表情强度 Defry' : 'Defry'), val), range));
    const m = modal({
      title: d.label,
      body,
      actions: [
        { label: '取消' },
        {
          label: '执行',
          primary: true,
          onClick: () => {
            const extra = { defry };
            if (d.id === 'emotion') {
              extra.prompt = emotion;
              extra.extra = '';
            } else extra.prompt = prompt;
            setTimeout(async () => {
              await directorResult({ blob: source.blob, meta: source.meta }, { tool: d.id, extra, model: effectiveModel(state) });
              renderResult();
            }, 50);
          },
        },
      ],
    });
  }

  async function runPlugin(tool) {
    if (!needSource()) return;
    try {
      const ctx = {
        state,
        addResult,
        saveToGallery,
        toast,
        openViewer,
        source: { ...source },
        utils: { loadImage, downloadBlob, resultFilename },
      };
      const out = await tool.run(ctx, { blob: source.blob, meta: source.meta, prompt: source.prompt });
      if (!out) return;
      const blob = out.blob || out;
      pluginResult = { blob, meta: out.meta || source.meta, prompt: out.prompt || source.prompt };
      const rec = addResult({ blob, meta: pluginResult.meta }, { mode: 'plugin' });
      await saveToGallery(rec, { mode: 'plugin', model: effectiveModel(state), prompt: pluginResult.prompt });
      renderResult();
      toast(`${tool.name} 完成`, 'ok');
    } catch (e) {
      console.error(e);
      toast(`扩展工具失败：${e.message}`, 'error');
    }
  }

  function renderResult() {
    const rec = state.results.find((x) => x.id === state.activeResultId);
    if (!rec) {
      resultBox.hidden = true;
      return;
    }
    resultBox.hidden = false;
    resultBox.innerHTML = '';
    const head = el('div', { class: 'card-head' },
      el('span', { class: 'card-title' }, '结果'),
      el('div', { class: 'head-actions' },
        el('button', { class: 'btn btn-xs', onclick: () => downloadResult(rec) }, svg('download'), '下载'),
        el('button', { class: 'btn btn-xs', onclick: () => sendToImg2Img(rec).then(() => navigate?.('#/generate')) }, svg('image'), '作为底图')));
    const img = el('img', { class: 'tool-result-img', src: rec.url, alt: '', onclick: () => openViewer(rec.url) });
    resultBox.append(head, img);
    if (pluginResult?.prompt) resultBox.append(el('div', { class: 'hint' }, pluginResult.prompt.slice(0, 160)));
  }
}
