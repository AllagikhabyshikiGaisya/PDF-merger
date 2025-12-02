# PDF Merger - ローカル高速PDF結合ツール

<div align="center">

![PDF Merger](https://img.shields.io/badge/PDF-Merger-blue?style=for-the-badge&logo=adobe-acrobat-reader)
![Version](https://img.shields.io/badge/version-1.0.1-green?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-orange?style=for-the-badge)
![Platform](https://img.shields.io/badge/platform-Windows-blue?style=for-the-badge&logo=windows)

**A fast, local PDF merger with bilingual support (Japanese/English)**

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [Building](#-building-from-source) • [License](#-license)

</div>

---

## 📖 Overview

PDF Merger is a desktop application that allows you to merge multiple PDF files and images into a single PDF document. All processing happens locally on your computer - no uploads, no internet connection required.

### ✨ Key Highlights

- 🔒 **100% Local Processing** - Your files never leave your computer
- ⚡ **Fast & Efficient** - Optimized image processing
- 🌏 **Bilingual Interface** - Toggle between Japanese and English
- 📄 **Multiple Formats** - Supports PDF, PNG, JPG, JPEG
- 🎨 **A4 Standardization** - All images scaled to A4 size
- 🖱️ **Drag & Drop** - Intuitive file management
- 🔄 **Reorderable** - Arrange files in any order

---

## 🚀 Features

### Core Functionality

- **Merge Multiple Files**: Combine unlimited PDFs and images
- **Format Support**: PDF, PNG, JPG, JPEG
- **Smart Image Scaling**: Automatically scales images to A4 dimensions
- **Thumbnail Preview**: See image previews in the interface
- **Drag & Drop Reordering**: Easily arrange file order
- **Individual File Removal**: Remove unwanted files before merging
- **Batch Clear**: Clear all files at once
- **Status Indicators**: Real-time processing feedback
- **File Information**: View file type and size for each file

### Technical Features

- **Client-Side Processing**: No server required
- **Optimized Image Compression**: JPEG compression for speed
- **A4 Page Standardization**: All output pages in A4 format (595 × 842 points)
- **Centered Image Layout**: Professional margins and centering
- **ArrayBuffer Transfer**: Efficient binary data handling
- **Error Handling**: Graceful failure recovery

---

## 📦 Installation

### For Users (Pre-built Package)

1. **Download** the latest release from the `dist` folder
2. **Extract** the ZIP file to your desired location
3. **Run** `PDFMerger.exe`

That's it! No installation required.

### System Requirements

**Minimum:**
- Windows 7 or later
- 2GB RAM
- 200MB disk space

**Recommended:**
- Windows 10/11
- 4GB RAM
- 1GB free disk space

---

## 🎯 Usage

### Quick Start

1. **Add Files**
   - Click "Add files" button, or
   - Drag & drop files into the application

2. **Arrange Order**
   - Drag file cards to reorder
   - Click × to remove individual files

3. **Merge**
   - Click "Merge files" button
   - Choose save location
   - Done!

### Supported File Types

| Format | Extension | Notes |
|--------|-----------|-------|
| PDF | `.pdf` | Original quality preserved |
| PNG | `.png` | Converted to JPEG, scaled to A4 |
| JPEG | `.jpg`, `.jpeg` | Scaled to A4 |

### Language Toggle

Click the 🇯🇵/🇺🇸 button in the bottom-right corner to switch between Japanese and English.

---

## 🛠️ Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) (v14 or later)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- Windows OS (for packaging)

### Installation Steps

```bash
# Clone the repository
git clone https://github.com/yourusername/pdf-merger.git
cd pdf-merger

# Install dependencies
npm install
```

### Development

```bash
# Run in development mode
npm start
```

### Building for Production

```bash
# Build Windows executable
npm run package-win

# Output will be in the 'dist' folder
# Look for: PDFMerger-win32-x64 or PDFMerger-win32-ia32
```

---

## 📁 Project Structure

```
pdf-merger/
├── main.js              # Electron main process
├── preload.js           # Preload script for IPC
├── renderer.js          # Frontend logic
├── index.html           # UI structure
├── style.css            # Styling
├── package.json         # Project configuration
├── package-lock.json    # Dependency lock file
├── README.md            # This file
└── dist/                # Built executables (after packaging)
```

---

## 🔧 Configuration

### Image Processing Settings

You can modify these constants in `renderer.js`:

```javascript
const MAX_IMAGE_WIDTH = 1654;  // Max width for image optimization
const JPEG_QUALITY = 0.8;      // JPEG compression quality (0.0 - 1.0)
```

### A4 Page Settings

Modify in `main.js`:

```javascript
const A4_WIDTH = 595.28;   // A4 width in points
const A4_HEIGHT = 841.89;  // A4 height in points
const MARGIN = 40;         // Margin in points
```

---

## 🎨 User Interface

### Main Components

- **Top Bar**: Add files, clear all, file count
- **Drop Area**: Drag & drop zone for adding files
- **File Cards**: Display added files with thumbnails
- **Merge Panel**: File summary and merge button
- **Language Toggle**: Switch between Japanese/English
- **Status Bar**: Real-time operation feedback

---

## 🐛 Troubleshooting

### Application Won't Start

- Ensure all files are extracted properly
- Try running as administrator
- Check Windows Defender settings

### Files Not Adding

- Check file format (only PDF, PNG, JPG, JPEG)
- Ensure file is not password-protected
- Try copying file to a simpler path (e.g., `C:\Temp`)

### Merge Fails

- Check available disk space (need 2x total file size)
- Try with smaller files first
- Verify source files are not corrupted

### Image Quality Issues

- Images are automatically scaled to A4 size
- JPEG compression is applied (80% quality)
- For best quality, use PDF source files

---

## 📚 Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| [Electron](https://www.electronjs.org/) | ^39.2.1 | Desktop application framework |
| [pdf-lib](https://pdf-lib.js.org/) | ^1.17.1 | PDF manipulation |
| [electron-packager](https://github.com/electron/electron-packager) | ^17.1.0 | Building executables |

---

## 🔐 Privacy & Security

- ✅ **No data collection** - Zero telemetry
- ✅ **No internet required** - Fully offline
- ✅ **No file uploads** - Everything stays local
- ✅ **No installation tracking** - Portable application
- ✅ **Open source** - Code can be audited

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/AmazingFeature`)
3. **Commit** your changes (`git commit -m 'Add some AmazingFeature'`)
4. **Push** to the branch (`git push origin feature/AmazingFeature`)
5. **Open** a Pull Request

### Development Guidelines

- Follow existing code style
- Test thoroughly before submitting
- Update documentation for new features
- Write clear commit messages

---

## 📝 Changelog

### Version 1.0.1 (Current)
- ✨ Added A4 page standardization for images
- 🐛 Fixed image thumbnail display
- 🎨 Improved image scaling algorithm
- 📦 Optimized binary data transfer

### Version 1.0.0
- 🎉 Initial release
- ✨ Basic PDF merging functionality
- ✨ Image support (PNG, JPEG)
- 🌏 Bilingual interface (Japanese/English)
- 🖱️ Drag & drop support

---

## 🗺️ Roadmap

### Planned Features

- [ ] PDF page extraction
- [ ] Page rotation support
- [ ] Watermark addition
- [ ] PDF compression options
- [ ] Dark mode
- [ ] macOS and Linux support
- [ ] PDF preview before merge
- [ ] Batch processing automation

---

## 💖 Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- PDF manipulation powered by [pdf-lib](https://pdf-lib.js.org/)
- Icons from system emojis

---

## 📄 License

```
MIT License

Copyright (c) 2024 Utsav Adhikari

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 📞 Contact & Support

**Developer**: Utsav Adhikari

- 📧 Email: [Your email here]
- 🐙 GitHub: [@utsavadhikari](https://github.com/utsavadhikari)
- 💼 LinkedIn: [Your LinkedIn]

For bug reports and feature requests, please [open an issue](https://github.com/yourusername/pdf-merger/issues).

---

## ⭐ Show Your Support

If this project helped you, please consider giving it a ⭐ on GitHub!

---

<div align="center">

**Made with ❤️ by Utsav Adhikari**

[⬆ Back to Top](#pdf-merger---ローカル高速pdf結合ツール)

</div>

