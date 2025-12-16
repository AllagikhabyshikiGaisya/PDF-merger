const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { PDFDocument } = require("pdf-lib");

// Electron hot reload - moved AFTER app import
if (!app.isPackaged) {
  require("electron-reload")(__dirname, {
    electron: require("path").join(
      __dirname,
      "node_modules",
      ".bin",
      "electron"
    ),
    hardResetMethod: "exit",
    ignore: /node_modules|[\/\\]\.|dist|build/,
    forceHardReset: ["main.js", "preload.js"],
  });
}

// A4 dimensions in points (1 point = 1/72 inch)
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 40;

function enableLiveReload() {
  if (!app.isPackaged) {
    if (process.stdin) {
      process.stdin.on("data", (data) => {
        if (data.toString().trim() === "reload") {
          BrowserWindow.getAllWindows().forEach((window) => {
            window.webContents.reloadIgnoringCache();
          });
          console.log("🔄 Renderer reloaded");
        }
      });
    }
  }
}

// ============= LOGGING & AUTO-UPDATE =============
let autoUpdater = null;
let log = null;

// Only load updater in production (packaged app)
if (app.isPackaged) {
  try {
    autoUpdater = require("electron-updater").autoUpdater;
    log = require("electron-log");
    log.transports.file.level = "info";
    autoUpdater.logger = log;
  } catch (error) {
    console.error("Could not load electron-updater:", error.message);
  }
} else {
  console.log("Running in development mode - auto-update disabled");
}

// ============= AUTO-UPDATE CONFIGURATION =============
let mainWindow = null;
let updateCheckInProgress = false;

// Configure auto-updater (only if available)
if (autoUpdater) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  // Update event handlers
  autoUpdater.on("checking-for-update", () => {
    log.info("Checking for updates...");
    sendStatusToWindow("update-checking", "Checking for updates...");
  });

  autoUpdater.on("update-available", (info) => {
    log.info("Update available:", info.version);
    sendStatusToWindow("update-available", {
      version: info.version,
      releaseDate: info.releaseDate,
      size: info.files[0]?.size || 0,
    });

    // Ask user if they want to download
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Update Available",
        message: `New version ${info.version} is available!`,
        detail: `Current version: ${app.getVersion()}\n\nWould you like to download it now? The app will continue working while downloading.`,
        buttons: ["Download Now", "Remind Me Later"],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate();
          sendStatusToWindow("update-downloading", "Downloading update...");
        }
      });
  });

  autoUpdater.on("update-not-available", (info) => {
    log.info("No updates available");
    sendStatusToWindow(
      "update-not-available",
      "You are using the latest version"
    );
    updateCheckInProgress = false;
  });

  autoUpdater.on("error", (err) => {
    log.error("Update error:", err);
    sendStatusToWindow("update-error", err.message);
    updateCheckInProgress = false;
  });

  autoUpdater.on("download-progress", (progressObj) => {
    const message = {
      percent: Math.round(progressObj.percent),
      transferred:
        Math.round((progressObj.transferred / 1024 / 1024) * 10) / 10,
      total: Math.round((progressObj.total / 1024 / 1024) * 10) / 10,
      bytesPerSecond: Math.round(progressObj.bytesPerSecond / 1024),
    };
    log.info(`Download progress: ${message.percent}%`);
    sendStatusToWindow("update-progress", message);
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info("Update downloaded:", info.version);
    sendStatusToWindow("update-downloaded", info.version);

    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        title: "Update Ready",
        message: "Update downloaded successfully!",
        detail: `Version ${info.version} has been downloaded and is ready to install.\n\nThe application will restart to complete the installation.`,
        buttons: ["Restart Now", "Restart Later"],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        if (result.response === 0) {
          setImmediate(() => {
            app.removeAllListeners("window-all-closed");
            autoUpdater.quitAndInstall(false, true);
          });
        }
      });
  });
}

function sendStatusToWindow(channel, data) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send(channel, data);
  }
}

