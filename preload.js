const { contextBridge, ipcRenderer } = require('electron');

const path = require('path');
const pdfPath = path.join(__dirname, 'node_modules/pdfjs-dist/build/pdf.mjs');
const workerPath = path.join(__dirname, 'node_modules/pdfjs-dist/build/pdf.worker.mjs');
const pdfLibPath = path.join(__dirname, 'node_modules/pdf-lib/dist/pdf-lib.min.js');

contextBridge.exposeInMainWorld("libs", {
    pdfjsDistPath: pdfPath,
    pdfjsWorkerPath: workerPath,
    pdfLibPath: pdfLibPath
});

contextBridge.exposeInMainWorld("electronAPI", {
    mergeFiles: (files) => ipcRenderer.invoke("merge-files", files),
    saveBytes: (fileName, bytes) =>
        ipcRenderer.invoke("save-bytes", { fileName, bytes }),
    onMergeProgress: (callback) => {
        ipcRenderer.on('merge-progress', (event, progress) => callback(progress));
    }
});
