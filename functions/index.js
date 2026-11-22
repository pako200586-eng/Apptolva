const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const { gestionar, obtenerCatalogo } = require("./operadores");

initializeApp();

exports.asignarFolioNOM087 = onDocumentCreated({
  document: "bitacora_reports/{docId}",
  region: "us-central1",
  retry: true,
  maxInstances: 10,
}, async (event) => {
  const db = getFirestore();
  const registroRef = event.data.ref;
  const contadorRef = db.collection("metadata").doc("contadores_folios");

  const folio = await db.runTransaction(async (transaction) => {
    const registro = await transaction.get(registroRef);
    if (!registro.exists) {
      logger.warn("El registro ya no existe; no se asignó folio.", { id: registroRef.id });
      return null;
    }
    if (registro.get("report_type") !== "bitacora") return null;
    if (registro.get("folio_definitivo")) return null;

    const contador = await transaction.get(contadorRef);
    const actual = contador.exists ? contador.get("nom087") : 0;
    if (!Number.isSafeInteger(actual) || actual < 0 || actual >= Number.MAX_SAFE_INTEGER) {
      throw new Error("El contador NOM-087 no contiene un número entero válido.");
    }

    const nuevo = actual + 1;
    const definitivo = `NOM-${String(nuevo).padStart(6, "0")}`;
    transaction.set(contadorRef, { nom087: nuevo }, { merge: true });
    transaction.update(registroRef, {
      folio_definitivo: definitivo,
      fecha_recepcion_nube: FieldValue.serverTimestamp(),
    });
    return definitivo;
  });

  if (folio) logger.info("Folio NOM-087 asignado.", { id: registroRef.id, folio });
});

const PROYECTOS_PERMITIDOS = new Set(["apptolva-staging", "gen-lang-client-0015118308"]);

function exigirProyectoPermitido() {
  const proyecto = process.env.GCLOUD_PROJECT;
  if (!PROYECTOS_PERMITIDOS.has(proyecto) &&
      !(proyecto === "demo-apptolva" && process.env.FIRESTORE_EMULATOR_HOST)) {
    throw new HttpsError("failed-precondition", "La gestión de operadores no está habilitada en este proyecto.");
  }
}

async function verificarSesion(request) {
  const bearer = request.rawRequest.get("authorization")?.match(/^Bearer\s+(.+)$/i);
  if (!request.auth || !bearer) throw new HttpsError("unauthenticated", "Inicia sesión nuevamente.");
  try {
    const identidad = await getAuth().verifyIdToken(bearer[1], true);
    if (identidad.uid !== request.auth.uid) throw new Error("La identidad no coincide.");
  } catch (error) {
    logger.warn("No se pudo validar la sesión para gestionar operadores.", { code: error.code });
    throw new HttpsError("unauthenticated", "La sesión no es válida o fue revocada.");
  }
}

exports.gestionarOperador = onCall({
  region: "us-central1", memory: "256MiB", maxInstances: 5, timeoutSeconds: 60,
}, async (request) => {
  exigirProyectoPermitido();
  await verificarSesion(request);
  const correos = new Set((process.env.DEPURACION_MASIVA_EMAILS || "")
    .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
  return gestionar({ request, db: getFirestore(), auth: getAuth(), fieldValue: FieldValue, correos });
});

exports.catalogoOperadores = onCall({
  region: "us-central1", memory: "256MiB", maxInstances: 5, timeoutSeconds: 60,
}, async (request) => {
  exigirProyectoPermitido();
  await verificarSesion(request);
  return obtenerCatalogo({ request, db: getFirestore() });
});