// Check for updates (only in production)
function checkForUpdates(showNoUpdateDialog = false) {
  if (!app.isPackaged || !autoUpdater) {
    console.log("Auto-update not available");
    if (showNoUpdateDialog) {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Updates Not Available",
        message: "Auto-update is only available in the installed version",
        buttons: ["OK"],
      });
    }
    return;
  }

  if (updateCheckInProgress) {
    log.info("Update check already in progress");
    return;
  }

  updateCheckInProgress = true;

  autoUpdater
    .checkForUpdates()
    .then((result) => {
      if (showNoUpdateDialog && !result.updateInfo.version) {
        dialog.showMessageBox(mainWindow, {
          type: "info",
          title: "No Updates",
          message: "You are already using the latest version!",
          buttons: ["OK"],
        });
      }
    })
    .catch((err) => {
      log.error("Update check failed:", err);
      updateCheckInProgress = false;
      if (showNoUpdateDialog) {
        dialog.showMessageBox(mainWindow, {
          type: "error",
          title: "Update Check Failed",
          message: "Could not check for updates",
          detail: err.message,
          buttons: ["OK"],
        });
      }
    });
}

// ============= MENU =============
// function createMenu() {
//   const template = [
//     {
//       label: "File",
//       submenu: [{ role: "quit" }],
//     },
//     {
//       label: "Edit",
//       submenu: [
//         { role: "undo" },
//         { role: "redo" },
//         { type: "separator" },
//         { role: "cut" },
//         { role: "copy" },
//         { role: "paste" },
//       ],
//     },
//     {
//       label: "View",
//       submenu: [
//         { role: "reload" },
//         { role: "forceReload" },
//         { role: "toggleDevTools" },
//         { type: "separator" },
//         { role: "resetZoom" },
//         { role: "zoomIn" },
//         { role: "zoomOut" },
//         { type: "separator" },
//         { role: "togglefullscreen" },
//       ],
//     },
//     {
//       label: "Help",
//       submenu: [
//         {
//           label: "Check for Updates",
//           click: () => {
//             checkForUpdates(true);
//           },
//         },
//         { type: "separator" },
//         {
//           label: "About",
//           click: () => {
//             dialog.showMessageBox(mainWindow, {
//               type: "info",
//               title: "About PDF Merger",
//               message: "PDF Merger",
//               detail: `Version: ${app.getVersion()}\n\nLocal PDF & Image Merger\nAll processing happens on your computer\n\nDeveloped by Utsav Adhikari\nLicense: MIT`,
//               buttons: ["OK"],
//             });
//           },
//         },
//       ],
//     },
//   ];

//   const menu = Menu.buildFromTemplate(template);
//   Menu.setApplicationMenu(menu);
// }

// ============= WINDOW MANAGEMENT =============
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(__dirname, "icon.png"),
    show: false, // Don't show until ready
  });

  mainWindow.loadFile("index.html");

  // Show window when ready to prevent flickering
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();

    // Check for updates 3 seconds after app starts
    if (app.isPackaged && autoUpdater) {
      setTimeout(() => {
        checkForUpdates(false);
      }, 3000);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Create menu
  // createMenu();
}

app.whenReady().then(() => {
  createWindow();
  enableLiveReload();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ============= IPC HANDLERS =============

// Manual update check
ipcMain.handle("check-for-updates", async () => {
  if (!app.isPackaged || !autoUpdater) {
    return {
      available: false,
      message: "Updates only work in production build",
      currentVersion: app.getVersion(),
    };
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({
        available: false,
        error: "Update check timeout",
        currentVersion: app.getVersion(),
      });
    }, 10000);

    autoUpdater
      .checkForUpdates()
      .then((result) => {
        clearTimeout(timeout);
        const updateAvailable = result.updateInfo.version !== app.getVersion();
        resolve({
          available: updateAvailable,
          currentVersion: app.getVersion(),
          latestVersion: result.updateInfo.version,
          releaseDate: result.updateInfo.releaseDate,
        });
      })
      .catch((error) => {
        clearTimeout(timeout);
        resolve({
          available: false,
          error: error.message,
          currentVersion: app.getVersion(),
        });
      });
  });
});

// Get current version
ipcMain.handle("get-version", async () => {
  return {
    version: app.getVersion(),
    name: app.getName(),
    isPackaged: app.isPackaged,
  };
});

