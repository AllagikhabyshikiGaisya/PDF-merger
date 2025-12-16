// features/pdf-split/feature.js
// PDF Split Feature - Complete Implementation

import * as utils from "../../core/utils.js";
import eventBus from "../../core/event-bus.js";

// Load pdf.js from the main app's libs
const pdfjsLib =
  window.pdfjsLib || (await import(`file://${window.libs.pdfjsDistPath}`));
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${window.libs.pdfjsWorkerPath}`;
}

// Feature state
const state = {
  container: null,
  currentLang: "ja",
  currentStep: "upload",
  pdfFile: null,
  pdfDoc: null,
  pdfBytes: null,
  totalPages: 0,
  splitMode: "custom",
  splitResults: [],
  renderedPages: [],
  customRanges: [], // Changed from single object to array
  fixedRange: { pagesPerSplit: 4 },
  includeRemainingPages: false, // New property
};

/**
 * Initialize the PDF Split feature
 */
export async function init(container, params = {}) {
  console.log("🚀 Initializing PDF Split feature", params);

  state.container = container;
  state.currentLang = params.lang || "ja";

  // Setup event listeners
  setupEventListeners();

  // Apply language
  applyLanguage();

  // Listen for language changes
  eventBus.on(
    "language-changed",
    (lang) => {
      state.currentLang = lang;
      applyLanguage();
    },
    "pdf-split"
  );

  return state;
}

/**
 * Cleanup when feature is deactivated
 */
export async function cleanup(instance) {
  console.log("🧹 Cleaning up PDF Split feature");

  // Clear event listeners
  eventBus.off("language-changed");

  // Revoke object URLs
  if (state.pdfFile) {
    URL.revokeObjectURL(state.pdfFile);
  }

  // ✅ OPTIMIZATION: Thorough memory cleanup
  if (state.pdfDoc) {
    try {
      await state.pdfDoc.cleanup();
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  // Clear rendered canvases
  state.renderedPages.forEach(({ element }) => {
    const canvas = element?.querySelector("canvas");
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  });

  // Clear state
  state.pdfDoc = null;
  state.pdfBytes = null;
  state.splitResults = [];
  state.renderedPages = [];
  state.pdfFile = null;
  state.totalPages = 0;
  state.originalPdfForSplit = null; // ✅ Clear this too

  // Browser will automatically garbage collect when references are removed
  // No need for manual gc() call in renderer process
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Back buttons
  const backToMain = state.container.querySelector("#backToMain");
  const backToUpload = state.container.querySelector("#backToUpload");
  const backToMainFromDownload = state.container.querySelector(
    "#backToMainFromDownload"
  );

  backToMain?.addEventListener("click", goBackToMain);
  backToUpload?.addEventListener("click", () => showStep("upload"));
  backToMainFromDownload?.addEventListener("click", goBackToMain);

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
  loadPdfBtn?.addEventListener("click", loadPdfForSplit);

  // Mode selection
  const customModeBtn = state.container.querySelector("#customModeBtn");
  const fixedModeBtn = state.container.querySelector("#fixedModeBtn");

  customModeBtn?.addEventListener("click", () => switchMode("custom"));
  fixedModeBtn?.addEventListener("click", () => switchMode("fixed"));

  // Range inputs - Add Range button
  const addRangeBtn = state.container.querySelector("#addRangeBtn");
  addRangeBtn?.addEventListener("click", addNewRange);

  // Fixed range input
  const pagesPerSplit = state.container.querySelector("#pagesPerSplit");
  pagesPerSplit?.addEventListener("input", (e) => {
    state.fixedRange.pagesPerSplit = parseInt(e.target.value) || 1;
    updateFixedRangePreview();
  });

  // Execute split
  const executeSplitBtn = state.container.querySelector("#executeSplitBtn");
  executeSplitBtn?.addEventListener("click", executeSplit);

  // Download buttons
  const downloadSplitBtn = state.container.querySelector("#downloadSplitBtn");
  const splitAnotherBtn = state.container.querySelector("#splitAnotherBtn");

  downloadSplitBtn?.addEventListener("click", downloadSplitFiles);
  splitAnotherBtn?.addEventListener("click", () => {
    clearFile();
    showStep("upload");
  });
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

  const steps = state.container.querySelectorAll(".split-step");
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
  // Validate file
  const validation = utils.validatePdfFile(file);
  if (!validation.valid) {
    utils.showToast(validation.error, "error");
    return;
  }

  state.pdfFile = file;

  // Show file info
  const fileInfo = state.container.querySelector("#fileInfo");
  const fileName = state.container.querySelector("#fileName");
  const fileSize = state.container.querySelector("#fileSize");
  const loadPdfBtn = state.container.querySelector("#loadPdfBtn");

  if (fileName) fileName.textContent = file.name;
  if (fileSize) fileSize.textContent = utils.formatFileSize(file.size);
  if (fileInfo) fileInfo.style.display = "block";
  if (loadPdfBtn) loadPdfBtn.style.display = "flex";

  utils.showToast(
    state.currentLang === "ja" ? "ファイルが選択されました" : "File selected",
    "success"
  );
}

/**
 * Clear selected file
 */
function clearFile() {
  state.pdfFile = null;
  state.pdfDoc = null;
  state.pdfBytes = null;
  state.totalPages = 0;

  const fileInfo = state.container.querySelector("#fileInfo");
  const loadPdfBtn = state.container.querySelector("#loadPdfBtn");
  const pdfFileInput = state.container.querySelector("#pdfFileInput");

  if (fileInfo) fileInfo.style.display = "none";
  if (loadPdfBtn) loadPdfBtn.style.display = "none";
  if (pdfFileInput) pdfFileInput.value = "";
}

// Continuation of features/pdf-split/feature.js (Part 2)

/**
 * Load PDF for splitting
 */
async function loadPdfForSplit() {
  if (!state.pdfFile) return;

  const loading = utils.createLoadingOverlay(
    state.currentLang === "ja" ? "PDFを読み込み中..." : "Loading PDF..."
  );
  loading.show();

  try {
    // ✅ OPTIMIZATION 1: Read file as ArrayBuffer
    state.pdfBytes = await utils.readFileAsArrayBuffer(state.pdfFile);

    // ✅ OPTIMIZATION 2: Use original buffer directly (no unnecessary copy)
    // pdf.js will handle its own internal copying if needed
    const loadingTask = pdfjsLib.getDocument({
      data: state.pdfBytes,
      verbosity: 0,
    });

    state.pdfDoc = await loadingTask.promise;
    state.totalPages = state.pdfDoc.numPages;

    // Initialize ranges
    state.customRanges = [];
    state.fixedRange = { pagesPerSplit: 4 };

    // Update UI
    const rangesList = state.container.querySelector("#rangesList");
    if (rangesList) {
      rangesList.innerHTML = ""; // Clear existing ranges
      addNewRange(); // Add initial range
    }

    const totalPagesInfo = state.container.querySelector("#totalPagesInfo");
    const fileSizeInfo = state.container.querySelector("#fileSizeInfo");

    if (totalPagesInfo) totalPagesInfo.textContent = state.totalPages;
    if (fileSizeInfo)
      fileSizeInfo.textContent = utils.formatFileSize(state.pdfFile.size);

    // Show split step
    showStep("split");

    // ✅ OPTIMIZATION 3: Don't render all pages for large PDFs
    if (state.splitMode === "custom") {
      await renderSinglePreview();
      updateCustomRangePreview();
    } else {
      // ✅ Show placeholder instead of rendering all pages
      if (state.totalPages > 50) {
        // Large PDF - show count only
        showPageCountPreview();
      } else {
        // Small PDF - render thumbnails
        await renderAllPages();
      }
      updateFixedRangePreview();
    }

    loading.hide();
    utils.showToast(
      state.currentLang === "ja"
        ? "PDF読み込み完了"
        : "PDF loaded successfully",
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
 * ✅ NEW: Show page count without rendering (for large PDFs)
 */
function showPageCountPreview() {
  const container = state.container.querySelector("#pdfPagesContainer");
  if (!container) return;

  container.innerHTML = `
    <div style="padding: 60px 40px; text-align: center; color: #6b7280; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); max-width: 500px; margin: 0 auto;">
      <div style="font-size: 64px; margin-bottom: 20px;">📄</div>
      <h3 style="margin: 0 0 12px 0; font-size: 22px; color: #2c2c2c; font-weight: 600;">
        ${
          state.currentLang === "ja"
            ? "PDF読み込み完了"
            : "PDF Loaded Successfully"
        }
      </h3>
      <div style="display: inline-block; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 24px; margin: 16px 0;">
        <p style="margin: 0; font-size: 18px; color: #166534; font-weight: 600;">
          ${state.totalPages} ${state.currentLang === "ja" ? "ページ" : "pages"}
        </p>
      </div>
      <p style="margin: 20px 0 0 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
        ${
          state.currentLang === "ja"
            ? "ページプレビューは表示されませんが、<br>分割設定は正常に機能します。<br><br>下の設定パネルで分割方法を選択してください。"
            : "Page previews are hidden for performance,<br>but split functionality works normally.<br><br>Configure split settings in the panel below."
        }
      </p>
    </div>
  `;

  container.style.gridTemplateColumns = "1fr";
  container.style.placeItems = "center";
}
/**
 * Add a new range input row
 */
function addNewRange() {
  const rangesList = state.container.querySelector("#rangesList");
  if (!rangesList) return;

  const rangeId = `range-${Date.now()}`;
  const rangeItem = document.createElement("div");
  rangeItem.className = "range-item";
  rangeItem.dataset.rangeId = rangeId;

  rangeItem.innerHTML = `
    <div class="setting-group">
      <label data-lang-ja="開始" data-lang-en="From">${
        state.currentLang === "ja" ? "開始" : "From"
      }</label>
      <input
        type="number"
        class="page-input range-from"
        min="1"
        max="${state.totalPages}"
        value="1"
        placeholder="1"
      />
    </div>
    <div class="setting-group">
      <label data-lang-ja="終了" data-lang-en="To">${
        state.currentLang === "ja" ? "終了" : "To"
      }</label>
      <input
        type="number"
        class="page-input range-to"
        min="1"
        max="${state.totalPages}"
        value="1"
        placeholder="1"
      />
    </div>
    <button class="remove-range-btn" onclick="removeRange('${rangeId}')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    </button>
  `;

  rangesList.appendChild(rangeItem);

  // Add event listeners
  const fromInput = rangeItem.querySelector(".range-from");
  const toInput = rangeItem.querySelector(".range-to");

  fromInput?.addEventListener("input", updateCustomRangePreview);
  toInput?.addEventListener("input", updateCustomRangePreview);

  updateCustomRangePreview();
}

/**
 * Remove a range
 */
window.removeRange = function (rangeId) {
  const rangeItem = state.container.querySelector(
    `[data-range-id="${rangeId}"]`
  );
  if (rangeItem) {
    rangeItem.remove();
    updateCustomRangePreview();
  }
};

/**
 * Get all custom ranges from UI
 */
function getCustomRanges() {
  const ranges = [];
  const rangeItems = state.container.querySelectorAll(".range-item");

  rangeItems.forEach((item) => {
    const from = parseInt(item.querySelector(".range-from")?.value) || 1;
    const to = parseInt(item.querySelector(".range-to")?.value) || 1;
    ranges.push({ from, to });
  });

  return ranges;
}

/**
 * Validate ranges for overlaps and validity
 */
function validateRanges(ranges) {
  if (ranges.length === 0) {
    return {
      valid: false,
      error:
        state.currentLang === "ja"
          ? "範囲を追加してください"
          : "Please add at least one range",
    };
  }

  // Validate each range
  for (const range of ranges) {
    const validation = utils.validatePageRange(
      range.from,
      range.to,
      state.totalPages
    );
    if (!validation.valid) {
      return validation;
    }
  }

  // Sort ranges by start page
  ranges.sort((a, b) => a.from - b.from);

  // Check for overlaps
  for (let i = 0; i < ranges.length - 1; i++) {
    if (ranges[i].to >= ranges[i + 1].from) {
      return {
        valid: false,
        error:
          state.currentLang === "ja"
            ? `範囲 ${i + 1} と ${i + 2} が重複しています`
            : `Range ${i + 1} and ${i + 2} overlap`,
      };
    }
  }

  return { valid: true, error: null };
}

/**
 * Calculate remaining pages not in any range
 */
function getRemainingPages(ranges) {
  const allPages = new Set(
    Array.from({ length: state.totalPages }, (_, i) => i + 1)
  );

  ranges.forEach((range) => {
    for (let p = range.from; p <= range.to; p++) {
      allPages.delete(p);
    }
  });

  return Array.from(allPages).sort((a, b) => a - b);
}

/**
 * Show confirmation dialog for remaining pages
 */
function showRemainingPagesDialog(remainingPages) {
  return new Promise((resolve) => {
    if (remainingPages.length === 0) {
      resolve(false); // No remaining pages
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "confirmation-overlay";

    const formatPages = (pages) => {
      if (pages.length <= 10) return pages.join(", ");
      return (
        pages.slice(0, 10).join(", ") + `, ... (${pages.length - 10} more)`
      );
    };

    overlay.innerHTML = `
      <div class="confirmation-dialog">
        <h3>${
          state.currentLang === "ja"
            ? "残りのページについて"
            : "About Remaining Pages"
        }</h3>
        <p>${
          state.currentLang === "ja"
            ? "指定した範囲に含まれないページがあります。これらのページを保存しますか?"
            : "There are pages not included in your selected ranges. Would you like to save these pages?"
        }</p>
        <div class="remaining-pages">
          <strong>${
            state.currentLang === "ja" ? "残りのページ" : "Remaining Pages"
          }:</strong><br>
          ${formatPages(remainingPages)}
        </div>
        <div class="btn-group">
          <button class="btn secondary" id="excludeBtn">
            <span>${
              state.currentLang === "ja" ? "保存しない" : "Don't Save"
            }</span>
          </button>
          <button class="btn primary" id="includeBtn">
            <span>${
              state.currentLang === "ja" ? "保存する" : "Save Them"
            }</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector("#includeBtn")?.addEventListener("click", () => {
      overlay.remove();
      resolve(true);
    });

    overlay.querySelector("#excludeBtn")?.addEventListener("click", () => {
      overlay.remove();
      resolve(false);
    });
  });
}
/**
 * Switch between custom and fixed modes
 */
