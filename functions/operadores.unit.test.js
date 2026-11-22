const { test } = require("node:test");
const assert = require("node:assert/strict");
const { gestionar, obtenerCatalogo } = require("./operadores");

function fixture() {
  const docs = new Map();
  const users = new Map();
  const db = {
    collection(name) {
      return { doc(id) {
        const key = `${name}/${id}`;
        return {
          key,
          async get() {
            const value = docs.get(key);
            return { exists: value !== undefined, data: () => value, get: (field) => value?.[field] };
          },
          async update(data) {
            if (!docs.has(key)) throw new Error("Missing document");
            docs.set(key, { ...docs.get(key), ...data });
          },
        };
      } };
    },
    async runTransaction(fn) {
      const writes = [];
      const tx = {
        get: (ref) => ref.get(),
        create: (ref, value) => writes.push(() => {
          if (docs.has(ref.key)) throw new Error("Document already exists");
          docs.set(ref.key, value);
        }),
        update: (ref, value) => writes.push(() => docs.set(ref.key, { ...docs.get(ref.key), ...value })),
        set: (ref, value, options) => writes.push(() => {
          const previous = options?.merge ? docs.get(ref.key) || {} : {};
          docs.set(ref.key, {
            ...previous, ...value,
            ...(value.operadores ? { operadores: { ...previous.operadores, ...value.operadores } } : {}),
          });
        }),
      };
      const result = await fn(tx);
      writes.forEach((write) => write());
      return result;
    },
  };
  const auth = {
    async getUserByEmail(email) {
      if (!users.has(email)) throw Object.assign(new Error("not found"), { code: "auth/user-not-found" });
      return { ...users.get(email) };
    },
    async createUser(user) {
      if (users.has(user.email)) throw Object.assign(new Error("exists"), { code: "auth/email-already-exists" });
      users.set(user.email, { ...user, disabled: false });
    },
    async updateUser(uid, updates) {
      const user = [...users.values()].find((item) => item.uid === uid);
      if (!user) throw new Error("Missing user");
      Object.assign(user, updates);
    },
    async revokeRefreshTokens(uid) {
      if (![...users.values()].some((user) => user.uid === uid)) throw new Error("Missing user");
    },
  };
  docs.set("usuarios/admin@example.test", { rol: "admin", uid: "admin-uid" });
  const request = {
    auth: { uid: "admin-uid", token: { email: "admin@example.test", firebase: { sign_in_provider: "password" } } },
    data: { accion: "alta", numeroEmpleado: "123", nombre: "Operador prueba", password: "password-1" },
  };
  return {
    db, auth, docs, users, request,
    args: { request, db, auth, fieldValue: { serverTimestamp: () => "timestamp" }, correos: new Set(["admin@example.test"]) },
  };
}

test("alta y recuperación no sobrescriben perfiles ni guardan contraseñas en Firestore", async () => {
  const { db, docs, users, args, request } = fixture();
  let count = 0;
  const failingDb = {
    collection: db.collection.bind(db),
    async runTransaction(callback) {
      if (++count === 2) throw new Error("fallo simulado");
      return db.runTransaction(callback);
    },
  };
  await assert.rejects(gestionar({ ...args, db: failingDb }), { code: "internal" });
  assert.equal(docs.has("usuarios/123@apptolva.com"), false);
  const uid = users.get("123@apptolva.com").uid;
  await assert.rejects(gestionar(args), { code: "aborted" });
  docs.get("altas_operadores/123").lease_hasta = 0;
  assert.equal((await gestionar(args)).uid, uid);
  assert.equal(docs.get("usuarios/123@apptolva.com").rol, "operador");
  assert.equal((await obtenerCatalogo({ request, db })).operadores["123"].nombre, "OPERADOR PRUEBA");
  assert.ok(!JSON.stringify([...docs]).includes(request.data.password));
  await assert.rejects(gestionar(args), { code: "already-exists" });
});

test("solo el administrador autorizado gestiona cuentas y se protegen roles especiales", async () => {
  const { args, docs, request, users } = fixture();
  await assert.rejects(gestionar({ ...args, correos: new Set() }), { code: "permission-denied" });
  docs.set("usuarios/admin@example.test", { rol: "lectura", uid: "admin-uid" });
  await assert.rejects(gestionar(args), { code: "permission-denied" });
  docs.set("usuarios/admin@example.test", { rol: "admin", uid: "admin-uid" });
  await assert.rejects(gestionar({ ...args, request: { ...request, data: { ...request.data, password: "corta" } } }), { code: "invalid-argument" });
  await gestionar(args);
  const user = users.get("123@apptolva.com");
  const reset = { ...request, data: { accion: "reset_password", numeroEmpleado: "123", password: "password-2" } };
  assert.equal((await gestionar({ ...args, request: reset })).uid, user.uid);
  assert.equal(user.password, "password-2");
  user.disabled = true;
  await assert.rejects(gestionar({ ...args, request: reset }), { code: "failed-precondition" });
  assert.equal(user.disabled, true);
  user.disabled = false;
  docs.get("usuarios/123@apptolva.com").rol = "master";
  await assert.rejects(gestionar({ ...args, request: reset }), { code: "failed-precondition" });
});

test("un correo existente ajeno nunca se modifica", async () => {
  const { args, users, docs } = fixture();
  users.set("123@apptolva.com", { uid: "ajeno", password: "original", disabled: false });
  await assert.rejects(gestionar(args), { code: "already-exists" });
  assert.equal(users.get("123@apptolva.com").password, "original");
  assert.equal(docs.has("usuarios/123@apptolva.com"), false);
});

test("las funciones solo aceptan los proyectos previstos y el emulador", async () => {
  const functions = require("./index");
  assert.equal(typeof functions.asignarFolioNOM087, "function");
  assert.equal(typeof functions.gestionarOperador, "function");
  assert.equal(typeof functions.catalogoOperadores, "function");
  const project = process.env.GCLOUD_PROJECT;
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  const request = { rawRequest: { get: () => undefined } };
  try {
    delete process.env.FIRESTORE_EMULATOR_HOST;
    for (const id of ["apptolva-staging", "gen-lang-client-0015118308"]) {
      process.env.GCLOUD_PROJECT = id;
      await assert.rejects(functions.gestionarOperador.run(request), { code: "unauthenticated" });
      await assert.rejects(functions.catalogoOperadores.run(request), { code: "unauthenticated" });
    }
    for (const id of ["otro-proyecto", "demo-apptolva"]) {
      process.env.GCLOUD_PROJECT = id;
      await assert.rejects(functions.gestionarOperador.run(request), { code: "failed-precondition" });
      await assert.rejects(functions.catalogoOperadores.run(request), { code: "failed-precondition" });
    }
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
    await assert.rejects(functions.gestionarOperador.run(request), { code: "unauthenticated" });
    await assert.rejects(functions.catalogoOperadores.run(request), { code: "unauthenticated" });
  } finally {
    if (project === undefined) delete process.env.GCLOUD_PROJECT;
    else process.env.GCLOUD_PROJECT = project;
    if (emulator === undefined) delete process.env.FIRESTORE_EMULATOR_HOST;
    else process.env.FIRESTORE_EMULATOR_HOST = emulator;
  }
});
