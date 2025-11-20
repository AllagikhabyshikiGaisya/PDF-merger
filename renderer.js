// renderer.js – loaded with <script type="module">
// Uses libs exposed by preload.js

const { pdfjsDistPath, pdfjsWorkerPath, pdfLibPath } = window.libs;

// Dynamically import pdfjs-dist ESM modules
const pdfjsLib = await import(`file://${pdfjsDistPath}`);

// Set worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${pdfjsWorkerPath}`;

// Load pdf-lib from UMD bundle
let PDFLib;
try {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `file://${pdfLibPath}`;
    script.onload = () => {
      PDFLib = window.PDFLib;
      console.log('pdf-lib loaded successfully');
      console.log('PDFDocument.create available:', typeof PDFLib.PDFDocument.create);
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
} catch (err) {
  console.error('Failed to load pdf-lib:', err);
}

// UI elements
const fileElem = document.getElementById('fileElem');
const filesList = document.getElementById('filesList');
const dropArea = document.getElementById('drop-area');
const mergeBtn = document.getElementById('mergeBtn');
const mergeEditBtn = document.getElementById('mergeEditBtn');
const statusEl = document.getElementById('status');
const clearBtn = document.getElementById('clearBtn');
const countEl = document.getElementById('count');
const totalsizeEl = document.getElementById('totalsize');
const dropText = document.getElementById('dropText');
const addBtn = document.getElementById('addBtn');
const titleEl = document.getElementById('title');
const subtitleEl = document.getElementById('subtitle');
const footerText = document.getElementById('footerText');
const langToggle = document.getElementById('langToggle');

const editorOverlay = document.getElementById('editorOverlay');
const pageContainer = document.getElementById('pageContainer');
const pageLabel = document.getElementById('pageLabel');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');

const toolButtons = document.querySelectorAll('.tool[data-tool]');
const colorButtons = document.querySelectorAll('.color-btn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const doneBtn = document.getElementById('doneBtn');
const closeEditorBtn = document.getElementById('closeEditor');

let files = []; // { id, name, type, size, buffer:ArrayBuffer, thumbUrl }
let currentLang = 'ja'; // default Japanese
let editingPages = []; // array of { baseCanvas, annotCanvas, actions, redo, scale }
let currentPageIndex = 0;
let currentTool = 'pointer';
let strokeColor = '#ff0000';
let strokeWidth = 3;
let highlightColor = 'rgba(255,235,59,0.45)';

// Selected text action (for delete shortcut and active outline)
let selectedTextAction = null;

// Color mapping for highlights
const highlightColorMap = {
  '#fbbf24': 'rgba(251,191,36,0.45)',  // Yellow
  '#10b981': 'rgba(16,185,129,0.45)',  // Green
  '#ff0000': 'rgba(255,0,0,0.45)',     // Red
  '#000000': 'rgba(0,0,0,0.3)',        // Black
  '#0b5fff': 'rgba(11,95,255,0.45)',   // Blue
  '#f97316': 'rgba(249,115,22,0.45)',  // Orange
  '#a855f7': 'rgba(168,85,247,0.45)',  // Purple
  '#ec4899': 'rgba(236,72,153,0.45)',  // Pink
};

// --- Language strings (simple Japanese default + English)
const LANG = {
  ja: {
    add: 'ファイル追加',
    clear: '全削除',
    merge: '結合する(保存のみ)',
    mergeEdit: '結合して編集',
    drag: 'ここにドラッグ&ドロップ または「ファイル追加」',
    status_idle: 'すべてPC内で処理(アップロードなし)',
    status_loading: '読み込み中…',
    status_merging: '結合中…',
    status_exporting: 'エクスポート中…',
    saved: '保存完了:',
    files: (n) => `${n} 個のファイル`,
    footer: 'ドラッグで並び替え、×で削除できます。',
    langBtn: '🇯🇵 日本語',
    remove: '削除',
  },
  en: {
    add: 'Add files',
    clear: 'Clear All',
    merge: 'Merge files (save only)',
    mergeEdit: 'Merge & Edit',
    drag: 'Drag files here or click Add files',
    status_idle: 'All files stay on this PC — no upload.',
    status_loading: 'Processing files...',
    status_merging: 'Merging...',
    status_exporting: 'Exporting...',
    saved: 'Saved:',
    files: (n) => `${n} files`,
    footer: 'Drag to reorder, click × to remove.',
    langBtn: '🇺🇸 English',
    remove: 'Remove',
  },
};

function applyLanguage() {
  const L = LANG[currentLang];
  addBtn.innerText = L.add;
  clearBtn.innerText = L.clear;
  mergeBtn.innerText = L.merge;
  mergeEditBtn.innerText = L.mergeEdit;
  dropText.innerText = L.drag;
  statusEl.innerText = L.status_idle;
  footerText.innerText = L.footer;
  langToggle.innerText = L.langBtn;
  titleEl.innerText = currentLang === 'ja' ? 'PDF結合ツール' : 'PDF Merger';
  subtitleEl.innerText = currentLang === 'ja' ? 'ローカルで高速結合・編集' : 'Local & Fast';
  updateSummary();
}

langToggle.addEventListener('click', () => {
  currentLang = currentLang === 'ja' ? 'en' : 'ja';
  applyLanguage();
});

applyLanguage();

// ---------- file utilities ----------
function humanSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return Math.round(bytes / (1024* 1024)) + ' MB';
}

function updateSummary() {
  const L = LANG[currentLang];
  countEl.innerText = L.files(files.length);
  const total = files.reduce((s, f) => s + (f.size || 0), 0);
  totalsizeEl.innerText = humanSize(total);
}

// render file cards
function renderFiles() {
  filesList.innerHTML = '';
  files.forEach((f, idx) => {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.draggable = true;

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (f.thumbUrl) {
      const img = document.createElement('img');
      img.src = f.thumbUrl;
      thumb.appendChild(img);
    } else {
      const s = document.createElement('div');
      s.style.fontSize = '22px';
      s.innerText = '📄';
      thumb.appendChild(s);
    }

    const meta = document.createElement('div');
    meta.className = 'file-meta';
    const nameEl = document.createElement('div');
    nameEl.className = 'fname';
    nameEl.innerText = f.name;
    const infoEl = document.createElement('div');
    infoEl.className = 'fmeta';
    infoEl.innerText = `${f.type} • ${humanSize(f.size)}`;
    meta.appendChild(nameEl);
    meta.appendChild(infoEl);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.innerText = '×';
    removeBtn.title = LANG[currentLang].remove;
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      URL.revokeObjectURL(f.thumbUrl || '');
      files.splice(idx, 1);
      renderFiles();
      updateSummary();
    };

    // drag handlers for reorder
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(idx));
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', (e) => e.preventDefault());
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      const src = Number(e.dataTransfer.getData('text/plain'));
      const dest = idx;
      if (!isNaN(src) && src !== dest) {
        const moved = files.splice(src, 1)[0];
        files.splice(dest, 0, moved);
        renderFiles();
        updateSummary();
      }
    });

    card.appendChild(thumb);
    card.appendChild(meta);
    card.appendChild(removeBtn);
    filesList.appendChild(card);
  });
}

