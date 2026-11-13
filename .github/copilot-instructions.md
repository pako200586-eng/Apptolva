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

4. **Formato de Respuesta de Copilot:**
   - Sé directo: omite introducciones largas y ve directo a la solución técnica.
   - Entrega bloques de código completos y listos para integrar, indicando la ruta exacta del archivo cuando se modifiquen múltiples módulos.
