import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  ZONA_HORARIA_MX,
  calcularDiasAbierta,
  clasificarCriticidadFalla,
  detectarChecklistsPosterioresLimpios,
  enriquecerUnidadesPendientes,
  esMismoDiaLocal,
  etiquetaAntiguedad,
  formatearFechaLocal,
  indexarAparicionesEquipos,
  resumenEngancheEquipo
} from '../apptolva_bitacora/js/pendientesFallas.js';
import { claveAgrupacionEquipo, crearFirmaFalla } from '../apptolva_bitacora/js/firmaFalla.js';
import { extraerFallasReporte } from '../netlify/functions/cerrar-fallas-repetidas.js';

test('local Mexico City dates avoid UTC rollover after 6:00 p.m.', () => {
  // 2026-11-28T01:30:00Z = 2026-11-27 19:30:00 America/Mexico_City
  const nocheMx = '2026-11-28T01:30:00Z';
  const mananaMx = '2026-11-27T15:00:00Z';
  const medianocheSiguienteMx = '2026-11-28T06:05:00Z'; // 2026-11-28 00:05 MX

  assert.equal(formatearFechaLocal(nocheMx, ZONA_HORARIA_MX), '27/11/2026');
  assert.equal(esMismoDiaLocal(nocheMx, mananaMx, ZONA_HORARIA_MX), true);
  assert.equal(esMismoDiaLocal(nocheMx, medianocheSiguienteMx, ZONA_HORARIA_MX), false);

  // 2026-11-22T02:00:00Z = 21/11/2026 20:00 MX -> 27/11/2026 19:30 MX = 6 días exactos
  assert.equal(calcularDiasAbierta('2026-11-22T02:00:00Z', nocheMx, ZONA_HORARIA_MX), 6);
  assert.equal(calcularDiasAbierta(mananaMx, nocheMx, ZONA_HORARIA_MX), 0);
  assert.equal(etiquetaAntiguedad(0), 'Abierta hoy');
  assert.equal(etiquetaAntiguedad(1), '1 día abierta');
  assert.equal(etiquetaAntiguedad(6), '6 días abierta');
});

test('separates report origin from current hookup using latest loaded checklist', () => {
  const reporteFalla = {
    id: 'r-22',
    folio: 'F-3100',
    unitId: '14132',
    driverName: 'Juan Pérez',
    createdAt: '2026-11-22T18:00:00Z', // 22/11/2026 12:00 MX
    payload: { unitId: '14132', tolva1: '14091', dolly: '14150', tolva2: '14096' }
  };
  const reporteHoy = {
    id: 'r-27',
    folio: 'F-3150',
    unitId: '14125',
    driverName: 'Carlos López',
    createdAt: '2026-11-28T01:30:00Z', // 27/11/2026 19:30 MX
    payload: { unitId: '14125', tolva1: '14096', dolly: '14151', tolva2: '14102' }
  };
  const obtenerEconomicos = (r) => ({
    tracto: r.payload?.unitId || r.unitId || 'S/N',
    tolva1: r.payload?.tolva1 || 'S/N',
    dolly: r.payload?.dolly || 'S/N',
    tolva2: r.payload?.tolva2 || 'S/N'
  });

  const indice = indexarAparicionesEquipos([reporteFalla, reporteHoy], obtenerEconomicos);
  const ahora = '2026-11-28T02:00:00Z'; // 27/11/2026 20:00 MX

  const engancheTolva = resumenEngancheEquipo({
    unitId: '14096',
    tipoEquipo: 'Tolva',
    posicion: 'Tolva 2',
    reciente: reporteFalla
  }, indice, { ahora });

  assert.equal(engancheTolva.cambioEnganche, true);
  assert.equal(engancheTolva.actual.esHoy, true);
  assert.match(engancheTolva.textoReportado, /Tracto 14132 \(Tolva 2\) · 22\/11\/2026 · Juan Pérez/);
  assert.match(engancheTolva.textoEngancheActual, /Hoy con Tracto 14125 \(Tolva 1\) · 27\/11\/2026/);

  const engancheTracto = resumenEngancheEquipo({
    unitId: '14125',
    tipoEquipo: 'Tracto',
    posicion: 'Tracto',
    reciente: reporteHoy
  }, indice, { ahora });

  assert.match(engancheTracto.textoReportado, /Tracto 14125 · 27\/11\/2026 · Carlos López/);
  assert.match(engancheTracto.textoEngancheActual, /Hoy con Tolva 1: 14096 · Dolly: 14151 · Tolva 2: 14102 · 27\/11\/2026/);
});

