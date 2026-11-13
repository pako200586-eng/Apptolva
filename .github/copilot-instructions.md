# Contexto y Arquitectura: Apptolva

Apptolva es una Progressive Web App (PWA) de gestión logística, mantenimiento preventivo/correctivo y cumplimiento normativo (NOM-087-SCT-2-2017) para transporte pesado doblemente articulado (T3-S2-R4).

## Stack Tecnológico
- **Frontend:** HTML5 semántico, JavaScript Vanilla (ES6+ modular, sin frameworks pesados) y Tailwind CSS.
- **Offline / PWA:** Service Workers nativos (estrategia Network-First / Cache-First según recurso) e IndexedDB / caché local de Firestore.
- **Backend y Base de Datos:** Firebase (Authentication, Cloud Firestore con persistencia offline habilitada y Cloud Functions en Node.js).
- **Despliegue y CI/CD:** GitHub + Netlify (variables de entorno manejadas desde Netlify / Firebase config).

## Reglas de Desarrollo y Código
1. **JavaScript Modular y Limpio:**
   - Usa sintaxis moderna (`async/await`, desestructuración, módulos ES `import/export`).
   - Evita introducir librerías externas si se puede resolver de forma nativa y ligera.
   - Maneja siempre bloques `try/catch` en operaciones asíncronas con feedback claro en la interfaz.

2. **Firebase y Optimización de Firestore:**
   - Minimiza las lecturas de documentos: usa `limit()`, filtros compuestos (`where`), paginación con cursores (`startAfter`) y aprovecha la caché local antes de forzar consultas al servidor.
   - Asegura que toda escritura crítica (checklists diarios, órdenes de taller, registros NOM-087) sea compatible con desconexión temporal (modo offline en carretera).
   - No sobrescribas folios generados por Cloud Functions (ej. `asignarFolioNOM087`); respeta la integridad de los documentos asignados desde el servidor.

3. **Interfaz de Usuario (Tailwind CSS):**
   - Diseño *Mobile-First* pensado para uso rápido en campo/patio por operadores y mecánicos.
   - Mantén botones táctiles amplios, alto contraste y estados visuales claros (cargando, guardado offline, sincronizado, error).

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
4. **Formato de Respuesta de Copilot:**
   - Sé directo: omite introducciones largas y ve directo a la solución técnica.
   - Entrega bloques de código completos y listos para integrar, indicando la ruta exacta del archivo cuando se modifiquen múltiples módulos.
