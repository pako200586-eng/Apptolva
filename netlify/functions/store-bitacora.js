import { getDatabase } from "@netlify/database";
import { getStore } from "@netlify/blobs";

const MAX_PAYLOAD_BYTES = 1_500_000;
const ALLOWED_METHODS = "GET, POST, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, X-Bitacora-Token, Authorization";
const TOKEN_HEADER = "x-bitacora-token";
const KEY_PATTERN = /^[a-f0-9]{32}$/i;

// Campos que pueden traer una firma como imagen base64 (data:image/png;base64,...).
// El checklist usa firmaOp/firmaOp2/firmaSup; la bitácora de horas usa signatureOp/signatureSup.
const SIGNATURE_FIELDS = ["firmaOp", "firmaOp2", "firmaSup", "signatureOp", "signatureSup"];
const BLOB_PREFIX = "blob:";

function generateId() {
  return crypto.randomUUID().replace(/-/g, "");
}

function getSignatureStore() {
  return getStore("firmas");
}

function isDataImage(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

// Sube cada firma (base64) a Netlify Blobs y la reemplaza en el objeto por una
// referencia corta ("blob:<key>"). Así el JSON que se guarda en Postgres queda
// liviano, en vez de cargar los ~50-150 KB de cada firma por reporte.
async function externalizarFirmas(reportId, data) {
  const store = getSignatureStore();
  const resultado = { ...data };

  for (const field of SIGNATURE_FIELDS) {
    const value = resultado[field];
    if (isDataImage(value)) {
      const key = `${reportId}-${field}`;
      await store.set(key, value);
      resultado[field] = BLOB_PREFIX + key;
    }
  }

  return resultado;
}

// Proceso inverso: cuando se pide un reporte específico (viewer.html), se
// reconstruyen las firmas reales a partir de la referencia guardada.
async function rehidratarFirmas(data) {
  if (!data || typeof data !== "object") return data;
  const store = getSignatureStore();
  const resultado = { ...data };

  for (const field of SIGNATURE_FIELDS) {
    const value = resultado[field];
    if (typeof value === "string" && value.startsWith(BLOB_PREFIX)) {
      const key = value.slice(BLOB_PREFIX.length);
      try {
        const original = await store.get(key);
        resultado[field] = original || "";
      } catch {
        resultado[field] = "";
      }
    }
  }

  return resultado;
}

function createCorsHeaders(req) {
  const allowedOrigins = (process.env.BITACORA_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const requestOrigin = req.headers.get("origin");
  const originAllowed =
    !requestOrigin ||
    allowedOrigins.length === 0 ||
    allowedOrigins.includes(requestOrigin);

  if (!originAllowed) return null;

  return {
    "Access-Control-Allow-Origin": requestOrigin || "*",
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    Vary: "Origin",
  };
}

function jsonResponse(status, body, corsHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function unauthorizedResponse(corsHeaders) {
  return jsonResponse(401, { error: "Unauthorized" }, corsHeaders);
}

function hasValidToken(req) {
  const requiredToken = process.env.BITACORA_API_TOKEN;
  if (!requiredToken) return true;

  const tokenFromHeader = req.headers.get(TOKEN_HEADER);
  const authHeader = req.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  return tokenFromHeader === requiredToken || bearerToken === requiredToken;
}

function normalizeReportType(value) {
  const raw = String(value || "").toLowerCase().trim();
  if (["checklist", "revision", "revisión", "inspeccion", "inspección"].includes(raw)) {
    return "checklist";
  }
  if (["bitacora", "bitácora", "horas", "nom087", "nom-087"].includes(raw)) {
    return "bitacora";
  }
  if (["falla", "incidente", "incident"].includes(raw)) return "falla";
  return null;
}

function inferReportType(data) {
  // Honor the explicit type the operator app sends before guessing from payload.
  const explicit = normalizeReportType(data.tipo) || normalizeReportType(data.reportType);
  if (explicit) return explicit;

  if (Array.isArray(data.checklistData) || Array.isArray(data.checklist)) return "checklist";
  if (Array.isArray(data.logs)) return "bitacora";
  if (data.falla || data.incident || data.priority) return "falla";
  return "reporte";
}

function inferPriority(data) {
  const raw = String(data.priority || data.prioridad || "").toLowerCase();
  if (["alta", "media", "baja"].includes(raw)) return raw;

  const text = JSON.stringify(data).toLowerCase();
  if (/(freno|frenos|llanta|llantas|luces|direccion|dirección|fuga|emergencia)/.test(text)) {
    return "alta";
  }
  return inferReportType(data) === "falla" ? "media" : "baja";
}

function validateBitacoraPayload(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "Payload inválido";
  }

  const requiredTextFields = ["folio", "unitId", "driverName"];
  for (const field of requiredTextFields) {
    const value = data[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      return `Campo obligatorio faltante: ${field}`;
    }
  }

  if (data.logs && (!Array.isArray(data.logs) || data.logs.length > 300)) {
    return "Registros de bitácora inválidos";
  }

  if (data.checklist && !Array.isArray(data.checklist)) {
    return "Checklist inválido";
  }

  return null;
}

export default async (req) => {
  const corsHeaders = createCorsHeaders(req);
  if (!corsHeaders) {
    return jsonResponse(403, { error: "Origin no permitido" });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const database = getDatabase();

  if (req.method === "POST") {
    try {
      if (!hasValidToken(req)) {
        return unauthorizedResponse(corsHeaders);
      }

      const contentLength = Number(req.headers.get("content-length") || 0);
      if (contentLength > MAX_PAYLOAD_BYTES) {
        return jsonResponse(413, { error: "Payload demasiado grande" }, corsHeaders);
      }

      const data = await req.json();
      const validationError = validateBitacoraPayload(data);
      if (validationError) {
        return jsonResponse(400, { error: validationError }, corsHeaders);
      }

      const id = generateId();
      const reportType = inferReportType(data);
      const priority = inferPriority(data);
      const license = typeof data.license === "string" ? data.license : "";

      // Antes de guardar en Postgres, sacamos las firmas pesadas y las mandamos
      // a Netlify Blobs. En su lugar queda solo una referencia corta.
      const dataParaGuardar = await externalizarFirmas(id, data);

      await database.pool.query(
        `
          INSERT INTO bitacora_reports (
            id, folio, report_type, unit_id, driver_name, license, priority, sync_status, payload
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'sincronizado', $8::jsonb)
        `,
        [
          id,
          data.folio.trim(),
          reportType,
          data.unitId.trim(),
          data.driverName.trim(),
          license.trim(),
          priority,
          JSON.stringify(dataParaGuardar),
        ],
      );

      const origin = new URL(req.url).origin;
      const viewerUrl = `${origin}/viewer.html?id=${id}`;

      return jsonResponse(
        200,
        {
          success: true,
          id,
          folio: data.folio.trim(),
          fecha: new Date().toISOString(),
          tipo: reportType,
          status: "sincronizado",
          url: viewerUrl,
          synced: true,
        },
        corsHeaders,
      );
    } catch (error) {
      return jsonResponse(500, { error: error.message }, corsHeaders);
    }
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id || !KEY_PATTERN.test(id)) {
      return jsonResponse(400, { error: "Missing or invalid id" }, corsHeaders);
    }

    try {
      const result = await database.pool.query(
        "SELECT payload FROM bitacora_reports WHERE id = $1 LIMIT 1",
        [id],
      );
      const [storedData] = result.rows;

      if (!storedData) {
        return jsonResponse(404, { error: "Not found" }, corsHeaders);
      }

      // Reconstruimos las firmas reales a partir de Blobs antes de responder,
      // así viewer.html recibe exactamente el mismo formato que antes.
      const payloadCompleto = await rehidratarFirmas(storedData.payload);

      return jsonResponse(200, payloadCompleto, corsHeaders);
    } catch (error) {
      return jsonResponse(500, { error: error.message }, corsHeaders);
    }
  }

  return jsonResponse(405, { error: "Method Not Allowed" }, corsHeaders);
};

export const config = {
  path: "/api/store-bitacora",
};
