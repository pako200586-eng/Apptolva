import { getDatabase } from "@netlify/database";
import { createPublicKey, verify as verifySignature } from "node:crypto";

const ALLOWED_METHODS = "GET, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization";
const ID_PATTERN = /^[a-f0-9]{32}$/i;
const MAX_DELETE_IDS = 200;
const FIREBASE_CERTIFICATES_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const TOKEN_CLOCK_TOLERANCE_SECONDS = 300;

let cachedCertificates = null;
let certificatesExpireAt = 0;

class InvalidFirebaseTokenError extends Error {}

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function createCorsHeaders(req) {
  const requestOrigin = req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": requestOrigin || "*",
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    Vary: "Origin",
  };
}

function getEnvironmentVariable(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || "";
}

function getFirebaseProjectId() {
  const configuredProjectId = getEnvironmentVariable("FIREBASE_PROJECT_ID");
  if (configuredProjectId) return configuredProjectId;

  const serviceAccountJson = getEnvironmentVariable("FIREBASE_SERVICE_ACCOUNT");

  if (serviceAccountJson) {
    try {
      const projectId = JSON.parse(serviceAccountJson)?.project_id;
      if (projectId) return projectId;
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT must contain valid service account JSON");
    }
  }

  throw new Error("FIREBASE_PROJECT_ID is not configured");
}

function decodeBase64UrlJson(value) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new InvalidFirebaseTokenError("Malformed Firebase ID token");
  }
}

function certificateCacheDuration(headers) {
  const cacheControl = headers.get("cache-control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] || 0);
  return Math.max(60, maxAge || 3600) * 1000;
}

async function getFirebaseCertificates(forceRefresh = false) {
  if (!forceRefresh && cachedCertificates && Date.now() < certificatesExpireAt) {
    return cachedCertificates;
  }

  const response = await fetch(FIREBASE_CERTIFICATES_URL);
  if (!response.ok) {
    throw new Error(`Firebase certificate service returned ${response.status}`);
  }

  const certificates = await response.json();
  if (!certificates || typeof certificates !== "object") {
    throw new Error("Firebase certificate service returned invalid data");
  }

  cachedCertificates = certificates;
  certificatesExpireAt = Date.now() + certificateCacheDuration(response.headers);
  return certificates;
}

function validateFirebaseClaims(payload, projectId) {
  const now = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  const audienceMatches = payload.aud === projectId
    || (Array.isArray(payload.aud) && payload.aud.includes(projectId));

  if (!audienceMatches || payload.iss !== expectedIssuer) {
    throw new InvalidFirebaseTokenError("Firebase token project does not match");
  }
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) {
    throw new InvalidFirebaseTokenError("Firebase token subject is invalid");
  }
  if (typeof payload.exp !== "number" || payload.exp <= now) {
    throw new InvalidFirebaseTokenError("Firebase token has expired");
  }
  if (
    typeof payload.iat !== "number"
    || payload.iat > now + TOKEN_CLOCK_TOLERANCE_SECONDS
  ) {
    throw new InvalidFirebaseTokenError("Firebase token issue time is invalid");
  }
  if (
    payload.auth_time !== undefined
    && (typeof payload.auth_time !== "number"
      || payload.auth_time > now + TOKEN_CLOCK_TOLERANCE_SECONDS)
  ) {
    throw new InvalidFirebaseTokenError("Firebase token authentication time is invalid");
  }
}

async function verifyFirebaseIdToken(idToken) {
  const parts = idToken.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new InvalidFirebaseTokenError("Malformed Firebase ID token");
  }

  const header = decodeBase64UrlJson(parts[0]);
  const payload = decodeBase64UrlJson(parts[1]);
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new InvalidFirebaseTokenError("Firebase token header is invalid");
  }

  let certificates = await getFirebaseCertificates();
  let certificate = certificates[header.kid];
  if (!certificate) {
    certificates = await getFirebaseCertificates(true);
    certificate = certificates[header.kid];
  }
  if (!certificate) {
    throw new InvalidFirebaseTokenError("Firebase token signing key is unknown");
  }

  const validSignature = verifySignature(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    createPublicKey(certificate),
    Buffer.from(parts[2], "base64url"),
  );
  if (!validSignature) {
    throw new InvalidFirebaseTokenError("Firebase token signature is invalid");
  }

  validateFirebaseClaims(payload, getFirebaseProjectId());
  return payload;
}

async function hasAdminAccess(req) {
  const authHeader = req.headers.get("authorization") || "";
  const idToken = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";

  if (!idToken) return false;

  try {
    const decodedToken = await verifyFirebaseIdToken(idToken);
    return Boolean(
      decodedToken.email
      && decodedToken.firebase?.sign_in_provider === "password",
    );
  } catch (error) {
    if (error instanceof InvalidFirebaseTokenError) return false;
    throw error;
  }
}

