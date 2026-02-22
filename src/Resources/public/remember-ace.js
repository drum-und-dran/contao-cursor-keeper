/* Drum und Dran, Gunnar Haeuschkel, Website: https://drum-und-dran.de
 * GitHub: https://github.com/drum-und-dran/contao-cursor-keeper
 */
(() => {
  'use strict';

  const href = String(location.href);
  if (!href.includes('/contao')) return;

  const url = new URL(href);
  if (url.searchParams.get('act') !== 'source' || !url.searchParams.has('id')) return;

  const fileId = decodeURIComponent(url.searchParams.get('id') || '');
  const BASE_KEY = `contao-ace-pos::id::${fileId}`;
  const PENDING_KEY = `contao-ace-pos::pending::id::${fileId}`;
  const PENDING_FALLBACK_A = `contao-ace-pos::pending::${location.pathname}|${location.search}`;
  const PENDING_FALLBACK_B = `contao-ace-pos::pending::${location.pathname}|?do=${url.searchParams.get('do') || ''}`;

  const read = (k) => {
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; }
  };
  const write = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  };
  const del = (k) => {
    try { localStorage.removeItem(k); } catch {}
  };

  const throttle = (fn, ms) => {
    let t = 0;
    let queued = false;
    let lastArgs = null;
    return (...args) => {
      lastArgs = args;
      if (queued) return;
      queued = true;
      const now = Date.now();
      const wait = Math.max(0, t + ms - now);
      setTimeout(() => {
        queued = false;
        t = Date.now();
        fn(...lastArgs);
      }, wait);
    };
  };

  const snapshot = (editor) => {
    try {
      const pos = editor.getCursorPosition();
      const firstVisibleRow = editor.getFirstVisibleRow?.();
      return {
        ts: Date.now(),
        row: Math.max(0, pos?.row ?? 0),
        column: Math.max(0, pos?.column ?? 0),
        firstVisibleRow: Number.isFinite(firstVisibleRow) ? firstVisibleRow : 0
      };
    } catch {
      return { ts: Date.now(), row: 0, column: 0, firstVisibleRow: 0 };
    }
  };

  const persist = (key, editor) => write(key, snapshot(editor));

  const centerCursor = (editor, row, col) => {
    const lh = editor?.renderer?.lineHeight || 16;
    const scrollerH = editor?.renderer?.$size?.scrollerHeight || 0;
    if (!scrollerH) {
      editor.renderer?.scrollCursorIntoView?.({ row, column: col }, 0.5);
      return;
    }

    const screenPos = editor.session.documentToScreenPosition(row, col);
    const screenRow = Math.max(0, screenPos?.row ?? row);
    const viewportRows = Math.max(1, Math.floor(scrollerH / lh));
    const topScreenRow = Math.max(0, screenRow - Math.floor(viewportRows / 2));

    editor.session.setScrollTop(topScreenRow * lh);
    editor.renderer.scrollCursorIntoView({ row, column: col }, 0.5);
  };

  const setPending = (editor) => {
    write(PENDING_KEY, snapshot(editor));
    write(PENDING_FALLBACK_A, snapshot(editor));
    write(PENDING_FALLBACK_B, snapshot(editor));
  };

  const restore = (editor) => {
    const data = read(PENDING_KEY) || read(PENDING_FALLBACK_A) || read(PENDING_FALLBACK_B) || read(BASE_KEY);
    if (!data || typeof data.row !== 'number') return;

    const row = Math.max(0, data.row || 0);
    const col = Math.max(0, data.column || 0);

    editor.__aceCursorKeeperRestoring = true;

    const apply = () => {
      try {
        editor.focus();
        editor.moveCursorTo(row, col);
        centerCursor(editor, row, col);
      } catch {}
    };

    const cleanup = () => {
      del(PENDING_KEY);
      del(PENDING_FALLBACK_A);
      del(PENDING_FALLBACK_B);
      setTimeout(() => { editor.__aceCursorKeeperRestoring = false; }, 400);
    };

    requestAnimationFrame(() => requestAnimationFrame(() => {
      apply();

      let tries = 18;
      const stabilize = () => {
        apply();
        if (--tries <= 0) return cleanup();

        const top = editor.getFirstVisibleRow?.() ?? 0;
        const bottom = editor.getLastVisibleRow?.() ?? top;
        if (row >= top && row <= bottom) return cleanup();

        setTimeout(stabilize, 60);
      };

      stabilize();
    }));
  };

  const bindEditor = (editor) => {
    if (!editor || editor.__aceCursorKeeperBound) return;
    editor.__aceCursorKeeperBound = true;

    const saveBase = throttle(() => {
      if (editor.__aceCursorKeeperRestoring) return;
      persist(BASE_KEY, editor);
    }, 250);

    editor.selection?.on?.('changeCursor', saveBase);
    editor.renderer?.on?.('afterRender', throttle(() => {
      if (editor.__aceCursorKeeperRestoring) return;
      persist(BASE_KEY, editor);
    }, 400));

    const earlyPending = () => {
      try { setPending(editor); } catch {}
    };

    window.addEventListener('beforeunload', earlyPending, { passive: true });
    window.addEventListener('pagehide', earlyPending, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') earlyPending();
    }, { passive: true });

    const form = document.querySelector('form.tl_edit_form') || document.querySelector('form#tl_files');
    const btnSave = document.getElementById('save');
    const btnSaveClose = document.getElementById('saveNclose');

    if (btnSave) btnSave.addEventListener('mousedown', () => setPending(editor), { capture: true });
    if (btnSaveClose) btnSaveClose.addEventListener('mousedown', () => setPending(editor), { capture: true });
    if (form) form.addEventListener('submit', () => setPending(editor), { capture: true });

    restore(editor);
  };

  const hookAce = () => {
    if (!window.ace || typeof window.ace.edit !== 'function') return false;
    if (window.ace.__aceCursorKeeperHooked) return true;

    const original = window.ace.edit.bind(window.ace);
    window.ace.edit = (el, ...rest) => {
      const editor = original(el, ...rest);
      try {
        const container = editor?.container;
        const id = container?.id || '';
        if (id === 'ctrl_source_div') bindEditor(editor);
      } catch {}
      return editor;
    };

    window.ace.__aceCursorKeeperHooked = true;
    return true;
  };

  const start = () => {
    let tries = 200;
    const tick = () => {
      if (hookAce()) return;
      if (--tries <= 0) return;
      setTimeout(tick, 25);
    };
    tick();
  };

  start();
})();
