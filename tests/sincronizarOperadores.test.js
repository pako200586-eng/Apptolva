import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function preparar(consultar, projectId = 'apptolva-staging', storage = new Map()) {
  const source = readFileSync(new URL('../apptolva_bitacora/js/sincronizarOperadores.js', import.meta.url), 'utf8')
    .replace(/^import .*;\s*/m, '')
    .replace('export function iniciarSincronizacionOperadores', 'function iniciarSincronizacionOperadores');
  const listeners = {};
  const status = { textContent: '', hidden: true };
  const auth = { currentUser: null };
  let notificarAuth;
  const window = {
    CATALOGO_OPERADORES: { '1': { nombre: 'SEMILLA', depto: 'TRANSPORTES' } },
    dispatchEvent(event) { (listeners[event.type] || []).forEach(fn => fn(event)); },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); }
  };
  const context = vm.createContext({
    window, Event: class { constructor(type) { this.type = type; } },
    document: { getElementById: () => status },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    },
    onAuthStateChanged: (_auth, callback) => { notificarAuth = callback; },
    getFunctions: () => ({}), httpsCallable: () => consultar,
    console: { error() {} }
  });
  vm.runInContext(`${source}\nglobalThis.iniciar = iniciarSincronizacionOperadores;`, context);
  context.iniciar({ options: { projectId } }, auth);
  return {
    window, status, storage,
    cambiar(user) { auth.currentUser = user; notificarAuth(user); }
  };
}

test('sincroniza y conserva una copia por cuenta, sin perder la semilla', async () => {
  const env = preparar(async () => ({ data: { operadores: { '2': { nombre: 'NUEVO', depto: 'TRANSPORTES' } } } }));
  env.cambiar({ uid: 'a', isAnonymous: false });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.window.CATALOGO_OPERADORES['1'].nombre, 'SEMILLA');
  assert.equal(env.window.CATALOGO_OPERADORES['2'].nombre, 'NUEVO');
  assert.ok(env.storage.has('apptolva_operadores_apptolva-staging_a'));
  env.cambiar(null);
  assert.equal(env.window.CATALOGO_OPERADORES['2'], undefined);
});

test('producción no reutiliza la copia de staging y guarda su propio catálogo', async () => {
  const storage = new Map();
  const staging = preparar(async () => ({ data: { operadores: { '2': { nombre: 'STAGING', depto: 'TRANSPORTES' } } } }), 'apptolva-staging', storage);
  staging.cambiar({ uid: 'a', isAnonymous: false });
  await new Promise(resolve => setImmediate(resolve));
  const produccion = preparar(async () => ({ data: { operadores: { '3': { nombre: 'PRODUCCION', depto: 'TRANSPORTES' } } } }), 'gen-lang-client-0015118308', storage);
  produccion.cambiar({ uid: 'a', isAnonymous: false });
  assert.equal(produccion.window.CATALOGO_OPERADORES['2'], undefined);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(produccion.window.CATALOGO_OPERADORES['3'].nombre, 'PRODUCCION');
  assert.ok(storage.has('apptolva_operadores_apptolva-staging_a'));
  assert.ok(storage.has('apptolva_operadores_gen-lang-client-0015118308_a'));
});

test('ignora respuestas de otra sesión e informa si falla la sincronización', async () => {
  let responder;
  let calls = 0;
  const env = preparar(() => {
    if (++calls === 1) return new Promise(resolve => { responder = resolve; });
    return Promise.reject(new Error('sin conexión'));
  });
  env.cambiar({ uid: 'a', isAnonymous: false });
  env.cambiar({ uid: 'b', isAnonymous: false });
  responder({ data: { operadores: { '2': { nombre: 'ANTERIOR', depto: 'TRANSPORTES' } } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.window.CATALOGO_OPERADORES['2'], undefined);
  assert.match(env.status.textContent, /No se pudo actualizar/);
  assert.equal(env.storage.size, 0);
});
