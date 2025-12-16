// renderer.js — Complete with Lazy Loading Optimizations and Performance Improvements
// ============ FEATURE SYSTEM INITIALIZATION ============
// Add this at the very beginning of renderer.js, before any other code

import featureManager from "./core/feature-manager.js";
import eventBus from "./core/event-bus.js";
import * as utils from "./core/utils.js";

// Make utilities globally available
window.pdfUtils = utils;
let currentLang = "ja";
// Language state (keep your existing currentLang variable)

// Initialize feature system after DOM loads
document.addEventListener("DOMContentLoaded", () => {
  // Get containers
  const mainApp = document.getElementById("mainApp");
  const featureContainer = document.getElementById("featureContainer");

  // Initialize feature manager
  featureManager.init(mainApp, featureContainer);

  console.log("âœ… Feature system initialized");

  // Register features
  registerFeatures();

  // âœ… Setup feature buttons with delay to ensure DOM is ready
  setTimeout(() => {
    setupFeatureButtons();
  }, 100);
});

/**
 * Register all available features
 */
function registerFeatures() {
  // Register PDF Split feature
  featureManager.register("pdf-split", {
    title: "PDF分割",
    titleEn: "PDF Split",
    description: "Split PDF into multiple files",
    version: "1.0.0",
    path: "features/pdf-split", // Remove leading "./"
  });

  // Register PDF Organizer feature
  featureManager.register("pdf-organizer", {
    title: "PDFページ整理",
    titleEn: "PDF Organizer",
    description: "Rearrange PDF pages with drag and drop",
    version: "1.0.0",
    path: "features/pdf-organizer",
  });

  // Future features can be registered here
  // featureManager.register('page-organizer', { ... });
  // featureManager.register('pdf-compress', { ... });

  console.log("✅ Features registered:", featureManager.list());
}

/**
 * Setup event listeners for feature buttons
 */

function setupFeatureButtons() {
  const pdfSplitBtn = document.getElementById("pdfSplitBtn");

  if (pdfSplitBtn) {
    pdfSplitBtn.addEventListener("click", async () => {
      try {
        await featureManager.activate("pdf-split", {
          lang: currentLang,
        });
      } catch (error) {
        console.error("Failed to open PDF Split:", error);
        utils.showToast("Failed to open PDF Split feature", "error");
      }
    });
  }

  const pdfOrganizerBtn = document.getElementById("pdfOrganizerBtn");

  if (pdfOrganizerBtn) {
    pdfOrganizerBtn.addEventListener("click", async () => {
      try {
        await featureManager.activate("pdf-organizer", {
          lang: currentLang,
        });
      } catch (error) {
        console.error("Failed to open PDF Organizer:", error);
        utils.showToast("Failed to open PDF Organizer feature", "error");
      }
    });
  }

  // Single function to update all feature button texts
  const updateFeatureButtonTexts = () => {
    const splitBtnText = document.getElementById("splitBtnText");
    if (splitBtnText) {
      splitBtnText.textContent = currentLang === "ja" ? "PDF分割" : "PDF Split";
    }

    const organizerBtnText = document.getElementById("organizerBtnText");
    if (organizerBtnText) {
      organizerBtnText.textContent =
        currentLang === "ja" ? "ページ整理" : "Page Organizer";
    }
  };

  // Listen for language changes and update button texts
  eventBus.on("language-changed", (lang) => {
    currentLang = lang;
    updateFeatureButtonTexts();
  });

  // Initial update
  updateFeatureButtonTexts();
}
// Make feature manager globally accessible
window.featureManager = featureManager;
window.eventBus = eventBus;

// ============ END FEATURE SYSTEM INITIALIZATION ============

// Your existing renderer.js code continues below...
const { pdfjsDistPath, pdfjsWorkerPath, pdfLibPath } = window.libs || {};

// Load pdf.js
const pdfjsLib = await import(`file://${pdfjsDistPath}`);
pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${pdfjsWorkerPath}`;

// CMap configuration for proper font rendering (especially CJK fonts)
const CMAP_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.394/cmaps/";
const CMAP_PACKED = true;

// Suppress verbose warnings
pdfjsLib.GlobalWorkerOptions.verbosity = 0;
// Lazy load pdf-lib only when needed
let PDFLib = null;
let pdfLibLoading = false;
let pdfLibPromise = null;

async function ensurePdfLib() {
  if (PDFLib) return PDFLib;
  if (pdfLibLoading) return pdfLibPromise;

  pdfLibLoading = true;
  pdfLibPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `file://${pdfLibPath}`;
    script.onload = () => {
      PDFLib = window.PDFLib;
      pdfLibLoading = false;
      resolve(PDFLib);
    };
    script.onerror = (e) => {
      pdfLibLoading = false;
      reject(new Error("Failed to load pdf-lib: " + e));
    };
    document.head.appendChild(script);
  });
  return pdfLibPromise;
}

// ---------------- State & Config ----------------
let files = [];

let editorPages = [];
let currentPageIndex = 0;
let zoomLevel = 1.0;
let panX = 0;
let panY = 0;
let isPanning = false;
let lastMouseX = 0;
let lastMouseY = 0;

// Annotation state
let currentTool = "pointer";
let currentColor = "#ff0000";
let tempAnnotation = null;
let currentPath = [];
let textInputActive = false;
let textInputElement = null;

// Lazy loading state
let loadedPdfDocument = null;
let pageRenderQueue = [];
let isProcessingQueue = false;

const MAX_IMAGE_WIDTH = 1600;
const JPEG_QUALITY = 0.95;
const RENDER_SCALE = 3.0;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5.0;
const ZOOM_STEP = 0.25;
const PAGES_PER_BATCH = 3;

const LANG = {
  ja: {
    add: "ファイル追加",
    clear: "全削除",
    merge: "結合する",
    mergeEdit: "結合して編集",
    drag: "ここにドラッグ＆ドロップ または「ファイル追加」",
    status_idle: "すべてPC内で処理(アップロードなし)",
    status_loading: "読み込み中…",
    status_merging: "結合中…",
    status_exporting: "エクスポート中…",
    saved: "保存完了:",
    files: (n) => `${n} 個のファイル`,
    footer: "ドラッグで並び替え、×で削除できます。",
    langBtn: "🇯🇵 日本語",
    remove: "削除",
    backToMerger: "結合ページに戻る",
    savePdf: "PDFを保存",
    pageLabel: "ページ",
    zoomIn: "ズームイン",
    zoomOut: "ズームアウト",
    resetZoom: "リセット",
    pointer: "ポインター",
    rectangle: "四角形",
    highlight: "ハイライト",
    line: "線",
    pen: "ペン",
    text: "テキスト",
    undo: "元に戻す",
    redo: "やり直し",
    loadingPages: "ページを読み込み中...",
    loadingFiles: "ファイルを読み込み中...",
  },
  en: {
    add: "Add files",
    clear: "Clear All",
    merge: "Merge files",
    mergeEdit: "Merge & Edit",
    drag: "Drag files here or click Add files",
    status_idle: "All files stay on this PC — no upload.",
    status_loading: "Processing files...",
    status_merging: "Merging...",
    status_exporting: "Exporting...",
    saved: "Saved:",
    files: (n) => `${n} files`,
    footer: "Drag to reorder, click × to remove.",
    langBtn: "🇺🇸 English",
    remove: "Remove",
    backToMerger: "Back to Merger",
    savePdf: "Save PDF",
    pageLabel: "Page",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
    resetZoom: "Reset",
    pointer: "Pointer",
    rectangle: "Rectangle",
    highlight: "Highlight",
    line: "Line",
    pen: "Pen",
    text: "Text",
    undo: "Undo",
    redo: "Redo",
    loadingPages: "Loading pages...",
    loadingFiles: "Loading files...",
  },
};

// ---------------- DOM Elements ----------------
const fileElem = document.getElementById("fileElem");
const filesList = document.getElementById("filesList");
const dropArea = document.getElementById("drop-area");
const mergeBtn = document.getElementById("mergeBtn");
const mergeEditBtn = document.getElementById("mergeEditBtn");
const statusEl = document.getElementById("status");
const clearBtn = document.getElementById("clearBtn");
const countEl = document.getElementById("count");
const totalsizeEl = document.getElementById("totalsize");
const dropText = document.getElementById("dropText");
const addBtn = document.getElementById("addBtn");
const titleEl = document.getElementById("title");
const subtitleEl = document.getElementById("subtitle");
const footerText = document.getElementById("footerText");
const langToggle = document.getElementById("langToggle");

// Editor elements
const mergerPage = document.getElementById("mainApp");
const editorPage = document.getElementById("editorPage");
const thumbnailContainer = document.getElementById("thumbnailContainer");
const mainCanvas = document.getElementById("mainCanvas");
const annotCanvas = document.getElementById("annotCanvas");
const backToMergerBtn = document.getElementById("backToMerger");
const savePdfBtn = document.getElementById("savePdf");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const resetZoomBtn = document.getElementById("resetZoomBtn");
const zoomDisplay = document.getElementById("zoomDisplay");
const canvasContainer = document.querySelector(".canvas-container");

// Tool buttons
const toolButtons = document.querySelectorAll("[data-tool]");
const colorButtons = document.querySelectorAll("[data-color]");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");