async function authorizeRequest(req, corsHeaders) {
  try {
    if (await hasAdminAccess(req)) return null;
    return jsonResponse(401, { error: "Unauthorized" }, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Firebase authentication is unavailable:", message);
    return jsonResponse(500, { error: message }, corsHeaders);
  }
}

function buildWhere(searchParams) {
  const clauses = [];
  const values = [];

  const dateFrom = searchParams.get("from");
  const dateTo = searchParams.get("to");
  const unit = searchParams.get("unit");
  const operator = searchParams.get("operator");
  const type = searchParams.get("type");

  if (dateFrom) {
    values.push(dateFrom);
    clauses.push(`created_at >= $${values.length}::timestamptz`);
  }

  if (dateTo) {
    values.push(`${dateTo}T23:59:59.999Z`);
    clauses.push(`created_at <= $${values.length}::timestamptz`);
  }

  if (unit) {
    values.push(`%${unit}%`);
    clauses.push(`unit_id ILIKE $${values.length}`);
  }

  if (operator) {
    values.push(`%${operator}%`);
    clauses.push(`driver_name ILIKE $${values.length}`);
  }

  if (type && type !== "todos") {
    values.push(type);
    clauses.push(`report_type = $${values.length}`);
  }

  return {
    text: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function normalizeRow(row) {
  const payload = row.payload || {};
  const logs = Array.isArray(payload.logs) ? payload.logs : [];
  const checklist = Array.isArray(payload.checklist) ? payload.checklist : [];

  return {
    id: row.id,
    folio: row.folio,
    type: row.report_type,
    unitId: row.unit_id,
    driverName: row.driver_name,
    employeeNumber: payload.employeeNumber || payload.numeroEmpleado || "",
    license: row.license,
    priority: row.priority,
    syncStatus: row.sync_status,
    createdAt: row.created_at,
    logsCount: logs.length,
    checklistCount: checklist.length,
    payload,
  };
}

export default async (req) => {
  const corsHeaders = createCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const authorizationError = await authorizeRequest(req, corsHeaders);
  if (authorizationError) return authorizationError;

  if (req.method === "DELETE") {
    let body = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "Cuerpo JSON inválido" }, corsHeaders);
    }

    const ids = Array.isArray(body?.ids)
      ? [...new Set(body.ids.filter((id) => typeof id === "string" && ID_PATTERN.test(id)))]
      : [];

    if (!ids.length) {
      return jsonResponse(400, { error: "No se recibieron reportes válidos para eliminar" }, corsHeaders);
    }
    if (ids.length > MAX_DELETE_IDS) {
      return jsonResponse(400, { error: `No se pueden eliminar más de ${MAX_DELETE_IDS} reportes a la vez` }, corsHeaders);
    }

    const database = getDatabase();
    try {
      const result = await database.pool.query(
        "DELETE FROM bitacora_reports WHERE id = ANY($1::text[])",
        [ids],
      );
      return jsonResponse(200, { deleted: result.rowCount || 0 }, corsHeaders);
    } catch (error) {
      return jsonResponse(500, { error: error.message }, corsHeaders);
    }
  }

  if (req.method !== "GET") {
    return jsonResponse(405, { error: "Method Not Allowed" }, corsHeaders);
  }

  const url = new URL(req.url);
  const exportFormat = url.searchParams.get("export");
  const where = buildWhere(url.searchParams);
  const database = getDatabase();
  const client = await database.pool.connect();

  try {
    const reportsResult = await client.query(
      `
        SELECT id, folio, report_type, unit_id, driver_name, license, priority, sync_status, payload, created_at
        FROM bitacora_reports
        ${where.text}
        ORDER BY created_at DESC
        LIMIT 500
      `,
      where.values,
    );

    const summaryResult = await client.query(
      `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE report_type = 'checklist')::int AS checklist,
          COUNT(*) FILTER (WHERE report_type = 'bitacora')::int AS bitacoras,
          COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS hoy,
          COUNT(DISTINCT driver_name)::int AS operadores,
          COUNT(DISTINCT unit_id)::int AS unidades
        FROM bitacora_reports
        ${where.text}
      `,
      where.values,
    );

    const reports = reportsResult.rows.map(normalizeRow);

    if (exportFormat === "csv") {
      const header = ["folio", "tipo", "unidad", "operador", "prioridad", "estado", "fecha"];
      const lines = reports.map((report) =>
        [
          report.folio,
          report.type,
          report.unitId,
          report.driverName,
          report.priority,
          report.syncStatus,
          report.createdAt,
        ]
          .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
          .join(","),
      );

      return new Response([header.join(","), ...lines].join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=apptolva-reportes.csv",
          ...corsHeaders,
        },
      });
    }

    return jsonResponse(
      200,
      {
        summary: summaryResult.rows[0] || {},
        reports,
        generatedAt: new Date().toISOString(),
      },
      corsHeaders,
    );
  } catch (error) {
    return jsonResponse(500, { error: error.message }, corsHeaders);
  } finally {
    client.release();
  }
};

export const config = {
  path: "/api/admin-reports",
};