test('detects subsequent clean checklists for the same equipment and system without auto-clearing', () => {
  const r1 = { id: 'r1', createdAt: '2026-11-22T18:00:00Z', payload: { unitId: '14132', tolva2: '14096' }, fallas: [{ unidad: '14096', sistema: 'SISTEMA HIDRÁULICO' }] };
  const r2 = { id: 'r2', createdAt: '2026-11-25T18:00:00Z', payload: { unitId: '14132', tolva1: '14096' }, fallas: [{ unidad: '14096', sistema: 'ELÉCTRICO' }] };
  const r3 = { id: 'r3', createdAt: '2026-11-28T01:00:00Z', payload: { unitId: '14125', tolva1: '14096' }, fallas: [] };
  const indice = indexarAparicionesEquipos([r1, r2, r3], (r) => ({
    tracto: r.payload.unitId, tolva1: r.payload.tolva1 || 'S/N', dolly: 'S/N', tolva2: r.payload.tolva2 || 'S/N'
  }));

  const resultado = detectarChecklistsPosterioresLimpios({
    equipoId: '14096',
    sistema: 'SISTEMA HIDRÁULICO',
    fechaUltimaFalla: r1.createdAt,
    indiceApariciones: indice,
    obtenerFallasDeReporte: (r) => r.fallas
  });

  assert.equal(resultado.conteo, 2);
  assert.equal(resultado.fechaTexto, '27/11/2026');

  const sinLimpioPosterior = detectarChecklistsPosterioresLimpios({
    equipoId: '14096',
    sistema: 'SISTEMA HIDRÁULICO',
    fechaUltimaFalla: r3.createdAt,
    indiceApariciones: indice,
    obtenerFallasDeReporte: (r) => r.fallas
  });

  assert.equal(sinLimpioPosterior.conteo, 0);
  assert.equal(sinLimpioPosterior.fechaTexto, '');
});

test('normalizadorFallas splits distinct GENERAL notes while keeping original first signature and server parity', () => {
  const reporteCompuesto = {
    report_type: 'checklist',
    payload: {
      unitId: '14132',
      tolva2: '14096',
      observaciones: {
        tolva2: 'Motor de arrastre tira aceite, faldón derecho doblado'
      }
    }
  };
  const procesado = globalThis.procesarReporteFallas(reporteCompuesto);
  assert.equal(procesado.fallas.length, 2);
  assert.equal(procesado.fallas[0].sistema, 'GENERAL / REVISIÓN TALLER');
  assert.equal(procesado.fallas[0].itemReportado, 'Motor de arrastre tira aceite');
  assert.equal(procesado.fallas[1].sistema, 'GENERAL / REVISIÓN TALLER');
  assert.equal(procesado.fallas[1].itemReportado, 'faldón derecho doblado');

  const firmaOriginalPrimera = crearFirmaFalla({
    unidad: '14096',
    componente: 'tolva2',
    sistema: 'GENERAL / REVISIÓN TALLER',
    item: 'Motor de arrastre tira aceite'
  });
  const firmaSegunda = crearFirmaFalla({
    unidad: '14096',
    componente: 'tolva2',
    sistema: 'GENERAL / REVISIÓN TALLER',
    item: 'faldón derecho doblado'
  });

  const fallasServidor = extraerFallasReporte(reporteCompuesto);
  assert.deepEqual(fallasServidor.map((f) => f.firma), [firmaOriginalPrimera, firmaSegunda]);

  // Frases repetidas con palabras reordenadas en la misma observación siguen deduplicándose
  const reporteReordenado = {
    report_type: 'checklist',
    payload: {
      unitId: '14132',
      tolva2: '14096',
      observaciones: {
        tolva2: 'Motor de arrastre tira aceite, tira aceite el motor de arrastre'
      }
    }
  };
  assert.equal(globalThis.procesarReporteFallas(reporteReordenado).fallas.length, 1);
  assert.equal(extraerFallasReporte(reporteReordenado)[0].firma, firmaOriginalPrimera);
});

