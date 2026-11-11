import test from 'node:test';
import assert from 'node:assert/strict';
import {
  borrarPerfil, borrarRespaldoReporte, guardarPerfil, guardarRespaldoReporte, hayTrabajoAnterior,
  intervaloHistorial, leerPerfil, listarRespaldosReportes, perfilValido, registrarEspacio,
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

test('el intervalo del historial cubre exactamente 48 horas hasta el instante actual', () => {
  const now = Date.parse('2026-11-11T18:00:00.000Z');
  assert.deepEqual(intervaloHistorial(now), {
    desde: '2026-11-09T18:00:00.000Z', hasta: '2026-11-11T18:00:00.000Z'
  });
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