// ---------------- Utilities ----------------
function applyLanguage() {
  const L = LANG[currentLang];
  addBtn && (addBtn.innerText = L.add);
  clearBtn && (clearBtn.innerText = L.clear);
  mergeBtn && (mergeBtn.innerText = L.merge);
  mergeEditBtn && (mergeEditBtn.innerText = L.mergeEdit);
  dropText && (dropText.innerText = L.drag);
  statusEl && (statusEl.innerText = L.status_idle);
  footerText && (footerText.innerText = L.footer);
  langToggle && (langToggle.innerText = L.langBtn);
  titleEl &&
    (titleEl.innerText = currentLang === "ja" ? "PDF結合ツール" : "PDF Merger");
  subtitleEl &&
    (subtitleEl.innerText =
      currentLang === "ja" ? "ローカルで高速結合" : "Local & Fast");
  backToMergerBtn && (backToMergerBtn.innerText = L.backToMerger);
  savePdfBtn && (savePdfBtn.innerText = L.savePdf);
  zoomInBtn && zoomInBtn.setAttribute("title", L.zoomIn);
  zoomOutBtn && zoomOutBtn.setAttribute("title", L.zoomOut);
  resetZoomBtn && resetZoomBtn.setAttribute("title", L.resetZoom);
  updateSummary();
}

function humanSize(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return Math.round(bytes / (1024 * 1024)) + " MB";
}

function updateSummary() {
  const L = LANG[currentLang];
  if (countEl) countEl.innerText = L.files(files.length);
  if (totalsizeEl) {
    const total = files.reduce((s, f) => s + (f.size || 0), 0);
    totalsizeEl.innerText = humanSize(total);
  }
}
langToggle &&
  langToggle.addEventListener("click", () => {
    currentLang = currentLang === "ja" ? "en" : "ja";
    applyLanguage();
    // âœ… Emit language-changed event to notify features
    if (window.eventBus) {
      window.eventBus.emit("language-changed", currentLang);
    }
  });
// ---------------- File Handling ----------------
function renderFilesListUI() {
  if (!filesList) return;
  filesList.innerHTML = "";
  files.forEach((f, idx) => {
    const card = document.createElement("div");
    card.className = "file-card";
    card.draggable = true;

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    if (f.thumbUrl) {
      const img = document.createElement("img");
      img.src = f.thumbUrl;
      thumb.appendChild(img);
    } else {
      // Show PDF icon for PDFs without thumbnail yet
      thumb.innerText = "📄";
      thumb.style.fontSize = "22px";
      thumb.style.color = "#6b7280";
    }

    // ✅ Add data attribute for lazy thumbnail updates
    card.setAttribute("data-file-id", f.id);

    const meta = document.createElement("div");
    meta.className = "file-meta";
    const nameEl = document.createElement("div");
    nameEl.className = "fname";
    nameEl.innerText = f.name;
    const infoEl = document.createElement("div");
    infoEl.className = "fmeta";
    infoEl.innerText = `${f.type} • ${humanSize(f.size)}`;
    meta.appendChild(nameEl);
    meta.appendChild(infoEl);

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.innerText = "×";
    removeBtn.title = LANG[currentLang].remove;
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      try {
        URL.revokeObjectURL(f.thumbUrl || "");
      } catch (err) {}
      files.splice(idx, 1);
      renderFilesListUI();
      updateSummary();
    };

    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", String(idx));
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("dragover", (e) => e.preventDefault());
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      const src = Number(e.dataTransfer.getData("text/plain"));
      const dest = idx;
      if (!isNaN(src) && src !== dest) {
        const moved = files.splice(src, 1)[0];
        files.splice(dest, 0, moved);
        renderFilesListUI();
      }
    });

    card.appendChild(thumb);
    card.appendChild(meta);
    card.appendChild(removeBtn);
    filesList.appendChild(card);
  });
}

async function resizeImageFileToJpegArrayBuffer(
  file,
  maxWidth = MAX_IMAGE_WIDTH,
  quality = JPEG_QUALITY
) {
  try {
    const imageBitmap = await createImageBitmap(file);
    const ratio = Math.min(1, maxWidth / imageBitmap.width);
    const tw = Math.round(imageBitmap.width * ratio);
    const th = Math.round(imageBitmap.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imageBitmap, 0, 0, tw, th);
    const blob = await new Promise((res) =>
      canvas.toBlob(res, "image/jpeg", quality)
    );
    return await blob.arrayBuffer();
  } catch (e) {
    return await file.arrayBuffer();
  }
}

async function handleFileList(fileList) {
  const inputFiles = Array.from(fileList || []);
  if (inputFiles.length === 0) return;

  const loadingOverlay = document.getElementById("loadingOverlay");
  const loadingProgress = document.getElementById("loadingProgress");
  const loadingCount = document.getElementById("loadingCount");

  // Update status immediately
  statusEl && (statusEl.innerText = LANG[currentLang].status_loading);

  if (loadingProgress) {
    loadingProgress.innerText =
      currentLang === "ja" ? "ファイルを読み込み中..." : "Loading files...";
  }

  const totalFiles = inputFiles.length;
  let processedFiles = 0;

  // Show loader with animation
  if (loadingOverlay) {
    loadingOverlay.style.display = "flex";
    await new Promise((resolve) => setTimeout(resolve, 50)); // Allow paint
  }

  // Process ALL files in parallel (no batching)
  const results = await Promise.allSettled(
    inputFiles.map(async (file) => {
      // Validate file type
      if (!/\.(pdf|png|jpe?g|jpg)$/i.test(file.name)) {
        console.log(`Skipping invalid file type: ${file.name}`);
        return null;
      }

      const lower = file.name.toLowerCase();

      try {
        if (/\.(png|jpe?g|jpg)$/i.test(lower)) {
          // Image files - use original file as thumbnail, resize for buffer
          const ab = await resizeImageFileToJpegArrayBuffer(file);
          if (!ab || ab.byteLength === 0) {
            console.error(`❌ Empty ArrayBuffer for ${file.name}`);
            processedFiles++;
            if (loadingCount) {
              loadingCount.innerText = `${processedFiles} / ${totalFiles}`;
            }
            return null;
          }
          console.log(
            `📄 PDF loaded: ${file.name}, size: ${ab.byteLength} bytes`
          );
          processedFiles++;
          if (loadingCount) {
            loadingCount.innerText = `${processedFiles} / ${totalFiles}`;
          }

          return {
            id: Math.random().toString(36).slice(2, 9),
            name: file.name,
            type: "image/jpeg",
            size: ab.byteLength,
            buffer: ab,
            thumbUrl: URL.createObjectURL(file), // ✅ Use original file blob
          };
        } else if (/\.(pdf)$/i.test(lower)) {
          // PDF files - skip thumbnail generation during upload
          const ab = await file.arrayBuffer();

          processedFiles++;
          if (loadingCount) {
            loadingCount.innerText = `${processedFiles} / ${totalFiles}`;
          }

          return {
            id: Math.random().toString(36).slice(2, 9),
            name: file.name,
            type: "application/pdf",
            size: ab.byteLength,
            buffer: ab, // ✅ No cloning needed - store once
            thumbUrl: null, // ✅ Generate lazily when card is visible
            thumbnailGenerated: false,
          };
        }
      } catch (err) {
        console.error(`❌ Error processing file ${file.name}:`, err);
        processedFiles++;
        if (loadingCount) {
          loadingCount.innerText = `${processedFiles} / ${totalFiles}`;
        }
        return null;
      }

      return null;
    })
  );

  // Collect successful results
  const newFiles = results
    .filter((r) => r.status === "fulfilled" && r.value !== null)
    .map((r) => r.value);

  files.push(...newFiles);

  // Update UI once
  renderFilesListUI();
  updateSummary();

  // Allow one frame for UI update before hiding loader
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => setTimeout(resolve, 150)); // Smooth exit

  // Hide loading overlay
  if (loadingOverlay) {
    loadingOverlay.style.display = "none";
  }

  statusEl && (statusEl.innerText = LANG[currentLang].status_idle);

  // ✅ Generate PDF thumbnails lazily in background
  lazyGeneratePdfThumbnails(
    newFiles.filter((f) => f.type === "application/pdf")
  );
}

// ✅ NEW: Lazy thumbnail generation for PDFs
async function lazyGeneratePdfThumbnails(pdfFiles) {
  for (const fileObj of pdfFiles) {
    if (fileObj.thumbnailGenerated || fileObj.thumbUrl) continue;

    try {
      // Clone buffer for PDF.js (won't affect original)
      const bufferCopy = fileObj.buffer.slice(0);

      const loadingTask = pdfjsLib.getDocument({
        data: bufferCopy,
        verbosity: 0,
        cMapUrl: CMAP_URL,
        cMapPacked: CMAP_PACKED,
      });
      const pdf = await loadingTask.promise;

      if (pdf.numPages > 0) {
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.3 });

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext("2d", { alpha: false });

        await page.render({
          canvasContext: ctx,
          viewport,
          intent: "display",
        }).promise;

        fileObj.thumbUrl = canvas.toDataURL("image/jpeg", 0.8);
        fileObj.thumbnailGenerated = true;

        // Update UI for this specific card
        const card = document.querySelector(`[data-file-id="${fileObj.id}"]`);
        if (card) {
          const thumb = card.querySelector(".thumb");
          if (thumb && fileObj.thumbUrl) {
            thumb.innerHTML = `<img src="${fileObj.thumbUrl}" alt="${fileObj.name}">`;
          }
        }

        // Cleanup
        canvas.width = 0;
        canvas.height = 0;
      }
    } catch (err) {
      console.warn(`⚠️ Failed to generate thumbnail for ${fileObj.name}:`, err);
      fileObj.thumbnailGenerated = true; // Mark as attempted
    }

    // Allow UI to breathe between thumbnails
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
fileElem &&
  fileElem.addEventListener("change", async (e) => {
    await handleFileList(e.target.files);
    fileElem.value = null;
  });

