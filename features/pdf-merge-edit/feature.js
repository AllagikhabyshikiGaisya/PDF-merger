// features/pdf-merge-edit/feature.js
// PDF Merge & Edit Feature - Complete Implementation

const CMAP_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.394/cmaps/";
const CMAP_PACKED = true;
const RENDER_SCALE = 3.0;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5.0;
const ZOOM_STEP = 0.25;
const MAX_IMAGE_WIDTH = 1600;
const JPEG_QUALITY = 0.95;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 40;

let PDFLib = null;
let pdfjsLib = null;
let currentLang = "en";

// State
let files = [];
let editorPages = [];
let currentPageIndex = 0;
let zoomLevel = 1.0;
let panX = 0;
let panY = 0;
let isPanning = false;
let lastMouseX = 0;
let lastMouseY = 0;
let currentTool = "pointer";
let currentColor = "#ff0000";
let tempAnnotation = null;
let currentPath = [];
let textInputActive = false;
let textInputElement = null;
let loadedPdfDocument = null;
let pageRenderQueue = [];
let isProcessingQueue = false;

// DOM elements (will be set in init)
let container, uploadStage, editorStage, dropZone, filesList, fileInput;
let uploadActions, fileCount, totalSize, mainCanvas, annotCanvas;
let thumbnailContainer, zoomDisplay, canvasContainer, loadingOverlay;
let loadingMessage, loadingProgress;

/**
 * Initialize feature
 */
export async function init(featureContainer, params = {}) {
  console.log("🎬 PDF Merge & Edit: Initializing...");

  try {
    container = featureContainer;
    currentLang = params.lang || "en";

    // Get DOM elements
    getDOMElements();

    // Load libraries
    await loadLibraries();

    // Setup event listeners
    setupUploadListeners();
    setupNavigationListeners();

    // Apply language
    applyLanguage();

    // Show upload stage
    showUploadStage();

    console.log("✅ PDF Merge & Edit: Initialized");
    return { initialized: true };
  } catch (error) {
    console.error("❌ PDF Merge & Edit: Initialization failed", error);
    throw error;
  }
}

/**
 * Get all DOM elements
 */
function getDOMElements() {
  uploadStage = container.querySelector("#uploadStage");
  editorStage = container.querySelector("#editorStage");
  dropZone = container.querySelector("#dropZone");
  filesList = container.querySelector("#filesList");
  fileInput = container.querySelector("#fileInput");
  uploadActions = container.querySelector("#uploadActions");
  fileCount = container.querySelector("#fileCount");
  totalSize = container.querySelector("#totalSize");
  mainCanvas = container.querySelector("#mainCanvas");
  annotCanvas = container.querySelector("#annotCanvas");
  thumbnailContainer = container.querySelector("#thumbnailContainer");
  zoomDisplay = container.querySelector("#zoomDisplay");
  canvasContainer = container.querySelector(".canvas-container");
  loadingOverlay = container.querySelector("#loadingOverlay");
  loadingMessage = container.querySelector("#loadingMessage");
  loadingProgress = container.querySelector("#loadingProgress");
}

/**
 * Load required libraries
 */
async function loadLibraries() {
  // Load PDF.js
  if (!window.pdfjsLib && window.libs && window.libs.pdfjsDistPath) {
    pdfjsLib = await import(`file://${window.libs.pdfjsDistPath}`);
    pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${window.libs.pdfjsWorkerPath}`;
    pdfjsLib.GlobalWorkerOptions.verbosity = 0;
  } else {
    pdfjsLib = window.pdfjsLib;
  }

  // Load PDF-lib
  if (!window.PDFLib && window.libs && window.libs.pdfLibPath) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `file://${window.libs.pdfLibPath}`;
      script.onload = () => {
        PDFLib = window.PDFLib;
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  } else {
    PDFLib = window.PDFLib;
  }
}

/**
 * Setup upload stage listeners
 */
function setupUploadListeners() {
  const browseBtn = container.querySelector("#browseBtn");
  const clearFiles = container.querySelector("#clearFiles");
  const proceedBtn = container.querySelector("#proceedBtn");
  const backToHome = container.querySelector("#backToHome");

  // Browse button
  browseBtn?.addEventListener("click", () => fileInput?.click());

  // File input
  fileInput?.addEventListener("change", handleFileSelect);

  // Drag & drop
  ["dragenter", "dragover"].forEach((evt) => {
    dropZone?.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    dropZone?.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
    });
  });

  dropZone?.addEventListener("drop", async (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) {
      await handleFiles(e.dataTransfer.files);
    }
  });

  // Clear files
  clearFiles?.addEventListener("click", clearAllFiles);

  // Proceed to editor
  proceedBtn?.addEventListener("click", proceedToEditor);

  // Back to home
  backToHome?.addEventListener("click", () => {
    if (window.featureManager) {
      window.featureManager.deactivateAll();
    }
  });
}

