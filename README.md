# strdanos tool

A browser-based newspaper-page correction studio. Images are processed locally in the browser; there is no upload server.

## Features

- Multiple image upload and batch processing
- RAW decoding through LibRaw-Wasm (camera support depends on the RAW format and browser memory)
- Automatic page-boundary detection with OpenCV.js
- Perspective correction and deskewing
- Automatic tone enhancement
- Manual brightness, contrast and rotation controls
- Before/after preview
- JPEG export at quality 100, plus PNG export for lossless output

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Deploy to GitHub Pages

1. Create a GitHub repository named `strdanos-tool` (or another name).
2. Upload the contents of this project to the repository's `main` branch.
3. In GitHub, open **Settings → Pages** and set the source to **GitHub Actions**.
4. The included workflow builds and deploys the app on every push to `main`.
5. After the workflow finishes, GitHub Pages will show the published URL.

## Notes on image quality and archival use

- JPEG is a lossy format, even at quality 100. For a mathematically lossless export, use PNG. TIFF is also a suitable archival format but is not included in this first lightweight browser build.
- The automatic detector searches for the largest page-like quadrilateral. Newspaper pages with curled edges, dark backgrounds, overlapping pages or low contrast may need manual adjustment.
- RAW files are decoded in the browser using LibRaw-Wasm. Large RAW files can consume substantial memory. If a camera model or compression mode is unsupported, convert that RAW to 16-bit TIFF using darktable and upload the TIFF instead.
- Always retain the original RAW files. The app does not overwrite source files.
- The app is a first working version: review automatic crops before treating the result as an archival master.