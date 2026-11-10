const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { getFirestore } = require("firebase-admin/firestore");
const { asignarFolioNOM087 } = require("./index");

if (!process.env.FIRESTORE_EMULATOR_HOST || process.env.GCLOUD_PROJECT !== "demo-apptolva") {
  throw new Error("Ejecuta esta prueba únicamente con Firestore Emulator y el proyecto demo-apptolva.");
}

const db = getFirestore();
const collection = db.collection("bitacora_reports");
const counter = db.collection("metadata").doc("contadores_folios");
const ids = [];

after(async () => {
  await Promise.all(ids.map((id) => collection.doc(id).delete()));
});

async function esperarFolios(refs) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const docs = await Promise.all(refs.map((ref) => ref.get()));
    if (docs.every((doc) => doc.get("folio_definitivo"))) return docs;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Las funciones no asignaron todos los folios dentro del plazo.");
}

test("el trigger asigna consecutivos y resiste eventos repetidos y concurrentes", async () => {
  await counter.set({ nom087: 0 });
  const refs = Array.from({ length: 5 }, () => {
    const id = randomUUID();
    ids.push(id);
    return collection.doc(id);
  });
  await Promise.all(refs.map((ref, i) => ref.set({
    report_type: "bitacora",
    folio: `FB${1001 + i}`,
    folio_provisional: `OFF-${i}`,
  })));

  const docs = await esperarFolios(refs);
  const folios = docs.map((doc) => doc.get("folio_definitivo")).sort();
  assert.deepEqual(folios, ["NOM-000001", "NOM-000002", "NOM-000003", "NOM-000004", "NOM-000005"]);
  assert.ok(docs.every((doc) => doc.get("fecha_recepcion_nube")));
  assert.ok(docs.every((doc) => /^FB\d+$/.test(doc.get("folio"))));
  assert.ok(docs.every((doc) => /^OFF-/.test(doc.get("folio_provisional"))));

  await Promise.all(refs.flatMap((ref) =>
    Array.from({ length: 3 }, () => asignarFolioNOM087.run({ data: { ref } }))
  ));
  assert.equal((await counter.get()).get("nom087"), 5);
  assert.deepEqual((await Promise.all(refs.map((ref) => ref.get())))
    .map((doc) => doc.get("folio_definitivo")).sort(), folios);

  const concurrentRef = collection.doc(randomUUID());
  ids.push(concurrentRef.id);
  await concurrentRef.set({ report_type: "bitacora", folio_provisional: "OFF-CONCURRENTE" });
  await Promise.all(Array.from({ length: 5 }, () =>
    asignarFolioNOM087.run({ data: { ref: concurrentRef } })
  ));
  assert.equal((await concurrentRef.get()).get("folio_definitivo"), "NOM-000006");
  assert.equal((await counter.get()).get("nom087"), 6);

  const checklistRef = collection.doc(randomUUID());
  ids.push(checklistRef.id);
  await checklistRef.set({ report_type: "checklist", folio: "F-1001" });
  await asignarFolioNOM087.run({ data: { ref: checklistRef } });
  assert.equal((await checklistRef.get()).get("folio_definitivo"), undefined);
  assert.equal((await counter.get()).get("nom087"), 6);
});
