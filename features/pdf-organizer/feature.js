// features/pdf-organizer/feature.js
// PDF Page Organizer Feature

import * as utils from "../../core/utils.js";
import eventBus from "../../core/event-bus.js";

// Load pdf.js
const pdfjsLib =
  window.pdfjsLib || (await import(`file://${window.libs.pdfjsDistPath}`));
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${window.libs.pdfjsWorkerPath}`;
}
let insertPosition = null;
// Feature state
const state = {
  container: null,
  currentLang: "ja",
  currentStep: "upload",
  pages: [],
  pdfBytes: null,
  pdfDoc: null,
  totalPages: 0,
  draggedElement: null,
  draggedIndex: null,
  dragOffsetX: 0,
  dragOffsetY: 0,
  draggedElementHeight: 0,
};

/**
 * Initialize the PDF Organizer feature
 */
export async function init(container, params = {}) {
  console.log("ðŸš€ Initializing PDF Organizer feature", params);

  state.container = container;
  state.currentLang = params.lang || "ja";

  setupEventListeners();

  // âœ… Apply language after short delay to ensure DOM is ready
  setTimeout(() => {
    applyLanguage();
  }, 50);

  // Listen for language changes
  eventBus.on(
    "language-changed",
    (lang) => {
      state.currentLang = lang;
      applyLanguage();
    },
    "pdf-organizer"
  );

  return state;
}

/**
 * Cleanup when feature is deactivated
 */
export async function cleanup(instance) {
  console.log("🧹 Cleaning up PDF Organizer feature");
  eventBus.off("language-changed");

  // ✅ Cleanup Intersection Observer
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  // ✅ Clear render queue
  renderQueue = [];
  isRendering = false;

  // ✅ NEW: Stop auto-scroll
  stopAutoScroll();

  // Clear state
  state.pages = [];
  state.pdfDoc = null;
  state.pdfBytes = null;
}
// Move BEFORE setupEventListeners() function

/**
 * Hide insert modal
 */
function hideInsertModal() {
  const modal = state.container.querySelector("#insertModal");
  if (modal) {
    modal.style.display = "none";
  }
}

/**
 * Insert pages at specific position
 */

function insertPageAt(pageId, side) {
  const index = state.pages.findIndex((p) => p.id === pageId);
  if (index === -1) return;

  // ✅ Store position for insert (left = before, right = after)
  insertPosition = side === "left" ? index : index + 1;

  // ✅ Show modal instead of directly opening file input
  const modal = state.container.querySelector("#insertModal");
  if (modal) {
    modal.style.display = "flex";
  }
}

/**
 * Hide insert modal
 */
async function insertBlankPage() {
  if (insertPosition === null) return;

  // ✅ Store position before async operations
  const targetPosition = insertPosition;

  const loading = utils.createLoadingOverlay(
    state.currentLang === "ja"
      ? "白紙ページを挿入中..."
      : "Inserting blank page..."
  );
  loading.show();

  try {
    // Create a blank white canvas (A4 proportions)
    const canvas = document.createElement("canvas");
    canvas.width = 595; // A4 width at 72 DPI
    canvas.height = 842; // A4 height at 72 DPI

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add thin border for visibility
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

    const newPage = {
      id: `page-${Date.now()}-${Math.random()}`,
      originalPageNumber: 0,
      currentIndex: targetPosition,
      rendered: true,
      canvas: canvas,
      isBlank: true,
      isImage: false,
    };

    // ✅ Insert the single blank page at the stored position
    state.pages.splice(targetPosition, 0, newPage); // ✅ FIXED: Use newPage instead

    // ✅ Update currentIndex for all pages after insertion
    state.pages.forEach((page, idx) => {
      page.currentIndex = idx;
    });

    state.totalPages = state.pages.length;
    updateFileInfo();

    // ✅ Hide modal first
    hideInsertModal();

    await insertPageCardAt(newPage, targetPosition);

    loading.hide();

    utils.showToast(
      state.currentLang === "ja"
        ? "白紙ページを挿入しました"
        : "Blank page inserted",
      "success"
    );
  } catch (error) {
    console.error("Failed to insert blank page:", error);
    loading.hide();
    hideInsertModal();
    utils.showToast(
      state.currentLang === "ja"
        ? "白紙ページの挿入に失敗しました"
        : "Failed to insert blank page",
      "error"
    );
  }

  insertPosition = null;
}

/**
 * Handle inserting files at specific position
 */
async function handleInsertFiles(e) {
  const files = Array.from(e.target.files || []);
  if (files.length === 0 || insertPosition === null) {
    console.warn("No files selected or invalid insert position");
    return;
  }

  // ✅ Store insert position before starting async operations
  const targetPosition = insertPosition;

  const loading = utils.createLoadingOverlay(
    state.currentLang === "ja" ? "ファイルを挿入中..." : "Inserting files..."
  );
  loading.show();

  try {
    const newPages = [];

    for (const file of files) {
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith(".pdf")) {
        const validation = utils.validatePdfFile(file);
        if (!validation.valid) {
          console.warn(`Skipping invalid PDF: ${file.name}`);
          continue;
        }

        // ✅ FIX: Create separate copies for storage and PDF.js
        const originalBytes = await utils.readFileAsArrayBuffer(file);
        const storedBytes = originalBytes.slice(0);
        const pdfJsBytes = originalBytes.slice(0);

        const loadingTask = pdfjsLib.getDocument({
          data: pdfJsBytes,
          verbosity: 0,
        });
        const pdfDoc = await loadingTask.promise;

        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const scale = 0.3; // ✅ Low-res for faster insertion
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          const ctx = canvas.getContext("2d", {
            alpha: false,
            willReadFrequently: false,
          });

          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({ canvasContext: ctx, viewport }).promise;

          newPages.push({
            id: `page-${Date.now()}-${Math.random()}`,
            originalPageNumber: 0,
            currentIndex: 0,
            rendered: true,
            canvas: canvas,
            fromFile: file.name,
            pdfBytes: storedBytes, // ✅ Use protected copy
            pageNumberInSource: i,
          });
        }
      } else if (
        fileName.endsWith(".png") ||
        fileName.endsWith(".jpg") ||
        fileName.endsWith(".jpeg")
      ) {
        const img = await createImageBitmap(file);
        const canvas = document.createElement("canvas");

        const scale = 0.5;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        newPages.push({
          id: `page-${Date.now()}-${Math.random()}`,
          originalPageNumber: 0,
          currentIndex: 0,
          rendered: true,
          canvas: canvas,
          fromFile: file.name,
          isImage: true,
        });
      }
    }

    if (newPages.length === 0) {
      loading.hide();
      hideInsertModal();
      utils.showToast(
        state.currentLang === "ja"
          ? "有効なファイルがありません"
          : "No valid files to insert",
        "warning"
      );
      insertPosition = null;
      e.target.value = "";
      return;
    }
    // ✅ Insert new pages at the stored position
    state.pages.splice(targetPosition, 0, ...newPages); // ✅ FIXED: Use newPages array

    // ✅ Update currentIndex for all pages after insertion
    state.pages.forEach((page, idx) => {
      page.currentIndex = idx;
    });

    state.totalPages = state.pages.length;
    updateFileInfo();

    // ✅ Hide modal BEFORE re-rendering to avoid flicker
    hideInsertModal();

    // ✅ Re-render all pages
    await renderAllPages();

    loading.hide();

    utils.showToast(
      state.currentLang === "ja"
        ? `${newPages.length}ページを挿入しました`
        : `Inserted ${newPages.length} pages`,
      "success"
    );
  } catch (error) {
    console.error("Failed to insert files:", error);
    loading.hide();
    hideInsertModal();
    utils.showToast(
      state.currentLang === "ja"
        ? "ファイルの挿入に失敗しました"
        : "Failed to insert files",
      "error"
    );
  }

  // ✅ Reset at the end
  insertPosition = null;
  e.target.value = "";
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Back buttons
  const backToMain = state.container.querySelector("#backToMain");
  const backToUpload = state.container.querySelector("#backToUpload");

  backToMain?.addEventListener("click", goBackToMain);
  backToUpload?.addEventListener("click", () => showStep("upload"));

  // File upload
  const uploadArea = state.container.querySelector("#uploadArea");
  const pdfFileInput = state.container.querySelector("#pdfFileInput");
  const browseBtn = state.container.querySelector("#browseBtn");
  const removeFile = state.container.querySelector("#removeFile");

  uploadArea?.addEventListener("click", () => pdfFileInput?.click());
  browseBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    pdfFileInput?.click();
  });
  pdfFileInput?.addEventListener("change", handleFileSelect);
  removeFile?.addEventListener("click", (e) => {
    e.stopPropagation();
    clearFile();
  });

  // Drag & drop
  uploadArea?.addEventListener("dragover", handleDragOver);
  uploadArea?.addEventListener("dragleave", handleDragLeave);
  uploadArea?.addEventListener("drop", handleDrop);

  // Load PDF button
  const loadPdfBtn = state.container.querySelector("#loadPdfBtn");
  loadPdfBtn?.addEventListener("click", loadPdfForOrganizing);

  // Sort buttons
  const sortAscBtn = state.container.querySelector("#sortAscBtn");
  const sortDescBtn = state.container.querySelector("#sortDescBtn");
  const resetOrderBtn = state.container.querySelector("#resetOrderBtn");

  sortAscBtn?.addEventListener("click", () => sortPages("asc"));
  sortDescBtn?.addEventListener("click", () => sortPages("desc"));
  resetOrderBtn?.addEventListener("click", () => resetPageOrder());

  // Action buttons
  const addMoreBtn = state.container.querySelector("#addMoreBtn");
  const clearAllBtn = state.container.querySelector("#clearAllBtn");
  const savePdfBtn = state.container.querySelector("#savePdfBtn");

  addMoreBtn?.addEventListener("click", addMoreFiles);
  clearAllBtn?.addEventListener("click", clearAllPages);
  savePdfBtn?.addEventListener("click", savePdf);

  // Add more files input
  const addMoreFileInput = state.container.querySelector("#addMoreFileInput");
  addMoreFileInput?.addEventListener("change", handleAddMoreFiles);
  // ✅ Insert files input
  const insertFileInput = state.container.querySelector("#insertFileInput");
  insertFileInput?.addEventListener("change", handleInsertFiles);

  // ✅ Insert modal buttons
  const insertFileBtn = state.container.querySelector("#insertFileBtn");
  const insertBlankBtn = state.container.querySelector("#insertBlankBtn");
  const cancelInsertBtn = state.container.querySelector("#cancelInsertBtn");

  insertFileBtn?.addEventListener("click", () => {
    hideInsertModal();
    insertFileInput?.click();
  });

  insertBlankBtn?.addEventListener("click", () => {
    insertBlankPage();
  });

  cancelInsertBtn?.addEventListener("click", () => {
    hideInsertModal();
  });

  // ✅ Close modal on backdrop click
  const insertModal = state.container.querySelector("#insertModal");
  insertModal?.addEventListener("click", (e) => {
    if (e.target === insertModal) {
      hideInsertModal();
    }
  });

  // ✅ IMPROVED: Setup auto-scroll with continuous tracking
  const pagesArea = state.container.querySelector(".pages-area");

  if (pagesArea) {
    // Continuously track mouse position during drag
    pagesArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (state.draggedElement) {
        startAutoScroll(e.clientX, e.clientY); // Pass both coordinates
      }
    });

    pagesArea.addEventListener("dragleave", (e) => {
      // Only stop if leaving the pages-area entirely
      if (e.target === pagesArea) {
        stopAutoScroll();
      }
    });

    pagesArea.addEventListener("drop", () => {
      stopAutoScroll();
    });

    pagesArea.addEventListener("dragend", () => {
      stopAutoScroll();
    });
  }
}

/**
 * Go back to main application
 */
function goBackToMain() {
  if (window.featureManager) {
    window.featureManager.deactivateAll();
  }
}

/**
 * Show specific step
 */
function showStep(step) {
  state.currentStep = step;

  const steps = state.container.querySelectorAll(".organizer-step");
  steps.forEach((s) => s.classList.remove("active"));

  const targetStep = state.container.querySelector(`#${step}Step`);
  if (targetStep) {
    targetStep.classList.add("active");
  }
}