["dragenter", "dragover"].forEach(
  (evt) =>
    dropArea &&
    dropArea.addEventListener(evt, (e) => {
      e.preventDefault();
      dropArea.classList.add("drag-over");
    })
);
["dragleave", "drop"].forEach(
  (evt) =>
    dropArea &&
    dropArea.addEventListener(evt, (e) => {
      e.preventDefault();
      dropArea.classList.remove("drag-over");
    })
);
dropArea &&
  dropArea.addEventListener("drop", async (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) {
      await handleFileList(e.dataTransfer.files);
    }
  });
clearBtn &&
  clearBtn.addEventListener("click", () => {
    files.forEach((f) => {
      try {
        if (f.thumbUrl) URL.revokeObjectURL(f.thumbUrl);
      } catch (err) {}
    });
    files = [];
    renderFilesListUI();
    updateSummary();
  });

// ---------------- PDF/Image Conversion ----------------
async function imageBufferToPdfBytes(imageBuffer, mimeType = "image/jpeg") {
  await ensurePdfLib();
  if (!PDFLib) throw new Error("pdf-lib not loaded");

  const blob = new Blob([imageBuffer], { type: mimeType });
  const bitmap = await createImageBitmap(blob);
  const imgW = bitmap.width;
  const imgH = bitmap.height;
  const pdfDoc = await PDFLib.PDFDocument.create();
  let embedded;
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
    embedded = await pdfDoc.embedJpg(new Uint8Array(imageBuffer));
  } else {
    embedded = await pdfDoc.embedPng(new Uint8Array(imageBuffer));
  }
  const page = pdfDoc.addPage([imgW, imgH]);
  page.drawImage(embedded, { x: 0, y: 0, width: imgW, height: imgH });
  return await pdfDoc.save();
}

async function validatePdfBytes(bytesLike) {
  // Quick header validation
  const u8 =
    bytesLike instanceof Uint8Array ? bytesLike : new Uint8Array(bytesLike);
  if (u8.length < 4) return false;

  // Check PDF header %PDF
  if (u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) {
    return true;
  }

  return false;
}

async function tryRecoverPdfWithPdfJs(uint8arr) {
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: uint8arr,
      verbosity: 0,
      cMapUrl: CMAP_URL,
      cMapPacked: CMAP_PACKED,
      useSystemFonts: false,
      disableFontFace: false,
    });
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;
    if (!pageCount || pageCount < 1) return null;

    await ensurePdfLib();
    if (!PDFLib) return null;

    const outPdf = await PDFLib.PDFDocument.create();
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL("image/png");
      const bin = atob(dataUrl.split(",")[1]);
      const arr = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
      const img = await outPdf.embedPng(arr);
      const { width, height } = img.scale(1);
      const pg = outPdf.addPage([width, height]);
      pg.drawImage(img, { x: 0, y: 0, width, height });
    }
    const final = await outPdf.save();
    return final instanceof Uint8Array ? final : new Uint8Array(final);
  } catch (e) {
    return null;
  }
}

// ✅ OPTIMIZED: Skip expensive validation - trust upload validation
async function normalizeFilesToPdfUploadsWithValidation(
  fileList,
  progressCallback
) {
  const out = [];
  const skipped = [];

  console.log(`📄 Starting normalization for ${fileList.length} files`);

  // ✅ FIX: Process in smaller batches to ensure data integrity and smooth progress
  const BATCH_SIZE = 10;
  let processedCount = 0;

  for (let i = 0; i < fileList.length; i += BATCH_SIZE) {
    const batch = fileList.slice(i, Math.min(i + BATCH_SIZE, fileList.length));

    const results = await Promise.allSettled(
      batch.map(async (f) => {
        try {
          if (!f || !f.type) {
            console.warn(`⚠️ Invalid file object:`, f);
            return {
              skipped: { name: f?.name || "unknown", reason: "no-type" },
            };
          }

          // ✅ CRITICAL: Ensure buffer exists and has data
          if (!f.buffer || f.buffer.byteLength === 0) {
            console.error(`❌ Empty buffer for ${f.name}`);
            return { skipped: { name: f.name, reason: "empty-buffer" } };
          }

          // Convert buffer to Uint8Array - ensure we're creating a NEW copy
          let bytes;
          if (f.buffer instanceof ArrayBuffer) {
            bytes = new Uint8Array(f.buffer);
          } else if (f.buffer instanceof Uint8Array) {
            bytes = new Uint8Array(f.buffer); // Create new copy
          } else {
            console.error(
              `❌ Invalid buffer type for ${f.name}:`,
              typeof f.buffer
            );
            return { skipped: { name: f.name, reason: "invalid-buffer-type" } };
          }

          // ✅ Verify buffer has content
          if (bytes.byteLength === 0) {
            console.error(
              `❌ Zero-length buffer after conversion for ${f.name}`
            );
            return { skipped: { name: f.name, reason: "zero-length-buffer" } };
          }

          console.log(`✅ Normalized ${f.name}: ${bytes.byteLength} bytes`);

          return {
            success: {
              name: f.name,
              type: f.type,
              bytes: bytes,
            },
          };
        } catch (error) {
          console.error(
            `❌ Exception processing ${f?.name || "unknown"}:`,
            error
          );
          return {
            skipped: {
              name: f?.name || "unknown",
              reason: "exception",
              error: error.message,
            },
          };
        }
      })
    );

    // Collect results from this batch
    for (const result of results) {
      if (result.status === "fulfilled") {
        if (result.value?.success) {
          out.push(result.value.success);
        } else if (result.value?.skipped) {
          skipped.push(result.value.skipped);
        }
      } else {
        console.error(`❌ Promise rejected:`, result.reason);
        skipped.push({
          name: "unknown",
          reason: "promise-rejection",
          error: result.reason?.message,
        });
      }
    }

    // Update progress after each batch
    processedCount += batch.length;
    if (progressCallback) {
      const progress = Math.round((processedCount / fileList.length) * 100);
      progressCallback(
        progress,
        `Processed ${processedCount}/${fileList.length} files...`
      );
    }

    // Allow UI to breathe
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  console.log(
    `📊 Normalization complete: ${out.length} success, ${skipped.length} skipped`
  );

  // ✅ Debug output to verify data
  if (out.length > 0) {
    console.log("Sample normalized file:", {
      name: out[0].name,
      type: out[0].type,
      bytesLength: out[0].bytes?.byteLength || 0,
      firstBytes: out[0].bytes?.slice(0, 4),
    });
  }

  return { normalized: out, skipped };
}

// ✅ NEW: Progress overlay controls
function showMergeProgress(initialText = "Preparing files...") {
  const overlay = document.getElementById("mergeProgressOverlay");
  const text = document.getElementById("mergeProgressText");
  const detail = document.getElementById("mergeProgressDetail");
  const fill = document.getElementById("mergeProgressFill");
  const percent = document.getElementById("mergeProgressPercent");

  if (overlay) {
    text.innerText =
      currentLang === "ja" ? "ファイルを結合中..." : "Merging files...";
    detail.innerText = initialText;
    fill.style.width = "0%";
    percent.innerText = "0%";
    overlay.style.display = "flex";
  }
}

function updateMergeProgress(percentage, detailText = "") {
  const fill = document.getElementById("mergeProgressFill");
  const percent = document.getElementById("mergeProgressPercent");
  const detail = document.getElementById("mergeProgressDetail");

  if (fill) fill.style.width = `${percentage}%`;
  if (percent) percent.innerText = `${percentage}%`;
  if (detail && detailText) detail.innerText = detailText;
}

function hideMergeProgress() {
  const overlay = document.getElementById("mergeProgressOverlay");
  if (overlay) {
    // Smooth fade out
    overlay.style.animation = "fadeOut 0.3s ease-out";
    setTimeout(() => {
      overlay.style.display = "none";
      overlay.style.animation = "";
    }, 300);
  }
}

// Listen for merge progress updates
if (window.electronAPI && window.electronAPI.onMergeProgress) {
  window.electronAPI.onMergeProgress((progress) => {
    if (statusEl) {
      statusEl.innerText = `${LANG[currentLang].status_merging} ${progress}%`;
    }
  });
}

// ---------------- Merge Only ----------------
// ---------------- Merge Only ----------------
mergeBtn &&
  mergeBtn.addEventListener("click", async () => {
    if (files.length < 1) return;

    mergeBtn.disabled = true;
    showMergeProgress("Preparing files...");

    const perfLog = {
      start: Date.now(),
      stages: {},
    };

    try {
      // Stage 1: Ensure pdf-lib loaded
      const libStart = Date.now();
      await ensurePdfLib();
      perfLog.stages.libraryLoad = Date.now() - libStart;

      updateMergeProgress(5, `Merging ${files.length} files...`);

      // Stage 2: Create merged PDF document
      const mergeStart = Date.now();
      const mergedPdf = await PDFLib.PDFDocument.create();

      // Stage 3: Process files in parallel batches
      const BATCH_SIZE = 10;
      let processedCount = 0;

      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batchStart = Date.now();
        const batch = files.slice(i, Math.min(i + BATCH_SIZE, files.length));

        const batchResults = await Promise.allSettled(
          batch.map(async (f) => {
            const fileStart = Date.now();

            try {
              if (!f.buffer || f.buffer.byteLength === 0) {
                console.warn(`Skipping empty file: ${f.name}`);
                return null;
              }

              if (f.type === "application/pdf") {
                const pdfDoc = await PDFLib.PDFDocument.load(f.buffer, {
                  ignoreEncryption: true,
                  updateMetadata: false,
                });

                console.log(
                  `✅ PDF loaded: ${f.name} (${Date.now() - fileStart}ms)`
                );
                return { type: "pdf", doc: pdfDoc, name: f.name };
              } else if (
                f.type === "image/jpeg" ||
                /\.(jpe?g|jpg)$/i.test(f.name)
              ) {
                const embedded = await mergedPdf.embedJpg(
                  new Uint8Array(f.buffer)
                );

                console.log(
                  `✅ Image embedded: ${f.name} (${Date.now() - fileStart}ms)`
                );
                return { type: "image", embedded, name: f.name };
              } else if (
                f.type.startsWith("image/") ||
                /\.(png)$/i.test(f.name)
              ) {
                const embedded = await mergedPdf.embedPng(
                  new Uint8Array(f.buffer)
                );

                console.log(
                  `✅ Image embedded: ${f.name} (${Date.now() - fileStart}ms)`
                );
                return { type: "image", embedded, name: f.name };
              }
            } catch (err) {
              console.error(`Failed to process ${f.name}:`, err.message);
              return null;
            }

            return null;
          })
        );

        for (const result of batchResults) {
          if (result.status === "fulfilled" && result.value) {
            const data = result.value;

            if (data.type === "pdf") {
              const pageIndices = data.doc.getPageIndices();
              const copiedPages = await mergedPdf.copyPages(
                data.doc,
                pageIndices
              );
              copiedPages.forEach((page) => mergedPdf.addPage(page));
            } else if (data.type === "image") {
              const A4_WIDTH = 595.28;
              const A4_HEIGHT = 841.89;
              const MARGIN = 40;

              const imgWidth = data.embedded.width;
              const imgHeight = data.embedded.height;
              const maxWidth = A4_WIDTH - 2 * MARGIN;
              const maxHeight = A4_HEIGHT - 2 * MARGIN;

              const scale = Math.min(
                maxWidth / imgWidth,
                maxHeight / imgHeight
              );
              const scaledWidth = imgWidth * scale;
              const scaledHeight = imgHeight * scale;

              const page = mergedPdf.addPage([A4_WIDTH, A4_HEIGHT]);
              page.drawImage(data.embedded, {
                x: (A4_WIDTH - scaledWidth) / 2,
                y: (A4_HEIGHT - scaledHeight) / 2,
                width: scaledWidth,
                height: scaledHeight,
              });
            }
          }
        }

        processedCount += batch.length;
        const progress = Math.floor(5 + (processedCount / files.length) * 80);
        updateMergeProgress(
          progress,
          `Processed ${processedCount}/${files.length} files...`
        );

        console.log(
          `📦 Batch ${Math.floor(i / BATCH_SIZE) + 1} completed (${
            Date.now() - batchStart
          }ms)`
        );

        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      perfLog.stages.merging = Date.now() - mergeStart;

      // Stage 4: Save PDF
      updateMergeProgress(85, "Generating PDF...");
      const saveStart = Date.now();

      const mergedBytes = await mergedPdf.save({
        useObjectStreams: false,
        addDefaultPage: false,
      });

      perfLog.stages.pdfSave = Date.now() - saveStart;

      // Stage 5: Convert to base64 for efficient IPC transfer
      updateMergeProgress(90, "Preparing to save...");
      const convertStart = Date.now();

      const blob = new Blob([mergedBytes], { type: "application/pdf" });
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(blob);
      });

      perfLog.stages.base64Convert = Date.now() - convertStart;

      // Stage 6: Save to disk
      updateMergeProgress(95, "Saving to disk...");
      const diskStart = Date.now();

      const saveRes = await window.electronAPI.saveBytesBase64(
        "merged.pdf",
        base64
      );

      perfLog.stages.diskWrite = Date.now() - diskStart;
      perfLog.total = Date.now() - perfLog.start;

      // Performance summary
      console.log("\n📊 MERGE PERFORMANCE REPORT");
      console.log("═".repeat(60));
      console.log(`Total files: ${files.length}`);
      console.log(
        `Output size: ${Math.round(mergedBytes.length / 1024 / 1024)}MB`
      );
      console.log(`Pages: ${mergedPdf.getPageCount()}`);
      console.log("\n⏱️  Timing Breakdown:");
      console.log(`  Library Load:    ${perfLog.stages.libraryLoad}ms`);
      console.log(`  Merging:         ${perfLog.stages.merging}ms`);
      console.log(`  PDF Save:        ${perfLog.stages.pdfSave}ms`);
      console.log(`  Base64 Convert:  ${perfLog.stages.base64Convert}ms`);
      console.log(`  Disk Write:      ${perfLog.stages.diskWrite}ms`);
      console.log(`  ─────────────────────────────`);
      console.log(`  TOTAL TIME:      ${perfLog.total}ms`);
      console.log(
        `  Files/second:    ${(files.length / (perfLog.total / 1000)).toFixed(
          2
        )}`
      );
      console.log("═".repeat(60) + "\n");

      updateMergeProgress(100, "Complete!");
      await new Promise((resolve) => setTimeout(resolve, 300));
      hideMergeProgress();

      if (saveRes.success) {
        statusEl &&
          (statusEl.innerText = `${LANG[currentLang].saved} ${saveRes.path}`);
      } else {
        statusEl && (statusEl.innerText = "Save canceled");
      }
    } catch (err) {
      console.error("Merge error:", err);
      hideMergeProgress();
      statusEl &&
        (statusEl.innerText = "Error: " + (err.message || String(err)));
    } finally {
      mergeBtn.disabled = false;
      setTimeout(
        () => statusEl && (statusEl.innerText = LANG[currentLang].status_idle),
        2000
      );
    }
  });

