// Settings: token / account / appearance / generation / data / extensions.

import { state, save, tierName, savePreset, applyPreset, addChunk, removeChunk } from '../state.js';
import { getUserData, setToken as apiSetToken } from '../api.js';
import { $, el, svg, formatDate, downloadBlob, loadJSON, saveJSON, t, getLang, setLang } from '../util.js';
import { toast, modal, confirmDialog, iconBtn, switchRow, slider, select, emptyState } from '../ui.js';
import { registry, pluginCount } from '../plugins.js';
import { logout, storeAuthToken } from '../auth.js';
import { MODELS, MODEL_MAP } from '../config.js';

let accountBusy = false;

export function mount(container) {
  container.innerHTML = `
    <div class="settings-view">
      <div class="page-head">
        <div class="page-title">设置</div>
        <div class="page-sub">Token、账号、偏好与数据管理</div>
      </div>
      <div id="settingsSections"></div>
    </div>`;
  const host = $('#settingsSections', container);
  window.addEventListener('nai:account', () => {
    if (host.isConnected) render();
  });
  render();

  function render() {
    host.innerHTML = '';

    /* token */
    const tokenInput = el('input', { class: 'input mono', type: 'password', placeholder: 'pst-...', value: state.token, autocomplete: 'off', spellcheck: 'false' });
    const showBtn = iconBtn('eye', () => {
      tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password';
    }, '显示/隐藏');
    const row = el('div', { class: 'token-row' }, tokenInput, showBtn);
    const status = el('div', { class: 'token-status' });
    if (state.tokenFromEnv) status.textContent = '当前使用工程 env 中的默认 Token';
    const actions = el('div', { class: 'row-line gap' },
      el('button', { class: 'btn btn-primary btn-sm', onclick: saveToken }, '保存 Token'),
      el('button', { class: 'btn btn-sm', onclick: testAccount }, '测试连接'),
      state.envToken ? el('button', { class: 'btn btn-sm', onclick: useEnvToken }, '改用 env 默认') : null,
      state.authConfigured ? el('button', { class: 'btn btn-sm btn-danger', onclick: logout }, '退出登录') : null);
    const tokenCard = card('NovelAI Token',
      el('p', { class: 'hint' }, '默认读取工程根目录 env 里的 NOVEL_AI_TOKEN；也可以在这里填入自己的 Token 覆盖。请求直接发往 image.novelai.net。'),
      state.tokenFromEnv ? el('p', { class: 'hint warn-text' }, '注意：env 会随 GitHub Pages 一起公开，任何访问站点的人都能读到这个 Token。请使用专用/可轮换的 Token，不要在 env 里放 GitHub Token 或其他密钥。') : null,
      row, actions, status);

    /* account */
    const accountCard = card('账号', renderAccount());
    if (!state.account) accountCard.append(el('div', { class: 'hint' }, '保存 Token 后点击「测试连接」读取账号信息。'));

    /* appearance */
    const themeSeg = el('div', { class: 'seg' },
      ...['dark', 'light'].map((theme) => el('button', {
        class: `seg ${state.theme === theme ? 'active' : ''}`,
        onclick: () => applyTheme(theme),
      }, theme === 'dark' ? '深色' : '浅色')));
    const appearance = card('外观', themeSeg,
      el('div', { class: 'hint' }, '界面会记住你的选择。'));

    /* generation */
    const genCard = card('生成偏好',
      switchRow('流式预览（实时查看采样过程）', state.stream, (v) => { state.stream = v; save(); }),
      switchRow('语法高亮（提示词着色）', state.highlight, (v) => { state.highlight = v; save(); }),
      switchRow('提示词助手（中文翻译 / 纠错）', state.showPromptAssist !== false, (v) => { state.showPromptAssist = v; save(); }),
      switchRow('自动保存到图库', state.autosave, (v) => { state.autosave = v; save(); }),
      el('div', { class: 'field' },
        el('div', { class: 'field-head' }, el('span', { class: 'field-label' }, '并发请求数')),
        select([{ value: 1, label: '1（稳定）' }, { value: 2, label: '2（更快，可能排队）' }], state.concurrency, (v) => {
          state.concurrency = Number(v);
          save();
        })));

    /* presets */
    const presetsBox = el('div', { class: 'list-box' });
    if (!state.presets.length) presetsBox.append(el('div', { class: 'hint' }, '还没有保存的预设。调好参数后点击「保存当前设置」。'));
    for (const p of state.presets) {
      presetsBox.append(el('div', { class: 'list-row' },
        el('div', { class: 'list-main' },
          el('div', { class: 'list-name' }, p.name),
          el('div', { class: 'list-sub' }, formatDate(p.created))),
        el('div', { class: 'list-actions' },
          el('button', { class: 'btn btn-xs', onclick: () => { applyPreset(p.id); toast('预设已应用', 'ok'); } }, '应用'),
          iconBtn('trash', () => {
            state.presets = state.presets.filter((x) => x.id !== p.id);
            save();
            render();
          }, '删除'))));
    }
    const presetCard = card('参数预设', presetsBox,
      el('button', { class: 'btn btn-sm', onclick: askPresetName }, svg('plus'), ' 保存当前设置'));

    /* chunks */
    const chunksBox = el('div', { class: 'list-box' });
    if (!state.chunks.length) chunksBox.append(el('div', { class: 'hint' }, '提示词片段可以在提示词输入框里用 @名字 快速插入。'));
    for (const c of state.chunks) {
      chunksBox.append(el('div', { class: 'list-row' },
        el('div', { class: 'list-main' },
          el('div', { class: 'list-name' }, c.name),
          el('div', { class: 'list-sub clamp2' }, c.text)),
        iconBtn('trash', () => { removeChunk(c.id); render(); }, '删除')));
    }
    const chunkCard = card('提示词片段 Prompt Chunks', chunksBox,
      el('button', { class: 'btn btn-sm', onclick: askChunk }, svg('plus'), ' 新建片段'));

    /* data */
    const dataCard = card('数据',
      el('div', { class: 'row-line gap wrap' },
        el('button', { class: 'btn btn-sm', onclick: exportSettings }, '导出设置'),
        el('button', { class: 'btn btn-sm', onclick: importSettings }, '导入设置'),
        el('button', { class: 'btn btn-sm', onclick: clearCache }, '清理 Vibe 缓存'),
        el('button', { class: 'btn btn-sm btn-danger', onclick: clearAll }, '清空全部本地数据')),
      el('div', { class: 'hint' }, '「导出设置」不包含图片和 Token。清空本地数据会移除 Token、预设与图库。'));

    /* extensions */
    const extBox = el('div', { class: 'list-box' });
    const tools = registry.tools;
    const acts = registry.resultActions;
    if (!tools.length && !acts.length) extBox.append(el('div', { class: 'hint' }, '还没有安装扩展。把自定义 JS 放进 plugins/ 并在 plugins/index.js 中 import 即可。'));
    for (const t of tools) extBox.append(listRow(t.name, `工具 · ${t.pluginId}`, t.description || ''));
    for (const a of acts) extBox.append(listRow(a.name, `图片操作 · ${a.pluginId}`, a.description || ''));
    const extCard = card('扩展功能', extBox,
      el('p', { class: 'hint' }, `已加载 ${pluginCount()} 个扩展包。开发文档见仓库 EXTENDING.md。`));

    /* about */
    const aboutCard = card('关于',
      el('div', { class: 'about-line' }, el('b', null, 'NovelAI Studio'), el('span', { class: 'dim' }, ' v1.0')),
      el('p', { class: 'hint' }, '一个复刻 NovelAI 图像生成全部核心功能的静态 Web 应用。支持 V5 / V4.5 / V4 / V3 全模型、角色提示词、Vibe 迁移、精准参考、图生图、局部重绘、放大、增强、导演工具与图库。'),
      el('p', { class: 'hint' }, '本项目与 NovelAI 无关；使用需自备订阅与 API Token。请遵守 NovelAI 服务条款。'));

    host.append(tokenCard, accountCard, presetCard, chunkCard, genCard, appearance, extCard, dataCard, aboutCard);

    function saveToken() {
      state.token = tokenInput.value.trim();
      state.tokenFromEnv = false;
      if (!state.token && state.envToken) {
        state.token = state.envToken;
        state.tokenFromEnv = true;
      }
      apiSetToken(state.token);
      if (state.authConfigured) storeAuthToken(state.token, true);
      save();
      toast(state.tokenFromEnv ? '已改回 env 默认 Token' : 'Token 已保存', 'ok');
      testAccount();
    }

    function useEnvToken() {
      if (!state.envToken) return;
      state.token = state.envToken;
      state.tokenFromEnv = true;
      tokenInput.value = state.token;
      apiSetToken(state.token);
      save();
      toast('已改用 env 默认 Token', 'ok');
      testAccount();
    }

    async function testAccount() {
      if (accountBusy) return;
      if (!state.token) return toast('请先填写 Token', 'error');
      accountBusy = true;
      status.innerHTML = '<span class="spin-inline"></span> 连接中…';
      try {
        const data = await getUserData();
        state.account = {
          tier: data.subscription?.tier ?? 0,
          active: !!data.subscription?.active,
          expiresAt: data.subscription?.expiresAt ? data.subscription.expiresAt * 1000 : null,
          usage: data.subscription?.usage || null,
          perks: data.subscription?.perks || null,
          priority: data.priority || null,
          fetchedAt: Date.now(),
        };
        save();
        status.innerHTML = '<span class="ok-dot"></span> 已连接';
        toast('连接成功', 'ok');
        window.dispatchEvent(new CustomEvent('nai:account'));
        render();
      } catch (e) {
        status.innerHTML = `<span class="err-dot"></span> ${e.message}`;
        toast(e.message, 'error', 5000);
      } finally {
        accountBusy = false;
      }
    }

    function applyTheme(theme) {
      state.theme = theme;
      document.documentElement.dataset.theme = theme;
      save();
      render();
    }

    function askPresetName() {
      const input = el('input', { class: 'input', placeholder: '预设名称', value: `预设 ${state.presets.length + 1}` });
      const m = modal({
        title: '保存参数预设',
        body: el('div', { class: 'form-stack' }, input),
        actions: [
          { label: '取消' },
          {
            label: '保存',
            primary: true,
            onClick: () => {
              savePreset(input.value.trim() || undefined);
              render();
              toast('预设已保存', 'ok');
            },
          },
        ],
      });
      setTimeout(() => input.focus(), 60);
    }

    function askChunk() {
      const name = el('input', { class: 'input', placeholder: '片段名称，例如：银发红瞳' });
      const text = el('textarea', { class: 'input', rows: 4, placeholder: '提示词内容，例如：silver hair, red eyes, long hair' });
      const m = modal({
        title: '新建提示词片段',
        body: el('div', { class: 'form-stack' }, name, text),
        actions: [
          { label: '取消' },
          {
            label: '保存',
            primary: true,
            onClick: () => {
              if (!name.value.trim() || !text.value.trim()) {
                toast('名称和内容不能为空', 'error');
                return false;
              }
              addChunk(name.value.trim(), text.value.trim());
              render();
              toast('片段已保存', 'ok');
            },
          },
        ],
      });
    }

    function exportSettings() {
      const clean = JSON.parse(JSON.stringify(state, (k, v) => (['results', 'session', 'account', 'token', 'baseImage', 'vibes', 'refs'].includes(k) ? undefined : v)));
      const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
      downloadBlob(blob, 'novelai-studio-settings.json');
    }

    function importSettings() {
      const input = el('input', { type: 'file', accept: 'application/json' });
      input.addEventListener('change', async () => {
        const f = input.files?.[0];
        if (!f) return;
        try {
          const data = JSON.parse(await f.text());
          for (const [k, v] of Object.entries(data)) {
            if (['token', 'results', 'session', 'account'].includes(k)) continue;
            state[k] = v;
          }
          save();
          toast('设置已导入', 'ok');
          render();
        } catch (e) {
          toast(`导入失败：${e.message}`, 'error');
        }
      });
      input.click();
    }

    async function clearCache() {
      const { idb } = await import('../util.js');
      const assets = await idb.all('assets');
      for (const a of assets) {
        if (a.kind === 'vibe') await idb.delete('assets', a.id);
      }
      state.vibes = state.vibes.filter((v) => v.imported);
      save();
      toast('Vibe 缓存已清理', 'ok');
      render();
    }

    async function clearAll() {
      if (!(await confirmDialog('清空全部本地数据', '将删除 Token、图库、预设、参考图与所有缓存，无法恢复。', { danger: true }))) return;
      const { openDB } = await import('../util.js');
      const db = await openDB();
      for (const name of ['gallery', 'assets', 'kv']) {
        await new Promise((res) => {
          const t = db.transaction(name, 'readwrite');
          t.objectStore(name).clear();
          t.oncomplete = res;
        });
      }
      localStorage.removeItem('nai-studio:state:v1');
      location.reload();
    }
  }
}