async function switchMode(mode) {
  state.splitMode = mode;

  const customModeBtn = state.container.querySelector("#customModeBtn");
  const fixedModeBtn = state.container.querySelector("#fixedModeBtn");
  const customSettings = state.container.querySelector("#customRangeSettings");
  const fixedSettings = state.container.querySelector("#fixedRangeSettings");

  if (mode === "custom") {
    customModeBtn?.classList.add("active");
    fixedModeBtn?.classList.remove("active");
    customSettings?.classList.add("active");
    fixedSettings?.classList.remove("active");

    // Initialize with one range if empty
    const rangesList = state.container.querySelector("#rangesList");
    if (rangesList && rangesList.children.length === 0) {
      addNewRange();
    }

    // ✅ Show single preview message for custom mode
    await renderSinglePreview();
    updateCustomRangePreview();
  } else {
    customModeBtn?.classList.remove("active");
    fixedModeBtn?.classList.add("active");
    customSettings?.classList.remove("active");
    fixedSettings?.classList.add("active");

    // ✅ OPTIMIZATION: Don't render pages, show placeholder
    if (state.totalPages > 50) {
      showPageCountPreview();
    } else {
      await renderAllPages();
    }
    updateFixedRangePreview();
  }
}

/**
 * Render single preview for custom mode
 */