test('classifies criticality and sorts security and operational faults above cosmetic ones', () => {
  const frenos = clasificarCriticidadFalla({ sistema: 'FRENOS', textos: ['Fuga de aire en cámara'] });
  const hidraulico = clasificarCriticidadFalla({ sistema: 'GENERAL / REVISIÓN TALLER', textos: ['Motor de arrastre tira aceite'] });
  const estetico = clasificarCriticidadFalla({ sistema: 'GENERAL / REVISIÓN TALLER', textos: ['Faldón derecho doblado'] });
  const salpicadera = clasificarCriticidadFalla({ sistema: 'CARROCERÍA', textos: ['Salpicadera rayada'] });
  const parabrisas = clasificarCriticidadFalla({ sistema: 'CARROCERÍA', textos: ['Parabrisas estrellado'] });

  assert.equal(frenos.codigo, 'seguridad');
  assert.equal(parabrisas.codigo, 'seguridad');
  assert.equal(hidraulico.codigo, 'operativa');
  assert.equal(estetico.codigo, 'estetica');
  assert.equal(salpicadera.codigo, 'estetica');
  assert.ok(frenos.orden < hidraulico.orden && hidraulico.orden < estetico.orden);
});

test('admin.html pending cards render separate GENERAL checkboxes, hookups, clean checks, age and whitespace-nowrap', async () => {
  const html = readFileSync(new URL('../apptolva_bitacora/admin.html', import.meta.url), 'utf8');
  const inicioHelper = html.indexOf('    const ORDEN_COMPONENTES');
  const finTarjeta = html.indexOf('    async function mostrarDescartadas()', inicioHelper);
  const inicioPendientes = html.indexOf('    function fallasPendientesDeReportes(');
  const finPendientes = html.indexOf('    function renderAlertasSeguridad(', inicioPendientes);
  const inicioCargar = html.indexOf('    async function cargarFallas() {');
  const finCargar = html.indexOf('    // CARGA DE ÓRDENES DE TRABAJO', inicioCargar);
  assert.ok(inicioHelper >= 0 && finTarjeta > inicioHelper && inicioCargar >= 0 && finCargar > inicioCargar);

  const firmaAceite = crearFirmaFalla({
    unidad: '14096', componente: 'tolva2', sistema: 'GENERAL / REVISIÓN TALLER', item: 'Motor de arrastre tira aceite'
  });
  const firmaFaldon = crearFirmaFalla({
    unidad: '14096', componente: 'tolva2', sistema: 'GENERAL / REVISIÓN TALLER', item: 'Faldón derecho doblado'
  });

  const reporteFalla = {
    id: 'r-22', folio: 'F-3100', type: 'checklist', unitId: '14132', driverName: 'Juan Pérez',
    createdAt: '2026-11-22T18:00:00Z',
    payload: { unitId: '14132', tolva2: '14096' },
    fallas: [
      {
        firma: firmaFaldon, unidad: '14096', componenteKey: 'tolva2', componente: '2da TOLVA',
        sistema: 'GENERAL / REVISIÓN TALLER', itemReportado: 'Faldón derecho doblado',
        descripcion: 'Reportado en nota: "Faldón derecho doblado"', componenteKeyId: 'derecho doblado faldon'
      },
      {
        firma: firmaAceite, unidad: '14096', componenteKey: 'tolva2', componente: '2da TOLVA',
        sistema: 'GENERAL / REVISIÓN TALLER', itemReportado: 'Motor de arrastre tira aceite',
        descripcion: 'Reportado en nota: "Motor de arrastre tira aceite"', componenteKeyId: 'aceite arrastre motor tira'
      }
    ]
  };
  const reporteLimpioHoy = {
    id: 'r-27', folio: 'F-3150', type: 'checklist', unitId: '14125', driverName: 'Carlos López',
    createdAt: '2026-11-28T01:30:00Z',
    payload: { unitId: '14125', tolva1: '14096' },
    fallas: []
  };

  const renderizadas = [];
  const contenedor = { innerHTML: '', children: [], appendChild(el) { this.children.push(el); } };
  const escapeHtml = (v) => String(v ?? '');
  const numerosEconomicos = (r) => ({
    tracto: r.payload?.unitId || r.unitId || 'S/N',
    tolva1: r.payload?.tolva1 || 'S/N',
    dolly: r.payload?.dolly || 'S/N',
    tolva2: r.payload?.tolva2 || 'S/N'
  });
  const pendientesConReloj = {
    ...{
      formatearFechaLocal,
      enriquecerUnidadesPendientes: (unidades, opts) => enriquecerUnidadesPendientes(unidades, {
        ...opts,
        ahora: '2026-11-28T02:00:00Z'
      })
    }
  };

  const contexto = {
    state: { role: 'admin', reports: [reporteFalla], allReports: [reporteLimpioHoy, reporteFalla] },
    dashState: {},
    $: () => contenedor,
    obtenerOrdenes: async () => [],
    obtenerCoberturas: async () => new Map(),
    indiceOrdenesPanel: () => ({}),
    renderAlertasSeguridad: () => {},
    fallasFirmablesDeReporte: (r) => r.fallas || [],
    coincideEquipoFiltro: () => true,
    estadoFallaReporte: () => 'PENDIENTE',
    claveAgrupacionEquipo,
    numerosEconomicos,
    COMPONENTES: [
      { key: 'tracto', nombre: 'Tracto' },
      { key: 'tolva1', nombre: 'Tolva 1' },
      { key: 'dolly', nombre: 'Dolly' },
      { key: 'tolva2', nombre: 'Tolva 2' }
    ],
    escapeHtml,
    pendientesFallas: pendientesConReloj,
    enlazarTarjetaUnidad: (tarjeta, unidad) => renderizadas.push({ html: tarjeta.innerHTML, unidad }),
    document: { createElement: () => ({ innerHTML: '', className: '' }) }
  };

  const codigo = `${html.slice(inicioHelper, finTarjeta)}\n${html.slice(inicioPendientes, finPendientes)}\n${html.slice(inicioCargar, finCargar)}; cargarFallas`;
  // Override enlazarTarjetaUnidad after script definition so we capture rendered HTML + enriched unit
  const cargar = runInNewContext(`${codigo.replace('function enlazarTarjetaUnidad(', 'function _enlazarOriginal(')}; cargarFallas`, contexto);
  await cargar();

  assert.equal(renderizadas.length, 1);
  const { html: tarjetaHtml, unidad } = renderizadas[0];

  // Dos filas independientes dentro de GENERAL / REVISIÓN TALLER, ordenadas operativa antes que estética
  assert.equal(unidad.filas.length, 2);
  assert.equal(unidad.filas[0].grupos[0].item, 'Motor de arrastre tira aceite');
  assert.equal(unidad.filas[0].criticidad.codigo, 'operativa');
  assert.equal(unidad.filas[1].grupos[0].item, 'Faldón derecho doblado');
  assert.equal(unidad.filas[1].criticidad.codigo, 'estetica');

  // Dos checkboxes y dos botones de descartar independientes
  assert.equal((tarjetaHtml.match(/class="chk-falla/g) || []).length, 2);
  assert.equal((tarjetaHtml.match(/class="btn-descartar/g) || []).length, 2);

  // Origen del reporte vs enganche actual
  assert.match(tarjetaHtml, /Reportado con:<\/span> Tracto 14132 \(Tolva 2\) · 22\/11\/2026 · Juan Pérez/);
  assert.match(tarjetaHtml, /Enganche actual:<\/span> Hoy con Tracto 14125 \(Tolva 1\) · 27\/11\/2026/);

  // Antigüedad y check posterior limpio
  assert.match(tarjetaHtml, /5 días abierta/);
  assert.match(tarjetaHtml, /Posiblemente resuelta · 1 check limpio · último check limpio: 27\/11\/2026/);

  // Badge naranja de folios con whitespace-nowrap
  assert.match(tarjetaHtml, /whitespace-nowrap rounded bg-orange-100[^>]*>1 folio<\/span>/);
});
