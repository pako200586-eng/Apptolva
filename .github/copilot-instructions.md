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
- **Backend/Database**: [Firebase Firestore](https://firebase.google.com/docs/firestore) (Realtime Database is not currently used in this repo)
- **Deployment**: [Netlify](https://netlify.com/) — build command runs `build.sh`, which generates the public Firebase environment configuration from Netlify variables
- **PWA**: Includes `manifest.json` and `sw.js` service worker for offline-capable mobile use
- **Libraries**:
  - `jspdf.min.js` — PDF generation
  - `qrcode.min.js` — QR code generation
  - `signature_pad.min.js` — Signature capture
  - `confetti.min.js` — UI feedback

## Key Conventions

- Firebase web configuration is generated at build time from `FIREBASE_STAGING_CONFIG_JSON` and `FIREBASE_PRODUCTION_CONFIG_JSON`; do not commit either configuration to source. The browser selects staging for localhost, Netlify deploy previews, and hostnames containing `staging`, and production for other hosts.
- All app logic lives in plain HTML files using `<script>` tags — there is no bundler or transpiler.
- Tailwind CSS is used for all styling; avoid adding separate custom CSS unless necessary.
- The app is designed for mobile-first usage by field workers, so UI changes should prioritize mobile usability.
- The service worker (`sw.js`) caches assets for offline use — update the cache version when assets change.

## Modern Web Guidance & AppTolva Architecture

- For HTML, CSS, accessibility, performance, and client-side JavaScript work, follow the installed `modern-web-guidance` skill: search for the relevant guidance and retrieve the matching guide before implementing.
- Prefer modern, native browser APIs and avoid adding third-party libraries unless they are necessary. Check Baseline support and provide a suitable fallback when the field devices or browsers may not support an API.
- Use semantic HTML, accessible interactions, and mobile-friendly touch targets. Use Tailwind utility classes; avoid inline `style` attributes and add custom CSS only when necessary.
- Preserve the existing stack: vanilla JavaScript (ES modules where already used), HTML, Tailwind, Firebase Firestore, and Netlify. Reuse existing local libraries and helpers before introducing dependencies.
- Keep the service worker's route-specific cache and network behavior in `apptolva_bitacora/sw.js`; do not assume every request is Cache-First. Queue eligible failed report submissions in IndexedDB and use Background Sync when available, retaining the existing manual/message retry path as a fallback.
- Firestore persistent local caching is configured on the main, master, and driving evaluation pages with `persistentLocalCache` and `persistentMultipleTabManager`. Verify the initialization path before assuming it applies elsewhere; do not add duplicate persistence initialization or promise offline behavior for operations that require the server.
- Keep operational data available offline through the existing Firestore local cache or the service worker's IndexedDB queue, as appropriate to the submission path. Reflect connectivity changes in the UI when relevant, without treating `navigator.onLine` as proof that a server is reachable.
- Prefer `async`/`await` for asynchronous flows and native `fetch` for HTTP. Use callbacks where required by browser event APIs, and follow existing event-delegation patterns when they fit the UI.

## Development & Deployment

- **Local development**: Set both Firebase JSON configuration variables, run `cd apptolva_bitacora && bash build.sh`, then run a static server (for example, `npx serve apptolva_bitacora`) and open the app via `http://localhost/...`. Avoid opening `index.html` directly via `file://`.
- **Deployment**: Netlify runs `cd apptolva_bitacora && bash build.sh`; both Firebase web configuration variables must be available in each deploy context.
- **Security scanning**: CodeQL runs on every push/pull request via `.github/workflows/codeql.yml`.
- Run `npm test` for unit tests and `npm run test:emulator` for Firebase Emulator integration tests.
