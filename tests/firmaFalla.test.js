import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { claveAgrupacionEquipo, clavePosibleDuplicado, coberturaFallaReporte, crearFirmaFalla, crearFirmasFalla, detalleFallaReporte, estadoFallaReporte, firmasEquivalentesPosicion, idCoberturaFalla, indiceOrdenesFalla, separarSistemasFalla } from '../apptolva_bitacora/js/firmaFalla.js';
import { calcularAlertasSeguridad } from '../apptolva_bitacora/js/alertasSeguridad.js';
import { extraerFallasReporte, idCobertura } from '../netlify/functions/cerrar-fallas-repetidas.js';

test('normalizes accents, case, and spacing while preserving equipment identity', () => {
  const first = crearFirmaFalla({
    unidad: ' tolva-02 ',
    componente: 'tolva1',
    sistema: 'Suspensión',
    item: '  Bolsa   de aire '
  });
  const equivalent = crearFirmaFalla({
    unidad: 'TOLVA-02',
    componente: 'TOLVA1',
    sistema: 'SUSPENSION',
    item: 'BOLSA DE AIRE'
  });

  assert.equal(first, equivalent);
  assert.notEqual(first, crearFirmaFalla({
    unidad: 'TRACTO-01',
    componente: 'tolva1',
    sistema: 'SUSPENSION',
    item: 'BOLSA DE AIRE'
  }));
  assert.equal(crearFirmaFalla({
    unidad: 'S/N',
    componente: 'tracto',
    sistema: 'MOTOR',
    item: 'Fuga de aceite'
  }), '');
});

test('creates a separate signature for each comma-separated system', () => {
  const firmas = crearFirmasFalla({
    unidad: 'TR-01',
    componente: 'tracto',
    sistema: 'FRENOS, MOTOR / TREN MOTRIZ',
    item: 'Fuga de aceite'
  });

  assert.equal(firmas.length, 2);
  assert.notEqual(firmas[0], firmas[1]);
  assert.equal(JSON.parse(firmas[0])[2], 'FRENOS');
  assert.equal(JSON.parse(firmas[1])[2], 'MOTOR / TREN MOTRIZ');
  assert.deepEqual(separarSistemasFalla(' FRENOS, MOTOR / TREN MOTRIZ, FRENOS '), [
    'FRENOS',
    'MOTOR / TREN MOTRIZ'
  ]);
});

test('server and panel derive the same signature from a checklist', () => {
  const reporte = {
    unit_id: 'TRACTO-01',
    payload: {
      unitId: 'TRACTO-01',
      tolva1: 'TOLVA-02',
      checklistData: [{
        id: 'tracto',
        titulo: 'TRACTO CAMIÓN',
        categorias: [{
          cat: 'MOTOR',
          items: [{ item: 'Fuga de aceite', estado: 'MAL' }]
        }]
      }]
    }
  };
  const fallas = extraerFallasReporte(reporte);
  const firmaEsperada = crearFirmaFalla({
    unidad: 'TRACTO-01',
    componente: 'TRACTO',
    sistema: 'MOTOR',
    item: 'Fuga de aceite'
  });

  assert.deepEqual(fallas.map((falla) => falla.firma), [firmaEsperada]);
});

test('server keeps faults on different full components separate', () => {
  const reporte = {
    report_type: 'checklist',
    payload: {
      unitId: 'TRACTO-01',
      tolva1: 'TOLVA-02',
      checklistData: [
        {
          id: 'tracto',
          categorias: [{ cat: 'MOTOR', items: [{ item: 'Fuga de aceite', estado: 'MAL' }] }]
        },
        {
          id: 'tolva1',
          categorias: [{ cat: 'MOTOR', items: [{ item: 'Fuga de aceite', estado: 'MAL' }] }]
        }
      ]
    }
  };
  const firmas = extraerFallasReporte(reporte).map((falla) => falla.firma);

  assert.equal(firmas.length, 2);
  assert.notEqual(firmas[0], firmas[1]);
  const reporteCompuesto = extraerFallasReporte({
    report_type: 'checklist',
    payload: {
      unitId: 'TRACTO-01',
      checklistData: [{
        id: 'tracto',
        categorias: [{
          cat: 'FRENOS, MOTOR / TREN MOTRIZ',
          items: [{ item: 'Item de prueba sin catálogo', estado: 'MAL' }]
        }]
      }]
    }
  });
  assert.deepEqual(reporteCompuesto.map((falla) => JSON.parse(falla.firma)[2]), [
    'FRENOS',
    'MOTOR / TREN MOTRIZ'
  ]);
  assert.deepEqual(extraerFallasReporte({
    report_type: 'bitacora',
    payload: reporte.payload
  }), []);
  assert.deepEqual(extraerFallasReporte({
    folio: 'FB1001',
    payload: { ...reporte.payload, logs: [] }
  }), []);
});

