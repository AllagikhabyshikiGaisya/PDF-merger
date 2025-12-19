// features/pdf-merge/feature.js
// PDF Merge Feature - FIXED rotation + visual thumbnail rotation

let pdfjsLib = null;
let PDFLib = null;
let currentLang = "ja";
let files = [];
let rotations = {}; // Store rotation state per file (0, 90, 180, 270)
let draggedElement = null;
let draggedIndex = -1;

const RENDER_SCALE = 1.5;
const MAX_THUMBNAIL_SIZE = 200;

/**
 * Initialize the PDF Merge feature
 */
export async function init(container, params = {}) {
  console.log("🚀 PDF Merge Feature: Initializing...");

  try {
    // Set language
    currentLang = params.lang || "ja";

    // Initialize PDF.js
    pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) {
      throw new Error("PDF.js library not found");
    }

    // Lazy load pdf-lib
    await ensurePdfLib();

    // Setup UI
    setupEventListeners(container);
    applyLanguage();

    // Listen for language changes
    if (window.eventBus) {
      window.eventBus.on(
        "language-changed",
        (lang) => {
          currentLang = lang;
          applyLanguage();
        },
        "pdf-merge"
      );
    }

    console.log("✅ PDF Merge Feature: Initialized successfully");

    return { files };
  } catch (error) {
    console.error("❌ PDF Merge Feature: Initialization failed", error);
    throw error;
  }
}

/**
 * Cleanup function
 */
export async function cleanup(instance) {
  console.log("🧹 PDF Merge Feature: Cleaning up...");

  // Clear files and canvas elements
  files.forEach((file) => {
    if (file.canvas) {
      file.canvas.width = 0;
      file.canvas.height = 0;
    }
  });

  files = [];
  rotations = {};
  draggedElement = null;
  draggedIndex = -1;

  // Unsubscribe from events
  if (window.eventBus) {
    window.eventBus.clear("language-changed");
  }

  console.log("✅ PDF Merge Feature: Cleaned up");
}

/**
 * Ensure pdf-lib is loaded
 */
async function ensurePdfLib() {
  if (PDFLib) return PDFLib;

  if (window.PDFLib) {
    PDFLib = window.PDFLib;
    return PDFLib;
  }

  if (window.libs && window.libs.pdfLibPath) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `file://${window.libs.pdfLibPath}`;
      script.onload = () => {
        PDFLib = window.PDFLib;
        resolve(PDFLib);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  throw new Error("pdf-lib not available");
}

/**
 * Setup all event listeners
 */
function setupEventListeners(container) {
  // Back button
  const backBtn = container.querySelector("#backToMainBtn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.featureManager.deactivateAll();
    });
  }

  // Browse button and drop zone
  const browseBtn = container.querySelector("#browseBtn");
  const fileInput = container.querySelector("#fileInput");
  const dropZone = container.querySelector("#dropZone");

  if (browseBtn && fileInput) {
    browseBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) =>
      handleFileSelect(e.target.files, container)
    );
  }

  if (dropZone) {
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });

    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("drag-over");
    });

    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
      handleFileSelect(e.dataTransfer.files, container);
    });
  }

  // Add more button
  const addMoreBtn = container.querySelector("#addMoreBtn");
  if (addMoreBtn && fileInput) {
    addMoreBtn.addEventListener("click", () => fileInput.click());
  }

  // Clear all button
  const clearAllBtn = container.querySelector("#clearAllBtn");
  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", () => clearAllFiles(container));
  }

  // Merge button
  const mergeBtn = container.querySelector("#mergeNowBtn");
  if (mergeBtn) {
    mergeBtn.addEventListener("click", () => mergeFiles(container));
  }
}

/**
 * Validate file buffer to ensure it's not corrupted
 */
function validateFileBuffer(buffer, fileName, fileType) {
  if (!buffer || buffer.byteLength === 0) {
    console.error(`❌ Empty buffer for ${fileName}`);
    return false;
  }

  const bytes = new Uint8Array(buffer);

  if (fileType === "application/pdf") {
    // Check for PDF magic bytes: %PDF-
    const pdfSignature = String.fromCharCode(37, 80, 68, 70, 45); // %PDF-
    const header = String.fromCharCode(...bytes.slice(0, 5));
    if (header !== pdfSignature) {
      console.error(`❌ Invalid PDF header for ${fileName}: got "${header}"`);
      return false;
    }
  } else if (fileType === "image/png") {
    // Check for PNG magic bytes: 137 80 78 71 13 10 26 10
    const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
    const header = Array.from(bytes.slice(0, 8));
    const isValid = pngSignature.every((byte, i) => byte === header[i]);
    if (!isValid) {
      console.error(`❌ Invalid PNG header for ${fileName}`);
      return false;
    }
  } else if (fileType === "image/jpeg") {
    // Check for JPEG magic bytes: FF D8 FF
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      console.error(`❌ Invalid JPEG header for ${fileName}`);
      return false;
    }
  }

  console.log(
    `✅ Valid ${fileType} buffer for ${fileName} (${buffer.byteLength} bytes)`
  );
  return true;
}