// ============= PDF MERGING =============
function normalizeBuffer(bufLike) {
  if (!bufLike) return Buffer.alloc(0);
  if (Buffer.isBuffer(bufLike)) return bufLike;
  if (Array.isArray(bufLike)) return Buffer.from(bufLike);
  if (bufLike instanceof ArrayBuffer) return Buffer.from(bufLike);
  if (ArrayBuffer.isView(bufLike))
    return Buffer.from(bufLike.buffer, bufLike.byteOffset, bufLike.byteLength);
  try {
    return Buffer.from(bufLike);
  } catch (e) {
    return Buffer.alloc(0);
  }
}

ipcMain.handle("merge-files", async (event, filesArray) => {
  try {
    if (!filesArray || filesArray.length < 1)
      throw new Error("No files provided");

    // ✅ Debug: Log incoming files
    console.log(
      `🔧 Main process: Received ${filesArray.length} files to merge`
    );
    filesArray.forEach((f, i) => {
      const bufferSize = f.buffer?.byteLength || f.buffer?.length || 0;
      console.log(
        `  File ${i + 1}: ${f.name} (${f.type}) - ${bufferSize} bytes`
      );
    });

    const mergedPdf = await PDFDocument.create();
    const BATCH_SIZE = 3;

    for (let i = 0; i < filesArray.length; i += BATCH_SIZE) {
      const batch = filesArray.slice(i, i + BATCH_SIZE);

      // Send progress BEFORE processing batch
      const startProgress = Math.round((i / filesArray.length) * 100);
      event.sender.send("merge-progress", startProgress);

      const processedPages = await Promise.all(
        batch.map(async (f) => {
          const name = f.name || "unknown";
          const type = f.type || "";
          const buffer = normalizeBuffer(f.buffer);

          if (!buffer || buffer.length === 0) {
            console.warn(`⚠️ Empty buffer for ${name}`);
            return null;
          }

          try {
            if (type === "application/pdf" || /\.pdf$/i.test(name)) {
              const pdfDoc = await PDFDocument.load(buffer, {
                ignoreEncryption: true,
                updateMetadata: false,
                throwOnInvalidObject: false,
              });
              return { type: "pdf", doc: pdfDoc };
            } else if (
              type.startsWith("image/") ||
              /\.(png|jpe?g|jpg)$/i.test(name)
            ) {
              let embedded;
              if (type === "image/jpeg" || /\.jpe?g|jpg$/i.test(name)) {
                embedded = await mergedPdf.embedJpg(buffer);
              } else {
                try {
                  embedded = await mergedPdf.embedPng(buffer);
                } catch {
                  embedded = await mergedPdf.embedJpg(buffer);
                }
              }

              const imgWidth = embedded.width;
              const imgHeight = embedded.height;
              const maxWidth = A4_WIDTH - 2 * MARGIN;
              const maxHeight = A4_HEIGHT - 2 * MARGIN;

              const scaleX = maxWidth / imgWidth;
              const scaleY = maxHeight / imgHeight;
              const scale = Math.min(scaleX, scaleY);

              const scaledWidth = imgWidth * scale;
              const scaledHeight = imgHeight * scale;

              const x = (A4_WIDTH - scaledWidth) / 2;
              const y = (A4_HEIGHT - scaledHeight) / 2;

              return {
                type: "image",
                embedded,
                x,
                y,
                width: scaledWidth,
                height: scaledHeight,
              };
            }
          } catch (err) {
            console.error("Error processing file:", name, err.message);
            return null;
          }

          return null;
        })
      );

      for (const processed of processedPages) {
        if (!processed) continue;

        if (processed.type === "pdf") {
          const pageIndices = processed.doc.getPageIndices();
          const copied = await mergedPdf.copyPages(processed.doc, pageIndices);
          copied.forEach((p) => mergedPdf.addPage(p));
        } else if (processed.type === "image") {
          const page = mergedPdf.addPage([A4_WIDTH, A4_HEIGHT]);
          page.drawImage(processed.embedded, {
            x: processed.x,
            y: processed.y,
            width: processed.width,
            height: processed.height,
          });
        }
      }

      // Send progress AFTER processing batch
      const endProgress = Math.round(
        ((i + batch.length) / filesArray.length) * 100
      );
      event.sender.send("merge-progress", endProgress);

      // ✅ Smaller yield for smoother UI
      await new Promise((resolve) => setImmediate(resolve));
    }

    const mergedBytes = await mergedPdf.save({
      useObjectStreams: false,
      addDefaultPage: false,
      objectsPerTick: 50,
    });

    // ✅ Debug: Verify output
    console.log(
      `✅ Main process: Merged PDF created - ${mergedBytes.length} bytes`
    );
    console.log(`  Pages: ${mergedPdf.getPageCount()}`);

    return { success: true, bytes: Array.from(mergedBytes) };
  } catch (err) {
    console.error("Merge error:", err);
    return { success: false, message: err.message || String(err) };
  }
});

