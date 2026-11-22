/**
 * js/rankingOperadores.js
 * Motor de cálculo y parsers de Samsara (Alertas + Exceso de Velocidad Data 25) para Ranking Semanal - AppTolva
 * Soporta esquemas 48x48 Zona Larga (Arriaga/Chiapas), 24h Full y 24h Sencillo (T3-S2).
 */

export const PESOS_INICIALES = {
  samsara: 20,
  velocidad: 20,
  bitacoras: 35,
  checklists: 25
};

export const ESQUEMAS_OPERATIVOS = {
  full_48h: {
    id: 'full_48h',
    categoria: 'full',
    etiqueta: 'Full 48x48 (Zona Larga)',
    checklistPorTurno: 2,
    bitacoraPorTurno: 1,
    metaChecklistsSemana: 4,
    descripcion: '1 checklist c/24h por operador · 1 bitácora individual c/48h'
  },
  full_24h: {
    id: 'full_24h',
    categoria: 'full',
    etiqueta: 'Full 24h',
    checklistPorTurno: 1,
    bitacoraPorTurno: 1,
    metaChecklistsSemana: 5,
    descripcion: '1 checklist y 1 bitácora por turno de 24h'
  },
  sencillo_24h: {
    id: 'sencillo_24h',
    categoria: 'sencillo',
    etiqueta: 'Articulado Sencillo 24h',
    checklistPorTurno: 1,
    bitacoraPorTurno: 1,
    metaChecklistsSemana: 5,
    descripcion: 'Categoría independiente · 1 checklist y 1 bitácora por turno de 24h'
  }
};

const PENALIZACION_ALERTAS_SAMSARA = {
  'USO DE MOVIL': 10,
  'SIN CINTURON DE SEGURIDAD': 10,
  'CINTURON DE SEGURIDAD': 10,
  'CAMARA OBSTRUIDA': 10,
  'CONDUCCION DISTRAIDA': 6,
  'POSIBLE FATIGA': 6
};

const PENALIZACION_VELOCIDAD_SEVERIDAD = {
  GRAVE: 10,
  SEVERE: 10,
  CRITICO: 10,
  FUERTE: 7,
  HEAVY: 7,
  MODERADO: 4,
  MODERATE: 4,
  LEVE: 4,
  LIGHT: 4
};

export function normalizarTexto(texto = '') {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dividirLineaCsv(linea) {
  const resultado = [];
  let actual = '';
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (ch === '"') {
      if (enComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        enComillas = !enComillas;
      }
    } else if (ch === ',' && !enComillas) {
      resultado.push(actual.trim());
      actual = '';
    } else {
      actual += ch;
    }
  }
  resultado.push(actual.trim());
  return resultado;
}

function parsearFechaEventoMDY(fechaStr = '') {
  const m = String(fechaStr).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const mes = Number(m[1]);
  const dia = Number(m[2]);
  const anio = Number(m[3]);
  if (anio < 2000) return null;
  const mm = String(mes).padStart(2, '0');
  const dd = String(dia).padStart(2, '0');
  return `${anio}-${mm}-${dd}`;
}

export function descuentoPorVelocidadKmh(velocidadKmh) {
  const vel = Number(velocidadKmh);
  if (!Number.isFinite(vel) || vel <= 0) return 4;
  if (vel >= 100) return 10;
  if (vel >= 95) return 7;
  if (vel >= 88) return 4;
  return 2;
}

export function empatarOperadorPorNombre(nombreSamsara, catalogoOperadores) {
  const tokensSamsara = new Set(normalizarTexto(nombreSamsara).split(' ').filter(Boolean));
  if (tokensSamsara.size === 0) return null;

  let mejorId = null;
  let mejorPuntaje = 0;

  for (const [id, info] of Object.entries(catalogoOperadores || {})) {
    const tokensCat = normalizarTexto(info.nombre).split(' ').filter(Boolean);
    if (tokensCat.length === 0) continue;

    let coincidencias = 0;
    for (const t of tokensCat) {
      if (tokensSamsara.has(t)) coincidencias++;
    }
    const puntaje = coincidencias / Math.max(tokensCat.length, tokensSamsara.size);
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejorId = id;
    }
  }

  return mejorPuntaje >= 0.75 ? mejorId : null;
}