// ---------------- Merge & Edit ----------------
mergeEditBtn &&
  mergeEditBtn.addEventListener("click", async () => {
    if (files.length < 1) return;

    mergeEditBtn.disabled = true;
    showMergeProgress("Preparing files...");

    try {
      // Reuse same optimized merge logic
      await ensurePdfLib();

      updateMergeProgress(5, `Merging ${files.length} files...`);

      const mergedPdf = await PDFLib.PDFDocument.create();

      const BATCH_SIZE = 10;
      let processedCount = 0;

      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, Math.min(i + BATCH_SIZE, files.length));

        const batchResults = await Promise.allSettled(
          batch.map(async (f) => {
            try {
              if (!f.buffer || f.buffer.byteLength === 0) return null;

              if (f.type === "application/pdf") {
                const pdfDoc = await PDFLib.PDFDocument.load(f.buffer, {
                  ignoreEncryption: true,
                  updateMetadata: false,
                });
                return { type: "pdf", doc: pdfDoc };
              } else if (
                f.type === "image/jpeg" ||
                /\.(jpe?g|jpg)$/i.test(f.name)
              ) {
                const embedded = await mergedPdf.embedJpg(
                  new Uint8Array(f.buffer)
                );
                return { type: "image", embedded };
              } else if (
                f.type.startsWith("image/") ||
                /\.(png)$/i.test(f.name)
              ) {
                const embedded = await mergedPdf.embedPng(
                  new Uint8Array(f.buffer)
                );
                return { type: "image", embedded };
              }
            } catch (err) {
              console.error(`Failed: ${f.name}`, err.message);
              return null;
            }
            return null;
          })
        );

        for (const result of batchResults) {
          if (result.status === "fulfilled" && result.value) {
            const data = result.value;

            if (data.type === "pdf") {
              const pageIndices = data.doc.getPageIndices();
              const copiedPages = await mergedPdf.copyPages(
                data.doc,
                pageIndices
              );
              copiedPages.forEach((page) => mergedPdf.addPage(page));
            } else if (data.type === "image") {
              const A4_WIDTH = 595.28;
              const A4_HEIGHT = 841.89;
              const MARGIN = 40;

              const imgWidth = data.embedded.width;
              const imgHeight = data.embedded.height;
              const scale = Math.min(
                (A4_WIDTH - 2 * MARGIN) / imgWidth,
                (A4_HEIGHT - 2 * MARGIN) / imgHeight
              );
              const scaledWidth = imgWidth * scale;
              const scaledHeight = imgHeight * scale;

              const page = mergedPdf.addPage([A4_WIDTH, A4_HEIGHT]);
              page.drawImage(data.embedded, {
                x: (A4_WIDTH - scaledWidth) / 2,
                y: (A4_HEIGHT - scaledHeight) / 2,
                width: scaledWidth,
                height: scaledHeight,
              });
            }
          }
        }

        processedCount += batch.length;
        const progress = Math.floor(5 + (processedCount / files.length) * 75);
        updateMergeProgress(
          progress,
          `Processed ${processedCount}/${files.length}...`
        );

        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      updateMergeProgress(80, "Generating PDF...");
      const mergedBytes = await mergedPdf.save({
        useObjectStreams: false,
        addDefaultPage: false,
      });

      updateMergeProgress(90, "Loading editor...");
      await openEditor(mergedBytes);

      updateMergeProgress(100, "Complete!");
      await new Promise((resolve) => setTimeout(resolve, 150));
      hideMergeProgress();
    } catch (err) {
      console.error("Merge & Edit error:", err);
      hideMergeProgress();
      statusEl &&
        (statusEl.innerText = "Error: " + (err.message || String(err)));
    } finally {
      mergeEditBtn.disabled = false;
      setTimeout(
        () => statusEl && (statusEl.innerText = LANG[currentLang].status_idle),
        1000
      );
    }
  });

// ---------------- Page Render Queue System ----------------
function addToRenderQueue(pdf, pageIndex, priority = false) {
  const exists = pageRenderQueue.find((item) => item.pageIndex === pageIndex);
  if (exists) {
    if (priority) exists.priority = true;
    return;
  }

  const item = { pdf, pageIndex, priority };
  if (priority) {
    pageRenderQueue.unshift(item);
  } else {
    pageRenderQueue.push(item);
  }

  processRenderQueue();
}

