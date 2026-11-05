/**
 * Handsontable + FullCalendar (CDN) — giống lichkhoa-webapp index.html.
 * Chỉ tải khi mở module Lịch khoa.
 */
const HOT_CSS = 'https://cdn.jsdelivr.net/npm/handsontable/dist/handsontable.full.min.css';
const HOT_JS = 'https://cdn.jsdelivr.net/npm/handsontable/dist/handsontable.full.min.js';
const FC_JS = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.11/index.global.min.js';

let loadPromise = null;

function appendStylesheet(href) {
  if (document.querySelector(`link[data-lichkhoa-lib="hot-css"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute('data-lichkhoa-lib', 'hot-css');
  document.head.appendChild(link);
}

function appendScript(src, marker) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-lichkhoa-lib="${marker}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.setAttribute('data-lichkhoa-lib', marker);
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Không tải được ${src}`));
    document.head.appendChild(script);
  });
}

export function isLichKhoaSheetEngineReady() {
  return typeof window !== 'undefined' && !!window.Handsontable;
}

export function ensureLichKhoaSheetLibs() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.Handsontable && window.FullCalendar) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    appendStylesheet(HOT_CSS);
    await appendScript(HOT_JS, 'hot-js');
    if (!window.FullCalendar) {
      await appendScript(FC_JS, 'fc-js');
    }
  })().catch((err) => {
    loadPromise = null;
    throw err;
  });

  return loadPromise;
}