test('detects faults on all equipment even when the tractor is OK', () => {
  const reporte = {
    report_type: 'checklist',
    payload: {
      unitId: '14137', tolva1: '14102', dolly: '14150', tolva2: '14101',
      checklistData: [
        { id: 'tracto', categorias: [{ cat: 'MOTOR', items: [{ item: 'Motor', estado: 'OK' }] }] },
        { id: 'tolva1', categorias: [{ cat: 'FRENOS', items: [
          { item: 'Llantas', estado: ' mal ' }, { item: 'ABS', estado: false }
        ] }] },
        { id: 'dolly', categorias: [{ cat: 'FRENOS', items: [
          { item: 'Llantas', estado: 'MAL' }, { item: 'ABS', estado: 'MAL' },
          { item: 'Engrasado', estado: 'MAL' }
        ] }] },
        { id: 'tolva2', categorias: [{ cat: 'SISTEMA HIDRÁULICO', items: [{ item: 'Fugas', estado: 'MAL' }] }] }
      ],
      observaciones: { tracto: 'Sin observaciones' }
    }
  };
  const fallas = extraerFallasReporte(reporte);
  assert.equal(fallas.length, 6);
  assert.deepEqual(fallas.map(({ unidad }) => unidad), ['14102', '14102', '14150', '14150', '14150', '14101']);
  const legado = extraerFallasReporte({
    report_type: 'checklist',
    payload: { unitId: '14137', tolva1: '14102', checklist: [{ item: 'tolva1-ABS', estado: false }] }
  });
  assert.equal(legado.length, 1);
  assert.equal(legado[0].unidad, '14102');
});

test('legacy orders and coverage only affect the matching report and fault', () => {
  const tracto = crearFirmaFalla({ unidad: '14137', componente: 'tracto', sistema: 'FRENOS', item: 'ABS' });
  const dolly = crearFirmaFalla({ unidad: '14150', componente: 'dolly', sistema: 'FRENOS', item: 'ABS' });
  const ordenes = [{ reporte_id: 'F-3243', estatus: 'TERMINADA', firmas: [tracto] }];
  const indice = indiceOrdenesFalla(ordenes, (orden) => orden.firmas, (orden) => orden.estatus === 'TERMINADA');
  const coberturas = new Map();
  assert.equal(estadoFallaReporte('F-3243', tracto, coberturas, indice), 'ATENDIDA');
  assert.equal(estadoFallaReporte('F-3243', dolly, coberturas, indice), 'PENDIENTE');
  assert.equal(estadoFallaReporte('nuevo', tracto, coberturas, indice), 'PENDIENTE');
  coberturas.set(`F-3243|${dolly}`, { estado: 'DESCARTADA' });
  assert.equal(estadoFallaReporte('F-3243', dolly, coberturas, indice), 'DESCARTADA');
  const abierta = indiceOrdenesFalla([{ estatus: 'NUEVA', firmas: [dolly] }], (orden) => orden.firmas, () => false);
  assert.equal(estadoFallaReporte('otro', dolly, new Map(), abierta), 'ASIGNADA');
});

test('possible duplicates compare reordered words without changing persisted signatures', () => {
  const datos = { unidad: '14096', componente: 'tolva2', sistema: 'GENERAL / REVISIÓN TALLER' };
  const primera = crearFirmaFalla({ ...datos, item: 'Motor de arrastre tira aceite' });
  const segunda = crearFirmaFalla({ ...datos, item: 'Tira aceite el motor de arrastre.' });
  assert.notEqual(primera, segunda);
  assert.equal(clavePosibleDuplicado(primera), clavePosibleDuplicado(segunda));
  assert.notEqual(clavePosibleDuplicado(primera), clavePosibleDuplicado(crearFirmaFalla({
    ...datos, item: 'Motor de arrastre no tira aceite'
  })));
  assert.notEqual(clavePosibleDuplicado(primera), clavePosibleDuplicado(crearFirmaFalla({
    ...datos, unidad: '14097', item: 'Tira aceite el motor de arrastre'
  })));
  assert.notEqual(clavePosibleDuplicado(primera), clavePosibleDuplicado(crearFirmaFalla({
    ...datos, sistema: 'FRENOS', item: 'Tira aceite el motor de arrastre'
  })));
  assert.equal(clavePosibleDuplicado(crearFirmaFalla({ ...datos, item: 'Llantas' })), '');
  const primerReporte = { payload: { unitId: '14132', tolva2: '14096', observaciones: { tolva2: 'Motor de arrastre tira aceite' } } };
  const segundoReporte = { payload: { unitId: '14132', tolva2: '14096', observaciones: { tolva2: 'Tira aceite el motor de arrastre' } } };
  const primeraNota = globalThis.procesarReporteFallas(primerReporte).fallas[0];
  const segundaNota = globalThis.procesarReporteFallas(segundoReporte).fallas[0];
  assert.equal(primeraNota.componenteKeyId, segundaNota.componenteKeyId);
  const [fallaPrimera] = extraerFallasReporte(primerReporte);
  const [fallaSegunda] = extraerFallasReporte(segundoReporte);
  const indice = indiceOrdenesFalla([{ firmas: [fallaPrimera.firma] }], (orden) => orden.firmas, () => false);
  assert.equal(estadoFallaReporte('nuevo', fallaSegunda.firma, new Map(), indice, true), 'ASIGNADA');
  assert.equal(estadoFallaReporte('nuevo', fallaSegunda.firma, new Map(), indice, false), 'PENDIENTE');
  assert.equal(estadoFallaReporte('nuevo', fallaSegunda.firma, new Map([
    [`nuevo|${fallaSegunda.firma}`, { estado: 'DESCARTADA' }]
  ]), indice, true), 'DESCARTADA');
  const legado = indiceOrdenesFalla(
    [{ reporte_id: 'mismo', firmas: [fallaPrimera.firma] }], (orden) => orden.firmas, () => true
  );
  assert.equal(estadoFallaReporte('mismo', fallaSegunda.firma, new Map(), legado, true), 'ATENDIDA');
  assert.equal(estadoFallaReporte('otro', fallaSegunda.firma, new Map(), legado, true), 'PENDIENTE');
});

