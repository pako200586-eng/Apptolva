import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  borrarPerfil, borrarRespaldoReporte, guardarPerfil, guardarRespaldoReporte, hayTrabajoAnterior,
  intervaloHistorial, leerPerfil, listarRespaldosReportes, normalizarUsuarioAcceso, perfilValido, permisosMenu, puedeVerHistorial, registrarEspacio,
  validarEntrada, validarEspacio
} from '../apptolva_bitacora/js/controlSesion.js';

function storage() {
  const entries = new Map();
  return {
    get length() { return entries.size; },
    key(i) { return [...entries.keys()][i]; },
    getItem(key) { return entries.has(key) ? entries.get(key) : null; },
    setItem(key, value) { entries.set(key, String(value)); },
    removeItem(key) { entries.delete(key); }
  };
}

test('el menú muestra operación a los roles válidos y respeta los permisos de supervisión y evaluaciones', () => {
  const normal = { isAnonymous: false };
  assert.deepEqual(permisosMenu(normal, { rol: 'operador' }),
    { operacion: true, panel: false, evaluaciones: false });
  assert.deepEqual(permisosMenu(normal, { rol: 'operador', rolEvaluaciones: 'evaluador' }),
    { operacion: true, panel: false, evaluaciones: true });
  assert.deepEqual(permisosMenu(normal, { rol: 'admin', rolEvaluaciones: 'admin' }),
    { operacion: true, panel: true, evaluaciones: true });
  assert.deepEqual(permisosMenu(normal, { rol: 'master', rolEvaluaciones: 'evaluador' }),
    { operacion: true, panel: true, evaluaciones: true });
  assert.deepEqual(permisosMenu(normal, { rol: 'lectura' }),
    { operacion: true, panel: true, evaluaciones: false });
  assert.deepEqual(permisosMenu({ ...normal, email: ' FRANK@APPTOLVA.COM ' }, { rol: 'master' }),
    { operacion: true, panel: true, evaluaciones: false });
  assert.deepEqual(permisosMenu({ ...normal, email: ' OMAR_MASTER@APPTOLVA.COM ' }, { rol: 'master' }),
    { operacion: true, panel: true, evaluaciones: false });
  assert.deepEqual(permisosMenu({ ...normal, email: 'omar_master@otro.com' }, { rol: 'master' }),
    { operacion: true, panel: true, evaluaciones: false });
  assert.deepEqual(permisosMenu({ ...normal, email: 'otra@apptolva.com' }, { rol: 'admin' }),
    { operacion: true, panel: true, evaluaciones: false });
  assert.deepEqual(permisosMenu({ isAnonymous: true }, null),
    { operacion: true, panel: false, evaluaciones: false });
  assert.deepEqual(permisosMenu(normal, null),
    { operacion: false, panel: false, evaluaciones: false });
  assert.deepEqual(permisosMenu(normal, { rol: 'invalido', rolEvaluaciones: 'admin' }),
    { operacion: false, panel: false, evaluaciones: false });
});

test('el intervalo del historial cubre exactamente 48 horas hasta el instante actual', () => {
  const now = Date.parse('2026-11-11T18:00:00.000Z');
  assert.deepEqual(intervaloHistorial(now), {
    desde: '2026-11-09T18:00:00.000Z', hasta: '2026-11-11T18:00:00.000Z'
  });
});

