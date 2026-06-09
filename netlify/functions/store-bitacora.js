import { getDatabase } from "@netlify/database";

const MAX_PAYLOAD_BYTES = 1_500_000;
const ALLOWED_METHODS = "GET, POST, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, X-Bitacora-Token, Authorization";
const TOKEN_HEADER = "x-bitacora-token";
const KEY_PATTERN = /^[a-f0-9]{32}$/i;

function generateId() {
  return crypto.randomUUID().replace(/-/g, "");
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

function inferReportType(data) {
  if (Array.isArray(data.checklist)) return "checklist";
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
          JSON.stringify(data),
        ],
      );

      const origin = new URL(req.url).origin;
      const viewerUrl = `${origin}/viewer.html?id=${id}`;

      return jsonResponse(
        200,
        {
          id,
          folio: data.folio.trim(),
          fecha: new Date().toISOString(),
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

      return jsonResponse(200, storedData.payload, corsHeaders);
    } catch (error) {
      return jsonResponse(500, { error: error.message }, corsHeaders);
    }
  }

  return jsonResponse(405, { error: "Method Not Allowed" }, corsHeaders);
};

export const config = {
  path: "/api/store-bitacora",
};