/**
 * Handle file selection
 */
async function handleFileSelect(fileList, container) {
  if (!fileList || fileList.length === 0) return;

  const validFiles = Array.from(fileList).filter((file) => {
    const isValid =
      file.type === "application/pdf" ||
      file.type.startsWith("image/") ||
      /\.(pdf|png|jpe?g)$/i.test(file.name);

    if (!isValid) {
      console.warn(`⚠️ Skipping invalid file: ${file.name}`);
    }

    return isValid && file.size > 0 && file.size <= 1024 * 1024 * 1024;
  });

  if (validFiles.length === 0) {
    showToast("No valid files selected", "error");
    return;
  }

  showProgress(container, "Loading files...", 0);

  try {
    const loadedFiles = [];

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const progress = Math.round(((i + 1) / validFiles.length) * 100);
      updateProgress(container, `Loading ${file.name}...`, progress);

      try {
        const buffer = await file.arrayBuffer();

        // ✅ Validate buffer before processing
        if (!validateFileBuffer(buffer, file.name, file.type)) {
          console.warn(`⚠️ Skipping invalid file: ${file.name}`);
          continue;
        }

        // ✅ CRITICAL: Create TRULY independent copies by copying byte-by-byte
        // This ensures proper buffer copying with independent ArrayBuffers
        const pristineArray = new Uint8Array(buffer);
        const renderArray = new Uint8Array(buffer);

        // Create new ArrayBuffers from the Uint8Arrays
        const pristineBuffer = pristineArray.buffer.slice(
          pristineArray.byteOffset,
          pristineArray.byteOffset + pristineArray.byteLength
        );
        const renderBuffer = renderArray.buffer.slice(
          renderArray.byteOffset,
          renderArray.byteOffset + renderArray.byteLength
        );

        const fileData = {
          name: file.name,
          type: file.type,
          size: file.size,
          buffer: pristineBuffer, // ✅ Independent copy for merging
          pages: 0,
          canvas: null,
          originalCanvas: null,
        };

        // Get page count for PDFs
        if (file.type === "application/pdf") {
          try {
            // ✅ Create a fresh Uint8Array view for PDF.js
            const pdfData = new Uint8Array(renderBuffer);
            const loadingTask = pdfjsLib.getDocument({ data: pdfData });
            const pdf = await loadingTask.promise;
            fileData.pages = pdf.numPages;

            // Render first page thumbnail
            const page = await pdf.getPage(1);
            const renderedCanvas = await renderThumbnail(page);

            if (renderedCanvas) {
              fileData.originalCanvas = renderedCanvas;
              fileData.canvas = renderedCanvas;
              console.log(
                `✅ Canvas created for ${file.name}: ${renderedCanvas.width}x${renderedCanvas.height}`
              );
            } else {
              console.error(`❌ Failed to create canvas for ${file.name}`);
              fileData.originalCanvas = null;
              fileData.canvas = null;
            }

            // Clean up PDF.js resources
            await pdf.cleanup();
          } catch (err) {
            console.error(`Error loading PDF ${file.name}:`, err);
            fileData.pages = 0;
          }
        } else {
          // Images count as 1 page
          fileData.pages = 1;
          // ✅ Use render buffer for image rendering
          const imageCanvas = await renderImageThumbnail(
            renderBuffer.buffer,
            file.type
          );

          if (imageCanvas) {
            fileData.originalCanvas = imageCanvas;
            fileData.canvas = imageCanvas;
            console.log(
              `✅ Canvas created for image ${file.name}: ${imageCanvas.width}x${imageCanvas.height}`
            );
          } else {
            console.error(`❌ Failed to create canvas for image ${file.name}`);
            fileData.originalCanvas = null;
            fileData.canvas = null;
          }
        }

        loadedFiles.push(fileData);
        rotations[files.length + loadedFiles.length - 1] = 0; // Initialize rotation
      } catch (err) {
        console.error(`Failed to load ${file.name}:`, err);
      }

      // Allow UI to breathe
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    files.push(...loadedFiles);

    hideProgress(container);
    updateUI(container);
    showToast(`${loadedFiles.length} file(s) added successfully`, "success");
  } catch (error) {
    console.error("Error loading files:", error);
    hideProgress(container);
    showToast("Failed to load files", "error");
  }
}