// -------- image downscale & read --------
const MAX_IMAGE_WIDTH = 1600;
const JPEG_QUALITY = 0.8;

async function resizeImageFileToJpegArrayBuffer(file, maxWidth = MAX_IMAGE_WIDTH, quality = JPEG_QUALITY) {
  try {
    const imageBitmap = await createImageBitmap(file);
    const ratio = Math.min(1, maxWidth / imageBitmap.width);
    const tw = Math.round(imageBitmap.width * ratio);
    const th = Math.round(imageBitmap.height * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, 0, 0, tw, th);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return await blob.arrayBuffer();
  } catch (e) {
    console.error('Image resize error:', e);
    return await file.arrayBuffer();
  }
}

async function handleFileList(fileList) {
  statusEl.innerText = LANG[currentLang].status_loading;
  const inputFiles = Array.from(fileList);
  for (const file of inputFiles) {
    if (!/\.(pdf|png|jpe?g|jpg)$/i.test(file.name)) continue;
    const lower = file.name.toLowerCase();
    if (/\.(png|jpe?g|jpg)$/i.test(lower)) {
      const ab = await resizeImageFileToJpegArrayBuffer(file);
      files.push({
        id: Math.random().toString(36).slice(2, 9),
        name: file.name,
        type: 'image/jpeg',
        size: ab.byteLength,
        buffer: ab,
        thumbUrl: URL.createObjectURL(file),
      });
    } else if (/\.(pdf)$/i.test(lower)) {
      const ab = await file.arrayBuffer();
      files.push({
        id: Math.random().toString(36).slice(2, 9),
        name: file.name,
        type: 'application/pdf',
        size: ab.byteLength,
        buffer: ab,
        thumbUrl: null,
      });
    }
  }
  renderFiles();
  updateSummary();
  statusEl.innerText = LANG[currentLang].status_idle;
}

