import { getDatabase } from "@netlify/database";

export default async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  // Descarga directa con clave secreta en la URL (?clave=tolva123)
  const url = new URL(req.url);
  if (url.searchParams.get("clave") !== "tolva123") {
    return new Response(JSON.stringify({ error: "Clave no válida. Usa ?clave=tolva123" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  const database = getDatabase();
  const client = await database.pool.connect();

  try {
    // 1. Extraer los 1,161 reportes completos de la base de datos
    const reportsRes = await client.query(`SELECT * FROM bitacora_reports ORDER BY created_at ASC`);

    // 2. Extraer todas las Órdenes de Trabajo
    const ordenesRes = await client.query(`SELECT * FROM ordenes_trabajo ORDER BY fecha_apertura ASC`);

    // 3. Extraer todo el Historial de Seguimiento
    const seguimientoRes = await client.query(`SELECT * FROM ot_seguimiento ORDER BY fecha ASC`);

    const backupCompleto = {
      sistema: "AppTolva Bachoco",
      fecha_exportacion: new Date().toISOString(),
      totales: {
        reportes: reportsRes.rows.length,
        ordenes: ordenesRes.rows.length,
        seguimientos: seguimientoRes.rows.length,
      },
      bitacora_reports: reportsRes.rows,
      ordenes_trabajo: ordenesRes.rows,
      ot_seguimiento: seguimientoRes.rows,
    };

    return new Response(JSON.stringify(backupCompleto, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename=apptolva_backup_${new Date().toISOString().slice(0, 10)}.json`,
        ...corsHeaders,
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  } finally {
    client.release();
  }
};

export const config = {
  path: "/api/export-backup",
};