async function processRenderQueue() {
  if (isProcessingQueue || pageRenderQueue.length === 0) return;

  isProcessingQueue = true;

  while (pageRenderQueue.length > 0) {
    // Sort queue to prioritize high-priority items
    pageRenderQueue.sort((a, b) => {
      if (a.priority && !b.priority) return -1;
      if (!a.priority && b.priority) return 1;
      return 0;
    });

    const item = pageRenderQueue.shift();
    await renderPageFromQueue(item.pdf, item.pageIndex);

    // Allow UI to breathe between renders
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  isProcessingQueue = false;
}

async function renderPageFromQueue(pdf, pageIndex) {
  const pageData = editorPages[pageIndex];
  if (!pageData || pageData.rendered) return;

  try {
    const page = await pdf.getPage(pageData.pageNumber);
    const viewport = page.getViewport({ scale: RENDER_SCALE });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: false,
      desynchronized: true,
    });

    await page.render({
      canvasContext: ctx,
      viewport,
      intent: "display",
    }).promise;

    pageData.canvas = canvas;
    pageData.rendered = true;

    // Update main canvas if this is the current page
    if (pageIndex === currentPageIndex) {
      displayPageOnMainCanvas(pageIndex);
    }
  } catch (err) {
    console.error(`Error rendering page ${pageIndex}:`, err);
  }
}

async function openEditor(pdfBytes) {
  // ✅ Validate input
  if (!pdfBytes || pdfBytes.length === 0) {
    console.error("❌ openEditor called with empty PDF data");
    throw new Error("Cannot open editor: No PDF data provided");
  }

  // Ensure pdfBytes is a Uint8Array and store it properly
  const uint8Bytes =
    pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);

  // ✅ Validate minimum size and PDF header
  if (uint8Bytes.length < 1024) {
    console.error("❌ PDF too small:", uint8Bytes.length, "bytes");
    throw new Error("Invalid PDF: File too small");
  }

  const header = String.fromCharCode(
    uint8Bytes[0],
    uint8Bytes[1],
    uint8Bytes[2],
    uint8Bytes[3]
  );
  if (header !== "%PDF") {
    console.error("❌ Invalid PDF header:", header);
    throw new Error("Invalid PDF: Missing PDF header");
  }

  // Debug: Verify we have valid PDF data
  console.log("✅ openEditor - PDF size:", uint8Bytes.length);
  console.log("✅ openEditor - Header:", header);

  // Store original PDF bytes for saving later - make a new copy
  window.originalPdfBytes = new Uint8Array(uint8Bytes);

  // Verify storage
  console.log("Stored originalPdfBytes size:", window.originalPdfBytes.length);

  // Hide merger page, show editor page
  mergerPage.style.display = "none";
  editorPage.style.display = "flex";

  // Clear previous editor state
  editorPages = [];
  thumbnailContainer.innerHTML = "";
  currentPageIndex = 0;
  pageRenderQueue = [];
  isProcessingQueue = false;

  // Show loading indicator
  const L = LANG[currentLang];
  statusEl && (statusEl.innerText = L.loadingPages);

  // Load PDF - use the uint8Bytes
  const loadingTask = pdfjsLib.getDocument({
    data: uint8Bytes,
    verbosity: 0,
    cMapUrl: CMAP_URL,
    cMapPacked: CMAP_PACKED,
    standardFontDataUrl:
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.394/standard_fonts/",
    useSystemFonts: false,
    disableFontFace: false,
  });
  const pdf = await loadingTask.promise;
  loadedPdfDocument = pdf;
  const pageCount = pdf.numPages;

  // Create page objects WITHOUT rendering
  for (let i = 1; i <= pageCount; i++) {
    editorPages.push({
      pageNumber: i,
      rendered: false,
      canvas: null,
      thumbnail: null,
      thumbnailRendered: false,
      annotations: [],
      undoStack: [],
      redoStack: [],
    });
  }

  // Create placeholder thumbnails immediately (no rendering yet)
  createPlaceholderThumbnails(pageCount);

  // Render ONLY the first page with high priority
  await renderPageFromQueue(pdf, 0);
  displayPageOnMainCanvas(0);

  // Update status to ready
  statusEl && (statusEl.innerText = LANG[currentLang].status_idle);

  // Start lazy loading thumbnails in the background
  lazyLoadThumbnails(pdf);

  // Queue remaining full pages for lazy loading (low priority)
  for (let i = 1; i < pageCount; i++) {
    addToRenderQueue(pdf, i, false);
  }
}

async function renderPage(pdf, pageIndex) {
  addToRenderQueue(pdf, pageIndex, true);
}
// Create placeholder thumbnails instantly without rendering
function createPlaceholderThumbnails(pageCount) {
  const L = LANG[currentLang];

  for (let i = 0; i < pageCount; i++) {
    const thumbItem = document.createElement("div");
    thumbItem.className = "thumbnail-item";
    if (i === 0) thumbItem.classList.add("active");
    thumbItem.dataset.pageIndex = i;

    const thumbImageContainer = document.createElement("div");
    thumbImageContainer.className = "thumbnail-image";
    thumbImageContainer.style.backgroundColor = "#f1f5f9";
    thumbImageContainer.style.display = "flex";
    thumbImageContainer.style.alignItems = "center";
    thumbImageContainer.style.justifyContent = "center";
    thumbImageContainer.style.minHeight = "120px";
    thumbImageContainer.style.color = "#94a3b8";
    thumbImageContainer.style.fontSize = "12px";
    thumbImageContainer.innerHTML = "📄";

    const thumbLabel = document.createElement("div");
    thumbLabel.className = "thumbnail-label";
    thumbLabel.innerText = `${L.pageLabel} ${i + 1}`;

    thumbItem.appendChild(thumbImageContainer);
    thumbItem.appendChild(thumbLabel);

    thumbItem.addEventListener("click", () => {
      currentPageIndex = i;
      displayPageOnMainCanvas(i);
      updateThumbnailSelection();
      renderAnnotations();

      // Prioritize rendering of clicked page if not already rendered
      if (!editorPages[i].rendered) {
        addToRenderQueue(loadedPdfDocument, i, true);
      }

      // Ensure thumbnail is rendered
      if (!editorPages[i].thumbnailRendered) {
        renderThumbnail(loadedPdfDocument, i);
      }
    });

    thumbnailContainer.appendChild(thumbItem);
    editorPages[i].thumbnail = thumbItem;
  }
}

// Lazy load thumbnails in the background
async function lazyLoadThumbnails(pdf) {
  const THUMB_BATCH_SIZE = 5;

  // Start from index 0 to render all thumbnails
  for (let i = 0; i < editorPages.length; i += THUMB_BATCH_SIZE) {
    const batch = editorPages.slice(
      i,
      Math.min(i + THUMB_BATCH_SIZE, editorPages.length)
    );

    await Promise.all(
      batch.map(async (pageData, batchIndex) => {
        const actualIndex = i + batchIndex;
        if (!pageData.thumbnailRendered) {
          await renderThumbnail(pdf, actualIndex);
        }
      })
    );

    // Allow UI to breathe between batches
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

// Render a single thumbnail
async function renderThumbnail(pdf, pageIndex) {
  const pageData = editorPages[pageIndex];
  if (!pageData || pageData.thumbnailRendered) return;

  try {
    const page = await pdf.getPage(pageData.pageNumber);
    const thumbScale = 0.3;
    const viewport = page.getViewport({ scale: thumbScale });

    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = Math.round(viewport.width);
    thumbCanvas.height = Math.round(viewport.height);
    const ctx = thumbCanvas.getContext("2d", { alpha: false });

    await page.render({
      canvasContext: ctx,
      viewport,
      intent: "display",
    }).promise;

    // Update the placeholder with actual thumbnail
    const thumbItem = pageData.thumbnail;
    if (thumbItem) {
      const thumbImageContainer = thumbItem.querySelector(".thumbnail-image");
      if (thumbImageContainer) {
        thumbImageContainer.innerHTML = "";
        thumbImageContainer.style.backgroundColor = "transparent";
        thumbImageContainer.appendChild(thumbCanvas);
      }
    }

    pageData.thumbnailRendered = true;
  } catch (err) {
    console.error(`Error rendering thumbnail for page ${pageIndex}:`, err);
  }
}

function displayPageOnMainCanvas(pageIndex) {
  const pageData = editorPages[pageIndex];
  // Check if pageData exists and has canvas
  if (!pageData) {
    console.error("Page data not found for index:", pageIndex);
    return;
  }
  if (!pageData.canvas) {
    // Show loading indicator for this page
    const ctx = mainCanvas.getContext("2d");
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);
    ctx.fillStyle = "#666";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      LANG[currentLang].loadingPages,
      mainCanvas.width / 2,
      mainCanvas.height / 2
    );
    // Queue this page for immediate rendering
    if (loadedPdfDocument) {
      addToRenderQueue(loadedPdfDocument, pageIndex, true);
    }
    return;
  }
  const ctx = mainCanvas.getContext("2d");
  const srcCanvas = pageData.canvas;
  // Calculate base size to fit container
  const containerWidth = canvasContainer.clientWidth;
  const containerHeight = canvasContainer.clientHeight;
  const baseScale = Math.min(
    containerWidth / srcCanvas.width,
    containerHeight / srcCanvas.height,
    1
  );
  // Apply zoom
  const displayWidth = srcCanvas.width * baseScale * zoomLevel;
  const displayHeight = srcCanvas.height * baseScale * zoomLevel;
  // Set canvas size
  mainCanvas.width = displayWidth;
  mainCanvas.height = displayHeight;
  // Clear and draw
  ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
  ctx.drawImage(srcCanvas, 0, 0, displayWidth, displayHeight);
  // Update zoom display
  updateZoomDisplay();
  // Apply pan offset
  applyPanTransform();
  // Sync annotation canvas
  syncAnnotCanvasToMain();
  // Render annotations for current page
  renderAnnotations();
}
function updateThumbnailSelection() {
  const thumbnails = thumbnailContainer.querySelectorAll(".thumbnail-item");
  thumbnails.forEach((thumb, idx) => {
    if (idx === currentPageIndex) {
      thumb.classList.add("active");
    } else {
      thumb.classList.remove("active");
    }
  });
}
// ---------------- Zoom & Pan Functions ----------------
function updateZoomDisplay() {
  if (zoomDisplay) {
    zoomDisplay.innerText = `${Math.round(zoomLevel * 100)}%`;
  }
  if (zoomInBtn) {
    zoomInBtn.disabled = zoomLevel >= MAX_ZOOM;
  }
  if (zoomOutBtn) {
    zoomOutBtn.disabled = zoomLevel <= MIN_ZOOM;
  }
}
function applyPanTransform() {
  if (!mainCanvas) return;
  mainCanvas.style.transform = `translate(${panX}px, ${panY}px)`;
  mainCanvas.style.cursor = zoomLevel > 1 ? "grab" : "default";
  if (annotCanvas) {
    annotCanvas.style.transform = `translate(${panX}px, ${panY}px)`;
  }
}
function zoomIn() {
  zoomLevel = Math.min(MAX_ZOOM, zoomLevel + ZOOM_STEP);
  displayPageOnMainCanvas(currentPageIndex);
}
function zoomOut() {
  zoomLevel = Math.max(MIN_ZOOM, zoomLevel - ZOOM_STEP);
  displayPageOnMainCanvas(currentPageIndex);
}
function resetZoom() {
  zoomLevel = 1.0;
  panX = 0;
  panY = 0;
  displayPageOnMainCanvas(currentPageIndex);
}
zoomInBtn && zoomInBtn.addEventListener("click", zoomIn);
zoomOutBtn && zoomOutBtn.addEventListener("click", zoomOut);
resetZoomBtn && resetZoomBtn.addEventListener("click", resetZoom);
mainCanvas &&
  mainCanvas.addEventListener("mousedown", (e) => {
    if (zoomLevel <= 1 || currentTool !== "pointer") return;
    isPanning = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    mainCanvas.style.cursor = "grabbing";
    e.preventDefault();
  });
