// Batch matrix: character × outfit × action × style combinations.

import { state, save, addResult, saveToGallery, galleryAll } from '../state.js';
import { MODEL_MAP, estimateAnlas } from '../config.js';
import { buildRequest, effectiveModel, effectiveParams } from '../payload.js';
import { generateImage } from '../api.js';
import { $, el, svg, escapeHTML, uuid, formatDate } from '../util.js';
import { toast, modal, confirmDialog, emptyState } from '../ui.js';
import { getActiveStyle } from '../styles.js';

let running = false;
let stopRequested = false;
let abortCtrl = null;
let currentPreview = null;
let uiRef = null;

const MAX_TASKS = 120;

export function mount(container, { navigate } = {}) {
  uiRef = { container, navigate };
  container.innerHTML = `
    <div class="batch-view">
      <div class="page-head">
        <div class="page-title">批量矩阵</div>
        <div class="page-sub">角色 × 服装 × 动作 × 风格，组合成任务队列逐张生成</div>
      </div>
      <div id="batchBody"></div>
    </div>`;
  render();
  return { refresh: render };
}

function normalizeBatch() {
  state.batch = state.batch || {};
  for (const key of ['characters', 'outfits', 'actions']) {
    if (!Array.isArray(state.batch[key])) state.batch[key] = [];
    state.batch[key] = state.batch[key].filter((x) => x && x.text);
  }
  if (!Array.isArray(state.batch.styleIds)) state.batch.styleIds = [];
  state.batch.styleIds = state.batch.styleIds.filter((id) => (state.styles || []).some((s) => s.id === id));
}

function dimensionValues() {
  normalizeBatch();
  const b = state.batch;
  return {
    characters: b.characters.length ? b.characters.map((x) => x.text) : [''],
    outfits: b.outfits.length ? b.outfits.map((x) => x.text) : [''],
    actions: b.actions.length ? b.actions.map((x) => x.text) : [''],
    styles: b.styleIds.length ? b.styleIds : [null],
  };
}

function taskCount() {
  const v = dimensionValues();
  return v.characters.length * v.outfits.length * v.actions.length * v.styles.length;
}

function compositionPrompt(character, outfit, action) {
  const parts = [state.prompt.trim(), character, outfit, action].map((x) => (x || '').trim()).filter(Boolean);
  return parts.join(', ');
}

function render() {
  if (!uiRef) return;
  const host = $('#batchBody', uiRef.container);
  if (!host || !host.isConnected) return;
  normalizeBatch();
  host.innerHTML = '';

  const job = state.batchJob;
  if (job && job.status !== 'done' && job.status !== 'discarded' && !running) {
    host.append(batchBanner(job));
  }

  const meta = el('div', { class: 'batch-summary card' });
  const model = MODEL_MAP[effectiveModel(state)];
  const ep = effectiveParams(state);
  const activeStyle = getActiveStyle(state, effectiveModel(state));
  const count = taskCount();
  const per = estimateAnlas({
    width: state.width, height: state.height, steps: ep.steps, nSamples: 1, smea: !!(state.sm || state.smDyn),
  });
  const totalAnlas = per * count;
  meta.innerHTML = `
    <div class="batch-summary-row">
      <span class="batch-summary-item"><b>${escapeHTML(model?.label || effectiveModel(state))}</b></span>
      <span class="batch-summary-item">${state.width} × ${state.height}</span>
      <span class="batch-summary-item">${ep.steps} 步 · CFG ${Number(ep.scale).toFixed(1)}</span>
      <span class="batch-summary-item">${activeStyle ? '风格：' + escapeHTML(activeStyle.name) : '无风格'}</span>
    </div>
    <div class="batch-summary-row">
      <span class="batch-summary-item"><b>${count}</b> 张</span>
      <span class="batch-summary-item dim">${per === 0 ? 'Opus 免费额度内' : `约 ${totalAnlas} Anlas`}</span>
      <span class="batch-summary-item dim">使用当前提示词、模型与参数</span>
    </div>`;
  host.append(meta);

  const grid = el('div', { class: 'batch-grid' });
  grid.append(dimCard('角色', 'characters', '1girl, silver hair, red eyes'));
  grid.append(dimCard('服装', 'outfits', 'black dress, lace trim'));
  grid.append(dimCard('动作', 'actions', 'standing, looking at viewer'));
  grid.append(styleDimCard());
  host.append(grid);

  const baseCard = el('div', { class: 'card batch-base' });
  const ta = el('textarea', { class: 'input batch-prompt', rows: 3, placeholder: '基础提示词（与生成页共享）' });
  ta.value = state.prompt;
  ta.addEventListener('input', () => {
    state.prompt = ta.value;
    save();
    renderSummaryLine();
  });
  baseCard.append(
    el('div', { class: 'card-head' }, el('span', { class: 'card-title' }, '基础提示词'), el('span', { class: 'hint' }, '留空则只用维度内容')),
    ta,
    el('div', { class: 'hint' }, '批量任务会自动追加：角色、服装、动作；风格模板的前缀/后缀由发送层拼接。'));
  host.append(baseCard);

  const runCard = el('div', { class: 'card batch-run' });
  const progress = el('div', { class: 'batch-progress' });
  const actions = el('div', { class: 'batch-run-actions' });
  const startBtn = el('button', { class: 'btn btn-primary' }, svg('bolt'), el('span', null, job && job.status === 'paused' ? '继续批次' : '开始批次'));
  startBtn.addEventListener('click', () => startJob(job && job.status === 'paused'));
  const stopBtn = el('button', { class: 'btn btn-danger' }, '停止');
  stopBtn.addEventListener('click', stopJob);
  stopBtn.hidden = !running;
  startBtn.hidden = running;
  actions.append(startBtn, stopBtn, el('span', { class: 'hint batch-count' }, `${count} 张任务`));
  runCard.append(actions, progress);
  host.append(runCard);
  const resultsHost = el('div', { class: 'batch-results-host' });
  host.append(resultsHost);

  renderProgress(job, progress, startBtn, stopBtn);
  renderResults(job, resultsHost);

  function renderSummaryLine() {
    const n = taskCount();
    const label = runCard.querySelector('.batch-count');
    if (label) label.textContent = `${n} 张任务`;
  }
}

