// Main generation view: text2img / img2img / inpaint, characters, vibes, references.

import {
  state, save, addResult, saveToGallery, setActiveResult, activeResult, removeResult,
  saveBaseImage, addVibe, updateVibe, removeVibe, addRef, updateRef, removeRef, subscribe,
} from '../state.js';
import {
  MODELS, MODEL_MAP, ASPECTS, SIZE_STEPS, LIMITS, DIRECTORS,
  capsFor, qualityTags, ucPresets, ucText, samplersFor, schedulesFor, resolutionFor,
  validateSize, estimateAnlas,
} from '../config.js';
import { buildRequest, effectiveModel, effectiveParams } from '../payload.js';
import { generateImage, encodeVibe, suggestTags, blobToB64 } from '../api.js';
import {
  highlightHTML, estimateTokens, tokenLimit, tagFragmentAt, insertTag, preparePrompt, plainPrompt,
} from '../prompt.js';
import {
  $, $$, el, svg, escapeHTML, clamp, debounce, uuid, randomSeed, dataURLToBlob,
  blobToDataURL, loadImage, canvasToBlob, fitReferenceCanvas, downloadBlob, sanitizeFilename, t, idb,
} from '../util.js';
import {
  toast, modal, confirmDialog, openViewer, segmented, select, slider, switchRow, accordion, iconBtn,
} from '../ui.js';
import {
  downloadResult, reuseSettings, sendToImg2Img, sendToInpaint, upscaleResult, runEnhanceDialog,
  directorResult, toggleFavorite,
} from '../actions.js';

const MAX_VIBES = 16;
const MAX_REFS = 4;

export function mount(container) {
  container.innerHTML = template();
  const els = {
    modelBtn: $('#modelBtn', container),
    modelBadge: $('#modelBadge', container),
    modelName: $('#modelName', container),
    modelSub: $('#modelSub', container),
    effortBtn: $('#effortBtn', container),
    furryBtn: $('#furryBtn', container),
    transparentBtn: $('#transparentBtn', container),
    modeTabs: $('#modeTabs', container),
    prompt: $('#promptInput', container),
    hl: $('#promptHL', container),
    tagPop: $('#tagPop', container),
    tokenCount: $('#tokenCount', container),
    tokenBar: $('#tokenBar', container),
    quality: $('#qualitySel', container),
    ucSel: $('#ucSel', container),
    negative: $('#negativeInput', container),
    negWrap: $('#negWrap', container),
    negToggle: $('#negToggle', container),
    aspectSeg: $('#aspectSeg', container),
    sizeSeg: $('#sizeSeg', container),
    resW: $('#resW', container),
    resH: $('#resH', container),
    resLabel: $('#resLabel', container),
    resWarn: $('#resWarn', container),
    advanced: $('#advanced', container),
    charsBox: $('#charsBox', container),
    charsCount: $('#charsCount', container),
    charPosMode: $('#charPosMode', container),
    vibesBox: $('#vibesBox', container),
    vibesHint: $('#vibesHint', container),
    refsBox: $('#refsBox', container),
    refsHint: $('#refsHint', container),
    modePanel: $('#modePanel', container),
    cost: $('#costChip', container),
    genBtn: $('#genBtn', container),
    queueBadge: $('#queueBadge', container),
    stageImg: $('#stageImg', container),
    stageEmpty: $('#stageEmpty', container),
    stageProgress: $('#stageProgress', container),
    progressFill: $('#progressFill', container),
    progressText: $('#progressText', container),
    progressThumb: $('#progressThumb', container),
    resultStrip: $('#resultStrip', container),
    stageMeta: $('#stageMeta', container),
    stageActions: $('#stageActions', container),
    controls: $('#controls', container),
    tokenWarn: $('#tokenWarn', container),
    qualityRow: $('#qualityRow', container),
    negativeCount: $('#negativeCount', container),
    samplerRow: $('#samplerRow', container),
    scheduleRow: $('#scheduleRow', container),
    advancedBody: $('#advancedBody', container),
    dropZone: $('#dropZone', container),
  };

  const ui = { els, container };
  subscribe((type) => {
    if (!container.isConnected) return;
    if (type === 'results') {
      renderStage(ui);
      renderStrip(ui);
      renderHeaderActions(ui);
    }
  });
  bind(ui);
  renderAll(ui);
  return ui;
}

function template() {
  return `
  <div class="gen">
    <aside class="controls" id="controls">      <div class="model-card card" id="modelCard">
        <button class="model-btn" id="modelBtn">
          <span class="model-badge" id="modelBadge">V5</span>
          <span class="model-info">
            <span class="model-name" id="modelName">V5 Full</span>
            <span class="model-sub" id="modelSub"></span>
          </span>
          <span class="model-chevron">${svg('chevron')}</span>
        </button>
        <div class="model-toggles">
          <button class="chip" id="effortBtn" title="Effort">Effort · High</button>
          <button class="chip" id="furryBtn" title="Furry mode">Furry</button>
          <button class="chip chip-ghost" id="transparentBtn" title="Transparent background">透明背景</button>
        </div>
      </div>

      <div class="mode-tabs" id="modeTabs">
        <button class="mode-tab active" data-mode="t2i"><span>文生图</span></button>
        <button class="mode-tab" data-mode="i2i"><span>图生图</span></button>
        <button class="mode-tab" data-mode="inpaint"><span>局部重绘</span></button>
      </div>

      <div class="card prompt-card">
        <div class="card-head">
          <span class="card-title">提示词</span>
          <span class="counter" id="tokenCount">0</span>
        </div>
        <div class="prompt-wrap">
          <div class="prompt-hl" id="promptHL"></div>
          <textarea id="promptInput" class="prompt-input" spellcheck="false" autocapitalize="off" placeholder="1girl, solo, silver hair, ..."></textarea>
          <div class="tag-pop" id="tagPop" hidden></div>
        </div>
        <div class="token-track"><div class="token-fill" id="tokenBar"></div></div>
        <div class="token-warn" id="tokenWarn" hidden>提示词过长，超出部分可能被截断</div>

        <div class="prompt-bar">
          <label class="mini-field">质量
            <select id="qualitySel" class="mini-select"></select>
          </label>
          <button class="mini-toggle" id="negToggle">负面提示词 <span class="chev">${svg('chevron')}</span></button>
        </div>
        <div class="neg-wrap" id="negWrap" hidden>
          <div class="neg-head">
            <select id="ucSel" class="mini-select"></select>
            <span class="counter" id="negativeCount">0</span>
          </div>
          <textarea id="negativeInput" class="neg-input" spellcheck="false" placeholder="lowres, bad anatomy, ..."></textarea>
        </div>
      </div>

      <div class="card res-card">
        <div class="card-head">
          <span class="card-title">分辨率</span>
          <span class="res-label" id="resLabel">832 × 1216</span>
        </div>
        <div class="seg" id="aspectSeg"></div>
        <div class="seg" id="sizeSeg"></div>
        <div class="res-custom">
          <input class="input num" id="resW" type="number" inputmode="numeric" step="64" />
          <span class="x">×</span>
          <input class="input num" id="resH" type="number" inputmode="numeric" step="64" />
          <button class="icon-btn" id="swapRes" title="交换宽高">${svg('swap')}</button>
        </div>
        <div class="res-warn" id="resWarn"></div>
      </div>

      <div class="mode-panel" id="modePanel"></div>

      <section class="acc" id="advanced">
        <button class="acc-head" type="button" data-acc>
          <span class="acc-title">高级参数</span>
          <span class="acc-badge" id="advBadge"></span>
          <span class="acc-caret">${svg('chevron')}</span>
        </button>
        <div class="acc-body"><div class="adv-body" id="advancedBody"></div></div>
      </section>

      <section class="acc" id="charsAcc">
        <button class="acc-head" type="button" data-acc>
          <span class="acc-title">多角色提示词 <em id="charsCount">0</em></span>
          <span class="acc-caret">${svg('chevron')}</span>
        </button>
        <div class="acc-body">
          <div class="chars-top">
            <div id="charPosMode"></div>
            <button class="btn btn-sm" id="addChar">${svg('plus')} 角色</button>
          </div>
          <div class="chars-box" id="charsBox"></div>
        </div>
      </section>

      <section class="acc" id="vibesAcc">
        <button class="acc-head" type="button" data-acc>
          <span class="acc-title">Vibe 迁移 <em id="vibesCount">0</em></span>
          <span class="acc-caret">${svg('chevron')}</span>
        </button>
        <div class="acc-body">
          <div class="hint" id="vibesHint"></div>
          <div class="vibes-box" id="vibesBox"></div>
          <div class="acc-actions">
            <button class="btn btn-sm" id="addVibe">${svg('plus')} 添加参考</button>
            <button class="btn btn-sm" id="exportVibes">导出</button>
            <button class="btn btn-sm" id="importVibeFile">导入 .naiv4vibe</button>
          </div>
          <div id="vibeNormalize"></div>
        </div>
      </section>

      <section class="acc" id="refsAcc">
        <button class="acc-head" type="button" data-acc>
          <span class="acc-title">精准参考 Precise Ref <em id="refsCount">0</em></span>
          <span class="acc-caret">${svg('chevron')}</span>
        </button>
        <div class="acc-body">
          <div class="hint" id="refsHint"></div>
          <div class="refs-box" id="refsBox"></div>
          <div class="acc-actions">
            <button class="btn btn-sm" id="addRef">${svg('plus')} 参考图</button>
          </div>
        </div>
      </section>

      <div class="gen-bar">
        <div class="cost-chip" id="costChip">免费</div>
        <button class="btn btn-primary btn-gen" id="genBtn">${svg('bolt')} <span>生成图片</span></button>
        <span class="queue-badge" id="queueBadge" hidden></span>
      </div>
    </aside>

    <section class="stage">
      <div class="stage-head">
        <div class="stage-meta" id="stageMeta"></div>
        <div class="stage-actions" id="stageActions"></div>
      </div>
      <div class="stage-scroll">
        <div class="stage-canvas">
          <img class="stage-img" id="stageImg" alt="" hidden />
          <div class="stage-empty" id="stageEmpty">
            <div class="se-icon">${svg('spark')}</div>
            <div class="se-title">开始你的创作</div>
            <div class="se-sub">填写提示词，点击下方「生成图片」</div>
          </div>
          <div class="stage-progress" id="stageProgress" hidden>
            <img class="progress-thumb" id="progressThumb" alt="" />
            <div class="progress-meta">
              <div class="progress-text" id="progressText">准备中…</div>
              <div class="progress-bar"><div class="progress-fill" id="progressFill"></div></div>
            </div>
          </div>
        </div>
      </div>
      <div class="result-strip" id="resultStrip"></div>
    </section>
  </div>`;
}

