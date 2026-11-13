export function normalizarTextoFalla(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function crearFirmaFalla({ unidad, componente, sistema, item }) {
  const numeroEconomico = normalizarTextoFalla(unidad);
  const componenteKey = normalizarTextoFalla(componente);
  const sistemaKey = normalizarTextoFalla(sistema);
  const itemKey = normalizarTextoFalla(item);

  if (!numeroEconomico || numeroEconomico === 'S/N' || !componenteKey || !sistemaKey || !itemKey) {
    return '';
  }

  return JSON.stringify([numeroEconomico, componenteKey, sistemaKey, itemKey]);
}

export function separarSistemasFalla(sistema) {
  return [...new Set(String(sistema ?? '')
    .split(',')
    .map((valor) => valor.trim())
    .filter(Boolean))];
}

export function crearFirmasFalla({ unidad, componente, sistema, item }) {
  return [...new Set(separarSistemasFalla(sistema)
    .map((sistemaIndividual) => crearFirmaFalla({
      unidad,
      componente,
      sistema: sistemaIndividual,
      item
    }))
    .filter(Boolean))];
}

export function indiceOrdenesFalla(ordenes, firmasDeOrden, esCerrada) {
  const abiertas = new Set();
  const ordenesAbiertas = new Map();
  const equivalentesAbiertas = new Map();
  const legadas = new Map();
  const legadasEquivalentes = new Map();
  ordenes.forEach((orden) => {
    const firmas = firmasDeOrden(orden);
    const cerrada = esCerrada(orden);
    if (!cerrada) firmas.forEach((firma) => {
      abiertas.add(firma);
      if (!ordenesAbiertas.has(firma)) ordenesAbiertas.set(firma, []);
      ordenesAbiertas.get(firma).push(orden);
      const equivalente = clavePosibleDuplicado(firma);
      if (equivalente) {
        if (!equivalentesAbiertas.has(equivalente)) equivalentesAbiertas.set(equivalente, []);
        equivalentesAbiertas.get(equivalente).push(orden);
      }
    });
    if (orden.cobertura_por_falla || !orden.reporte_id) return;
    const reporteId = String(orden.reporte_id);
    if (!legadas.has(reporteId)) legadas.set(reporteId, new Map());
    if (!legadasEquivalentes.has(reporteId)) legadasEquivalentes.set(reporteId, new Map());
    const estados = legadas.get(reporteId);
    firmas.forEach((firma) => {
      const detalle = {
        estado: cerrada ? 'ATENDIDA' : 'ASIGNADA',
        ordenes: [orden]
      };
      if (!estados.has(firma) || !cerrada) estados.set(firma, detalle);
      const equivalente = clavePosibleDuplicado(firma);
      const estadosEquivalentes = legadasEquivalentes.get(reporteId);
      if (equivalente && (!estadosEquivalentes.has(equivalente) || !cerrada)) {
        estadosEquivalentes.set(equivalente, detalle);
      }
    });
  });
  return { abiertas, ordenesAbiertas, equivalentesAbiertas, legadas, legadasEquivalentes };
}

export function detalleFallaReporte(reporteId, firma, coberturas, indice, ordenesPorId, esNotaLibre = false) {
  if (!firma) return { estado: 'PENDIENTE', ordenes: [] };
  const cobertura = coberturas.get(`${reporteId}|${firma}`);
  if (cobertura) {
    const estado = cobertura.estado === 'DESCARTADA'
      ? 'DESCARTADA'
      : (cobertura.estado === 'ATENDIDA' ? 'ATENDIDA' : 'ASIGNADA');
    const orden = cobertura.ot_id && ordenesPorId?.get(String(cobertura.ot_id));
    return { estado, ordenes: orden ? [orden] : [], otId: cobertura.ot_id || '' };
  }
  const legado = indice.legadas.get(String(reporteId))?.get(firma)
    || (esNotaLibre && indice.legadasEquivalentes.get(String(reporteId))?.get(clavePosibleDuplicado(firma)));
  if (legado) return legado;
  const equivalentes = esNotaLibre ? (indice.equivalentesAbiertas.get(clavePosibleDuplicado(firma)) || []) : [];
  return indice.abiertas.has(firma) || equivalentes.length
    ? { estado: 'ASIGNADA', ordenes: indice.ordenesAbiertas.get(firma) || equivalentes }
    : { estado: 'PENDIENTE', ordenes: [] };
}

export function estadoFallaReporte(reporteId, firma, coberturas, indice, esNotaLibre = false) {
  return detalleFallaReporte(reporteId, firma, coberturas, indice, undefined, esNotaLibre).estado;
}

export function clavePosibleDuplicado(firma) {
  let partes;
  try {
    partes = JSON.parse(firma);
  } catch (error) {
    throw new Error(`Firma de falla inválida: ${error.message}`);
  }
  if (!Array.isArray(partes) || partes.length !== 4 || partes.some((parte) => typeof parte !== 'string')) {
    throw new Error('Firma de falla inválida: se esperaban equipo, componente, sistema y elemento.');
  }
  if (normalizarTextoFalla(partes[2]) !== 'GENERAL / REVISION TALLER') return '';
  if (typeof globalThis.normalizarTokensNotaFalla !== 'function') {
    throw new Error('No está disponible el normalizador de notas de fallas.');
  }
  const tokens = globalThis.normalizarTokensNotaFalla(partes[3]);
  return tokens ? JSON.stringify([...partes.slice(0, 3).map(normalizarTextoFalla), tokens]) : '';
}

export async function idCoberturaFalla(reporteId, firma) {
  if (!globalThis.crypto?.subtle) throw new Error('El navegador no permite generar la huella de la falla.');
  const bytes = new TextEncoder().encode(firma);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${reporteId}_${hash}`;
}