/**
 * Setup navigation listeners
 */
function setupNavigationListeners() {
  const backToUpload = container.querySelector("#backToUpload");
  const savePdf = container.querySelector("#savePdf");
  const zoomIn = container.querySelector("#zoomIn");
  const zoomOut = container.querySelector("#zoomOut");
  const resetZoom = container.querySelector("#resetZoom");
  const undo = container.querySelector("#undo");
  const redo = container.querySelector("#redo");

  backToUpload?.addEventListener("click", () => {
    showUploadStage();
    cleanupEditor();
  });

  savePdf?.addEventListener("click", handleSavePdf);
  zoomIn?.addEventListener("click", handleZoomIn);
  zoomOut?.addEventListener("click", handleZoomOut);
  resetZoom?.addEventListener("click", handleResetZoom);
  undo?.addEventListener("click", handleUndo);
  redo?.addEventListener("click", handleRedo);

  // Tool buttons
  const toolButtons = container.querySelectorAll("[data-tool]");
  toolButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTool = btn.dataset.tool;
      updateToolUI();
      annotCanvas.style.pointerEvents =
        currentTool === "pointer" ? "none" : "auto";
      annotCanvas.style.cursor =
        currentTool === "pointer" ? "default" : "crosshair";
    });
  });

  // Color buttons
  const colorButtons = container.querySelectorAll("[data-color]");
  colorButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      currentColor = btn.dataset.color;
      updateColorUI();
    });
  });

  // Annotation canvas
  setupAnnotationListeners();

  // Pan on main canvas
  setupPanListeners();

  // Keyboard shortcuts
  setupKeyboardShortcuts();
}

/**
 * Handle file selection
 */
async function handleFileSelect(e) {
  if (e.target.files?.length) {
    await handleFiles(e.target.files);
    fileInput.value = "";
  }
}

/**
 * Handle uploaded files
 */
async function handleFiles(fileList) {
  const inputFiles = Array.from(fileList);
  if (inputFiles.length === 0) return;

  showLoading("Loading files...");

  try {
    const results = await Promise.allSettled(
      inputFiles.map((file) => processFile(file))
    );

    const newFiles = results
      .filter((r) => r.status === "fulfilled" && r.value !== null)
      .map((r) => r.value);

    files.push(...newFiles);

    renderFilesList();
    updateSummary();

    // Generate PDF thumbnails in background
    lazyGeneratePdfThumbnails(
      newFiles.filter((f) => f.type === "application/pdf")
    );
  } catch (error) {
    console.error("Error handling files:", error);
    if (window.pdfUtils) {
      window.pdfUtils.showToast("Error loading files", "error");
    }
  } finally {
    hideLoading();
  }
}

/**
 * Process individual file
 */
async function processFile(file) {
  if (!/\.(pdf|png|jpe?g|jpg)$/i.test(file.name)) {
    return null;
  }

  try {
    const lower = file.name.toLowerCase();

    if (/\.(png|jpe?g|jpg)$/i.test(lower)) {
      const ab = await resizeImageFile(file);
      return {
        id: generateId(),
        name: file.name,
        type: "image/jpeg",
        size: ab.byteLength,
        buffer: ab,
        thumbUrl: URL.createObjectURL(file),
      };
    } else if (/\.pdf$/i.test(lower)) {
      const ab = await file.arrayBuffer();
      return {
        id: generateId(),
        name: file.name,
        type: "application/pdf",
        size: ab.byteLength,
        buffer: ab,
        thumbUrl: null,
        thumbnailGenerated: false,
      };
    }
  } catch (error) {
    console.error(`Error processing ${file.name}:`, error);
    return null;
  }

  return null;
}

/**
 * Resize image file
 */
async function resizeImageFile(file) {
  try {
    const imageBitmap = await createImageBitmap(file);
    const ratio = Math.min(1, MAX_IMAGE_WIDTH / imageBitmap.width);
    const tw = Math.round(imageBitmap.width * ratio);
    const th = Math.round(imageBitmap.height * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imageBitmap, 0, 0, tw, th);

    const blob = await new Promise((res) =>
      canvas.toBlob(res, "image/jpeg", JPEG_QUALITY)
    );

    return await blob.arrayBuffer();
  } catch (error) {
    return await file.arrayBuffer();
  }
}