function batchBanner(job) {
  const done = job.done + job.failed;
  const box = el('div', { class: 'batch-banner card' },
    el('div', { class: 'batch-banner-text' },
      el('b', null, '有未完成的批次'),
      el('span', { class: 'dim' }, ` ${done}/${job.total} · 创建于 ${formatDate(job.created)}`)),
    el('div', { class: 'row-line gap' },
      el('button', { class: 'btn btn-sm', onclick: () => startJob(true) }, '继续'),
      el('button', { class: 'btn btn-sm', onclick: discardJob }, '放弃')));
  return box;
}

function dimCard(title, key, placeholder) {
  const card = el('div', { class: 'card dim-card' });
  const items = state.batch[key];
  card.append(el('div', { class: 'card-head' },
    el('span', { class: 'card-title' }, title),
    el('span', { class: 'counter' }, `${items.length} 项`)));
  const chips = el('div', { class: 'dim-chips' });
  if (!items.length) chips.append(el('div', { class: 'hint' }, '留空 = 不参与组合（1 种）'));
  for (const item of items) {
    const chip = el('span', { class: 'dim-chip' },
      el('span', { class: 'dim-chip-text' }, item.text),
      el('button', { class: 'dim-chip-x', title: '移除', onclick: () => {
        state.batch[key] = state.batch[key].filter((x) => x.id !== item.id);
        save();
        render();
      } }, '×'));
    chips.append(chip);
  }
  const input = el('input', { class: 'input dim-input', placeholder });
  const add = () => {
    const text = input.value.trim();
    if (!text) return;
    state.batch[key].push({ id: uuid(), text });
    input.value = '';
    save();
    render();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  });
  const row = el('div', { class: 'dim-add' }, input, el('button', { class: 'btn btn-sm', onclick: add }, svg('plus')));
  card.append(chips, row);
  if (key === 'characters' && state.characters.length) {
    card.append(el('button', { class: 'btn btn-xs', onclick: () => {
      for (const c of state.characters) {
        if (c.prompt?.trim()) state.batch.characters.push({ id: uuid(), text: c.prompt.trim() });
      }
      save();
      render();
    } }, '从当前角色提示词导入'));
  }
  return card;
}

function styleDimCard() {
  const card = el('div', { class: 'card dim-card' });
  card.append(el('div', { class: 'card-head' },
    el('span', { class: 'card-title' }, '风格'),
    el('span', { class: 'counter' }, `${state.batch.styleIds.length} 项`)));
  if (!state.styles.length) {
    card.append(el('div', { class: 'hint' }, '还没有风格模板。到生成页「风格模板」新建，或使用示例。'));
    card.append(el('button', { class: 'btn btn-xs', onclick: () => uiRef.navigate?.('#/generate') }, '去创建风格'));
    return card;
  }
  const list = el('div', { class: 'dim-style-list' });
  for (const style of state.styles) {
    const on = state.batch.styleIds.includes(style.id);
    const b = el('button', { class: `chip ${on ? 'active' : ''}` }, style.name);
    b.addEventListener('click', () => {
      state.batch.styleIds = on
        ? state.batch.styleIds.filter((id) => id !== style.id)
        : [...state.batch.styleIds, style.id];
      save();
      render();
    });
    list.append(b);
  }
  card.append(list, el('div', { class: 'hint' }, '不选 = 使用生成页当前风格'));
  return card;
}