test('trailer position shares open orders and per-report historical coverages without affecting new reports', () => {
  const datos = { unidad: '14107', sistema: 'FRENOS', item: 'ABS' };
  const primera = crearFirmaFalla({ ...datos, componente: 'tolva1' });
  const segunda = crearFirmaFalla({ ...datos, componente: 'tolva2' });
  const distinta = crearFirmaFalla({ ...datos, unidad: '14108', componente: 'tolva2' });
  const otroItem = crearFirmaFalla({ ...datos, item: 'Llantas', componente: 'tolva2' });
  assert.deepEqual(firmasEquivalentesPosicion(primera), [primera, segunda]);
  assert.equal(claveAgrupacionEquipo(primera), claveAgrupacionEquipo(segunda));
  assert.notEqual(claveAgrupacionEquipo(primera), claveAgrupacionEquipo(distinta));
  assert.notEqual(claveAgrupacionEquipo(primera), claveAgrupacionEquipo(otroItem));
  assert.deepEqual(firmasEquivalentesPosicion('["S/N","TOLVA1","FRENOS","ABS"]'), ['["S/N","TOLVA1","FRENOS","ABS"]']);
  const abierta = indiceOrdenesFalla([{ id: 'ot1', firmas: [primera, segunda] }], (ot) => ot.firmas, () => false);
  assert.equal(estadoFallaReporte('r2', segunda, new Map(), abierta), 'ASIGNADA');
  assert.equal(detalleFallaReporte('r2', segunda, new Map(), abierta).ordenes.length, 1);
  assert.equal(estadoFallaReporte('r2', distinta, new Map(), abierta), 'PENDIENTE');
  assert.equal(estadoFallaReporte('r2', otroItem, new Map(), abierta), 'PENDIENTE');
  const sinOrdenes = indiceOrdenesFalla([], () => [], () => false);
  const coberturas = new Map([
    [`r1|${primera}`, { estado: 'ATENDIDA', ot_id: 'ot1' }],
    [`r2|${primera}`, { estado: 'DESCARTADA' }]
  ]);
  assert.equal(estadoFallaReporte('r1', segunda, coberturas, sinOrdenes), 'ATENDIDA');
  assert.equal(estadoFallaReporte('r2', segunda, coberturas, sinOrdenes), 'DESCARTADA');
  assert.equal(estadoFallaReporte('posterior', segunda, coberturas, sinOrdenes), 'PENDIENTE');
  const legado = indiceOrdenesFalla([{ reporte_id: 'r1', firmas: [primera] }], (ot) => ot.firmas, () => true);
  assert.equal(estadoFallaReporte('r1', segunda, new Map(), legado), 'ATENDIDA');
  assert.equal(estadoFallaReporte('posterior', segunda, new Map(), legado), 'PENDIENTE');
});

test('reordered free notes match across trailer positions for open orders and historical coverage', () => {
  const datos = { unidad: '14107', sistema: 'GENERAL / REVISIÓN TALLER' };
  const primera = crearFirmaFalla({ ...datos, componente: 'tolva1', item: 'Motor de arrastre tira aceite' });
  const segunda = crearFirmaFalla({ ...datos, componente: 'tolva2', item: 'Tira aceite el motor de arrastre' });
  const ordenes = indiceOrdenesFalla([{ firmas: [primera] }], (ot) => ot.firmas, () => false);
  assert.equal(estadoFallaReporte('r2', segunda, new Map(), ordenes, true), 'ASIGNADA');
  const cobertura = { reporte_id: 'r1', falla_key: primera, estado: 'DESCARTADA' };
  const coberturas = new Map([[`r1|${primera}`, cobertura]]);
  assert.equal(estadoFallaReporte('r1', segunda, coberturas, ordenes, true), 'DESCARTADA');
  assert.equal(estadoFallaReporte('r2', segunda, coberturas, ordenes, true), 'ASIGNADA');
});

