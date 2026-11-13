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
  const legadas = new Map();
  ordenes.forEach((orden) => {
    const firmas = firmasDeOrden(orden);
    const cerrada = esCerrada(orden);
    if (!cerrada) firmas.forEach((firma) => abiertas.add(firma));
    if (orden.cobertura_por_falla || !orden.reporte_id) return;
    const reporteId = String(orden.reporte_id);
    if (!legadas.has(reporteId)) legadas.set(reporteId, new Map());
    const estados = legadas.get(reporteId);
    firmas.forEach((firma) => {
      if (!estados.has(firma) || !cerrada) estados.set(firma, cerrada ? 'ATENDIDA' : 'ASIGNADA');
    });
  });
  return { abiertas, legadas };
}

export function estadoFallaReporte(reporteId, firma, coberturas, indice) {
  if (!firma) return 'PENDIENTE';
  const cobertura = coberturas.get(`${reporteId}|${firma}`);
  if (cobertura) {
    if (cobertura.estado === 'DESCARTADA') return 'DESCARTADA';
    return cobertura.estado === 'ATENDIDA' ? 'ATENDIDA' : 'ASIGNADA';
  }
  const legado = indice.legadas.get(String(reporteId))?.get(firma);
  if (legado) return legado;
  return indice.abiertas.has(firma) ? 'ASIGNADA' : 'PENDIENTE';
}

export async function idCoberturaFalla(reporteId, firma) {
  if (!globalThis.crypto?.subtle) throw new Error('El navegador no permite generar la huella de la falla.');
  const bytes = new TextEncoder().encode(firma);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${reporteId}_${hash}`;
}
