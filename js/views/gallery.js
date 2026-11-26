// Gallery / history view backed by IndexedDB.

import { galleryAll, galleryDelete, gallerySetFav, galleryClear } from '../state.js';
import { $, el, svg, escapeHTML, formatDate, formatBytes, downloadBlob, t } from '../util.js';
import { toast, modal, confirmDialog, iconBtn, openViewer, emptyState, spinner } from '../ui.js';
import { registry } from '../plugins.js';
import {
  downloadResult, reuseSettings, sendToImg2Img, sendToInpaint, upscaleResult, runEnhanceDialog,
  directorResult, toggleFavorite, resultFilename,
} from '../actions.js';
import { capsFor } from '../config.js';
import { state } from '../state.js';

let items = [];
let filter = { q: '', fav: false, mode: 'all' };
let urlCache = new Map();

export async function mount(container, { navigate } = {}) {
  container.innerHTML = `
    <div class="gallery-view">
      <div class="gallery-head">
        <div class="search-wrap">
          ${svg('search')}
          <input class="input search" id="gallerySearch" placeholder="搜索提示词 / 模型 / 种子" />
        </div>
        <div class="gallery-filters">
          <button class="chip active" data-fav="0">全部</button>
          <button class="chip" data-fav="1">★ 收藏</button>
        </div>
        <button class="btn btn-sm" id="galleryClear">清空</button>
      </div>
      <div class="gallery-grid" id="galleryGrid"></div>
    </div>`;
  const grid = $('#galleryGrid', container);
  $('#gallerySearch', container).addEventListener('input', (e) => {
    filter.q = e.target.value.trim().toLowerCase();
    render();
  });
  container.querySelectorAll('[data-fav]').forEach((b) =>
    b.addEventListener('click', () => {
      filter.fav = b.dataset.fav === '1';
      container.querySelectorAll('[data-fav]').forEach((x) => x.classList.toggle('active', x === b));
      render();
    }),
  );
  $('#galleryClear', container).addEventListener('click', async () => {
    if (await confirmDialog('清空图库', '将删除本机保存的全部图片，无法恢复。确定吗？', { danger: true })) {
      await galleryClear();
      items = [];
      render();
      toast('图库已清空', 'ok');
    }
  });

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.gcard');
    if (!card) return;
    const rec = items.find((x) => x.id === card.dataset.id);
    if (!rec) return;
    if (e.target.closest('.gcard-fav')) {
      e.stopPropagation();
      toggleFavorite(rec).then(render);
      return;
    }
    openDetail(rec, navigate);
  });

  await load();
  render();
  return { reload: load };

  async function load() {
    items = await galleryAll();
  }

  function thumbUrl(rec) {
    if (urlCache.has(rec.id)) return urlCache.get(rec.id);
    const blob = rec.thumb || rec.blob;
    if (!blob) return '';
    const url = URL.createObjectURL(blob);
    urlCache.set(rec.id, url);
    return url;
  }

  function filtered() {
    return items.filter((r) => {
      if (filter.fav && !r.fav) return false;
      if (filter.q) {
        const hay = `${r.prompt || ''} ${r.model || ''} ${r.seed ?? ''}`.toLowerCase();
        if (!hay.includes(filter.q)) return false;
      }
      return true;
    });
  }

  function render() {
    grid.innerHTML = '';
    const list = filtered();
    if (!list.length) {
      grid.append(emptyState('image', items.length ? '没有匹配的图片' : '图库是空的', '生成的图片会自动保存在这里'));
      return;
    }
    const frag = document.createDocumentFragment();
    for (const rec of list) {
      const card = el('div', { class: 'gcard', dataset: { id: rec.id } });
      const img = el('img', { src: thumbUrl(rec), alt: '', loading: 'lazy' });
      const info = el('div', { class: 'gcard-info' },
        el('div', { class: 'gcard-prompt' }, rec.prompt || rec.meta?.prompt || '未命名'),
        el('div', { class: 'gcard-meta' }, `${rec.width || '?'}×${rec.height || '?'} · ${rec.model || ''}`));
      const fav = el('button', { class: `gcard-fav ${rec.fav ? 'on' : ''}`, title: '收藏' }, svg('star'));
      const badge = rec.mode && rec.mode !== 't2i' ? el('span', { class: 'gcard-badge' }, modeLabel(rec.mode)) : null;
      for (const n of [img, badge, fav, info]) if (n) card.append(n);
      frag.append(card);
    }
    grid.append(frag);
  }
}

function modeLabel(mode) {
  return { i2i: '图生图', inpaint: '重绘', upscale: '放大', enhance: '增强', director: '导演' }[mode] || mode;
}

