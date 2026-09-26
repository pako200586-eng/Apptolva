(function () {
  function clasificarFallasInspeccion(inspeccion) {
    const componentesInspeccion = [
      { key: 'tracto', nombre: 'TRACTOCAMIÓN', catalogo: (window.CATALOGO_MAESTRO_BACHOCO || globalThis.CATALOGO_MAESTRO_BACHOCO || {}).TRACTO || [] },
      { key: 'tolva1', nombre: '1ra TOLVA', catalogo: (window.CATALOGO_MAESTRO_BACHOCO || globalThis.CATALOGO_MAESTRO_BACHOCO || {}).TOLVAS || [] },
      { key: 'dolly', nombre: 'DOLLY', catalogo: (window.CATALOGO_MAESTRO_BACHOCO || globalThis.CATALOGO_MAESTRO_BACHOCO || {}).DOLLY || [] },
      { key: 'tolva2', nombre: '2da TOLVA', catalogo: (window.CATALOGO_MAESTRO_BACHOCO || globalThis.CATALOGO_MAESTRO_BACHOCO || {}).TOLVAS || [] }
    ];

    const textosDescartables = (window.TEXTOS_DESCARTABLES || globalThis.TEXTOS_DESCARTABLES || []);

    let observacionesMap = {};
    if (typeof inspeccion?.observaciones === 'string') {
      try {
        observacionesMap = JSON.parse(inspeccion.observaciones);
      } catch (error) {
        observacionesMap = { tracto: inspeccion.observaciones };
      }
    } else if (inspeccion?.observaciones && typeof inspeccion.observaciones === 'object') {
      observacionesMap = inspeccion.observaciones;
    }

    const fallasGenerables = [];

    componentesInspeccion.forEach((comp) => {
      const textoNota = String(observacionesMap?.[comp.key] || '').trim();
      const textoLimpio = textoNota.toLowerCase();
      const esTextoVacio = textosDescartables.includes(textoLimpio) || textoLimpio.length < 3;

      let seEncontraronObservacionesValidas = false;

      if (!esTextoVacio) {
        const frases = textoNota
          .split(/[,;\n]+/)
          .map((fragmento) => fragmento.trim())
          .filter((fragmento) => fragmento.length > 2);

        frases.forEach((frase) => {
          const fraseMin = frase.toLowerCase();
          if (textosDescartables.includes(fraseMin)) return;

          let categoriaAsignada = 'GENERAL / REVISIÓN TALLER';
          let componenteDetectado = frase;

          for (const cat of comp.catalogo) {
            const match = cat.terminosTaller.some((termino) => fraseMin.includes(termino));
            if (match) {
              categoriaAsignada = cat.categoria;
              componenteDetectado = cat.itemOficial;
              break;
            }
          }

          seEncontraronObservacionesValidas = true;
          fallasGenerables.push({
            reporte_id: inspeccion?.reporte_id || '',
            folio_bitacora: inspeccion?.folio || '',
            unidad: inspeccion?.unidad || '',
            operador: inspeccion?.operador || '',
            componente_unidad: comp.nombre,
            categoria_oficial: categoriaAsignada,
            item_oficial: componenteDetectado,
            descripcion_operador: frase,
            origen: 'OBSERVACIÓN ESCRITA'
          });
        });
      }

      if (!seEncontraronObservacionesValidas && Array.isArray(inspeccion?.detalles_falla)) {
        const fallasDelComponente = inspeccion.detalles_falla.filter((item) => {
          const componenteItem = String(item?.componente || '').toLowerCase();
          const nombreItem = String(item?.nombre || '').toLowerCase();
          return componenteItem === comp.key.toLowerCase() || componenteItem === comp.nombre.toLowerCase() || nombreItem.includes(comp.key.toLowerCase());
        });

        fallasDelComponente.forEach((fallaCheck) => {
          const itemNombre = fallaCheck?.item || fallaCheck?.nombre || 'Falla de Sistema';
          const estado = String(fallaCheck?.estado || '').toUpperCase();
          if (estado !== 'MAL') return;

          fallasGenerables.push({
            reporte_id: inspeccion?.reporte_id || '',
            folio_bitacora: inspeccion?.folio || '',
            unidad: inspeccion?.unidad || '',
            operador: inspeccion?.operador || '',
            componente_unidad: comp.nombre,
            categoria_oficial: fallaCheck?.categoria || 'CHECKLIST',
            item_oficial: itemNombre,
            descripcion_operador: `Marcado como MAL en inspección: ${itemNombre}`,
            origen: 'CHECKLIST_MAL'
          });
        });
      }
    });

    return fallasGenerables;
  }

  if (typeof window !== 'undefined') {
    window.clasificarFallasInspeccion = clasificarFallasInspeccion;
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.clasificarFallasInspeccion = clasificarFallasInspeccion;
  }
})();