/**
 * Render PDF page thumbnail
 */
async function renderThumbnail(page) {
  try {
    const viewport = page.getViewport({ scale: 1 });
    const scale = Math.min(
      MAX_THUMBNAIL_SIZE / viewport.width,
      MAX_THUMBNAIL_SIZE / viewport.height,
      RENDER_SCALE
    );

    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    const ctx = canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: false,
    });

    await page.render({
      canvasContext: ctx,
      viewport: scaledViewport,
      intent: "display",
    }).promise;

    return canvas;
  } catch (err) {
    console.error("Error rendering thumbnail:", err);
    return null;
  }
}

/**
 * Render image thumbnail
 */
async function renderImageThumbnail(buffer, type) {
  try {
    const blob = new Blob([buffer], { type });
    const bitmap = await createImageBitmap(blob);

    const scale = Math.min(
      MAX_THUMBNAIL_SIZE / bitmap.width,
      MAX_THUMBNAIL_SIZE / bitmap.height,
      1
    );

    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width * scale;
    canvas.height = bitmap.height * scale;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    return canvas;
  } catch (err) {
    console.error("Error rendering image thumbnail:", err);
    return null;
  }
}

/**
 * ✅ NEW: Rotate canvas visually
 */
function rotateCanvas(sourceCanvas, degrees) {
  if (!sourceCanvas || degrees === 0) return sourceCanvas;

  const rotated = document.createElement("canvas");
  const ctx = rotated.getContext("2d");

  // Swap dimensions for 90° and 270° rotations
  if (degrees === 90 || degrees === 270) {
    rotated.width = sourceCanvas.height;
    rotated.height = sourceCanvas.width;
  } else {
    rotated.width = sourceCanvas.width;
    rotated.height = sourceCanvas.height;
  }

  // Apply rotation transformation
  ctx.save();

  switch (degrees) {
    case 90:
      ctx.translate(rotated.width, 0);
      ctx.rotate(Math.PI / 2);
      break;
    case 180:
      ctx.translate(rotated.width, rotated.height);
      ctx.rotate(Math.PI);
      break;
    case 270:
      ctx.translate(0, rotated.height);
      ctx.rotate(-Math.PI / 2);
      break;
  }

  ctx.drawImage(sourceCanvas, 0, 0);
  ctx.restore();

  return rotated;
}

/**
 * Update UI based on files state
 */
function updateUI(container) {
  const uploadArea = container.querySelector("#uploadArea");
  const fileGridContainer = container.querySelector("#fileGridContainer");
  const fileGrid = container.querySelector("#fileGrid");
  const mergeBtn = container.querySelector("#mergeNowBtn");

  if (files.length === 0) {
    if (uploadArea) uploadArea.style.display = "flex";
    if (fileGridContainer) fileGridContainer.style.display = "none";
    if (mergeBtn) mergeBtn.disabled = true;
  } else {
    if (uploadArea) uploadArea.style.display = "none";
    if (fileGridContainer) fileGridContainer.style.display = "block";
    if (mergeBtn) mergeBtn.disabled = false;

    // Render file cards
    if (fileGrid) {
      fileGrid.innerHTML = "";
      files.forEach((file, index) => {
        const card = createFileCard(file, index, container);
        fileGrid.appendChild(card);
      });
    }
  }

  // Update statistics
  updateStats(container);
}

/**
 * Create file card element
 */