export function parsearCsvSamsara(csvTexto, catalogoOperadores = {}) {
  const lineas = String(csvTexto || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');

  let idxHeader = -1;
  let cols = [];
  for (let i = 0; i < lineas.length; i++) {
    const campos = dividirLineaCsv(lineas[i]).map((c) => normalizarTexto(c));
    if (campos.includes('UNIDAD') && campos.includes('OPERADOR') && campos.includes('TIPO DE ALERTA')) {
      idxHeader = i;
      cols = campos;
      break;
    }
  }

  if (idxHeader === -1) {
    throw new Error('No se encontró el encabezado esperado (Unidad, Operador, Tipo de alerta) en el CSV de Alertas Samsara.');
  }

  const iUnidad = cols.indexOf('UNIDAD');
  const iFecha = cols.indexOf('FECHA Y HORA');
  const iOperador = cols.indexOf('OPERADOR');
  const iAlerta = cols.indexOf('TIPO DE ALERTA');
  const iRevision = cols.indexOf('REVISION');

  const eventosAplicables = [];
  const sinEmpatar = [];
  let totalEventos = 0;
  let noAplican = 0;
  let sinRevisar = 0;

  for (let i = idxHeader + 1; i < lineas.length; i++) {
    const c = dividirLineaCsv(lineas[i]);
    const operador = (c[iOperador] || '').trim();
    const alerta = (c[iAlerta] || '').trim();
    if (!operador || !alerta) continue;

    totalEventos++;
    const revisionNorm = normalizarTexto(c[iRevision] || '');
    if (revisionNorm === 'NO APLICA') {
      noAplican++;
      continue;
    }
    if (revisionNorm !== 'APLICA') {
      sinRevisar++;
      continue;
    }

    const noEmpleado = empatarOperadorPorNombre(operador, catalogoOperadores);
    const alertaNorm = normalizarTexto(alerta);
    const descuento = PENALIZACION_ALERTAS_SAMSARA[alertaNorm] ?? 6;

    eventosAplicables.push({
      noEmpleado,
      nombreSamsara: operador,
      unidad: (c[iUnidad] || '').trim(),
      fechaHora: (c[iFecha] || '').trim(),
      tipoAlerta: alerta,
      descuento
    });
    if (!noEmpleado) sinEmpatar.push(operador);
  }

  return {
    totalEventos,
    aplican: eventosAplicables.length,
    noAplican,
    sinRevisar,
    eventosAplicables,
    sinEmpatar: [...new Set(sinEmpatar)]
  };
}

export function parsearCsvVelocidadSamsara(csvTexto, catalogoOperadores = {}, opciones = {}) {
  const { fechaInicio = null, fechaFin = null, numeroSemana = null } = opciones || {};
  const lineas = String(csvTexto || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');

  if (lineas.length === 0) {
    return { totalRegistros: 0, filtradosFueraDeRango: 0, sinNombre: 0, eventosVelocidad: [], sinEmpatar: [] };
  }

  let idxHeader = -1;
  let cols = [];
  for (let i = 0; i < lineas.length; i++) {
    const campos = dividirLineaCsv(lineas[i]).map((c) => normalizarTexto(c));
    const tieneOperador = campos.some((c) =>
      ['NOMBRE OPERADOR', 'NOMBRE DEL CONDUCTOR', 'CONDUCTOR', 'DRIVER', 'DRIVER NAME', 'OPERADOR'].includes(c)
    );
    if (tieneOperador) {
      idxHeader = i;
      cols = campos;
      break;
    }
  }

  if (idxHeader === -1) {
    throw new Error('No se encontró columna de Nombre Operador / Conductor en el CSV de Exceso de Velocidad.');
  }

  let iNombre = cols.findIndex((c) => ['NOMBRE OPERADOR', 'NOMBRE DEL CONDUCTOR', 'CONDUCTOR', 'DRIVER', 'DRIVER NAME'].includes(c));
  if (iNombre === -1) iNombre = cols.indexOf('OPERADOR');

  const iFecha = cols.findIndex((c) => ['FECHA DEL EVENTO', 'FECHA', 'DATE'].includes(c));
  const iSemana = cols.indexOf('SEMANA');
  const iEconomico = cols.findIndex((c) => ['ECONOMICO', 'UNIDAD', 'VEHICLE'].includes(c));
  const iVelocidad = cols.findIndex((c) => ['VELOCIDAD', 'VELOCIDAD MAXIMA', 'MAX SPEED'].includes(c));
  const iSeveridad = cols.findIndex((c) => ['SEVERIDAD', 'SEVERITY', 'GRAVEDAD', 'NIVEL'].includes(c));
  const iCantidad = cols.findIndex((c) => ['EVENTOS', 'CANTIDAD', 'EXCESOS', 'TOTAL EVENTOS', 'SPEEDING EVENTS'].includes(c));
  const iRevision = cols.findIndex((c) => ['REVISION', 'ESTADO', 'STATUS'].includes(c));

  const eventosVelocidad = [];
  const sinEmpatar = [];
  let filtradosFueraDeRango = 0;
  let sinNombre = 0;

  for (let i = idxHeader + 1; i < lineas.length; i++) {
    const c = dividirLineaCsv(lineas[i]);
    if (iRevision !== -1 && normalizarTexto(c[iRevision] || '') === 'NO APLICA') continue;

    if (numeroSemana !== null && numeroSemana !== undefined && iSemana !== -1) {
      const semFila = Number(c[iSemana]);
      if (semFila !== Number(numeroSemana)) {
        filtradosFueraDeRango++;
        continue;
      }
    } else if ((fechaInicio || fechaFin) && iFecha !== -1) {
      const fechaISO = parsearFechaEventoMDY(c[iFecha]);
      if (!fechaISO) continue;
      if ((fechaInicio && fechaISO < fechaInicio) || (fechaFin && fechaISO > fechaFin)) {
        filtradosFueraDeRango++;
        continue;
      }
    }

    const operador = (c[iNombre] || '').trim();
    if (!operador || normalizarTexto(operador) === 'SIN CONDUCTOR' || normalizarTexto(operador) === 'UNASSIGNED') {
      sinNombre++;
      continue;
    }

    const velNum = iVelocidad !== -1 ? Number(String(c[iVelocidad]).replace(/[^\d.]/g, '')) : 0;
    const severidadRaw = iSeveridad !== -1 ? normalizarTexto(c[iSeveridad] || '') : '';
    const cantidad = iCantidad !== -1 ? Math.max(1, Number(String(c[iCantidad]).replace(/[^\d.]/g, '')) || 1) : 1;

    const descuentoUnitario = severidadRaw && PENALIZACION_VELOCIDAD_SEVERIDAD[severidadRaw]
      ? PENALIZACION_VELOCIDAD_SEVERIDAD[severidadRaw]
      : descuentoPorVelocidadKmh(velNum);

    const noEmpleado = empatarOperadorPorNombre(operador, catalogoOperadores);

    eventosVelocidad.push({
      noEmpleado,
      nombreSamsara: operador,
      unidad: iEconomico !== -1 ? (c[iEconomico] || '').trim() : '',
      fecha: iFecha !== -1 ? (c[iFecha] || '').trim() : '',
      semana: iSemana !== -1 ? Number(c[iSemana]) || null : null,
      velocidadMax: velNum || '',
      cantidad,
      descuento: cantidad * descuentoUnitario
    });
    if (!noEmpleado) sinEmpatar.push(operador);
  }

  return {
    totalRegistros: eventosVelocidad.length,
    filtradosFueraDeRango,
    sinNombre,
    eventosVelocidad,
    sinEmpatar: [...new Set(sinEmpatar)]
  };
}

export function calcularRankingSemanal({
  catalogoOperadores = {},
  esquemasPorEmpleado = {},
  eventosAplicables = [],
  eventosVelocidad = [],
  checklistsPorEmpleado = {},
  bitacorasPorEmpleado = {},
  excluidos = {},
  pesos = PESOS_INICIALES
}) {
  const descuentoAlertas = {};
  const conteoAlertas = {};
  for (const ev of eventosAplicables) {
    if (!ev.noEmpleado) continue;
    descuentoAlertas[ev.noEmpleado] = (descuentoAlertas[ev.noEmpleado] || 0) + ev.descuento;
    conteoAlertas[ev.noEmpleado] = (conteoAlertas[ev.noEmpleado] || 0) + 1;
  }

  const descuentoVelocidad = {};
  const conteoVelocidad = {};
  for (const ev of eventosVelocidad) {
    if (!ev.noEmpleado) continue;
    descuentoVelocidad[ev.noEmpleado] = (descuentoVelocidad[ev.noEmpleado] || 0) + ev.descuento;
    conteoVelocidad[ev.noEmpleado] = (conteoVelocidad[ev.noEmpleado] || 0) + (ev.cantidad || 1);
  }

  const evaluados = { full: [], sencillo: [] };

  for (const [noEmpleado, info] of Object.entries(catalogoOperadores)) {
    if (excluidos[noEmpleado]) continue;

    const esquemaId = esquemasPorEmpleado[noEmpleado] || 'full_48h';
    if (esquemaId === 'excluido') continue;
    const esquema = ESQUEMAS_OPERATIVOS[esquemaId] || ESQUEMAS_OPERATIVOS.full_48h;

    const checklists = Number(checklistsPorEmpleado[noEmpleado] || 0);
    const bitacoras = Number(bitacorasPorEmpleado[noEmpleado] || 0);

    const ptsSamsara = Math.max(0, (pesos.samsara ?? 20) - (descuentoAlertas[noEmpleado] || 0));
    const ptsVelocidad = Math.max(0, (pesos.velocidad ?? 20) - (descuentoVelocidad[noEmpleado] || 0));

    const ratioChecklists = Math.min(1, checklists / Math.max(1, esquema.metaChecklistsSemana));
    const ptsChecklists = Math.round(ratioChecklists * (pesos.checklists ?? 25) * 10) / 10;

    const proporcionTurno = esquema.bitacoraPorTurno / esquema.checklistPorTurno;
    const metaBitacorasReales = checklists > 0
      ? Math.max(1, Math.ceil(checklists * proporcionTurno))
      : Math.max(1, Math.ceil(esquema.metaChecklistsSemana * proporcionTurno));
    const ratioBitacoras = checklists === 0 && bitacoras === 0
      ? 0
      : Math.min(1, bitacoras / metaBitacorasReales);
    const ptsBitacoras = Math.round(ratioBitacoras * (pesos.bitacoras ?? 35) * 10) / 10;

    const total = Math.round((ptsSamsara + ptsVelocidad + ptsChecklists + ptsBitacoras) * 10) / 10;

    evaluados[esquema.categoria].push({
      noEmpleado,
      nombre: info.nombre,
      esquema: esquema.id,
      esquemaEtiqueta: esquema.etiqueta,
      total,
      rubros: {
        samsara: ptsSamsara,
        velocidad: ptsVelocidad,
        bitacoras: ptsBitacoras,
        checklists: ptsChecklists
      },
      metricas: {
        alertasAplican: conteoAlertas[noEmpleado] || 0,
        excesosVelocidad: conteoVelocidad[noEmpleado] || 0,
        checklists,
        bitacoras,
        metaBitacoras: metaBitacorasReales
      }
    });
  }

  const construirSegmento = (lista) => {
    lista.sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
    const conPosicion = lista.map((item, idx) => ({ ...item, posicion: idx + 1 }));
    const totalOperadores = conPosicion.length;
    const topLimit = totalOperadores <= 8 ? 3 : 5;
    const topLista = conPosicion.slice(0, topLimit);
    const ultimos3 = totalOperadores > topLimit
      ? conPosicion.slice(Math.max(topLimit, totalOperadores - 3))
      : [];
    return {
      totalOperadores,
      topLimit,
      top5: topLista,
      ultimos3,
      posiciones: conPosicion
    };
  };

  return {
    pesos,
    full: construirSegmento(evaluados.full),
    sencillo: construirSegmento(evaluados.sencillo)
  };
}

/**
 * Reordena un segmento publicado por un filtro de evento específico sin lecturas extra.
 * filtro: 'general' | 'velocidad' | 'samsara' | 'bitacoras' | 'checklists'
 */
export function filtrarSegmentoPorEvento(segmento = {}, filtro = 'general') {
  const posicionesBase = Array.isArray(segmento.posiciones) ? [...segmento.posiciones] : [];
  if (filtro === 'general' || posicionesBase.length === 0) {
    return {
      totalOperadores: segmento.totalOperadores || posicionesBase.length,
      topLimit: segmento.topLimit || (posicionesBase.length <= 8 ? 3 : 5),
      top5: segmento.top5 || [],
      ultimos3: segmento.ultimos3 || [],
      posiciones: posicionesBase
    };
  }

  posicionesBase.sort((a, b) => {
    if (filtro === 'velocidad') {
      return (b.rubros?.velocidad ?? 0) - (a.rubros?.velocidad ?? 0)
        || (a.metricas?.excesosVelocidad ?? 0) - (b.metricas?.excesosVelocidad ?? 0)
        || (b.total ?? 0) - (a.total ?? 0)
        || a.nombre.localeCompare(b.nombre);
    }
    if (filtro === 'samsara') {
      return (b.rubros?.samsara ?? 0) - (a.rubros?.samsara ?? 0)
        || (a.metricas?.alertasAplican ?? 0) - (b.metricas?.alertasAplican ?? 0)
        || (b.total ?? 0) - (a.total ?? 0)
        || a.nombre.localeCompare(b.nombre);
    }
    if (filtro === 'bitacoras') {
      return (b.rubros?.bitacoras ?? 0) - (a.rubros?.bitacoras ?? 0)
        || (b.metricas?.bitacoras ?? 0) - (a.metricas?.bitacoras ?? 0)
        || (b.total ?? 0) - (a.total ?? 0)
        || a.nombre.localeCompare(b.nombre);
    }
    if (filtro === 'checklists') {
      return (b.rubros?.checklists ?? 0) - (a.rubros?.checklists ?? 0)
        || (b.metricas?.checklists ?? 0) - (a.metricas?.checklists ?? 0)
        || (b.total ?? 0) - (a.total ?? 0)
        || a.nombre.localeCompare(b.nombre);
    }
    return 0;
  });

  const conPosicion = posicionesBase.map((item, idx) => ({ ...item, posicion: idx + 1 }));
  const totalOperadores = conPosicion.length;
  const topLimit = totalOperadores <= 8 ? 3 : 5;
  return {
    totalOperadores,
    topLimit,
    top5: conPosicion.slice(0, topLimit),
    ultimos3: totalOperadores > topLimit
      ? conPosicion.slice(Math.max(topLimit, totalOperadores - 3))
      : [],
    posiciones: conPosicion
  };
}