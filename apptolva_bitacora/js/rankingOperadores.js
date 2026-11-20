/**
 * js/rankingOperadores.js
 * Motor de cálculo y parser de Samsara para Ranking Semanal de Operadores - AppTolva
 * Soporta esquemas 48x48 Zona Larga (Arriaga/Chiapas), 24h Full y 24h Sencillo (T3-S2).
 */

export const PESOS_INICIALES = {
  samsara: 40,
  bitacoras: 35,
  checklists: 25
};

export const ESQUEMAS_OPERATIVOS = {
  full_48h: {
    id: 'full_48h',
    categoria: 'full',
    etiqueta: 'Full 48x48 (Zona Larga)',
    checklistPorTurno: 2,     // 1 checklist cada 24h = 2 por turno de 48h
    bitacoraPorTurno: 1,      // 1 bitácora individual NOM-087 por cada 48h
    metaChecklistsSemana: 4,  // Referencia semanal típica (2 turnos de 48h / 4 días)
    descripcion: '1 checklist c/24h por operador · 1 bitácora individual c/48h'
  },
  full_24h: {
    id: 'full_24h',
    categoria: 'full',
    etiqueta: 'Full 24h',
    checklistPorTurno: 1,     // 1 checklist por turno de 24h
    bitacoraPorTurno: 1,      // 1 bitácora por turno de 24h
    metaChecklistsSemana: 5,
    descripcion: '1 checklist y 1 bitácora por turno de 24h'
  },
  sencillo_24h: {
    id: 'sencillo_24h',
    categoria: 'sencillo',
    etiqueta: 'Articulado Sencillo 24h',
    checklistPorTurno: 1,     // 1 checklist por turno de 24h
    bitacoraPorTurno: 1,      // 1 bitácora por turno de 24h
    metaChecklistsSemana: 5,
    descripcion: 'Categoría independiente · 1 checklist y 1 bitácora por turno de 24h'
  }
};

const PENALIZACION_SAMSARA = {
  'USO DE MOVIL': 15,
  'SIN CINTURON DE SEGURIDAD': 15,
  'EXCESO DE VELOCIDAD': 15,
  'FRENADO BRUSCO': 15,
  'CONDUCCION DISTRAIDA': 10,
  'POSIBLE FATIGA': 10
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

/**
 * Empata un nombre de Samsara (ej. "REYES CABAÑAS ELVIRA") contra CATALOGO_OPERADORES
 * tolerando distinto orden de apellidos/nombres y sin acentos.
 */
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

/**
 * Parsea el CSV exportado desde la hoja semanal de Samsara.
 * Ignora filas de resumen y separadores de fecha; solo penaliza "Revisión === Aplica".
 */
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
    throw new Error('No se encontró el encabezado esperado (Unidad, Operador, Tipo de alerta) en el CSV de Samsara.');
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
    if (!operador || !alerta) continue; // Salta filas separadoras de fecha ("02 DE NOVIEMBRE 2026")

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
    const descuento = PENALIZACION_SAMSARA[alertaNorm] ?? 10;

    const evento = {
      noEmpleado,
      nombreSamsara: operador,
      unidad: (c[iUnidad] || '').trim(),
      fechaHora: (c[iFecha] || '').trim(),
      tipoAlerta: alerta,
      descuento
    };
    eventosAplicables.push(evento);
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

/**
 * Calcula las calificaciones de la semana separando Full (48h + 24h) y Sencillo (24h).
 * Cada operador se evalúa contra las reglas de su propio esquema.
 */
export function calcularRankingSemanal({
  catalogoOperadores = {},
  esquemasPorEmpleado = {},
  eventosAplicables = [],
  checklistsPorEmpleado = {},
  bitacorasPorEmpleado = {},
  excluidos = {},
  pesos = PESOS_INICIALES
}) {
  const descuentoPorEmpleado = {};
  const alertasPorEmpleado = {};

  for (const ev of eventosAplicables) {
    if (!ev.noEmpleado) continue;
    descuentoPorEmpleado[ev.noEmpleado] = (descuentoPorEmpleado[ev.noEmpleado] || 0) + ev.descuento;
    alertasPorEmpleado[ev.noEmpleado] = (alertasPorEmpleado[ev.noEmpleado] || 0) + 1;
  }

  const evaluados = { full: [], sencillo: [] };

  for (const [noEmpleado, info] of Object.entries(catalogoOperadores)) {
    if (excluidos[noEmpleado]) continue; // Vacaciones, incapacidad, staff o unidad parada

    const esquemaId = esquemasPorEmpleado[noEmpleado] || 'full_48h';
    const esquema = ESQUEMAS_OPERATIVOS[esquemaId] || ESQUEMAS_OPERATIVOS.full_48h;

    const checklists = Number(checklistsPorEmpleado[noEmpleado] || 0);
    const bitacoras = Number(bitacorasPorEmpleado[noEmpleado] || 0);
    const descuentoSamsara = descuentoPorEmpleado[noEmpleado] || 0;

    // 1. Samsara (40 pts base)
    const ptsSamsara = Math.max(0, pesos.samsara - descuentoSamsara);

    // 2. Checklists según meta semanal de su esquema
    const ratioChecklists = Math.min(1, checklists / Math.max(1, esquema.metaChecklistsSemana));
    const ptsChecklists = Math.round(ratioChecklists * pesos.checklists * 10) / 10;

    // 3. Bitácoras NOM-087 según relación de su turno:
    //    48h -> 1 bitácora por cada 2 checklists (cada 48h)
    //    24h -> 1 bitácora por cada 1 checklist (cada 24h)
    const proporcionTurno = esquema.bitacoraPorTurno / esquema.checklistPorTurno;
    const metaBitacorasReales = checklists > 0
      ? Math.max(1, Math.ceil(checklists * proporcionTurno))
      : Math.max(1, Math.ceil(esquema.metaChecklistsSemana * proporcionTurno));
    const ratioBitacoras = checklists === 0 && bitacoras === 0
      ? 0
      : Math.min(1, bitacoras / metaBitacorasReales);
    const ptsBitacoras = Math.round(ratioBitacoras * pesos.bitacoras * 10) / 10;

    const total = Math.round((ptsSamsara + ptsChecklists + ptsBitacoras) * 10) / 10;

    evaluados[esquema.categoria].push({
      noEmpleado,
      nombre: info.nombre,
      esquema: esquema.id,
      esquemaEtiqueta: esquema.etiqueta,
      total,
      rubros: {
        samsara: ptsSamsara,
        bitacoras: ptsBitacoras,
        checklists: ptsChecklists
      },
      metricas: {
        alertasAplican: alertasPorEmpleado[noEmpleado] || 0,
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
    const top5 = conPosicion.slice(0, 5);
    const ultimos3 = totalOperadores > 5
      ? conPosicion.slice(Math.max(5, totalOperadores - 3))
      : [];
    return {
      totalOperadores,
      top5,
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