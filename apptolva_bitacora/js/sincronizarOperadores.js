import { getFunctions, httpsCallable, onAuthStateChanged } from "./firebase-sdk.js";

function validarCatalogo(operadores) {
  if (!operadores || typeof operadores !== "object" || Array.isArray(operadores)) {
    throw new Error("El catálogo recibido no es válido.");
  }
  for (const [numero, operador] of Object.entries(operadores)) {
    if (!/^\d{1,20}$/.test(numero) || typeof operador?.nombre !== "string" ||
        !operador.nombre.trim() || operador.nombre.length > 120 || operador.depto !== "TRANSPORTES") {
      throw new Error("El catálogo recibido contiene un operador inválido.");
    }
  }
  return operadores;
}

export function iniciarSincronizacionOperadores(app, auth) {
  if (app.options.projectId !== "apptolva-staging") return;
  const semilla = { ...window.CATALOGO_OPERADORES };
  const catalogo = window.CATALOGO_OPERADORES;
  const consultar = httpsCallable(getFunctions(app, "us-central1"), "catalogoOperadores");
  let version = 0;
  let usuario = null;

  function aplicar(operadores) {
    for (const numero of Object.keys(catalogo)) delete catalogo[numero];
    Object.assign(catalogo, semilla, operadores);
    window.dispatchEvent(new Event("apptolva-catalogo-operadores"));
  }

  function estado(mensaje) {
    const elemento = document.getElementById("estado-catalogo-operadores");
    if (elemento) {
      elemento.textContent = mensaje;
      elemento.hidden = !mensaje;
    }
  }

  async function sincronizar(actual, actualVersion) {
    try {
      const { data } = await consultar();
      const operadores = validarCatalogo(data?.operadores);
      if (version !== actualVersion || auth.currentUser?.uid !== actual.uid) return;
      aplicar(operadores);
      try {
        localStorage.setItem(`apptolva_operadores_${app.options.projectId}_${actual.uid}`, JSON.stringify(operadores));
        estado("");
      } catch (error) {
        console.error("No se pudo guardar la copia del catálogo de operadores:", error);
        estado("El catálogo está actualizado, pero no se pudo guardar para usarlo sin conexión.");
      }
    } catch (error) {
      if (version !== actualVersion) return;
      console.error("No se pudo sincronizar el catálogo de operadores:", error);
      estado("No se pudo actualizar el catálogo de operadores. Se usa la última copia disponible.");
    }
  }

  onAuthStateChanged(auth, (actual) => {
    const actualVersion = ++version;
    usuario = actual;
    aplicar({});
    estado("");
    if (!actual || actual.isAnonymous) return;
    try {
      const copia = localStorage.getItem(`apptolva_operadores_${app.options.projectId}_${actual.uid}`);
      if (copia) aplicar(validarCatalogo(JSON.parse(copia)));
    } catch (error) {
      console.error("No se pudo leer la copia del catálogo de operadores:", error);
      estado("La copia local del catálogo no está disponible; se intentará actualizar.");
    }
    sincronizar(actual, actualVersion);
  });
  window.addEventListener("online", () => {
    if (usuario && !usuario.isAnonymous) sincronizar(usuario, version);
  });
  window.addEventListener("apptolva-actualizar-operadores", () => {
    if (usuario && !usuario.isAnonymous) sincronizar(usuario, version);
  });
}
