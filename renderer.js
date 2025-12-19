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
  featureManager.register("pdf-merge", {
    title: "PDF結合",
    titleEn: "PDF Merge",
    description: "Merge multiple PDFs and images with rotation support",
    version: "1.0.0",
    path: "features/pdf-merge",
  });

  featureManager.register("pdf-merge-edit", {
    title: "PDF Merge & Edit",
    titleJa: "PDF結合と編集",
    description: "Merge PDFs and images, then annotate",
    version: "1.0.0",
    path: "features/pdf-merge-edit",
  });
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

  // Register PDF to JPEG feature
  featureManager.register("pdf-to-jpeg", {
    title: "PDF JPEG 変換",
    titleEn: "PDF to JPEG",
    description: "Convert PDF pages to JPEG images",
    version: "1.0.0",
    path: "features/pdf-to-jpeg",
  });

  // Future features can be registered here
  // featureManager.register('page-organizer', { ... });
  // featureManager.register('pdf-compress', { ... });
}

/**
 * Setup event listeners for feature buttons
 */

function setupFeatureButtons() {
  const mergePdfBtn = document.getElementById("mergePdfBtn");
  if (mergePdfBtn) {
    mergePdfBtn.addEventListener("click", async () => {
      try {
        await featureManager.activate("pdf-merge", {
          lang: currentLang,
        });
      } catch (error) {
        console.error("Failed to open PDF Merge:", error);
        utils.showToast("Failed to open PDF Merge feature", "error");
      }
    });
  }
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
  const pdfToJpegBtn = document.getElementById("pdfToJpegBtn");

  if (pdfToJpegBtn) {
    pdfToJpegBtn.addEventListener("click", async () => {
      try {
        await featureManager.activate("pdf-to-jpeg", {
          lang: currentLang,
        });
      } catch (error) {
        console.error("Failed to open PDF to JPEG:", error);
        utils.showToast("Failed to open PDF to JPEG feature", "error");
      }
    });
  }
  const mergeEditBtn = document.getElementById("mergeEditBtn");
  if (mergeEditBtn) {
    mergeEditBtn.addEventListener("click", async () => {
      try {
        await featureManager.activate("pdf-merge-edit", {
          lang: currentLang,
        });
      } catch (error) {
        console.error("Failed to open PDF Merge & Edit:", error);
        utils.showToast("Failed to open feature", "error");
      }
    });
  }
  // Single function to update all feature button texts
  const updateFeatureButtonTexts = () => {
    const mergePdfBtnText = document.getElementById("mergePdfBtnText");
    if (mergePdfBtnText) {
      mergePdfBtnText.textContent =
        currentLang === "ja" ? "PDF結合" : "Merge PDFs";
    }
    const splitBtnText = document.getElementById("splitBtnText");
    if (splitBtnText) {
      splitBtnText.textContent = currentLang === "ja" ? "PDF分割" : "PDF Split";
    }

    const organizerBtnText = document.getElementById("organizerBtnText");
    if (organizerBtnText) {
      organizerBtnText.textContent =
        currentLang === "ja" ? "ページ整理" : "Page Organizer";
    }
    const pdfToJpegBtnText = document.getElementById("pdfToJpegBtnText");
    if (pdfToJpegBtnText) {
      pdfToJpegBtnText.textContent =
        currentLang === "ja" ? "PDF JPEG 変換" : "PDF to JPEG";
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
window.pdfjsLib = pdfjsLib;

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

let editorPages = [];
let currentPageIndex = 0;

// Annotation state
let currentTool = "pointer";
let currentColor = "#ff0000";
let currentPath = [];
let textInputActive = false;
let textInputElement = null;

// Lazy loading state
let loadedPdfDocument = null;
let pageRenderQueue = [];
let isProcessingQueue = false;

const RENDER_SCALE = 3.0;

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

const statusEl = document.getElementById("status");

const countEl = document.getElementById("count");
const totalsizeEl = document.getElementById("totalsize");
const dropText = document.getElementById("dropText");
const addBtn = document.getElementById("addBtn");
const titleEl = document.getElementById("title");
const subtitleEl = document.getElementById("subtitle");
const footerText = document.getElementById("footerText");
const langToggle = document.getElementById("langToggle");

// ---------------- Utilities ----------------
function applyLanguage() {
  const L = LANG[currentLang];
  addBtn && (addBtn.innerText = L.add);

  // Note: mergeEditBtn is not in main renderer, it's in features
  dropText && (dropText.innerText = L.drag);
  statusEl && (statusEl.innerText = L.status_idle);
  footerText && (footerText.innerText = L.footer);
  langToggle && (langToggle.innerText = L.langBtn);
  titleEl &&
    (titleEl.innerText = currentLang === "ja" ? "PDF結合ツール" : "PDF Merger");
  subtitleEl &&
    (subtitleEl.innerText =
      currentLang === "ja" ? "ローカルで高速結合" : "Local & Fast");
}

function humanSize(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return Math.round(bytes / (1024 * 1024)) + " MB";
}

langToggle &&
  langToggle.addEventListener("click", () => {
    currentLang = currentLang === "ja" ? "en" : "ja";
    console.log(`🌐 Language changed to: ${currentLang}`);
    applyLanguage();

    // ✅ Emit language-changed event to notify features
    if (window.eventBus) {
      window.eventBus.emit("language-changed", currentLang);
      console.log(`✅ Language-changed event emitted: ${currentLang}`);
    }
  });

// Listen for merge progress updates
if (window.electronAPI && window.electronAPI.onMergeProgress) {
  window.electronAPI.onMergeProgress((progress) => {
    if (statusEl) {
      statusEl.innerText = `${LANG[currentLang].status_merging} ${progress}%`;
    }
  });
}

// ============= FORCED AUTO-UPDATE SYSTEM =============

/**
 * Create and manage forced update modal
 */
window.createUpdateModal = function () {
  const modal = document.getElementById("updateModal");
  const title = document.getElementById("updateTitle");
  const message = document.getElementById("updateMessage");
  const progressSection = document.getElementById("updateProgressSection");
  const progressBar = document.getElementById("updateProgressBar");
  const progressPercent = document.getElementById("updateProgressPercent");
  const progressSize = document.getElementById("updateProgressSize");
  const progressSpeed = document.getElementById("updateProgressSpeed");
  const versionInfo = document.getElementById("updateVersionInfo");
  const currentVersionEl = document.getElementById("updateCurrentVersion");
  const newVersionEl = document.getElementById("updateNewVersion");
  const status = document.getElementById("updateStatus");
  const statusText = document.getElementById("updateStatusText");
  const errorSection = document.getElementById("updateErrorSection");
  const errorMessage = document.getElementById("updateErrorMessage");
  const retryBtn = document.getElementById("retryUpdateBtn");

  // ✅ Language detection
  const isJapanese = currentLang === "ja";

  // ✅ State management
  let updateState = {
    checking: false,
    available: false,
    downloading: false,
    downloaded: false,
    error: false,
  };

  /**
   * Show modal with specific state
   */
  function showModal() {
    modal.style.display = "flex";
    // ✅ Prevent closing modal
    modal.onclick = (e) => {
      if (e.target === modal) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
  }

  function hideModal() {
    modal.style.display = "none";
  }

  /**
   * Update UI based on state
   */
  function updateUI(state, data = {}) {
    // Hide all sections first
    progressSection.style.display = "none";
    versionInfo.style.display = "none";
    errorSection.style.display = "none";
    status.style.display = "flex";

    switch (state) {
      case "checking":
        return;

      case "available":
        title.textContent = isJapanese
          ? "新しいバージョンが利用可能"
          : "New Version Available";
        message.textContent = isJapanese
          ? `バージョン ${data.version} をダウンロード中です`
          : `Downloading version ${data.version}`;
        versionInfo.style.display = "block";
        currentVersionEl.textContent = data.currentVersion;
        newVersionEl.textContent = data.version;
        statusText.textContent = isJapanese
          ? "ダウンロード準備中..."
          : "Preparing download...";
        break;

      case "downloading":
        title.textContent = isJapanese
          ? "アップデートをダウンロード中"
          : "Downloading Update";
        message.textContent = isJapanese
          ? "しばらくお待ちください。自動的にインストールされます。"
          : "Please wait. Installation will begin automatically.";
        progressSection.style.display = "block";
        versionInfo.style.display = "block";
        progressBar.style.width = `${data.percent || 0}%`;
        progressPercent.textContent = `${data.percent || 0}%`;
        progressSize.textContent = `${data.transferred || 0} MB / ${
          data.total || 0
        } MB`;
        progressSpeed.textContent = `${data.bytesPerSecond || 0} KB/s`;
        statusText.textContent = isJapanese
          ? "ダウンロード中..."
          : "Downloading...";
        break;

      case "downloaded":
        title.textContent = isJapanese ? "アップデート完了" : "Update Complete";
        message.textContent = isJapanese
          ? "アプリを再起動してインストールしています..."
          : "Restarting app to install update...";
        progressSection.style.display = "block";
        progressBar.style.width = "100%";
        progressPercent.textContent = "100%";
        statusText.textContent = isJapanese ? "再起動中..." : "Restarting...";
        break;

      case "not-available":
        title.textContent = isJapanese ? "最新バージョンです" : "Up to Date";
        message.textContent = isJapanese
          ? "最新バージョンを使用しています"
          : "You are using the latest version";
        status.style.display = "none";
        // ✅ Auto-hide after 2 seconds
        setTimeout(hideModal, 2000);
        break;

      case "error":
        title.textContent = isJapanese ? "アップデートエラー" : "Update Error";
        message.textContent = isJapanese
          ? "アップデートの確認中にエラーが発生しました"
          : "An error occurred while checking for updates";
        errorSection.style.display = "block";
        errorMessage.textContent =
          data.error || (isJapanese ? "不明なエラー" : "Unknown error");
        status.style.display = "none";
        break;
    }
  }

  // ✅ Listen to update events from main process
  if (window.electronAPI) {
    // Checking for updates (SILENT - no UI)
    window.electronAPI.onUpdateChecking &&
      window.electronAPI.onUpdateChecking((data) => {
        console.log("🔍 Update check started (silent background check)");
        updateState.checking = true;
      });

    // Update available - NOW show the modal
    window.electronAPI.onUpdateAvailable &&
      window.electronAPI.onUpdateAvailable((data) => {
        console.log("✅ Update available:", data.version, "- SHOWING MODAL");
        updateState.available = true;
        updateState.checking = false;
        showModal(); // ✅ Show modal ONLY when update exists
        updateUI("available", data);
      });

    // Update not available (SILENT - no UI)
    window.electronAPI.onUpdateNotAvailable &&
      window.electronAPI.onUpdateNotAvailable((data) => {
        console.log("✅ No updates available (silent - no notification)");
        updateState.checking = false;
      });

    // Download progress
    window.electronAPI.onUpdateProgress &&
      window.electronAPI.onUpdateProgress((data) => {
        console.log(`📥 Download progress: ${data.percent}%`);
        updateState.downloading = true;
        updateUI("downloading", data);
      });

    // Update downloaded
    window.electronAPI.onUpdateDownloaded &&
      window.electronAPI.onUpdateDownloaded((data) => {
        console.log("✅ Update downloaded:", data.version);
        updateState.downloaded = true;
        updateState.downloading = false;
        updateUI("downloaded", data);
      });

    // Update error
    window.electronAPI.onUpdateError &&
      window.electronAPI.onUpdateError((data) => {
        console.error("❌ Update error:", data.error);
        updateState.error = true;
        updateState.checking = false;
        updateState.downloading = false;
        updateUI("error", data);
      });
  }

  // ✅ Retry button handler
  retryBtn.addEventListener("click", async () => {
    updateState = {
      checking: true,
      available: false,
      downloading: false,
      downloaded: false,
      error: false,
    };
    updateUI("checking");

    if (window.electronAPI && window.electronAPI.checkForUpdates) {
      try {
        await window.electronAPI.checkForUpdates();
      } catch (err) {
        console.error("Retry failed:", err);
      }
    }
  });
};

// ✅ Initialize on page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    window.createUpdateModal && window.createUpdateModal();
  });
} else {
  window.createUpdateModal && window.createUpdateModal();
}
// Initialize
applyLanguage();