async function renderSinglePreview() {
  const container = state.container.querySelector("#pdfPagesContainer");
  if (!container) return;

  container.innerHTML =
    '<div style="padding: 40px; text-align: center; color: #6b7280;">' +
    (state.currentLang === "ja"
      ? "ページ範囲を選択してください。選択した範囲がプレビューされます。"
      : "Select page range. The selected range will be previewed.") +
    "</div>";

  container.style.gridTemplateColumns = "1fr";
  container.style.placeItems = "center";
}

/**
 * Render all pages for fixed mode
 */
async function renderAllPages() {
  const container = state.container.querySelector("#pdfPagesContainer");
  if (!container) return;

  const loading = utils.createLoadingOverlay(
    state.currentLang === "ja"
      ? "ページをレンダリング中..."
      : "Rendering pages..."
  );
  loading.show();

  try {
    container.innerHTML = "";
    container.style.gridTemplateColumns = "";
    container.style.placeItems = "";
    state.renderedPages = [];

    // ✅ OPTIMIZATION: Smaller batches for better memory management
    const BATCH_SIZE = 3; // Reduced from 5 to 3

    for (let i = 1; i <= state.totalPages; i += BATCH_SIZE) {
      const batch = [];
      const end = Math.min(i + BATCH_SIZE - 1, state.totalPages);

      for (let pageNum = i; pageNum <= end; pageNum++) {
        batch.push(renderPageThumbnail(pageNum));
      }

      const results = await Promise.all(batch);
      results.forEach((pageElement) => {
        if (pageElement) {
          container.appendChild(pageElement);
        }
      });

      // Update progress
      const progress = Math.round((end / state.totalPages) * 100);
      loading.updateMessage?.(
        state.currentLang === "ja"
          ? `ページをレンダリング中... ${progress}%`
          : `Rendering pages... ${progress}%`
      );

      // ✅ OPTIMIZATION: Longer pause for garbage collection
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    loading.hide();
  } catch (error) {
    console.error("Failed to render pages:", error);
    loading.hide();
    utils.showToast(
      state.currentLang === "ja"
        ? "ページのレンダリングに失敗しました"
        : "Failed to render pages",
      "error"
    );
  }
}

/**
 * Render single page thumbnail
 */
async function renderPageThumbnail(pageNum) {
  try {
    const page = await state.pdfDoc.getPage(pageNum);

    // ✅ OPTIMIZATION: Smaller scale for thumbnails (0.3 instead of 0.5)
    const scale = 0.3;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.className = "pdf-page-canvas";

    // ✅ OPTIMIZATION: Cap maximum dimensions
    const MAX_THUMB_SIZE = 300;
    const scaleFactor = Math.min(
      1,
      MAX_THUMB_SIZE / Math.max(viewport.width, viewport.height)
    );

    canvas.width = Math.round(viewport.width * scaleFactor);
    canvas.height = Math.round(viewport.height * scaleFactor);

    const ctx = canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: false,
    });

    await page.render({
      canvasContext: ctx,
      viewport: page.getViewport({ scale: scale * scaleFactor }),
    }).promise;

    const pageItem = document.createElement("div");
    pageItem.className = "pdf-page-item";
    pageItem.dataset.pageNum = pageNum;

    const label = document.createElement("div");
    label.className = "pdf-page-label";
    label.textContent = `${
      state.currentLang === "ja" ? "ページ" : "Page"
    } ${pageNum}`;

    pageItem.appendChild(canvas);
    pageItem.appendChild(label);

    state.renderedPages.push({ pageNum, element: pageItem });

    return pageItem;
  } catch (error) {
    console.error(`Failed to render page ${pageNum}:`, error);
    return null;
  }
}

