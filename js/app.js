// App shell: routing, nav, boot.

import { state, init, tierName, save } from './state.js';
import { $, el, svg, setLang } from './util.js';
import { toast } from './ui.js';
import { loadPlugins } from './plugins.js';
import { getUserData } from './api.js';
import { authGate, renderLogin } from './auth.js';
import * as generate from './views/generate.js';
import * as gallery from './views/gallery.js';
import * as batch from './views/batch.js';
import * as tools from './views/tools.js';
import * as settings from './views/settings.js';

const routes = {
  generate: { el: null, mount: generate.mount, title: '生成' },
  gallery: { el: null, mount: gallery.mount, title: '图库' },
  batch: { el: null, mount: batch.mount, title: '批量' },
  tools: { el: null, mount: tools.mount, title: '工具' },
  settings: { el: null, mount: settings.mount, title: '设置' },
};

let current = 'generate';

export async function boot() {
  const gate = await authGate();
  if (!gate.ok) {
    renderLogin(gate.env, () => location.reload());
    return;
  }
  if (gate.token) state.token = gate.token;
  await init();
  document.documentElement.dataset.theme = state.theme || 'dark';
  setLang(state.lang || 'zh');
  await loadPlugins();
  renderShell();
  window.addEventListener('hashchange', onHash);
  onHash();
  registerSW();
  window.addEventListener('online', () => toast('网络已恢复', 'ok'));
  window.addEventListener('offline', () => toast('网络已断开', 'error'));
  window.addEventListener('nai:account', () => renderAccountChip());
  if (state.token) refreshAccount();
}

async function refreshAccount() {
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
    renderAccountChip();
    window.dispatchEvent(new CustomEvent('nai:account'));
  } catch (e) {
    console.warn('account refresh failed', e.message);
  }
}

function renderShell() {
  const app = $('#app');
  app.innerHTML = `
    <header class="app-header">
      <div class="brand">
        <span class="brand-mark">${svg('spark')}</span>
        <span class="brand-name">NovelAI <b>Studio</b></span>
      </div>
      <div class="header-actions">
        <button class="chip account-chip" id="accountChip"></button>
        <button class="icon-btn" id="themeBtn" title="切换主题">${svg('moon')}</button>
      </div>
    </header>
    <div class="token-banner" id="tokenBanner" hidden>
      <span>还没有配置 NovelAI Token，生成功能不可用。</span>
      <button class="btn btn-xs" id="goSettings">去设置</button>
    </div>
    <main class="view" id="view"></main>
    <nav class="tabbar">
      <button class="tab active" data-tab="generate">${svg('bolt')}<span>生成</span></button>
      <button class="tab" data-tab="gallery">${svg('image')}<span>图库</span></button>
      <button class="tab" data-tab="batch">${svg('grid')}<span>批量</span></button>
      <button class="tab" data-tab="tools">${svg('wand')}<span>工具</span></button>
      <button class="tab" data-tab="settings">${svg('settings')}<span>设置</span></button>
    </nav>`;

  $('#themeBtn').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = state.theme;
    document.querySelectorAll('.seg').forEach(() => {});
    renderThemeIcon();
    import('./state.js').then((m) => m.save());
  });
  $('#accountChip').addEventListener('click', () => navigate('#/settings'));
  $('#goSettings').addEventListener('click', () => navigate('#/settings'));
  document.querySelectorAll('[data-tab]').forEach((b) => {
    b.addEventListener('click', () => navigate('#/' + b.dataset.tab));
  });
  window.addEventListener('nai:gallery-changed', () => {
    if (current === 'gallery') renderRoute('gallery');
  });
  renderThemeIcon();
  renderAccountChip();
}

function renderThemeIcon() {
  const btn = $('#themeBtn');
  if (!btn) return;
  btn.innerHTML = svg(state.theme === 'light' ? 'sun' : 'moon');
}

function renderAccountChip() {
  const chip = $('#accountChip');
  if (!chip) return;
  const banner = $('#tokenBanner');
  if (!state.token) {
    chip.textContent = '未连接';
    chip.classList.add('warn');
    chip.classList.remove('ok');
    if (banner) banner.hidden = false;
    return;
  }
  chip.classList.remove('warn');
  if (state.account) {
    chip.textContent = `${tierName(state.account.tier)} · ${state.account.active ? '在线' : '已过期'}`;
    chip.classList.toggle('ok', !!state.account.active);
  } else {
    chip.textContent = 'Token 已保存';
    chip.classList.add('ok');
  }
  if (banner) banner.hidden = true;
}

function navigate(hash) {
  if (location.hash === hash) {
    onHash();
    return;
  }
  location.hash = hash;
}

function onHash() {
  const name = (location.hash.replace(/^#\//, '') || 'generate').split('?')[0];
  const route = routes[name] ? name : 'generate';
  renderRoute(route);
}

function renderRoute(name) {
  current = name;
  const view = $('#view');
  if (!view) return;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  view.innerHTML = '';
  view.className = `view view-${name}`;
  const route = routes[name];
  try {
    route.mount(view, { navigate });
    if (name === 'generate') renderAccountChip();
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="fatal">页面加载失败：${e.message}</div>`;
  }
  window.scrollTo(0, 0);
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch (e) {
    console.warn('SW register failed', e);
  }
}

window.addEventListener('error', (e) => {
  console.error('Uncaught', e.error || e.message);
});