function createFileCard(file, index, container) {
  const card = document.createElement("div");
  card.className = "file-card";
  card.draggable = true;
  card.dataset.index = index;

  // Drag and drop handlers
  card.addEventListener("dragstart", (e) => {
    draggedElement = card;
    draggedIndex = index;
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });

  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    draggedElement = null;
    draggedIndex = -1;
  });

  card.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (draggedElement && draggedElement !== card) {
      const targetIndex = parseInt(card.dataset.index);
      if (draggedIndex !== targetIndex) {
        // Reorder files array
        const [removed] = files.splice(draggedIndex, 1);
        files.splice(targetIndex, 0, removed);

        // Update rotations
        const draggedRotation = rotations[draggedIndex];
        delete rotations[draggedIndex];

        const newRotations = {};
        files.forEach((_, i) => {
          if (i < targetIndex) {
            newRotations[i] = rotations[i < draggedIndex ? i : i + 1] || 0;
          } else if (i === targetIndex) {
            newRotations[i] = draggedRotation;
          } else {
            newRotations[i] = rotations[i <= draggedIndex ? i : i - 1] || 0;
          }
        });
        rotations = newRotations;

        draggedIndex = targetIndex;
        updateUI(container);
      }
    }
  });

  // Header with drag handle and actions
  const header = document.createElement("div");
  header.className = "file-card-header";
  header.innerHTML = `
    <div class="file-drag-handle">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </div>
    <div class="file-card-actions">
      <button class="file-action-btn rotate" data-index="${index}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
        </svg>
      </button>
      <button class="file-action-btn delete" data-index="${index}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  `;

  // Rotate button handler
  const rotateBtn = header.querySelector(".rotate");
  if (rotateBtn) {
    rotateBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      rotateFile(index, container);
    });
  }

  // Delete button handler
  const deleteBtn = header.querySelector(".delete");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteFile(index, container);
    });
  }

  // Thumbnail
  const thumbnail = document.createElement("div");
  thumbnail.className = "file-thumbnail";

  // ✅ Use the rotated canvas (file.canvas already contains rotation)
  const displayCanvas = file.canvas;

  if (displayCanvas) {
    // ✅ CRITICAL: Properly clone canvas WITH pixel data
    const clonedCanvas = document.createElement("canvas");
    clonedCanvas.width = displayCanvas.width;
    clonedCanvas.height = displayCanvas.height;

    const ctx = clonedCanvas.getContext("2d");
    ctx.drawImage(displayCanvas, 0, 0);

    ctx.drawImage(displayCanvas, 0, 0);
    thumbnail.appendChild(clonedCanvas);
  } else {
    thumbnail.innerHTML = '<div class="file-placeholder">📄</div>';
  }

  // Info
  const info = document.createElement("div");
  info.className = "file-info";
  info.innerHTML = `
    <p class="file-name" title="${file.name}">${file.name}</p>
    <div class="file-meta">
      <span>${file.pages} ${file.pages === 1 ? "page" : "pages"}</span>
      <span>${formatFileSize(file.size)}</span>
    </div>
  `;

  card.appendChild(header);
  card.appendChild(thumbnail);
  card.appendChild(info);

  return card;
}

/**
 * ✅ UPDATED: Rotate file with visual feedback
 */
function rotateFile(index, container) {
  const file = files[index];
  if (!file || !file.originalCanvas) return;

  const currentRotation = rotations[index] || 0;
  const newRotation = (currentRotation + 90) % 360;
  rotations[index] = newRotation;

  // ✅ Create visually rotated canvas
  file.canvas = rotateCanvas(file.originalCanvas, newRotation);

  updateUI(container);
}

/**
 * Delete file
 */
function deleteFile(index, container) {
  if (files[index].canvas) {
    files[index].canvas.width = 0;
    files[index].canvas.height = 0;
  }
  if (files[index].originalCanvas) {
    files[index].originalCanvas.width = 0;
    files[index].originalCanvas.height = 0;
  }

  files.splice(index, 1);

  // Update rotations
  const newRotations = {};
  files.forEach((_, i) => {
    newRotations[i] = rotations[i < index ? i : i + 1] || 0;
  });
  rotations = newRotations;

  updateUI(container);
}

/**
 * Clear all files
 */
function clearAllFiles(container) {
  if (files.length === 0) return;

  // Clear canvases
  files.forEach((file) => {
    if (file.canvas) {
      file.canvas.width = 0;
      file.canvas.height = 0;
    }
    if (file.originalCanvas) {
      file.originalCanvas.width = 0;
      file.originalCanvas.height = 0;
    }
  });

  files = [];
  rotations = {};
  updateUI(container);
  showToast("All files cleared", "info");
}

/**
 * Update statistics
 */
function updateStats(container) {
  const filesCount = container.querySelector("#filesCount");
  const pagesCount = container.querySelector("#pagesCount");
  const totalSize = container.querySelector("#totalSize");

  const stats = {
    files: files.length,
    pages: files.reduce((sum, f) => sum + f.pages, 0),
    size: files.reduce((sum, f) => sum + f.size, 0),
  };

  if (filesCount) filesCount.textContent = stats.files;
  if (pagesCount) pagesCount.textContent = stats.pages;
  if (totalSize) totalSize.textContent = formatFileSize(stats.size);
}