test('el historial consulta solo al propietario y distingue un índice faltante', async () => {
  const html = readFileSync(new URL('../apptolva_bitacora/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('            async function cargarHistorial()');
  const end = html.indexOf('            function mostrarRespaldos()', start);
  assert.ok(start >= 0 && end > start);
  const elements = {
    'historial-estado': { textContent: '' },
    'historial-lista': { replaceChildren() {}, append() {} }
  };
  let constraints;
  const context = vm.createContext({
    document: { getElementById: (id) => elements[id] },
    usuarioActivo: { uid: 'operador' }, perfilActivo: { rol: 'operador' },
    puedeVerHistorial, intervaloHistorial, db: {},
    collection: () => ({}), where: (...args) => args, orderBy: (...args) => args,
    query: (_, ...args) => { constraints = args; return {}; },
    getDocs: async () => { const error = new Error('Índice'); error.code = 'failed-precondition'; throw error; },
    console: { error() {} }
  });
  vm.runInContext(html.slice(start, end), context);
  await context.cargarHistorial();
  assert.deepEqual([...constraints[0]], ['owner_uid', '==', 'operador']);
  assert.deepEqual([...constraints[3]], ['created_at', 'desc']);
  assert.match(elements['historial-estado'].textContent, /índice de Firestore/);
});

test('solo cuentas autenticadas con rol operador pueden ver su historial', () => {
  const user = { isAnonymous: false };
  assert.equal(puedeVerHistorial(user, { rol: 'operador' }), true);
  assert.equal(puedeVerHistorial(user, { rol: 'admin' }), false);
  assert.equal(puedeVerHistorial(user, { rol: 'master' }), false);
  assert.equal(puedeVerHistorial(user, { rol: 'lectura' }), false);
  assert.equal(puedeVerHistorial({ isAnonymous: true }, { rol: 'operador' }), false);
  assert.equal(puedeVerHistorial(user, null), false);
});

test('el perfil offline queda vinculado al usuario y proyecto', () => {
  const s = storage();
  const profile = perfilValido({ rol: 'operador', nombre: 'Operador' });
  guardarPerfil(s, 'staging', 'uid-a', profile);
  assert.deepEqual(leerPerfil(s, 'staging', 'uid-a'), profile);
  assert.equal(leerPerfil(s, 'produccion', 'uid-a'), null);
  assert.equal(leerPerfil(s, 'staging', 'uid-b'), null);
  borrarPerfil(s);
  assert.equal(leerPerfil(s, 'staging', 'uid-a'), null);
  assert.equal(perfilValido({ rol: 'desconocido', nombre: 'Operador' }), null);
  assert.equal(perfilValido({ rol: 'admin' }, 'admin@example.test').rol, 'admin');
});

test('no mezcla datos de otro usuario o de una sesión anterior', () => {
  const s = storage();
  const user = { uid: 'uid-a', email: 'a@example.test' };
  registrarEspacio(s, 'staging', user);
  validarEntrada(s, 'staging', 'a@example.test');
  validarEspacio(s, 'staging', user);
  assert.throws(() => validarEntrada(s, 'staging', 'b@example.test'));
  assert.throws(() => validarEspacio(s, 'staging', { uid: 'uid-b' }));
  assert.throws(() => validarEspacio(s, 'produccion', user));
  const anterior = storage();
  anterior.setItem('nom087_logs', '[{"status":3}]');
  assert.equal(hayTrabajoAnterior(anterior), true);
  assert.throws(() => validarEntrada(anterior, 'staging', 'a@example.test'));
});

test('el acceso acepta número de empleado o correo sin perder el aislamiento local', () => {
  assert.equal(normalizarUsuarioAcceso(' 221417 '), '221417@apptolva.com');
  assert.equal(normalizarUsuarioAcceso(' Mantenimiento@Ejemplo.com '), 'mantenimiento@ejemplo.com');
  assert.throws(() => normalizarUsuarioAcceso('  '), /número de empleado o correo/);
  const s = storage();
  registrarEspacio(s, 'staging', { uid: 'uid-a', email: '221417@apptolva.com' });
  validarEntrada(s, 'staging', normalizarUsuarioAcceso('221417'));
  validarEntrada(s, 'staging', normalizarUsuarioAcceso('221417@apptolva.com'));
  assert.throws(() => validarEntrada(s, 'staging', normalizarUsuarioAcceso('221418')));
});

test('el formulario valida y autentica con el mismo correo normalizado', async () => {
  const html = readFileSync(new URL('../apptolva_bitacora/index.html', import.meta.url), 'utf8');
  const start = html.indexOf("            form.addEventListener('submit',");
  const end = html.indexOf("            document.getElementById('legacy-submit')", start);
  assert.ok(start !== -1 && end !== -1);
  const s = storage();
  registrarEspacio(s, 'staging', { uid: 'uid-a', email: '221417@apptolva.com' });
  const elements = {
    'login-email': { value: ' 221417 ' },
    'login-password': { value: 'clave' },
    'login-submit': { disabled: false }
  };
  const calls = [];
  let submit;
  const context = vm.createContext({
    form: { addEventListener: (_event, handler) => { submit = handler; } },
    document: { getElementById: id => elements[id] },
    errorElement: { classList: { add() {} } },
    normalizarUsuarioAcceso, validarEntrada, localStorage: s, projectId: 'staging',
    esperarEscrituras: async () => {},
    signInWithEmailAndPassword: async (_auth, email, password) => calls.push([email, password]),
    auth: {}, mostrarError: message => calls.push(message), console: { error() {} }
  });
  vm.runInContext(html.slice(start, end), context);
  await submit({ preventDefault() {} });
  assert.deepEqual(calls, [['221417@apptolva.com', 'clave']]);
  assert.equal(elements['login-password'].value, '');

  elements['login-email'].value = '221417@apptolva.com';
  elements['login-password'].value = 'clave';
  await submit({ preventDefault() {} });
  assert.deepEqual(calls[1], ['221417@apptolva.com', 'clave']);

  elements['login-email'].value = '221418';
  elements['login-password'].value = 'otra';
  await submit({ preventDefault() {} });
  assert.equal(calls.length, 3);
  assert.match(calls[2], /otra cuenta/);
});

test('respalda reportes completos por cuenta y solo borra la versión confirmada', () => {
  const s = storage();
  const report = { id: 'uno', owner_uid: 'uid-a', created_at: 'fecha', payload: { firma: 'firma' } };
  guardarRespaldoReporte(s, 'staging', 'uid-a', report);
  assert.deepEqual(listarRespaldosReportes(s, 'staging', 'uid-a'), [report]);
  assert.deepEqual(listarRespaldosReportes(s, 'staging', 'uid-b'), []);
  assert.deepEqual(listarRespaldosReportes(s, 'produccion', 'uid-a'), []);
  assert.equal(hayTrabajoAnterior(s), true);
  assert.throws(() => guardarRespaldoReporte(s, 'staging', 'uid-b', report));
  assert.throws(() => guardarRespaldoReporte(s, 'staging', 'uid-a', { ...report, payload: {} }));
  borrarRespaldoReporte(s, 'staging', 'uid-a', { ...report, payload: {} });
  assert.equal(listarRespaldosReportes(s, 'staging', 'uid-a').length, 1);
  borrarRespaldoReporte(s, 'staging', 'uid-a', report);
  assert.equal(listarRespaldosReportes(s, 'staging', 'uid-a').length, 0);
});

test('no oculta un respaldo ilegible ni ignora fallos de almacenamiento', () => {
  const s = storage();
  s.setItem('apptolva_pending_firestore_backup_roto', '{');
  assert.throws(() => listarRespaldosReportes(s, 'staging', 'uid-a'), /dañado/);
  s.setItem = () => { throw new Error('cuota'); };
  assert.throws(() => guardarRespaldoReporte(s, 'staging', 'uid-a', { id: 'x', owner_uid: 'uid-a' }), /cuota/);
});

test('observarSincronizacionReporte omite escritura redundante de synced_at si nunca estuvo pendiente', async () => {
  const html = readFileSync(new URL('../apptolva_bitacora/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('            const observersByReportId = new Map();');
  const end = html.indexOf('            window.reservarFolioCloud = async function()', start);
  assert.ok(start >= 0 && end > start);

  const setDocCalls = [];
  const events = [];
  const listeners = [];
  const context = vm.createContext({
    usuarioActivo: { uid: 'op-1', isAnonymous: false },
    db: {},
    doc: (...args) => args,
    collection: (...args) => args,
    where: (...args) => args,
    query: (...args) => args,
    onSnapshot: (_q, _opts, onNext) => {
      listeners.push(onNext);
      return () => {};
    },
    setDoc: async (ref, data, opts) => { setDocCalls.push({ ref, data, opts }); },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    window: { dispatchEvent: (event) => events.push(event) }
  });
  vm.runInContext(html.slice(start, end), context);

  // Caso 1: confirmación directa en línea (sin hasPendingWrites) -> no hace setDoc redundante
  context.observarSincronizacionReporte('rep-online');
  listeners[0]({
    metadata: { hasPendingWrites: false, fromCache: false },
    docs: [{ id: 'rep-online', exists: () => true }]
  });
  assert.equal(setDocCalls.length, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'firestore-report-synced');
  assert.equal(events[0].detail.id, 'rep-online');

  // Caso 2: reporte pasó por cola offline (hasPendingWrites: true -> false) -> refresca synced_at
  let pendingCount = 0;
  context.observarSincronizacionReporte('rep-offline', () => { pendingCount++; });
  listeners[1]({
    metadata: { hasPendingWrites: true, fromCache: true },
    docs: [{ id: 'rep-offline', exists: () => true }]
  });
  assert.equal(pendingCount, 1);
  assert.equal(setDocCalls.length, 0);
  listeners[1]({
    metadata: { hasPendingWrites: false, fromCache: false },
    docs: [{ id: 'rep-offline', exists: () => true }]
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(setDocCalls.length, 1);
  assert.equal(setDocCalls[0].opts.merge, true);
  assert.equal(typeof setDocCalls[0].data.synced_at, 'string');
  assert.equal(events.length, 2);
  assert.equal(events[1].detail.id, 'rep-offline');
});

test('sincronizarCatalogo exige sesión activa y respeta el TTL de 6 horas', async () => {
  const html = readFileSync(new URL('../apptolva_bitacora/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('        async function sincronizarCatalogo(forzar = false) {');
  const end = html.indexOf('\n        poblarListas();', start);
  assert.ok(start >= 0 && end > start);

  assert.match(html, /const TTL_SYNC_CATALOGO_MS = 6 \* 60 \* 60 \* 1000;/);
  assert.doesNotMatch(html, /\n\s*sincronizarCatalogo\(\);\s*\n/);

  const s = storage();
  let lecturasCloud = 0;
  let poblarCalls = 0;
  let vigenteActual = { equipos: [], origen: 'base', sincronizado_at: null };
  const windowObj = {
    apptolvaAccesoActivo: false,
    leerCatalogoEquiposCloud: async () => {
      lecturasCloud++;
      return [{ economico: '14137', tipo: 'tracto', activo: true }];
    }
  };
  const context = vm.createContext({
    CLAVE_CACHE: 'apptolva_catalogo_equipos_v1',
    TTL_SYNC_CATALOGO_MS: 6 * 60 * 60 * 1000,
    sincronizandoCatalogo: false,
    window: windowObj,
    localStorage: s,
    catalogoVigente: () => vigenteActual,
    validarCatalogo: () => [],
    poblarListas: () => { poblarCalls++; },
    console: { warn() {} }
  });
  vm.runInContext(html.slice(start, end), context);

  // Antes de auth -> no consulta Firestore
  await context.sincronizarCatalogo(false);
  assert.equal(lecturasCloud, 0);

  // Con auth y caché vigente (< 6h) -> omite consulta
  windowObj.apptolvaAccesoActivo = true;
  vigenteActual = { equipos: [{ economico: '14137' }], origen: 'sincronizado', sincronizado_at: new Date().toISOString() };
  await context.sincronizarCatalogo(false);
  assert.equal(lecturasCloud, 0);

  // Con caché vencida (> 6h) -> sincroniza y guarda en localStorage
  vigenteActual = {
    equipos: [{ economico: '14137' }],
    origen: 'sincronizado',
    sincronizado_at: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString()
  };
  await context.sincronizarCatalogo(false);
  assert.equal(lecturasCloud, 1);
  assert.equal(poblarCalls, 1);
  assert.ok(s.getItem('apptolva_catalogo_equipos_v1'));
});

test('evaluacion_apptolva.html acota sus onSnapshot con limit() y libera listeners al cambiar sesión', () => {
  const html = readFileSync(new URL('../apptolva_bitacora/evaluacion_apptolva.html', import.meta.url), 'utf8');
  const start = html.indexOf('  const LIMITE_HISTORIAL_EVALUACIONES = 300;');
  const end = html.indexOf('  onAuthStateChanged(auth, user => {', start);
  assert.ok(start >= 0 && end > start);

  const queries = [];
  let unsubsCalled = 0;
  const context = vm.createContext({
    db: {},
    STORAGE_KEY_CONDUCCION_CACHE: 'c1',
    STORAGE_KEY_DESCARGA_CACHE: 'c2',
    adminAuthError: { textContent: '' },
    document: { getElementById: () => null },
    localStorage: storage(),
    collection: (_db, name) => ({ collection: name }),
    orderBy: (field, dir) => ({ orderBy: [field, dir] }),
    limit: (n) => ({ limit: n }),
    query: (...parts) => parts,
    onSnapshot: (q) => {
      queries.push(q);
      return () => { unsubsCalled++; };
    },
    combinarYActualizarHistorial: () => {},
    nombreVisibleMaster: () => 'Master',
    console: { error() {} }
  });
  vm.runInContext(html.slice(start, end), context);

  context.startHistorySync('uid-1');
  assert.equal(queries.length, 2);
  assert.deepEqual(queries[0], [
    { collection: 'evaluaciones_conduccion' },
    { orderBy: ['timestamp', 'desc'] },
    { limit: 300 }
  ]);
  assert.deepEqual(queries[1], [
    { collection: 'evaluaciones_descarga' },
    { orderBy: ['timestamp', 'desc'] },
    { limit: 300 }
  ]);

  // Mismo uid -> no duplica listeners
  context.startHistorySync('uid-1');
  assert.equal(queries.length, 2);
  assert.equal(unsubsCalled, 0);

  // Cambio de usuario -> cancela los 2 anteriores y suscribe 2 nuevos
  context.startHistorySync('uid-2');
  assert.equal(unsubsCalled, 2);
  assert.equal(queries.length, 4);

  // Cierre de sesión -> libera los 2 activos
  context.stopHistorySync();
  assert.equal(unsubsCalled, 4);
});