/**
 * Update custom range preview
 */
function updateCustomRangePreview() {
  const preview = state.container.querySelector("#customRangePreview");
  if (!preview || state.splitMode !== "custom") return;

  const ranges = getCustomRanges();

  if (ranges.length === 0) {
    preview.style.display = "none";
    return;
  }

  const validation = validateRanges(ranges);

  if (!validation.valid) {
    preview.style.display = "block";
    preview.innerHTML = `
      <div style="color: var(--accent-red); font-weight: 600; margin-bottom: 8px;">
        ${state.currentLang === "ja" ? "エラー" : "Error"}
      </div>
      <div style="color: var(--text-secondary); font-size: 14px;">
        ${validation.error}
      </div>
    `;
    return;
  }

  // Calculate stats
  const totalSelectedPages = ranges.reduce(
    (sum, r) => sum + (r.to - r.from + 1),
    0
  );
  const remainingPages = getRemainingPages(ranges);

  preview.style.display = "block";
  preview.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 12px; color: var(--text-primary);">
      ${state.currentLang === "ja" ? "分割プレビュー" : "Split Preview"}
    </div>
    ${ranges
      .map(
        (range, i) => `
      <div class="split-preview-item">
        ${state.currentLang === "ja" ? "ファイル" : "File"} ${i + 1}: 
        ${state.currentLang === "ja" ? "ページ" : "Page"} ${range.from}-${
          range.to
        }
        (${range.to - range.from + 1}${
          state.currentLang === "ja" ? "ページ" : " pages"
        })
      </div>
    `
      )
      .join("")}
    ${
      remainingPages.length > 0
        ? `
      <div class="split-preview-item" style="background: rgba(196, 30, 58, 0.05); border-left: 3px solid var(--accent-red);">
        ${state.currentLang === "ja" ? "残りのページ" : "Remaining Pages"}: 
        ${remainingPages.length}${
            state.currentLang === "ja" ? "ページ" : " pages"
          }
        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
          ${
            state.currentLang === "ja"
              ? "分割時に選択できます"
              : "You can choose during split"
          }
        </div>
      </div>
    `
        : ""
    }
  `;
}

/**
 * Update fixed range preview
 */
function updateFixedRangePreview() {
  if (state.splitMode !== "fixed") return;

  const pagesPerSplit = state.fixedRange.pagesPerSplit;
  const splitPreview = state.container.querySelector("#splitPreview");

  if (!splitPreview || pagesPerSplit < 1) return;

  // Calculate splits
  const splits = [];
  let currentPage = 1;

  while (currentPage <= state.totalPages) {
    const endPage = Math.min(currentPage + pagesPerSplit - 1, state.totalPages);
    splits.push({ start: currentPage, end: endPage });
    currentPage = endPage + 1;
  }

  // Generate preview HTML
  const splitItems = splits
    .map((split, index) => {
      const pageCount = split.end - split.start + 1;
      return `
      <div class="split-preview-item">
        ${state.currentLang === "ja" ? "ファイル" : "File"} ${index + 1}: 
        ${state.currentLang === "ja" ? "ページ" : "Page"} ${split.start}-${
        split.end
      } 
        (${pageCount}${state.currentLang === "ja" ? "ページ" : " pages"})
      </div>
    `;
    })
    .join("");

  splitPreview.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 10px; color: #1f2937;">
      ${state.currentLang === "ja" ? "分割プレビュー" : "Split Preview"} (${
    splits.length
  }${state.currentLang === "ja" ? "ファイル" : " files"})
    </div>
    ${splitItems}
  `;

  // Update page highlighting
  highlightPagesInRange(splits);
}