document.addEventListener("mousemove", (e) => {
  if (!isPanning) return;
  const deltaX = e.clientX - lastMouseX;
  const deltaY = e.clientY - lastMouseY;
  panX += deltaX;
  panY += deltaY;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  applyPanTransform();
});
document.addEventListener("mouseup", () => {
  if (!isPanning) return;
  isPanning = false;
  if (mainCanvas && zoomLevel > 1) {
    mainCanvas.style.cursor = "grab";
  }
});
// ---------------- Coordinate Conversion Functions ----------------
function displayToOriginal(x, y) {
  const pageData = editorPages[currentPageIndex];
  if (!pageData || !pageData.canvas) return { x, y };
  const originalWidth = pageData.canvas.width;
  const originalHeight = pageData.canvas.height;
  const displayWidth = mainCanvas.width;
  const displayHeight = mainCanvas.height;
  return {
    x: (x / displayWidth) * originalWidth,
    y: (y / displayHeight) * originalHeight,
  };
}
function originalToDisplay(x, y) {
  const pageData = editorPages[currentPageIndex];
  if (!pageData || !pageData.canvas) return { x, y };
  const originalWidth = pageData.canvas.width;
  const originalHeight = pageData.canvas.height;
  const displayWidth = mainCanvas.width;
  const displayHeight = mainCanvas.height;
  return {
    x: (x / originalWidth) * displayWidth,
    y: (y / originalHeight) * displayHeight,
  };
}
// ---------------- Text Input Functions ----------------
function createTextInput(clientX, clientY) {
  if (textInputActive) return;
  textInputActive = true;
  const containerRect = canvasContainer.getBoundingClientRect();
  const scrollLeft = canvasContainer.scrollLeft;
  const scrollTop = canvasContainer.scrollTop;
  const x = clientX - containerRect.left + scrollLeft;
  const y = clientY - containerRect.top + scrollTop;
  const textarea = document.createElement("textarea");
  textarea.className = "text-input-overlay";
  textarea.style.position = "absolute";
  textarea.style.left = x + "px";
  textarea.style.top = y + "px";
  textarea.style.minWidth = "200px";
  textarea.style.minHeight = "40px";
  textarea.style.fontSize = "16px";
  textarea.style.fontFamily = "Arial, sans-serif";
  textarea.style.padding = "8px";
  textarea.style.border = "2px solid " + currentColor;
  textarea.style.borderRadius = "4px";
  textarea.style.backgroundColor = "rgba(255, 255, 255, 0.95)";
  textarea.style.color = currentColor;
  textarea.style.outline = "none";
  textarea.style.resize = "both";
  textarea.style.zIndex = "10000";
  textarea.placeholder =
    currentLang === "ja"
      ? "ここにテキストを入力します... (終了するには Ctrl+Enter、キャンセルするには Esc)"
      : "Type text here... (Ctrl+Enter to finish, Esc to cancel)";
  canvasContainer.appendChild(textarea);
  setTimeout(() => {
    textarea.focus();
  }, 50);
  textInputElement = textarea;
  let isCompleting = false;
  const completeTextInput = (saveText = true) => {
    if (isCompleting) return;
    isCompleting = true;
    const text = textarea.value.trim();
    if (text && saveText) {
      saveToUndoStack(currentPageIndex);
      const pageData = editorPages[currentPageIndex];

      const textX = parseFloat(textarea.style.left);
      const textY = parseFloat(textarea.style.top);

      const canvasRect = annotCanvas.getBoundingClientRect();
      const containerRect = canvasContainer.getBoundingClientRect();

      const canvasX =
        (textX - (canvasRect.left - containerRect.left - scrollLeft)) *
        (annotCanvas.width / canvasRect.width);
      const canvasY =
        (textY - (canvasRect.top - containerRect.top - scrollTop)) *
        (annotCanvas.height / canvasRect.height);

      const original = displayToOriginal(canvasX, canvasY);

      const scaleFactor = pageData.canvas.width / mainCanvas.width;
      const fontSize = 24 * scaleFactor;

      pageData.annotations.push({
        type: "text",
        x: original.x,
        y: original.y + fontSize,
        text: text,
        color: currentColor,
        fontSize: fontSize,
      });

      renderAnnotations();
    }

    if (textarea.parentNode) {
      textarea.remove();
    }
    textInputActive = false;
    textInputElement = null;
  };
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      completeTextInput(false);
    } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      completeTextInput(true);
    }
  });
  let blurTimeout;
  textarea.addEventListener("blur", (e) => {
    if (blurTimeout) {
      clearTimeout(blurTimeout);
    }
    blurTimeout = setTimeout(() => {
      if (textInputActive && textInputElement === textarea) {
        completeTextInput(true);
      }
    }, 200);
  });
  textarea.addEventListener("focus", () => {
    if (blurTimeout) {
      clearTimeout(blurTimeout);
      blurTimeout = null;
    }
  });
}
// ---------------- Undo/Redo Functions ----------------
function saveToUndoStack(pageIndex) {
  const page = editorPages[pageIndex];
  if (!page) return;
  page.undoStack.push(JSON.parse(JSON.stringify(page.annotations)));
  page.redoStack = [];
  if (page.undoStack.length > 50) {
    page.undoStack.shift();
  }
}
function undo() {
  const page = editorPages[currentPageIndex];
  if (!page || page.undoStack.length === 0) return;
  page.redoStack.push(JSON.parse(JSON.stringify(page.annotations)));
  page.annotations = page.undoStack.pop();
  renderAnnotations();
}
function redo() {
  const page = editorPages[currentPageIndex];
  if (!page || page.redoStack.length === 0) return;
  page.undoStack.push(JSON.parse(JSON.stringify(page.annotations)));
  page.annotations = page.redoStack.pop();
  renderAnnotations();
}
undoBtn && undoBtn.addEventListener("click", undo);
redoBtn && redoBtn.addEventListener("click", redo);
document.addEventListener("keydown", (e) => {
  if (textInputActive) return;
  if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if (
    (e.ctrlKey || e.metaKey) &&
    (e.key === "y" || (e.key === "z" && e.shiftKey))
  ) {
    e.preventDefault();
    redo();
  }
});
// Back to merger
backToMergerBtn &&
  backToMergerBtn.addEventListener("click", () => {
    if (textInputElement) {
      textInputElement.remove();
      textInputElement = null;
      textInputActive = false;
    }
    editorPage.style.display = "none";
    mergerPage.style.display = "block";
    // Clear editor state
    editorPages = [];
    thumbnailContainer.innerHTML = "";
    window.originalPdfBytes = null;
    loadedPdfDocument = null;
    pageRenderQueue = [];
    isProcessingQueue = false;
    const ctx = mainCanvas.getContext("2d");
    ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    const annotCtx = annotCanvas.getContext("2d");
    annotCtx.clearRect(0, 0, annotCanvas.width, annotCanvas.height);
    zoomLevel = 1.0;
    panX = 0;
    panY = 0;
    currentTool = "pointer";
    updateToolUI();
  });

