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

export function firmasEquivalentesPosicion(firma) {
  const partes = JSON.parse(firma);
  if (!Array.isArray(partes) || partes.length !== 4 || partes.some((parte) => typeof parte !== 'string')) {
    throw new Error('Firma de falla inválida: se esperaban equipo, componente, sistema y elemento.');
  }
  if (!normalizarTextoFalla(partes[0]) || normalizarTextoFalla(partes[0]) === 'S/N'
    || !['TOLVA1', 'TOLVA2'].includes(partes[1])) return [firma];
  const alternativa = [...partes];
  alternativa[1] = partes[1] === 'TOLVA1' ? 'TOLVA2' : 'TOLVA1';
  return [firma, JSON.stringify(alternativa)];
}

export function indexarCoberturasFalla(coberturas) {
  const indice = new Map();
  coberturas.forEach((cobertura) => {
    if (!cobertura.reporte_id || !cobertura.falla_key) return;
    const clave = clavePosibleDuplicado(cobertura.falla_key);
    if (!clave) return;
    const id = `${cobertura.reporte_id}|${claveAgrupacionEquipo(cobertura.falla_key, true)}`;
    if (!indice.has(id)) indice.set(id, cobertura);
  });
  return indice;
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
      firmasEquivalentesPosicion(firma).forEach((variante) => {
        abiertas.add(variante);
        if (!ordenesAbiertas.has(variante)) ordenesAbiertas.set(variante, []);
        if (!ordenesAbiertas.get(variante).includes(orden)) ordenesAbiertas.get(variante).push(orden);
        const equivalente = clavePosibleDuplicado(variante);
        if (equivalente) {
          if (!equivalentesAbiertas.has(equivalente)) equivalentesAbiertas.set(equivalente, []);
          if (!equivalentesAbiertas.get(equivalente).includes(orden)) equivalentesAbiertas.get(equivalente).push(orden);
        }
      });
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
      firmasEquivalentesPosicion(firma).forEach((variante) => {
        if (!estados.has(variante) || !cerrada) estados.set(variante, detalle);
        const equivalente = clavePosibleDuplicado(variante);
        const estadosEquivalentes = legadasEquivalentes.get(reporteId);
        if (equivalente && (!estadosEquivalentes.has(equivalente) || !cerrada)) {
          estadosEquivalentes.set(equivalente, detalle);
        }
      });
    });
  });
  return { abiertas, ordenesAbiertas, equivalentesAbiertas, legadas, legadasEquivalentes };
}

export function coberturaFallaReporte(reporteId, firma, coberturas, esNotaLibre = false) {
  if (!firma) return undefined;
  let cobertura = firmasEquivalentesPosicion(firma)
    .map((variante) => coberturas.get(`${reporteId}|${variante}`))
    .find(Boolean);
  if (!cobertura && esNotaLibre && clavePosibleDuplicado(firma)) {
    const indiceNotas = coberturas.indiceNotas || indexarCoberturasFalla(coberturas);
    cobertura = indiceNotas.get(`${reporteId}|${claveAgrupacionEquipo(firma, true)}`);
  }
  return cobertura;
}

export function detalleFallaReporte(reporteId, firma, coberturas, indice, ordenesPorId, esNotaLibre = false) {
  if (!firma) return { estado: 'PENDIENTE', ordenes: [] };
  const cobertura = coberturaFallaReporte(reporteId, firma, coberturas, esNotaLibre);
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

export function claveAgrupacionEquipo(firma, esNotaLibre = false) {
  const clave = (esNotaLibre && clavePosibleDuplicado(firma)) || firma;
  const partes = JSON.parse(clave);
  if (normalizarTextoFalla(partes[0]) && normalizarTextoFalla(partes[0]) !== 'S/N'
    && (partes[1] === 'TOLVA1' || partes[1] === 'TOLVA2')) partes[1] = 'TOLVA';
  return JSON.stringify(partes);
}

export async function idCoberturaFalla(reporteId, firma) {
  if (!globalThis.crypto?.subtle) throw new Error('El navegador no permite generar la huella de la falla.');
  const bytes = new TextEncoder().encode(firma);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${reporteId}_${hash}`;
}