/**
 * Highlight pages based on splits
 */
function highlightPagesInRange(splits) {
  state.renderedPages.forEach(({ pageNum, element }) => {
    element.classList.remove("in-range");
  });

  // No need to highlight in fixed mode - all pages are split
}
// Continuation of features/pdf-split/feature.js (Part 3 - Final)

/**
 * Execute PDF split
 */
async function executeSplit() {
  if (!state.pdfFile || !state.pdfDoc) {
    utils.showToast(
      state.currentLang === "ja"
        ? "PDFが読み込まれていません"
        : "No PDF loaded",
      "error"
    );
    return;
  }

  const loading = utils.createLoadingOverlay(
    state.currentLang === "ja" ? "PDFを分割中..." : "Splitting PDF..."
  );
  loading.show();

  try {
    await ensurePdfLib();
    const PDFLib = window.PDFLib;

    if (!PDFLib) {
      throw new Error("pdf-lib not available");
    }

    loading.updateMessage?.(
      state.currentLang === "ja" ? "PDFを読み込み中..." : "Loading PDF..."
    );

    const freshPdfBytes = await utils.readFileAsArrayBuffer(state.pdfFile);
    const originalPdf = await PDFLib.PDFDocument.load(freshPdfBytes);

    // ✅ Clear previous results and prepare metadata only
    state.splitResults = [];

    if (state.splitMode === "custom") {
      const ranges = getCustomRanges();
      const validation = validateRanges(ranges);

      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const remainingPages = getRemainingPages(ranges);

      loading.hide();
      state.includeRemainingPages = await showRemainingPagesDialog(
        remainingPages
      );
      loading.show();

      await splitCustomRangeMetadata(ranges, remainingPages);
    } else {
      await splitFixedRangeMetadata();
    }

    // ✅ Store original PDF for actual splitting during download
    state.originalPdfForSplit = originalPdf;

    loading.hide();

    displaySplitResults();
    showStep("download");

    utils.showToast(
      state.currentLang === "ja" ? "PDF分割準備完了" : "Split prepared",
      "success"
    );
  } catch (error) {
    console.error("Split failed:", error);
    loading.hide();
    utils.showToast(
      state.currentLang === "ja"
        ? "PDFの分割に失敗しました"
        : "Failed to split PDF",
      "error"
    );
  }
}