savePdfBtn &&
  savePdfBtn.addEventListener("click", async () => {
    try {
      // Show progress overlay
      showMergeProgress("Preparing to save...");

      updateMergeProgress(5, "Loading editor data...");
      await ensurePdfLib();

      // Wait for all pages to finish rendering
      updateMergeProgress(10, "Waiting for pages to render...");
      while (pageRenderQueue.length > 0 || isProcessingQueue) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const hasAnnotations = editorPages.some(
        (page) => page.annotations && page.annotations.length > 0
      );

      // If no annotations, save original PDF directly (fast path)
      if (!hasAnnotations) {
        updateMergeProgress(50, "Preparing original PDF...");

        if (!window.originalPdfBytes || window.originalPdfBytes.length === 0) {
          throw new Error("Original PDF data is missing");
        }

        updateMergeProgress(90, "Saving to disk...");

        // Convert to base64 for efficient transfer
        const blob = new Blob([window.originalPdfBytes], {
          type: "application/pdf",
        });
        const base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(",")[1]);
          reader.readAsDataURL(blob);
        });

        const saveRes = await window.electronAPI.saveBytesBase64(
          "edited.pdf",
          base64
        );

        updateMergeProgress(100, "Complete!");
        await new Promise((resolve) => setTimeout(resolve, 300));
        hideMergeProgress();

        if (saveRes.success) {
          statusEl &&
            (statusEl.innerText = `${LANG[currentLang].saved} ${saveRes.path}`);
        } else {
          statusEl && (statusEl.innerText = "Save canceled");
        }
        return;
      }

      // Load original PDF to preserve quality
      updateMergeProgress(15, "Loading PDF document...");

      if (!window.originalPdfBytes || window.originalPdfBytes.length === 0) {
        throw new Error("Original PDF data is missing");
      }

      const originalPdf = await PDFLib.PDFDocument.load(
        window.originalPdfBytes
      );

      updateMergeProgress(20, "Processing annotations...");

      // Process pages with annotations
      const pagesToProcess = editorPages
        .map((page, index) => ({ page, index }))
        .filter(({ page }) => page.annotations && page.annotations.length > 0);

      // If no pages have annotations, save original
      if (pagesToProcess.length === 0) {
        updateMergeProgress(85, "Generating PDF...");

        const bytes = await originalPdf.save();
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

        updateMergeProgress(90, "Saving to disk...");

        const blob = new Blob([u8], { type: "application/pdf" });
        const base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(",")[1]);
          reader.readAsDataURL(blob);
        });

        const saveRes = await window.electronAPI.saveBytesBase64(
          "edited.pdf",
          base64
        );

        updateMergeProgress(100, "Complete!");
        await new Promise((resolve) => setTimeout(resolve, 300));
        hideMergeProgress();

        if (saveRes.success) {
          statusEl &&
            (statusEl.innerText = `${LANG[currentLang].saved} ${saveRes.path}`);
        } else {
          statusEl && (statusEl.innerText = "Save canceled");
        }
        return;
      }

      // Create new PDF with annotations
      updateMergeProgress(25, "Creating new PDF document...");
      const pdfDoc = await PDFLib.PDFDocument.create();

      // Copy all pages from original
      updateMergeProgress(30, "Copying pages...");
      const copiedPages = await pdfDoc.copyPages(
        originalPdf,
        originalPdf.getPageIndices()
      );
      copiedPages.forEach((page) => pdfDoc.addPage(page));

      // Now overlay annotations only on pages that have them
      updateMergeProgress(
        35,
        `Processing ${pagesToProcess.length} annotated pages...`
      );

      for (let i = 0; i < pagesToProcess.length; i++) {
        const { page: pageData, index: pageIndex } = pagesToProcess[i];

        if (!pageData.canvas) continue;

        // Update progress for each page
        const pageProgress = Math.floor(35 + (i / pagesToProcess.length) * 50);
        updateMergeProgress(
          pageProgress,
          `Processing page ${i + 1} of ${pagesToProcess.length}...`
        );

        // Create canvas ONLY for annotations (transparent background)
        const annotCanvas = document.createElement("canvas");
        annotCanvas.width = pageData.canvas.width;
        annotCanvas.height = pageData.canvas.height;
        const annotCtx = annotCanvas.getContext("2d", {
          alpha: true,
          desynchronized: true,
        });

        // Draw ONLY annotations (not the page content)
        for (const annot of pageData.annotations) {
          if (annot.type === "rectangle") {
            annotCtx.strokeStyle = annot.color;
            annotCtx.lineWidth = 3;
            annotCtx.beginPath();
            annotCtx.rect(annot.x, annot.y, annot.width, annot.height);
            annotCtx.stroke();
          } else if (annot.type === "highlight") {
            annotCtx.fillStyle = annot.color + "40";
            annotCtx.fillRect(annot.x, annot.y, annot.width, annot.height);
          } else if (annot.type === "line") {
            annotCtx.strokeStyle = annot.color;
            annotCtx.lineWidth = 3;
            annotCtx.lineCap = "round";
            annotCtx.beginPath();
            annotCtx.moveTo(annot.x1, annot.y1);
            annotCtx.lineTo(annot.x2, annot.y2);
            annotCtx.stroke();

            const headLength = 15;
            const angle = Math.atan2(annot.y2 - annot.y1, annot.x2 - annot.x1);
            annotCtx.fillStyle = annot.color;
            annotCtx.beginPath();
            annotCtx.moveTo(annot.x2, annot.y2);
            annotCtx.lineTo(
              annot.x2 - headLength * Math.cos(angle - Math.PI / 6),
              annot.y2 - headLength * Math.sin(angle - Math.PI / 6)
            );
            annotCtx.lineTo(
              annot.x2 - headLength * Math.cos(angle + Math.PI / 6),
              annot.y2 - headLength * Math.sin(angle + Math.PI / 6)
            );
            annotCtx.closePath();
            annotCtx.fill();
          } else if (annot.type === "pen") {
            if (annot.points.length < 2) continue;
            annotCtx.strokeStyle = annot.color;
            annotCtx.lineWidth = 3;
            annotCtx.lineCap = "round";
            annotCtx.lineJoin = "round";
            annotCtx.beginPath();
            annotCtx.moveTo(annot.points[0].x, annot.points[0].y);
            for (let j = 1; j < annot.points.length; j++) {
              annotCtx.lineTo(annot.points[j].x, annot.points[j].y);
            }
            annotCtx.stroke();
          } else if (annot.type === "text") {
            annotCtx.fillStyle = annot.color;
            annotCtx.font = `${annot.fontSize || 24}px Arial`;
            annotCtx.fillText(annot.text, annot.x, annot.y);
          }
        }

        // Convert annotations canvas to PNG
        const dataUrl = annotCanvas.toDataURL("image/png");
        const bin = atob(dataUrl.split(",")[1]);
        const arr = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) {
          arr[j] = bin.charCodeAt(j);
        }

        // Embed annotation image
        const annotImg = await pdfDoc.embedPng(arr);

        // Get the page and overlay annotations
        const pdfPage = pdfDoc.getPage(pageIndex);
        const { width, height } = pdfPage.getSize();

        // Draw annotations on top of existing page
        pdfPage.drawImage(annotImg, {
          x: 0,
          y: 0,
          width: width,
          height: height,
          opacity: 1,
        });

        // Clean up
        annotCanvas.width = 0;
        annotCanvas.height = 0;

        // Allow UI to breathe every 3 pages
        if (i % 3 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      // Save the PDF
      updateMergeProgress(85, "Generating final PDF...");
      const bytes = await pdfDoc.save({
        useObjectStreams: false,
        addDefaultPage: false,
      });
      const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

      // Convert to base64 for efficient transfer
      updateMergeProgress(90, "Preparing to save...");
      const blob = new Blob([u8], { type: "application/pdf" });
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(blob);
      });

      updateMergeProgress(95, "Saving to disk...");
      const saveRes = await window.electronAPI.saveBytesBase64(
        "edited.pdf",
        base64
      );

      updateMergeProgress(100, "Complete!");
      await new Promise((resolve) => setTimeout(resolve, 300));
      hideMergeProgress();

      if (saveRes.success) {
        statusEl &&
          (statusEl.innerText = `${LANG[currentLang].saved} ${saveRes.path}`);
      } else {
        statusEl && (statusEl.innerText = "Save canceled");
      }
    } catch (err) {
      console.error("Save error:", err);
      hideMergeProgress();
      statusEl &&
        (statusEl.innerText = "Error: " + (err.message || String(err)));
    } finally {
      setTimeout(
        () => statusEl && (statusEl.innerText = LANG[currentLang].status_idle),
        2000
      );
    }
  });
