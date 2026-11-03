// Catálogo maestro de equipos independientes (PA Chapo).
// Módulo puro: sin DOM ni almacenamiento, para poder usarlo en el checklist, el panel admin y las pruebas.

export const TIPOS_EQUIPO = {
  TRACTO: 'tracto',
  TOLVA: 'tolva',
  DOLLY: 'dolly',
  UTILITARIA: 'utilitaria'
};

export const ESTADOS_EQUIPO = {
  ACTIVO: 'activo',
  INACTIVO: 'inactivo',
  SINIESTRADO: 'siniestrado',
  TALLER: 'taller'
};

const rango = (desde, hasta) => Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);

const crearEquipos = (tipo, economicos) => economicos.map((numero) => ({
  id: `${tipo}_${numero}`,
  economico: String(numero),
  display: `T${numero}`,
  tipo,
  estado: ESTADOS_EQUIPO.ACTIVO
}));

const TRACTOS = [...rango(14120, 14125), ...rango(14127, 14133), 13817, ...rango(14136, 14138)];
const TOLVAS = [...rango(14087, 14114), 14033, ...rango(14116, 14119), 15770];
const DOLLYS = rango(14139, 14153);

export const CATALOGO_SEMILLA = [
  ...crearEquipos(TIPOS_EQUIPO.TRACTO, TRACTOS),
  ...crearEquipos(TIPOS_EQUIPO.TOLVA, TOLVAS),
  ...crearEquipos(TIPOS_EQUIPO.DOLLY, DOLLYS)
];

// Cada componente del checklist se valida contra un tipo de equipo; las dos tolvas comparten catálogo.
export const COMPONENTES_TREN = {
  tracto: { tipo: TIPOS_EQUIPO.TRACTO, etiqueta: 'Tracto', obligatorio: () => true },
  tolva1: { tipo: TIPOS_EQUIPO.TOLVA, etiqueta: '1ra tolva', obligatorio: () => true },
  dolly: { tipo: TIPOS_EQUIPO.DOLLY, etiqueta: 'Dolly', obligatorio: (modalidad) => modalidad !== 'sencillo' },
  tolva2: { tipo: TIPOS_EQUIPO.TOLVA, etiqueta: '2da tolva', obligatorio: (modalidad) => modalidad !== 'sencillo' }
};

const NUMERO_ECONOMICO = /^\d+$/;

// Acepta variantes comunes de captura ("T14148", " 14148 ") sin alterar el número.
export function normalizarEconomico(valor) {
  return String(valor ?? '').trim().toUpperCase().replace(/\s+/g, '').replace(/^T(?=\d)/, '');
}

export function idEquipo(tipo, economico) {
  return `${tipo}_${economico}`;
}

export function validarCatalogo(equipos) {
  if (!Array.isArray(equipos) || !equipos.length) return ['El catálogo está vacío.'];
  const tipos = new Set(Object.values(TIPOS_EQUIPO));
  const estados = new Set(Object.values(ESTADOS_EQUIPO));
  const ids = new Set();
  const errores = [];
  equipos.forEach((equipo) => {
    const referencia = equipo?.id || '(sin id)';
    if (!equipo || typeof equipo !== 'object') {
      errores.push('Hay un registro que no es un objeto.');
      return;
    }
    if (!tipos.has(equipo.tipo)) errores.push(`${referencia}: tipo no válido.`);
    if (!estados.has(equipo.estado)) errores.push(`${referencia}: estado no válido.`);
    if (!NUMERO_ECONOMICO.test(String(equipo.economico ?? ''))) errores.push(`${referencia}: el económico debe ser numérico.`);
    if (equipo.id !== idEquipo(equipo.tipo, equipo.economico)) errores.push(`${referencia}: el id no coincide con tipo y económico.`);
    if (ids.has(equipo.id)) errores.push(`${referencia}: id duplicado.`);
    ids.add(equipo.id);
  });
  return errores;
}

export function activosPorTipo(equipos, tipo) {
  return equipos
    .filter((equipo) => equipo.tipo === tipo && equipo.estado === ESTADOS_EQUIPO.ACTIVO)
    .sort((a, b) => Number(a.economico) - Number(b.economico));
}

// Equipos de la semilla que aún no existen en el catálogo indicado (para la carga inicial en Firestore).
export function equiposFaltantes(equipos, semilla = CATALOGO_SEMILLA) {
  const existentes = new Set(equipos.map((equipo) => equipo.id));
  return semilla.filter((equipo) => !existentes.has(equipo.id));
}

// Un equipo desconocido solo se admite con motivo; uno existente pero no activo (taller, siniestrado…) nunca.
export function validarEquipo(equipos, tipo, valor, etiqueta, motivoExcepcion = '') {
  const economico = normalizarEconomico(valor);
  if (!economico) return { ok: false, economico, error: `Captura el número de ${etiqueta}.` };

  const equipo = equipos.find((item) => item.tipo === tipo && item.economico === economico);
  if (equipo) {
    if (equipo.estado !== ESTADOS_EQUIPO.ACTIVO) {
      return { ok: false, economico, error: `${etiqueta} ${economico} está en estado "${equipo.estado}" y no puede usarse en un checklist.` };
    }
    return { ok: true, economico, equipo };
  }

  if (!NUMERO_ECONOMICO.test(economico)) {
    return { ok: false, economico, error: `${etiqueta}: "${economico}" no es un número económico válido.` };
  }
  if (motivoExcepcion.trim()) return { ok: true, economico, noCatalogado: true };
  return { ok: false, economico, error: `${etiqueta} ${economico} no está en el catálogo. Revisa el número o indica el motivo del equipo no registrado.` };
}

export function validarTrenDeCarga(equipos, { modalidad = 'full', tracto, tolva1, dolly, tolva2, motivoExcepcion = '' }) {
  const capturados = { tracto, tolva1, dolly, tolva2 };
  const errores = [];
  const valores = {};
  const noCatalogados = [];

  Object.entries(COMPONENTES_TREN).forEach(([clave, { tipo, etiqueta, obligatorio }]) => {
    if (!obligatorio(modalidad)) return;
    const resultado = validarEquipo(equipos, tipo, capturados[clave], etiqueta, motivoExcepcion);
    if (!resultado.ok) {
      errores.push(resultado.error);
      return;
    }
    valores[clave] = resultado.economico;
    if (resultado.noCatalogado) noCatalogados.push({ componente: clave, economico: resultado.economico });
  });

  if (valores.tolva1 && valores.tolva1 === valores.tolva2) {
    errores.push('La 1ra y la 2da tolva no pueden ser el mismo equipo.');
  }

  return {
    ok: errores.length === 0,
    errores,
    valores,
    noCatalogados: noCatalogados.map((item) => ({ ...item, motivo: motivoExcepcion.trim() }))
  };
}
