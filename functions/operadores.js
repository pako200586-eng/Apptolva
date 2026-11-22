const { randomUUID } = require("node:crypto");
const { HttpsError } = require("firebase-functions/v2/https");

const LEASE_MS = 5 * 60 * 1000;
const ROLES_RUTA = new Set(["operador", "master", "admin", "lectura"]);

function validarDatos(data) {
  const accion = data?.accion;
  const numero = typeof data?.numeroEmpleado === "string" ? data.numeroEmpleado.trim() : "";
  if (!["alta", "reset_password"].includes(accion) || !/^\d{1,20}$/.test(numero)) {
    throw new HttpsError("invalid-argument", "Indica una acción y un número de empleado válidos.");
  }
  if (typeof data.password !== "string" || data.password.length < 8 || data.password.length > 128) {
    throw new HttpsError("invalid-argument", "La contraseña debe tener entre 8 y 128 caracteres.");
  }
  const nombre = typeof data.nombre === "string" ? data.nombre.trim().replace(/\s+/g, " ").toUpperCase() : "";
  if (accion === "alta" && (!nombre || nombre.length > 120)) {
    throw new HttpsError("invalid-argument", "Indica un nombre de hasta 120 caracteres.");
  }
  return { accion, numero, nombre, password: data.password, email: `${numero}@apptolva.com` };
}

async function usuarioPorCorreo(auth, email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code === "auth/user-not-found") return null;
    throw error;
  }
}

async function autorizar(request, db, correos, soloAdmin) {
  const token = request.auth?.token;
  const email = typeof token?.email === "string" ? token.email.trim().toLowerCase() : "";
  if (!request.auth?.uid || token?.firebase?.sign_in_provider !== "password" || !email) {
    throw new HttpsError("unauthenticated", "Inicia sesión con una cuenta autorizada.");
  }
  const perfil = await db.collection("usuarios").doc(email).get();
  const data = perfil.data();
  if (!perfil.exists || !ROLES_RUTA.has(data.rol) || (data.uid && data.uid !== request.auth.uid)) {
    throw new HttpsError("permission-denied", "La cuenta no tiene acceso autorizado.");
  }
  if (soloAdmin && (data.rol !== "admin" || !correos.has(email))) {
    throw new HttpsError("permission-denied", "Esta operación está reservada al administrador autorizado.");
  }
  return email;
}

async function gestionar({ request, db, auth, fieldValue, correos }) {
  const responsable = await autorizar(request, db, correos, true);
  const { accion, numero, nombre, password, email } = validarDatos(request.data);
  const perfilRef = db.collection("usuarios").doc(email);

  if (accion === "reset_password") {
    const perfil = await perfilRef.get();
    const data = perfil.data();
    if (!perfil.exists || data.rol !== "operador" || data.numero_empleado !== numero ||
        typeof data.uid !== "string" || data.rol_evaluaciones) {
      throw new HttpsError("failed-precondition", "El perfil no es un operador válido o tiene permisos especiales.");
    }
    const usuario = await usuarioPorCorreo(auth, email);
    if (!usuario || usuario.uid !== data.uid || usuario.disabled) {
      throw new HttpsError("failed-precondition", "La cuenta no coincide con el perfil o está deshabilitada.");
    }
    try {
      await auth.updateUser(usuario.uid, { password });
      await auth.revokeRefreshTokens(usuario.uid);
      await perfilRef.update({
        password_actualizada_en: fieldValue.serverTimestamp(),
        password_actualizada_por: responsable,
      });
    } catch (error) {
      console.error("No se completó el restablecimiento del operador.", { numero, code: error.code });
      throw new HttpsError("internal", "El cambio pudo aplicarse parcialmente. Verifica la cuenta antes de reintentar.");
    }
    return { accion, email, uid: usuario.uid };
  }

  const reservaRef = db.collection("altas_operadores").doc(numero);
  const catalogoRef = db.collection("sistema").doc("catalogo_operadores");
  const lease = randomUUID();
  const ahora = Date.now();
  const reserva = await db.runTransaction(async (tx) => {
    const [perfil, anterior] = await Promise.all([tx.get(perfilRef), tx.get(reservaRef)]);
    if (perfil.exists) throw new HttpsError("already-exists", "Ya existe un perfil para este empleado; no se modificó.");
    const datos = anterior.data();
    if (anterior.exists && (datos.nombre !== nombre || datos.email !== email || datos.estado !== "pendiente")) {
      throw new HttpsError("failed-precondition", "Existe un alta incompatible; revisa el registro antes de continuar.");
    }
    if (anterior.exists && datos.lease_hasta > ahora) {
      throw new HttpsError("aborted", "Hay un alta en curso. Espera unos minutos antes de reintentar.");
    }
    const uid = anterior.exists ? datos.uid : randomUUID();
    tx.set(reservaRef, {
      uid, email, nombre, estado: "pendiente", lease, lease_hasta: ahora + LEASE_MS,
      actualizado_en: fieldValue.serverTimestamp(), responsable,
    });
    return { uid };
  });

  try {
    const existente = await usuarioPorCorreo(auth, email);
    if (existente && (existente.uid !== reserva.uid || existente.disabled)) {
      throw new HttpsError("already-exists", "El correo ya pertenece a otra cuenta o está deshabilitado.");
    }
    if (existente) {
      await auth.updateUser(reserva.uid, { password, displayName: nombre });
    } else {
      await auth.createUser({ uid: reserva.uid, email, password, displayName: nombre });
    }
    await db.runTransaction(async (tx) => {
      const [perfil, actual] = await Promise.all([tx.get(perfilRef), tx.get(reservaRef)]);
      if (perfil.exists || !actual.exists || actual.get("lease") !== lease || actual.get("estado") !== "pendiente") {
        throw new HttpsError("aborted", "El alta cambió durante la operación; revisa la cuenta antes de continuar.");
      }
      tx.create(perfilRef, {
        uid: reserva.uid, numero_empleado: numero, nombre, rol: "operador",
        creado_en: fieldValue.serverTimestamp(),
      });
      tx.set(catalogoRef, {
        operadores: { [numero]: { nombre, depto: "TRANSPORTES" } },
        actualizado_en: fieldValue.serverTimestamp(),
      }, { merge: true });
      tx.update(reservaRef, { estado: "completado", lease_hasta: 0, actualizado_en: fieldValue.serverTimestamp() });
    });
  } catch (error) {
    console.error("No se completó el alta del operador.", { numero, code: error.code });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "El alta pudo quedar incompleta. Espera cinco minutos y reintenta con el mismo nombre.");
  }
  return { accion, email, uid: reserva.uid };
}

async function obtenerCatalogo({ request, db }) {
  await autorizar(request, db, new Set(), false);
  const snapshot = await db.collection("sistema").doc("catalogo_operadores").get();
  return { operadores: snapshot.exists ? snapshot.get("operadores") || {} : {} };
}

module.exports = { gestionar, obtenerCatalogo, validarDatos };
