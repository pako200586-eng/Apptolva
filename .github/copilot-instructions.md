# Copilot Instructions for AppTolva

## Project Overview

**AppTolva Bachoco** is a Progressive Web App (PWA) designed as a digital logbook (*bitácora*) for Bachoco agricultural/industrial operations. The app allows field workers to record operational data, capture signatures, generate QR codes, and export reports as PDFs.

## Repository Structure

```
apptolva_bitacora/   # Main application source
  index.html         # Main app entry point (worker-facing logbook form)
  bitacora_master.html  # Master/supervisor view
  build.sh           # Netlify build script (injects Firebase API key)
  manifest.json      # PWA manifest
  sw.js              # Service worker for offline support
  css/               # Stylesheets (FontAwesome)
  js/                # Third-party JS libraries (Tailwind, jsPDF, QRCode, signature_pad, confetti)
  webfonts/          # FontAwesome web fonts
netlify/             # Netlify serverless functions (if any)
netlify.toml         # Netlify deployment configuration
.github/
  workflows/
    codeql.yml       # CodeQL security scanning
  dependabot.yml     # Dependency update configuration
```

## Tech Stack

- **Frontend**: Vanilla HTML, CSS, and JavaScript (no framework)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) (loaded from local `js/tailwindcss.js`)
- **Backend/Database**: [Firebase](https://firebase.google.com/) (Firestore / Realtime Database)
- **Deployment**: [Netlify](https://netlify.com/) — build command runs `build.sh` which substitutes the `FIREBASE_API_KEY` environment variable into the HTML files
- **PWA**: Includes `manifest.json` and `sw.js` service worker for offline-capable mobile use
- **Libraries**:
  - `jspdf.min.js` — PDF generation
  - `qrcode.min.js` — QR code generation
  - `signature_pad.min.js` — Signature capture
  - `confetti.min.js` — UI feedback

## Key Conventions

- The Firebase API key is **never hard-coded** in source files. Use the placeholder `__FIREBASE_API_KEY__` in HTML files; the `build.sh` script replaces it at deploy time via the `FIREBASE_API_KEY` Netlify environment variable.
- All app logic lives in plain HTML files using `<script>` tags — there is no bundler or transpiler.
- Tailwind CSS is used for all styling; avoid adding separate custom CSS unless necessary.
- The app is designed for mobile-first usage by field workers, so UI changes should prioritize mobile usability.
- The service worker (`sw.js`) caches assets for offline use — update the cache version when assets change.

## Development & Deployment

- **Local development**: Open `apptolva_bitacora/index.html` directly in a browser or use a simple static server (e.g., `npx serve apptolva_bitacora`). Set `FIREBASE_API_KEY` manually for local testing.
- **Deployment**: Netlify automatically runs `cd apptolva_bitacora && bash build.sh` on push to the main branch. The `FIREBASE_API_KEY` secret must be configured in the Netlify environment.
- **Security scanning**: CodeQL runs on every push/pull request via `.github/workflows/codeql.yml`.
- There are no automated tests currently in this repository.
