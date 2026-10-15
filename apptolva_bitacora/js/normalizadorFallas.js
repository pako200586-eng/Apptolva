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

  const CATEGORIA_GENERAL = 'GENERAL / REVISIÓN TALLER';

  const PALABRAS_GENERICAS = new Set([
    'cambiar', 'checar', 'revisar', 'poner', 'falta', 'general', 'estado', 'posicion',
    'lado', 'izquierdo', 'derecho', 'izquierda', 'derecha', 'sistema', 'mismo', 'cambio',
    'reparar', 'arreglar', 'revision', 'dañado', 'danado', 'dañada', 'danada'
  ]);

  function raices(texto) {
    return (normalizarTexto(texto).match(/[a-z0-9]{5,}/g) || [])
      .filter((palabra) => !PALABRAS_GENERICAS.has(palabra))
      .map((palabra) => palabra.slice(0, 6));
  }

  function compartePalabra(frase, item) {
    const raicesItem = new Set(raices(item));
    return raices(frase).some((raiz) => raicesItem.has(raiz));
  }

  function mismaCategoria(a, b) {
    const x = normalizarTexto(a);
    const y = normalizarTexto(b);
    return x === y || x.includes(y) || y.includes(x) || x.split(/[\s/]+/)[0] === y.split(/[\s/]+/)[0];
  }

  function clasificarTodas(frase, catalogo) {
    const fraseNorm = normalizarTexto(frase);
    return catalogo.filter((regla) => (Array.isArray(regla.terminosTaller) ? regla.terminosTaller : [])
      .some((termino) => fraseNorm.includes(normalizarTexto(termino))));
  }

  function agregarDetalle(falla, frase) {
    const norm = normalizarTexto(frase);
    if (!falla.detalles.some((d) => normalizarTexto(d) === norm)) falla.detalles.push(frase);
  }

  function describirFalla(falla) {
    const detalle = falla.detalles.map((d) => `"${d}"`).join('; ');
    if (falla.origen === 'CHECKLIST') return falla.itemReportado || falla.itemOficial;
    if (falla.origen === 'CHECKLIST + OBSERVACIÓN') return `${falla.itemReportado} (Detalle operador: ${detalle})`;
    if (falla.categoria === CATEGORIA_GENERAL) return `Reportado en nota: ${detalle}`;
    return `${falla.itemOficial} (Reportado en nota: ${detalle})`;
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
        ? textoNota.split(/[,;\n]+|\.{2,}|\.\s+/)
          .map((frase) => frase.trim())
          .filter((frase) => frase.length >= 3 && !TEXTOS_DESCARTABLES.includes(normalizarTexto(frase)))
        : [];

      const fallasComp = [];
      const vistas = new Set();

      (fallasChecklist[comp.key] || []).forEach((itemCheck) => {
        const clasificacion = clasificarTexto(itemCheck.item, catalogo);
        const categoriaFinal = clasificacion.categoria !== CATEGORIA_GENERAL
          ? clasificacion.categoria
          : (String(itemCheck.categoriaSugerida || 'GENERAL').toUpperCase());

        const clave = `${normalizarTexto(categoriaFinal)}|${normalizarTexto(itemCheck.item)}`;
        if (vistas.has(clave)) return;
        vistas.add(clave);

        fallasComp.push({
          componente: comp.nombre,
          componenteKey: comp.key,
          sistema: categoriaFinal,
          categoria: categoriaFinal,
          itemReportado: itemCheck.item,
          itemOficial: clasificacion.itemOficial,
          detalles: [],
          origen: 'CHECKLIST'
        });
      });

      // Cada frase de la nota se relaciona con las fallas ya marcadas (por palabra o por categoría del catálogo)
      const soloNota = new Map();
      frasesNota.forEach((frase) => {
        const destinos = new Set(fallasComp.filter((f) => compartePalabra(frase, f.itemReportado)));
        const categoriasCatalogo = clasificarTodas(frase, catalogo);

        categoriasCatalogo.forEach((regla) => {
          const yaCubierta = [...destinos].some((f) => mismaCategoria(f.categoria, regla.categoria));
          if (yaCubierta) return;
          const delChecklist = fallasComp.find((f) => mismaCategoria(f.categoria, regla.categoria));
          if (delChecklist) {
            destinos.add(delChecklist);
            return;
          }
          const previa = soloNota.get(regla.categoria) || {
            componente: comp.nombre,
            componenteKey: comp.key,
            sistema: regla.categoria,
            categoria: regla.categoria,
            itemReportado: regla.itemOficial,
            itemOficial: regla.itemOficial,
            detalles: [],
            origen: 'OBSERVACIÓN OPERADOR'
          };
          agregarDetalle(previa, frase);
          soloNota.set(regla.categoria, previa);
        });

        if (!destinos.size && !categoriasCatalogo.length) {
          const general = soloNota.get(CATEGORIA_GENERAL) || {
            componente: comp.nombre,
            componenteKey: comp.key,
            sistema: CATEGORIA_GENERAL,
            categoria: CATEGORIA_GENERAL,
            itemReportado: frase,
            itemOficial: frase,
            detalles: [],
            origen: 'OBSERVACIÓN OPERADOR'
          };
          agregarDetalle(general, frase);
          soloNota.set(CATEGORIA_GENERAL, general);
        }

        destinos.forEach((falla) => {
          agregarDetalle(falla, frase);
          falla.origen = 'CHECKLIST + OBSERVACIÓN';
        });
      });

      [...fallasComp, ...soloNota.values()].forEach((falla) => {
        falla.descripcion = describirFalla(falla);
        delete falla.detalles;
        fallasOficiales.push(falla);
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