fileElem.addEventListener('change', async (e) => {
  await handleFileList(e.target.files);
  fileElem.value = null;
});

// drag-drop area
['dragenter', 'dragover'].forEach((evt) =>
  dropArea.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropArea.classList.add('drag-over');
  })
);

['dragleave', 'drop'].forEach((evt) =>
  dropArea.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropArea.classList.remove('drag-over');
  })
);

dropArea.addEventListener('drop', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
    await handleFileList(e.dataTransfer.files);
  }
});

// clear
clearBtn.addEventListener('click', () => {
  files.forEach((f) => {
    if (f.thumbUrl) URL.revokeObjectURL(f.thumbUrl);
  });
  files = [];
  renderFiles();
  updateSummary();
});

// ---------- Merge-only (save) ----------
mergeBtn.addEventListener('click', async () => {
  if (files.length < 1) {
    statusEl.innerText = LANG[currentLang].status_idle;
    return;
  }
  statusEl.innerText = LANG[currentLang].status_merging;
  mergeBtn.disabled = true;
  try {
    const toSend = files.map((f) => ({ name: f.name, type: f.type, buffer: f.buffer }));
    const res = await window.electronAPI.mergeFiles(toSend);
    if (!res.success) throw new Error(res.message || 'merge failed');
    const bytes = Uint8Array.from(res.bytes);
    const saveRes = await window.electronAPI.saveBytes('merged.pdf', bytes);
    if (saveRes.success) statusEl.innerText = `${LANG[currentLang].saved} ${saveRes.path}`;
    else statusEl.innerText = 'Save canceled';
  } catch (err) {
    console.error(err);
    statusEl.innerText = 'Error: ' + (err.message || String(err));
  } finally {
    mergeBtn.disabled = false;
  }
});

// ---------- Merge & Edit workflow ----------
mergeEditBtn.addEventListener('click', async () => {
  if (files.length < 1) {
    statusEl.innerText = LANG[currentLang].status_idle;
    return;
  }
  statusEl.innerText = LANG[currentLang].status_merging;
  try {
    const toSend = files.map((f) => ({ name: f.name, type: f.type, buffer: f.buffer }));
    const res = await window.electronAPI.mergeFiles(toSend);
    if (!res.success) throw new Error(res.message || 'merge failed');
    const mergedBytes = Uint8Array.from(res.bytes);
    await openEditorWithPdf(mergedBytes);
  } catch (err) {
    console.error(err);
    statusEl.innerText = 'Error: ' + (err.message || String(err));
  } finally {
    statusEl.innerText = LANG[currentLang].status_idle;
  }
});

// ---------- Color Picker ----------
colorButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const color = btn.getAttribute('data-color');
    strokeColor = color;

    // Update highlight color based on selected color
    if (highlightColorMap[color]) {
      highlightColor = highlightColorMap[color];
    }

    // Update active state
    colorButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ---------- Editor: render merged PDF pages ----------
async function openEditorWithPdf(pdfBytesUint8) {
  editingPages = [];
  pageContainer.innerHTML = '';
  editorOverlay.classList.remove('hidden');

  const loadingTask = pdfjsLib.getDocument({ data: pdfBytesUint8 });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.className = 'base-canvas';
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    const annot = document.createElement('canvas');
    annot.className = 'annot-canvas';
    annot.width = canvas.width;
    annot.height = canvas.height;

    const wrap = document.createElement('div');
    wrap.className = 'page-wrap';
    wrap.style.margin = '12px';
    wrap.appendChild(canvas);
    wrap.style.position = 'relative';
    annot.style.position = 'absolute';
    annot.style.left = '10px';
    annot.style.top = '10px';
    annot.style.pointerEvents = 'auto';
    wrap.appendChild(annot);

    pageContainer.appendChild(wrap);

    const pageObj = {
      baseCanvas: canvas,
      annotCanvas: annot,
      actions: [],
      redo: [],
      scale: 1.5,
    };

    editingPages.push(pageObj);
    initAnnotCanvas(annot, pageObj);
  }

  currentPageIndex = 0;
  showPage(currentPageIndex);
  updatePageLabel();
  updateCursorForTool();
}

function showPage(index) {
  const wraps = Array.from(document.querySelectorAll('.page-wrap'));
  wraps.forEach((w, i) => {
    w.style.display = i === index ? 'block' : 'none';
  });
}

