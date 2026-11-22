const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomInt, randomUUID } = require("node:crypto");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { gestionar, obtenerCatalogo } = require("./operadores");

if (process.env.GCLOUD_PROJECT !== "demo-apptolva" ||
    !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Estas pruebas requieren los emuladores Auth y Firestore de demo-apptolva.");
}

test("alta, recuperación, autorización y restablecimiento de operadores", async (t) => {
  const app = initializeApp({ projectId: "demo-apptolva" }, randomUUID());
  const db = getFirestore(app);
  const auth = getAuth(app);
  const numero = String(randomInt(100000000, 999999999));
  const email = `${numero}@apptolva.com`;
  const adminEmail = `admin-${randomUUID()}@example.test`;
  const admin = await auth.createUser({ email: adminEmail, password: "admin-password" });
  const adminRef = db.collection("usuarios").doc(adminEmail);
  const perfilRef = db.collection("usuarios").doc(email);
  const reservaRef = db.collection("altas_operadores").doc(numero);
  const catalogoRef = db.collection("sistema").doc("catalogo_operadores");
  await adminRef.create({ rol: "admin", uid: admin.uid });
  const request = {
    auth: { uid: admin.uid, token: { email: adminEmail, firebase: { sign_in_provider: "password" } } },
    data: { accion: "alta", numeroEmpleado: numero, nombre: "Operador prueba", password: "clave-segura-1" },
  };
  const args = { request, db, auth, fieldValue: FieldValue, correos: new Set([adminEmail]) };
  t.after(async () => {
    const user = await auth.getUserByEmail(email).catch((error) => {
      if (error.code === "auth/user-not-found") return null;
      throw error;
    });
    if (user) await auth.deleteUser(user.uid);
    await auth.deleteUser(admin.uid);
    await Promise.all([adminRef.delete(), perfilRef.delete(), reservaRef.delete(), catalogoRef.delete()]);
    await deleteApp(app);
  });

  await t.test("rechaza cuentas fuera de la lista y contraseñas cortas", async () => {
    await assert.rejects(gestionar({ ...args, correos: new Set() }), { code: "permission-denied" });
    await assert.rejects(gestionar({ ...args, request: { ...request, data: { ...request.data, password: "corta" } } }), { code: "invalid-argument" });
    assert.equal((await perfilRef.get()).exists, false);
  });

  await t.test("reanuda una cuenta creada en Auth si falla la escritura de Firestore", async () => {
    let transacciones = 0;
    const dbConFallo = {
      collection: db.collection.bind(db),
      runTransaction: async (callback) => {
        transacciones++;
        if (transacciones === 2) throw new Error("fallo simulado");
        return db.runTransaction(callback);
      },
    };
    await assert.rejects(gestionar({ ...args, db: dbConFallo }), { code: "internal" });
    const usuario = await auth.getUserByEmail(email);
    assert.equal((await perfilRef.get()).exists, false);
    await assert.rejects(gestionar(args), { code: "aborted" });
    await reservaRef.update({ lease_hasta: 0 });
    const resultado = await gestionar(args);
    assert.equal(resultado.uid, usuario.uid);
    assert.equal((await perfilRef.get()).get("rol"), "operador");
    const catalogo = await obtenerCatalogo({ request, db });
    assert.equal(catalogo.operadores[numero].nombre, "OPERADOR PRUEBA");
    await assert.rejects(gestionar(args), { code: "already-exists" });
  });

  await t.test("conserva UID y no reactiva cuentas deshabilitadas o privilegiadas", async () => {
    const anterior = await auth.getUserByEmail(email);
    const reset = { ...request, data: { accion: "reset_password", numeroEmpleado: numero, password: "clave-segura-2" } };
    const resultado = await gestionar({ ...args, request: reset });
    assert.equal(resultado.uid, anterior.uid);
    assert.equal((await perfilRef.get()).get("password_actualizada_por"), adminEmail);
    await auth.updateUser(anterior.uid, { disabled: true });
    await assert.rejects(gestionar({ ...args, request: reset }), { code: "failed-precondition" });
    assert.equal((await auth.getUser(anterior.uid)).disabled, true);
    await auth.updateUser(anterior.uid, { disabled: false });
    await perfilRef.update({ rol: "master" });
    await assert.rejects(gestionar({ ...args, request: reset }), { code: "failed-precondition" });
  });
});