function openDetail(rec, navigate) {
  const body = el('div', { class: 'detail' });
  const imgWrap = el('div', { class: 'detail-img' });
  const url = URL.createObjectURL(rec.blob);
  const img = el('img', { src: url, alt: '' });
  img.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
  img.addEventListener('click', () => openViewer(url, { caption: rec.prompt || '' }));
  imgWrap.append(img);

  const meta = rec.meta || {};
  const rows = [
    ['模型', rec.model || '—'],
    ['尺寸', `${rec.width || '?'} × ${rec.height || '?'}`],
    ['步数', rec.steps ?? meta.steps ?? '—'],
    ['引导', rec.scale ?? meta.scale ?? '—'],
    ['采样器', rec.sampler ?? meta.sampler ?? '—'],
    ['种子', rec.seed ?? meta.seed ?? '—'],
    ['生成时间', formatDate(rec.created)],
    ['文件大小', formatBytes(rec.size || rec.blob?.size)],
  ];
  const info = el('div', { class: 'detail-info' });
  const prompt = el('div', { class: 'detail-block' },
    el('div', { class: 'detail-label' }, '提示词'),
    el('div', { class: 'detail-text' }, rec.prompt || meta.prompt || '—'));
  const neg = el('div', { class: 'detail-block' },
    el('div', { class: 'detail-label' }, '负面提示词'),
    el('div', { class: 'detail-text dim' }, rec.negative || meta.uc || '—'));
  const table = el('div', { class: 'kv-table' });
  for (const [k, v] of rows) table.append(el('div', { class: 'kv-row' }, el('span', { class: 'k' }, k), el('span', { class: 'v mono' }, String(v))));
  info.append(table, prompt, neg);

  body.append(imgWrap, info);

  const actions = el('div', { class: 'detail-actions' });
  const act = (icon, label, fn, cls = '') => {
    const b = el('button', { class: `btn btn-sm ${cls}`, onclick: fn }, svg(icon), el('span', null, label));
    actions.append(b);
  };
  act('download', '下载', () => downloadResult(rec));
  act('sliders', '载入设置', () => {
    reuseSettings(rec);
    closeAll();
    navigate?.('#/generate');
  });
  act('image', '图生图', async () => {
    await sendToImg2Img(rec);
    closeAll();
    navigate?.('#/generate');
  });
  act('brush', '局部重绘', async () => {
    await sendToInpaint(rec);
    closeAll();
    navigate?.('#/generate');
  });
  if (capsFor(state.model).upscale) act('upscale', '放大 4x', () => upscaleResult(rec));
  act('spark', '增强', () => runEnhanceDialog(rec));
  act('wand', '导演工具', () => {
    const tools = ['lineart', 'sketch', 'colorize', 'emotion', 'declutter', 'bg-removal'];
    const labels = { lineart: '线稿', sketch: '草图', colorize: '上色', emotion: '表情', declutter: '清理', 'bg-removal': '去背景' };
    const panel = el('div', { class: 'director-sheet' });
    for (const t of tools) {
      const b = el('button', { class: 'director-row' }, el('span', { class: 'dir-name' }, labels[t]));
      b.addEventListener('click', async () => {
        await directorResult(rec, { tool: t });
      });
      panel.append(b);
    }
    modal({ title: '导演工具', body: panel });
  });
  act('copy', '复制种子', () => {
    navigator.clipboard?.writeText(String(rec.seed ?? '')).then(() => toast('种子已复制', 'ok'));
  });
  act('star', rec.fav ? '取消收藏' : '收藏', () => {
    toggleFavorite(rec).then(() => {
      closeAll();
      navigate?.('#/gallery');
    });
  }, rec.fav ? 'active' : '');
  act('trash', '删除', async () => {
    if (await confirmDialog('删除图片', '确定删除这张图片吗？', { danger: true })) {
      await galleryDelete(rec.id);
      closeAll();
      navigate?.('#/gallery');
    }
  }, 'btn-danger');

  for (const pa of registry.resultActions) {
    act(pa.icon || 'wand', pa.name, async () => {
      try {
        await pa.run({ state, toast, openViewer }, rec);
      } catch (e) {
        toast(`扩展操作失败：${e.message}`, 'error');
      }
    });
  }

  const m = modal({
    title: rec.prompt ? rec.prompt.slice(0, 60) : '图片详情',
    body,
    wide: true,
    actions: [{ label: '关闭' }],
  });
  m.body.append(actions);
  m.root.classList.add('detail-modal');

  function closeAll() {
    m.close();
    setTimeout(() => {
      document.querySelectorAll('.gallery-grid').forEach(() => {});
      window.dispatchEvent(new CustomEvent('nai:gallery-changed'));
    }, 50);
  }
}
