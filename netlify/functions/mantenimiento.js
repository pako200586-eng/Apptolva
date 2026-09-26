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
      const unidad = body.unidad || 'N/A';
      const componente = body.componente || 'TRACTOCAMIÓN';
      const descripcion = body.descripcion || body.observaciones || 'Falla sin detalle';
      const sistema = body.sistema || 'GENERAL / REVISIÓN';

      const otExistente = await database.pool.query(`
        SELECT id, folio_ot, recurrencia
        FROM ordenes_trabajo
        WHERE unidad = $1
          AND componente = $2
          AND descripcion_falla = $3
          AND estatus IN ('NUEVA', 'PENDIENTE', 'EN_PROCESO')
        LIMIT 1
      `, [unidad, componente, descripcion]);

      if (otExistente.rows.length > 0) {
        const actual = otExistente.rows[0];
        const nuevaRecurrencia = (Number(actual.recurrencia) || 1) + 1;

        await database.pool.query(`
          UPDATE ordenes_trabajo
          SET recurrencia = $1, updated_at = NOW()
          WHERE id = $2
        `, [nuevaRecurrencia, actual.id]);

        await database.pool.query(`
          INSERT INTO ot_seguimiento (id, ot_id, accion, usuario, comentario)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          crypto.randomUUID().replace(/-/g, ""),
          actual.id,
          'RECURRENCIA_SUMADA',
          'Sistema AppTolva',
          `Falla reiterada en reporte ${body.folio_bitacora || body.reporte_id || 'N/A'}. Contador de recurrencia: ${nuevaRecurrencia}`
        ]);

        return new Response(JSON.stringify({
          success: true,
          reiterada: true,
          folio_ot: actual.folio_ot,
          recurrencia: nuevaRecurrencia
        }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }

      const otId = crypto.randomUUID().replace(/-/g, "");
      const seguimientoId = crypto.randomUUID().replace(/-/g, "");

      const result = await database.pool.query(`
        INSERT INTO ordenes_trabajo (id, reporte_id, unidad, operador, componente, sistema, descripcion_falla, payload, recurrencia)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 1)
        RETURNING id, folio_ot, unidad, operador, componente, sistema, descripcion_falla, estatus, fecha_apertura, recurrencia
      `, [
        otId,
        body.reporte_id || null,
        body.unidad,
        body.operador || 'No especificado',
        componente,
        sistema,
        descripcion,
        JSON.stringify(body)
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
        'OT generada para componente específico.'
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