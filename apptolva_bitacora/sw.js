const CACHE_NAME = "apptolva-cache-v8";
const RUNTIME_CACHE = "apptolva-runtime-v8";
const DB_NAME = "apptolva-offline-db";
const DB_VERSION = 1;
const PENDING_STORE = "pending-reportes";
const SYNC_TAG = "sync-reportes";

const OFFLINE_URLS = [
  "./",
  "./index.html",
  "./bitacora_master.html",
  "./viewer.html",
  "./manifest.json",
  "./icon-192x192.png",
  "./icon-512x512.png",
  "./css/fontawesome.min.css",
  "./js/tailwindcss.js",
  "./js/signature_pad.min.js",
  "./js/jspdf.min.js",
  "./js/qrcode.min.js",
  "./js/confetti.min.js",
  "./webfonts/fa-solid-900.woff2",
  "./webfonts/fa-brands-400.woff2",
  "./webfonts/fa-regular-400.woff2",
  "./aceite2.jpg",
  "./arco.jpg",
  "./arco1.jpg",
  "./atasco.jpg",
  "./atras.jpg",
  "./cable1.jpg",
  "./des.jpg",
  "./descfin.jpg",
  "./final.jpg",
  "./mangue.jpg",
  "./manometros.jpg",
  "./palancas.jpg",
  "./peligro.jpg",
  "./pto.jpg",
  "./reg.jpg",
  "./reg1.jpg",
  "./silo.jpg",
  "./suelo.jpg"
];

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        db.createObjectStore(PENDING_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withPendingStore(mode, callback) {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, mode);
    const store = tx.objectStore(PENDING_STORE);
    const result = callback(store);
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function savePendingReport(payload) {
  const id = payload.offlineQueueId || crypto.randomUUID();
  const record = {
    id,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0
  };
  await withPendingStore("readwrite", (store) => store.put(record));
  return record;
}

async function getPendingReports() {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, "readonly");
    const request = tx.objectStore(PENDING_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

async function deletePendingReport(id) {
  return withPendingStore("readwrite", (store) => store.delete(id));
}

async function notifyClients(message) {
  const clientsList = await self.clients.matchAll({ includeUncontrolled: true });
  clientsList.forEach((client) => client.postMessage(message));
}

async function cacheStaticRequest(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstRequest(request) {
  try {
    const response = await fetch(request);
    if (request.method === "GET" && response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function queueBitacoraRequest(request) {
  try {
    const response = await fetch(request.clone());
    if (response && response.ok) return response;
    return response;
  } catch (error) {
    const payload = await request.clone().json();
    const record = await savePendingReport(payload);
    await notifyClients({ type: "REPORT_QUEUED", id: record.id });
    return new Response(JSON.stringify({
      offline: true,
      queued: true,
      localId: record.id,
      message: "Bitácora guardada offline. Se sincronizará cuando vuelva la señal."
    }), {
      status: 202,
      headers: { "Content-Type": "application/json" }
    });
  }
}

async function enviarReportesPendientes() {
  const pendientes = await getPendingReports();
  if (!pendientes.length) return;

  for (const reporte of pendientes) {
    const payload = { ...reporte.payload };
    delete payload.offlineQueueId;

    try {
      const response = await fetch("/api/store-bitacora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json().catch(() => ({}));
        await deletePendingReport(reporte.id);
        await notifyClients({
          type: "REPORT_SYNCED",
          id: reporte.id,
          folio: payload.folio,
          url: result.url || "",
          expiresAt: result.expiresAt || ""
        });
      }
    } catch (error) {
      await notifyClients({ type: "REPORT_SYNC_WAITING", id: reporte.id });
      throw error;
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isBitacoraApi = isSameOrigin && (
    url.pathname === "/api/store-bitacora" ||
    url.pathname === "/.netlify/functions/store-bitacora"
  );
  const isFunctionApi = isSameOrigin && url.pathname.includes("/.netlify/functions/");

  if (isBitacoraApi && event.request.method === "POST") {
    event.respondWith(queueBitacoraRequest(event.request));
    return;
  }

  if (event.request.method !== "GET") {
    if (isFunctionApi) {
      event.respondWith(
        fetch(event.request).catch(() => new Response(JSON.stringify({
          error: "Sin conexión. Esta función requiere internet."
        }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        }))
      );
    }
    return;
  }

  if (isBitacoraApi || isFunctionApi) {
    event.respondWith(networkFirstRequest(event.request).catch(() => new Response(JSON.stringify({
      error: "Sin conexión y sin datos guardados para esta solicitud."
    }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    })));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      networkFirstRequest(event.request).catch(() => caches.match("./index.html"))
    );
    return;
  }

  if (["image", "script", "style", "font", "manifest"].includes(event.request.destination)) {
    event.respondWith(cacheStaticRequest(event.request));
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(enviarReportesPendientes());
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SYNC_NOW") {
    event.waitUntil(enviarReportesPendientes());
  }
});