/**
 * Handle file selection
 */
async function handleFileSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  await processFile(file);
}

/**
 * Handle drag over
 */
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  const uploadArea = state.container.querySelector("#uploadArea");
  uploadArea?.classList.add("drag-over");
}

/**
 * Handle drag leave
 */
function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  const uploadArea = state.container.querySelector("#uploadArea");
  uploadArea?.classList.remove("drag-over");
}

/**
 * Handle file drop
 */
async function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  const uploadArea = state.container.querySelector("#uploadArea");
  uploadArea?.classList.remove("drag-over");

  const file = e.dataTransfer?.files?.[0];
  if (!file) return;

  await processFile(file);
}

/**
 * Process selected file
 */
async function processFile(file) {
  const validation = utils.validatePdfFile(file);
  if (!validation.valid) {
    utils.showToast(validation.error, "error");
    return;
  }

  // Show file info
  const fileInfo = state.container.querySelector("#fileInfo");
  const fileName = state.container.querySelector("#fileName");
  const fileSize = state.container.querySelector("#fileSize");
  const loadPdfBtn = state.container.querySelector("#loadPdfBtn");

  if (fileName) fileName.textContent = file.name;
  if (fileSize) fileSize.textContent = utils.formatFileSize(file.size);
  if (fileInfo) fileInfo.style.display = "block";
  if (loadPdfBtn) loadPdfBtn.style.display = "flex";

  // ✅ Store file temporarily - create a COPY to prevent detachment
  const arrayBuffer = await utils.readFileAsArrayBuffer(file);
  state.pdfBytes = arrayBuffer.slice(0); // Creates a new ArrayBuffer copy

  utils.showToast(
    state.currentLang === "ja" ? "ファイルが選択されました" : "File selected",
    "success"
  );
}