/* --------------------------------------------------------------------- bind */

function bind(ui) {
  const { els } = ui;

  els.modelBtn.addEventListener('click', () => openModelSheet(ui));
  els.effortBtn.addEventListener('click', () => {
    const medium = state.model === 'nai-diffusion-5-full-medium';
    if (!medium && state.model !== 'nai-diffusion-5-full') return;
    state.model = medium ? 'nai-diffusion-5-full' : 'nai-diffusion-5-full-medium';
    state.effort = medium ? 'high' : 'medium';
    applyModelDefaults(ui);
    save();
    renderAll(ui);
    toast(medium ? '已切换 High effort（V5 Full）' : '已切换 Medium effort（14 步蒸馏）', 'ok', 1800);
  });
  els.furryBtn.addEventListener('click', () => {
    if (!capsFor(state.model).furryMode) return;
    state.furry = !state.furry;
    save();
    renderHeader(ui);
  });
  els.transparentBtn?.addEventListener('click', () => {
    if (!capsFor(state.model).transparent) {
      toast('当前模型不支持透明背景（需 V5）', 'error');
      return;
    }
    state.transparent = !state.transparent;
    save();
    renderHeader(ui);
  });

  els.modeTabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    state.mode = b.dataset.mode;
    if ((state.mode === 'i2i' || state.mode === 'inpaint') && !state.baseImage) {
      toast('请先添加一张底图', 'info');
    }
    save();
    renderModePanel(ui);
    renderHeader(ui);
  });

  els.prompt.addEventListener('input', () => {
    state.prompt = els.prompt.value;
    save();
    updatePromptUI(ui);
    scheduleSuggest(ui);
  });
  els.prompt.addEventListener('scroll', syncHighlightScroll);
  els.prompt.addEventListener('keydown', (e) => onPromptKey(ui, e));
  els.prompt.addEventListener('blur', () => setTimeout(() => hideSuggest(ui), 180));

  els.negative.addEventListener('input', () => {
    state.negative = els.negative.value;
    save();
    els.negativeCount.textContent = estimateTokens(els.negative.value);
  });
  els.negToggle.addEventListener('click', () => {
    els.negWrap.hidden = !els.negWrap.hidden;
    els.negToggle.classList.toggle('open', !els.negWrap.hidden);
  });

  els.quality.addEventListener('change', () => {
    state.quality = els.quality.value;
    save();
    updatePromptUI(ui);
  });
  els.ucSel.addEventListener('change', () => {
    state.uc = els.ucSel.value;
    save();
    updatePromptUI(ui);
  });

  els.aspectSeg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-aspect]');
    if (!b) return;
    state.aspect = b.dataset.aspect;
    if (state.aspect === 'custom') {
      save();
      renderResolution(ui);
      updateCost(ui);
      return;
    }
    state.size = state.size === 'custom' ? 'normal' : state.size;
    const r = resolutionFor(state.aspect, state.size === 'custom' ? 'normal' : state.size);
    state.width = r.width;
    state.height = r.height;
    save();
    renderResolution(ui);
    updateCost(ui);
  });
  els.sizeSeg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-size]');
    if (!b) return;
    state.size = b.dataset.size;
    state.aspect = state.aspect === 'custom' ? 'portrait' : state.aspect;
    const r = resolutionFor(state.aspect, state.size);
    state.width = r.width;
    state.height = r.height;
    save();
    renderResolution(ui);
    updateCost(ui);
  });
  const onResInput = () => {
    const w = Number(els.resW.value);
    const h = Number(els.resH.value);
    if (!w || !h) return;
    state.width = w;
    state.height = h;
    state.aspect = 'custom';
    state.size = 'custom';
    save();
    renderResolution(ui, true);
    updateCost(ui);
  };
  els.resW.addEventListener('change', onResInput);
  els.resH.addEventListener('change', onResInput);
  $('#swapRes', ui.container).addEventListener('click', () => {
    [state.width, state.height] = [state.height, state.width];
    save();
    renderResolution(ui);
    updateCost(ui);
  });

  // accordion headers
  for (const acc of $$('.acc', ui.container)) {
    $('.acc-head', acc)?.addEventListener('click', () => acc.classList.toggle('open'));
  }

  els.genBtn.addEventListener('click', () => enqueue(ui));

  $('#addChar', ui.container).addEventListener('click', () => addCharacter(ui));
  $('#addVibe', ui.container).addEventListener('click', () => pickVibeImages(ui));
  $('#importVibeFile', ui.container).addEventListener('click', () => pickVibeFiles(ui));
  $('#exportVibes', ui.container).addEventListener('click', () => exportVibes(ui));
  $('#addRef', ui.container).addEventListener('click', () => pickRefImages(ui));
}

/* ------------------------------------------------------------------- render */

function renderAll(ui) {
  renderHeader(ui);
  renderQualityOptions(ui);
  elsSet(ui, 'prompt', state.prompt);
  elsSet(ui, 'negative', state.negative);
  renderResolution(ui);
  renderModePanel(ui);
  renderAdvanced(ui);
  renderCharacters(ui);
  renderVibes(ui);
  renderRefs(ui);
  updatePromptUI(ui);
  updateCost(ui);
  renderStage(ui);
  renderStrip(ui);
}

function elsSet(ui, key, value) {
  const map = { prompt: 'prompt', negative: 'negative' };
  const node = ui.els[map[key]];
  if (node && node.value !== value) node.value = value;
}

