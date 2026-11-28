export const ZONA_HORARIA_MX = 'America/Mexico_City';

const DIA_MS = 24 * 60 * 60 * 1000;

const COMPONENTES_DEFECTO = [
  { key: 'tracto', nombre: 'Tracto' },
  { key: 'tolva1', nombre: 'Tolva 1' },
  { key: 'dolly', nombre: 'Dolly' },
  { key: 'tolva2', nombre: 'Tolva 2' }
];

const ORDEN_COMPONENTES_DEFECTO = { tracto: 0, tolva1: 1, dolly: 2, tolva2: 3 };

const SISTEMAS_SEGURIDAD = new Set(['frenos', 'emergencia', 'emergencia en ruta', 'seguridad', 'direccion']);
const SISTEMAS_OPERATIVOS = new Set([
  'motor',
  'sistema hidraulico',
  'hidraulico',
  'estructura y sistema de descarga',
  'suspension',
  'electrico',
  'accesorios y enganche',
  'transmision',
  'tren motriz'
]);
const SISTEMAS_ESTETICOS = new Set(['carroceria', 'interior']);

const PATRON_SEGURIDAD = /\b(frenos?|balatas?|rotochambers?|chambers?|matracas?|abs|fuga de aire|compresor|quinta\s*rueda|kinta|perno\s*rey|cintur[oó]n|sinteron|broche de seguridad|7\s*v[ií]as|siete\s*v[ií]as|cable\s*el[eé]ctrico|chup[oó]n\s*el[eé]ctrico|enchufes?\s*7\s*v[ií]as|luces?|stop|intermitentes?|calaveras?|plaf[oó]n(?:era)?|focos?|torreta|reversero|banderolas?|parabrisas|espejos?|retrovisor(?:es)?|limpiaparabrisas|plumillas?|tricos?|pasamanos|escaleras?|escal[oó]n|estribo|l[ií]nea de vida|extintor|birlos?|tuerca\s*floja|llanta\s*(?:ponchada|lisa|volada|reventada)|bolsa\s*ponchada|manivelas?|compuerta\s*dura|dura\s*para\s*(?:abrir|cerrar)|atorad[ao]|lanza|ojos?\s*de\s*lanza|ganchos?|cadenas?|mordaza|pat[ií]n|patines|puente\s*inferior|asiento\s*(?:roto|quebrado|suelto)|respaldo)\b/i;

const PATRON_OPERATIVA = /\b(hidr[aá]ulic[ao]?|aceite|fugas?|tira\s*(?:aceite|agua|grano|aire|diesel)|mangueras?|cilindros?|pist[oó]n|gato|banco\s*de\s*v[aá]lvulas|coples?|man[oó]metros?|toma\s*de\s*fuerza|motor|arrastre|gusano|bazuca|sinf[ií]n|chuma[cs]eras?|baleros?|bandas?|poleas?|turbo|anticongelante|radiador|bomba\s*de\s*agua|bater[ií]as?|marcha|alternador|testigos?|esp[ií]as?|check\s*engine|clima|a\/c|siroco|suspensi[oó]n|bolsas?\s*de\s*aire|muelles?|hoja\s*rota|amortiguador(?:es)?|llantas?|bujes?|engras(?:ar|ado|e)|grasa|tapas?|compuertas?|clutch|clach|embrague|transmisi[oó]n|diferencial|yugo|chasis|ejes?|corto|sensores?|v[aá]lvulas?|puerta\s*no\s*abre|manija|muelas|ajustador|resorte|levas?)\b/i;

const PATRON_ESTETICA = /\b(fald[oó]n(?:es)?|salpicaderas?|loderas?|facia|parrilla|defensa|pintura|ray[oó]n|rayad[ao]|golpe(?:s|ado|ada)?|abollad[ao]|calcoman[ií]as?|r[oó]tulos?|limpieza|lavado|tapicer[ií]a|alfombra|molduras?|bisel|est[eé]tic[ao]|hule|cofre)\b/i;

