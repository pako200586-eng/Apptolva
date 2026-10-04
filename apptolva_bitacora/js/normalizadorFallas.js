(function () {
  const COMPONENTES = [
    { key: 'tracto', nombre: 'TRACTOCAMIÓN', catKey: 'TRACTO' },
    { key: 'tolva1', nombre: '1ra TOLVA', catKey: 'TOLVAS' },
    { key: 'dolly', nombre: 'DOLLY', catKey: 'DOLLY' },
    { key: 'tolva2', nombre: '2da TOLVA', catKey: 'TOLVAS' }
  ];

  const TEXTOS_DESCARTABLES = [
    'ok', 'bien', 'sin observaciones', 'sin novedad', 'ninguna', 'n/a',
    'limpio', 'normal', 'todo bien', 'correcto', 's/n', 'nada', 'sin fallas'
  ];

  function normalizarTexto(texto) {
    return String(texto || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function resolverCatalogo(catKey) {
    const maestro = (typeof window !== 'undefined' && window.CATALOGO_MAESTRO_BACHOCO)
      || globalThis.CATALOGO_MAESTRO_BACHOCO
      || {};
    return maestro[catKey] || [];
  }

  function clasificarTexto(frase, catalogo) {
    const fraseNorm = normalizarTexto(frase);

    for (const regla of catalogo) {
      const terminos = Array.isArray(regla.terminosTaller) ? regla.terminosTaller : [];
      const match = terminos.some((termino) => fraseNorm.includes(normalizarTexto(termino)));
      if (match) {
        return { categoria: regla.categoria, itemOficial: regla.itemOficial };
      }
    }

    return { categoria: 'GENERAL / REVISIÓN TALLER', itemOficial: frase };
  }

  function extraerObservacionesPorComponente(reporte) {
    const obsRaw = reporte?.payload?.observaciones || reporte?.observaciones;
    let obsMap = {};

    if (typeof obsRaw === 'string') {
      try {
        obsMap = JSON.parse(obsRaw) || {};
      } catch {
        obsMap = { tracto: obsRaw };
      }
    } else if (obsRaw && typeof obsRaw === 'object') {
      obsMap = obsRaw;
    }

    return obsMap;
  }

  function extraerFallasChecklist(reporte) {
    const p = reporte?.payload || reporte || {};
    const fallasPorComp = { tracto: [], tolva1: [], dolly: [], tolva2: [] };

    const mapearCompKey = (texto) => {
      const t = normalizarTexto(texto);
      if (t.includes('dolly')) return 'dolly';
      if (/tolva\s*2|tolva2|2da\s*tolva/.test(t)) return 'tolva2';
      if (/tolva\s*1|tolva1|1ra\s*tolva/.test(t)) return 'tolva1';
      return 'tracto';
    };

    if (Array.isArray(p.checklistData) && p.checklistData.length) {
      p.checklistData.forEach((seccion) => {
        const cKey = fallasPorComp[seccion?.id] ? seccion.id : mapearCompKey(seccion?.titulo);

        (seccion?.categorias || []).forEach((cat) => {
          (cat?.items || []).forEach((it) => {
            if (String(it?.estado || '').toUpperCase() === 'MAL') {
              fallasPorComp[cKey].push({
                item: it.item || it.nombre || 'Falla de inspección',
                categoriaSugerida: cat.cat || cat.nombre || 'GENERAL'
              });
            }
          });
        });
      });

      return fallasPorComp;
    }

    const listaFallas = Array.isArray(p.detalles_falla)
      ? p.detalles_falla
      : (Array.isArray(p.ticketsFallas) ? p.ticketsFallas : []);

    if (listaFallas.length) {
      listaFallas.forEach((falla) => {
        if (!falla || typeof falla !== 'object') return;
        const cKey = mapearCompKey(falla.componente);
        fallasPorComp[cKey].push({
          item: falla.falla || falla.item || falla.nombre || falla.descripcion || 'Falla de inspección',
          categoriaSugerida: falla.categoria || falla.sistema || 'GENERAL'
        });
      });

      return fallasPorComp;
    }

    const marcadas = Array.isArray(p.checklist)
      ? p.checklist.filter((item) => String(item?.estado || '').toUpperCase() === 'MAL').map((item) => item.item)
      : (Array.isArray(p.fallas) ? p.fallas : []);

    marcadas.forEach((clave) => {
      const [comp, ...resto] = String(clave || '').split('-');
      const cKey = fallasPorComp[comp] ? comp : 'tracto';
      fallasPorComp[cKey].push({
        item: resto.length ? resto.join(' ') : clave,
        categoriaSugerida: 'GENERAL'
      });
    });

    return fallasPorComp;
  }

  function procesarReporteFallas(reporte) {
    const obsMap = extraerObservacionesPorComponente(reporte);
    const fallasChecklist = extraerFallasChecklist(reporte);
    const fallasOficiales = [];
    const observacionesContexto = [];

    COMPONENTES.forEach((comp) => {
      const catalogo = resolverCatalogo(comp.catKey);
      const textoNota = String(obsMap[comp.key] || '').trim();
      const textoNorm = normalizarTexto(textoNota);
      const tieneNotaValida = !TEXTOS_DESCARTABLES.includes(textoNorm) && textoNorm.length >= 3;

      if (tieneNotaValida) {
        observacionesContexto.push({ componente: comp.nombre, texto: textoNota });
      }

      const frasesNota = tieneNotaValida
        ? textoNota.split(/[,;\n]+/)
          .map((frase) => frase.trim())
          .filter((frase) => frase.length >= 3 && !TEXTOS_DESCARTABLES.includes(normalizarTexto(frase)))
        : [];

      const fallasDelCheck = fallasChecklist[comp.key] || [];

      fallasDelCheck.forEach((itemCheck) => {
        const clasificacion = clasificarTexto(itemCheck.item, catalogo);
        const categoriaFinal = clasificacion.categoria !== 'GENERAL / REVISIÓN TALLER'
          ? clasificacion.categoria
          : (String(itemCheck.categoriaSugerida || 'GENERAL').toUpperCase());

        const fraseCoincidente = frasesNota.find((frase) => {
          const fNorm = normalizarTexto(frase);
          return fNorm.includes(normalizarTexto(itemCheck.item)) || fNorm.includes(normalizarTexto(categoriaFinal));
        });

        const descripcion = fraseCoincidente
          ? `${clasificacion.itemOficial} (Detalle operador: "${fraseCoincidente}")`
          : (clasificacion.itemOficial || itemCheck.item);

        fallasOficiales.push({
          componente: comp.nombre,
          componenteKey: comp.key,
          sistema: categoriaFinal,
          categoria: categoriaFinal,
          descripcion,
          itemOficial: clasificacion.itemOficial,
          origen: fraseCoincidente ? 'CHECKLIST + OBSERVACIÓN' : 'CHECKLIST'
        });
      });

      frasesNota.forEach((frase) => {
        const clasificacion = clasificarTexto(frase, catalogo);
        const yaExisteEnChecklist = fallasOficiales.some((falla) => (
          falla.componenteKey === comp.key
          && (
            normalizarTexto(falla.descripcion).includes(normalizarTexto(frase))
            || falla.itemOficial === clasificacion.itemOficial
          )
        ));

        if (!yaExisteEnChecklist) {
          fallasOficiales.push({
            componente: comp.nombre,
            componenteKey: comp.key,
            sistema: clasificacion.categoria,
            categoria: clasificacion.categoria,
            descripcion: `${clasificacion.itemOficial} (Reportado en nota: "${frase}")`,
            itemOficial: clasificacion.itemOficial,
            origen: 'OBSERVACIÓN OPERADOR'
          });
        }
      });
    });

    return {
      fallas: fallasOficiales,
      observaciones: observacionesContexto
    };
  }

  if (typeof window !== 'undefined') {
    window.procesarReporteFallas = procesarReporteFallas;
    window.clasificarFallasInspeccion = procesarReporteFallas;
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.procesarReporteFallas = procesarReporteFallas;
    globalThis.clasificarFallasInspeccion = procesarReporteFallas;
  }
})();