test('recurrences show each fault coverage instead of an unrelated report order', () => {
  const html = readFileSync(new URL('../apptolva_bitacora/admin.html', import.meta.url), 'utf8');
  const inicio = html.indexOf('    function calcularFallasRecurrentes(');
  const fin = html.indexOf('    function renderFallasRecurrentes(', inicio);
  assert.ok(inicio >= 0 && fin > inicio);
  const firma = crearFirmaFalla({ unidad: '14132', componente: 'tracto', sistema: 'INTERIOR', item: 'Asientos' });
  const otraFirma = crearFirmaFalla({ unidad: '14132', componente: 'tracto', sistema: 'FRENOS', item: 'ABS' });
  const ordenes = [
    { id: 'ot-445', folio_ot: 445, estatus: 'TERMINADA', cobertura_por_falla: true, firmas: [firma] },
    { id: 'ot-999', folio_ot: 999, estatus: 'NUEVA', reporte_id: 'r3', firmas: [otraFirma] }
  ];
  const indice = indiceOrdenesFalla(ordenes, (orden) => orden.firmas, (orden) => orden.estatus === 'TERMINADA');
  const coberturas = new Map([
    [`r1|${firma}`, { estado: 'ATENDIDA', ot_id: 'ot-445' }],
    [`r2|${firma}`, { estado: 'DESCARTADA' }]
  ]);
  const calcular = runInNewContext(`${html.slice(inicio, fin)}; calcularFallasRecurrentes`, {
    dashState: { ordenes, coberturas }, indiceOrdenesPanel: () => indice,
    numerosEconomicos: () => ({ tracto: '14132' }),
    fallasPorComponente: () => ({ tracto: [{ categoria: 'INTERIOR', item: 'Asientos' }] }),
    COMPONENTES: [{ key: 'tracto', nombre: 'Tracto' }],
    sinAcentos: (texto) => texto.toUpperCase(), crearFirmaFalla, detalleFallaReporte,
    claveAgrupacionEquipo, coincideEquipoFiltro: () => true
  });
  const [grupo] = calcular([
    { id: 'r1', folio: 'F-3033', createdAt: '2026-11-10T12:00:00Z' },
    { id: 'r2', folio: 'F-2909', createdAt: '2026-11-11T12:00:00Z' },
    { id: 'r3', folio: 'F-3040', createdAt: '2026-11-12T12:00:00Z' }
  ]);
  assert.match(grupo.estadoOt, /OT-445.*F-3033/);
  assert.match(grupo.estadoOt, /Descartada: F-2909/);
  assert.match(grupo.estadoOt, /Pendiente sin OT: F-3040/);
  assert.doesNotMatch(grupo.estadoOt, /OT-999/);
});

test('recurrences group reordered free notes and show their individual states', () => {
  const html = readFileSync(new URL('../apptolva_bitacora/admin.html', import.meta.url), 'utf8');
  const inicio = html.indexOf('    function calcularFallasRecurrentes(');
  const fin = html.indexOf('    function renderFallasRecurrentes(', inicio);
  assert.ok(inicio >= 0 && fin > inicio);
  const orden = { id: '484', folio_ot: 484, estatus: 'NUEVA' };
  const firma = crearFirmaFalla({ unidad: '14096', componente: 'tolva2', sistema: 'GENERAL / REVISIÓN TALLER', item: 'Motor de arrastre tira aceite' });
  const indice = indiceOrdenesFalla([{ ...orden, firmas: [firma] }], (ot) => ot.firmas, () => false);
  const calcular = runInNewContext(`${html.slice(inicio, fin)}; calcularFallasRecurrentes`, {
    dashState: { ordenes: [orden], coberturas: new Map() }, indiceOrdenesPanel: () => indice,
    numerosEconomicos: () => ({ tolva2: '14096' }),
    fallasPorComponente: (reporte) => ({ tolva2: [{
      categoria: 'GENERAL / REVISIÓN TALLER', item: reporte.item, componenteKeyId: 'aceite arrastre motor tira'
    }] }),
    COMPONENTES: [{ key: 'tolva2', nombre: 'Tolva 2' }],
    sinAcentos: (texto) => texto.toUpperCase(), crearFirmaFalla, detalleFallaReporte, clavePosibleDuplicado,
    claveAgrupacionEquipo, coincideEquipoFiltro: () => true
  });
  const grupos = calcular([
    { id: 'r1', folio: 'F-3279', item: 'Motor de arrastre tira aceite', createdAt: '2026-11-10T12:00:00Z' },
    { id: 'r2', folio: 'F-3285', item: 'Tira aceite el motor de arrastre', createdAt: '2026-11-11T12:00:00Z' }
  ]);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].incidencias, 2);
  assert.match(grupos[0].estadoOt, /OT-484.*F-3279, F-3285/);
});

test('dashboard groups trailer positions and resolves them against the same open OT', () => {
  const html = readFileSync(new URL('../apptolva_bitacora/admin.html', import.meta.url), 'utf8');
  const inicio = html.indexOf('    function calcularFallasRecurrentes(');
  const fin = html.indexOf('    function renderFallasRecurrentes(', inicio);
  const firma = crearFirmaFalla({ unidad: '14107', componente: 'tolva1', sistema: 'FRENOS', item: 'ABS' });
  const orden = { id: 'ot1', folio_ot: 123, estatus: 'NUEVA', firmas: [firma] };
  const indice = indiceOrdenesFalla([orden], (ot) => ot.firmas, () => false);
  const calcular = runInNewContext(`${html.slice(inicio, fin)}; calcularFallasRecurrentes`, {
    dashState: { ordenes: [orden], coberturas: new Map() }, indiceOrdenesPanel: () => indice,
    numerosEconomicos: (reporte) => ({ [reporte.posicion]: '14107' }),
    fallasPorComponente: (reporte) => ({
      tolva1: reporte.posicion === 'tolva1' ? [{ categoria: 'FRENOS', item: 'ABS' }] : [],
      tolva2: reporte.posicion === 'tolva2' ? [{ categoria: 'FRENOS', item: 'ABS' }] : []
    }),
    COMPONENTES: [{ key: 'tolva1', nombre: 'Tolva 1' }, { key: 'tolva2', nombre: 'Tolva 2' }],
    crearFirmaFalla, detalleFallaReporte, claveAgrupacionEquipo, coincideEquipoFiltro: () => true
  });
  const grupos = calcular([
    { id: 'r1', folio: 'F-1', posicion: 'tolva1', createdAt: '2026-11-10T12:00:00Z' },
    { id: 'r2', folio: 'F-2', posicion: 'tolva2', createdAt: '2026-11-11T12:00:00Z' }
  ]);
  assert.equal(grupos.length, 1);
  assert.equal(grupos[0].incidencias, 2);
  assert.match(grupos[0].estadoOt, /OT-123.*F-1, F-2/);
});