function updatePageLabel() {
  pageLabel.innerText = `${currentPageIndex + 1} / ${editingPages.length}`;
}

prevPageBtn && prevPageBtn.addEventListener('click', () => {
  if (currentPageIndex > 0) {
    currentPageIndex--;
    showPage(currentPageIndex);
    updatePageLabel();
  }
});

nextPageBtn && nextPageBtn.addEventListener('click', () => {
  if (currentPageIndex < editingPages.length - 1) {
    currentPageIndex++;
    showPage(currentPageIndex);
    updatePageLabel();
  }
});

// Update cursor based on current tool
function updateCursorForTool() {
  const canvases = document.querySelectorAll('.annot-canvas');
  canvases.forEach(canvas => {
    // Remove all cursor classes
    canvas.classList.remove('pointer-cursor', 'pen-cursor', 'text-cursor', 'crosshair-cursor');

    // Add appropriate cursor class
    if (currentTool === 'pointer') {
      canvas.classList.add('pointer-cursor');
    } else if (currentTool === 'pen') {
      canvas.classList.add('pen-cursor');
    } else if (currentTool === 'text') {
      canvas.classList.add('text-cursor');
    } else {
      canvas.classList.add('crosshair-cursor');
    }
  });
}

// ---------- Text Editor Controls (ChatGPT-like textarea + floating buttons outside) ----------
function showTextEditorControls(action, pageObj, canvasRect, isExisting = true) {
  // Close existing
  const existing = document.querySelector('.text-editor-controls');
  if (existing) existing.remove();

  // while editing / when opened, mark as selected to show outline
  selectedTextAction = isExisting ? action : null;

  // container for everything
  const controls = document.createElement('div');
  controls.className = 'text-editor-controls';
  controls.style.position = 'absolute';
  controls.style.zIndex = 22000;
  controls.style.left = Math.max(8, canvasRect.left + (action.x || 0)) + 'px';
  // slightly center vertically relative to action y
  const computedTop = Math.max(8, canvasRect.top + (action.y || 0) - 12);
  controls.style.top = computedTop + 'px';
  controls.style.display = 'flex';
  controls.style.alignItems = 'flex-start';
  controls.style.gap = '10px';
  controls.style.pointerEvents = 'auto';

  // Textarea card (ChatGPT-like)
  const textareaCard = document.createElement('div');
  textareaCard.style.display = 'flex';
  textareaCard.style.flexDirection = 'column';
  textareaCard.style.background = 'white';
  textareaCard.style.borderRadius = '12px';
  textareaCard.style.padding = '8px';
  textareaCard.style.boxShadow = '0 10px 30px rgba(2,6,23,0.08)';
  textareaCard.style.border = '1px solid rgba(0,0,0,0.06)';
  textareaCard.style.maxWidth = '640px';
  textareaCard.style.minWidth = '160px';
  textareaCard.style.width = Math.min(420, Math.max(160, action.width || 220)) + 'px';

  // ChatGPT-like textarea (single element)
  const textarea = document.createElement('textarea');
  textarea.className = 'floating-textarea';
  textarea.value = isExisting ? (action.text || '') : '';
  textarea.placeholder = currentLang === 'ja' ? 'テキストを入力…' : 'Type text…';
  textarea.style.width = '100%';
  textarea.style.height = Math.max(36, (action.height || 60)) + 'px';
  textarea.style.resize = 'vertical';
  textarea.style.padding = '10px 12px';
  textarea.style.fontSize = (action.size || 16) + 'px';
  textarea.style.lineHeight = '1.25';
  textarea.style.border = 'none';
  textarea.style.borderRadius = '8px';
  textarea.style.outline = 'none';
  textarea.style.background = 'transparent';
  textarea.style.fontFamily = 'inherit';
  textarea.style.color = '#0f172a';
  textarea.style.boxSizing = 'border-box';
  textarea.style.overflow = 'auto';

  // small footer row (optional small hint) to mimic chat area feel
  const footerRow = document.createElement('div');
  footerRow.style.display = 'flex';
  footerRow.style.justifyContent = 'space-between';
  footerRow.style.alignItems = 'center';
  footerRow.style.marginTop = '6px';
  footerRow.style.gap = '8px';

  const hint = document.createElement('div');
  hint.style.color = 'rgba(2,6,23,0.4)';
  hint.style.fontSize = '12px';
  hint.innerText = currentLang === 'ja' ? 'Ctrl/Cmd+Enterで保存' : 'Ctrl/Cmd+Enter to save';

  footerRow.appendChild(hint);

  textareaCard.appendChild(textarea);
  textareaCard.appendChild(footerRow);

  // Floating button column (outside the textarea, to the right)
  const btnColumn = document.createElement('div');
  btnColumn.style.display = 'flex';
  btnColumn.style.flexDirection = 'column';
  btnColumn.style.gap = '8px';
  btnColumn.style.alignItems = 'center';
  // visually separate from text area a bit
  btnColumn.style.marginLeft = '6px';
  btnColumn.style.marginTop = '6px';

  // Red delete floating button (circular)
  const deleteBtn = document.createElement('button');
  deleteBtn.innerText = '🗑';
  deleteBtn.title = 'Delete';
  deleteBtn.style.width = '44px';
  deleteBtn.style.height = '44px';
  deleteBtn.style.borderRadius = '50%';
  deleteBtn.style.border = 'none';
  deleteBtn.style.background = '#ef4444';
  deleteBtn.style.color = 'white';
  deleteBtn.style.cursor = 'pointer';
  deleteBtn.style.boxShadow = '0 6px 18px rgba(239,68,68,0.18)';
  deleteBtn.style.fontSize = '16px';

  deleteBtn.onclick = (e) => {
    e.stopPropagation();
    if (isExisting) {
      const idx = pageObj.actions.indexOf(action);
      if (idx > -1) {
        pageObj.actions.splice(idx, 1);
        pageObj.redo = [];
        pageObj.annotCanvas._redrawAll();
        controls.remove();
        selectedTextAction = null;
      }
    } else {
      controls.remove();
      selectedTextAction = null;
    }
  };

  // Green OK floating button (circular)
  const okBtn = document.createElement('button');
  okBtn.innerText = '✓';
  okBtn.title = 'Save';
  okBtn.style.width = '44px';
  okBtn.style.height = '44px';
  okBtn.style.borderRadius = '50%';
  okBtn.style.border = 'none';
  okBtn.style.background = '#16a34a';
  okBtn.style.color = 'white';
  okBtn.style.cursor = 'pointer';
  okBtn.style.boxShadow = '0 6px 18px rgba(16,163,75,0.18)';
  okBtn.style.fontSize = '16px';

  okBtn.onclick = (e) => {
    e.stopPropagation();
    commitText();
  };

  btnColumn.appendChild(deleteBtn);
  btnColumn.appendChild(okBtn);

  controls.appendChild(textareaCard);
  controls.appendChild(btnColumn);
  document.body.appendChild(controls);

  // commit function (adds action only if new, or updates if existing)
  function commitText() {
    const raw = textarea.value.replace(/\u00A0/g, '');
    const val = raw;
    if (val.trim()) {
      if (isExisting) {
        action.text = val;
        action.width = parseInt(textareaCard.style.width, 10) || action.width || 160;
        action.height = parseInt(textarea.style.height, 10) || action.height || 40;
        action.y = action.y || (action.size || 16) + 4;
        action.bold = false;
        action.italic = false;
        pageObj.redo = [];
        pageObj.annotCanvas._redrawAll();
      } else {
        const newAction = {
          type: 'text',
          text: val,
          x: action.x,
          y: action.y || (action.size || 16) + 4,
          color: strokeColor,
          size: 16,
          bold: false,
          italic: false,
          width: parseInt(textareaCard.style.width, 10) || action.width || 160,
          height: parseInt(textarea.style.height, 10) || action.height || 40,
        };
        pageObj.actions.push(newAction);
        pageObj.redo = [];
        pageObj.annotCanvas._redrawAll();
        // DO NOT keep the action selected after saving — clear selection so border is NOT shown
        selectedTextAction = null;
      }
    } else {
      // empty -> if existing remove, else just close
      if (isExisting) {
        const idx = pageObj.actions.indexOf(action);
        if (idx > -1) {
          pageObj.actions.splice(idx, 1);
          pageObj.redo = [];
          pageObj.annotCanvas._redrawAll();
        }
      }
    }
    controls.remove();
    // ensure selection cleared after save/close
    selectedTextAction = null;
  }

  // keyboard handlers: Ctrl/Cmd+Enter commit, Escape cancel
  textarea.addEventListener('keydown', (ev) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const mod = isMac ? ev.metaKey : ev.ctrlKey;
    if (mod && ev.key === 'Enter') {
      ev.preventDefault();
      commitText();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      controls.remove();
      if (!isExisting) selectedTextAction = null;
    }
  });

  // blur: commit after short delay (to allow clicking the floating buttons)
  textarea.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement !== textarea && document.activeElement !== okBtn && document.activeElement !== deleteBtn) {
        commitText();
      }
    }, 140);
  });

  // ensure focus
  textarea.focus();

  // close when clicking outside
  setTimeout(() => {
    const outsideHandler = (ev) => {
      if (!controls.contains(ev.target)) {
        controls.remove();
        if (!isExisting) selectedTextAction = null;
        document.removeEventListener('click', outsideHandler);
      }
    };
    document.addEventListener('click', outsideHandler);
  }, 120);
}

