import { getDatabase } from "@netlify/database";

function createCorsHeaders(req) {
  const requestOrigin = req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": requestOrigin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export default async (req) => {
  const corsHeaders = createCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const database = getDatabase();

  if (req.method === "GET") {
    try {
      const result = await database.pool.query(`
        SELECT 
          id AS reporte_id, 
          folio, 
          unit_id AS unidad, 
          driver_name AS operador, 
          created_at AS fecha,
          payload->'ticketsFallas' AS detalles_falla,
          payload->>'observaciones' AS observaciones 
        FROM bitacora_reports
        WHERE payload->'ticketsFallas' IS NOT NULL
          AND jsonb_typeof(payload->'ticketsFallas') = 'array'
          AND jsonb_array_length(payload->'ticketsFallas') > 0
        ORDER BY created_at DESC
      `);

      return new Response(JSON.stringify({ success: true, fallas: result.rows }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const otId = crypto.randomUUID().replace(/-/g, "");
      const seguimientoId = crypto.randomUUID().replace(/-/g, "");

      const result = await database.pool.query(`
        INSERT INTO ordenes_trabajo (id, reporte_id, unidad, operador, payload)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        RETURNING id, folio_ot, estatus, fecha_apertura
      `, [
        otId,
        body.reporte_id || null,
        body.unidad,
        body.operador || 'No especificado',
        JSON.stringify(body.fallasSeleccionadas || [])
      ]);

      const nuevaOT = result.rows[0];

      await database.pool.query(`
        INSERT INTO ot_seguimiento (id, ot_id, accion, usuario, comentario)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        seguimientoId,
        otId,
        'CREACIÓN',
        'Sistema AppTolva',
        'Orden de Trabajo generada a partir de fallas reportadas por el operador.'
      ]);

      return new Response(JSON.stringify({ success: true, orden: nuevaOT }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
  }

  return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } });
};

export const config = {
  path: "/api/mantenimiento",
};