/**
 * Clear selected file
 */
function clearFile() {
  state.pdfBytes = null;
  state.pdfDoc = null;
  state.totalPages = 0;

  const fileInfo = state.container.querySelector("#fileInfo");
  const loadPdfBtn = state.container.querySelector("#loadPdfBtn");
  const pdfFileInput = state.container.querySelector("#pdfFileInput");

  if (fileInfo) fileInfo.style.display = "none";
  if (loadPdfBtn) loadPdfBtn.style.display = "none";
  if (pdfFileInput) pdfFileInput.value = "";
}

/**
 * Load PDF for organizing
 */
async function loadPdfForOrganizing() {
  if (!state.pdfBytes) return;

  const loading = utils.createLoadingOverlay(
    state.currentLang === "ja" ? "PDFを読み込み中..." : "Loading PDF..."
  );
  loading.show();

  try {
    // ✅ Create a fresh copy for PDF.js
    const pdfBytesCopy = state.pdfBytes.slice(0);

    const loadingTask = pdfjsLib.getDocument({
      data: pdfBytesCopy,
      verbosity: 0,
    });

    state.pdfDoc = await loadingTask.promise;
    state.totalPages = state.pdfDoc.numPages;

    loading.updateMessage?.(
      state.currentLang === "ja" ? `ページを準備中...` : `Preparing pages...`
    );

    // Initialize pages array
    state.pages = [];
    for (let i = 1; i <= state.totalPages; i++) {
      state.pages.push({
        id: `page-${Date.now()}-${i}-${Math.random()}`,
        originalPageNumber: i,
        currentIndex: i - 1,
        rendered: false,
        canvas: null,
      });
    }

    updateFileInfo();
    showStep("organize");

    // ✅ Render ALL pages with progress tracking
    await renderAllPagesWithProgress(loading);

    loading.hide();

    utils.showToast(
      state.currentLang === "ja"
        ? `PDF読み込み完了 (${state.totalPages}ページ)`
        : `PDF loaded successfully (${state.totalPages} pages)`,
      "success"
    );
  } catch (error) {
    console.error("Failed to load PDF:", error);
    loading.hide();
    utils.showToast(
      state.currentLang === "ja"
        ? "PDFの読み込みに失敗しました"
        : "Failed to load PDF",
      "error"
    );
  }
}
/**
 * Render all pages with progress tracking
 */
async function renderAllPagesWithProgress(loading) {
  const pagesGrid = state.container.querySelector("#pagesGrid");
  if (!pagesGrid) return;

  pagesGrid.innerHTML = "";

  // ✅ NEW: Create placeholder cards instantly (no rendering)
  loading.updateMessage?.(
    state.currentLang === "ja" ? "ページを準備中..." : "Preparing pages..."
  );

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < state.pages.length; i++) {
    const pageData = state.pages[i];
    const pageCard = createPlaceholderPageCard(pageData, i);
    fragment.appendChild(pageCard);
  }

  pagesGrid.appendChild(fragment);

  // ✅ Hide loading immediately - show UI with placeholders
  loading.hide();

  // ✅ NEW: Start progressive rendering in background
  startProgressiveRendering();
}