// ============= PERFORMANCE-TRACKED CHUNKED PDF MERGING =============
ipcMain.handle("merge-files-chunk", async (event, { files, existingPdf }) => {
  const chunkStartTime = Date.now();
  const timings = {};

  try {
    if (!files || files.length < 1) throw new Error("No files provided");

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🔧 CHUNK START: ${files.length} files`);
    console.log(`${"=".repeat(60)}`);

    // TIMING 1: PDF Loading
    const loadStartTime = Date.now();
    let mergedPdf;
    if (existingPdf && existingPdf.length > 0) {
      mergedPdf = await PDFDocument.load(Buffer.from(existingPdf), {
        ignoreEncryption: true,
        updateMetadata: false,
      });
      console.log(`📄 Continuing from ${mergedPdf.getPageCount()} pages`);
    } else {
      mergedPdf = await PDFDocument.create();
    }
    timings.pdfLoad = Date.now() - loadStartTime;

    // TIMING 2: File Processing (Parallel)
    const processStartTime = Date.now();
    const results = await Promise.allSettled(
      files.map(async (f) => {
        const fileStartTime = Date.now();
        const name = f.name || "unknown";
        const type = f.type || "";
        const buffer = normalizeBuffer(f.buffer);

        if (!buffer || buffer.length === 0) {
          console.warn(`⚠️  Empty buffer: ${name}`);
          return null;
        }

        try {
          if (type === "application/pdf" || /\.pdf$/i.test(name)) {
            const pdfDoc = await PDFDocument.load(buffer, {
              ignoreEncryption: true,
              updateMetadata: false,
              throwOnInvalidObject: false,
            });
            const fileTime = Date.now() - fileStartTime;
            console.log(
              `   ✓ PDF loaded: ${name} (${fileTime}ms, ${pdfDoc.getPageCount()} pages)`
            );
            return { type: "pdf", doc: pdfDoc, name, loadTime: fileTime };
          } else if (
            type.startsWith("image/") ||
            /\.(png|jpe?g|jpg)$/i.test(name)
          ) {
            const fileTime = Date.now() - fileStartTime;
            console.log(
              `   ✓ Image loaded: ${name} (${fileTime}ms, ${Math.round(
                buffer.length / 1024
              )}KB)`
            );
            return {
              type: "image",
              buffer,
              name,
              mimeType: type,
              loadTime: fileTime,
            };
          }
        } catch (err) {
          const fileTime = Date.now() - fileStartTime;
          console.warn(`   ✗ Failed: ${name} (${fileTime}ms) - ${err.message}`);
          return null;
        }
        return null;
      })
    );
    timings.fileProcessing = Date.now() - processStartTime;

    // TIMING 3: Result Collection
    const collectStartTime = Date.now();
    const validResults = results
      .filter(
        (r) =>
          r.status === "fulfilled" && r.value !== null && r.value !== undefined
      )
      .map((r) => r.value);
    timings.resultCollection = Date.now() - collectStartTime;

    const skippedCount = files.length - validResults.length;
    console.log(
      `\n📊 Loaded: ${validResults.length}/${files.length} files ${
        skippedCount > 0 ? `(skipped ${skippedCount})` : ""
      }`
    );

    // TIMING 4: PDF Assembly
    const assemblyStartTime = Date.now();
    let pdfCount = 0;
    let imageCount = 0;

    for (const result of validResults) {
      if (result.type === "pdf") {
        const pageIndices = result.doc.getPageIndices();
        const copied = await mergedPdf.copyPages(result.doc, pageIndices);
        copied.forEach((p) => mergedPdf.addPage(p));
        pdfCount++;
      } else if (result.type === "image") {
        let embedded;
        if (
          result.mimeType === "image/jpeg" ||
          /\.jpe?g|jpg$/i.test(result.name)
        ) {
          embedded = await mergedPdf.embedJpg(result.buffer);
        } else {
          try {
            embedded = await mergedPdf.embedPng(result.buffer);
          } catch {
            embedded = await mergedPdf.embedJpg(result.buffer);
          }
        }

        const imgWidth = embedded.width;
        const imgHeight = embedded.height;
        const maxWidth = A4_WIDTH - 2 * MARGIN;
        const maxHeight = A4_HEIGHT - 2 * MARGIN;
        const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
        const scaledWidth = imgWidth * scale;
        const scaledHeight = imgHeight * scale;

        const page = mergedPdf.addPage([A4_WIDTH, A4_HEIGHT]);
        page.drawImage(embedded, {
          x: (A4_WIDTH - scaledWidth) / 2,
          y: (A4_HEIGHT - scaledHeight) / 2,
          width: scaledWidth,
          height: scaledHeight,
        });
        imageCount++;
      }
    }
    timings.pdfAssembly = Date.now() - assemblyStartTime;

    // TIMING 5: PDF Save
    const saveStartTime = Date.now();
    const mergedBytes = await mergedPdf.save({
      useObjectStreams: false,
      addDefaultPage: false,
      objectsPerTick: 100,
    });
    timings.pdfSave = Date.now() - saveStartTime;

    // TIMING 6: Array Conversion
    const convertStartTime = Date.now();
    const bytesArray = Array.from(mergedBytes);
    timings.arrayConversion = Date.now() - convertStartTime;

    const totalTime = Date.now() - chunkStartTime;

    // Performance Summary
    console.log(`\n⏱️  PERFORMANCE BREAKDOWN:`);
    console.log(`   PDF Load:          ${timings.pdfLoad}ms`);
    console.log(`   File Processing:   ${timings.fileProcessing}ms (parallel)`);
    console.log(`   Result Collection: ${timings.resultCollection}ms`);
    console.log(
      `   PDF Assembly:      ${timings.pdfAssembly}ms (${pdfCount} PDFs, ${imageCount} images)`
    );
    console.log(`   PDF Save:          ${timings.pdfSave}ms`);
    console.log(`   Array Conversion:  ${timings.arrayConversion}ms`);
    console.log(`   ─────────────────────────────────────`);
    console.log(`   TOTAL TIME:        ${totalTime}ms`);
    console.log(
      `\n✅ Output: ${Math.round(
        mergedBytes.length / 1024 / 1024
      )}MB, ${mergedPdf.getPageCount()} pages`
    );
    console.log(`${"=".repeat(60)}\n`);

    return { success: true, bytes: bytesArray };
  } catch (err) {
    const totalTime = Date.now() - chunkStartTime;
    console.error(`\n❌ CHUNK FAILED after ${totalTime}ms:`, err.message);
    console.error(`   Timings so far:`, timings);
    console.error(`${"=".repeat(60)}\n`);
    return { success: false, message: err.message || String(err) };
  }
});

ipcMain.handle("save-bytes", async (event, { fileName, bytes }) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Save PDF",
      defaultPath: fileName || "merged.pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (canceled || !filePath) return { success: false, message: "canceled" };

    // ✅ Handle both Array and Uint8Array efficiently
    const buffer =
      bytes instanceof Uint8Array
        ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        : Buffer.from(bytes);

    await fs.promises.writeFile(filePath, buffer);
    return { success: true, path: filePath };
  } catch (err) {
    console.error("save-bytes error", err);
    return { success: false, message: err.message || String(err) };
  }
});

ipcMain.handle("save-bytes-base64", async (event, { fileName, base64 }) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Save PDF",
      defaultPath: fileName || "merged.pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (canceled || !filePath) return { success: false, message: "canceled" };

    // Convert base64 directly to buffer
    const buffer = Buffer.from(base64, "base64");

    await fs.promises.writeFile(filePath, buffer);
    return { success: true, path: filePath };
  } catch (err) {
    console.error("save-bytes-base64 error", err);
    return { success: false, message: err.message || String(err) };
  }
});
// Add this after the save-bytes handler (around line 450)
ipcMain.handle("save-split-folder", async (event, files) => {
  try {
    // Create timestamp-based folder name: YYYYMMDD_HHMM_split
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hour = String(now.getHours()).padStart(2, "0");
    const minute = String(now.getMinutes()).padStart(2, "0");
    const folderName = `${year}${month}${day}_${hour}${minute}_split`;

    // Get user's Downloads folder
    const downloadsPath = app.getPath("downloads");

    // Create full folder path
    let folderPath = path.join(downloadsPath, folderName);

    // Check if folder exists, if so add counter
    let counter = 1;
    while (fs.existsSync(folderPath)) {
      folderPath = path.join(downloadsPath, `${folderName}_${counter}`);
      counter++;
    }

    // Create the folder
    await fs.promises.mkdir(folderPath, { recursive: true });

    // Save all files into the folder
    for (const file of files) {
      const filePath = path.join(folderPath, file.name);
      const buffer = Buffer.from(file.bytes);
      await fs.promises.writeFile(filePath, buffer);
    }

    return { success: true, path: folderPath };
  } catch (err) {
    console.error("save-split-folder error:", err);
    return { success: false, message: err.message || String(err) };
  }
});
// Add this new handler after save-split-folder
ipcMain.handle(
  "save-split-folder-batch",
  async (event, { files, folderPath }) => {
    try {
      let targetFolder = folderPath;

      // Create folder on first batch
      if (!targetFolder) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        const hour = String(now.getHours()).padStart(2, "0");
        const minute = String(now.getMinutes()).padStart(2, "0");
        const folderName = `${year}${month}${day}_${hour}${minute}_split`;

        const downloadsPath = app.getPath("downloads");
        targetFolder = path.join(downloadsPath, folderName);

        let counter = 1;
        while (fs.existsSync(targetFolder)) {
          targetFolder = path.join(downloadsPath, `${folderName}_${counter}`);
          counter++;
        }

        await fs.promises.mkdir(targetFolder, { recursive: true });
      }

      // Save files in this batch
      for (const file of files) {
        const filePath = path.join(targetFolder, file.name);
        const buffer = Buffer.from(file.bytes);
        await fs.promises.writeFile(filePath, buffer);
      }

      return { success: true, path: targetFolder };
    } catch (err) {
      console.error("save-split-folder-batch error:", err);
      return { success: false, message: err.message || String(err) };
    }
  }
);

// ============= LARGE FILE SPLIT HANDLER (STREAMING) =============
ipcMain.handle(
  "save-split-file-direct",
  async (event, { fileName, base64Chunk, isFirst, isLast, folderPath }) => {
    try {
      let targetFolder = folderPath;

      // Create folder on first chunk
      if (isFirst && !folderPath) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        const hour = String(now.getHours()).padStart(2, "0");
        const minute = String(now.getMinutes()).padStart(2, "0");
        const folderName = `${year}${month}${day}_${hour}${minute}_split`;

        const downloadsPath = app.getPath("downloads");
        targetFolder = path.join(downloadsPath, folderName);

        let counter = 1;
        while (fs.existsSync(targetFolder)) {
          targetFolder = path.join(downloadsPath, `${folderName}_${counter}`);
          counter++;
        }

        await fs.promises.mkdir(targetFolder, { recursive: true });
      }

      const filePath = path.join(targetFolder, fileName);
      const buffer = Buffer.from(base64Chunk, "base64");

      // Append or create file
      if (isFirst) {
        await fs.promises.writeFile(filePath, buffer);
      } else {
        await fs.promises.appendFile(filePath, buffer);
      }

      return {
        success: true,
        path: targetFolder,
        fileComplete: isLast,
      };
    } catch (err) {
      console.error("save-split-file-direct error:", err);
      return { success: false, message: err.message || String(err) };
    }
  }
);