export const CRITICIDAD_NIVELES = {
  seguridad: {
    codigo: 'seguridad',
    etiqueta: 'Seguridad',
    orden: 0,
    clasesBadge: 'bg-red-100 text-red-800 border border-red-200',
    clasesBorde: 'border-l-4 border-l-red-600 bg-red-50/40'
  },
  operativa: {
    codigo: 'operativa',
    etiqueta: 'Operativa / Hidráulica',
    orden: 1,
    clasesBadge: 'bg-amber-100 text-amber-800 border border-amber-200',
    clasesBorde: 'border-l-4 border-l-amber-500 bg-amber-50/30'
  },
  estetica: {
    codigo: 'estetica',
    etiqueta: 'Estética',
    orden: 2,
    clasesBadge: 'bg-slate-200 text-slate-700 border border-slate-300',
    clasesBorde: 'border-l-4 border-l-slate-300 bg-slate-50'
  }
};

export function normalizarTextoSimple(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function convertirADate(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor === 'object' && typeof valor.toDate === 'function') {
    const fecha = valor.toDate();
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export function partesFechaLocal(valor, timeZone = ZONA_HORARIA_MX) {
  const fecha = convertirADate(valor);
  if (!fecha) return null;
  try {
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(fecha);
    const anio = Number(partes.find((p) => p.type === 'year')?.value);
    const mes = Number(partes.find((p) => p.type === 'month')?.value);
    const dia = Number(partes.find((p) => p.type === 'day')?.value);
    if (Number.isFinite(anio) && Number.isFinite(mes) && Number.isFinite(dia)) {
      return {
        anio,
        mes,
        dia,
        clave: `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
      };
    }
  } catch {
    // Respaldo a fecha local del navegador si el entorno no soporta la zona horaria IANA
  }
  const anio = fecha.getFullYear();
  const mes = fecha.getMonth() + 1;
  const dia = fecha.getDate();
  return {
    anio,
    mes,
    dia,
    clave: `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  };
}

export function formatearFechaLocal(valor, timeZone = ZONA_HORARIA_MX) {
  const partes = partesFechaLocal(valor, timeZone);
  if (!partes) return 'Sin fecha';
  return `${String(partes.dia).padStart(2, '0')}/${String(partes.mes).padStart(2, '0')}/${partes.anio}`;
}

export function esMismoDiaLocal(fechaA, fechaB = Date.now(), timeZone = ZONA_HORARIA_MX) {
  const a = partesFechaLocal(fechaA, timeZone);
  const b = partesFechaLocal(fechaB, timeZone);
  return Boolean(a && b && a.clave === b.clave);
}

export function calcularDiasAbierta(fechaInicio, ahora = Date.now(), timeZone = ZONA_HORARIA_MX) {
  const inicio = partesFechaLocal(fechaInicio, timeZone);
  const actual = partesFechaLocal(ahora, timeZone);
  if (!inicio || !actual) return null;
  const msInicio = Date.UTC(inicio.anio, inicio.mes - 1, inicio.dia);
  const msActual = Date.UTC(actual.anio, actual.mes - 1, actual.dia);
  return Math.max(0, Math.round((msActual - msInicio) / DIA_MS));
}

export function etiquetaAntiguedad(dias) {
  if (dias === null || dias === undefined || !Number.isFinite(dias)) return '';
  if (dias <= 0) return 'Abierta hoy';
  if (dias === 1) return '1 día abierta';
  return `${dias} días abierta`;
}

function economicoValido(valor) {
  const limpio = String(valor ?? '').trim();
  return limpio && limpio.toUpperCase() !== 'S/N' ? limpio : '';
}

export function indexarAparicionesEquipos(checklists, obtenerEconomicos) {
  const indice = new Map();
  (checklists || []).forEach((reporte) => {
    if (!reporte) return;
    const economicos = obtenerEconomicos(reporte) || {};
    const fecha = convertirADate(reporte.createdAt);
    const fechaMs = fecha ? fecha.getTime() : 0;
    const tractoId = economicoValido(economicos.tracto || reporte.unitId || reporte.payload?.unitId);
    ['tracto', 'tolva1', 'dolly', 'tolva2'].forEach((posicionKey) => {
      const eco = economicoValido(economicos[posicionKey]);
      if (!eco) return;
      const equipoId = eco.toUpperCase();
      if (!indice.has(equipoId)) indice.set(equipoId, { ultimo: null, apariciones: [] });
      indice.get(equipoId).apariciones.push({
        reporte,
        equipoId,
        posicionKey,
        tractoId: tractoId || 'S/N',
        tolva1: economicoValido(economicos.tolva1),
        dolly: economicoValido(economicos.dolly),
        tolva2: economicoValido(economicos.tolva2),
        fechaMs,
        createdAt: reporte.createdAt
      });
    });
  });

  indice.forEach((entrada) => {
    entrada.apariciones.sort((a, b) => b.fechaMs - a.fechaMs);
    entrada.ultimo = entrada.apariciones[0] || null;
  });

  return indice;
}

function nombrePosicion(key, componentes = COMPONENTES_DEFECTO) {
  return componentes.find((comp) => comp.key === key)?.nombre || key || '';
}

export function resumenEngancheEquipo(unidad, indiceApariciones, opciones = {}) {
  const { ahora = Date.now(), timeZone = ZONA_HORARIA_MX, componentes = COMPONENTES_DEFECTO } = opciones;
  const reciente = unidad.reciente || {};
  const equipoId = String(unidad.unitId || '').trim().toUpperCase();
  const esTracto = unidad.tipoEquipo === 'Tracto';

  const tractoReportado = economicoValido(reciente.unitId || reciente.payload?.unitId) || 'S/N';
  const fechaReportado = formatearFechaLocal(reciente.createdAt, timeZone);
  const operadorReportado = String(reciente.driverName || 'N/A').trim() || 'N/A';
  const posicionReportado = unidad.posicion || '';

  const entrada = indiceApariciones?.get(equipoId);
  const ultimaAparicion = entrada?.ultimo || null;

  const fechaActualIso = ultimaAparicion?.createdAt || reciente.createdAt;
  const fechaActual = formatearFechaLocal(fechaActualIso, timeZone);
  const esHoy = esMismoDiaLocal(fechaActualIso, ahora, timeZone);
  const tractoActual = ultimaAparicion?.tractoId || tractoReportado;
  const posicionActual = ultimaAparicion ? nombrePosicion(ultimaAparicion.posicionKey, componentes) : posicionReportado;

  let textoReportado;
  let textoEngancheActual;
  let cambioEnganche = false;

  if (esTracto) {
    textoReportado = `Tracto ${equipoId} · ${fechaReportado} · ${operadorReportado}`;
    const arrastres = ultimaAparicion
      ? [
        ultimaAparicion.tolva1 ? `Tolva 1: ${ultimaAparicion.tolva1}` : '',
        ultimaAparicion.dolly ? `Dolly: ${ultimaAparicion.dolly}` : '',
        ultimaAparicion.tolva2 ? `Tolva 2: ${ultimaAparicion.tolva2}` : ''
      ].filter(Boolean)
      : [];
    const prefijo = esHoy ? 'Hoy' : 'Último check';
    textoEngancheActual = arrastres.length
      ? `${prefijo} con ${arrastres.join(' · ')} · ${fechaActual}`
      : `${prefijo} · ${fechaActual}`;
    const fechaRepMs = convertirADate(reciente.createdAt)?.getTime() || 0;
    cambioEnganche = Boolean(ultimaAparicion && ultimaAparicion.fechaMs > fechaRepMs);
  } else {
    textoReportado = `Tracto ${tractoReportado}${posicionReportado ? ` (${posicionReportado})` : ''} · ${fechaReportado} · ${operadorReportado}`;
    const prefijo = esHoy ? 'Hoy con' : 'Con';
    textoEngancheActual = `${prefijo} Tracto ${tractoActual}${posicionActual ? ` (${posicionActual})` : ''} · ${fechaActual}`;
    cambioEnganche = tractoActual.toUpperCase() !== tractoReportado.toUpperCase()
      || normalizarTextoSimple(posicionActual) !== normalizarTextoSimple(posicionReportado);
  }

  return {
    reportado: {
      tractoId: tractoReportado,
      posicion: posicionReportado,
      operador: operadorReportado,
      fechaTexto: fechaReportado,
      createdAt: reciente.createdAt || ''
    },
    actual: {
      tractoId: tractoActual,
      posicion: posicionActual,
      fechaTexto: fechaActual,
      createdAt: fechaActualIso || '',
      esHoy
    },
    cambioEnganche,
    textoReportado,
    textoEngancheActual
  };
}

export function detectarChecklistsPosterioresLimpios({
  equipoId,
  sistema,
  fechaUltimaFalla,
  indiceApariciones,
  obtenerFallasDeReporte,
  timeZone = ZONA_HORARIA_MX
}) {
  const idNormalizado = String(equipoId || '').trim().toUpperCase();
  const sistemaNormalizado = normalizarTextoSimple(sistema);
  const fechaFallaMs = convertirADate(fechaUltimaFalla)?.getTime();
  if (!idNormalizado || !sistemaNormalizado || !Number.isFinite(fechaFallaMs)) {
    return { conteo: 0, ultimoLimpio: null, fechaTexto: '' };
  }

  const apariciones = indiceApariciones?.get(idNormalizado)?.apariciones || [];
  const reportesVistos = new Set();
  const limpios = [];

  for (const aparicion of apariciones) {
    if (aparicion.fechaMs <= fechaFallaMs) continue;
    const reporteId = String(aparicion.reporte?.id || '');
    if (reporteId && reportesVistos.has(reporteId)) continue;
    if (reporteId) reportesVistos.add(reporteId);

    const fallas = obtenerFallasDeReporte(aparicion.reporte) || [];
    const tieneFallaEnMismoSistema = fallas.some((falla) =>
      String(falla.unidad || '').trim().toUpperCase() === idNormalizado
      && normalizarTextoSimple(falla.sistema || falla.categoria) === sistemaNormalizado
    );

    if (!tieneFallaEnMismoSistema) {
      limpios.push(aparicion);
    }
  }

  const ultimoLimpio = limpios[0] || null;
  return {
    conteo: limpios.length,
    ultimoLimpio,
    fechaTexto: ultimoLimpio ? formatearFechaLocal(ultimoLimpio.createdAt, timeZone) : ''
  };
}

export function clasificarCriticidadFalla({ sistema = '', textos = [] } = {}) {
  const sistemaNorm = normalizarTextoSimple(sistema);
  const textoCombinado = normalizarTextoSimple([sistema, ...(Array.isArray(textos) ? textos : [textos])].filter(Boolean).join(' '));

  if (SISTEMAS_SEGURIDAD.has(sistemaNorm) || PATRON_SEGURIDAD.test(textoCombinado)) {
    return CRITICIDAD_NIVELES.seguridad;
  }

  if (SISTEMAS_OPERATIVOS.has(sistemaNorm) || PATRON_OPERATIVA.test(textoCombinado)) {
    return CRITICIDAD_NIVELES.operativa;
  }

  if (SISTEMAS_ESTETICOS.has(sistemaNorm) || PATRON_ESTETICA.test(textoCombinado)) {
    return CRITICIDAD_NIVELES.estetica;
  }

  return CRITICIDAD_NIVELES.operativa;
}

export function compararFilasPorCriticidad(a, b, ordenComponentes = ORDEN_COMPONENTES_DEFECTO) {
  const ordenA = a.criticidad?.orden ?? 1;
  const ordenB = b.criticidad?.orden ?? 1;
  if (ordenA !== ordenB) return ordenA - ordenB;

  const diasA = Number.isFinite(a.diasAbierta) ? a.diasAbierta : -1;
  const diasB = Number.isFinite(b.diasAbierta) ? b.diasAbierta : -1;
  if (diasA !== diasB) return diasB - diasA;

  const compA = ordenComponentes[a.componenteKey] ?? 9;
  const compB = ordenComponentes[b.componenteKey] ?? 9;
  if (compA !== compB) return compA - compB;

  const sysCmp = String(a.sistema || '').localeCompare(String(b.sistema || ''), 'es');
  if (sysCmp !== 0) return sysCmp;

  const itemA = a.grupos?.[0]?.item || '';
  const itemB = b.grupos?.[0]?.item || '';
  return String(itemA).localeCompare(String(itemB), 'es');
}

export function compararUnidadesPorCriticidad(a, b) {
  const critA = a.criticidadMaxima?.orden ?? 1;
  const critB = b.criticidadMaxima?.orden ?? 1;
  if (critA !== critB) return critA - critB;

  const filasDiff = (b.filas?.length || 0) - (a.filas?.length || 0);
  if (filasDiff !== 0) return filasDiff;

  const diasA = Number.isFinite(a.diasAbierta) ? a.diasAbierta : -1;
  const diasB = Number.isFinite(b.diasAbierta) ? b.diasAbierta : -1;
  if (diasA !== diasB) return diasB - diasA;

  const fechaA = convertirADate(a.reciente?.createdAt)?.getTime() || 0;
  const fechaB = convertirADate(b.reciente?.createdAt)?.getTime() || 0;
  return fechaB - fechaA;
}

export function enriquecerUnidadesPendientes(unidades, {
  checklistsContexto = [],
  obtenerEconomicos,
  obtenerFallasDeReporte,
  ordenComponentes = ORDEN_COMPONENTES_DEFECTO,
  componentes = COMPONENTES_DEFECTO,
  ahora = Date.now(),
  timeZone = ZONA_HORARIA_MX
} = {}) {
  const indiceApariciones = indexarAparicionesEquipos(checklistsContexto, obtenerEconomicos);

  unidades.forEach((unidad) => {
    const fechasUnidad = (unidad.reportes || [])
      .map((reporte) => convertirADate(reporte.createdAt))
      .filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime());

    unidad.fechaMasAntigua = fechasUnidad[0]?.toISOString() || '';
    unidad.diasAbierta = calcularDiasAbierta(unidad.fechaMasAntigua, ahora, timeZone);
    unidad.etiquetaAntiguedad = etiquetaAntiguedad(unidad.diasAbierta);
    unidad.enganche = resumenEngancheEquipo(unidad, indiceApariciones, { ahora, timeZone, componentes });

    (unidad.filas || []).forEach((fila) => {
      const reportesFila = (fila.grupos || [])
        .flatMap((grupo) => grupo.reportes || [])
        .map(({ reporte }) => convertirADate(reporte?.createdAt))
        .filter(Boolean)
        .sort((a, b) => a.getTime() - b.getTime());

      const fechaAntigua = reportesFila[0]?.toISOString() || '';
      const fechaReciente = reportesFila[reportesFila.length - 1]?.toISOString() || '';
      fila.diasAbierta = calcularDiasAbierta(fechaAntigua, ahora, timeZone);
      fila.etiquetaAntiguedad = etiquetaAntiguedad(fila.diasAbierta);

      const textos = (fila.grupos || []).flatMap((grupo) => [
        grupo.item,
        grupo.descripcion,
        ...(grupo.reportes || []).map(({ falla }) => falla?.descripcion || falla?.itemReportado || '')
      ]);
      fila.criticidad = clasificarCriticidadFalla({ sistema: fila.sistema, textos });
      fila.checkPosteriorLimpio = detectarChecklistsPosterioresLimpios({
        equipoId: unidad.unitId,
        sistema: fila.sistema,
        fechaUltimaFalla: fechaReciente,
        indiceApariciones,
        obtenerFallasDeReporte,
        timeZone
      });
    });

    (unidad.filas || []).sort((a, b) => compararFilasPorCriticidad(a, b, ordenComponentes));
    unidad.criticidadMaxima = unidad.filas?.[0]?.criticidad || CRITICIDAD_NIVELES.operativa;
  });

  unidades.sort(compararUnidadesPorCriticidad);
  return unidades;
}
