import { getDatabase } from "@netlify/database";

export default async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const url = new URL(req.url);
  if (url.searchParams.get("clave") !== "tolva123") {
    return new Response(JSON.stringify({ error: "Clave no válida. Usa ?clave=tolva123" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }

  // Permite descargar en partes de 500 registros para no superar los 6 MB
  const parte = parseInt(url.searchParams.get("parte") || "1", 10);
  const limite = 500;
  const offset = (parte - 1) * limite;

  const database = getDatabase();
  const client = await database.pool.connect();

  try {
    const reportsRes = await client.query(
      `SELECT * FROM bitacora_reports ORDER BY created_at ASC LIMIT $1 OFFSET $2`,
      [limite, offset]
    );

    let ordenes = [];
    let seguimiento = [];

    // En la parte 3 (o final) se incluyen también las Órdenes de Trabajo y su Seguimiento
    if (parte >= 3 || reportsRes.rows.length < limite) {
      const ordenesRes = await client.query(`SELECT * FROM ordenes_trabajo ORDER BY fecha_apertura ASC`);
      const seguimientoRes = await client.query(`SELECT * FROM ot_seguimiento ORDER BY fecha ASC`);
      ordenes = ordenesRes.rows;
      seguimiento = seguimientoRes.rows;
    }

    const backupParte = {
      sistema: "AppTolva Bachoco",
      parte,
      total_en_esta_parte: reportsRes.rows.length,
      bitacora_reports: reportsRes.rows,
      ordenes_trabajo: ordenes,
      ot_seguimiento: seguimiento,
    };

    return new Response(JSON.stringify(backupParte, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename=apptolva_backup_parte${parte}.json`,
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
