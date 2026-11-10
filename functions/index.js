const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

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
