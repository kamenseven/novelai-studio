// Reusable UI pieces: toasts, modals, controls, image viewer.

import { $, el, svg, clamp, escapeHTML, t } from './util.js';

/* -------------------------------------------------------------------- toast */

let toastHost;
export function toast(message, type = 'info', ms = 2800) {
  if (!toastHost) {
    toastHost = el('div', { class: 'toast-host' });
    document.body.append(toastHost);
  }
  const node = el('div', { class: `toast toast-${type}` }, message);
  toastHost.append(node);
  requestAnimationFrame(() => node.classList.add('in'));
  setTimeout(() => {
    node.classList.remove('in');
    setTimeout(() => node.remove(), 250);
  }, ms);
  return node;
}

/* -------------------------------------------------------------------- modal */

let modalStack = 0;
export function modal({ title, body, actions = [], wide = false, onClose, className = '' }) {
  const root = el('div', { class: `modal-backdrop ${wide ? 'wide' : ''} ${className}` });
  const panel = el('div', { class: 'modal' });
  const head = el('div', { class: 'modal-head' },
    el('div', { class: 'modal-title' }, title || ''),
    el('button', { class: 'icon-btn', 'aria-label': 'close', onclick: close, html: svg('close') }));
  const bodyEl = el('div', { class: 'modal-body' });
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.append(body);
  const foot = el('div', { class: 'modal-foot' });
  for (const a of actions) {
    const btn = el('button', {
      class: `btn ${a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : ''}`,
      onclick: async () => {
        if (a.onClick) {
          const r = await a.onClick();
          if (r === false) return;
        }
        if (a.close !== false) close();
      },
    }, a.label);
    foot.append(btn);
  }
  panel.append(head, bodyEl);
  if (actions.length) panel.append(foot);
  root.append(panel);
  root.addEventListener('pointerdown', (e) => {
    if (e.target === root) close();
  });
  document.body.append(root);
  modalStack++;
  document.body.classList.add('modal-open');

  function close() {
    if (!root.isConnected) return;
    root.classList.add('out');
    setTimeout(() => {
      root.remove();
      modalStack = Math.max(0, modalStack - 1);
      if (!modalStack) document.body.classList.remove('modal-open');
      onClose?.();
    }, 160);
  }
  requestAnimationFrame(() => root.classList.add('in'));
  return { root, panel, body: bodyEl, close };
}

export function confirmDialog(title, message, { danger = false, okLabel = t('confirm') } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title,
      body: el('p', { class: 'confirm-text' }, message),
      actions: [
        { label: t('cancel'), onClick: () => { done = true; resolve(false); } },
        { label: okLabel, danger, primary: !danger, onClick: () => { done = true; resolve(true); } },
      ],
      onClose: () => {
        if (!done) resolve(false);
      },
    });
    m.root.classList.add('confirm');
  });
}

/* ----------------------------------------------------------------- controls */

export function field(label, control, hint) {
  return el('div', { class: 'field' },
    el('div', { class: 'field-head' }, el('span', { class: 'field-label' }, label), hint ? el('span', { class: 'field-hint' }, hint) : null),
    control);
}

export function segmented(options, value, onChange, { small = false } = {}) {
  const wrap = el('div', { class: `segmented ${small ? 'sm' : ''}`, role: 'tablist' });
  for (const o of options) {
    const b = el('button', {
      class: `seg ${o.value === value ? 'active' : ''}`,
      type: 'button',
      role: 'tab',
      'aria-selected': o.value === value ? 'true' : 'false',
      onclick: () => {
        for (const x of wrap.children) {
          x.classList.toggle('active', x === b);
          x.setAttribute('aria-selected', x === b ? 'true' : 'false');
        }
        onChange(o.value, o);
      },
    }, o.label);
    wrap.append(b);
  }
  return wrap;
}

export function select(options, value, onChange, cls = '') {
  const s = el('select', { class: `input select ${cls}` });
  for (const o of options) {
    s.append(el('option', { value: o.value, selected: String(o.value) === String(value) }, o.label));
  }
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

export function slider({ label, min = 0, max = 1, step = 0.01, value = 0, format, onInput, onChange, hint }) {
  const num = el('input', { class: 'input num', type: 'number', min, max, step, value, inputmode: 'decimal' });
  const range = el('input', { class: 'range', type: 'range', min, max, step, value });
  const fmt = format || ((v) => (Number.isInteger(step) ? v : Number(v).toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)));
  const out = el('span', { class: 'slider-value' }, fmt(value));
  const sync = (v, source) => {
    const val = clamp(Number(v), min, max);
    if (source !== 'range') range.value = val;
    if (source !== 'num') num.value = val;
    out.textContent = fmt(val);
    onInput?.(val);
  };
  range.addEventListener('input', () => sync(range.value, 'range'));
  num.addEventListener('change', () => sync(num.value, 'num'));
  num.addEventListener('input', () => {
    if (num.value === '') return;
    sync(num.value, 'num');
  });
  if (onChange) {
    range.addEventListener('change', () => onChange(Number(range.value)));
    num.addEventListener('blur', () => onChange(Number(num.value)));
  }
  return el('div', { class: 'slider-field' },
    el('div', { class: 'slider-head' }, el('span', { class: 'field-label' }, label), hint ? el('span', { class: 'field-hint' }, hint) : null, out),
    el('div', { class: 'slider-row' }, range, num));
}

