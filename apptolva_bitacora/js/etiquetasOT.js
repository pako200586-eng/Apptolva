// Etiquetas de componentes con número económico real para la OT (modal y PDF).
// Script clásico (sin export); en Node se usa vía module.exports para pruebas.
(function (root) {
  const CAMPOS = { tracto: 'unitId', tolva1: 'tolva1', dolly: 'dolly', tolva2: 'tolva2' };

  function normalizar(valor) {
    return String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  }

  function claveComponente(etiqueta) {
    const t = normalizar(etiqueta);
    if (!t) return '';
    if (t.includes('DOLLY') || t.includes('CONVERTIDOR')) return 'dolly';
    if (t.includes('1RA') || t.includes('TOLVA 1')) return 'tolva1';
    if (t.includes('2DA') || t.includes('TOLVA 2')) return 'tolva2';
    if (t.includes('TRACTO')) return 'tracto';
    return '';
  }

  function economicoDe(clave, payload, economicoGuardado) {
    const valor = String(economicoGuardado ?? payload?.[CAMPOS[clave]] ?? '').trim();
    return valor && normalizar(valor) !== 'S/N' ? valor : '';
  }

  function formatear(clave, economico) {
    if (clave === 'tracto') return `Tracto ${economico}`;
    if (clave === 'tolva1') return `Tolva ${economico} (1ra)`;
    if (clave === 'tolva2') return `Tolva ${economico} (2da)`;
    return `Dolly ${economico}`;
  }

  // Devuelve "Tolva 14091 (1ra)"; si no hay número conocido conserva la etiqueta original.
  function etiquetaComponente(etiqueta, payload, economicoGuardado, claveGuardada) {
    const clave = CAMPOS[claveGuardada] ? claveGuardada : claveComponente(etiqueta);
    if (!clave) return etiqueta;
    const economico = economicoDe(clave, payload, economicoGuardado);
    return economico ? formatear(clave, economico) : etiqueta;
  }

  // "Tracto 14121 / Tolva 14091 (1ra) / Tolva 14110 (2da)" con los componentes del reporte.
  function encabezadoComponentes(payload) {
    return ['tracto', 'tolva1', 'dolly', 'tolva2']
      .map((clave) => {
        const economico = economicoDe(clave, payload);
        return economico ? formatear(clave, economico) : '';
      })
      .filter(Boolean)
      .join(' / ');
  }

  // Reescribe "1ra TOLVA | FRENOS: x ; 2da TOLVA | FRENOS: y" usando los económicos del payload.
  function descripcionConEconomicos(descripcion, payload) {
    return String(descripcion ?? '')
      .split(/(\s;\s|\n)/)
      .map((parte) => {
        const m = /^(\s*(?:[•-]\s*)?)([^|]+?)\s\|\s([\s\S]*)$/.exec(parte);
        if (!m) return parte;
        return `${m[1]}${etiquetaComponente(m[2].trim(), payload)} | ${m[3]}`;
      })
      .join('');
  }

  const api = { claveComponente, etiquetaComponente, encabezadoComponentes, descripcionConEconomicos };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.etiquetasOT = api;
})(typeof window !== 'undefined' ? window : globalThis);
