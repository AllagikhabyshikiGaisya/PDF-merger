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

// Helper: normalize buffer-like inputs (optimized)
function normalizeBuffer(bufLike) {
	if (!bufLike) return Buffer.alloc(0)
	if (Buffer.isBuffer(bufLike)) return bufLike
	if (Array.isArray(bufLike)) return Buffer.from(bufLike)
	if (bufLike instanceof ArrayBuffer) return Buffer.from(bufLike)
	if (ArrayBuffer.isView(bufLike)) return Buffer.from(bufLike.buffer, bufLike.byteOffset, bufLike.byteLength)
	try {
		return Buffer.from(bufLike)
	} catch (e) {
		return Buffer.alloc(0)
	}
}

// Optimized merge handler with parallel processing
ipcMain.handle('merge-files', async (event, filesArray) => {
	try {
		if (!filesArray || filesArray.length < 1)
			throw new Error('No files provided')

		const mergedPdf = await PDFDocument.create()

		// Process files in parallel batches of 3
		const BATCH_SIZE = 3
		for (let i = 0; i < filesArray.length; i += BATCH_SIZE) {
			const batch = filesArray.slice(i, i + BATCH_SIZE)

			const processedPages = await Promise.all(
				batch.map(async (f) => {
					const name = f.name || 'unknown'
					const type = f.type || ''
					const buffer = normalizeBuffer(f.buffer)
					if (!buffer || buffer.length === 0) return null

					try {
						if (type === 'application/pdf' || /\.pdf$/i.test(name)) {
							// Load PDF with optimizations
							const pdfDoc = await PDFDocument.load(buffer, {
								ignoreEncryption: true,
								updateMetadata: false,
								throwOnInvalidObject: false
							})
							return { type: 'pdf', doc: pdfDoc }
						} else if (type.startsWith('image/') || /\.(png|jpe?g|jpg)$/i.test(name)) {
							// Embed image
							let embedded
							if (type === 'image/jpeg' || /\.jpe?g|jpg$/i.test(name)) {
								embedded = await mergedPdf.embedJpg(buffer)
							} else {
								try {
									embedded = await mergedPdf.embedPng(buffer)
								} catch {
									embedded = await mergedPdf.embedJpg(buffer)
								}
							}

							// Calculate scaling
							const imgWidth = embedded.width
							const imgHeight = embedded.height
							const maxWidth = A4_WIDTH - (2 * MARGIN)
							const maxHeight = A4_HEIGHT - (2 * MARGIN)

							const scaleX = maxWidth / imgWidth
							const scaleY = maxHeight / imgHeight
							const scale = Math.min(scaleX, scaleY)

							const scaledWidth = imgWidth * scale
							const scaledHeight = imgHeight * scale

							const x = (A4_WIDTH - scaledWidth) / 2
							const y = (A4_HEIGHT - scaledHeight) / 2

							return {
								type: 'image',
								embedded,
								x,
								y,
								width: scaledWidth,
								height: scaledHeight
							}
						}
					} catch (err) {
						console.error('Error processing file:', name, err.message)
						return null
					}

					return null
				})
			)

			// Add processed pages to merged PDF
			for (const processed of processedPages) {
				if (!processed) continue

				if (processed.type === 'pdf') {
					const pageIndices = processed.doc.getPageIndices()
					const copied = await mergedPdf.copyPages(processed.doc, pageIndices)
					copied.forEach(p => mergedPdf.addPage(p))
				} else if (processed.type === 'image') {
					const page = mergedPdf.addPage([A4_WIDTH, A4_HEIGHT])
					page.drawImage(processed.embedded, {
						x: processed.x,
						y: processed.y,
						width: processed.width,
						height: processed.height,
					})
				}
			}

			// Send progress update
			const progress = Math.round(((i + batch.length) / filesArray.length) * 100)
			event.sender.send('merge-progress', progress)
		}

		// Save with optimizations
		const mergedBytes = await mergedPdf.save({
			useObjectStreams: false,
			addDefaultPage: false,
			objectsPerTick: 50
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

		await fs.promises.writeFile(filePath, Buffer.from(bytes))
		return { success: true, path: filePath }
	} catch (err) {
		console.error('save-bytes error', err)
		return { success: false, message: err.message || String(err) }
	}
})