/**
 * Lazy generate PDF thumbnails
 */
async function lazyGeneratePdfThumbnails(pdfFiles) {
  for (const fileObj of pdfFiles) {
    if (fileObj.thumbnailGenerated || fileObj.thumbUrl) continue;

    try {
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

        await page.render({ canvasContext: ctx, viewport, intent: "display" })
          .promise;

        fileObj.thumbUrl = canvas.toDataURL("image/jpeg", 0.8);
        fileObj.thumbnailGenerated = true;

        // Update UI
        const card = filesList.querySelector(`[data-file-id="${fileObj.id}"]`);
        if (card) {
          const thumb = card.querySelector(".file-thumb");
          if (thumb && fileObj.thumbUrl) {
            thumb.innerHTML = `<img src="${fileObj.thumbUrl}" alt="${fileObj.name}">`;
          }
        }

        canvas.width = 0;
        canvas.height = 0;
      }
    } catch (error) {
      console.warn(`Failed to generate thumbnail for ${fileObj.name}:`, error);
      fileObj.thumbnailGenerated = true;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Render files list
 */
function renderFilesList() {
  if (!filesList) return;

  filesList.innerHTML = "";

  files.forEach((file, idx) => {
    const card = document.createElement("div");
    card.className = "file-card";
    card.draggable = true;
    card.setAttribute("data-file-id", file.id);

    const thumb = document.createElement("div");
    thumb.className = "file-thumb";
    if (file.thumbUrl) {
      const img = document.createElement("img");
      img.src = file.thumbUrl;
      thumb.appendChild(img);
    } else {
      thumb.textContent = "📄";
    }

    const info = document.createElement("div");
    info.className = "file-info";

    const name = document.createElement("p");
    name.className = "file-name";
    name.textContent = file.name;

    const meta = document.createElement("div");
    meta.className = "file-meta";
    meta.textContent = `${file.type} • ${formatFileSize(file.size)}`;

    info.appendChild(name);
    info.appendChild(meta);

    const removeBtn = document.createElement("button");
    removeBtn.className = "file-remove";
    removeBtn.textContent = "×";
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      removeFile(idx);
    };

    // Drag and drop
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", String(idx));
      card.classList.add("dragging");
    });

    card.addEventListener("dragend", () => card.classList.remove("dragging"));

    card.addEventListener("dragover", (e) => e.preventDefault());

    card.addEventListener("drop", (e) => {
      e.preventDefault();
      const src = Number(e.dataTransfer.getData("text/plain"));
      if (!isNaN(src) && src !== idx) {
        const moved = files.splice(src, 1)[0];
        files.splice(idx, 0, moved);
        renderFilesList();
      }
    });

    card.appendChild(thumb);
    card.appendChild(info);
    card.appendChild(removeBtn);
    filesList.appendChild(card);
  });

  uploadActions.style.display = files.length > 0 ? "flex" : "none";
}

/**
 * Remove file
 */
function removeFile(index) {
  try {
    const file = files[index];
    if (file.thumbUrl) {
      URL.revokeObjectURL(file.thumbUrl);
    }
  } catch (error) {}

  files.splice(index, 1);
  renderFilesList();
  updateSummary();
}

/**
 * Clear all files
 */
function clearAllFiles() {
  files.forEach((f) => {
    try {
      if (f.thumbUrl) URL.revokeObjectURL(f.thumbUrl);
    } catch (error) {}
  });

  files = [];
  renderFilesList();
  updateSummary();
}

/**
 * Update file summary
 */
function updateSummary() {
  if (!fileCount || !totalSize) return;

  const total = files.reduce((sum, f) => sum + (f.size || 0), 0);
  fileCount.textContent = `${files.length} ${
    currentLang === "ja" ? "個のファイル" : "files"
  }`;
  totalSize.textContent = formatFileSize(total);
}

/**
 * Proceed to editor
 */
async function proceedToEditor() {
  if (files.length === 0) return;

  showLoading("Merging files...");

  try {
    // Create merged PDF
    const mergedPdfBytes = await createMergedPdf();

    if (!mergedPdfBytes || mergedPdfBytes.length === 0) {
      throw new Error("Failed to create merged PDF");
    }

    // Open editor with merged PDF
    await openEditor(mergedPdfBytes);

    showEditorStage();
  } catch (error) {
    console.error("Error proceeding to editor:", error);
    if (window.pdfUtils) {
      window.pdfUtils.showToast("Failed to merge files", "error");
    }
  } finally {
    hideLoading();
  }
}