// Utility to open editor for a new text action area (used on creation)
// NOTE: we DO NOT push temporary action; action is only created when user commits
function openEditorForNewText(x, y, width, height, pageObj, canvasRect) {
  const tempAction = {
    type: 'text',
    text: '',
    x: x,
    y: y + 16,
    color: strokeColor,
    size: 16,
    bold: false,
    italic: false,
    width: width,
    height: height,
  };
  showTextEditorControls(tempAction, pageObj, canvasRect, false);
}

// ---------- annotation engine ----------
function initAnnotCanvas(canvas, pageObj) {
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let startX = 0, startY = 0;
  let currentPath = null;

  function pushAction(action) {
    pageObj.actions.push(action);
    pageObj.redo = [];
    console.log('Action pushed:', action, 'Total actions:', pageObj.actions.length);
  }

  function redrawAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const a of pageObj.actions) {
      drawAction(ctx, a);
    }
  }

  // Click to edit text
  canvas.addEventListener('click', (e) => {
    if (currentTool !== 'pointer') return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicked on a text action
    for (const action of pageObj.actions) {
      if (action.type === 'text') {
        const w = action.width || ctx.measureText(action.text).width;
        const h = action.height || (action.size || 16) + 6;
        if (x >= action.x && x <= action.x + w &&
            y >= action.y - h && y <= action.y + 6) {
          selectedTextAction = action;
          showTextEditorControls(action, pageObj, rect, true);
          break;
        }
      }
    }
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (currentTool === 'pointer') return; // No drawing in pointer mode

    const rect = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    drawing = true;
    startX = x;
    startY = y;

    if (currentTool === 'pen') {
      currentPath = { type: 'pen', color: strokeColor, width: strokeWidth, points: [{ x, y }] };
    } else if (currentTool === 'rect' || currentTool === 'highlight') {
      currentPath = {
        type: currentTool,
        color: currentTool === 'highlight' ? highlightColor : strokeColor,
        width: strokeWidth,
        x1: x, y1: y, x2: x, y2: y,
      };
    } else if (currentTool === 'arrow') {
      currentPath = {
        type: 'arrow',
        color: strokeColor,
        width: strokeWidth,
        x1: x, y1: y, x2: x, y2: y,
      };
    } else if (currentTool === 'text') {
      currentPath = {
        type: 'text-box-preview',
        x1: x, y1: y, x2: x, y2: y,
      };
    } else {
      drawing = false;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drawing || !currentPath || currentTool === 'pointer') return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);

    if (currentPath.type === 'pen') {
      currentPath.points.push({ x, y });
    } else if (currentPath.type === 'text-box-preview') {
      currentPath.x2 = x;
      currentPath.y2 = y;
    } else {
      currentPath.x2 = x;
      currentPath.y2 = y;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const a of pageObj.actions) drawAction(ctx, a);

    // Draw preview for text box (single dashed rounded preview)
    if (currentPath.type === 'text-box-preview') {
      ctx.save();
      ctx.strokeStyle = 'rgba(11,95,255,0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      const w = currentPath.x2 - currentPath.x1;
      const h = currentPath.y2 - currentPath.y1;
      const r = 8;
      const rx = currentPath.x1;
      const ry = currentPath.y1;
      ctx.beginPath();
      ctx.moveTo(rx + r, ry);
      ctx.lineTo(rx + w - r, ry);
      ctx.quadraticCurveTo(rx + w, ry, rx + w, ry + r);
      ctx.lineTo(rx + w, ry + h - r);
      ctx.quadraticCurveTo(rx + w, ry + h, rx + w - r, ry + h);
      ctx.lineTo(rx + r, ry + h);
      ctx.quadraticCurveTo(rx, ry + h, rx, ry + h - r);
      ctx.lineTo(rx, ry + r);
      ctx.quadraticCurveTo(rx, ry, rx + r, ry);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    } else {
      drawAction(ctx, currentPath);
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!drawing) return;
    drawing = false;

    if (currentPath && currentPath.type === 'text-box-preview') {
      const rect = canvas.getBoundingClientRect();
      const x1 = Math.min(currentPath.x1, currentPath.x2);
      const y1 = Math.min(currentPath.y1, currentPath.y2);
      const x2 = Math.max(currentPath.x1, currentPath.x2);
      const y2 = Math.max(currentPath.y1, currentPath.y2);
      const width = x2 - x1;
      const height = y2 - y1;

      if (width > 20 && height > 20) {
        currentPath = null;
        redrawAll();

        // open editor but DO NOT push temporary action
        openEditorForNewText(x1, y1, Math.max(width, 120), Math.max(height, 28), pageObj, rect);
      } else {
        currentPath = null;
        redrawAll();
      }
    } else if (currentPath) {
      if (currentPath.type === 'rect' || currentPath.type === 'highlight') {
        const nx1 = Math.min(currentPath.x1, currentPath.x2);
        const ny1 = Math.min(currentPath.y1, currentPath.y2);
        const nx2 = Math.max(currentPath.x1, currentPath.x2);
        const ny2 = Math.max(currentPath.y1, currentPath.y2);
        currentPath.x1 = nx1; currentPath.y1 = ny1; currentPath.x2 = nx2; currentPath.y2 = ny2;
      }
      // arrow: keep drag direction as-is
      pushAction(currentPath);
      currentPath = null;
      redrawAll();
    }
  });

  canvas._redrawAll = redrawAll;
  canvas._pushAction = pushAction;
}
function drawAction(ctx, a) {
  if (!a) return;
  ctx.save();
  if (a.type === 'pen') {
    ctx.beginPath();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = a.color || '#ff0000';
    ctx.lineWidth = a.width || 3;
    ctx.globalAlpha = 1.0;
    ctx.setLineDash([]);
    const pts = a.points;
    if (pts && pts.length) {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        if (i < pts.length - 1) {
          const xMid = (pts[i].x + pts[i + 1].x) / 2;
          const yMid = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, xMid, yMid);
        } else {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
      }
      ctx.stroke();
    }
  } else if (a.type === 'rect') {
    ctx.beginPath();
    ctx.lineWidth = a.width || 3;
    ctx.strokeStyle = a.color || '#ff0000';
    ctx.globalAlpha = 1.0;
    ctx.setLineDash([]);
    const w = a.x2 - a.x1;
    const h = a.y2 - a.y1;
    ctx.strokeRect(a.x1, a.y1, w, h);
  } else if (a.type === 'highlight') {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = a.color || 'rgba(255,235,59,0.45)';
    const w = a.x2 - a.x1;
    const h = a.y2 - a.y1;
    ctx.fillRect(a.x1, a.y1, w, h);
  } else if (a.type === 'arrow') {
    const x1 = a.x1, y1 = a.y1, x2 = a.x2, y2 = a.y2;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.strokeStyle = a.color || '#ff0000';
    ctx.lineWidth = a.width || 3;
    ctx.globalAlpha = 1.0;
    ctx.setLineDash([]);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const headlen = Math.max(10, Math.min(25, a.width * 6));
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headlen * Math.cos(ang - Math.PI / 6), y2 - headlen * Math.sin(ang - Math.PI / 6));
    ctx.lineTo(x2 - headlen * Math.cos(ang + Math.PI / 6), y2 - headlen * Math.sin(ang + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = a.color || '#ff0000';
    ctx.fill();
  } else if (a.type === 'text') {
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = a.color || '#000';
    ctx.font = `${a.size || 16}px sans-serif`;

    // Draw optional bounding box (rounded) ONLY when this action is currently selected
    if (a.width && a.height && a === selectedTextAction) {
      ctx.save();
      ctx.strokeStyle = '#0b5fff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      const rx = a.x - 4;
      const ry = (a.y - (a.size || 16)) - 4;
      const rw = a.width + 8;
      const rh = a.height + 8;
      const r = 6;
      ctx.beginPath();
      ctx.moveTo(rx + r, ry);
      ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, r);
      ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, r);
      ctx.arcTo(rx, ry + rh, rx, ry, r);
      ctx.arcTo(rx, ry, rx + rw, ry, r);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    if (a.width) {
      const words = String(a.text).split(/\s+/);
      let line = '';
      const lineHeight = (a.size || 16) * 1.18;
      let cursorY = a.y;
      for (let n = 0; n < words.length; n++) {
        const testLine = line ? (line + ' ' + words[n]) : words[n];
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > a.width && line) {
          ctx.fillText(line, a.x, cursorY);
          line = words[n];
          cursorY += lineHeight;
        } else {
          line = testLine;
        }
      }
      if (line) {
        ctx.fillText(line, a.x, cursorY);
      }
    } else {
      ctx.fillText(a.text, a.x, a.y);
    }
  }
  ctx.restore();
}
toolButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const t = btn.getAttribute('data-tool');
    if (t) {
      currentTool = t;
      updateCursorForTool();
    }
    toolButtons.forEach((b) => {
      b.classList.remove('active');
    });
    if (t) {
      btn.classList.add('active');
    }
  });
});
undoBtn && undoBtn.addEventListener('click', () => {
  const page = editingPages[currentPageIndex];
  if (!page) return;
  if (page.actions.length === 0) return;
  const a = page.actions.pop();
  page.redo.push(a);
  page.annotCanvas._redrawAll();
  console.log('Undo - Actions:', page.actions.length, 'Redo:', page.redo.length);
});
redoBtn && redoBtn.addEventListener('click', () => {
  const page = editingPages[currentPageIndex];
  if (!page) return;
  if (page.redo.length === 0) return;
  const a = page.redo.pop();
  page.actions.push(a);
  page.annotCanvas._redrawAll();
  console.log('Redo - Actions:', page.actions.length, 'Redo:', page.redo.length);
});
closeEditorBtn && closeEditorBtn.addEventListener('click', () => {
  editorOverlay.classList.add('hidden');
  pageContainer.innerHTML = '';
  editingPages = [];
});