test('canceling a possible duplicate stops OT creation', async () => {
  const html = readFileSync(new URL('../apptolva_bitacora/admin.html', import.meta.url), 'utf8');
  const inicio = html.indexOf('    async function crearOTDesdeFallas(');
  const fin = html.indexOf('    const ORDEN_COMPONENTES', inicio);
  assert.ok(inicio >= 0 && fin > inicio);
  const datos = { unidad: '14096', componente: 'tolva2', sistema: 'GENERAL / REVISIÓN TALLER' };
  const seleccion = crearFirmaFalla({ ...datos, item: 'Motor de arrastre tira aceite' });
  const existente = crearFirmaFalla({ ...datos, item: 'Tira aceite el motor de arrastre' });
  let aviso = '';
  const crear = runInNewContext(`${html.slice(inicio, fin)}; crearOTDesdeFallas`, {
    state: { role: 'admin' },
    obtenerOrdenes: async (forzar) => {
      assert.equal(forzar, true);
      return [{ folio_ot: 484, estatus: 'NUEVA', firmas: [existente] }];
    },
    ESTATUS_REALIZADA: new Set(['TERMINADA', 'CERRADA']), sinAcentos: (texto) => texto,
    firmasDeOrden: (orden) => orden.firmas, clavePosibleDuplicado, claveAgrupacionEquipo,
    window: { confirm: (mensaje) => { aviso = mensaje; return false; } }
  });
  await crear([{ firma: seleccion, unidad: '14096', componenteKeyId: 'aceite arrastre motor tira', reportes: [{ reporte: { id: 'r1' } }] }]);
  assert.match(aviso, /OT-484/);
  assert.match(aviso, /TIRA ACEITE EL MOTOR DE ARRASTRE/);
});

test('one OT for equivalent notes preserves each report coverage signature', async () => {
  const html = readFileSync(new URL('../apptolva_bitacora/admin.html', import.meta.url), 'utf8');
  const inicio = html.indexOf('    async function crearOTDesdeFallas(');
  const fin = html.indexOf('    const ORDEN_COMPONENTES', inicio);
  assert.ok(inicio >= 0 && fin > inicio);
  const datos = { unidad: '14096', componente: 'tolva2', sistema: 'GENERAL / REVISIÓN TALLER' };
  const primera = crearFirmaFalla({ ...datos, item: 'Motor de arrastre tira aceite' });
  const segunda = crearFirmaFalla({ ...datos, componente: 'tolva1', item: 'Tira aceite el motor de arrastre' });
  const escrituras = [];
  const crear = runInNewContext(`${html.slice(inicio, fin)}; crearOTDesdeFallas`, {
    state: { role: 'admin', user: { email: 'admin@example.test' } },
    dashState: { ordenes: [] }, db: {},
    obtenerOrdenes: async () => [], obtenerCoberturas: async () => new Map(), coberturaFallaReporte,
    ESTATUS_REALIZADA: new Set(), sinAcentos: (texto) => texto,
    firmasDeOrden: (orden) => orden.firmas, clavePosibleDuplicado, claveAgrupacionEquipo, firmasEquivalentesPosicion,
    crypto: { randomUUID: () => 'id-unico' },
    idCoberturaFalla: async (id, firma) => `${id}|${firma}`,
    doc: (db, coleccion, id) => ({ coleccion, id }),
    runTransaction: async (db, fn) => fn({
      get: async () => ({ exists: () => false, data: () => ({ folio_ot_actual: 164 }) }),
      set: (ref, data) => escrituras.push({ ref, data })
    }),
    window: { etiquetasOT: { etiquetaComponente: () => 'Tolva 2' } },
    renderDashboard: () => {}, generarPDFOT: async () => {}, cargarFallas: async () => {},
    cargarOrdenes: async () => {}, mostrarVistaOrdenes: () => {}
  });
  await crear([{
    firma: primera, componenteKeyId: 'aceite arrastre motor tira', unidad: '14096',
    componente: 'Tolva 2', componenteKey: 'tolva2', sistema: datos.sistema,
    item: 'Motor de arrastre tira aceite',
    reportes: [
      { reporte: { id: 'r1', unitId: '14132', folio: 'F-3279', createdAt: '2026-11-10T12:00:00Z' }, falla: { firma: primera } },
      { reporte: { id: 'r2', unitId: '14121', folio: 'F-3285', createdAt: '2026-11-11T12:00:00Z' }, falla: { firma: segunda } }
    ]
  }]);
  const coberturas = escrituras.filter(({ ref }) => ref.coleccion === 'falla_ot_cobertura');
  assert.equal(coberturas.length, 2);
  assert.equal(coberturas[0].data.falla_key, primera);
  assert.equal(coberturas[1].data.falla_key, segunda);
  const orden = escrituras.find(({ ref }) => ref.coleccion === 'ordenes_trabajo').data;
  assert.equal(orden.unidad, '14096');
  assert.equal(orden.tractoAsociado, '14121');
  assert.equal(orden.payload.cobertura_falla_keys.length, 2);
  assert.ok(orden.payload.cobertura_falla_keys.includes(primera));
  assert.ok(orden.payload.cobertura_falla_keys.includes(segunda));
});