// ✅ NEW: Create instant placeholder cards
function createPlaceholderPageCard(pageData, index) {
  const pageCard = document.createElement("div");
  pageCard.className = "page-card";
  pageCard.draggable = true;
  pageCard.dataset.pageId = pageData.id;
  pageCard.dataset.pageIndex = index;

  const thumbnail = document.createElement("div");
  thumbnail.className = "page-thumbnail loading";
  thumbnail.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #94a3b8;">
      <div style="font-size: 32px; margin-bottom: 8px;">📄</div>
      <div style="font-size: 11px;">Loading...</div>
    </div>
  `;

  const removeBtn = document.createElement("button");
  removeBtn.className = "page-remove";
  removeBtn.innerHTML = "×";
  removeBtn.onclick = (e) => {
    e.stopPropagation();
    removePage(pageData.id);
  };

  const pageInfo = document.createElement("div");
  pageInfo.className = "page-info";

  const pageNumber = document.createElement("div");
  pageNumber.className = "page-number";
  const badge = document.createElement("span");
  badge.className = "page-badge";
  const currentPosition = index + 1;

  if (pageData.isBlank) {
    badge.textContent = state.currentLang === "ja" ? "白紙" : "BLANK";
    badge.style.background = "#6b7280";
  } else if (pageData.isImage) {
    badge.textContent = "IMG";
    badge.style.background = "#8b5cf6";
  } else {
    badge.textContent = pageData.originalPageNumber || currentPosition;
  }
  pageNumber.appendChild(badge);
  pageInfo.appendChild(pageNumber);

  const insertLeftBtn = document.createElement("button");
  insertLeftBtn.className = "insert-btn-left";
  insertLeftBtn.innerHTML = "+";
  insertLeftBtn.title =
    state.currentLang === "ja" ? "この前に挿入" : "Insert Before";
  insertLeftBtn.onclick = (e) => {
    e.stopPropagation();
    insertPageAt(pageData.id, "left");
  };

  const insertRightBtn = document.createElement("button");
  insertRightBtn.className = "insert-btn-right";
  insertRightBtn.innerHTML = "+";
  insertRightBtn.title =
    state.currentLang === "ja" ? "この後に挿入" : "Insert After";
  insertRightBtn.onclick = (e) => {
    e.stopPropagation();
    insertPageAt(pageData.id, "right");
  };

  pageCard.appendChild(thumbnail);
  pageCard.appendChild(removeBtn);
  pageCard.appendChild(pageInfo);
  pageCard.appendChild(insertLeftBtn);
  pageCard.appendChild(insertRightBtn);

  setupPageDragEvents(pageCard, pageData);

  return pageCard;
}

// ✅ NEW: Progressive rendering with Intersection Observer
let renderQueue = [];
let isRendering = false;
let observer = null;

function startProgressiveRendering() {
  const pagesGrid = state.container.querySelector("#pagesGrid");
  if (!pagesGrid) return;

  // ✅ Setup Intersection Observer for visible cards only
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageIndex = parseInt(entry.target.dataset.pageIndex);
            if (!isNaN(pageIndex) && !state.pages[pageIndex].rendered) {
              queuePageForRendering(pageIndex);
            }
          }
        });
      },
      {
        root: pagesGrid.parentElement,
        rootMargin: "200px", // Render 200px before visible
        threshold: 0.01,
      }
    );
  }

  // ✅ Observe all page cards
  const pageCards = pagesGrid.querySelectorAll(".page-card");
  pageCards.forEach((card) => observer.observe(card));

  // ✅ Force render first 10 pages immediately
  for (let i = 0; i < Math.min(10, state.pages.length); i++) {
    queuePageForRendering(i);
  }

  processRenderQueue();
}

function queuePageForRendering(pageIndex) {
  if (!renderQueue.includes(pageIndex) && !state.pages[pageIndex].rendered) {
    renderQueue.push(pageIndex);
    processRenderQueue();
  }
}

async function processRenderQueue() {
  if (isRendering || renderQueue.length === 0) return;

  isRendering = true;

  while (renderQueue.length > 0) {
    const pageIndex = renderQueue.shift();
    await renderSinglePage(pageIndex);

    // Breathe every 3 pages
    if (renderQueue.length % 3 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  isRendering = false;
}

async function renderSinglePage(pageIndex) {
  const pageData = state.pages[pageIndex];
  if (!pageData || pageData.rendered) return;

  try {
    const pagesGrid = state.container.querySelector("#pagesGrid");
    const pageCard = pagesGrid?.querySelector(
      `[data-page-index="${pageIndex}"]`
    );
    if (!pageCard) return;

    const thumbnail = pageCard.querySelector(".page-thumbnail");

    // ✅ Render at LOW resolution for thumbnail (scale 0.3)
    if (!state.pdfDoc || !pageData.originalPageNumber) return;

    const page = await state.pdfDoc.getPage(pageData.originalPageNumber);
    const scale = 0.3; // Much lower resolution for thumbnails
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: false,
    });

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise;

    // ✅ Store canvas and mark as rendered
    pageData.canvas = canvas;
    pageData.rendered = true;

    // ✅ Update thumbnail with actual canvas
    thumbnail.className = "page-thumbnail";
    thumbnail.innerHTML = "";
    thumbnail.appendChild(canvas);
  } catch (error) {
    console.error(`Failed to render page ${pageIndex}:`, error);
  }
}
/**
 * Update file info display
 */
function updateFileInfo() {
  const totalPages = state.container.querySelector("#totalPages");
  const fileInfoSize = state.container.querySelector("#fileInfoSize");

  if (totalPages) totalPages.textContent = state.totalPages;
  if (fileInfoSize)
    fileInfoSize.textContent = utils.formatFileSize(state.pdfBytes.byteLength);
}

/**
 * Render all pages
 */
/**
 * Render all pages (FULL RE-RENDER - use sparingly)
 */
async function renderAllPages() {
  const pagesGrid = state.container.querySelector("#pagesGrid");
  if (!pagesGrid) return;

  const scrollTop = pagesGrid.parentElement?.scrollTop || 0;

  // Clear grid
  pagesGrid.innerHTML = "";

  // ✅ Render canvases for pages that need it
  for (const pageData of state.pages) {
    if (
      !pageData.rendered &&
      !pageData.isBlank &&
      !pageData.isImage &&
      pageData.originalPageNumber > 0
    ) {
      try {
        const page = await state.pdfDoc.getPage(pageData.originalPageNumber);

        // ✅ Use scale 1.0 for better quality
        const scale = 1.0;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext("2d", {
          alpha: false,
          willReadFrequently: false,
        });

        // ✅ White background
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: ctx,
          viewport: viewport,
        }).promise;

        // ✅ Store data URL to prevent GC issues
        pageData.canvasDataUrl = canvas.toDataURL("image/jpeg", 0.8);
        pageData.canvas = canvas;
        pageData.rendered = true;
      } catch (error) {
        console.error(
          `Failed to render page ${pageData.originalPageNumber}:`,
          error
        );
      }
    }
  }

  // ✅ Create all page cards in a document fragment
  const fragment = document.createDocumentFragment();

  for (const pageData of state.pages) {
    const pageCard = createPageCard(pageData);
    if (pageCard) {
      fragment.appendChild(pageCard);
    }
  }

  pagesGrid.appendChild(fragment);

  // Restore scroll position
  if (pagesGrid.parentElement) {
    pagesGrid.parentElement.scrollTop = scrollTop;
  }
}

/**
 * Insert a single page card into the DOM at the correct position
 */
async function insertPageCardAt(pageData, position) {
  const pagesGrid = state.container.querySelector("#pagesGrid");
  if (!pagesGrid) return;

  const pageElement = await renderPage(pageData);
  if (!pageElement) return;

  // Insert at specific position
  const existingCards = pagesGrid.querySelectorAll(".page-card");
  if (position >= existingCards.length) {
    pagesGrid.appendChild(pageElement);
  } else {
    pagesGrid.insertBefore(pageElement, existingCards[position]);
  }
}

/**
 * Remove a page card from the DOM
 */
function removePageCardFromDOM(pageId) {
  const pagesGrid = state.container.querySelector("#pagesGrid");
  if (!pagesGrid) return;

  const pageCard = pagesGrid.querySelector(`[data-page-id="${pageId}"]`);
  if (pageCard) {
    pageCard.remove();
  }
}
/**
 * Render single page
 */
async function renderPage(pageData) {
  try {
    // ✅ Check if this is an image page (already has canvas)
    if (pageData.isImage && pageData.canvas) {
      pageData.rendered = true;
      return createPageCard(pageData);
    }

    // ✅ Skip if no valid PDF document or page number
    if (!state.pdfDoc || !pageData.originalPageNumber) {
      if (pageData.canvas) {
        pageData.rendered = true;
        return createPageCard(pageData);
      }
      return null;
    }

    const page = await state.pdfDoc.getPage(pageData.originalPageNumber);
    const scale = 0.5;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    pageData.canvas = canvas;
    pageData.rendered = true;

    return createPageCard(pageData);
  } catch (error) {
    console.error(
      `Failed to render page ${pageData.originalPageNumber}:`,
      error
    );
    return null;
  }
}

/**
 * Create page card element
 */
function createPageCard(pageData) {
  try {
    // ✅ DEBUG: Log canvas state
    console.log(`Creating card for page ${pageData.id}:`, {
      hasCanvas: !!pageData.canvas,
      canvasWidth: pageData.canvas?.width,
      canvasHeight: pageData.canvas?.height,
      rendered: pageData.rendered,
    });

    // ✅ Check if canvas exists
    if (!pageData.canvas) {
      console.warn(`No canvas for page ${pageData.id}`);
      return null;
    }

    // Create page card
    const pageCard = document.createElement("div");
    pageCard.className = "page-card";
    pageCard.draggable = true;
    pageCard.dataset.pageId = pageData.id;

    const thumbnail = document.createElement("div");
    thumbnail.className = "page-thumbnail";

    // ✅ CRITICAL: Use data URL if available (prevents black canvas issues)
    if (pageData.canvasDataUrl) {
      const img = document.createElement("img");
      img.src = pageData.canvasDataUrl;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "contain";
      thumbnail.appendChild(img);
    } else if (pageData.canvas) {
      thumbnail.appendChild(pageData.canvas);
    } else {
      // Fallback: show loading indicator
      thumbnail.innerHTML =
        '<div style="color: #94a3b8; font-size: 32px;">📄</div>';
    }

    // ✅ Remove button at top right (outside pageInfo)
    const removeBtn = document.createElement("button");
    removeBtn.className = "page-remove";
    removeBtn.innerHTML = "×";
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      removePage(pageData.id);
    };

    // ✅ Page info centered at bottom
    const pageInfo = document.createElement("div");
    pageInfo.className = "page-info";

    const pageNumber = document.createElement("div");
    pageNumber.className = "page-number";
    const badge = document.createElement("span");
    badge.className = "page-badge";
    const currentPosition =
      state.pages.findIndex((p) => p.id === pageData.id) + 1;

    // ✅ Show appropriate label based on page type
    if (pageData.isBlank) {
      badge.textContent = state.currentLang === "ja" ? "白紙" : "BLANK";
      badge.style.background = "#6b7280";
    } else if (pageData.isImage) {
      badge.textContent = "IMG";
      badge.style.background = "#8b5cf6";
    } else if (pageData.originalPageNumber === 0) {
      // ✅ For inserted PDF pages, show current position
      badge.textContent = currentPosition;
    } else {
      badge.textContent = pageData.originalPageNumber;
    }
    pageNumber.appendChild(badge);

    pageInfo.appendChild(pageNumber);
    // âœ… Create insert buttons
    const insertLeftBtn = document.createElement("button");
    insertLeftBtn.className = "insert-btn-left";
    insertLeftBtn.innerHTML = "+";
    insertLeftBtn.title =
      state.currentLang === "ja" ? "この前に挿入" : "Insert Before";
    insertLeftBtn.onclick = (e) => {
      e.stopPropagation();
      insertPageAt(pageData.id, "left");
    };

    const insertRightBtn = document.createElement("button");
    insertRightBtn.className = "insert-btn-right";
    insertRightBtn.innerHTML = "+";
    insertRightBtn.title =
      state.currentLang === "ja" ? "この後に挿入" : "Insert After";
    insertRightBtn.onclick = (e) => {
      e.stopPropagation();
      insertPageAt(pageData.id, "right");
    };

    pageCard.appendChild(thumbnail);
    pageCard.appendChild(removeBtn); // ✅ Now positioned absolutely
    pageCard.appendChild(pageInfo); // ✅ Now centered at bottom
    pageCard.appendChild(insertLeftBtn);
    pageCard.appendChild(insertRightBtn);

    // Setup drag events
    setupPageDragEvents(pageCard, pageData);

    return pageCard;
  } catch (error) {
    console.error(`Failed to create page card:`, error);
    return null;
  }
}

/**
 * Remove a page from the organizer
 */
function removePage(pageId) {
  const index = state.pages.findIndex((p) => p.id === pageId);
  if (index === -1) return;

  removePageCardFromDOM(pageId);
  state.pages.splice(index, 1);
  state.pages.forEach((page, idx) => {
    page.currentIndex = idx;
  });

  state.totalPages = state.pages.length;
  updateFileInfo();

  utils.showToast(
    state.currentLang == "ja" ? "ページを削除しました" : "Page removed",
    "success"
  );
}

/**
 * Setup drag and drop events for page card
 */
/**
 * Setup drag and drop events for page card
 */
function setupPageDragEvents(pageCard, pageData) {
  pageCard.addEventListener("dragstart", (e) => {
    pageCard.classList.add("dragging");
    state.draggedElement = pageCard;
    state.draggedIndex = state.pages.findIndex((p) => p.id === pageData.id);

    // ✅ Disable smooth scrolling during drag for manual control
    const pagesArea = state.container.querySelector(".pages-area");
    if (pagesArea) {
      pagesArea.style.scrollBehavior = "auto";
    }
    e.dataTransfer.effectAllowed = "move";

    // ✅ Store drag offset for accurate position tracking
    const rect = pageCard.getBoundingClientRect();
    state.dragOffsetX = e.clientX - rect.left;
    state.dragOffsetY = e.clientY - rect.top;
    state.draggedElementHeight = rect.height;

    // ✅ DEBUG: Log to verify values
    console.log("Drag started:", {
      offsetY: state.dragOffsetY,
      height: state.draggedElementHeight,
      clientY: e.clientY,
      rectTop: rect.top,
    });

    // ✅ Add visual feedback (adjust to center of card for better UX)
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    e.dataTransfer.setDragImage(pageCard, centerX, centerY);
  });

  pageCard.addEventListener("dragend", () => {
    pageCard.classList.remove("dragging");
    state.draggedElement = null;
    state.draggedIndex = null;
    state.dragOffsetX = 0;
    state.dragOffsetY = 0;
    state.draggedElementHeight = 0;

    // ✅ Stop auto-scroll when drag ends
    stopAutoScroll();

    // ✅ Re-enable smooth scrolling after drag
    const pagesArea = state.container.querySelector(".pages-area");
    if (pagesArea) {
      pagesArea.style.scrollBehavior = "smooth";
    }
  });

  pageCard.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (state.draggedElement && state.draggedElement !== pageCard) {
      pageCard.classList.add("drag-over");
    }

    // ✅ Trigger auto-scroll based on dragged element position
    startAutoScroll(e.clientX, e.clientY);
  });

  pageCard.addEventListener("dragleave", () => {
    pageCard.classList.remove("drag-over");
  });

  pageCard.addEventListener("drop", (e) => {
    e.preventDefault();
    pageCard.classList.remove("drag-over");

    // ✅ Stop auto-scroll on drop
    stopAutoScroll();

    if (!state.draggedElement || state.draggedElement === pageCard) return;

    const targetIndex = state.pages.findIndex((p) => p.id === pageData.id);

    if (
      state.draggedIndex !== null &&
      targetIndex !== null &&
      state.draggedIndex !== targetIndex
    ) {
      // Reorder in state array
      const movedPage = state.pages.splice(state.draggedIndex, 1)[0];
      state.pages.splice(targetIndex, 0, movedPage);

      // ✅ Update currentIndex for all pages
      state.pages.forEach((page, idx) => {
        page.currentIndex = idx;
      });

      // Move DOM elements
      const draggedCard = state.draggedElement;
      const targetCard = pageCard;

      if (state.draggedIndex < targetIndex) {
        // Moving down: insert after target
        targetCard.parentNode.insertBefore(draggedCard, targetCard.nextSibling);
      } else {
        // Moving up: insert before target
        targetCard.parentNode.insertBefore(draggedCard, targetCard);
      }

      // ✅ Update state indices after visual reorder
      state.draggedIndex = targetIndex;
    }
  });
}

// ✅ IMPROVED: Auto-scroll state with RAF
let autoScrollRAF = null;
let autoScrollSpeed = 0;
let targetScrollSpeed = 0;
let lastMouseY = 0;
let lastMouseX = 0;

/**
 * Start auto-scrolling when dragging near edges
 */
/**
 * Start auto-scrolling when dragging near edges
 */
/**
 * Start auto-scrolling when dragging near edges
 */
function startAutoScroll(clientX, clientY) {
  const pagesArea = state.container.querySelector(".pages-area");
  if (!pagesArea) return;

  // Store mouse position for continuous updates
  lastMouseX = clientX;
  lastMouseY = clientY;

  // ✅ IMPROVED: Use cursor position as fallback if drag offset not set
  const dragOffsetY = state.dragOffsetY || 60; // Default ~center of typical card
  const draggedHeight = state.draggedElementHeight || 240; // Default typical card height

  // Calculate dragged element's visual position
  const draggedTop = clientY - dragOffsetY;
  const draggedBottom = draggedTop + draggedHeight;

  // Get header height (organizer-header)
  const header = state.container.querySelector(".organizer-header");
  const headerHeight = header ? header.getBoundingClientRect().height : 80;

  // Get viewport boundaries
  const viewportTop = headerHeight;
  const viewportBottom = window.innerHeight;

  // ✅ Reduced max speed for smoother scrolling
  const maxSpeed = 12; // Reduced for more control

  // ✅ Smaller zones for more predictable triggering
  const topZoneSize = 180; // Reduced from 300
  const bottomZoneSize = 200; // Reduced from 320

  // Calculate distances from edges
  const distanceFromTop = draggedTop - viewportTop;
  const distanceFromBottom = viewportBottom - draggedBottom;

  // ✅ DEBUG: Log scroll state (remove after testing)
  if (
    Math.abs(distanceFromTop) < topZoneSize ||
    Math.abs(distanceFromBottom) < bottomZoneSize
  ) {
    console.log("Scroll zone:", {
      draggedTop,
      draggedBottom,
      distanceFromTop,
      distanceFromBottom,
      viewportTop,
      viewportBottom,
    });
  }

  // ✅ TOP SCROLL: More aggressive triggering
  if (distanceFromTop < topZoneSize && distanceFromTop > -150) {
    // Increased overlap to -150
    pagesArea.classList.add("scroll-active-top");
    pagesArea.classList.remove("scroll-active-bottom");

    // ✅ CALCULATE SCROLL SPEED with more aggressive curve
    const normalizedDistance = Math.max(
      0,
      Math.min(topZoneSize, topZoneSize - distanceFromTop)
    );
    const intensity = normalizedDistance / topZoneSize;

    // ✅ Linear curve for consistent, predictable scrolling
    targetScrollSpeed = -maxSpeed * intensity;

    // ✅ No minimum speed - allow gradual slowdown
  }
  // ✅ BOTTOM SCROLL: More aggressive triggering
  else if (distanceFromBottom < bottomZoneSize && distanceFromBottom > -150) {
    // Increased overlap
    pagesArea.classList.add("scroll-active-bottom");
    pagesArea.classList.remove("scroll-active-top");

    // ✅ CALCULATE SCROLL SPEED with more aggressive curve
    const normalizedDistance = Math.max(
      0,
      Math.min(bottomZoneSize, bottomZoneSize - distanceFromBottom)
    );
    const intensity = normalizedDistance / bottomZoneSize;

    // ✅ Linear curve for consistent, predictable scrolling
    targetScrollSpeed = maxSpeed * intensity;

    // ✅ No minimum speed - allow gradual slowdown
  } else {
    pagesArea.classList.remove("scroll-active-top", "scroll-active-bottom");
    targetScrollSpeed = 0;
  }

  // Start scroll loop with RAF if not already running
  if (!autoScrollRAF) {
    autoScrollRAF = requestAnimationFrame(autoScrollLoop);
  }
}
/**
 * Auto-scroll loop with smooth interpolation
 */
function autoScrollLoop() {
  const pagesArea = state.container.querySelector(".pages-area");
  if (!pagesArea) {
    stopAutoScroll();
    return;
  }

  // ✅ Direct control without lerp for smoother, more predictable scrolling
  const lerpFactor = 0.6; // Much higher for near-instant response
  autoScrollSpeed += (targetScrollSpeed - autoScrollSpeed) * lerpFactor;

  // Apply scroll if speed is significant
  if (Math.abs(autoScrollSpeed) > 0.5) {
    pagesArea.scrollTop += autoScrollSpeed;
    autoScrollRAF = requestAnimationFrame(autoScrollLoop);
  } else if (Math.abs(targetScrollSpeed) > 0.5) {
    // ✅ Keep loop alive if target speed is set (still in zone)
    pagesArea.scrollTop += targetScrollSpeed;
    autoScrollRAF = requestAnimationFrame(autoScrollLoop);
  } else {
    // Stop when both speeds are negligible
    autoScrollSpeed = 0;
    autoScrollRAF = null;
  }
}

/**
 * Stop auto-scrolling
 */
function stopAutoScroll() {
  targetScrollSpeed = 0;
  autoScrollSpeed = 0;
  if (autoScrollRAF) {
    cancelAnimationFrame(autoScrollRAF);
    autoScrollRAF = null;
  }
}

/**
 * Sort pages
 */
function sortPages(order) {
  // ✅ Sort by currentIndex (current visual position)
  state.pages.sort((a, b) => {
    if (order === "asc") {
      return a.currentIndex - b.currentIndex; // Keep current order
    } else {
      return b.currentIndex - a.currentIndex; // Reverse order
    }
  });

  // ✅ Update indices after sorting
  state.pages.forEach((page, idx) => {
    page.currentIndex = idx;
  });

  renderAllPages();

  utils.showToast(
    state.currentLang === "ja"
      ? order === "asc"
        ? "昇順に並び替えました"
        : "降順に並び替えました"
      : order === "asc"
      ? "Sorted ascending"
      : "Sorted descending",
    "success"
  );
}

/**
 * Add more files
 */
function addMoreFiles() {
  const addMoreFileInput = state.container.querySelector("#addMoreFileInput");
  addMoreFileInput?.click();
}

/**
 * Handle adding more files
 */
async function handleAddMoreFiles(e) {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  const loading = utils.createLoadingOverlay(
    state.currentLang === "ja" ? "PDFを追加中..." : "Adding PDFs..."
  );
  loading.show();

  try {
    for (const file of files) {
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith(".pdf")) {
        const validation = utils.validatePdfFile(file);
        if (!validation.valid) continue;

        // ✅ FIX: Read file as ArrayBuffer FIRST, create copy BEFORE pdf.js touches it
        const originalBytes = await utils.readFileAsArrayBuffer(file);

        // ✅ Create a PERMANENT copy for storage before PDF.js uses it
        const storedBytes = originalBytes.slice(0);

        // ✅ Create ANOTHER copy for PDF.js to use (prevents detachment of stored copy)
        const pdfJsBytes = originalBytes.slice(0);

        const loadingTask = pdfjsLib.getDocument({
          data: pdfJsBytes, // ✅ Use the PDF.js-specific copy
          verbosity: 0,
        });
        const pdfDoc = await loadingTask.promise;

        // Add pages from this PDF
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const scale = 0.3; // ✅ Use low-res for add more files (faster)
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          const ctx = canvas.getContext("2d", {
            alpha: false,
            willReadFrequently: false,
          });

          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({ canvasContext: ctx, viewport }).promise;

          state.pages.push({
            id: `page-${Date.now()}-${state.pages.length}-${Math.random()}`,
            originalPageNumber: 0,
            currentIndex: state.pages.length,
            rendered: true,
            canvas: canvas,
            fromFile: file.name,
            pdfBytes: storedBytes, // ✅ Use the stored copy (never touched by PDF.js)
            pageNumberInSource: i,
          });
        }
      } else if (
        fileName.endsWith(".png") ||
        fileName.endsWith(".jpg") ||
        fileName.endsWith(".jpeg")
      ) {
        // ✅ Handle images
        const img = await createImageBitmap(file);
        const canvas = document.createElement("canvas");

        const scale = 0.3; // ✅ Use low-res for consistency
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        state.pages.push({
          id: `page-${Date.now()}-${state.pages.length}-${Math.random()}`,
          originalPageNumber: 0,
          currentIndex: state.pages.length,
          rendered: true,
          canvas: canvas,
          fromFile: file.name,
          isImage: true,
        });
      }
    }

    state.totalPages = state.pages.length;
    updateFileInfo();

    // ✅ Use renderAllPages instead of full re-render
    await renderAllPages();

    loading.hide();
    utils.showToast(
      state.currentLang === "ja" ? "PDFを追加しました" : "PDFs added",
      "success"
    );
  } catch (error) {
    console.error("Failed to add files:", error);
    loading.hide();
    utils.showToast(
      state.currentLang === "ja"
        ? "ファイルの追加に失敗しました"
        : "Failed to add files",
      "error"
    );
  }

  // Reset input
  e.target.value = "";
}

/**
 * Clear all pages
 */
function clearAllPages() {
  if (state.pages.length === 0) return;

  const confirmed = confirm(
    state.currentLang === "ja"
      ? "すべてのページを削除しますか?"
      : "Are you sure you want to clear all pages?"
  );

  if (confirmed) {
    state.pages = [];
    const pagesGrid = state.container.querySelector("#pagesGrid");
    if (pagesGrid) pagesGrid.innerHTML = "";

    utils.showToast(
      state.currentLang === "ja"
        ? "すべてのページを削除しました"
        : "All pages cleared",
      "success"
    );
  }
}

/**
 * Load a specific page from stored PDF bytes
 */
async function loadPageFromBytes(pdfBytes, pageNumber) {
  await ensurePdfLib();
  const PDFLib = window.PDFLib;
  const sourcePdf = await PDFLib.PDFDocument.load(pdfBytes);
  return sourcePdf.getPage(pageNumber - 1);
}

/**
 * Save reorganized PDF
 */
async function savePdf() {
  if (state.pages.length === 0) {
    utils.showToast(
      state.currentLang === "ja" ? "ページがありません" : "No pages to save",
      "error"
    );
    return;
  }

  const loading = utils.createLoadingOverlay(
    state.currentLang === "ja" ? "PDFを保存中..." : "Saving PDF..."
  );
  loading.show();

  try {
    await ensurePdfLib();
    const PDFLib = window.PDFLib;

    // ✅ OPTIMIZATION 1: Check if we need to modify the PDF at all
    const hasOnlyOriginalPages = state.pages.every(
      (p) => p.originalPageNumber > 0 && !p.isBlank && !p.isImage
    );
    const isOriginalOrder = state.pages.every(
      (p, idx) => p.originalPageNumber === idx + 1
    );

    // ✅ Fast path: No modifications needed, save original directly
    if (hasOnlyOriginalPages && isOriginalOrder && state.pdfBytes) {
      loading.updateMessage?.(
        state.currentLang === "ja" ? "ファイルを保存中..." : "Saving file..."
      );

      // ✅ FIX: Use state.pdfBytes instead of undefined pdfBytes
      const blob = new Blob([state.pdfBytes], { type: "application/pdf" });
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(blob);
      });

      const result = await window.electronAPI.saveBytesBase64(
        "organized.pdf",
        base64
      );

      loading.hide();

      if (result.success) {
        utils.showToast(
          state.currentLang === "ja"
            ? `保存完了: ${result.path}`
            : `Saved: ${result.path}`,
          "success"
        );
      }
      return;
    }

    // ✅ OPTIMIZATION 2: Load original PDF only if needed
    let originalPdf = null;
    if (state.pdfBytes && state.pages.some((p) => p.originalPageNumber > 0)) {
      loading.updateMessage?.(
        state.currentLang === "ja"
          ? "元のPDFを読み込み中..."
          : "Loading original PDF..."
      );
      originalPdf = await PDFLib.PDFDocument.load(state.pdfBytes.slice(0));
    }

    const newPdf = await PDFLib.PDFDocument.create();

    // ✅ OPTIMIZATION 3: Process pages in LARGER batches for speed
    const BATCH_SIZE = 20; // ✅ Increased from 10 to 20
    let processedCount = 0;

    for (let i = 0; i < state.pages.length; i += BATCH_SIZE) {
      const batch = state.pages.slice(
        i,
        Math.min(i + BATCH_SIZE, state.pages.length)
      );

      // ✅ Update progress less frequently
      if (i % 40 === 0 || i === 0) {
        loading.updateMessage?.(
          state.currentLang === "ja"
            ? `ページを処理中... ${Math.round((i / state.pages.length) * 100)}%`
            : `Processing pages... ${Math.round(
                (i / state.pages.length) * 100
              )}%`
        );
      }

      // ✅ Process batch items sequentially (faster than parallel for PDF operations)
      for (const pageData of batch) {
        try {
          if (pageData.isBlank || pageData.isImage) {
            // Convert canvas to PNG and add as new page
            if (!pageData.canvas) {
              console.warn("Skipping page without canvas:", pageData.id);
              continue;
            }

            // ✅ Use JPEG instead of PNG for faster encoding (70% faster)
            const dataUrl = pageData.canvas.toDataURL("image/jpeg", 0.9);
            const base64Data = dataUrl.split(",")[1];
            const jpegBytes = Uint8Array.from(atob(base64Data), (c) =>
              c.charCodeAt(0)
            );

            // Embed JPEG
            const jpegImage = await newPdf.embedJpg(jpegBytes);

            // Create page with same dimensions as canvas
            const page = newPdf.addPage([
              pageData.canvas.width,
              pageData.canvas.height,
            ]);

            // Draw image on page
            page.drawImage(jpegImage, {
              x: 0,
              y: 0,
              width: pageData.canvas.width,
              height: pageData.canvas.height,
            });
          } else if (pageData.pdfBytes && pageData.pageNumberInSource) {
            // Handle inserted PDF pages with stored bytes
            const sourcePdf = await PDFLib.PDFDocument.load(
              pageData.pdfBytes.slice(0)
            );
            const [copiedPage] = await newPdf.copyPages(sourcePdf, [
              pageData.pageNumberInSource - 1,
            ]);
            newPdf.addPage(copiedPage);
          } else if (pageData.originalPageNumber > 0 && originalPdf) {
            // ✅ Copy from original PDF (fastest path)
            const [copiedPage] = await newPdf.copyPages(originalPdf, [
              pageData.originalPageNumber - 1,
            ]);
            newPdf.addPage(copiedPage);
          } else {
            console.warn("Skipping invalid page:", pageData);
          }

          processedCount++;
        } catch (pageError) {
          console.error(`Failed to process page ${pageData.id}:`, pageError);
        }
      }

      // ✅ Reduced breathing time for faster processing
      if (i % 40 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    // ✅ OPTIMIZATION 4: Save PDF with optimized settings
    loading.updateMessage?.(
      state.currentLang === "ja" ? "PDFを生成中..." : "Generating PDF..."
    );

    const pdfBytes = await newPdf.save({
      useObjectStreams: false,
      addDefaultPage: false,
      objectsPerTick: 100, // ✅ Process more objects per tick
    });

    // ✅ OPTIMIZATION 5: Convert to base64 for efficient IPC
    loading.updateMessage?.(
      state.currentLang === "ja" ? "ファイルを保存中..." : "Saving file..."
    );

    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const base64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(blob);
    });

    const result = await window.electronAPI.saveBytesBase64(
      "organized.pdf",
      base64
    );

    loading.hide();

    if (result.success) {
      utils.showToast(
        state.currentLang === "ja"
          ? `保存完了: ${result.path}`
          : `Saved: ${result.path}`,
        "success"
      );
    }
  } catch (error) {
    console.error("Failed to save PDF:", error);
    loading.hide();
    utils.showToast(
      state.currentLang === "ja"
        ? `PDFの保存に失敗しました: ${error.message}`
        : `Failed to save PDF: ${error.message}`,
      "error"
    );
  }
}
/**
 * Ensure pdf-lib is loaded
 */
async function ensurePdfLib() {
  if (window.PDFLib) return;

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `file://${window.libs.pdfLibPath}`;
    script.onload = () => {
      console.log("✅ pdf-lib loaded");
      resolve();
    };
    script.onerror = () => {
      reject(new Error("Failed to load pdf-lib"));
    };
    document.head.appendChild(script);
  });
}

