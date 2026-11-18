import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../apptolva_bitacora/js/emergencias.js', import.meta.url), 'utf8')
  .replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];\s*/gm, '');
const emergencia = readFileSync(new URL('../apptolva_bitacora/emergencia.html', import.meta.url), 'utf8');
const payloadSource = emergencia.slice(emergencia.indexOf('function construirPayload()'), emergencia.indexOf('function textoFalla('));
const etiquetasContext = vm.createContext({ window: {} });
vm.runInContext(readFileSync(new URL('../apptolva_bitacora/js/etiquetasOT.js', import.meta.url), 'utf8'), etiquetasContext);
const etiquetasOT = etiquetasContext.window.etiquetasOT;

function entorno({ user = { uid: 'operador', email: 'op@example.test' }, foto = null, storage = {}, errorRespaldo = false } = {}) {
  const elementos = Object.fromEntries([
    'btnRegistrarEmergencia', 'fallaSaveStatus', 'fallaOperador', 'fallaUnidad', 'fallaDesc',
    'fallaTolva1', 'fallaDolly', 'fallaTolva2', 'fallaKm',
    'fallaFotoInput', 'fallaFotoPreview', 'fallaFotoLabel', 'fallaGpsStatus'
  ].map((id) => [id, { value: '', classList: { add() {} } }]));
  elementos.fallaUnidad.value = ' 13817 ';
  elementos.fallaDesc.value = 'Falla en ruta';
  const escritos = [];
  const respaldos = new Map();
  const callbacks = [];
  const avisos = [];
  let confirmar;
  let rechazar;
  const escritura = new Promise((resolve, reject) => { confirmar = resolve; rechazar = reject; });
  const auth = { currentUser: user };
  const window = {
    abrirWhatsappFalla: (payload) => avisos.push(payload),
    limpiarFotoEmergencia() {}
  };
  const context = vm.createContext({
    window, Blob, console: { error() {}, warn() {} }, document: { getElementById: (id) => elementos[id] },
    localStorage: { getItem: (key) => storage[key] || null }, sessionStorage: { getItem: () => null },
    getFirebaseConfig: () => ({ projectId: 'demo' }), initializeApp: () => ({}), getAuth: () => auth,
    initializeFirestore: () => ({}), persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}),
    onAuthStateChanged: (_, callback) => callback(user),
    collection: () => ({}), doc: (...args) => ({ id: args.length === 1 ? 'unico' : args[2] }),
    query: (_, ...filtros) => ({ filtros }), where: (...args) => args,
    onSnapshot: (ref, __, next, error) => { callbacks.push({ ref, next, error }); return () => {}; },
    setDoc: (_, data) => { escritos.push(data); return escritura; },
    validarEspacio() {}, leerPerfil: () => ({ nombre: 'Operador', rol: 'operador' }),
    listarRespaldosReportes: () => [...respaldos.values()],
    guardarRespaldoReporte: (_, __, ___, data) => {
      if (errorRespaldo) throw new Error('Sin espacio');
      respaldos.set(data.id, data);
    },
    borrarRespaldoReporte: (_, __, ___, data) => respaldos.delete(data.id)
  });
  context.foto = foto;
  vm.runInContext(`const MAX_EDAD_UBICACION_MS = 120000; let fallaUbicacion = { lat: 0, lng: 0, accuracy: 10, capturedAt: new Date().toISOString() }; let fallaFotoBase64 = foto; ${payloadSource}; window.construirPayload = construirPayload;`, context);
  vm.runInContext(source, context);
  return { window, elementos, escritos, respaldos, callbacks, avisos, confirmar, rechazar };
}

function instantanea(meta, id = 'unico') {
  return { docs: [{ id, exists: () => true, metadata: meta }] };
}

test('sin sesión no permite registrar', () => {
  const env = entorno({ user: null });
  assert.equal(env.elementos.btnRegistrarEmergencia.disabled, true);
  assert.match(env.elementos.fallaSaveStatus.textContent, /Inicia sesión/);
});

