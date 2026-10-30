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

export async function idCoberturaFalla(reporteId, firma) {
  if (!globalThis.crypto?.subtle) throw new Error('El navegador no permite generar la huella de la falla.');
  const bytes = new TextEncoder().encode(firma);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${reporteId}_${hash}`;
}