test('OT creation checks the alternate historical position inside the transaction', async () => {
  const html = readFileSync(new URL('../apptolva_bitacora/admin.html', import.meta.url), 'utf8');
  const inicio = html.indexOf('    async function crearOTDesdeFallas(');
  const fin = html.indexOf('    const ORDEN_COMPONENTES', inicio);
  const primera = crearFirmaFalla({ unidad: '14107', componente: 'tolva1', sistema: 'FRENOS', item: 'ABS' });
  const segunda = crearFirmaFalla({ unidad: '14107', componente: 'tolva2', sistema: 'FRENOS', item: 'ABS' });
  const lecturas = [];
  let aviso = '';
  const crear = runInNewContext(`${html.slice(inicio, fin)}; crearOTDesdeFallas`, {
    state: { role: 'admin' }, db: {}, dashState: { ordenes: [] },
    obtenerOrdenes: async () => [], obtenerCoberturas: async () => new Map(), coberturaFallaReporte,
    ESTATUS_REALIZADA: new Set(), sinAcentos: (texto) => texto, firmasDeOrden: () => [],
    clavePosibleDuplicado, claveAgrupacionEquipo, firmasEquivalentesPosicion,
    crypto: { randomUUID: () => 'id-unico' },
    idCoberturaFalla: async (id, firma) => `${id}|${firma}`,
    doc: (db, coleccion, id) => ({ coleccion, id }),
    runTransaction: async (db, fn) => fn({
      get: async (ref) => {
        lecturas.push(ref.id);
        return { exists: () => ref.id === `r1|${primera}` };
      },
      set: () => assert.fail('No debe escribirse una OT sobre cobertura existente')
    }),
    cargarFallas: async () => {}, showToast: (texto) => { aviso = texto; }
  });
  await crear([{ unidad: '14107', firma: segunda, reportes: [{ reporte: { id: 'r1' }, falla: { firma: segunda } }] }]);
  assert.ok(lecturas.includes(`r1|${primera}`));
  assert.match(aviso, /ya fue asignada/);
});

test('cards group the same trailer across tractors and retain both position signatures', async () => {
  const html = readFileSync(new URL('../apptolva_bitacora/admin.html', import.meta.url), 'utf8');
  const inicio = html.indexOf('    async function cargarFallas() {');
  const fin = html.indexOf('    // CARGA DE ÓRDENES DE TRABAJO', inicio);
  assert.ok(inicio >= 0 && fin > inicio);
  const primera = crearFirmaFalla({ unidad: '14107', componente: 'tolva1', sistema: 'FRENOS', item: 'ABS' });
  const segunda = crearFirmaFalla({ unidad: '14107', componente: 'tolva2', sistema: 'FRENOS', item: 'ABS' });
  const tracto = crearFirmaFalla({ unidad: '14132', componente: 'tracto', sistema: 'FRENOS', item: 'ABS' });
  const falla = (firma, unidad, componenteKey, componente) => ({
    firma, unidad, componenteKey, componente, sistema: 'FRENOS', itemReportado: 'ABS', descripcion: 'ABS'
  });
  const reportes = [
    { id: 'r1', unitId: '14132', type: 'checklist', createdAt: '2026-11-10T12:00:00Z',
      fallas: [falla(primera, '14107', 'tolva1', '1ra TOLVA'), falla(tracto, '14132', 'tracto', 'TRACTOCAMIÓN')] },
    { id: 'r2', unitId: '14121', type: 'checklist', createdAt: '2026-11-11T12:00:00Z',
      fallas: [falla(segunda, '14107', 'tolva2', '2da TOLVA')] }
  ];
  const contenedor = { innerHTML: '', children: [], appendChild: function (elemento) { this.children.push(elemento); } };
  const tarjetas = [];
  const cargar = runInNewContext(`${html.slice(inicio, fin)}; cargarFallas`, {
    state: { reports: reportes }, dashState: {}, $: () => contenedor,
    obtenerOrdenes: async () => [], obtenerCoberturas: async () => new Map(),
    indiceOrdenesPanel: () => ({}), renderAlertasSeguridad: () => {},
    fallasFirmablesDeReporte: (reporte) => reporte.fallas, coincideEquipoFiltro: () => true,
    estadoFallaReporte: () => 'PENDIENTE', claveAgrupacionEquipo,
    ORDEN_COMPONENTES: { tracto: 0, tolva1: 1, tolva2: 3 },
    normalizarSistema: (valor) => valor.toLowerCase(),
    COMPONENTES: [{ key: 'tracto', nombre: 'Tracto' }, { key: 'tolva1', nombre: 'Tolva 1' }, { key: 'tolva2', nombre: 'Tolva 2' }],
    tarjetaUnidadHtml: (equipo) => { tarjetas.push(equipo); return ''; },
    enlazarTarjetaUnidad: () => {}, document: { createElement: () => ({}) }
  });
  await cargar();
  assert.equal(tarjetas.length, 2);
  const tolva = tarjetas.find((tarjeta) => tarjeta.unitId === '14107');
  assert.equal(tolva.tipoEquipo, 'Tolva');
  assert.equal(tolva.reciente.unitId, '14121');
  assert.equal(tolva.posicion, 'Tolva 2');
  assert.equal(tolva.grupos.length, 1);
  assert.equal(tolva.grupos[0].componenteKey, 'tolva2');
  assert.equal(tolva.grupos[0].componente, '2da TOLVA');
  assert.equal(tolva.grupos[0].reportes.length, 2);
  assert.deepEqual(Array.from(tolva.grupos[0].reportes, ({ falla }) => falla.firma).sort(), [primera, segunda].sort());
  assert.notEqual(primera, segunda);
});

