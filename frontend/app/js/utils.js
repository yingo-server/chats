/* ═══ Utils: DOM + Format + Store ═══ */
window.Utils = {
  $(sel) { return document.querySelector(sel); },
  $$(sel) { return document.querySelectorAll(sel); },
  id(id) { return document.getElementById(id); },

  create(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'className') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else el.setAttribute(k, v);
      }
    }
    if (children) {
      if (typeof children === 'string') el.textContent = children;
      else if (Array.isArray(children)) children.forEach(c => { if (c) el.appendChild(c); });
      else el.appendChild(children);
    }
    return el;
  },

  icon(name, size) {
    const span = document.createElement('span');
    span.className = 'material-symbols-outlined';
    span.textContent = name;
    if (size) span.style.fontSize = size + 'px';
    return span;
  },

  esc(s) {
    if (s === null || s === undefined) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  },

  on(el, evt, fn) { if (el) el.addEventListener(evt, fn); },
  onDelegate(el, sel, evt, fn) {
    if (!el) return;
    el.addEventListener(evt, e => {
      const target = e.target.closest(sel);
      if (target && el.contains(target)) fn(e, target);
    });
  },

  show(el) { if (el) el.style.display = ''; },
  hide(el) { if (el) el.style.display = 'none'; },

  /* ═══ Format ═══ */
  timeAgo(ms) {
    if (!ms) return '';
    const diff = Date.now() - ms;
    const abs = Math.abs(diff);
    const s = Math.floor(abs / 1000);
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + '分钟前';
    if (s < 86400) return Math.floor(s / 3600) + '小时前';
    const d = new Date(ms);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return '昨天 ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  },

  timeFull(ms) {
    if (!ms) return '';
    return new Date(ms).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  },

  /* ═══ Store ═══ */
  store: {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
    remove(key) { localStorage.removeItem(key); },
  },
};