function renderHeader(ui) {
  const { els } = ui;
  const model = MODEL_MAP[effectiveModel(state)] || MODELS[0];
  const caps = capsFor(effectiveModel(state));
  const medium = effectiveModel(state) === 'nai-diffusion-5-full-medium';
  els.modelBadge.textContent = model.version || 'V5';
  els.modelName.textContent = model.label;
  els.modelSub.textContent = model.subtitle || '';
  els.modelSub.classList.toggle('warn-text', medium);

  const effortAvailable = effectiveModel(state) === 'nai-diffusion-5-full' || medium;
  els.effortBtn.hidden = !effortAvailable;
  els.effortBtn.textContent = `Effort · ${medium ? 'Medium' : 'High'}`;
  els.effortBtn.classList.toggle('active', medium);
  els.furryBtn.hidden = !caps.furryMode;
  els.furryBtn.classList.toggle('active', !!state.furry);
  els.transparentBtn.hidden = !caps.transparent;
  els.transparentBtn.classList.toggle('active', !!state.transparent);

  for (const b of $$('.mode-tab', els.modeTabs)) b.classList.toggle('active', b.dataset.mode === state.mode);
  els.genBtn.querySelector('span').textContent = state.mode === 'inpaint' ? '局部重绘' : '生成图片';
  els.genBtn.classList.toggle('busy', busy > 0);

  renderHeaderActions(ui);
}

function renderHeaderActions(ui) {
  const { els } = ui;
  const r = activeResult();
  els.stageActions.innerHTML = '';
  if (!r) {
    els.stageMeta.textContent = '';
    return;
  }
  const meta = r.meta || {};
  const bits = [];
  if (meta.seed != null) bits.push(`seed ${meta.seed}`);
  if (meta.width) bits.push(`${meta.width}×${meta.height}`);
  if (meta.steps) bits.push(`${meta.steps} steps`);
  if (meta.scale != null) bits.push(`cfg ${meta.scale}`);
  els.stageMeta.innerHTML = `<span class="mono">${escapeHTML(bits.join(' · '))}</span>`;

  const add = (icon, label, fn) => {
    const b = iconBtn(icon, fn, label);
    b.classList.add('stage-act');
    els.stageActions.append(b);
  };
  add('download', '下载', () => downloadResult(r));
  add('copy', '复制种子', async () => {
    const seed = r.meta?.seed;
    if (seed != null) {
      await navigator.clipboard?.writeText(String(seed)).catch(() => {});
      toast(`种子 ${seed} 已复制`, 'ok');
    }
  });
  add('sliders', '载入设置', () => {
    reuseSettings(r);
    renderAll(ui);
    toast('已载入生成设置', 'ok');
  });
  add('image', '作为图生图', async () => {
    await sendToImg2Img(r);
    state.mode = 'i2i';
    save();
    renderAll(ui);
    toast('已作为底图', 'ok');
  });
  add('brush', '局部重绘', async () => {
    await sendToInpaint(r);
    save();
    renderAll(ui);
  });
  if (capsFor(effectiveModel(state)).upscale) add('upscale', '放大 4x', () => upscaleResult(r));
  add('spark', '增强', () => runEnhanceDialog(r));
  add('wand', '导演工具', () => openDirectorSheet(r));
  add('trash', '删除', async () => {
    if (await confirmDialog('删除图片', '确定删除当前这张图片吗？')) {
      removeResult(r.id);
      renderStage(ui);
      renderStrip(ui);
      renderHeaderActions(ui);
    }
  });
}

function renderQualityOptions(ui) {
  const { els } = ui;
  const medium = effectiveModel(state) === 'nai-diffusion-5-full-medium';
  const quality = [
    { v: 'standard', l: '标准' },
    { v: 'light', l: '轻量' },
    { v: 'none', l: '关闭' },
  ];
  els.quality.innerHTML = quality.map((q) => `<option value="${q.v}"${state.quality === q.v ? ' selected' : ''}>${q.l}</option>`).join('');
  if (medium) state.uc = 'heavy';
  const ucs = ucPresets(effectiveModel(state));
  els.ucSel.innerHTML = ucs.map((u) => `<option value="${u}"${state.uc === u ? ' selected' : ''}>${u === 'none' ? '无' : u.replace('_', ' ')}</option>`).join('');
  els.ucSel.disabled = medium;
  els.negative.disabled = medium;
  els.negative.placeholder = medium
    ? 'Medium effort 固定使用 Heavy 预设，不支持自定义负面提示词'
    : 'lowres, bad anatomy, ...';
  if (medium) els.negative.value = '';
}

function updatePromptUI(ui) {
  const { els } = ui;
  const model = effectiveModel(state);
  const tokens = estimateTokens(state.prompt);
  const limit = tokenLimit(model);
  els.tokenCount.textContent = `${tokens} / ${limit}`;
  const pct = clamp(tokens / limit, 0, 1);
  els.tokenBar.style.width = `${pct * 100}%`;
  els.tokenBar.classList.toggle('warn', pct > 0.85);
  els.tokenWarn.hidden = tokens <= limit;
  els.hl.innerHTML = state.highlight ? highlightHTML(state.prompt) + '\n' : '';
  els.hl.classList.toggle('off', !state.highlight);
  syncHighlightScroll();
  els.negativeCount.textContent = estimateTokens(state.negative);
  els.negToggle.classList.toggle('open', !els.negWrap.hidden);
}

function syncHighlightScroll() {
  const ta = document.getElementById('promptInput');
  const hl = document.getElementById('promptHL');
  if (!ta || !hl) return;
  hl.scrollTop = ta.scrollTop;
  hl.scrollLeft = ta.scrollLeft;
}

function renderResolution(ui, keepInputs = false) {
  const { els } = ui;
  const aspects = [...ASPECTS.map((a) => ({ value: a.id, label: a.label })), { value: 'custom', label: '自定义' }];
  els.aspectSeg.className = 'seg seg-wrap';
  els.aspectSeg.innerHTML = aspects
    .map((a) => `<button class="seg ${state.aspect === a.value ? 'active' : ''}" data-aspect="${a.value}">${a.label}</button>`)
    .join('');
  els.sizeSeg.className = 'seg';
  els.sizeSeg.innerHTML = SIZE_STEPS
    .map((s) => `<button class="seg ${state.size === s.id ? 'active' : ''}" data-size="${s.id}">${s.label}</button>`)
    .join('');
  if (!keepInputs) {
    els.resW.value = state.width;
    els.resH.value = state.height;
  }
  els.resLabel.textContent = `${state.width} × ${state.height}`;
  const errs = validateSize(Number(state.width), Number(state.height));
  els.resWarn.innerHTML = errs.length ? `<span class="warn-text">${errs.join('；')}</span>` : '';
  const scale = state.width && state.height ? (state.width * state.height / (832 * 1216)).toFixed(2) : '1.00';
  if (!errs.length) els.resWarn.innerHTML = `<span class="dim">${(state.width * state.height / 1e6).toFixed(2)} MP · ${scale}× 标准画布</span>`;
}