/**
 * Create merged PDF from files
 */
async function createMergedPdf() {
  const mergedPdf = await PDFLib.PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    updateLoadingProgress(
      Math.round((i / files.length) * 90),
      `Processing ${i + 1}/${files.length}...`
    );

    try {
      if (!file.buffer || file.buffer.byteLength === 0) continue;

      if (file.type === "application/pdf") {
        const pdfDoc = await PDFLib.PDFDocument.load(file.buffer, {
          ignoreEncryption: true,
          updateMetadata: false,
        });

        const pageIndices = pdfDoc.getPageIndices();
        const copiedPages = await mergedPdf.copyPages(pdfDoc, pageIndices);
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      } else if (
        file.type === "image/jpeg" ||
        /\.(jpe?g|jpg)$/i.test(file.name)
      ) {
        const embedded = await mergedPdf.embedJpg(new Uint8Array(file.buffer));
        addImagePage(mergedPdf, embedded);
      } else if (file.type.startsWith("image/") || /\.png$/i.test(file.name)) {
        const embedded = await mergedPdf.embedPng(new Uint8Array(file.buffer));
        addImagePage(mergedPdf, embedded);
      }
    } catch (error) {
      console.error(`Error processing ${file.name}:`, error);
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  updateLoadingProgress(95, "Generating PDF...");

  const mergedBytes = await mergedPdf.save({
    useObjectStreams: false,
    addDefaultPage: false,
  });

  return mergedBytes instanceof Uint8Array
    ? mergedBytes
    : new Uint8Array(mergedBytes);
}

/**
 * Add image page to PDF
 */
function addImagePage(pdfDoc, embedded) {
  const imgWidth = embedded.width;
  const imgHeight = embedded.height;
  const maxWidth = A4_WIDTH - 2 * MARGIN;
  const maxHeight = A4_HEIGHT - 2 * MARGIN;

  const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
  const scaledWidth = imgWidth * scale;
  const scaledHeight = imgHeight * scale;

  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  page.drawImage(embedded, {
    x: (A4_WIDTH - scaledWidth) / 2,
    y: (A4_HEIGHT - scaledHeight) / 2,
    width: scaledWidth,
    height: scaledHeight,
  });
}

/**
 * Open editor with PDF
 */
async function openEditor(pdfBytes) {
  // Validate PDF
  const uint8Bytes =
    pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);

  if (uint8Bytes.length < 1024) {
    throw new Error("Invalid PDF: File too small");
  }

  const header = String.fromCharCode(
    uint8Bytes[0],
    uint8Bytes[1],
    uint8Bytes[2],
    uint8Bytes[3]
  );
  if (header !== "%PDF") {
    throw new Error("Invalid PDF: Missing PDF header");
  }

  // Store original PDF bytes
  window.originalPdfBytes = new Uint8Array(uint8Bytes);

  // Reset editor state
  editorPages = [];
  thumbnailContainer.innerHTML = "";
  currentPageIndex = 0;
  pageRenderQueue = [];
  isProcessingQueue = false;
  zoomLevel = 1.0;
  panX = 0;
  panY = 0;
  currentTool = "pointer";
  updateToolUI();
  updateColorUI();

  // Load PDF
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

  // Create page objects
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

  // Create placeholder thumbnails
  createPlaceholderThumbnails(pageCount);

  // Render first page
  await renderPageFromQueue(pdf, 0);
  displayPageOnMainCanvas(0);

  // Lazy load thumbnails and pages
  lazyLoadThumbnails(pdf);

  for (let i = 1; i < pageCount; i++) {
    addToRenderQueue(pdf, i, false);
  }
}

/**
 * Create placeholder thumbnails
 */
