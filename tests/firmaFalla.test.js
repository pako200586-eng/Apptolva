import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { crearFirmaFalla, crearFirmasFalla, estadoFallaReporte, idCoberturaFalla, indiceOrdenesFalla, separarSistemasFalla } from '../apptolva_bitacora/js/firmaFalla.js';
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
    crearFirmaFalla, estadoFallaReporte
  });
  let metricas = calcular();
  assert.equal(metricas.fallasNuevas, 2);
  assert.equal(metricas.celdas.reduce((total, celda) => total + celda.realizadas, 0), 0);
  dashState.coberturas.set(`despues|${firmaTracto}`, { estado: 'ATENDIDA' });
  metricas = calcular();
  assert.equal(metricas.fallasNuevas, 1);
  assert.equal(metricas.celdas.reduce((total, celda) => total + celda.realizadas, 0), 1);
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
    state, db: {}, LIMITE_PAGINA_REPORTES: 250, LIMITE_VENTANA_REPORTES: 1500,
    collection: () => ({}), fsWhere: () => ({}), fsOrderBy: () => ({}),
    fsLimit: () => ({}), fsQuery: () => ({}),
    getDocsFromServer: async () => ({ docs: [{ id: 'reporte', createdAt, folio: 'actualizado' }], size: 1 }),
    convertirSnapshotReporte: (doc) => doc, coincideFiltroGlobal: () => true,
    resumenReportes: (reportes) => ({ total: reportes.length }),
    render: (data) => { resultado = data; },
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