/**
 * Apply language to UI elements
 */
function applyLanguage() {
  const elements = state.container.querySelectorAll("[data-lang-ja]");

  elements.forEach((el) => {
    const key = state.currentLang === "ja" ? "data-lang-ja" : "data-lang-en";
    const text = el.getAttribute(key);
    if (text) {
      el.textContent = text;
    }
  });
}

function resetPageOrder() {
  // ✅ Separate original PDF pages from added content
  const originalPdfPages = state.pages.filter(
    (p) => p.originalPageNumber > 0 && !p.isImage && !p.isBlank
  );
  const addedContent = state.pages.filter(
    (p) => (p.originalPageNumber === 0 && !p.isBlank) || p.isImage
  );
  const blankPages = state.pages.filter((p) => p.isBlank);

  // Sort original PDF pages by their original order
  originalPdfPages.sort((a, b) => a.originalPageNumber - b.originalPageNumber);

  // ✅ Combine: Original PDFs first (sorted), then added content (as added), then blanks
  state.pages = [...originalPdfPages, ...addedContent, ...blankPages];

  // ✅ Update indices
  state.pages.forEach((page, idx) => {
    page.currentIndex = idx;
  });

  renderAllPages();

  utils.showToast(
    state.currentLang === "ja"
      ? "元の順序にリセットしました"
      : "Reset to original order",
    "success"
  );
}

// Export the module
export default { init, cleanup };
