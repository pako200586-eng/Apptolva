import { getDatabase } from "@netlify/database";

const ALLOWED_METHODS = "GET, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, X-Admin-Token, Authorization";

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

function hasAdminAccess(req) {
  const requiredToken = process.env.ADMIN_DASHBOARD_TOKEN;
  if (!requiredToken) return true;

  const tokenFromHeader = req.headers.get("x-admin-token");
  const authHeader = req.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";

  return tokenFromHeader === requiredToken || bearerToken === requiredToken;
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
    license: row.license,
    priority: row.priority,
    syncStatus: row.sync_status,
    createdAt: row.created_at,
    logsCount: logs.length,
    checklistCount: checklist.length,
    payload,
  };
}

function extractAlert(row) {
  const payloadText = JSON.stringify(row.payload || {}).toLowerCase();
  const isFailure = row.report_type === "falla";
  const hasCriticalWord = /(freno|frenos|llanta|llantas|luces|direccion|dirección|fuga|temperatura|presion|presión)/.test(payloadText);

  if (!isFailure && !hasCriticalWord && row.priority === "baja") return null;

  return {
    id: row.id,
    folio: row.folio,
    unitId: row.unit_id,
    driverName: row.driver_name,
    priority: row.priority,
    createdAt: row.created_at,
    summary: row.payload?.failureType || row.payload?.falla || row.payload?.incident || "Revisión con posible incidencia",
  };
}

export default async (req) => {
  const corsHeaders = createCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse(405, { error: "Method Not Allowed" }, corsHeaders);
  }

  if (!hasAdminAccess(req)) {
    return jsonResponse(401, { error: "Unauthorized" }, corsHeaders);
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
          COUNT(*) FILTER (WHERE priority = 'alta')::int AS altas,
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

    const alerts = reportsResult.rows
      .map(extractAlert)
      .filter(Boolean)
      .slice(0, 40);

    return jsonResponse(
      200,
      {
        summary: summaryResult.rows[0] || {},
        reports,
        alerts,
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
