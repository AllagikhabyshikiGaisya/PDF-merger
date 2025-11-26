const { contextBridge, ipcRenderer } = require('electron');

// Load pdfjs-dist (ESM build)
const path = require('path');
const pdfPath = path.join(__dirname, 'node_modules/pdfjs-dist/build/pdf.mjs');
const workerPath = path.join(__dirname, 'node_modules/pdfjs-dist/build/pdf.worker.mjs');

// We'll load pdf-lib dynamically in the renCommonJS issues
const pdfLibPath = path.join(__dirname, 'node_modules/pdf-lib/dist/pdf-lib.min.js');

contextBridge.exposeInMainWorld("libs", {
    pdfjsDistPath: pdfPath,
    pdfjsWorkerPath: workerPath,
    pdfLibPath: pdfLibPath
});

contextBridge.exposeInMainWorld("electronAPI", {
    mergeFiles: (files) => ipcRenderer.invoke("merge-files", files),
    saveBytes: (fileName, bytes) =>
        ipcRenderer.invoke("save-bytes", { fileName, bytes })
});
