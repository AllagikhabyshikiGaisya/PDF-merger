const { contextBridge, ipcRenderer } = require("electron");
const path = require("path");

const pdfPath = path.join(__dirname, "node_modules/pdfjs-dist/build/pdf.mjs");
const workerPath = path.join(
  __dirname,
  "node_modules/pdfjs-dist/build/pdf.worker.mjs"
);
const pdfLibPath = path.join(
  __dirname,
  "node_modules/pdf-lib/dist/pdf-lib.min.js"
);

contextBridge.exposeInMainWorld("libs", {
  pdfjsDistPath: pdfPath,
  pdfjsWorkerPath: workerPath,
  pdfLibPath: pdfLibPath,
});

contextBridge.exposeInMainWorld("electronAPI", {
  // Existing functions
  mergeFiles: (files) => ipcRenderer.invoke("merge-files", files),
  mergeFilesChunk: (data) => ipcRenderer.invoke("merge-files-chunk", data),
  saveBytes: (fileName, bytes) =>
    ipcRenderer.invoke("save-bytes", { fileName, bytes }),
  saveBytesBase64: (fileName, base64) =>
    ipcRenderer.invoke("save-bytes-base64", { fileName, base64 }),
  saveSplitFolder: (files) => ipcRenderer.invoke("save-split-folder", files),
  saveSplitFolderBatch: (files, folderPath) =>
    ipcRenderer.invoke("save-split-folder-batch", { files, folderPath }),
  saveSplitFileDirect: (fileName, base64Chunk, isFirst, isLast, folderPath) =>
    ipcRenderer.invoke("save-split-file-direct", {
      fileName,
      base64Chunk,
      isFirst,
      isLast,
      folderPath,
    }),

  onMergeProgress: (callback) => {
    ipcRenderer.on("merge-progress", (event, progress) => callback(progress));
  },

  // Auto-update functions
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  getVersion: () => ipcRenderer.invoke("get-version"),

  // Update status listeners
  onUpdateChecking: (callback) => {
    ipcRenderer.on("update-checking", (event, data) => callback(data));
  },
  onUpdateAvailable: (callback) => {
    ipcRenderer.on("update-available", (event, data) => callback(data));
  },
  onUpdateNotAvailable: (callback) => {
    ipcRenderer.on("update-not-available", (event, data) => callback(data));
  },
  onUpdateError: (callback) => {
    ipcRenderer.on("update-error", (event, data) => callback(data));
  },
  onUpdateProgress: (callback) => {
    ipcRenderer.on("update-progress", (event, data) => callback(data));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on("update-downloaded", (event, data) => callback(data));
  },
});