// Keyboard handler for deleting selected text action
document.addEventListener('keydown', (e) => {
  if (!selectedTextAction) return;
  const fe = document.activeElement;
  if (fe && (fe.tagName === 'INPUT' || fe.tagName === 'TEXTAREA' || fe.isContentEditable)) return;

  if (e.key === 'Delete' || e.key === 'Backspace') {
    for (const p of editingPages) {
      const idx = p.actions.indexOf(selectedTextAction);
      if (idx > -1) {
        p.actions.splice(idx, 1);
        p.redo = [];
        p.annotCanvas._redrawAll();
        selectedTextAction = null;
        e.preventDefault();
        break;
      }
    }
  }
});

// ---------- Flatten and export edited PDF ----------
async function exportEditedPdfAndSave() {
  try {
    statusEl.innerText = LANG[currentLang].status_exporting;
    const outPdf = await PDFLib.PDFDocument.create();

    for (let i = 0; i < editingPages.length; i++) {
      const pageObj = editingPages[i];
      const base = pageObj.baseCanvas;
      const offscreen = document.createElement('canvas');
      offscreen.width = base.width;
      offscreen.height = base.height;
      const offCtx = offscreen.getContext('2d', { alpha: false });

      offCtx.fillStyle = '#ffffff';
      offCtx.fillRect(0, 0, offscreen.width, offscreen.height);

      offCtx.drawImage(base, 0, 0);

      for (const action of pageObj.actions) {
        drawAction(offCtx, action);
      }

      const dataUrl = offscreen.toDataURL('image/png');
      const binary = atob(dataUrl.split(',')[1]);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let j = 0; j < len; j++) bytes[j] = binary.charCodeAt(j);

      const img = await outPdf.embedPng(bytes);
      const { width, height } = img.scale(1);
      outPdf.addPage([width, height]).drawImage(img, { x: 0, y: 0, width, height });
    }

    const finalBytes = await outPdf.save();
    const saveRes = await window.electronAPI.saveBytes('edited.pdf', finalBytes);
    if (saveRes.success) {
      statusEl.innerText = LANG[currentLang].saved + ' ' + saveRes.path;
      editorOverlay.classList.add('hidden');
    } else {
      statusEl.innerText = 'Save canceled';
    }
  } catch (err) {
    console.error('Export error', err);
    statusEl.innerText = 'Export error: ' + (err.message || String(err));
  } finally {
    setTimeout(() => {
      statusEl.innerText = LANG[currentLang].status_idle;
    }, 2000);
  }
}
doneBtn && doneBtn.addEventListener('click', exportEditedPdfAndSave);
// initial render
renderFiles();
updateSummary();