function createPlaceholderThumbnails(pageCount) {
  const pageLabel = currentLang === "ja" ? "ページ" : "Page";

  for (let i = 0; i < pageCount; i++) {
    const thumbItem = document.createElement("div");
    thumbItem.className = "thumbnail-item";
    if (i === 0) thumbItem.classList.add("active");
    thumbItem.dataset.pageIndex = i;

    const thumbImageContainer = document.createElement("div");
    thumbImageContainer.className = "thumbnail-image";
    thumbImageContainer.textContent = "📄";

    const thumbLabel = document.createElement("div");
    thumbLabel.className = "thumbnail-label";
    thumbLabel.textContent = `${pageLabel} ${i + 1}`;

    thumbItem.appendChild(thumbImageContainer);
    thumbItem.appendChild(thumbLabel);

    thumbItem.addEventListener("click", () => {
      currentPageIndex = i;
      displayPageOnMainCanvas(i);
      updateThumbnailSelection();
      renderAnnotations();

      if (!editorPages[i].rendered) {
        addToRenderQueue(loadedPdfDocument, i, true);
      }
      if (!editorPages[i].thumbnailRendered) {
        renderThumbnail(loadedPdfDocument, i);
      }
    });

    thumbnailContainer.appendChild(thumbItem);
    editorPages[i].thumbnail = thumbItem;
  }
}

/**
 * Lazy load thumbnails
 */
async function lazyLoadThumbnails(pdf) {
  const THUMB_BATCH_SIZE = 5;

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

    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Render thumbnail
 */
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

    await page.render({ canvasContext: ctx, viewport, intent: "display" })
      .promise;

    const thumbItem = pageData.thumbnail;
    if (thumbItem) {
      const thumbImageContainer = thumbItem.querySelector(".thumbnail-image");
      if (thumbImageContainer) {
        thumbImageContainer.innerHTML = "";
        thumbImageContainer.appendChild(thumbCanvas);
      }
    }

    pageData.thumbnailRendered = true;
  } catch (error) {
    console.error(`Error rendering thumbnail ${pageIndex}:`, error);
  }
}

/**
 * Add to render queue
 */
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

/**
 * Process render queue
 */
async function processRenderQueue() {
  if (isProcessingQueue || pageRenderQueue.length === 0) return;

  isProcessingQueue = true;

  while (pageRenderQueue.length > 0) {
    pageRenderQueue.sort((a, b) => {
      if (a.priority && !b.priority) return -1;
      if (!a.priority && b.priority) return 1;
      return 0;
    });

    const item = pageRenderQueue.shift();
    await renderPageFromQueue(item.pdf, item.pageIndex);

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  isProcessingQueue = false;
}

/**
 * Render page from queue
 */
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

    await page.render({ canvasContext: ctx, viewport, intent: "display" })
      .promise;

    pageData.canvas = canvas;
    pageData.rendered = true;

    if (pageIndex === currentPageIndex) {
      displayPageOnMainCanvas(pageIndex);
    }
  } catch (error) {
    console.error(`Error rendering page ${pageIndex}:`, error);
  }
}

/**
 * Display page on main canvas
 */
function displayPageOnMainCanvas(pageIndex) {
  const pageData = editorPages[pageIndex];
  if (!pageData) return;

  if (!pageData.canvas) {
    const ctx = mainCanvas.getContext("2d");
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);

    if (loadedPdfDocument) {
      addToRenderQueue(loadedPdfDocument, pageIndex, true);
    }
    return;
  }

  const ctx = mainCanvas.getContext("2d");
  const srcCanvas = pageData.canvas;

  const containerWidth = canvasContainer.clientWidth;
  const containerHeight = canvasContainer.clientHeight;
  const baseScale = Math.min(
    containerWidth / srcCanvas.width,
    containerHeight / srcCanvas.height,
    1
  );

  const displayWidth = srcCanvas.width * baseScale * zoomLevel;
  const displayHeight = srcCanvas.height * baseScale * zoomLevel;

  mainCanvas.width = displayWidth;
  mainCanvas.height = displayHeight;

  ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
  ctx.drawImage(srcCanvas, 0, 0, displayWidth, displayHeight);

  updateZoomDisplay();
  applyPanTransform();
  syncAnnotCanvasToMain();
  renderAnnotations();
}

/**
 * Update thumbnail selection
 */
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

/**
 * Zoom controls
 */
function handleZoomIn() {
  zoomLevel = Math.min(MAX_ZOOM, zoomLevel + ZOOM_STEP);
  displayPageOnMainCanvas(currentPageIndex);
}

function handleZoomOut() {
  zoomLevel = Math.max(MIN_ZOOM, zoomLevel - ZOOM_STEP);
  displayPageOnMainCanvas(currentPageIndex);
}

function handleResetZoom() {
  zoomLevel = 1.0;
  panX = 0;
  panY = 0;
  displayPageOnMainCanvas(currentPageIndex);
}

function updateZoomDisplay() {
  if (zoomDisplay) {
    zoomDisplay.textContent = `${Math.round(zoomLevel * 100)}%`;
  }
}