test('unit filters match attached equipment but do not include unrelated equipment faults', () => {
  const html = readFileSync(new URL('../apptolva_bitacora/admin.html', import.meta.url), 'utf8');
  const filtroGlobal = html.slice(html.indexOf('    function coincideFiltroGlobal('), html.indexOf('    function formatDate('));
  const filtroEquipo = html.slice(html.indexOf('    function coincideEquipoFiltro('), html.indexOf('    const procesadosReportes'));
  const state = { appliedFilters: { unit: '14107', type: 'todos' } };
  const funciones = runInNewContext(`${filtroGlobal}\n${filtroEquipo}\n({ coincideFiltroGlobal, coincideEquipoFiltro })`, { state });
  const reporte = { type: 'checklist', unitId: '14132', payload: { tolva1: '14107', dolly: '14151' } };
  assert.equal(funciones.coincideFiltroGlobal(reporte, { unit: 'unitId', type: 'type' }), true);
  assert.equal(funciones.coincideEquipoFiltro(reporte, '14107'), true);
  assert.equal(funciones.coincideEquipoFiltro(reporte, '14151'), false);
  state.appliedFilters.unit = '14132';
  assert.equal(funciones.coincideEquipoFiltro(reporte, '14107'), true);
  assert.equal(funciones.coincideEquipoFiltro(reporte, '14151'), true);
});

test('security alerts use distinct reports, critical terms, seven-day bounds and open states', () => {
  const ahora = Date.parse('2026-11-13T12:00:00Z');
  const base = { equipoId: '14107', tipoEquipo: 'Tolva', fecha: new Date(ahora).toISOString(), estado: 'PENDIENTE', otAbierta: false };
  const incidencias = [
    { ...base, reporteId: 'r1', texto: 'Manivela' },
    { ...base, reporteId: 'r1', texto: 'Manivela' },
    { ...base, reporteId: 'r2', texto: 'Compuerta dura', fecha: new Date(ahora - 7 * 86400000).toISOString() },
    { ...base, equipoId: '14151', reporteId: 'r3', texto: 'Falta cable eléctrico', estado: 'ASIGNADA', otAbierta: true },
    { ...base, equipoId: '14152', reporteId: 'r4', texto: 'Cinturón roto', estado: 'ATENDIDA' },
    { ...base, equipoId: '14153', reporteId: 'r5', texto: 'Pasamanos roto', estado: 'DESCARTADA' },
    { ...base, equipoId: '14154', reporteId: 'r6', texto: 'Luces rotas', fecha: new Date(ahora - 7 * 86400000 - 1).toISOString() },
    { ...base, equipoId: '14155', reporteId: 'r7', texto: 'Perno rey con juego', fecha: new Date(ahora + 1).toISOString() },
    { ...base, equipoId: '14156', reporteId: 'r8', texto: 'Asiento roto', estado: 'ASIGNADA', otAbierta: false }
  ];
  const alertas = calcularAlertasSeguridad(incidencias, ahora);
  assert.deepEqual(alertas.map((alerta) => alerta.equipoId).sort(), ['14107', '14151']);
  assert.equal(alertas.find((alerta) => alerta.equipoId === '14107').reportes, 2);
  assert.deepEqual(alertas.find((alerta) => alerta.equipoId === '14151').riesgos, ['VIAL']);
  assert.equal(calcularAlertasSeguridad([{ ...base, reporteId: 'r1', texto: 'Manivela' }], ahora).length, 0);
  for (const texto of ['cinturón roto', 'pasamanos roto', 'luces roto', 'perno rey con juego']) {
    assert.equal(calcularAlertasSeguridad([{ ...base, reporteId: texto, texto }], ahora).length, 1);
  }
});

test('selecting a security alert filters its equipment without loading the old fault view', () => {
  const html = readFileSync(new URL('../apptolva_bitacora/admin.html', import.meta.url), 'utf8');
  const inicio = html.indexOf('    function renderAlertasSeguridad(');
  const fin = html.indexOf('    async function descartarFalla(', inicio);
  assert.ok(inicio >= 0 && fin > inicio);
  let seleccionar;
  const pasos = [];
  const elementos = {
    'alertas-seguridad-conteo': {},
    'alertas-seguridad-lista': {
      querySelectorAll: () => [{ dataset: { alerta: '0' }, addEventListener: (evento, fn) => { seleccionar = fn; } }]
    },
    unitFilter: {},
    applyFilters: { click: () => pasos.push('filtrar') }
  };
  const renderizar = runInNewContext(`${html.slice(inicio, fin)}; renderAlertasSeguridad`, {
    dashState: { ordenes: [] }, $: (id) => elementos[id],
    fallasFirmablesDeReporte: () => [{ unidad: '14107', componenteKey: 'tolva1', itemReportado: 'Cinturón roto', descripcion: 'Cinturón roto', firma: 'firma' }],
    coincideEquipoFiltro: () => true,
    detalleFallaReporte: () => ({ estado: 'PENDIENTE', ordenes: [] }),
    calcularAlertasSeguridad, escapeHtml: (valor) => valor,
    mostrarVistaMantenimiento: (id, cargar) => pasos.push(`${id}:${cargar}`)
  });
  renderizar([{ id: 'r1', createdAt: new Date().toISOString() }], new Map(), {});
  seleccionar();
  assert.equal(elementos.unitFilter.value, '14107');
  assert.deepEqual(pasos, ['vista-fallas:false', 'filtrar']);
});

