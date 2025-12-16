// core/utils.js
// Shared utility functions for all features

/**
 * Format file size to human readable
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

/**
 * Debounce function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
export function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function calls
 * @param {Function} func - Function to throttle
 * @param {number} limit - Limit in ms
 * @returns {Function} Throttled function
 */
export function throttle(func, limit = 300) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Generate unique ID
 * @returns {string} Unique ID
 */
export function generateId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

/**
 * Validate PDF file
 * @param {File} file - File to validate
 * @returns {Object} Validation result {valid, error}
 */
export function validatePdfFile(file) {
  if (!file) {
    return { valid: false, error: "No file provided" };
  }

  if (
    file.type !== "application/pdf" &&
    !file.name.toLowerCase().endsWith(".pdf")
  ) {
    return { valid: false, error: "File must be a PDF" };
  }

  // Check file size (max 1GB)
  const maxSize = 1024 * 1024 * 1024; // 1GB in bytes
  if (file.size > maxSize) {
    return { valid: false, error: "File size must be less than 1GB" };
  }

  if (file.size === 0) {
    return { valid: false, error: "File is empty" };
  }

  return { valid: true, error: null };
}

/**
 * Read file as ArrayBuffer
 * @param {File} file - File to read
 * @returns {Promise<ArrayBuffer>}
 */
export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Download file with custom name
 * @param {Blob} blob - File blob
 * @param {string} filename - File name
 */
export function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Show toast notification
 * @param {string} message - Message to show
 * @param {string} type - Type: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duration in ms
 */
export function showToast(message, type = "info", duration = 3000) {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background: ${getToastColor(type)};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    animation: slideIn 0.3s ease-out;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideOut 0.3s ease-out";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function getToastColor(type) {
  const colors = {
    success: "#10b981",
    error: "#ff5c5c",
    warning: "#f59e0b",
    info: "#0b5fff",
  };
  return colors[type] || colors.info;
}

/**
 * Create loading overlay
 * @param {string} message - Loading message
 * @returns {Object} Overlay with show/hide methods
 */
export function createLoadingOverlay(message = "Processing...") {
  const overlay = document.createElement("div");
  overlay.className = "loading-overlay";
  overlay.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    ">
      <div style="
        background: white;
        padding: 30px 40px;
        border-radius: 12px;
        text-align: center;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      ">
        <div style="
          width: 40px;
          height: 40px;
          border: 4px solid #f3f3f3;
          border-top: 4px solid #0b5fff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px;
        "></div>
        <div id="loading-message" style="
          color: #333;
          font-size: 16px;
          font-weight: 500;
        ">${message}</div>
      </div>
    </div>
  `;

  return {
    show: () => document.body.appendChild(overlay),
    hide: () => overlay.remove(),
    updateMessage: (msg) => {
      const msgEl = overlay.querySelector("#loading-message");
      if (msgEl) msgEl.textContent = msg;
    },
  };
}

/**
 * Wait for specified time
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise}
 */
export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Validate page range
 * @param {number} from - From page
 * @param {number} to - To page
 * @param {number} totalPages - Total pages in PDF
 * @returns {Object} Validation result
 */
export function validatePageRange(from, to, totalPages) {
  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    return { valid: false, error: "Page numbers must be integers" };
  }

  if (from < 1 || to < 1) {
    return { valid: false, error: "Page numbers must be greater than 0" };
  }

  if (from > totalPages || to > totalPages) {
    return { valid: false, error: `Page numbers cannot exceed ${totalPages}` };
  }

  if (from > to) {
    return {
      valid: false,
      error: "Start page must be less than or equal to end page",
    };
  }

  return { valid: true, error: null };
}

// Add CSS animations
const style = document.createElement("style");
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);
