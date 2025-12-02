const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const { PDFDocument } = require("pdf-lib");

// A4 dimensions in points (1 point = 1/72 inch)
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 40;

// ============= LOGGING =============
const log = require("electron-log");
log.transports.file.level = "info";
autoUpdater.logger = log;

// ============= AUTO-UPDATE CONFIGURATION =============
let mainWindow = null;
let updateCheckInProgress = false;

// Configure auto-updater
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
    transferred: Math.round((progressObj.transferred / 1024 / 1024) * 10) / 10,
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

function sendStatusToWindow(channel, data) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send(channel, data);
  }
}

// Check for updates (only in production)
function checkForUpdates(showNoUpdateDialog = false) {
  if (!app.isPackaged) {
    log.info("Skipping update check - running in development mode");
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
function createMenu() {
  const template = [
    {
      label: "File",
      submenu: [{ role: "quit" }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Check for Updates",
          click: () => {
            checkForUpdates(true);
          },
        },
        { type: "separator" },
        {
          label: "About",
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "About PDF Merger",
              message: "PDF Merger",
              detail: `Version: ${app.getVersion()}\n\nLocal PDF & Image Merger\nAll processing happens on your computer\n\nDeveloped by Utsav Adhikari\nLicense: MIT`,
              buttons: ["OK"],
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ============= WINDOW MANAGEMENT =============
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
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
    if (app.isPackaged) {
      setTimeout(() => {
        checkForUpdates(false);
      }, 3000);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Create menu
  createMenu();
}

app.whenReady().then(createWindow);

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
  if (!app.isPackaged) {
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

    const mergedPdf = await PDFDocument.create();

    const BATCH_SIZE = 3;
    for (let i = 0; i < filesArray.length; i += BATCH_SIZE) {
      const batch = filesArray.slice(i, i + BATCH_SIZE);

      const processedPages = await Promise.all(
        batch.map(async (f) => {
          const name = f.name || "unknown";
          const type = f.type || "";
          const buffer = normalizeBuffer(f.buffer);
          if (!buffer || buffer.length === 0) return null;

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

      const progress = Math.round(
        ((i + batch.length) / filesArray.length) * 100
      );
      event.sender.send("merge-progress", progress);
    }

    const mergedBytes = await mergedPdf.save({
      useObjectStreams: false,
      addDefaultPage: false,
      objectsPerTick: 50,
    });

    return { success: true, bytes: Array.from(mergedBytes) };
  } catch (err) {
    console.error("Merge error:", err);
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

    await fs.promises.writeFile(filePath, Buffer.from(bytes));
    return { success: true, path: filePath };
  } catch (err) {
    console.error("save-bytes error", err);
    return { success: false, message: err.message || String(err) };
  }
});