function renderAdvanced(ui) {
  const { els } = ui;
  const model = effectiveModel(state);
  const caps = capsFor(model);
  const medium = model === 'nai-diffusion-5-full-medium';
  const ep = effectiveParams(state);
  els.advancedBody.innerHTML = '';
  const body = els.advancedBody;
  if (medium) {
    body.append(el('div', { class: 'notice' },
      'Medium effort：固定 14 步、Euler Ancestral、Heavy 负面预设；采样器 / 负面提示词 / CFG Rescale 不可改。'));
  }

  // steps + guidance
  const stepsField = slider({
    label: '步数 Steps',
    min: 1,
    max: 50,
    step: 1,
    value: state.steps,
    format: (v) => `${Math.round(v)}`,
    onInput: (v) => {
      state.steps = Math.round(v);
      updateCost(ui);
    },
  });
  if (medium) stepsField.classList.add('disabled');
  body.append(stepsField);

  body.append(slider({
    label: '引导 Prompt Guidance',
    min: 0,
    max: caps.scaleMax,
    step: 0.1,
    value: state.scale,
    format: (v) => Number(v).toFixed(1),
    onInput: (v) => {
      state.scale = v;
      updateCost(ui);
    },
    hint: `推荐 ${caps.scaleRecommended[0]}–${caps.scaleRecommended[1]}`,
  }));

  // sampler
  const samplerSelect = select(samplersFor(model).map((s) => ({ value: s.id, label: s.label })), medium ? 'k_euler_ancestral' : state.sampler, (v) => {
    state.sampler = v;
    save();
    updateCost(ui);
  });
  if (medium) samplerSelect.disabled = true;
  const samplerWrap = el('div', { class: 'field' },
    el('div', { class: 'field-head' }, el('span', { class: 'field-label' }, '采样器 Sampler'), medium ? el('span', { class: 'field-hint' }, '固定') : null),
    samplerSelect);
  body.append(samplerWrap);

  if (caps.noiseSchedule) {
    body.append(el('div', { class: 'field' },
      el('div', { class: 'field-head' }, el('span', { class: 'field-label' }, '噪声调度')),
      select(schedulesFor(model).map((s) => ({ value: s.id, label: s.label })), state.schedule, (v) => {
        state.schedule = v;
        save();
      })));
  }

  // seed
  const seedInput = el('input', { class: 'input mono', type: 'text', inputmode: 'numeric', value: state.seed ?? '', placeholder: '随机' });
  seedInput.addEventListener('input', () => {
    state.seed = seedInput.value.replace(/[^0-9]/g, '');
    save();
  });
  const seedRow = el('div', { class: 'seed-row' },
    seedInput,
    iconBtn('dice', () => {
      state.seed = String(randomSeed());
      seedInput.value = state.seed;
      save();
    }, '随机种子'),
    iconBtn('lock', () => {
      state.seed = state.seed ? '' : String(randomSeed());
      seedInput.value = state.seed;
      save();
      toast(state.seed ? '种子已锁定' : '种子已解锁', 'ok', 1200);
    }, '锁定/解锁', state.seed ? 'active' : ''));
  body.append(el('div', { class: 'field' },
    el('div', { class: 'field-head' }, el('span', { class: 'field-label' }, '种子 Seed'), el('span', { class: 'field-hint' }, '留空随机')),
    seedRow));

  body.append(slider({
    label: '生成张数',
    min: 1,
    max: LIMITS.maxSamples,
    step: 1,
    value: state.nSamples,
    format: (v) => `${Math.round(v)} 张`,
    onInput: (v) => {
      state.nSamples = Math.round(v);
      updateCost(ui);
    },
  }));

  if (caps.cfgRescale && !medium) {
    body.append(slider({
      label: 'Prompt Guidance Rescale',
      min: 0,
      max: 1,
      step: 0.01,
      value: state.cfgRescale,
      format: (v) => Number(v).toFixed(2),
      onInput: (v) => {
        state.cfgRescale = v;
      },
      hint: '高 CFG 时抑制过饱和',
    }));
  }

  if (caps.dynThresh) {
    body.append(switchRow('Dynamic Thresholding', state.dyn, (v) => {
      state.dyn = v;
      save();
    }, 'V3 专用，高分辨率更稳定'));
  }
  if (caps.smea) {
    body.append(switchRow('SMEA', state.sm, (v) => {
      state.sm = v;
      if (!v) state.smDyn = false;
      save();
      renderAdvanced(ui);
    }, '高分辨率抗重复'));
    body.append(switchRow('SMEA DYN', state.smDyn, (v) => {
      state.smDyn = v;
      if (v) state.sm = true;
      save();
      renderAdvanced(ui);
    }));
    body.append(switchRow('Auto SMEA', state.autoSmea, (v) => {
      state.autoSmea = v;
      save();
    }, '超过 1024×1024 自动启用'));
  }

  const badge = `${ep.steps} 步 · CFG ${Number(ep.scale).toFixed(1)}`;
  const b = $('#advBadge', ui.container);
  if (b) b.textContent = badge;
}

function renderCharacters(ui) {
  const { els } = ui;
  const caps = capsFor(effectiveModel(state));
  const acc = $('#charsAcc', ui.container);
  acc.hidden = !caps.charMax;
  if (!caps.charMax) return;
  els.charsCount.textContent = state.characters.length;
  const modeWrap = els.charPosMode;
  modeWrap.innerHTML = '';
  if (state.characters.length) {
    modeWrap.append(segmented(
      [
        { value: 'ai', label: "AI's Choice" },
        { value: 'custom', label: '自定义位置' },
      ],
      state.charPosMode,
      (v) => {
        state.charPosMode = v;
        save();
        renderCharacters(ui);
      },
      { small: true },
    ));
  }
  els.charsBox.innerHTML = '';
  state.characters.forEach((c, i) => {
    const card = el('div', { class: 'char-card' });
    const head = el('div', { class: 'char-head' },
      el('span', { class: 'char-idx' }, String.fromCharCode(65 + (i % 26))),
      el('span', { class: 'char-name' }, `角色 ${i + 1}`),
      el('div', { class: 'char-tools' },
        iconBtn('up', () => moveCharacter(ui, i, -1), '上移'),
        iconBtn('down', () => moveCharacter(ui, i, 1), '下移'),
        iconBtn('close', () => {
          state.characters.splice(i, 1);
          save();
          renderCharacters(ui);
        }, '删除')));
    const prompt = el('textarea', { class: 'char-prompt', rows: 2, placeholder: 'girl, red hair, ...' });
    prompt.value = c.prompt || '';
    prompt.addEventListener('input', () => {
      state.characters[i].prompt = prompt.value;
      save();
    });
    const uc = el('input', { class: 'char-uc', placeholder: '该角色的负面提示词（可选）' });
    uc.value = c.uc || '';
    uc.addEventListener('input', () => {
      state.characters[i].uc = uc.value;
      save();
    });
    const posBtn = el('button', { class: 'btn btn-xs' },
      svg('target'),
      el('span', null, state.charPosMode === 'custom' ? `位置 ${Math.round((c.x ?? 0.5) * 100)}%, ${Math.round((c.y ?? 0.5) * 100)}%` : '位置：AI 决定'));
    posBtn.addEventListener('click', () => openPositionEditor(ui, i));
    card.append(head, prompt, uc, posBtn);
    els.charsBox.append(card);
  });
  if (!state.characters.length) {
    els.charsBox.append(el('div', { class: 'hint' }, '添加角色提示词，可分别描述多个角色并指定位置。'));
  }
}

function moveCharacter(ui, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= state.characters.length) return;
  [state.characters[i], state.characters[j]] = [state.characters[j], state.characters[i]];
  save();
  renderCharacters(ui);
}

function addCharacter(ui) {
  const caps = capsFor(effectiveModel(state));
  if (state.characters.length >= caps.charMax) {
    toast(`该模型最多 ${caps.charMax} 个角色提示词`, 'error');
    return;
  }
  state.characters.push({
    prompt: '',
    uc: '',
    x: 0.5,
    y: 0.5,
    enabled: true,
  });
  if (state.characters.length === 1) state.charPosMode = 'ai';
  save();
  $('#charsAcc', ui.container).classList.add('open');
  renderCharacters(ui);
}

function openPositionEditor(ui, i) {
  const c = state.characters[i];
  const caps = capsFor(effectiveModel(state));
  const body = el('div', { class: 'pos-editor' });
  if (caps.charPos === 'grid') {
    const grid = el('div', { class: 'pos-grid' });
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        const x = (gx + 1) / 6;
        const y = (gy + 1) / 6;
        const b = el('button', {
          class: `pos-cell ${Math.abs((c.x ?? 0) - x) < 0.02 && Math.abs((c.y ?? 0) - y) < 0.02 ? 'active' : ''}`,
          type: 'button',
          onclick: () => {
            c.x = x;
            c.y = y;
            save();
            m.close();
            renderCharacters(ui);
          },
        });
        grid.append(b);
      }
    }
    body.append(el('p', { class: 'hint' }, 'V4 / V4.5 使用 5×5 网格定位'), grid);
  } else {
    const box = el('div', { class: 'pos-free' });
    const pin = el('div', { class: 'pos-pin' }, String.fromCharCode(65 + i));
    const setPin = () => {
      pin.style.left = `${(c.x ?? 0.5) * 100}%`;
      pin.style.top = `${(c.y ?? 0.5) * 100}%`;
    };
    setPin();
    box.append(pin);
    const move = (e) => {
      const r = box.getBoundingClientRect();
      c.x = clamp((e.clientX - r.left) / r.width, 0.02, 0.98);
      c.y = clamp((e.clientY - r.top) / r.height, 0.02, 0.98);
      setPin();
    };
    box.addEventListener('pointerdown', (e) => {
      box.setPointerCapture(e.pointerId);
      move(e);
      box.dataset.drag = '1';
    });
    box.addEventListener('pointermove', (e) => {
      if (box.dataset.drag) move(e);
    });
    box.addEventListener('pointerup', () => {
      box.dataset.drag = '';
      save();
      renderCharacters(ui);
    });
    body.append(el('p', { class: 'hint' }, 'V5 支持自由定位：拖动标记到画面中的位置'), box);
  }
  const m = modal({
    title: '角色位置',
    body,
    actions: [{ label: '完成', primary: true, onClick: () => { save(); renderCharacters(ui); } }],
  });
}