function applyPanTransform() {
  if (!mainCanvas) return;
  mainCanvas.style.transform = `translate(${panX}px, ${panY}px)`;
  if (annotCanvas) {
    annotCanvas.style.transform = `translate(${panX}px, ${panY}px)`;
  }
}

/**
 * Setup pan listeners
 */
function setupPanListeners() {
  mainCanvas?.addEventListener("mousedown", (e) => {
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
    if (isPanning) {
      isPanning = false;
      if (mainCanvas && zoomLevel > 1) {
        mainCanvas.style.cursor = "grab";
      }
    }
  });
}

/**
 * Setup annotation listeners
 */
function setupAnnotationListeners() {
  let annotMouseDown = false;
  let annotStartX = 0,
    annotStartY = 0;

  const getAnnotCoords = (e) => {
    const rect = annotCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (annotCanvas.width / rect.width);
    const y = (e.clientY - rect.top) * (annotCanvas.height / rect.height);
    return { x, y };
  };

  annotCanvas?.addEventListener("mousedown", (e) => {
    if (currentTool === "pointer" || textInputActive) return;

    const { x, y } = getAnnotCoords(e);

    if (currentTool === "text") {
      createTextInput(e.clientX, e.clientY);
      e.preventDefault();
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

  annotCanvas?.addEventListener("mousemove", (e) => {
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

  annotCanvas?.addEventListener("mouseup", (e) => {
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

  annotCanvas?.addEventListener("mouseleave", () => {
    if (annotMouseDown) {
      annotMouseDown = false;
      currentPath = [];
      tempAnnotation = null;
    }
  });
}

/**
 * Coordinate conversion
 */
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

/**
 * Sync annotation canvas
 */
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

/**
 * Render annotations
 */
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
      ctx.strokeRect(
        topLeft.x,
        topLeft.y,
        bottomRight.x - topLeft.x,
        bottomRight.y - topLeft.y
      );
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
      ctx.strokeRect(
        tempAnnotation.x,
        tempAnnotation.y,
        tempAnnotation.width,
        tempAnnotation.height
      );
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

function drawTempPath() {
  if (!annotCanvas || currentPath.length < 2) return;
  const ctx = annotCanvas.getContext("2d");
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(currentPath[0].x, currentPath[0].y);
  for (let i = 1; i < currentPath.length; i++) {
    ctx.lineTo(currentPath[i].x, currentPath[i].y);
  }
  ctx.stroke();
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

/**
 * Text input
 */
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
  textarea.style.cssText = `
    position: absolute;
    left: ${x}px;
    top: ${y}px;
    min-width: 200px;
    min-height: 40px;
    font-size: 16px;
    padding: 8px;
    border: 2px solid ${currentColor};
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.95);
    color: ${currentColor};
    outline: none;
    resize: both;
    z-index: 10000;
  `;

  canvasContainer.appendChild(textarea);
  setTimeout(() => textarea.focus(), 50);

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
      completeTextInput(false);
    } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      completeTextInput(true);
    }
  });

  let blurTimeout;
  textarea.addEventListener("blur", () => {
    if (blurTimeout) clearTimeout(blurTimeout);
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

/**
 * Undo/Redo
 */
function saveToUndoStack(pageIndex) {
  const page = editorPages[pageIndex];
  if (!page) return;
  page.undoStack.push(JSON.parse(JSON.stringify(page.annotations)));
  page.redoStack = [];
  if (page.undoStack.length > 50) {
    page.undoStack.shift();
  }
}

function handleUndo() {
  const page = editorPages[currentPageIndex];
  if (!page || page.undoStack.length === 0) return;
  page.redoStack.push(JSON.parse(JSON.stringify(page.annotations)));
  page.annotations = page.undoStack.pop();
  renderAnnotations();
}

function handleRedo() {
  const page = editorPages[currentPageIndex];
  if (!page || page.redoStack.length === 0) return;
  page.undoStack.push(JSON.parse(JSON.stringify(page.annotations)));
  page.annotations = page.redoStack.pop();
  renderAnnotations();
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (textInputActive) return;

    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
    } else if (
      (e.ctrlKey || e.metaKey) &&
      (e.key === "y" || (e.key === "z" && e.shiftKey))
    ) {
      e.preventDefault();
      handleRedo();
    }
  });
}

/**
 * Save PDF
 */
async function handleSavePdf() {
  showLoading("Preparing PDF...");

  try {
    // Wait for all pages to finish rendering
    updateLoadingProgress(10, "Waiting for pages...");
    while (pageRenderQueue.length > 0 || isProcessingQueue) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const hasAnnotations = editorPages.some(
      (page) => page.annotations && page.annotations.length > 0
    );

    // If no annotations, save original
    if (!hasAnnotations) {
      updateLoadingProgress(90, "Saving...");

      if (!window.originalPdfBytes || window.originalPdfBytes.length === 0) {
        throw new Error("Original PDF data is missing");
      }

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

      if (saveRes.success) {
        if (window.pdfUtils) {
          window.pdfUtils.showToast("PDF saved successfully", "success");
        }
      }

      hideLoading();
      return;
    }

    // Load original PDF
    updateLoadingProgress(20, "Loading PDF...");
    const originalPdf = await PDFLib.PDFDocument.load(window.originalPdfBytes);

    // Create new PDF with annotations
    updateLoadingProgress(30, "Creating new PDF...");
    const pdfDoc = await PDFLib.PDFDocument.create();

    // Copy all pages
    const copiedPages = await pdfDoc.copyPages(
      originalPdf,
      originalPdf.getPageIndices()
    );
    copiedPages.forEach((page) => pdfDoc.addPage(page));

    // Process annotated pages
    const pagesToProcess = editorPages
      .map((page, index) => ({ page, index }))
      .filter(({ page }) => page.annotations && page.annotations.length > 0);

    for (let i = 0; i < pagesToProcess.length; i++) {
      const { page: pageData, index: pageIndex } = pagesToProcess[i];

      const progress = Math.floor(30 + (i / pagesToProcess.length) * 50);
      updateLoadingProgress(
        progress,
        `Processing page ${i + 1}/${pagesToProcess.length}...`
      );

      if (!pageData.canvas) continue;

      // Create canvas for annotations only
      const annotCanvas = document.createElement("canvas");
      annotCanvas.width = pageData.canvas.width;
      annotCanvas.height = pageData.canvas.height;
      const annotCtx = annotCanvas.getContext("2d", {
        alpha: true,
        desynchronized: true,
      });

      // Draw annotations
      for (const annot of pageData.annotations) {
        if (annot.type === "rectangle") {
          annotCtx.strokeStyle = annot.color;
          annotCtx.lineWidth = 3;
          annotCtx.strokeRect(annot.x, annot.y, annot.width, annot.height);
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

      // Convert to PNG
      const dataUrl = annotCanvas.toDataURL("image/png");
      const bin = atob(dataUrl.split(",")[1]);
      const arr = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);

      // Embed annotation image
      const annotImg = await pdfDoc.embedPng(arr);

      // Get page and overlay annotations
      const pdfPage = pdfDoc.getPage(pageIndex);
      const { width, height } = pdfPage.getSize();

      pdfPage.drawImage(annotImg, {
        x: 0,
        y: 0,
        width: width,
        height: height,
        opacity: 1,
      });

      // Cleanup
      annotCanvas.width = 0;
      annotCanvas.height = 0;

      if (i % 3 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    // Save PDF
    updateLoadingProgress(85, "Generating final PDF...");
    const bytes = await pdfDoc.save({
      useObjectStreams: false,
      addDefaultPage: false,
    });
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

    // Convert to base64
    updateLoadingProgress(90, "Preparing to save...");
    const blob = new Blob([u8], { type: "application/pdf" });
    const base64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(blob);
    });

    updateLoadingProgress(95, "Saving to disk...");
    const saveRes = await window.electronAPI.saveBytesBase64(
      "edited.pdf",
      base64
    );

    if (saveRes.success) {
      if (window.pdfUtils) {
        window.pdfUtils.showToast("PDF saved successfully", "success");
      }
    }
  } catch (error) {
    console.error("Error saving PDF:", error);
    if (window.pdfUtils) {
      window.pdfUtils.showToast("Failed to save PDF", "error");
    }
  } finally {
    hideLoading();
  }
}

/**
 * Update tool UI
 */
function updateToolUI() {
  const toolButtons = container.querySelectorAll("[data-tool]");
  toolButtons.forEach((btn) => {
    if (btn.dataset.tool === currentTool) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

/**
 * Update color UI
 */
function updateColorUI() {
  const colorButtons = container.querySelectorAll("[data-color]");
  colorButtons.forEach((btn) => {
    if (btn.dataset.color === currentColor) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

/**
 * Stage management
 */
function showUploadStage() {
  uploadStage?.classList.add("active");
  editorStage?.classList.remove("active");
}

function showEditorStage() {
  uploadStage?.classList.remove("active");
  editorStage?.classList.add("active");
}

/**
 * Loading overlay
 */
function showLoading(message = "Processing...") {
  if (loadingOverlay) {
    if (loadingMessage) loadingMessage.textContent = message;
    if (loadingProgress) loadingProgress.textContent = "0%";
    loadingOverlay.style.display = "flex";
  }
}

function hideLoading() {
  if (loadingOverlay) {
    loadingOverlay.style.display = "none";
  }
}

function updateLoadingProgress(percent, message) {
  if (loadingProgress) loadingProgress.textContent = `${percent}%`;
  if (loadingMessage && message) loadingMessage.textContent = message;
}

/**
 * Apply language
 */
function applyLanguage() {
  const texts = {
    ja: {
      uploadTitle: "PDFと画像をアップロード",
      uploadSubtitle: "マージして編集するファイルを選択",
      dropText: "ファイルをドラッグ&ドロップ",
      browse: "ファイルを選択",
      fileTypes: "サポート: PDF, PNG, JPG, JPEG",
      clearAll: "全削除",
      continue: "エディタに進む",
      backToFiles: "← ファイルに戻る",
      savePdf: "PDFを保存",
      back: "戻る",
    },
    en: {
      uploadTitle: "Upload PDFs & Images",
      uploadSubtitle: "Select files to merge and edit",
      dropText: "Drag & drop files here",
      browse: "Browse Files",
      fileTypes: "Supports: PDF, PNG, JPG, JPEG",
      clearAll: "Clear All",
      continue: "Continue to Editor",
      backToFiles: "← Back to Files",
      savePdf: "Save PDF",
      back: "Back",
    },
  };

  const t = texts[currentLang] || texts.en;

  const uploadTitle = container.querySelector("#uploadTitle");
  const uploadSubtitle = container.querySelector("#uploadSubtitle");
  const dropText = container.querySelector("#dropText");
  const browseBtn = container.querySelector("#browseBtn");
  const fileTypesEl = container.querySelector(".file-types");
  const clearFiles = container.querySelector("#clearFiles");
  const proceedBtn = container.querySelector("#proceedBtn");
  const backToUpload = container.querySelector("#backToUpload");
  const savePdf = container.querySelector("#savePdf");
  const backToHome = container.querySelector("#backToHome span");

  if (uploadTitle) uploadTitle.textContent = t.uploadTitle;
  if (uploadSubtitle) uploadSubtitle.textContent = t.uploadSubtitle;
  if (dropText) dropText.textContent = t.dropText;
  if (browseBtn) browseBtn.textContent = t.browse;
  if (fileTypesEl) fileTypesEl.textContent = t.fileTypes;
  if (clearFiles) clearFiles.textContent = t.clearAll;
  if (proceedBtn) proceedBtn.textContent = t.continue;
  if (backToUpload) backToUpload.textContent = t.backToFiles;
  if (savePdf) savePdf.textContent = t.savePdf;
  if (backToHome) backToHome.textContent = t.back;
}

/**
 * Utility functions
 */
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function generateId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

/**
 * Cleanup editor
 */
function cleanupEditor() {
  editorPages = [];
  currentPageIndex = 0;
  pageRenderQueue = [];
  isProcessingQueue = false;
  loadedPdfDocument = null;
  window.originalPdfBytes = null;
  zoomLevel = 1.0;
  panX = 0;
  panY = 0;
  currentTool = "pointer";

  if (thumbnailContainer) thumbnailContainer.innerHTML = "";
  if (mainCanvas) {
    const ctx = mainCanvas.getContext("2d");
    ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
  }
  if (annotCanvas) {
    const ctx = annotCanvas.getContext("2d");
    ctx.clearRect(0, 0, annotCanvas.width, annotCanvas.height);
  }

  if (textInputElement) {
    textInputElement.remove();
    textInputElement = null;
    textInputActive = false;
  }
}

/**
 * Cleanup feature
 */
export async function cleanup() {
  console.log("🧹 PDF Merge & Edit: Cleaning up...");

  // Clear files
  files.forEach((f) => {
    try {
      if (f.thumbUrl) URL.revokeObjectURL(f.thumbUrl);
    } catch (error) {}
  });

  files = [];

  // Cleanup editor
  cleanupEditor();

  console.log("✅ PDF Merge & Edit: Cleaned up");
}

export default { init, cleanup };