// ✅ NEW: Create metadata only (no actual PDF generation yet)
async function splitCustomRangeMetadata(ranges, remainingPages) {
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    state.splitResults.push({
      name: `split_${i + 1}_pages_${range.from}-${range.to}.pdf`,
      pageRange: `${range.from}-${range.to}`,
      pageCount: range.to - range.from + 1,
      rangeType: "custom",
      rangeData: range,
      bytes: null, // ✅ Don't generate yet
    });
  }

  if (state.includeRemainingPages && remainingPages.length > 0) {
    state.splitResults.push({
      name: `remaining_pages.pdf`,
      pageRange: remainingPages.join(", "),
      pageCount: remainingPages.length,
      rangeType: "remaining",
      rangeData: { pages: remainingPages },
      bytes: null,
    });
  }
}

async function splitFixedRangeMetadata() {
  const pagesPerSplit = state.fixedRange.pagesPerSplit;

  if (pagesPerSplit < 1) {
    throw new Error("Invalid pages per split value");
  }

  let currentPage = 1;
  let fileIndex = 1;

  while (currentPage <= state.totalPages) {
    const endPage = Math.min(currentPage + pagesPerSplit - 1, state.totalPages);
    const pageCount = endPage - currentPage + 1;

    state.splitResults.push({
      name: `split_${fileIndex}.pdf`,
      pageRange: `${currentPage}-${endPage}`,
      pageCount: pageCount,
      rangeType: "fixed",
      rangeData: { from: currentPage, to: endPage },
      bytes: null, // ✅ Don't generate yet
    });

    currentPage = endPage + 1;
    fileIndex++;
  }
}

/**
 * Split PDF using custom range
 */
/**
 * Split PDF using custom ranges
 */
