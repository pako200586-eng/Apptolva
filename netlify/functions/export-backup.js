import { getDatabase } from "@netlify/database";
import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";
import { authorizeRequest } from "../lib/firebase-auth.js";

const SIGNATURE_FIELDS = ["firmaOp", "firmaOp2", "firmaSup", "signatureOp", "signatureSup"];
const BLOB_PREFIX = "blob:";
const BACKUP_TOKEN_ENV = "BACKUP_EXPORT_TOKEN";

function getBackupToken() {
  return globalThis.Netlify?.env?.get(BACKUP_TOKEN_ENV)
    || process.env[BACKUP_TOKEN_ENV]
    || "";
}

function hasValidBackupToken(req) {
  const expectedToken = getBackupToken();
  if (!expectedToken) return false;
  if (expectedToken.length < 32) {
    throw new Error(`${BACKUP_TOKEN_ENV} must contain at least 32 characters`);
  }

  const providedToken = req.headers.get("x-backup-token") || "";
  const expectedDigest = createHash("sha256").update(expectedToken).digest();
  const providedDigest = createHash("sha256").update(providedToken).digest();
  return timingSafeEqual(expectedDigest, providedDigest);
}

async function rehidratarFirmas(data, store) {
  if (!data || typeof data !== "object") return data;
  const resultado = { ...data };

  for (const field of SIGNATURE_FIELDS) {
    const value = resultado[field];
    if (typeof value === "string" && value.startsWith(BLOB_PREFIX)) {
      const key = value.slice(BLOB_PREFIX.length);
      const original = await store.get(key);
      if (!original) {
        throw new Error(`No se encontró la firma almacenada para ${field}`);
      }
      resultado[field] = original;
    }
  }

  return resultado;
}

export default async (req) => {
  const requestOrigin = req.headers.get("origin");
  const corsHeaders = {
    "Access-Control-Allow-Origin": requestOrigin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Backup-Token",
    "Vary": "Origin",
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    if (!hasValidBackupToken(req)) {
      const authorizationError = await authorizeRequest(req, corsHeaders);
      if (authorizationError) return authorizationError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Backup export authentication is misconfigured:", message);
    return new Response(JSON.stringify({ error: "Backup export authentication is misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const database = getDatabase();
  const store = getStore("firmas");
  const client = await database.pool.connect();

  try {
    const reportsRes = await client.query(
      "SELECT * FROM bitacora_reports ORDER BY created_at ASC",
    );

    const reportesCompletos = [];
    for (const row of reportsRes.rows) {
      const payload = await rehidratarFirmas(row.payload, store);
      reportesCompletos.push({ ...row, payload });
    }

    const ordenesRes = await client.query(
      "SELECT * FROM ordenes_trabajo ORDER BY fecha_apertura ASC",
    );
    const seguimientoRes = await client.query(
      "SELECT * FROM ot_seguimiento ORDER BY fecha ASC",
    );

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
    const message = error instanceof Error ? error.message : String(error);
    console.error("Backup export failed:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } finally {
    client.release();
  }
};

export const config = {
  path: "/api/export-backup",
};
