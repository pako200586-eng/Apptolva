import test from 'node:test';
import assert from 'node:assert/strict';
import { crearFirmaFalla, crearFirmasFalla, idCoberturaFalla, separarSistemasFalla } from '../apptolva_bitacora/js/firmaFalla.js';
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