test('registra una sola foto y muestra pendiente hasta la confirmación real', async () => {
  const env = entorno({ foto: 'YWJj', storage: { nombreOperadorActual: ' Nombre guardado ' } });
  assert.equal(env.elementos.fallaOperador.value, ' Nombre guardado ');
  env.elementos.fallaOperador.value = '  operador editado ';
  env.elementos.fallaTolva1.value = ' t-1 ';
  env.elementos.fallaDolly.value = ' d-1 ';
  env.elementos.fallaTolva2.value = ' t-2 ';
  env.elementos.fallaKm.value = ' 123456 ';
  const registro = env.window.registrarEmergenciaEnSistema();
  assert.equal(env.avisos.length, 1);
  assert.equal(env.escritos.length, 1);
  assert.deepEqual(env.callbacks[0].ref.filtros.map((f) => [...f]), [
    ['owner_uid', '==', 'operador'], ['id', '==', 'unico']
  ]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(env.escritos.length, 1);
  assert.equal(env.escritos[0].payload.gps.lat, 0);
  assert.equal(env.escritos[0].payload.fotoBase64, 'YWJj');
  assert.equal(env.escritos[0].payload.fotos, undefined);
  assert.equal(env.escritos[0].driver_name, 'OPERADOR EDITADO');
  assert.equal(env.escritos[0].payload.tolva1, 'T-1');
  assert.equal(env.escritos[0].payload.dolly, 'D-1');
  assert.equal(env.escritos[0].payload.tolva2, 'T-2');
  assert.equal(env.escritos[0].payload.km, '123456');
  assert.equal(env.respaldos.get('unico').payload.km, '123456');
  assert.equal(env.respaldos.size, 1);
  env.callbacks[0].next(instantanea({ hasPendingWrites: true, fromCache: true }));
  await registro;
  assert.match(env.elementos.fallaSaveStatus.textContent, /pendiente/);
  assert.equal(env.elementos.fallaUnidad.value, '');
  assert.equal(env.elementos.fallaTolva1.value, '');
  assert.equal(env.elementos.fallaDolly.value, '');
  assert.equal(env.elementos.fallaTolva2.value, '');
  assert.equal(env.elementos.fallaKm.value, '');
  assert.equal(env.elementos.fallaOperador.value, '  operador editado ');
  env.callbacks[0].next(instantanea({ hasPendingWrites: false, fromCache: true }));
  assert.equal(env.respaldos.size, 1);
  env.confirmar();
  env.callbacks[0].next(instantanea({ hasPendingWrites: false, fromCache: false }));
  assert.equal(env.respaldos.size, 0);
  assert.match(env.elementos.fallaSaveStatus.textContent, /confirmada por el servidor/);
});

test('autocompleta desde las claves anteriores o el perfil vinculado', () => {
  assert.equal(entorno({ storage: { nom087_driverName: 'NOM' } }).elementos.fallaOperador.value, 'NOM');
  assert.equal(entorno({ storage: { driverName: 'DRIVER' } }).elementos.fallaOperador.value, 'DRIVER');
  assert.equal(entorno().elementos.fallaOperador.value, 'Operador');
});

test('rechaza kilometraje inválido sin crear respaldo ni escritura', async () => {
  const env = entorno();
  env.elementos.fallaKm.value = '-12';
  await env.window.registrarEmergenciaEnSistema();
  assert.equal(env.escritos.length, 0);
  assert.equal(env.respaldos.size, 0);
  assert.equal(env.avisos.length, 0);
  assert.match(env.elementos.fallaSaveStatus.textContent, /solo dígitos/);
});

test('una foto excesiva se rechaza antes de crear respaldo o escritura', async () => {
  const env = entorno({ foto: 'a'.repeat(600001) });
  await env.window.registrarEmergenciaEnSistema();
  assert.equal(env.escritos.length, 0);
  assert.equal(env.respaldos.size, 0);
  assert.match(env.elementos.fallaSaveStatus.textContent, /demasiado grande/);
});

test('rechazo del servidor conserva respaldo y evita un segundo registro', async () => {
  const env = entorno();
  const registro = env.window.registrarEmergenciaEnSistema();
  await new Promise((resolve) => setImmediate(resolve));
  env.rechazar(new Error('Permiso denegado'));
  await registro;
  assert.equal(env.respaldos.size, 1);
  assert.equal(env.avisos.length, 1);
  assert.equal(env.elementos.btnRegistrarEmergencia.disabled, true);
  assert.match(env.elementos.fallaSaveStatus.textContent, /Reintenta el respaldo/);
});

test('si falla el respaldo aún abre WhatsApp e informa el error de registro', async () => {
  const env = entorno({ errorRespaldo: true });
  await env.window.registrarEmergenciaEnSistema();
  assert.equal(env.avisos.length, 1);
  assert.equal(env.escritos.length, 0);
  assert.match(env.elementos.fallaSaveStatus.textContent, /Sin espacio/);
});

test('WhatsApp conserva contacto, mensaje y enlace alternativo si falla la apertura', () => {
  const elementos = {
    fallaContact: { value: '5211234567890' },
    fallaWhatsappEnlace: { classList: { remove: (name) => { elementos.fallaWhatsappEnlace.visible = name === 'hidden'; } } },
    fallaWhatsappInfo: { classList: { remove: (name) => { elementos.fallaWhatsappInfo.visible = name === 'hidden'; } } }
  };
  const context = vm.createContext({
    document: { getElementById: (id) => elementos[id] },
    window: { open: () => { throw new Error('Bloqueado'); } },
    console: { error() {} },
    encodeURIComponent
  });
  const inicio = emergencia.indexOf('function textoFalla(');
  const fin = emergencia.indexOf('iniciarCapturaFalla();', inicio);
  vm.runInContext(emergencia.slice(inicio, fin), context);
  context.abrirWhatsappFalla({ unidad: '13817', descripcion: 'Falla', gps: { lat: 0, lng: 0, accuracy: 125 } });
  const url = new URL(elementos.fallaWhatsappEnlace.href);
  assert.equal(url.pathname, '/5211234567890');
  assert.match(url.searchParams.get('text'), /Unidad: 13817/);
  assert.match(url.searchParams.get('text'), /q=0,0/);
  assert.match(url.searchParams.get('text'), /precisión estimada: 125 m/);
  assert.equal(elementos.fallaWhatsappEnlace.visible, true);
  assert.equal(elementos.fallaWhatsappInfo.visible, true);
  assert.doesNotMatch(emergencia, /TURNO A: J\.M\. Pérez|TURNO B: Salas/);
});

test('la ubicación muestra precisión, permite reintentar y descarta mediciones antiguas', () => {
  const status = { textContent: '' };
  const callbacks = [];
  const context = vm.createContext({
    document: { getElementById: () => status },
    navigator: { geolocation: { getCurrentPosition: (success, error, options) => callbacks.push({ success, error, options }) } },
    window: {}, console: { warn() {} }
  });
  const start = emergencia.indexOf('let fallaFotoBase64');
  const end = emergencia.indexOf('function comprimirImagen', start);
  vm.runInContext(emergencia.slice(start, end), context);
  context.iniciarCapturaFalla();
  assert.equal(callbacks[0].options.enableHighAccuracy, true);
  assert.equal(callbacks[0].options.maximumAge, 0);
  context.iniciarCapturaFalla();
  callbacks[0].success({ coords: { latitude: 1, longitude: 2, accuracy: 5 }, timestamp: Date.now() });
  assert.match(status.textContent, /Obteniendo/);
  callbacks[1].success({ coords: { latitude: 3, longitude: 4, accuracy: 950.2 }, timestamp: Date.now() });
  assert.match(status.textContent, /951 m/);
  assert.equal(vm.runInContext('fallaUbicacion.lat', context), 3);
  context.iniciarCapturaFalla();
  callbacks[2].success({ coords: { latitude: 1, longitude: 2, accuracy: 5 }, timestamp: Date.now() - 120001 });
  assert.equal(vm.runInContext('fallaUbicacion', context), null);
  assert.match(status.textContent, /antigua/);
  context.iniciarCapturaFalla();
  callbacks[3].error({ code: 1, message: 'denegado' });
  assert.match(status.textContent, /denegado/);
});

test('el reporte no envía ubicación caducada y conserva el aviso de emergencia', () => {
  const status = { textContent: '' };
  const input = { value: '' };
  const context = vm.createContext({
    document: { getElementById: (id) => id === 'fallaGpsStatus' ? status : input }
  });
  vm.runInContext(`const MAX_EDAD_UBICACION_MS = 120000; let fallaUbicacion = {
    lat: 1, lng: 2, accuracy: 10, capturedAt: new Date(Date.now() - 120001).toISOString()
  }; let fallaFotoBase64 = null; ${payloadSource}`, context);
  const payload = context.construirPayload();
  assert.equal(payload.gps, null);
  assert.match(status.textContent, /antigua/);
});

test('el visor genera PDFs distintos y conserva los datos de cada reporte', async () => {
  globalThis.self = globalThis;
  await import('../apptolva_bitacora/js/jspdf.min.js');
  const viewer = readFileSync(new URL('../apptolva_bitacora/viewer.html', import.meta.url), 'utf8');
  const checklist = readFileSync(new URL('../apptolva_bitacora/js/checklistPdf.js', import.meta.url), 'utf8');
  const script = viewer.slice(viewer.indexOf('        const OCHO_HORAS_MS'), viewer.lastIndexOf('    </script>'))
    .replace('        cargarBitacora();', '');
  const context = vm.createContext({
    jspdf: globalThis.jspdf, fetch: async () => ({ ok: false }),
    console, setTimeout, URLSearchParams
  });
  context.window = context;
  vm.runInContext(checklist, context);
  vm.runInContext(script, context);
  const foto = readFileSync(new URL('../apptolva_bitacora/img/logo-bachoco.jpg', import.meta.url)).toString('base64');
  const emergenciaData = context.normalizarReporte({
    report_type: 'emergencia', folio: 'EMG-123', unit_id: '14123', driver_name: 'OPERADOR PRUEBA',
    created_at: '2026-11-18T00:16:50.223Z',
    payload: { descripcion: 'Falla de frenos', km: '456', tolva1: '11',
      gps: { lat: 18.1, lng: -94.2, accuracy: 80, capturedAt: '2026-11-18T00:16:00.000Z' }, fotoBase64: foto }
  });
  const pdfEmergencia = await context.generarPDF(emergenciaData);
  const contenido = pdfEmergencia.output();
  assert.equal(pdfEmergencia._docTipo, 'emergencia');
  for (const texto of ['REPORTE DE FALLA / EMERGENCIA', 'EMG-123', 'OPERADOR PRUEBA', '14123', 'Falla de frenos', '18.100000', '456']) {
    assert.ok(contenido.includes(texto), `Falta ${texto} en el PDF`);
  }
  assert.match(contenido, /\/Subtype \/Image/);
  assert.doesNotMatch(contenido, /BITÁCORA DE HORAS DE SERVICIO/);

  const pdfChecklist = await context.generarPDF({
    reportType: 'checklist', folio: 'F-123', driverName: 'OPERADOR',
    checklistData: [{ id: 'tracto', titulo: 'TRACTO', categorias: [] }]
  });
  assert.equal(pdfChecklist._docTipo, 'checklist');
  assert.match(pdfChecklist.output(), /TRACTO/);
  const pdfBitacora = await context.generarPDF({ reportType: 'bitacora', folio: 'FB123', logs: [] });
  assert.equal(pdfBitacora._docTipo, 'bitacora');
  assert.match(pdfBitacora.output(), /NOM-087/);
  await assert.rejects(context.generarPDF({ reportType: 'desconocido' }), /tipo de reporte/);
});

test('el PDF de emergencia pagina descripciones largas y no inventa ubicación', async () => {
  globalThis.self = globalThis;
  await import('../apptolva_bitacora/js/jspdf.min.js');
  const viewer = readFileSync(new URL('../apptolva_bitacora/viewer.html', import.meta.url), 'utf8');
  const context = vm.createContext({ window: { jspdf: globalThis.jspdf }, console });
  const gps = viewer.slice(viewer.indexOf('        function formatGps('), viewer.indexOf('        function getActivityStatus('));
  const generator = viewer.slice(viewer.indexOf('        function generarPDFEmergencia('), viewer.indexOf('        async function generarPDF('));
  vm.runInContext(gps + generator, context);
  const pdf = context.generarPDFEmergencia({ folio: 'EMG-1', descripcion: 'WWWWWWWWW '.repeat(380), gps: null });
  assert.ok(pdf.getNumberOfPages() > 1);
  assert.match(pdf.output(), /No disponible/);
  assert.doesNotMatch(pdf.output(), /maps\.google\.com/);
});

const admin = readFileSync(new URL('../apptolva_bitacora/admin.html', import.meta.url), 'utf8');

function extract(start, end) {
  const first = admin.indexOf(start);
  const last = admin.indexOf(end, first);
  assert.ok(first >= 0 && last > first);
  return admin.slice(first, last);
}

test('la vista escapa texto, valida GPS y aplica filtros y permisos', () => {
  const elements = {
    'tabla-datos-emergencias': { innerHTML: '' },
    'estado-emergencias': { textContent: '' }
  };
  const context = vm.createContext({
    state: { role: 'admin', appliedFilters: { unit: '' } },
    $: (id) => elements[id],
    formatDate: () => 'fecha',
    escapeHtml: (v) => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'),
    coincideFiltroGlobal: (report) => report.unitId.includes(context.state.appliedFilters.unit)
  });
  vm.runInContext(`let emergencias = []; ${extract('    function renderTablaEmergencias()', '    function iniciarEscuchaEmergencias()')}`, context);
  context.reportes = [{
    id: 'id-1', folio: 'EMG-1', type: 'emergencia', unitId: '123', driverName: '<img src=x>',
    createdAt: '2026-01-01', payload: { descripcion: '<script>malicioso</script>', gps: { lat: 0, lng: 0 }, fotoBase64: 'YWJj' }
  }];
  vm.runInContext('emergencias = reportes; renderTablaEmergencias()', context);
  const html = elements['tabla-datos-emergencias'].innerHTML;
  assert.match(html, /maps\.google\.com\/\?q=0,0/);
  assert.match(html, /&lt;script&gt;malicioso&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /data:image\/jpeg;base64,YWJj/);
  assert.match(html, /Crear OT/);
  context.state.role = 'lectura';
  context.reportes[0].payload.gps.lat = 91;
  context.reportes[0].payload.fotoBase64 = '" onerror="alert(1)';
  vm.runInContext('renderTablaEmergencias()', context);
  assert.match(elements['tabla-datos-emergencias'].innerHTML, /Sin GPS/);
  assert.match(elements['tabla-datos-emergencias'].innerHTML, /Sin foto/);
  assert.doesNotMatch(elements['tabla-datos-emergencias'].innerHTML, /Crear OT|onerror/);
  context.state.appliedFilters.unit = '999';
  vm.runInContext('renderTablaEmergencias()', context);
  assert.match(elements['tabla-datos-emergencias'].innerHTML, /No hay emergencias/);
});

test('la OT de emergencia conserva candado y prioridad sin duplicar la foto', async () => {
  const env = entorno({ foto: 'YWJj' });
  env.elementos.fallaOperador.value = 'Operador';
  env.elementos.fallaUnidad.value = '123';
  env.elementos.fallaTolva1.value = 'T-1';
  env.elementos.fallaDolly.value = 'D-1';
  env.elementos.fallaTolva2.value = 'T-2';
  env.elementos.fallaKm.value = '123456';
  const registro = env.window.registrarEmergenciaEnSistema();
  await new Promise((resolve) => setImmediate(resolve));
  env.callbacks[0].next(instantanea({ hasPendingWrites: true, fromCache: true }));
  await registro;
  const stored = new Map();
  const lecturas = [];
  const alerts = [];
  let serial = 0;
  const context = vm.createContext({
    window: { etiquetasOT }, state: { role: 'admin', user: { email: 'admin@example.test' } },
    dashState: { ordenes: [] }, ESTATUS_REALIZADA: new Set(['TERMINADA', 'CERRADA']),
    sinAcentos: (v) => String(v || '').toUpperCase(),
    db: {}, crypto: { randomUUID: () => `uuid-${++serial}` },
    collection: (_, name) => name, fsQuery: (...args) => args, fsWhere: (...args) => args,
    getDocs: async () => ({ docs: [] }), doc: (_, collectionName, id) => `${collectionName}/${id}`,
    runTransaction: async (_, action) => action({
      get: async (ref) => {
        lecturas.push(ref);
        return { exists: () => stored.has(ref), id: ref.split('/')[1], data: () => stored.get(ref) };
      },
      set: (ref, data) => stored.set(ref, data)
    }),
    alert: (text) => alerts.push(text), showToast: (text) => alerts.push(text),
    escapeHtml: (text) => String(text), formatDate: () => 'fecha',
    renderDashboard() {}, enviarAlertaTelegram() {}, generarPDFOT: async () => {},
    cargarFallas() {}, mostrarVistaOrdenes() {}, abrirSeguimiento() {},
    normalizarFechaReporte: (d) => d.created_at, console: { error() {} }
  });
  vm.runInContext(extract('    function convertirSnapshotReporte(', '    function resumenReportes('), context);
  vm.runInContext(extract('    async function crearOTDesdeReporte(', '    function tarjetaFallaHtml('), context);
  const report = context.convertirSnapshotReporte({ id: env.escritos[0].id, data: () => env.escritos[0] });
  const fallas = [{ componente: 'TRACTOCAMIÓN', sistema: 'EMERGENCIA', descripcion: 'Falla' }];
  await context.crearOTDesdeReporte(report, fallas, []);
  const orden = [...stored.entries()].find(([key]) => key.startsWith('ordenes_trabajo/'))[1];
  assert.equal(orden.prioridad, 'maxima');
  assert.equal(orden.payload.fotoBase64, undefined);
  assert.equal(orden.folio_ot, 'EMG-unico');
  assert.equal(stored.get('ot_por_reporte/unico').folio_ot, 'EMG-unico');
  assert.equal(stored.has('sistema/contadores'), false);
  assert.equal(lecturas.includes('sistema/contadores'), false);
  const pdf = readFileSync(new URL('../apptolva_bitacora/js/generarPDF_OT.js', import.meta.url), 'utf8');
  const pdfContext = vm.createContext({ window: { etiquetasOT }, SUPERVISOR_DEFAULT: 'Supervisor' });
  vm.runInContext(pdf.slice(pdf.indexOf('  function texto('), pdf.indexOf('  function dibujarOT(')), pdfContext);
  const datos = pdfContext.construirDatosOT(orden);
  assert.equal(datos.folioOT, 'EMG-unico');
  assert.equal(datos.folioCheckList, 'N/A');
  assert.equal(datos.operador, 'OPERADOR');
  assert.equal(datos.tolva1, 'T-1');
  assert.equal(datos.dolly, 'D-1');
  assert.equal(datos.tolva2, 'T-2');
  assert.equal(datos.kilometraje, '123456');
  const antigua = pdfContext.construirDatosOT({ payload: { descripcion: 'Falla' } });
  assert.equal(antigua.tolva1, '');
  assert.equal(antigua.kilometraje, '');
  assert.equal(orden.reporte_id, 'unico');
  assert.equal(stored.get('ot_por_reporte/unico').ot_id, orden.id);
  await context.crearOTDesdeReporte(report, fallas, []);
  assert.equal([...stored.keys()].filter((key) => key.startsWith('ordenes_trabajo/')).length, 1);
  assert.ok(alerts.some((text) => /OT activa/.test(text)));

  const folioLargo = 'EMG-YBR2lc4uSpAjNYEGibVv';
  await context.crearOTDesdeReporte({ ...report, id: 'prefijo', type: 'checklist', folio: folioLargo }, fallas, []);
  const porPrefijo = [...stored.values()].find((item) => item.reporte_id === 'prefijo');
  assert.equal(porPrefijo.folio_ot, folioLargo);
  assert.equal(porPrefijo.prioridad, 'maxima');
  assert.equal(lecturas.includes('sistema/contadores'), false);

  await context.crearOTDesdeReporte({ ...report, id: 'sin-folio', folio: '', payload: {} }, fallas, []);
  assert.match(alerts.at(-1), /emergencia no tiene folio/);
  assert.equal(stored.has('ot_por_reporte/sin-folio'), false);

  await context.crearOTDesdeReporte({ ...report, id: 'tipo-directo', report_type: 'emergencia', type: 'checklist', folio: '999999' }, fallas, []);
  assert.equal(etiquetasOT.folioOrden([...stored.values()].find((item) => item.reporte_id === 'tipo-directo')), '999999');
  await context.crearOTDesdeReporte({ ...report, id: 'tipo-normalizado', report_type: 'checklist', type: 'emergencia', folio: '123456' }, fallas, []);
  assert.equal(etiquetasOT.folioOrden([...stored.values()].find((item) => item.reporte_id === 'tipo-normalizado')), '123456');
  assert.equal(lecturas.includes('sistema/contadores'), false);
  stored.set('sistema/contadores', { folio_ot_actual: 167, folio_ot: 169 });
  await context.crearOTDesdeReporte({ ...report, id: 'programado', type: 'checklist', folio: 'F-123' }, fallas, []);
  const programada = [...stored.values()].find((item) => item.reporte_id === 'programado');
  assert.equal(programada.folio_ot, 170);
  assert.equal(stored.get('sistema/contadores').folio_ot_actual, 170);
  assert.equal(etiquetasOT.folioOrden(programada), 'OT-170');
  assert.equal(pdfContext.construirDatosOT(programada).folioOT, 'OT-170');
});

test('reimprimir una OT de emergencia no consulta el reporte por la longitud del folio', async () => {
  const orden = { folio_ot: 'EMG-YBR2lc4uSpAjNYEGibVv', tipo_reporte: 'emergencia', reporte_id: 'reporte' };
  let impresa;
  const contexto = vm.createContext({
    window: { etiquetasOT, imprimirOT_Bachoco: async (datos) => { impresa = datos; } },
    state: { reports: [], allReports: [] }, showToast() {}, console,
    getDoc: () => { throw new Error('No debe consultar Firestore'); }
  });
  vm.runInContext(extract('    async function generarPDFOT(', '    function mostrarVistaOrdenes('), contexto);
  await contexto.generarPDFOT(orden);
  assert.equal(impresa.folio_ot, orden.folio_ot);
});

test('el PDF imprime completo el folio largo de emergencia dentro del encabezado', () => {
  const jsPDFContext = { exports: {}, module: {}, console, atob, btoa };
  jsPDFContext.module.exports = jsPDFContext.exports;
  jsPDFContext.global = jsPDFContext;
  vm.runInNewContext(readFileSync(new URL('../apptolva_bitacora/js/jspdf.min.js', import.meta.url), 'utf8'), jsPDFContext);
  const pdfContext = { window: { etiquetasOT } };
  const sourcePDF = readFileSync(new URL('../apptolva_bitacora/js/generarPDF_OT.js', import.meta.url), 'utf8')
    .replace('  window.CATALOGO_SISTEMAS_OT =', '  window.dibujarOT = dibujarOT; window.construirDatosOT = construirDatosOT;\n  window.CATALOGO_SISTEMAS_OT =');
  vm.runInNewContext(sourcePDF, pdfContext);
  const folio = 'EMG-YBR2lc4uSpAjNYEGibVv';
  const datos = pdfContext.window.construirDatosOT({ folio_ot: folio, tipo_reporte: 'emergencia' });
  const doc = new jsPDFContext.exports.jsPDF();
  const textoOriginal = doc.text.bind(doc);
  let ancho = null;
  doc.text = (texto, ...args) => {
    if (texto === folio) ancho = doc.getTextWidth(texto);
    return textoOriginal(texto, ...args);
  };
  pdfContext.window.dibujarOT(doc, datos, {});
  assert.ok(ancho !== null && ancho <= 161.4 - 113.6 - 1.6);
  assert.ok(doc.output().includes(`(${folio}) Tj`));
});

test('la escucha actualiza emergencias, respeta la sesión y cancela el listener anterior', () => {
  const callbacks = [];
  let cancelados = 0;
  let renders = 0;
  const estado = { textContent: '' };
  const context = vm.createContext({
    state: { user: { uid: 'admin-1' }, windowDays: 30 },
    LIMITE_VENTANA_REPORTES: 1500, db: {},
    $: () => estado, renderTablaEmergencias: () => { renders++; },
    collection: () => ({}), fsQuery: (...args) => args, fsWhere: (...args) => args,
    fsOrderBy: (...args) => args, fsLimit: (...args) => args,
    convertirSnapshotReporte: (doc) => ({ id: doc.id }),
    onSnapshot: (_, __, next, error) => {
      callbacks.push({ next, error });
      return () => { cancelados++; };
    },
    showToast() {}, console: { error() {} }
  });
  vm.runInContext(`let emergencias = []; let cancelarEmergencias = null; ${extract('    function iniciarEscuchaEmergencias()', "    $('tabla-datos-emergencias').addEventListener")}`, context);
  context.iniciarEscuchaEmergencias();
  callbacks[0].next({ metadata: { fromCache: false }, size: 1, docs: [{ id: 'primera' }] });
  assert.equal(vm.runInContext('emergencias[0].id', context), 'primera');
  assert.match(estado.textContent, /tiempo real/);
  context.iniciarEscuchaEmergencias();
  assert.equal(cancelados, 1);
  context.state.user = { uid: 'otra-sesion' };
  callbacks[1].next({ metadata: { fromCache: false }, size: 1, docs: [{ id: 'ajena' }] });
  assert.equal(vm.runInContext('emergencias.length', context), 0);
  callbacks[1].error(new Error('Sin conexión'));
  assert.match(estado.textContent, /Sin conexión/);
  assert.ok(renders >= 3);
});

test('la cola anterior conserva emergencias y sigue sincronizando bitácoras', async () => {
  const worker = readFileSync(new URL('../apptolva_bitacora/sw.js', import.meta.url), 'utf8');
  const start = worker.indexOf('async function enviarReportesPendientes()');
  const end = worker.indexOf('self.addEventListener("install"', start);
  assert.ok(start >= 0 && end > start);
  const peticiones = [];
  const eliminados = [];
  const context = vm.createContext({
    GAS_DOPOST_URL: 'https://example.test/legacy',
    getPendingReports: async () => [
      { id: 'emg', type: 'emergencia', payload: { descripcion: 'Falla' } },
      { id: 'bit', type: 'bitacora', payload: { folio: 'F1' } }
    ],
    fetch: async (url) => {
      peticiones.push(url);
      return { ok: true, text: async () => '{"success":true}' };
    },
    deletePendingReport: async (id) => eliminados.push(id),
    notifyClients: async () => {}
  });
  vm.runInContext(worker.slice(start, end), context);
  await context.enviarReportesPendientes();
  assert.deepEqual(peticiones, ['/api/store-bitacora']);
  assert.deepEqual(eliminados, ['bit']);
});
