import { getDatabase } from "@netlify/database";
import { authorizeRequest } from "../lib/firebase-auth.js";

function createCorsHeaders(req) {
  const requestOrigin = req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": requestOrigin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// Datos de la OT enriquecidos con el checklist de origen (folio, tolvas, dolly y km)
// para poder llenar el formato impreso de la orden de trabajo.
const ORDEN_CON_BITACORA_SQL = `
  SELECT
    o.id,
    o.folio_ot,
    o.reporte_id,
    o.unidad,
    o.operador,
    o.componente,
    o.sistema,
    o.descripcion_falla,
    o.estatus,
    o.payload,
    o.fecha_apertura,
    o.recurrencia,
    o.updated_at,
    o.electromecanico,
    o.proveedor_externo,
    o.supervisor_mantenimiento,
    o.fecha_realizacion,
    o.comentarios_ejecutor,
    o.comentarios_operador,
    COALESCE(NULLIF(o.kilometraje, ''), b.payload->>'km') AS kilometraje,
    COALESCE(b.folio, o.payload->>'folio_bitacora') AS folio_bitacora,
    b.payload->>'tolva1' AS tolva1,
    b.payload->>'tolva2' AS tolva2,
    b.payload->>'dolly' AS dolly,
    b.payload->>'km' AS km
  FROM ordenes_trabajo o
  LEFT JOIN bitacora_reports b ON b.id = o.reporte_id
`;

const ESTATUS_VALIDOS = ['NUEVA', 'ASIGNADA', 'EN PROCESO', 'PENDIENTE REFACCION', 'TERMINADA', 'CERRADA'];

// Campos del formato de OT que el supervisor captura desde el panel.
const CAMPOS_DETALLE = [
  'electromecanico',
  'proveedor_externo',
  'supervisor_mantenimiento',
  'fecha_realizacion',
  'kilometraje',
  'comentarios_ejecutor',
  'comentarios_operador',
];

function jsonResponse(status, body, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });
}

export default async (req) => {
  const corsHeaders = createCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const authorizationError = await authorizeRequest(req, corsHeaders);
  if (authorizationError) return authorizationError;

  const database = getDatabase();

  if (req.method === "GET") {
    try {
      const url = new URL(req.url);
      const tipo = url.searchParams.get("tipo");

      if (tipo === "seguimiento") {
        const otId = url.searchParams.get("ot_id");
        if (!otId) return jsonResponse(400, { error: "Falta el identificador de la OT" }, corsHeaders);

        const result = await database.pool.query(`
          SELECT id, accion, usuario, comentario, fecha
          FROM ot_seguimiento
          WHERE ot_id = $1
          ORDER BY fecha DESC
        `, [otId]);

        return jsonResponse(200, { success: true, seguimiento: result.rows }, corsHeaders);
      }

      if (tipo === "ordenes") {
        const result = await database.pool.query(`
          ${ORDEN_CON_BITACORA_SQL}
          ORDER BY o.fecha_apertura DESC NULLS LAST, o.folio_ot DESC NULLS LAST
        `);

        return new Response(JSON.stringify({ success: true, ordenes: result.rows }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }

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

      if (body?.accion === "actualizar_estatus") {
        const otId = body.ot_id;
        const nuevoEstatus = body.estatus || 'NUEVA';

        if (!ESTATUS_VALIDOS.includes(nuevoEstatus)) {
          return jsonResponse(400, { error: "Estatus no válido" }, corsHeaders);
        }

        if (!otId) {
          return new Response(JSON.stringify({ error: "Falta el identificador de la OT" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        await database.pool.query(`
          UPDATE ordenes_trabajo
          SET estatus = $1, updated_at = NOW()
          WHERE id = $2
        `, [nuevoEstatus, otId]);

        await database.pool.query(`
          INSERT INTO ot_seguimiento (id, ot_id, accion, usuario, comentario)
          VALUES ($1, $2, $3, $4, $5)
        `, [crypto.randomUUID().replace(/-/g, ""), otId, 'CAMBIO_ESTATUS', 'Supervisor (panel)', `Estatus actualizado a ${nuevoEstatus}`]);

        return new Response(JSON.stringify({ success: true, ot_id: otId, estatus: nuevoEstatus }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }

      if (body?.accion === "actualizar_detalle") {
        const otId = body.ot_id;
        if (!otId) return jsonResponse(400, { error: "Falta el identificador de la OT" }, corsHeaders);

        const valores = CAMPOS_DETALLE.map((campo) => {
          const valor = body[campo] == null ? '' : String(body[campo]).trim().slice(0, 2000);
          return valor || null;
        });
        const asignaciones = CAMPOS_DETALLE.map((campo, i) => `${campo} = $${i + 1}`).join(', ');

        const actualizada = await database.pool.query(`
          UPDATE ordenes_trabajo
          SET ${asignaciones}, updated_at = NOW()
          WHERE id = $${CAMPOS_DETALLE.length + 1}
        `, [...valores, otId]);

        if (!actualizada.rowCount) return jsonResponse(404, { error: "La OT no existe" }, corsHeaders);

        await database.pool.query(`
          INSERT INTO ot_seguimiento (id, ot_id, accion, usuario, comentario)
          VALUES ($1, $2, $3, $4, $5)
        `, [crypto.randomUUID().replace(/-/g, ""), otId, 'ACTUALIZACIÓN', 'Supervisor (panel)', 'Datos de ejecución de la OT actualizados.']);

        const orden = await database.pool.query(`${ORDEN_CON_BITACORA_SQL} WHERE o.id = $1`, [otId]);
        return jsonResponse(200, { success: true, orden: orden.rows[0] }, corsHeaders);
      }

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
          AND estatus IN ('NUEVA', 'ASIGNADA', 'PENDIENTE', 'EN PROCESO', 'EN_PROCESO', 'PENDIENTE REFACCION')
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

      const creada = await database.pool.query(`${ORDEN_CON_BITACORA_SQL} WHERE o.id = $1`, [otId]);
      const nuevaOT = creada.rows[0] || result.rows[0];

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