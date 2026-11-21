import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsearCsvSamsara,
  parsearCsvVelocidadSamsara,
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
  '221417': { nombre: 'AMBROSIO SOLIS FRANCISCO ALBERTO' },
  '231782': { nombre: 'VALENZUELA ALEJANDRO VICTOR' },
  '275225': { nombre: 'CHAGALA REYES VICTOR' },
  '257715': { nombre: 'LAGUNES BARRADAS JORGE' },
  '288150': { nombre: 'DE DIOS LAZARO CARLOS DAVID' },
  '297285': { nombre: 'TOLEDO SANTIAGO ALEJANDRO' },
  '234380': { nombre: 'HERNANDEZ CERDA RAFAEL' },
  '262185': { nombre: 'JUNCO GONZALEZ KENI DANIEL' }
};

test('empata nombres de Samsara aunque cambie el orden o falten acentos', () => {
  assert.equal(empatarOperadorPorNombre('REYES CABAÑAS ELVIRA', CATALOGO_PRUEBA), '228196');
  assert.equal(empatarOperadorPorNombre('VICTOR ALEJANDRO VALENZUELA', CATALOGO_PRUEBA), '231782');
});

test('parsearCsvSamsara y parsearCsvVelocidadSamsara (Data 25) filtran por rango y descuentan por km/h', () => {
  const csvAlertas = [
    'Total de eventos,42,,,,,',
    'Unidad,Fecha y hora,Operador,Tipo de alerta,Comentarios,Evidencia fotográfica,Revisión',
    '02 DE NOVIEMBRE 2026,,,,,,',
    'T14138,2 de nov. de 2026 04:37,WILMER RODRIGUEZ MARTINEZ,CONDUCCIÓN DISTRAÍDA,OK,#VALUE!,No Aplica',
    'T14138,4 de nov. de 2026 11:33,REYES CABAÑAS ELVIRA,CONDUCCIÓN DISTRAÍDA,OK,#VALUE!,Aplica'
  ].join('\n');

  const csvData25 = [
    'Fecha del Evento,Horario,Economico,Operador,Flota,Velocidad,Semana,Nombre Operador,,',
    '10/30/2026,10:36:40 a. m.,T14132,OP-82837 -,PA CHAPO,92,44,Wilmer Rodriguez Martinez,#VALUE!,',
    '11/04/2026,12:29:44 a. m.,T14132,OP-82837 -,PA CHAPO,96,45,MORALES SOTO JOSE LUIS,#VALUE!,',
    '11/05/2026,07:40:27 p. m.,T14132,OP-82837 -,PA CHAPO,88,45,,,',
    '12/30/1899,12:00:00 AM,,,,,,,,'
  ].join('\n');

  const alertas = parsearCsvSamsara(csvAlertas, CATALOGO_PRUEBA);
  const velocidad = parsearCsvVelocidadSamsara(csvData25, CATALOGO_PRUEBA, {
    fechaInicio: '2026-11-02',
    fechaFin: '2026-11-08'
  });

  assert.equal(alertas.aplican, 1);
  assert.equal(alertas.eventosAplicables[0].descuento, 6);
  assert.equal(velocidad.totalRegistros, 1); // Solo 11/04/2026 con nombre; excluye Sem 44, fila sin nombre y 1899
  assert.equal(velocidad.eventosVelocidad[0].noEmpleado, '272019');
  assert.equal(velocidad.eventosVelocidad[0].descuento, 7); // 96 km/h -> -7 pts
});

test('calcularRankingSemanal usa Top 5 + Últimos 3 en Full (>8) y Top 3 + Últimos 3 en Sencillo (<=8)', () => {
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
      '221417': 'full_48h',
      '231782': 'sencillo_24h',
      '275225': 'sencillo_24h',
      '257715': 'sencillo_24h',
      '288150': 'sencillo_24h',
      '297285': 'sencillo_24h',
      '234380': 'sencillo_24h',
      '262185': 'excluido'
    },
    eventosAplicables: [{ noEmpleado: '228196', descuento: 6 }],
    eventosVelocidad: [{ noEmpleado: '272019', cantidad: 1, descuento: 7 }],
    checklistsPorEmpleado: { '221417': 4, '275225': 5 },
    bitacorasPorEmpleado: { '221417': 2, '275225': 5 }
  });

  assert.equal(ranking.full.totalOperadores, 9);
  assert.equal(ranking.full.topLimit, 5);
  assert.equal(ranking.full.top5.length, 5);
  assert.equal(ranking.full.ultimos3.length, 3);
  assert.equal(ranking.full.top5[0].total, 100);

  assert.equal(ranking.sencillo.totalOperadores, 6);
  assert.equal(ranking.sencillo.topLimit, 3);
  assert.equal(ranking.sencillo.top5.length, 3);
  assert.equal(ranking.sencillo.ultimos3.length, 3);
});