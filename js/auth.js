// Optional password gate + cookie "remember me" for static hosting.
// The NovelAI token in env is AES-GCM encrypted with a PBKDF2 key derived from the password.

import { loadEnv } from './env.js';
import { el, svg } from './util.js';

const COOKIE = 'nai_studio_auth';
const TOKEN_KEY = 'nai-studio:auth-token';
const ITERATIONS = 210000;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function isAuthConfigured(env) {
  return !!(env?.APP_PASSWORD_SHA256 || env?.APP_PASSWORD || env?.NOVEL_AI_TOKEN_ENC);
}

function basePath() {
  const p = location.pathname;
  if (p.endsWith('/')) return p;
  return p.replace(/[^/]*$/, '') || '/';
}

function setCookie(name, value, days) {
  let c = `${name}=${encodeURIComponent(value)}; path=${basePath()}; SameSite=Lax`;
  if (days > 0) c += `; max-age=${days * 86400}`;
  if (location.protocol === 'https:') c += '; Secure';
  document.cookie = c;
}

function getCookie(name) {
  const parts = document.cookie ? document.cookie.split(';') : [];
  for (const part of parts) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return part.slice(i + 1).trim();
      }
    }
  }
  return '';
}

function expectedCookie(env) {
  return 'v1.' + String(env.APP_PASSWORD_SHA256 || 'plain').slice(0, 24);
}

export function getStoredAuthToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function storeAuthToken(token, remember = true) {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    if (!token) return;
    if (remember) localStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function clearAuth() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {}
  setCookie(COOKIE, '', -1);
}

export async function authGate() {
  const env = await loadEnv();
  if (!isAuthConfigured(env)) return { ok: true, env, token: getStoredAuthToken() };
  const token = getStoredAuthToken();
  const cookieOk = getCookie(COOKIE) === expectedCookie(env);
  if (token && cookieOk) return { ok: true, env, token };
  return { ok: false, env, token: '' };
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function decryptToken(password, env) {
  if (!env.NOVEL_AI_TOKEN_ENC) return env.NOVEL_AI_TOKEN || '';
  const raw = b64ToBytes(env.NOVEL_AI_TOKEN_ENC);
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const salt = b64ToBytes(env.ENC_SALT || '');
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return dec.decode(plain);
}

export async function login(password, remember, env) {
  if (!crypto?.subtle) throw new Error('当前环境不支持 WebCrypto，请用 https 或 localhost 打开');
  if (!password) throw new Error('请输入密码');
  const hash = await sha256Hex(password);
  if (env.APP_PASSWORD_SHA256 && hash !== String(env.APP_PASSWORD_SHA256).toLowerCase()) {
    throw new Error('密码错误');
  }
  if (!env.APP_PASSWORD_SHA256 && env.APP_PASSWORD && password !== env.APP_PASSWORD) {
    throw new Error('密码错误');
  }
  const token = await decryptToken(password, env);
  if (!token) throw new Error('env 中没有可用的 Token');
  storeAuthToken(token, remember);
  setCookie(COOKIE, expectedCookie(env), remember ? 30 : 0);
  return token;
}

export function logout() {
  clearAuth();
  try {
    const raw = localStorage.getItem('nai-studio:state:v1');
    if (raw) {
      const s = JSON.parse(raw);
      s.token = '';
      s.tokenFromEnv = false;
      localStorage.setItem('nai-studio:state:v1', JSON.stringify(s));
    }
  } catch {}
  location.reload();
}

export function renderLogin(env, onDone) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '';
  const input = el('input', {
    class: 'input login-input',
    type: 'password',
    placeholder: '输入密码',
    autocomplete: 'current-password',
    spellcheck: 'false',
  });
  const show = el('button', {
    class: 'icon-btn',
    type: 'button',
    title: '显示/隐藏',
    html: svg('eye'),
    onclick: () => {
      input.type = input.type === 'password' ? 'text' : 'password';
    },
  });
  const remember = el('input', { type: 'checkbox', checked: true });
  const error = el('div', { class: 'login-error' });
  const button = el('button', { class: 'btn btn-primary login-btn', type: 'submit' }, '解锁');
  const form = el('form', { class: 'login-card' },
    el('div', { class: 'login-logo', html: svg('spark') }),
    el('div', { class: 'login-title' }, 'NovelAI Studio'),
    el('div', { class: 'login-sub' }, '输入密码解锁。Token 已加密存放在 env 中。'),
    el('div', { class: 'login-row' }, input, show),
    el('label', { class: 'login-remember' }, remember, el('span', null, '记住登录状态 30 天')),
    error,
    button,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (button.disabled) return;
    error.textContent = '';
    button.disabled = true;
    button.textContent = '解锁中…';
    try {
      await login(input.value, remember.checked, env);
      onDone?.();
    } catch (err) {
      error.textContent = err.message || String(err);
      button.disabled = false;
      button.textContent = '解锁';
      input.select();
    }
  });
  app.append(el('div', { class: 'login-screen' }, form));
  setTimeout(() => input.focus(), 80);
}