async function splitCustomRange(
  originalPdf,
  PDFLib,
  loading,
  ranges,
  remainingPages
) {
  // Create documents for each range
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];

    loading.updateMessage(
      state.currentLang === "ja"
        ? `ファイル ${i + 1} を作成中...`
        : `Creating file ${i + 1}...`
    );

    const doc = await PDFLib.PDFDocument.create();
    const pages = await doc.copyPages(
      originalPdf,
      Array.from(
        { length: range.to - range.from + 1 },
        (_, j) => range.from - 1 + j
      )
    );
    pages.forEach((page) => doc.addPage(page));
    const bytes = await doc.save();

    state.splitResults.push({
      name: `split_${i + 1}_pages_${range.from}-${range.to}.pdf`,
      bytes: bytes,
      pageRange: `${range.from}-${range.to}`,
      pageCount: range.to - range.from + 1,
    });
  }

  // Handle remaining pages if user wants them
  if (state.includeRemainingPages && remainingPages.length > 0) {
    loading.updateMessage(
      state.currentLang === "ja"
        ? "残りのページを作成中..."
        : "Creating remaining pages..."
    );

    const remainingDoc = await PDFLib.PDFDocument.create();
    const remainingPagesData = await remainingDoc.copyPages(
      originalPdf,
      remainingPages.map((p) => p - 1) // Convert to 0-indexed
    );
    remainingPagesData.forEach((page) => remainingDoc.addPage(page));
    const remainingBytes = await remainingDoc.save();

    state.splitResults.push({
      name: `remaining_pages.pdf`,
      bytes: remainingBytes,
      pageRange: remainingPages.join(", "),
      pageCount: remainingPages.length,
    });
  }
}

/**
 * Split PDF using fixed range
 */
