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

  function normalizarObservaciones(reporte) {
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

    const componentes = [
      { key: 'tracto', nombre: 'TRACTOCAMIÓN' },
      { key: 'tolva1', nombre: 'TOLVA 1' },
      { key: 'dolly', nombre: 'DOLLY' },
      { key: 'tolva2', nombre: 'TOLVA 2' }
    ];

    const fallasDetectadas = [];

    componentes.forEach((comp) => {
      let texto = String(obsObj?.[comp.key] || '').trim();
      const textoLimpio = texto.toLowerCase();
      const esInvalido = TEXTOS_INVALIDOS.includes(textoLimpio) || textoLimpio.length < 3;

      if (!esInvalido) {
        const fallasIndividuales = texto
          .split(/[,;\n]+/)
          .map((f) => f.trim())
          .filter((f) => f.length > 2);

        fallasIndividuales.forEach((desc) => {
          let sistemaDetectado = 'GENERAL / REVISIÓN';
          const descMin = desc.toLowerCase();

          for (const cat of CATALOGO_SISTEMAS) {
            if (cat.palabrasClave.some((palabra) => descMin.includes(palabra))) {
              sistemaDetectado = cat.sistema;
              break;
            }
          }

          fallasDetectadas.push({
            reporte_id: reporte?.reporte_id || '',
            folio_bitacora: reporte?.folio || '',
            unidad: reporte?.unidad || '',
            operador: reporte?.operador || '',
            fecha: reporte?.fecha || '',
            componente: comp.nombre,
            sistema: sistemaDetectado,
            descripcion: desc,
            origen: 'OBSERVACIÓN OPERADOR'
          });
        });
      }
    });

    if (fallasDetectadas.length === 0 && Array.isArray(reporte?.detalles_falla)) {
      reporte.detalles_falla.forEach((item) => {
        fallasDetectadas.push({
          reporte_id: reporte?.reporte_id || '',
          folio_bitacora: reporte?.folio || '',
          unidad: reporte?.unidad || '',
          operador: reporte?.operador || '',
          fecha: reporte?.fecha || '',
          componente: item.componente || 'TRACTOCAMIÓN',
          sistema: item.categoria || item.sistema || 'CHECKLIST',
          descripcion: item.falla || item.nombre || item.descripcion || 'Falla marcada en checklist',
          origen: 'CHECKLIST'
        });
      });
    }

    return fallasDetectadas;
  }

  if (typeof window !== 'undefined') {
    window.CATALOGO_SISTEMAS = CATALOGO_SISTEMAS;
    window.normalizarObservaciones = normalizarObservaciones;
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.CATALOGO_SISTEMAS = CATALOGO_SISTEMAS;
    globalThis.normalizarObservaciones = normalizarObservaciones;
  }
})();