/* --------------------------------------------------------------------- vibes */

function pickVibeImages(ui) {
  const input = el('input', { type: 'file', accept: 'image/*', multiple: true });
  input.addEventListener('change', async () => {
    for (const f of input.files) await addVibeFromFile(ui, f);
  });
  input.click();
}

function pickVibeFiles(ui) {
  const input = el('input', { type: 'file', accept: '.naiv4vibe,.naiv4vibebundle' });
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    if (state.vibes.length >= MAX_VIBES) return toast('最多 16 个 Vibe', 'error');
    const b64 = await blobToB64(f);
    await addVibe({
      id: uuid(),
      name: f.name.replace(/\.naiv4vibe.*$/, ''),
      encodedB64: b64,
      preview: null,
      info: 1,
      strength: 0.6,
      model: effectiveModel(state),
      imported: true,
    });
    toast('已导入 Vibe', 'ok');
  });
  input.click();
}

async function addVibeFromFile(ui, file) {
  if (state.vibes.length >= MAX_VIBES) return toast('最多 16 个 Vibe', 'error');
  const caps = capsFor(effectiveModel(state));
  if (!caps.vibe) return toast('当前模型不支持 Vibe 迁移', 'error');
  const blob = file;
  const dataURL = URL.createObjectURL(blob);
  const item = {
    id: uuid(),
    name: file.name,
    preview: null,
    info: 1,
    strength: 0.6,
    encodedB64: null,
    imageB64: null,
    blob,
    w: 0,
    h: 0,
    encoding: true,
  };
  state.vibes.push(item);
  renderVibes(ui);
  try {
    const img = await loadImage(dataURL);
    item.w = img.width;
    item.h = img.height;
    item.preview = await smallDataURL(blob, 220);
    if (caps.encodedVibe) {
      const enc = await encodeVibe({ blob, model: effectiveModel(state), informationExtracted: 1 });
      item.encodedB64 = await blobToB64(enc);
      item.encodedInfo = 1;
    } else {
      item.imageB64 = await blobToB64(blob);
    }
  } catch (e) {
    toast(`Vibe 编码失败：${e.message}`, 'error', 5000);
    state.vibes = state.vibes.filter((v) => v.id !== item.id);
  } finally {
    item.encoding = false;
    if (item.encodedB64) {
      try {
        await idb.put('assets', {
          id: item.id,
          kind: 'vibe',
          encodedB64: item.encodedB64,
          preview: item.preview,
          name: item.name,
          blob: item.blob,
        });
      } catch (e) {
        console.warn('vibe cache failed', e);
      }
    }
    renderVibes(ui);
    save();
  }
  URL.revokeObjectURL(dataURL);
}

function renderVibes(ui) {
  const { els } = ui;
  const caps = capsFor(effectiveModel(state));
  const acc = $('#vibesAcc', ui.container);
  acc.hidden = !caps.vibe;
  if (!caps.vibe) return;
  $('#vibesCount', ui.container).textContent = state.vibes.length;
  els.vibesHint.textContent = caps.encodedVibe
    ? `最多 16 张。V4+ 需先编码（每张 2 Anlas）；编码结果会缓存在本机。总强度建议 ≤ 1.0`
    : '最多 16 张。V3 直接使用原图作为参考。总强度建议 ≤ 1.0';
  els.vibesBox.innerHTML = '';
  state.vibes.forEach((v, i) => {
    const card = el('div', { class: 'vibe-card' });
    const thumb = el('div', { class: 'vibe-thumb' });
    if (v.preview) thumb.append(el('img', { src: v.preview, alt: '' }));
    else thumb.innerHTML = svg('image');
    if (v.encoding) thumb.append(el('span', { class: 'thumb-spin' }));
    const meta = el('div', { class: 'vibe-meta' },
      el('div', { class: 'vibe-name' }, v.name || `Vibe ${i + 1}`),
      el('div', { class: 'vibe-sub' }, v.imported ? '已导入编码' : caps.encodedVibe ? (v.encodedB64 ? '已编码' : '待编码') : '原始图像'));
    const del = iconBtn('close', () => {
      removeVibe(v.id).then(() => renderVibes(ui));
    }, '删除');
    const top = el('div', { class: 'vibe-top' }, thumb, meta, del);
    const strength = rangeLine('强度', v.strength ?? 0.6, 0, 1.5, 0.01, (val) => {
      v.strength = val;
      save();
    });
    const info = rangeLine('信息提取', v.info ?? 1, 0, 1, 0.01, (val) => {
      v.info = val;
      save();
      if (caps.encodedVibe && !v.imported) markVibeDirty(ui, v);
    });
    card.append(top, strength, info);
    els.vibesBox.append(card);
  });
  if (!state.vibes.length) els.vibesBox.append(el('div', { class: 'hint' }, '还没有 Vibe。添加参考图来影响风格、配色与构图。'));

  const norm = $('#vibeNormalize', ui.container);
  norm.innerHTML = '';
  if (caps.encodedVibe && state.vibes.length) {
    norm.append(switchRow('自动归一化强度 (Normalize)', state.normalizeVibes !== false, (v) => {
      state.normalizeVibes = v;
      save();
    }));
  }
}

function markVibeDirty(ui, v) {
  if (!v || v.encoding) return;
  if (v.dirtyTimer) clearTimeout(v.dirtyTimer);
  v.dirtyTimer = setTimeout(async () => {
    if (Math.abs((v.info ?? 1) - (v.encodedInfo ?? 1)) < 0.01) return;
    v.encoding = true;
    renderVibes(ui);
    try {
      const blob = v.blob || dataURLToBlob(v.previewFull || v.preview);
      const enc = await encodeVibe({ blob, model: effectiveModel(state), informationExtracted: v.info });
      v.encodedB64 = await blobToB64(enc);
      v.encodedInfo = v.info;
      toast('Vibe 已按新信息量重新编码', 'ok', 1500);
    } catch (e) {
      toast(`重新编码失败：${e.message}`, 'error');
    } finally {
      v.encoding = false;
      renderVibes(ui);
      save();
    }
  }, 700);
}

async function exportVibes(ui) {
  if (!state.vibes.length) return toast('没有可导出的 Vibe', 'info');
  const bundle = {
    type: 'nai-studio-vibes',
    version: 1,
    vibes: state.vibes.map((v) => ({
      name: v.name,
      info: v.info,
      strength: v.strength,
      encodedB64: v.encodedB64 || null,
      imageB64: v.imageB64 || null,
    })),
  };
  const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
  downloadBlob(blob, 'vibes.nai-studio.json');
}

/* ---------------------------------------------------------------------- refs */

function pickRefImages(ui) {
  const caps = capsFor(effectiveModel(state));
  if (!caps.precise) return toast('当前模型不支持精准参考（需 V4.5 / V5）', 'error');
  if (state.refs.length >= MAX_REFS) return toast(`最多 ${MAX_REFS} 张参考图`, 'error');
  const input = el('input', { type: 'file', accept: 'image/*', multiple: true });
  input.addEventListener('change', async () => {
    for (const f of input.files) {
      if (state.refs.length >= MAX_REFS) break;
      await addRefFromFile(ui, f);
    }
  });
  input.click();
}

async function addRefFromFile(ui, file) {
  try {
    const fitted = await fitReferenceCanvas(file);
    const b64 = await blobToB64(fitted);
    const preview = await smallDataURL(fitted, 240);
    await addRef({
      id: uuid(),
      name: file.name,
      b64,
      preview,
      type: 'character',
      description: '',
      strength: 0.6,
      fidelity: 0.5,
      info: 1,
    });
    toast('参考图已添加（自动适配 1024×1536 画布）', 'ok');
  } catch (e) {
    toast(`添加失败：${e.message}`, 'error');
  }
}