function card(title, ...children) {
  return el('section', { class: 'card settings-card' },
    el('div', { class: 'card-head' }, el('span', { class: 'card-title' }, title)),
    el('div', { class: 'settings-body' }, ...children));
}

function listRow(name, sub, desc) {
  return el('div', { class: 'list-row' },
    el('div', { class: 'list-main' },
      el('div', { class: 'list-name' }, name),
      el('div', { class: 'list-sub' }, sub),
      desc ? el('div', { class: 'list-desc dim' }, desc) : null));
}

function renderAccount() {
  const a = state.account;
  if (!a) return el('div', { class: 'hint' }, '未连接');
  const usage = a.usage?.percent ?? null;
  const box = el('div', { class: 'account-box' });
  box.append(
    el('div', { class: 'account-tier' },
      el('span', { class: `tier-badge tier-${a.tier}` }, tierName(a.tier)),
      el('span', { class: 'dim' }, a.active ? '有效' : '未激活')),
  );
  if (a.expiresAt) box.append(el('div', { class: 'kv' }, el('span', { class: 'k' }, '到期时间'), el('span', { class: 'v' }, formatDate(a.expiresAt))));
  if (usage != null) {
    box.append(el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Anlas 使用'), el('span', { class: 'v' }, `${usage}%`)));
    const bar = el('div', { class: 'account-bar' }, el('div', { class: 'account-fill', style: { width: `${Math.min(100, usage)}%` } }));
    box.append(bar);
  }
  if (a.priority?.taskPriority) box.append(el('div', { class: 'kv' }, el('span', { class: 'k' }, '优先级'), el('span', { class: 'v' }, String(a.priority.taskPriority))));
  box.append(el('div', { class: 'hint' }, `更新于 ${formatDate(a.fetchedAt)}`));
  return box;
}