/**
 * Merge files
 */
async function mergeFiles(container) {
  if (files.length === 0) return;

  showProgress(container, "Preparing to merge...", 0);

  try {
    await ensurePdfLib();

    updateProgress(container, `Merging ${files.length} files...`, 5);

    const mergedPdf = await PDFLib.PDFDocument.create();

    // Process files in batches
    const BATCH_SIZE = 5;
    let processedCount = 0;

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, Math.min(i + BATCH_SIZE, files.length));

      const batchResults = await Promise.allSettled(
        batch.map(async (file, batchIndex) => {
          const actualIndex = i + batchIndex;
          const rotation = rotations[actualIndex] || 0;

          try {
            // ✅ CRITICAL: Create TRULY independent copy with byte-by-byte duplication
            const sourceArray = new Uint8Array(file.buffer);
            const independentArray = new Uint8Array(sourceArray.length);
            independentArray.set(sourceArray); // Deep copy
            const independentCopy = independentArray.buffer;

            if (file.type === "application/pdf") {
              const pdfDoc = await PDFLib.PDFDocument.load(independentCopy, {
                ignoreEncryption: true,
                updateMetadata: false,
                throwOnInvalidObject: false,
              });

              return { type: "pdf", doc: pdfDoc, rotation };
            } else if (file.type.startsWith("image/")) {
              const imageBytes = independentArray; // Already a Uint8Array
              let embedded;

              try {
                if (file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name)) {
                  embedded = await mergedPdf.embedJpg(imageBytes);
                } else if (
                  file.type === "image/png" ||
                  /\.png$/i.test(file.name)
                ) {
                  embedded = await mergedPdf.embedPng(imageBytes);
                } else {
                  // Fallback: try PNG first, then JPEG
                  try {
                    embedded = await mergedPdf.embedPng(imageBytes);
                  } catch (pngErr) {
                    embedded = await mergedPdf.embedJpg(imageBytes);
                  }
                }

                return { type: "image", embedded, rotation };
              } catch (embedErr) {
                console.error(`Failed to embed image ${file.name}:`, embedErr);
                return null;
              }
            }
          } catch (err) {
            console.error(`Failed to process ${file.name}:`, err);
            return null;
          }

          return null;
        })
      );

      // Add pages to merged PDF
      for (const result of batchResults) {
        if (result.status === "fulfilled" && result.value) {
          const data = result.value;

          if (data.type === "pdf") {
            const pageIndices = data.doc.getPageIndices();
            const copiedPages = await mergedPdf.copyPages(
              data.doc,
              pageIndices
            );

            copiedPages.forEach((page) => {
              // ✅ FIX: Set ABSOLUTE rotation, not additive
              if (data.rotation !== 0) {
                page.setRotation(PDFLib.degrees(data.rotation));
              }
              mergedPdf.addPage(page);
            });
          } else if (data.type === "image") {
            const A4_WIDTH = 595.28;
            const A4_HEIGHT = 841.89;
            const MARGIN = 40;

            const imgWidth = data.embedded.width;
            const imgHeight = data.embedded.height;

            // ✅ FIX: Adjust scale calculation based on rotation
            let scale;
            if (data.rotation === 90 || data.rotation === 270) {
              // Swapped dimensions for 90/270 degree rotation
              scale = Math.min(
                (A4_WIDTH - 2 * MARGIN) / imgHeight,
                (A4_HEIGHT - 2 * MARGIN) / imgWidth
              );
            } else {
              scale = Math.min(
                (A4_WIDTH - 2 * MARGIN) / imgWidth,
                (A4_HEIGHT - 2 * MARGIN) / imgHeight
              );
            }

            const scaledWidth = imgWidth * scale;
            const scaledHeight = imgHeight * scale;

            const page = mergedPdf.addPage([A4_WIDTH, A4_HEIGHT]);

            // ✅ Set rotation BEFORE drawing
            if (data.rotation !== 0) {
              page.setRotation(PDFLib.degrees(data.rotation));
            }

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
      const progress = Math.floor(5 + (processedCount / files.length) * 85);
      updateProgress(
        container,
        `Processed ${processedCount}/${files.length} files...`,
        progress
      );

      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    updateProgress(container, "Generating PDF...", 90);

    const mergedBytes = await mergedPdf.save({
      useObjectStreams: false,
      addDefaultPage: false,
    });

    updateProgress(container, "Saving to disk...", 95);

    // Convert to base64 for efficient IPC
    const blob = new Blob([mergedBytes], { type: "application/pdf" });
    const base64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(blob);
    });

    const saveRes = await window.electronAPI.saveBytesBase64(
      "merged.pdf",
      base64
    );

    hideProgress(container);

    if (saveRes.success) {
      showToast(`PDF saved: ${saveRes.path}`, "success");
    } else {
      showToast("Save cancelled", "info");
    }
  } catch (error) {
    console.error("Merge error:", error);
    hideProgress(container);
    showToast("Failed to merge files: " + error.message, "error");
  }
}