function renderRefs(ui) {
  const { els } = ui;
  const caps = capsFor(effectiveModel(state));
  const acc = $('#refsAcc', ui.container);
  acc.hidden = !caps.precise;
  if (!caps.precise) return;
  $('#refsCount', ui.container).textContent = state.refs.length;
  els.refsHint.textContent = '角色 / 风格参考，每次生成 +5 Anlas。参考图会自动填充到 1024×1536 / 1472×1472 / 1536×1024 画布。';
  els.refsBox.innerHTML = '';
  state.refs.forEach((r) => {
    const card = el('div', { class: 'ref-card' });
    const thumb = el('div', { class: 'ref-thumb' }, r.preview ? el('img', { src: r.preview, alt: '' }) : svg('image'));
    const typeSel = select(
      [
        { value: 'character', label: '角色' },
        { value: 'style', label: '风格' },
        { value: 'both', label: '角色+风格' },
      ],
      r.type,
      (v) => {
        updateRef(r.id, { type: v });
      },
    );
    const desc = el('input', { class: 'input', placeholder: '描述（可选）' });
    desc.value = r.description || '';
    desc.addEventListener('change', () => updateRef(r.id, { description: desc.value }));
    const top = el('div', { class: 'ref-top' }, thumb,
      el('div', { class: 'ref-meta' },
        el('div', { class: 'vibe-name' }, r.name),
        typeSel),
      iconBtn('close', () => removeRef(r.id).then(() => renderRefs(ui)), '删除'));
    card.append(top, desc,
      rangeLine('强度', r.strength ?? 0.6, 0, caps.charMax > 6 ? 5 : 1, 0.01, (v) => updateRef(r.id, { strength: v })),
      rangeLine('保真度 Fidelity', r.fidelity ?? 0.5, 0, 1, 0.01, (v) => updateRef(r.id, { fidelity: v })));
    els.refsBox.append(card);
  });
  if (!state.refs.length) els.refsBox.append(el('div', { class: 'hint' }, '添加角色图或风格图，让模型参考其外观与画风。'));
}

/* -------------------------------------------------------------------- modes */

function renderModePanel(ui) {
  const { els } = ui;
  const wrap = els.modePanel;
  wrap.innerHTML = '';
  if (state.mode === 't2i') return;

  const isInpaint = state.mode === 'inpaint';
  const card = el('div', { class: 'card mode-card' });
  const head = el('div', { class: 'card-head' },
    el('span', { class: 'card-title' }, isInpaint ? '局部重绘' : '图生图'),
    el('button', { class: 'btn btn-xs', onclick: () => pickBaseImage(ui) }, svg('upload'), '上传'));
  card.append(head);

  if (!state.baseImage) {
    const dz = el('button', { class: 'drop-zone', type: 'button' },
      el('div', { class: 'dz-icon' }, svg('image')),
      el('div', { class: 'dz-text' }, '点击上传底图'),
      el('div', { class: 'dz-sub' }, '也可以直接拖入图片'));
    dz.addEventListener('click', () => pickBaseImage(ui));
    card.append(dz);
  } else {
    const thumb = el('div', { class: 'base-thumb' });
    const img = el('img', { src: state.baseImage.dataURL || state.baseImage.url, alt: '' });
    thumb.append(img);
    const tools = el('div', { class: 'base-tools' },
      el('button', { class: 'btn btn-xs', onclick: () => pickBaseImage(ui) }, '替换'),
      el('button', { class: 'btn btn-xs', onclick: () => { saveBaseImage(null).then(() => renderModePanel(ui)); } }, '移除'));
    card.append(thumb, tools);

    if (isInpaint) {
      card.append(renderMaskEditor(ui));
      card.append(rangeLine('重绘强度', state.inpaint.strength, 0.1, 1, 0.01, (v) => {
        state.inpaint.strength = v;
        save();
      }));
    } else {
      card.append(rangeLine('强度 Strength', state.i2i.strength, 0, 1, 0.01, (v) => {
        state.i2i.strength = v;
        save();
      }));
      card.append(rangeLine('噪声 Noise', state.i2i.noise, 0, 1, 0.01, (v) => {
        state.i2i.noise = v;
        save();
      }));
    }
  }

  if (isInpaint) {
    card.append(el('div', { class: 'hint' }, '在图片上涂抹需要重绘的区域（红色），未涂抹的区域保持不变。'));
  }
  wrap.append(card);
}

async function pickBaseImage(ui) {
  const input = el('input', { type: 'file', accept: 'image/*' });
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    await setBaseFromFile(ui, f);
  });
  input.click();
}

export async function setBaseFromFile(ui, file) {
  try {
    const img = await loadImage(URL.createObjectURL(file));
    const png = await imageToPNG(img);
    const dataURL = await blobToDataURL(png);
    await saveBaseImage({ id: `base-${Date.now()}`, name: file.name || 'image', dataURL, w: img.width, h: img.height, blob: png });
    if (state.mode === 't2i') state.mode = 'i2i';
    save();
    renderModePanel(ui);
    renderHeader(ui);
    toast('底图已设置', 'ok');
  } catch (e) {
    toast(`读取图片失败：${e.message}`, 'error');
  }
}

function imageToPNG(img) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  return canvasToBlob(c, 'image/png');
}

/* --------------------------------------------------------------- mask editor */

let maskState = { canvas: null, ctx: null, imgW: 0, imgH: 0, undo: [], drawing: false, last: null };
let maskCanvasEl = null;

function renderMaskEditor(ui) {
  const box = el('div', { class: 'inpaint-box' });
  const img = el('img', { src: state.baseImage.dataURL || state.baseImage.url, alt: '', class: 'inpaint-base' });
  const canvas = el('canvas', { class: 'mask-canvas' });
  box.append(img, canvas);

  const ready = () => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return;
    canvas.width = w;
    canvas.height = h;
    maskState = { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }), imgW: w, imgH: h, undo: [], drawing: false, last: null };
  };
  if (img.complete) ready();
  else img.addEventListener('load', ready);

  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * canvas.width,
      y: ((e.clientY - r.top) / r.height) * canvas.height,
      scale: canvas.width / r.width,
    };
  };
  const ctx = () => canvas.getContext('2d', { willReadFrequently: true });
  const pushUndo = () => {
    if (!canvas.width) return;
    try {
      maskState.undo.push(ctx().getImageData(0, 0, canvas.width, canvas.height));
      if (maskState.undo.length > 8) maskState.undo.shift();
    } catch {}
  };
  const drawAt = (e) => {
    if (!canvas.width) return;
    const p = toCanvas(e);
    const c = ctx();
    c.save();
    c.strokeStyle = 'rgba(255, 64, 110, 0.72)';
    c.lineWidth = Math.max(1, Number(state.inpaint.brush) * p.scale / 2);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    if (maskState.last) {
      c.moveTo(maskState.last.x, maskState.last.y);
      c.lineTo(p.x, p.y);
      c.stroke();
    } else {
      c.arc(p.x, p.y, c.lineWidth / 2, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255, 64, 110, 0.72)';
      c.fill();
    }
    c.restore();
    maskState.last = p;
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}
    pushUndo();
    maskState.drawing = true;
    maskState.last = null;
    drawAt(e);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!maskState.drawing) return;
    drawAt(e);
  });
  canvas.addEventListener('pointerup', () => {
    maskState.drawing = false;
    maskState.last = null;
  });
  canvas.addEventListener('pointercancel', () => {
    maskState.drawing = false;
    maskState.last = null;
  });

  // toolbar
  const toolbar = el('div', { class: 'mask-tools' });
  const brushWrap = el('div', { class: 'brush-wrap' },
    el('span', { class: 'mini-label' }, '笔刷'),
    el('input', { class: 'range', type: 'range', min: 8, max: 160, value: state.inpaint.brush, oninput: (e) => { state.inpaint.brush = Number(e.target.value); save(); } }));
  const undoBtn = el('button', { class: 'btn btn-xs', onclick: () => {
    const snap = maskState.undo.pop();
    if (snap) ctx().putImageData(snap, 0, 0);
  } }, '撤销');
  const clearBtn = el('button', { class: 'btn btn-xs', onclick: () => {
    pushUndo();
    ctx().clearRect(0, 0, canvas.width, canvas.height);
  } }, '清除');
  const invertBtn = el('button', { class: 'btn btn-xs', onclick: () => {
    if (!canvas.width) return;
    pushUndo();
    const c = ctx();
    const data = c.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] > 8) {
        px[i + 3] = 0;
      } else {
        px[i] = 255;
        px[i + 1] = 64;
        px[i + 2] = 110;
        px[i + 3] = 185;
      }
    }
    c.putImageData(data, 0, 0);
  } }, '反转');
  toolbar.append(brushWrap, undoBtn, clearBtn, invertBtn);
  const holder = el('div', { class: 'mask-holder' }, box, toolbar);
  // store canvas for export
  holder.dataset.maskCanvas = '1';
  maskCanvasEl = canvas;
  return holder;
}

