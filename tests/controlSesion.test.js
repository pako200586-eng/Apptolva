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

test('el menú separa operación y supervisión sin cambiar los permisos de evaluaciones', () => {
  const normal = { isAnonymous: false };
  assert.deepEqual(permisosMenu(normal, { rol: 'operador' }),
    { operacion: true, panel: false, evaluaciones: false });
  assert.deepEqual(permisosMenu(normal, { rol: 'operador', rolEvaluaciones: 'evaluador' }),
    { operacion: true, panel: false, evaluaciones: true });
  assert.deepEqual(permisosMenu(normal, { rol: 'admin', rolEvaluaciones: 'admin' }),
    { operacion: false, panel: true, evaluaciones: true });
  assert.deepEqual(permisosMenu(normal, { rol: 'master', rolEvaluaciones: 'evaluador' }),
    { operacion: false, panel: true, evaluaciones: true });
  assert.deepEqual(permisosMenu(normal, { rol: 'lectura' }),
    { operacion: false, panel: true, evaluaciones: false });
  assert.deepEqual(permisosMenu({ ...normal, email: ' FRANK@APPTOLVA.COM ' }, { rol: 'master' }),
    { operacion: true, panel: true, evaluaciones: true });
  assert.deepEqual(permisosMenu({ ...normal, email: 'otra@apptolva.com' }, { rol: 'admin' }),
    { operacion: false, panel: true, evaluaciones: false });
  assert.deepEqual(permisosMenu({ isAnonymous: true }, null),
    { operacion: true, panel: false, evaluaciones: false });
  assert.deepEqual(permisosMenu(normal, null),
    { operacion: false, panel: false, evaluaciones: false });
});

test('el intervalo del historial cubre exactamente 48 horas hasta el instante actual', () => {
  const now = Date.parse('2026-11-11T18:00:00.000Z');
  assert.deepEqual(intervaloHistorial(now), {
    desde: '2026-11-09T18:00:00.000Z', hasta: '2026-11-11T18:00:00.000Z'
  });
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
