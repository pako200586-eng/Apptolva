import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsearCsvSamsara,
  calcularRankingSemanal,
  empatarOperadorPorNombre
} from '../apptolva_bitacora/js/rankingOperadores.js';

const CATALOGO_PRUEBA = {
  '228196': { nombre: 'CABAÑAS ELVIRA REYES' },
  '272019': { nombre: 'MORALES SOTO JOSE LUIS' },
  '272022': { nombre: 'HERNANDEZ TORRES HIPOLITO' },
  '227210': { nombre: 'RODRIGUEZ MARTINEZ WILMER' },
  '236019': { nombre: 'FAJARDO RUEDA ISMAEL' },
  '268953': { nombre: 'JIMENEZ FUENTES ERNESTO' },
  '262354': { nombre: 'GUTIERREZ REYES RODRIGO' },
  '221416': { nombre: 'SALAS DOMINGUEZ JOSE CARLOS' },
  '231782': { nombre: 'VALENZUELA ALEJANDRO VICTOR' },
  '262185': { nombre: 'JUNCO GONZALEZ KENI DANIEL' }
};

test('empata nombres de Samsara aunque cambie el orden o falten acentos', () => {
  assert.equal(empatarOperadorPorNombre('REYES CABAÑAS ELVIRA', CATALOGO_PRUEBA), '228196');
  assert.equal(empatarOperadorPorNombre('VICTOR ALEJANDRO VALENZUELA', CATALOGO_PRUEBA), '231782');
});

test('parsearCsvSamsara ignora resumen/fechas y solo penaliza Revisión = Aplica', () => {
  const csv = [
    'Total de eventos,42,,,,,',
    'Aplican,1,,,,,',
    'No aplican,41,,,,,',
    'Unidad,Fecha y hora,Operador,Tipo de alerta,Comentarios,Evidencia fotográfica,Revisión',
    '02 DE NOVIEMBRE 2026,,,,,,',
    'T14138,2 de nov. de 2026 04:37,WILMER RODRIGUEZ MARTINEZ,CONDUCCIÓN DISTRAÍDA,OK,#VALUE!,No Aplica',
    'T14138,4 de nov. de 2026 11:33,REYES CABAÑAS ELVIRA,CONDUCCIÓN DISTRAÍDA,OK,#VALUE!,Aplica',
    'T14132,5 de nov. de 2026 06:29,HIPOLITO HERNANDEZ TORRES,USO DE MÓVIL,MANO,#VALUE!,'
  ].join('\n');

  const res = parsearCsvSamsara(csv, CATALOGO_PRUEBA);
  assert.equal(res.totalEventos, 3);
  assert.equal(res.aplican, 1);
  assert.equal(res.noAplican, 1);
  assert.equal(res.sinRevisar, 1);
  assert.equal(res.eventosAplicables[0].noEmpleado, '228196');
  assert.equal(res.eventosAplicables[0].descuento, 10);
});

test('calcularRankingSemanal respeta regla 48h vs 24h, separa Sencillo y excluye staff', () => {
  const ranking = calcularRankingSemanal({
    catalogoOperadores: CATALOGO_PRUEBA,
    esquemasPorEmpleado: {
      '228196': 'full_48h',
      '272019': 'full_48h',
      '272022': 'full_48h',
      '227210': 'full_24h',
      '236019': 'full_48h',
      '268953': 'full_48h',
      '262354': 'full_48h',
      '221416': 'full_48h',
      '231782': 'sencillo_24h'
    },
    excluidos: { '262185': true }, // Staff / taller
    eventosAplicables: [{ noEmpleado: '228196', descuento: 10 }],
    checklistsPorEmpleado: {
      '272019': 4, // 48h: meta 4 checklists -> 25/25; meta 2 bitácoras -> 35/35
      '228196': 4, // -10 samsara -> 90/100
      '227210': 5, // 24h: meta 5 checklists -> 25/25; meta 5 bitácoras -> 35/35
      '231782': 5  // sencillo 24h -> categoría propia
    },
    bitacorasPorEmpleado: {
      '272019': 2,
      '228196': 2,
      '227210': 5,
      '231782': 5
    }
  });

  assert.equal(ranking.full.totalOperadores, 8);
  assert.equal(ranking.full.top5.length, 5);
  assert.equal(ranking.full.ultimos3.length, 3);
  assert.equal(ranking.sencillo.totalOperadores, 1);
  assert.equal(ranking.sencillo.top5[0].total, 100);
});