async function maskBlob() {
  const canvas = maskCanvasEl;
  if (!canvas || !canvas.width) return null;
  const c = document.createElement('canvas');
  c.width = canvas.width;
  c.height = canvas.height;
  const cx = c.getContext('2d');
  cx.fillStyle = '#000';
  cx.fillRect(0, 0, c.width, c.height);
  const src = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const out = cx.getImageData(0, 0, c.width, c.height);
  const d = out.data;
  let painted = 0;
  for (let i = 0; i < src.length; i += 4) {
    if (src[i + 3] > 8) {
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = 255;
      painted++;
    }
  }
  cx.putImageData(out, 0, 0);
  if (!painted) return null;
  return canvasToBlob(c, 'image/png');
}

/* --------------------------------------------------------------------- stage */

let currentPreviewUrl = null;
let busy = 0;
const queue = [];

function renderStage(ui) {
  const { els } = ui;
  const r = activeResult();
  if (!r) {
    els.stageImg.hidden = true;
    els.stageEmpty.hidden = false;
    els.stageMeta.textContent = '';
    els.stageActions.innerHTML = '';
    return;
  }
  els.stageImg.src = r.url || URL.createObjectURL(r.blob);
  els.stageImg.hidden = false;
  els.stageEmpty.hidden = true;
  renderHeaderActions(ui);
}

function renderStrip(ui) {
  const { els } = ui;
  els.resultStrip.innerHTML = '';
  for (const r of state.results.slice(0, 24)) {
    const b = el('button', {
      class: `strip-item ${r.id === state.activeResultId ? 'active' : ''}`,
      onclick: () => {
        setActiveResult(r.id);
        renderStage(ui);
        renderStrip(ui);
      },
    });
    b.append(el('img', { src: r.url || '', alt: '' }));
    els.resultStrip.append(b);
  }
}

function setProgress(ui, pct, text, previewBlob) {
  const { els } = ui;
  els.stageProgress.hidden = false;
  els.progressFill.style.width = `${clamp(pct || 0, 0, 1) * 100}%`;
  els.progressText.textContent = text || '生成中…';
  if (previewBlob) {
    if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
    currentPreviewUrl = URL.createObjectURL(previewBlob);
    els.progressThumb.src = currentPreviewUrl;
  }
}

function hideProgress(ui) {
  ui.els.stageProgress.hidden = true;
  ui.els.progressFill.style.width = '0%';
  if (currentPreviewUrl) {
    URL.revokeObjectURL(currentPreviewUrl);
    currentPreviewUrl = null;
  }
}

/* ------------------------------------------------------------------ generate */

async function enqueue(ui) {
  if (!state.token) {
    toast('请先在设置中填入 NovelAI Token', 'error');
    openSettingsHint();
    return;
  }
  const errs = validateSize(Number(state.width), Number(state.height));
  if (errs.length) return toast(errs[0], 'error');
  if (state.mode === 'inpaint') {
    if (!state.baseImage) return toast('请先上传局部重绘底图', 'error');
    const mb = await maskBlob();
    if (!mb) return toast('请先涂抹需要重绘的蒙版区域', 'error');
  }
  if (state.mode === 'i2i' && !state.baseImage) return toast('请先上传图生图底图', 'error');

  queue.push(1);
  updateQueue(ui);
  pump(ui);
}

function updateQueue(ui) {
  ui.els.queueBadge.hidden = queue.length === 0;
  ui.els.queueBadge.textContent = queue.length ? `排队 ${queue.length}` : '';
}

async function pump(ui) {
  const limit = Math.max(1, Math.min(2, Number(state.concurrency) || 1));
  while (busy < limit && queue.length) {
    queue.shift();
    busy++;
    updateQueue(ui);
    ui.els.genBtn.classList.add('busy');
    runOne(ui).finally(() => {
      busy--;
      ui.els.genBtn.classList.remove('busy');
      if (queue.length) {
        pump(ui);
      } else {
        updateQueue(ui);
        if (!busy) hideProgress(ui);
      }
    });
  }
  if (!busy && !queue.length) hideProgress(ui);
}

async function runOne(ui) {
  const ctrl = new AbortController();
  state._abort = ctrl;
  let baseImage = null;
  let mask = null;
  try {
    if (state.baseImage) {
      baseImage = state.baseImage.blob || (state.baseImage.dataURL ? dataURLToBlob(state.baseImage.dataURL) : null);
    }
    if (state.mode === 'inpaint') mask = await maskBlob();
    const { body, info } = await buildRequest(state, { baseImage, mask });
    setProgress(ui, 0.02, '正在提交请求…');
    const images = await generateImage({
      payload: body,
      signal: ctrl.signal,
      stream: state.stream,
      onProgress: ({ step, steps, preview, final }) => {
        const pct = steps ? Math.min(0.98, step / steps) : 0.4;
        setProgress(ui, pct, final ? '收尾中…' : `采样中 ${step || 0} / ${steps || '?'}`, preview);
      },
    });
    for (const img of images) {
      const rec = addResult(img, { mode: state.mode, seed: img.meta?.seed ?? info.seed });
      if (state.autosave !== false) {
        await saveToGallery(rec, {
          mode: state.mode,
          model: info.model,
          prompt: info.prompt,
          width: info.width,
          height: info.height,
          steps: info.steps,
          scale: info.scale,
          sampler: info.sampler,
          chars: info.chars,
        });
      }
    }
    setProgress(ui, 1, '完成');
    renderStage(ui);
    renderStrip(ui);
    renderHeaderActions(ui);
    setTimeout(() => hideProgress(ui), 400);
  } catch (e) {
    hideProgress(ui);
    if (e.name === 'AbortError') toast('已取消', 'info');
    else toast(e.message || String(e), 'error', 5000);
    console.error(e);
  } finally {
    state._abort = null;
  }
}

/* --------------------------------------------------------------- suggestions */

let suggestTimer;
let acState = { items: [], idx: -1, frag: null };

function scheduleSuggest(ui) {
  clearTimeout(suggestTimer);
  suggestTimer = setTimeout(() => runSuggest(ui), 220);
}

async function runSuggest(ui) {
  const ta = ui.els.prompt;
  if (document.activeElement !== ta) return;
  const frag = tagFragmentAt(ta.value, ta.selectionStart);
  if (!frag) return hideSuggest(ui);
  if (frag.query.startsWith('@')) {
    const q = frag.query.slice(1).toLowerCase();
    const items = state.chunks.filter((c) => c.name.toLowerCase().includes(q)).map((c) => ({ tag: c.text, label: c.name, kind: 'chunk' }));
    return showSuggest(ui, items, frag);
  }
  if (frag.query.length < 2 || /[.!?。！？]/.test(frag.query)) return hideSuggest(ui);
  try {
    const tags = await suggestTags(state.model, frag.query);
    const q = frag.query.toLowerCase();
    const best = tags
      .filter((t) => t.toLowerCase().startsWith(q) || t.toLowerCase().includes(q))
      .slice(0, 8)
      .map((tag) => ({ tag, label: tag }));
    showSuggest(ui, best, frag);
  } catch {
    hideSuggest(ui);
  }
}

function showSuggest(ui, items, frag) {
  const pop = ui.els.tagPop;
  if (!items.length) return hideSuggest(ui);
  acState = { items, idx: 0, frag };
  pop.hidden = false;
  pop.innerHTML = '';
  items.forEach((item, i) => {
    const b = el('button', {
      class: `tag-item ${i === 0 ? 'active' : ''}`,
      type: 'button',
      onmousedown: (e) => {
        e.preventDefault();
        applySuggestion(ui, item);
      },
    }, el('span', { class: 'tag-name' }, item.label), item.kind === 'chunk' ? el('span', { class: 'tag-kind' }, '片段') : null);
    pop.append(b);
  });
}

function hideSuggest(ui) {
  ui.els.tagPop.hidden = true;
  acState = { items: [], idx: -1, frag: null };
}