function createJob() {
  const v = dimensionValues();
  if (!state.batch.styleIds.length) v.styles = [state.activeStyleId];
  const total = v.characters.length * v.outfits.length * v.actions.length * v.styles.length;
  if (total > MAX_TASKS) {
    toast(`组合数 ${total} 超过上限 ${MAX_TASKS}，请减少维度项`, 'error', 4000);
    return null;
  }
  const tasks = [];
  const fixed = state.seed !== '' && state.seed != null;
  const baseSeed = fixed ? Number(state.seed) : null;
  v.characters.forEach((character) => {
    v.outfits.forEach((outfit) => {
      v.actions.forEach((action) => {
        v.styles.forEach((styleId) => {
          tasks.push({
            id: uuid(),
            character,
            outfit,
            action,
            styleId,
            prompt: compositionPrompt(character, outfit, action),
            seed: baseSeed,
            status: 'pending',
            error: null,
            resultId: null,
          });
        });
      });
    });
  });
  if (!tasks.length) return null;
  const snapshot = {
    model: state.model,
    width: state.width,
    height: state.height,
    steps: state.steps,
    scale: state.scale,
    sampler: state.sampler,
    schedule: state.schedule,
    quality: state.quality,
    uc: state.uc,
    furry: state.furry,
    transparent: state.transparent,
    negative: state.negative,
    basePrompt: state.prompt,
    styleId: state.activeStyleId,
  };
  return {
    id: 'batch-' + Date.now().toString(36),
    created: Date.now(),
    total: tasks.length,
    done: 0,
    failed: 0,
    status: 'running',
    tasks,
    snapshot,
  };
}

async function startJob(resume) {
  if (running) return;
  if (!state.token) return toast('请先在设置中填入 NovelAI Token', 'error');
  let job = resume ? state.batchJob : null;
  if (!job || job.status === 'done' || job.status === 'discarded') {
    job = createJob();
    if (!job) return;
    state.batchJob = job;
    save();
  } else if (!resume) {
    if (!(await confirmDialog('替换未完成批次', '当前有未完成批次，开始新批次会丢弃它（已生成的图片仍在图库）。继续？'))) return;
    job = createJob();
    if (!job) return;
    state.batchJob = job;
    save();
  }
  running = true;
  stopRequested = false;
  job.status = 'running';
  save();
  render();
  try {
    for (const task of job.tasks) {
      if (task.status === 'done') continue;
      if (stopRequested) break;
      task.status = 'running';
      render();
      const st = buildTaskState(job, task);
      abortCtrl = new AbortController();
      try {
        const { body, info } = await buildRequest(st, {});
        const images = await generateImage({
          payload: body,
          signal: abortCtrl.signal,
          stream: true,
          onProgress: ({ step, steps, preview }) => {
            if (preview) {
              if (currentPreview) URL.revokeObjectURL(currentPreview);
              currentPreview = URL.createObjectURL(preview);
            }
            updateProgress(job, task, step, steps);
          },
        });
        const img = images[0];
        const rec = addResult(img, { mode: 'batch', seed: img.meta?.seed ?? task.seed });
        await saveToGallery(rec, {
          mode: 'batch',
          model: info.model,
          prompt: info.prompt,
          width: info.width,
          height: info.height,
          steps: info.steps,
          scale: info.scale,
          sampler: info.sampler,
          batchId: job.id,
          styleName: info.styleName,
        });
        task.status = 'done';
        task.resultId = rec.id;
        job.done++;
      } catch (e) {
        if (e.name === 'AbortError') {
          task.status = 'pending';
          break;
        }
        task.status = 'failed';
        task.error = e.message || String(e);
        job.failed++;
      } finally {
        abortCtrl = null;
        if (job.done + job.failed >= job.total) job.status = 'done';
        save();
        render();
      }
    }
    job.status = job.done + job.failed >= job.total ? 'done' : 'paused';
    if (stopRequested) job.status = 'paused';
  } finally {
    running = false;
    stopRequested = false;
    save();
    if (currentPreview) {
      URL.revokeObjectURL(currentPreview);
      currentPreview = null;
    }
    render();
    if (job.done + job.failed >= job.total) toast(`批次完成：成功 ${job.done}${job.failed ? `，失败 ${job.failed}` : ''}`, 'ok', 4000);
    else toast('批次已暂停，可点「继续批次」', 'info', 3000);
  }
}

