(function () {
  const CATALOGO_SISTEMAS = [
    { sistema: 'SUSPENSIÓN', palabrasClave: ['bujes', 'muelles', 'tirantes', 'amortiguador', 'bolsa de aire', 'lanza', 'tacones'] },
    { sistema: 'FRENOS / AIRE', palabrasClave: ['freno', 'balata', 'matraca', 'camara', 'manguera', 'fuga de aire', 'siroco', 'valvula', 'presion'] },
    { sistema: 'LLANTAS Y RINES', palabrasClave: ['llanta', 'ponchada', 'chipote', 'rin', 'birlo', 'tuerca', 'cambiar llantas', 'desgaste'] },
    { sistema: 'CARROCERÍA / CHASIS', palabrasClave: ['parabrisas', 'golpe', 'defensa', 'cofre', 'puerta', 'manija', 'espejo', 'ganchos', 'cadena', 'plafonera'] },
    { sistema: 'ELÉCTRICO / LUCES', palabrasClave: ['plafon', 'foco', 'calavera', 'faros', 'bateria', 'marcha', 'alternador', 'testigos', 'espias'] },
    { sistema: 'QUINTA RUEDA', palabrasClave: ['quinta', 'mordaza', 'plato', 'juego de quinta'] },
    { sistema: 'CLIMATIZACIÓN', palabrasClave: ['a/c', 'aire acondicionado', 'clima', 'compresor'] }
  ];

  const TEXTOS_INVALIDOS = ['ok', 'bien', 'sin novedad', 'sin falla', 'ninguna', 'n/a', 'limpio', 'normal', 'todo bien', ''];

  const COMPONENTES = [
    { key: 'tracto', nombre: 'TRACTOCAMIÓN' },
    { key: 'tolva1', nombre: 'TOLVA 1' },
    { key: 'dolly', nombre: 'DOLLY' },
    { key: 'tolva2', nombre: 'TOLVA 2' }
  ];

  // Regla de negocio: las fallas OFICIALES vienen únicamente de payload.ticketsFallas
  // (detalles_falla en el panel). Las observaciones en lenguaje coloquial del operador
  // NUNCA se convierten en fallas: se devuelven aparte, solo como contexto.
  function procesarReporteFallas(reporte) {
    const fallas = [];

    if (Array.isArray(reporte?.detalles_falla)) {
      reporte.detalles_falla.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        fallas.push({
          componente: item.componente || 'TRACTOCAMIÓN',
          sistema: item.categoria || item.sistema || 'CHECKLIST',
          descripcion: item.falla || item.nombre || item.descripcion || 'Falla marcada en checklist',
          origen: 'CHECKLIST'
        });
      });
    }

    return { fallas, observaciones: extraerObservaciones(reporte) };
  }

  function extraerObservaciones(reporte) {
    const observacionesRaw = reporte?.observaciones;
    let obsObj = {};

    if (typeof observacionesRaw === 'string') {
      try {
        obsObj = JSON.parse(observacionesRaw);
      } catch (error) {
        obsObj = { tracto: observacionesRaw };
      }
    } else if (observacionesRaw && typeof observacionesRaw === 'object') {
      obsObj = observacionesRaw;
    }

    const observaciones = [];

    COMPONENTES.forEach((comp) => {
      const texto = String(obsObj?.[comp.key] || '').trim();
      const textoLimpio = texto.toLowerCase();
      const esInvalido = TEXTOS_INVALIDOS.includes(textoLimpio) || textoLimpio.length < 3;
      if (!esInvalido) {
        observaciones.push({ componente: comp.nombre, texto });
      }
    });

    return observaciones;
  }

  if (typeof window !== 'undefined') {
    window.CATALOGO_SISTEMAS = CATALOGO_SISTEMAS;
    window.procesarReporteFallas = procesarReporteFallas;
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.CATALOGO_SISTEMAS = CATALOGO_SISTEMAS;
    globalThis.procesarReporteFallas = procesarReporteFallas;
  }
})();