function applySuggestion(ui, item) {
  const ta = ui.els.prompt;
  const caret = ta.selectionStart;
  const frag = tagFragmentAt(ta.value, caret);
  if (!frag) return hideSuggest(ui);
  let insert = item.tag;
  if (item.kind === 'chunk') insert = ' ' + insert + ' ';
  else insert = insert;
  const before = ta.value.slice(0, frag.start);
  const after = ta.value.slice(frag.end);
  const needsComma = before && !/[\s,]$/.test(before) && !item.kind;
  const text = before + (needsComma ? ', ' : '') + insert + (item.kind ? '' : ', ') + after;
  ta.value = text;
  const pos = before.length + (needsComma ? 2 : 0) + insert.length + (item.kind ? 0 : 2);
  ta.setSelectionRange(pos, pos);
  state.prompt = text;
  save();
  updatePromptUI(ui);
  hideSuggest(ui);
  ta.focus();
}

function onPromptKey(ui, e) {
  const pop = ui.els.tagPop;
  if (pop.hidden || !acState.items.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    acState.idx = (acState.idx + (e.key === 'ArrowDown' ? 1 : -1) + acState.items.length) % acState.items.length;
    $$('.tag-item', pop).forEach((n, i) => n.classList.toggle('active', i === acState.idx));
    return;
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    applySuggestion(ui, acState.items[acState.idx]);
    return;
  }
  if (e.key === 'Escape') hideSuggest(ui);
}

/* --------------------------------------------------------------------- cost */

function updateCost(ui) {
  const ep = effectiveParams(state);
  const anlas = estimateAnlas({
    width: Number(state.width),
    height: Number(state.height),
    steps: ep.steps,
    nSamples: ep.sampleCount,
    smea: !!(state.sm || state.smDyn),
  });
  const extra = (state.vibes.length > 4 ? (state.vibes.length - 4) * 2 : 0) + (state.refs.length ? 5 * state.refs.length : 0);
  const total = anlas + extra;
  const chip = ui.els.cost;
  if (total === 0) {
    chip.textContent = '免费 · Opus';
    chip.classList.add('free');
  } else {
    chip.textContent = `约 ${total} Anlas`;
    chip.classList.remove('free');
  }
  chip.title = `步数 ${ep.steps} · 张数 ${ep.sampleCount}${extra ? ` · 参考 +${extra}` : ''}`;
}

/* ------------------------------------------------------------------- sheets */

function openModelSheet(ui) {
  const body = el('div', { class: 'model-sheet' });
  const groups = [
    { title: 'V5 · 最新', ids: ['nai-diffusion-5-full', 'nai-diffusion-5-full-medium', 'nai-diffusion-5-curated'] },
    { title: 'V4.5', ids: ['nai-diffusion-4-5-full', 'nai-diffusion-4-5-curated'] },
    { title: 'V4', ids: ['nai-diffusion-4-full', 'nai-diffusion-4-curated-preview'] },
    { title: 'V3', ids: ['nai-diffusion-3', 'nai-diffusion-furry-3'] },
  ];
  for (const g of groups) {
    body.append(el('div', { class: 'sheet-group-title' }, g.title));
    for (const id of g.ids) {
      const model = MODEL_MAP[id];
      const active = effectiveModel(state) === id;
      const row = el('button', {
        class: `model-row ${active ? 'active' : ''}`,
        onclick: () => {
          state.model = id;
          state.effort = id === 'nai-diffusion-5-full-medium' ? 'medium' : 'high';
          applyModelDefaults(ui);
          save();
          sheet.close();
          renderAll(ui);
        },
      },
        el('span', { class: 'model-row-badge' }, model.version),
        el('span', { class: 'model-row-main' },
          el('span', { class: 'model-row-name' }, model.label),
          el('span', { class: 'model-row-sub' }, model.subtitle || '')),
        active ? el('span', { class: 'model-check' }, svg('check')) : null);
      body.append(row);
    }
  }
  body.append(el('p', { class: 'hint' }, 'V5 Full Medium 是 14 步蒸馏模型：固定 Euler Ancestral、Heavy 负面预设，不能自定义负面提示词与 CFG Rescale，速度更快、用量更省。'));
  const sheet = modal({ title: '选择模型', body });
}

function applyModelDefaults(ui) {
  const model = effectiveModel(state);
  const caps = capsFor(model);
  const medium = model === 'nai-diffusion-5-full-medium';
  state.scale = caps.scaleDefault;
  state.steps = medium ? 14 : caps.stepsDefault;
  if (medium) {
    state.sampler = 'k_euler_ancestral';
    state.uc = 'heavy';
    state.negative = '';
    state.cfgRescale = 0;
  } else if (!samplersFor(model).some((s) => s.id === state.sampler)) {
    state.sampler = 'k_euler_ancestral';
  }
  if (caps.noiseSchedule && !schedulesFor(model).some((s) => s.id === state.schedule)) state.schedule = 'karras';
  if (!caps.furryMode) state.furry = false;
  if (!caps.transparent) state.transparent = false;
  state.uc = ucPresets(model).includes(state.uc) ? state.uc : 'heavy';
  state.characters = state.characters.slice(0, caps.charMax || 0);
  save();
}

function openDirectorSheet(rec) {
  const body = el('div', { class: 'director-sheet' });
  const model = effectiveModel(state);
  for (const d of DIRECTORS) {
    const btn = el('button', { class: 'director-row' },
      el('span', { class: 'dir-icon' }, svg('wand')),
      el('span', { class: 'dir-main' },
        el('span', { class: 'dir-name' }, d.label),
        el('span', { class: 'dir-desc' }, d.desc)));
    btn.addEventListener('click', async () => {
      m.close();
      if (d.id === 'colorize' || d.id === 'emotion') {
        openDirectorParams(rec, d);
      } else {
        await directorResult(rec, { tool: d.id, model });
      }
    });
    body.append(btn);
  }
  body.append(el('p', { class: 'hint' }, '导演工具会在当前结果上生成新图（不覆盖原图）。'));
  const m = modal({ title: '导演工具', body });
}

function openDirectorParams(rec, d) {
  const body = el('div', { class: 'form-stack' });
  let emotion = 'happy';
  let prompt = '';
  let defry = 0;
  if (d.id === 'emotion') {
    body.append(el('div', { class: 'field-label' }, '表情'));
    body.append(select(
      ['neutral', 'happy', 'sad', 'angry', 'surprised', 'excited', 'shy', 'worried', 'scared', 'disgusted'].map((e) => ({ value: e, label: e })),
      emotion,
      (v) => (emotion = v),
    ));
  } else {
    body.append(el('div', { class: 'field-label' }, '提示词（可选）'));
    const ta = el('textarea', { class: 'input', rows: 2, placeholder: 'red hair, blue eyes' });
    ta.addEventListener('input', () => (prompt = ta.value));
    body.append(ta);
  }
  body.append(rangeLine(d.id === 'emotion' ? '表情强度 Defry' : 'Defry', 0, 0, 4, 0.1, (v) => (defry = v)));
  const m = modal({
    title: d.label,
    body,
    actions: [
      { label: t('cancel') },
      {
        label: t('apply'),
        primary: true,
        onClick: () => {
          const extra = { defry };
          if (d.id === 'emotion') {
            extra.prompt = emotion;
            extra.extra = '';
          } else {
            extra.prompt = prompt;
          }
          setTimeout(() => directorResult(rec, { tool: d.id, extra, model: effectiveModel(state) }), 50);
        },
      },
    ],
  });
}

/* -------------------------------------------------------------------- helpers */

function rangeLine(label, value, min, max, step, onInput) {
  const out = el('span', { class: 'range-val' }, Number(value).toFixed(2));
  const range = el('input', { class: 'range', type: 'range', min, max, step, value });
  range.addEventListener('input', () => {
    const v = Number(range.value);
    out.textContent = v.toFixed(2);
    onInput(v);
  });
  return el('div', { class: 'range-line' },
    el('div', { class: 'range-head' }, el('span', null, label), out),
    range);
}

async function smallDataURL(blob, max) {
  const img = await loadImage(URL.createObjectURL(blob));
  const c = document.createElement('canvas');
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  c.width = Math.max(1, Math.round(img.width * scale));
  c.height = Math.max(1, Math.round(img.height * scale));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

function openSettingsHint() {
  location.hash = '#/settings';
}