function buildTaskState(job, task) {
  const s = job.snapshot;
  return {
    ...clone(state),
    model: s.model,
    width: s.width,
    height: s.height,
    steps: s.steps,
    scale: s.scale,
    sampler: s.sampler,
    schedule: s.schedule,
    quality: s.quality,
    uc: s.uc,
    furry: s.furry,
    transparent: s.transparent,
    prompt: task.prompt,
    negative: s.negative,
    activeStyleId: task.styleId ?? null,
    seed: task.seed ?? '',
    nSamples: 1,
    mode: 't2i',
    characters: [],
    charPosMode: 'ai',
    baseImage: null,
    vibes: [],
    refs: [],
    i2i: { strength: 0.7, noise: 0 },
  };
}

function clone(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (['results', 'session', 'account', 'baseImage', 'vibes', 'refs', '_abort'].includes(k)) continue;
    try {
      out[k] = structuredClone(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function stopJob() {
  stopRequested = true;
  abortCtrl?.abort();
  toast('正在停止…', 'info', 1500);
}

function discardJob() {
  state.batchJob = null;
  save();
  render();
  toast('已丢弃批次记录（图片仍在图库）', 'ok');
}

function updateProgress(job, task, step, steps) {
  const card = $('#batchBody .batch-run');
  if (!card) return;
  let bar = card.querySelector('.batch-progress-fill');
  let text = card.querySelector('.batch-progress-text');
  let thumb = card.querySelector('.batch-progress-thumb');
  if (!bar) return;
  bar.style.width = `${steps ? Math.min(0.99, step / steps) * 100 : 8}%`;
  text.textContent = `任务 ${Math.min(job.done + job.failed + 1, job.total)}/${job.total} · 采样 ${step || 0}/${steps || '?'}`;
  if (currentPreview) {
    if (!thumb) {
      thumb = el('img', { class: 'batch-progress-thumb', alt: '' });
      card.querySelector('.batch-progress')?.prepend(thumb);
    }
    thumb.src = currentPreview;
  }
}

function renderProgress(job, box, startBtn, stopBtn) {
  box.innerHTML = '';
  if (!job) return;
  const done = job.done + job.failed;
  const activeTask = job.tasks.find((t) => t.status === 'running') || job.tasks.find((t) => t.status === 'pending');
  const head = el('div', { class: 'batch-progress-text' },
    running
      ? `任务 ${Math.min(done + 1, job.total)}/${job.total}${activeTask ? ' · ' + activeTask.character : ''}`
      : `进度 ${done}/${job.total}${job.failed ? ` · 失败 ${job.failed}` : ''}`);
  const track = el('div', { class: 'progress-bar' }, el('div', { class: 'batch-progress-fill progress-fill', style: { width: `${(done / job.total) * 100}%` } }));
  box.append(head, track);
  if (currentPreview) box.prepend(el('img', { class: 'batch-progress-thumb', src: currentPreview, alt: '' }));
  if (job.status === 'done' || job.status === 'paused') {
    const row = el('div', { class: 'row-line gap' },
      el('span', { class: 'hint' }, `${job.done} 成功 · ${job.failed} 失败`),
      el('button', { class: 'btn btn-xs', onclick: discardJob }, '清除记录'));
    box.append(row);
  }
  if (startBtn) startBtn.hidden = running;
  if (stopBtn) stopBtn.hidden = !running;
}

let resultsSeq = 0;

async function renderResults(job, host) {
  if (!host || !host.isConnected) return;
  host.innerHTML = '';
  if (!job || !job.id) return;
  const seq = ++resultsSeq;
  const all = await galleryAll();
  if (seq !== resultsSeq || !host.isConnected) return;
  const items = all.filter((x) => x.batchId === job.id);
  if (!items.length) return;
  const wrap = el('div', { class: 'batch-results-wrap' },
    el('div', { class: 'section-title' }, el('h3', null, '批次结果'), el('span', { class: 'hint' }, `${items.length} 张`)),
    el('div', { class: 'batch-results' }));
  const grid = wrap.querySelector('.batch-results');
  for (const rec of items) {
    const b = el('button', { class: 'batch-thumb', title: rec.prompt || '' });
    const url = URL.createObjectURL(rec.thumb || rec.blob);
    b.append(el('img', { src: url, alt: '', loading: 'lazy' }));
    b.addEventListener('click', () => {
      window.open(URL.createObjectURL(rec.blob), '_blank');
    });
    grid.append(b);
  }
  host.append(wrap);
}