async function splitFixedRange(originalPdf, PDFLib, loading) {
  const pagesPerSplit = state.fixedRange.pagesPerSplit;

  if (pagesPerSplit < 1) {
    throw new Error("Invalid pages per split value");
  }

  let currentPage = 1;
  let fileIndex = 1;

  while (currentPage <= state.totalPages) {
    const endPage = Math.min(currentPage + pagesPerSplit - 1, state.totalPages);
    const pageCount = endPage - currentPage + 1;

    loading.updateMessage?.(
      state.currentLang === "ja"
        ? `ファイル ${fileIndex} を作成中... (${Math.round(
            (endPage / state.totalPages) * 100
          )}%)`
        : `Creating file ${fileIndex}... (${Math.round(
            (endPage / state.totalPages) * 100
          )}%)`
    );

    const splitDoc = await PDFLib.PDFDocument.create();
    const pages = await splitDoc.copyPages(
      originalPdf,
      Array.from({ length: pageCount }, (_, i) => currentPage - 1 + i)
    );
    pages.forEach((page) => splitDoc.addPage(page));

    // ✅ OPTIMIZATION: Save with optimized settings
    const bytes = await splitDoc.save({
      useObjectStreams: false,
      addDefaultPage: false,
    });

    state.splitResults.push({
      name: `split_${fileIndex}.pdf`,
      bytes: bytes,
      pageRange: `${currentPage}-${endPage}`,
      pageCount: pageCount,
    });

    currentPage = endPage + 1;
    fileIndex++;

    // ✅ OPTIMIZATION: Longer pause every 5 files for GC
    if (fileIndex % 5 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    } else {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}
/**
 * Display split results summary
 */
function displaySplitResults() {
  const splitSummary = state.container.querySelector("#splitSummary");
  if (!splitSummary) return;

  // ✅ Calculate total pages instead of file size (since bytes are null)
  const totalPages = state.splitResults.reduce(
    (sum, file) => sum + (file.pageCount || 0),
    0
  );

  const summaryHTML = `
    <div class="summary-item">
      <span class="summary-label">${
        state.currentLang === "ja" ? "分割ファイル数" : "Split Files"
      }</span>
      <span class="summary-value">${state.splitResults.length}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">${
        state.currentLang === "ja" ? "合計ページ数" : "Total Pages"
      }</span>
      <span class="summary-value">${totalPages}</span>
    </div>
    ${state.splitResults
      .map(
        (file, index) => `
      <div class="summary-item">
        <span class="summary-label">${
          state.currentLang === "ja" ? "ファイル" : "File"
        } ${index + 1}</span>
        <span class="summary-value">${file.pageCount} ${
          state.currentLang === "ja" ? "ページ" : "pages"
        } (${file.pageRange})</span>
      </div>
    `
      )
      .join("")}
  `;

  splitSummary.innerHTML = summaryHTML;
}

/**
 * Download split files
 */
async function downloadSplitFiles() {
  if (state.splitResults.length === 0) {
    utils.showToast(
      state.currentLang === "ja"
        ? "ダウンロードするファイルがありません"
        : "No files to download",
      "error"
    );
    return;
  }

  if (!state.originalPdfForSplit) {
    utils.showToast(
      state.currentLang === "ja"
        ? "PDF情報が見つかりません"
        : "PDF data not found",
      "error"
    );
    return;
  }

  const loading = utils.createLoadingOverlay(
    state.currentLang === "ja" ? "ファイルを保存中..." : "Saving files..."
  );
  loading.show();

  try {
    const PDFLib = window.PDFLib;
    let folderPath = null;
    const CHUNK_SIZE = 512 * 1024; // 512KB chunks for streaming

    for (let i = 0; i < state.splitResults.length; i++) {
      const fileInfo = state.splitResults[i];

      loading.updateMessage(
        state.currentLang === "ja"
          ? `ファイル ${i + 1}/${state.splitResults.length} を作成中...\n${
              fileInfo.name
            }`
          : `Creating file ${i + 1}/${state.splitResults.length}...\n${
              fileInfo.name
            }`
      );

      // ✅ Generate PDF on-the-fly
      const splitDoc = await PDFLib.PDFDocument.create();

      let pageIndices = [];
      if (fileInfo.rangeType === "custom" || fileInfo.rangeType === "fixed") {
        const { from, to } = fileInfo.rangeData;
        pageIndices = Array.from(
          { length: to - from + 1 },
          (_, j) => from - 1 + j
        );
      } else if (fileInfo.rangeType === "remaining") {
        pageIndices = fileInfo.rangeData.pages.map((p) => p - 1);
      }

      const pages = await splitDoc.copyPages(
        state.originalPdfForSplit,
        pageIndices
      );
      pages.forEach((page) => splitDoc.addPage(page));

      // ✅ Save with optimization
      const pdfBytes = await splitDoc.save({
        useObjectStreams: false,
        addDefaultPage: false,
      });

      // ✅ Check file size and use appropriate method
      const fileSizeMB = pdfBytes.length / (1024 * 1024);

      if (fileSizeMB < 50) {
        // Small file: use batch method
        const result = await window.electronAPI.saveSplitFolderBatch(
          [{ name: fileInfo.name, bytes: Array.from(pdfBytes) }],
          folderPath
        );

        if (result.success) {
          if (!folderPath) folderPath = result.path;
        } else if (result.message === "canceled") {
          loading.hide();
          return;
        } else {
          throw new Error(result.message);
        }
      } else {
        // Large file: use streaming
        loading.updateMessage(
          state.currentLang === "ja"
            ? `大きなファイルを保存中... ${Math.round(fileSizeMB)}MB\n${
                fileInfo.name
              }`
            : `Saving large file... ${Math.round(fileSizeMB)}MB\n${
                fileInfo.name
              }`
        );

        const totalChunks = Math.ceil(pdfBytes.length / CHUNK_SIZE);

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
          const start = chunkIndex * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, pdfBytes.length);
          const chunk = pdfBytes.slice(start, end);

          // Convert to base64
          const blob = new Blob([chunk]);
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(",")[1]);
            reader.readAsDataURL(blob);
          });

          const isFirst = chunkIndex === 0;
          const isLast = chunkIndex === totalChunks - 1;

          const result = await window.electronAPI.saveSplitFileDirect(
            fileInfo.name,
            base64,
            isFirst,
            isLast,
            folderPath
          );

          if (result.success) {
            if (!folderPath) folderPath = result.path;
          } else if (result.message === "canceled") {
            loading.hide();
            return;
          } else {
            throw new Error(result.message);
          }

          // Update progress for large files
          if (chunkIndex % 5 === 0) {
            const chunkProgress = Math.round((chunkIndex / totalChunks) * 100);
            loading.updateMessage(
              state.currentLang === "ja"
                ? `保存中... ${chunkProgress}% (${Math.round(fileSizeMB)}MB)\n${
                    fileInfo.name
                  }`
                : `Saving... ${chunkProgress}% (${Math.round(fileSizeMB)}MB)\n${
                    fileInfo.name
                  }`
            );
          }
        }
      }

      // Memory cleanup after each file
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    loading.hide();

    if (folderPath) {
      const message =
        state.currentLang === "ja"
          ? `保存完了: ${folderPath}\n${state.splitResults.length}個のファイル`
          : `Saved: ${folderPath}\n${state.splitResults.length} files`;

      utils.showToast(message, "success", 5000);
    }
  } catch (error) {
    console.error("Download failed:", error);
    loading.hide();

    const errorMsg =
      state.currentLang === "ja"
        ? "ダウンロードに失敗しました: " + error.message
        : "Download failed: " + error.message;

    utils.showToast(errorMsg, "error", 5000);
  }
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

// Export the module
export default { init, cleanup };