window.addEventListener("resize", () => {
  if (editorPage.style.display !== "none" && currentPageIndex >= 0) {
    displayPageOnMainCanvas(currentPageIndex);
  }
});
// ---------------- Toolbar & Annotation Handlers ----------------
const toolButtonsArr = Array.from(toolButtons || []);
const colorButtonsArr = Array.from(colorButtons || []);
function updateToolUI() {
  toolButtonsArr.forEach((btn) => {
    if (btn.dataset && btn.dataset.tool === currentTool) {
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
    } else {
      btn.classList.remove("active");
      btn.setAttribute("aria-pressed", "false");
    }
  });
}
function updateColorUI() {
  colorButtonsArr.forEach((btn) => {
    if (btn.dataset && btn.dataset.color === currentColor) {
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
    } else {
      btn.classList.remove("active");
      btn.setAttribute("aria-pressed", "false");
    }
  });
}
toolButtonsArr.forEach((btn) => {
  btn.addEventListener("click", (e) => {
    const tool = btn.dataset.tool;
    if (!tool) return;
    currentTool = tool;
    updateToolUI();
    annotCanvas.style.pointerEvents =
      currentTool === "pointer" ? "none" : "auto";
    annotCanvas.style.cursor =
      currentTool === "pointer" ? "default" : "crosshair";
  });
});
colorButtonsArr.forEach((btn) => {
  btn.addEventListener("click", (e) => {
    const c = btn.dataset.color;
    if (!c) return;
    currentColor = c;
    updateColorUI();
  });
});
function syncAnnotCanvasToMain() {
  if (!mainCanvas || !annotCanvas) return;
  annotCanvas.width = mainCanvas.width;
  annotCanvas.height = mainCanvas.height;
  annotCanvas.style.width = mainCanvas.width + "px";
  annotCanvas.style.height = mainCanvas.height + "px";
  annotCanvas.style.position = "absolute";
  annotCanvas.style.left = mainCanvas.offsetLeft + "px";
  annotCanvas.style.top = mainCanvas.offsetTop + "px";
  annotCanvas.style.pointerEvents = currentTool === "pointer" ? "none" : "auto";
}
// ---------------- Annotation Drawing ----------------
let annotCtx = annotCanvas ? annotCanvas.getContext("2d") : null;
let annotMouseDown = false;
let annotStartX = 0,
  annotStartY = 0;
function getAnnotCoords(e) {
  const rect = annotCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (annotCanvas.width / rect.width);
  const y = (e.clientY - rect.top) * (annotCanvas.height / rect.height);
  return { x, y };
}
if (annotCanvas) {
  annotCanvas.addEventListener("mousedown", (e) => {
    if (currentTool === "pointer") return;
    if (textInputActive) return;
    annotCtx = annotCanvas.getContext("2d");
    const { x, y } = getAnnotCoords(e);

    if (currentTool === "text") {
      createTextInput(e.clientX, e.clientY);
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    annotMouseDown = true;
    annotStartX = x;
    annotStartY = y;

    if (currentTool === "pen") {
      currentPath = [{ x, y }];
    }

    e.preventDefault();
  });
  annotCanvas.addEventListener("mousemove", (e) => {
    if (!annotMouseDown) return;
    const { x, y } = getAnnotCoords(e);

    if (currentTool === "pen") {
      currentPath.push({ x, y });
      renderAnnotations();
      drawTempPath();
    } else if (currentTool === "rectangle") {
      tempAnnotation = {
        type: "rectangle",
        x: annotStartX,
        y: annotStartY,
        width: x - annotStartX,
        height: y - annotStartY,
        color: currentColor,
      };
      renderAnnotations();
    } else if (currentTool === "highlight") {
      tempAnnotation = {
        type: "highlight",
        x: annotStartX,
        y: annotStartY,
        width: x - annotStartX,
        height: y - annotStartY,
        color: currentColor,
      };
      renderAnnotations();
    } else if (currentTool === "line") {
      tempAnnotation = {
        type: "line",
        x1: annotStartX,
        y1: annotStartY,
        x2: x,
        y2: y,
        color: currentColor,
      };
      renderAnnotations();
    }

    e.preventDefault();
  });
  annotCanvas.addEventListener("mouseup", (e) => {
    if (!annotMouseDown) return;
    annotMouseDown = false;
    const page = editorPages[currentPageIndex];
    if (!page) return;

    const { x, y } = getAnnotCoords(e);

    saveToUndoStack(currentPageIndex);

    if (currentTool === "pen" && currentPath.length > 1) {
      const originalPath = currentPath.map((pt) =>
        displayToOriginal(pt.x, pt.y)
      );
      page.annotations.push({
        type: "pen",
        points: originalPath,
        color: currentColor,
      });
      currentPath = [];
    } else if (currentTool === "rectangle") {
      const width = x - annotStartX;
      const height = y - annotStartY;
      if (Math.abs(width) > 2 && Math.abs(height) > 2) {
        const topLeft = displayToOriginal(annotStartX, annotStartY);
        const bottomRight = displayToOriginal(x, y);
        page.annotations.push({
          type: "rectangle",
          x: topLeft.x,
          y: topLeft.y,
          width: bottomRight.x - topLeft.x,
          height: bottomRight.y - topLeft.y,
          color: currentColor,
        });
      }
    } else if (currentTool === "highlight") {
      const width = x - annotStartX;
      const height = y - annotStartY;
      if (Math.abs(width) > 2 && Math.abs(height) > 2) {
        const topLeft = displayToOriginal(annotStartX, annotStartY);
        const bottomRight = displayToOriginal(x, y);
        page.annotations.push({
          type: "highlight",
          x: topLeft.x,
          y: topLeft.y,
          width: bottomRight.x - topLeft.x,
          height: bottomRight.y - topLeft.y,
          color: currentColor,
        });
      }
    } else if (currentTool === "line") {
      const dx = x - annotStartX;
      const dy = y - annotStartY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 5) {
        const start = displayToOriginal(annotStartX, annotStartY);
        const end = displayToOriginal(x, y);
        page.annotations.push({
          type: "line",
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
          color: currentColor,
        });
      }
    }

    tempAnnotation = null;
    renderAnnotations();
    e.preventDefault();
  });
  annotCanvas.addEventListener("mouseleave", () => {
    if (annotMouseDown) {
      annotMouseDown = false;
      currentPath = [];
      tempAnnotation = null;
    }
  });
}
function drawTempPath() {
  if (!annotCtx || currentPath.length < 2) return;
  annotCtx.strokeStyle = currentColor;
  annotCtx.lineWidth = 3;
  annotCtx.lineCap = "round";
  annotCtx.lineJoin = "round";
  annotCtx.beginPath();
  annotCtx.moveTo(currentPath[0].x, currentPath[0].y);
  for (let i = 1; i < currentPath.length; i++) {
    annotCtx.lineTo(currentPath[i].x, currentPath[i].y);
  }
  annotCtx.stroke();
}
function drawArrowHead(ctx, fromX, fromY, toX, toY, color) {
  const headLength = 15;
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headLength * Math.cos(angle - Math.PI / 6),
    toY - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    toX - headLength * Math.cos(angle + Math.PI / 6),
    toY - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function renderAnnotations() {
  if (!annotCanvas) return;
  const ctx = annotCanvas.getContext("2d");
  ctx.clearRect(0, 0, annotCanvas.width, annotCanvas.height);
  const pageData = editorPages[currentPageIndex];
  if (!pageData) return;
  for (const annot of pageData.annotations) {
    if (annot.type === "rectangle") {
      const topLeft = originalToDisplay(annot.x, annot.y);
      const bottomRight = originalToDisplay(
        annot.x + annot.width,
        annot.y + annot.height
      );
      ctx.strokeStyle = annot.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.rect(
        topLeft.x,
        topLeft.y,
        bottomRight.x - topLeft.x,
        bottomRight.y - topLeft.y
      );
      ctx.stroke();
    } else if (annot.type === "highlight") {
      const topLeft = originalToDisplay(annot.x, annot.y);
      const bottomRight = originalToDisplay(
        annot.x + annot.width,
        annot.y + annot.height
      );
      ctx.fillStyle = annot.color + "40";
      ctx.fillRect(
        topLeft.x,
        topLeft.y,
        bottomRight.x - topLeft.x,
        bottomRight.y - topLeft.y
      );
    } else if (annot.type === "line") {
      const start = originalToDisplay(annot.x1, annot.y1);
      const end = originalToDisplay(annot.x2, annot.y2);
      ctx.strokeStyle = annot.color;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      drawArrowHead(ctx, start.x, start.y, end.x, end.y, annot.color);
    } else if (annot.type === "pen") {
      if (annot.points.length < 2) continue;
      ctx.strokeStyle = annot.color;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      const firstPoint = originalToDisplay(
        annot.points[0].x,
        annot.points[0].y
      );
      ctx.moveTo(firstPoint.x, firstPoint.y);
      for (let i = 1; i < annot.points.length; i++) {
        const point = originalToDisplay(annot.points[i].x, annot.points[i].y);
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    } else if (annot.type === "text") {
      const pos = originalToDisplay(annot.x, annot.y);
      ctx.fillStyle = annot.color;
      const scaledFontSize =
        (annot.fontSize || 24) * (mainCanvas.width / pageData.canvas.width);
      ctx.font = `${scaledFontSize}px Arial`;
      ctx.fillText(annot.text, pos.x, pos.y);
    }
  }
  if (tempAnnotation) {
    if (tempAnnotation.type === "rectangle") {
      ctx.strokeStyle = tempAnnotation.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.rect(
        tempAnnotation.x,
        tempAnnotation.y,
        tempAnnotation.width,
        tempAnnotation.height
      );
      ctx.stroke();
    } else if (tempAnnotation.type === "highlight") {
      ctx.fillStyle = tempAnnotation.color + "40";
      ctx.fillRect(
        tempAnnotation.x,
        tempAnnotation.y,
        tempAnnotation.width,
        tempAnnotation.height
      );
    } else if (tempAnnotation.type === "line") {
      ctx.strokeStyle = tempAnnotation.color;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tempAnnotation.x1, tempAnnotation.y1);
      ctx.lineTo(tempAnnotation.x2, tempAnnotation.y2);
      ctx.stroke();
      drawArrowHead(
        ctx,
        tempAnnotation.x1,
        tempAnnotation.y1,
        tempAnnotation.x2,
        tempAnnotation.y2,
        tempAnnotation.color
      );
    }
  }
}
// Initialize
applyLanguage();
updateToolUI();
updateColorUI();
