import { getDatabase } from "@netlify/database";

const ALLOWED_METHODS = "GET, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization";
const ID_PATTERN = /^[a-f0-9]{32}$/i;
const MAX_DELETE_IDS = 200;

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

async function hasAdminAccess(req) {
  const authHeader = req.headers.get("authorization") || "";
  const idToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const apiKey = process.env.FIREBASE_API_KEY;

  if (!idToken || !apiKey) return false;

  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    if (!response.ok) return false;
    const result = await response.json();
    const [user] = Array.isArray(result.users) ? result.users : [];
    const usesPasswordProvider = user?.providerUserInfo?.some(
      (provider) => provider.providerId === "password",
    );

    return Boolean(user?.email && usesPasswordProvider && !user.disabled);
  } catch {
    return false;
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

  if (!(await hasAdminAccess(req))) {
    return jsonResponse(401, { error: "Unauthorized" }, corsHeaders);
  }

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