/**
 * Show progress overlay
 */
function showProgress(container, message, percent) {
  const overlay = container.querySelector("#progressOverlay");
  const title = container.querySelector("#progressTitle");
  const detail = container.querySelector("#progressDetail");
  const bar = container.querySelector("#progressBar");
  const text = container.querySelector("#progressText");

  if (overlay) overlay.style.display = "flex";
  if (title)
    title.textContent = currentLang === "ja" ? "処理中..." : "Processing...";
  if (detail) detail.textContent = message;
  if (bar) bar.style.width = `${percent}%`;
  if (text) text.textContent = `${percent}%`;
}

/**
 * Update progress
 */
function updateProgress(container, message, percent) {
  const detail = container.querySelector("#progressDetail");
  const bar = container.querySelector("#progressBar");
  const text = container.querySelector("#progressText");

  if (detail) detail.textContent = message;
  if (bar) bar.style.width = `${percent}%`;
  if (text) text.textContent = `${percent}%`;
}

/**
 * Hide progress overlay
 */
function hideProgress(container) {
  const overlay = container.querySelector("#progressOverlay");
  if (overlay) {
    overlay.style.animation = "fadeOut 0.3s ease-out";
    setTimeout(() => {
      overlay.style.display = "none";
      overlay.style.animation = "";
    }, 300);
  }
}

/**
 * Show toast notification
 */
function showToast(message, type = "info") {
  if (window.pdfUtils && window.pdfUtils.showToast) {
    window.pdfUtils.showToast(message, type);
  } else {
    console.log(`[${type.toUpperCase()}] ${message}`);
  }
}

/**
 * Format file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

/**
 * Apply language translations
 */
function applyLanguage() {
  const translations = {
    ja: {
      back: "戻る",
      title: "PDF結合",
      uploadTitle: "PDFまたは画像をドロップ",
      uploadSubtitle: "または",
      browse: "ファイルを選択",
      uploadHint: "PDF、PNG、JPG対応 • 最大1GB",
      stats: "統計",
      files: "ファイル:",
      pages: "ページ:",
      size: "合計サイズ:",
      actions: "アクション",
      addMore: "追加",
      clearAll: "全削除",
      merge: "PDF結合",
      info: "すべての処理はデバイス上でローカルに行われます",
    },
    en: {
      back: "Back",
      title: "Merge PDFs",
      uploadTitle: "Drop PDFs or Images Here",
      uploadSubtitle: "or",
      browse: "Browse Files",
      uploadHint: "Supports PDF, PNG, JPG • Max 1GB per file",
      stats: "Statistics",
      files: "Files:",
      pages: "Pages:",
      size: "Total Size:",
      actions: "Actions",
      addMore: "Add More",
      clearAll: "Clear All",
      merge: "Merge PDFs",
      info: "All processing happens locally on your device",
    },
  };

  const t = translations[currentLang] || translations.en;

  // Update UI text
  const elements = {
    backBtnText: t.back,
    mergeTitle: t.title,
    uploadTitle: t.uploadTitle,
    uploadSubtitle: t.uploadSubtitle,
    browseBtnText: t.browse,
    uploadHint: t.uploadHint,
    statsTitle: t.stats,
    filesLabel: t.files,
    pagesLabel: t.pages,
    sizeLabel: t.size,
    actionsTitle: t.actions,
    addMoreText: t.addMore,
    clearAllText: t.clearAll,
    mergeNowText: t.merge,
    infoText: t.info,
  };

  Object.keys(elements).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = elements[id];
  });
}

// Export for debugging
if (typeof window !== "undefined") {
  window.pdfMergeFeature = { files, rotations };
}