export function switchRow(label, checked, onChange, hint) {
  const input = el('input', { type: 'checkbox', checked: !!checked });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'switch-row' },
    el('span', { class: 'switch-text' }, label, hint ? el('span', { class: 'field-hint block' }, hint) : null),
    el('span', { class: 'switch' }, input, el('span', { class: 'switch-track' })));
}

export function accordion(title, content, { open = false, badge = null } = {}) {
  const bodyEl = el('div', { class: 'acc-body' }, content);
  const btn = el('button', { class: 'acc-head', type: 'button' },
    el('span', { class: 'acc-title' }, title),
    badge ? el('span', { class: 'acc-badge' }, badge) : null,
    el('span', { class: 'acc-caret', html: svg('chevron') }));
  const wrap = el('section', { class: `acc ${open ? 'open' : ''}` }, btn, bodyEl);
  btn.addEventListener('click', () => wrap.classList.toggle('open'));
  return wrap;
}

export function iconBtn(icon, onClick, label = '', cls = '') {
  return el('button', { class: `icon-btn ${cls}`, type: 'button', 'aria-label': label, title: label, onclick: onClick, html: svg(icon) });
}

export function labeledValue(label, value) {
  return el('div', { class: 'kv' }, el('span', { class: 'k' }, label), el('span', { class: 'v' }, value));
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t('copied'), 'ok', 1200);
    return true;
  } catch {
    const ta = el('textarea', { class: 'hidden-textarea' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast(t('copied'), 'ok', 1200);
      return true;
    } catch {
      return false;
    } finally {
      ta.remove();
    }
  }
}

/* --------------------------------------------------------------- image viewer */

export function openViewer(src, { meta = null, caption = '' } = {}) {
  const img = el('img', { src, alt: caption, draggable: false });
  const stage = el('div', { class: 'viewer-stage' }, img);
  const close = el('button', { class: 'viewer-close icon-btn', html: svg('close'), onclick: () => remove() });
  const info = el('div', { class: 'viewer-info' }, caption);
  const root = el('div', { class: 'viewer' }, stage, close, info);
  document.body.append(root);
  document.body.classList.add('modal-open');

  let scale = 1;
  let tx = 0;
  let ty = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let pinch = null;

  const apply = () => {
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };
  const reset = () => {
    scale = 1;
    tx = 0;
    ty = 0;
    apply();
  };

  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    scale = clamp(scale * factor, 0.4, 8);
    apply();
  }, { passive: false });

  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' && e.isPrimary === false) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    tx += e.clientX - lastX;
    ty += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    apply();
  });
  stage.addEventListener('pointerup', () => {
    dragging = false;
  });
  stage.addEventListener('dblclick', reset);
  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const [a, b] = e.touches;
      pinch = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), scale };
    }
  }, { passive: true });
  stage.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinch) {
      const [a, b] = e.touches;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      scale = clamp(pinch.scale * (d / pinch.dist), 0.4, 8);
      apply();
    }
  }, { passive: true });
  stage.addEventListener('touchend', () => {
    pinch = null;
  });

  function remove() {
    root.remove();
    if (!document.querySelector('.modal-backdrop, .viewer')) document.body.classList.remove('modal-open');
    window.removeEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (e.key === 'Escape') remove();
  }
  window.addEventListener('keydown', onKey);
  requestAnimationFrame(() => root.classList.add('in'));
}

/* ------------------------------------------------------------------- helpers */

export function emptyState(icon, title, sub) {
  return el('div', { class: 'empty' },
    el('div', { class: 'empty-icon', html: svg(icon) }),
    el('div', { class: 'empty-title' }, title),
    sub ? el('div', { class: 'empty-sub' }, sub) : null);
}

export function spinner(label = '') {
  return el('span', { class: 'spinner-wrap' }, el('span', { class: 'spinner' }), label ? el('span', null, label) : null);
}

export function safeHTML(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return tpl.content;
}

export function pill(text, cls = '') {
  return el('span', { class: `pill ${cls}` }, text);
}

export function sectionTitle(title, extra) {
  return el('div', { class: 'section-title' }, el('h3', null, title), extra || null);
}

export function imagePlaceholder(text) {
  return el('div', { class: 'placeholder' }, el('div', { class: 'ph-inner' }, escapeHTML(text)));
}
