export function crearObservadorFolio({ escuchar, mostrar, informarError }) {
  let actual = null;
  let completado = null;

  function detener() {
    if (!actual) return;
    const anterior = actual;
    actual = null;
    if (anterior.desuscribir) anterior.desuscribir();
  }

  function observar(id, referencia) {
    if (actual?.id === id || completado === id) return;
    detener();
    completado = null;
    const observacion = { id, desuscribir: null };
    actual = observacion;
    mostrar("pendiente");
    const desuscribir = escuchar(referencia, (snapshot) => {
      if (actual !== observacion) return;
      const folio = snapshot.exists() && snapshot.data().folio_definitivo;
      if (typeof folio !== "string" || !folio.trim()) return;
      completado = id;
      mostrar("asignado", folio);
      detener();
    }, (error) => {
      if (actual !== observacion) return;
      detener();
      informarError(error);
      mostrar("error");
    });
    observacion.desuscribir = desuscribir;
    if (actual !== observacion) desuscribir();
  }

  return {
    observar,
    detener() {
      detener();
      completado = null;
    }
  };
}
