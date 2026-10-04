import { getDatabase } from "@netlify/database";
import { getStore } from "@netlify/blobs";
import { authorizeRequest } from "../lib/firebase-auth.js";

const SIGNATURE_FIELDS = ["firmaOp", "firmaOp2", "firmaSup", "signatureOp", "signatureSup"];
const BLOB_PREFIX = "blob:";

async function rehidratarFirmas(data, store) {
  if (!data || typeof data !== "object") return data;
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

export default async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  // Seguridad: Solo supervisores autenticados pueden descargar el respaldo
  const authorizationError = await authorizeRequest(req, corsHeaders);
  if (authorizationError) return authorizationError;

  const database = getDatabase();
  const store = getStore("firmas");
  const client = await database.pool.connect();

  try {
    // 1. Extraer TODOS los reportes (sin LIMIT 500)
    const reportsRes = await client.query(`SELECT * FROM bitacora_reports ORDER BY created_at ASC`);

    // Rehidratar firmas de cada reporte desde Netlify Blobs
    const reportesCompletos = [];
    for (const row of reportsRes.rows) {
      const payloadConFirmas = await rehidratarFirmas(row.payload, store);
      reportesCompletos.push({ ...row, payload: payloadConFirmas });
    }

    // 2. Extraer TODAS las Órdenes de Trabajo
    const ordenesRes = await client.query(`SELECT * FROM ordenes_trabajo ORDER BY fecha_apertura ASC`);

    // 3. Extraer TODO el Seguimiento
    const seguimientoRes = await client.query(`SELECT * FROM ot_seguimiento ORDER BY fecha ASC`);

    const backupCompleto = {
      sistema: "AppTolva Bachoco",
      fecha_exportacion: new Date().toISOString(),
      totales: {
        reportes: reportesCompletos.length,
        ordenes: ordenesRes.rows.length,
        seguimientos: seguimientoRes.rows.length,
      },
      bitacora_reports: reportesCompletos,
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