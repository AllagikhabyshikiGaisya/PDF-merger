const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { PDFDocument } = require('pdf-lib')

// A4 dimensions in points (1 point = 1/72 inch)
const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89
const MARGIN = 40

function createWindow() {
	const win = new BrowserWindow({
		width: 1280,
		height: 860,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
		},
	})

	win.loadFile('index.html')
	// win.webContents.openDevTools();
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// Helper: normalize buffer-like inputs
function normalizeBuffer(bufLike) {
	if (!bufLike) return Buffer.alloc(0)
	if (Array.isArray(bufLike)) return Buffer.from(bufLike)
	if (bufLike instanceof ArrayBuffer)
		return Buffer.from(new Uint8Array(bufLike))
	if (ArrayBuffer.isView(bufLike)) return Buffer.from(bufLike)
	if (Buffer.isBuffer(bufLike)) return bufLike
	try {
		return Buffer.from(bufLike)
	} catch (e) {
		return Buffer.alloc(0)
	}
}

// Optimized merge handler with better error handling
ipcMain.handle('merge-files', async (event, filesArray) => {
	try {
		if (!filesArray || filesArray.length < 1)
			throw new Error('No files provided')

		const mergedPdf = await PDFDocument.create()

		// Process files sequentially but with optimized loading
		for (const f of filesArray) {
			const name = f.name || 'unknown'
			const type = f.type || ''
			const buffer = normalizeBuffer(f.buffer)
			if (!buffer || buffer.length === 0) continue

			if (type === 'application/pdf' || /\.pdf$/i.test(name)) {
				try {
					const pdfDoc = await PDFDocument.load(buffer, {
						ignoreEncryption: true,
						updateMetadata: false // Skip metadata updates for faster processing
					})
					const pageIndices = pdfDoc.getPageIndices()
					const copied = await mergedPdf.copyPages(pdfDoc, pageIndices)
					copied.forEach(p => mergedPdf.addPage(p))
				} catch (pdfErr) {
					console.error('Error loading PDF:', name, pdfErr)
					continue
				}
			} else if (
				type.startsWith('image/') ||
				/\.(png|jpe?g|jpg)$/i.test(name)
			) {
				try {
					let embedded
					if (type === 'image/jpeg' || /\.jpe?g|jpg$/i.test(name)) {
						embedded = await mergedPdf.embedJpg(buffer)
					} else {
						embedded = await mergedPdf
							.embedPng(buffer)
							.catch(async () => {
								return mergedPdf.embedJpg(buffer)
							})
					}

					// Calculate scaling to fit A4 with margins
					const imgWidth = embedded.width
					const imgHeight = embedded.height
					const maxWidth = A4_WIDTH - (2 * MARGIN)
					const maxHeight = A4_HEIGHT - (2 * MARGIN)

					// Calculate scale to fit within margins while maintaining aspect ratio
					const scaleX = maxWidth / imgWidth
					const scaleY = maxHeight / imgHeight
					const scale = Math.min(scaleX, scaleY)

					const scaledWidth = imgWidth * scale
					const scaledHeight = imgHeight * scale

					// Center the image on the page
					const x = (A4_WIDTH - scaledWidth) / 2
					const y = (A4_HEIGHT - scaledHeight) / 2

					// Create A4 page
					const page = mergedPdf.addPage([A4_WIDTH, A4_HEIGHT])

					// Draw image centered and scaled
					page.drawImage(embedded, {
						x: x,
						y: y,
						width: scaledWidth,
						height: scaledHeight,
					})
				} catch (imgErr) {
					console.warn('Image embed failed:', name, imgErr)
				}
			}
		}

		// Save with optimizations
		const mergedBytes = await mergedPdf.save({
			useObjectStreams: false // Faster saving
		})
		return { success: true, bytes: Array.from(mergedBytes) }
	} catch (err) {
		console.error('Merge error:', err)
		return { success: false, message: err.message || String(err) }
	}
})

// Save arbitrary bytes as file
ipcMain.handle('save-bytes', async (event, { fileName, bytes }) => {
	try {
		const { canceled, filePath } = await dialog.showSaveDialog({
			title: 'Save PDF',
			defaultPath: fileName || 'merged.pdf',
			filters: [{ name: 'PDF', extensions: ['pdf'] }],
		})
		if (canceled || !filePath) return { success: false, message: 'canceled' }

		// Use writeFile with promises for better performance
		await fs.promises.writeFile(filePath, Buffer.from(bytes))
		return { success: true, path: filePath }
	} catch (err) {
		console.error('save-bytes error', err)
		return { success: false, message: err.message || String(err) }
	}
})