test('dashboard keeps a repeated fault pending when a later report is not covered', () => {
  const html = readFileSync(new URL('../apptolva_bitacora/admin.html', import.meta.url), 'utf8');
  const inicio = html.indexOf('    function calcularMetricas() {');
  const fin = html.indexOf('    function calcularFallasRecurrentes(', inicio);
  assert.ok(inicio >= 0 && fin > inicio);
  const firmaTracto = crearFirmaFalla({ unidad: '14137', componente: 'tracto', sistema: 'FRENOS', item: 'ABS' });
  const reportes = [
    { id: 'antes', type: 'checklist', createdAt: '2026-11-10T12:00:00Z' },
    { id: 'despues', type: 'checklist', createdAt: '2026-11-13T12:00:00Z' }
  ];
  const indice = indiceOrdenesFalla(
    [{ reporte_id: 'antes', firmas: [firmaTracto], estatus: 'TERMINADA' }],
    (orden) => orden.firmas,
    () => true
  );
  const dashState = { coberturas: new Map() };
  const calcular = runInNewContext(`${html.slice(inicio, fin)}; calcularMetricas`, {
    state: { reports: reportes }, dashState, indiceOrdenesPanel: () => indice,
    fallasPorComponente: (report) => ({
      tracto: [{ categoria: 'FRENOS', item: 'ABS' }],
      dolly: report.id === 'antes' ? [{ categoria: 'FRENOS', item: 'ABS' }] : []
    }),
    numerosEconomicos: () => ({ tracto: '14137', dolly: '14150' }),
    COMPONENTES: [{ key: 'tracto' }, { key: 'dolly' }],
    categoriaKey: (categoria) => categoria,
    crearFirmaFalla, estadoFallaReporte, claveAgrupacionEquipo, coincideEquipoFiltro: () => true
  });
  let metricas = calcular();
  assert.equal(metricas.fallasNuevas, 2);
  assert.equal(metricas.celdas.reduce((total, celda) => total + celda.realizadas, 0), 0);
  dashState.coberturas.set(`despues|${firmaTracto}`, { estado: 'ATENDIDA' });
  metricas = calcular();
  assert.equal(metricas.fallasNuevas, 1);
  assert.equal(metricas.celdas.reduce((total, celda) => total + celda.realizadas, 0), 1);
  const firmaDolly = crearFirmaFalla({ unidad: '14150', componente: 'dolly', sistema: 'FRENOS', item: 'ABS' });
  dashState.coberturas.set(`antes|${firmaDolly}`, { estado: 'DESCARTADA' });
  metricas = calcular();
  assert.equal(metricas.fallasNuevas, 0);
  assert.equal(metricas.celdas.reduce((total, celda) => total + celda.reportadas, 0), 1);
});

test('differential synchronization replaces existing reports with server updates', async () => {
  const html = readFileSync(new URL('../apptolva_bitacora/admin.html', import.meta.url), 'utf8');
  const inicio = html.indexOf('    async function sincronizarReportesNuevos() {');
  const fin = html.indexOf('    function loginErrorMessage(', inicio);
  assert.ok(inicio >= 0 && fin > inicio);
  const createdAt = new Date().toISOString();
  const state = {
    user: {}, syncWatermark: createdAt, windowDays: 30, historyLoaded: false,
    allReports: [{ id: 'reporte', createdAt, folio: 'antes' }],
    reports: [], appliedFilters: { type: 'todos' }
  };
  let resultado;
  const sincronizar = runInNewContext(`let sincronizacionReportesActiva = false; ${html.slice(inicio, fin)}; sincronizarReportesNuevos`, {
    state, db: {}, firebaseConfig: { projectId: 'demo-apptolva' }, LIMITE_PAGINA_REPORTES: 250, LIMITE_VENTANA_REPORTES: 1500,
    collection: () => ({}), fsWhere: () => ({}), fsOrderBy: () => ({}),
    fsLimit: () => ({}), fsQuery: () => ({}),
    getDocsFromServer: async () => ({ docs: [{ id: 'reporte', createdAt, folio: 'actualizado' }], size: 1 }),
    convertirSnapshotReporte: (doc) => doc, coincideFiltroGlobal: () => true,
    resumenReportes: (reportes) => ({ total: reportes.length }),
    render: (data) => { resultado = data; }, cargarDashboard: async () => {},
    $: () => ({ classList: { contains: () => true } })
  });
  await sincronizar();
  assert.equal(state.allReports.length, 1);
  assert.equal(state.allReports[0].folio, 'actualizado');
  assert.equal(resultado.reports[0].folio, 'actualizado');
});

test('coverage document IDs are stable and scoped to the report', async () => {
  const firma = crearFirmaFalla({
    unidad: 'TRACTO-01',
    componente: 'TRACTO',
    sistema: 'MOTOR',
    item: 'Fuga de aceite'
  });

  assert.equal(await idCoberturaFalla('reporte-1', firma), idCobertura('reporte-1', firma));
  assert.equal(await idCoberturaFalla('reporte-1', firma), await idCoberturaFalla('reporte-1', firma));
  assert.notEqual(await idCoberturaFalla('reporte-1', firma), await idCoberturaFalla('reporte-2', firma));
});
