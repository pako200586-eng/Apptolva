import test from 'node:test';
import assert from 'node:assert/strict';
import { crearObservadorFolio } from '../apptolva_bitacora/js/observadorFolio.js';

test('observa una vez, espera el folio y se desuscribe al recibirlo', () => {
  const estados = [];
  let llamadas = 0;
  let cancelaciones = 0;
  let recibir;
  const observador = crearObservadorFolio({
    escuchar: (_ref, callback) => {
      llamadas++;
      recibir = callback;
      return () => { cancelaciones++; };
    },
    mostrar: (...args) => estados.push(args),
    informarError: assert.fail
  });
  observador.observar('uno', {});
  observador.observar('uno', {});
  recibir({ exists: () => true, data: () => ({}) });
  recibir({ exists: () => true, data: () => ({ folio_definitivo: 'NOM-000001' }) });
  observador.observar('uno', {});
  assert.equal(llamadas, 1);
  assert.equal(cancelaciones, 1);
  assert.deepEqual(estados, [['pendiente'], ['asignado', 'NOM-000001']]);
});

test('un cambio de turno cancela el listener anterior y no muestra su resultado', () => {
  const estados = [];
  const callbacks = [];
  let cancelaciones = 0;
  const observador = crearObservadorFolio({
    escuchar: (_ref, callback) => {
      callbacks.push(callback);
      return () => { cancelaciones++; };
    },
    mostrar: (...args) => estados.push(args),
    informarError: assert.fail
  });
  observador.observar('uno', {});
  observador.observar('dos', {});
  callbacks[0]({ exists: () => true, data: () => ({ folio_definitivo: 'ANTERIOR' }) });
  observador.detener();
  assert.equal(cancelaciones, 2);
  assert.deepEqual(estados, [['pendiente'], ['pendiente']]);
});

test('informa errores y permite reintentar', () => {
  const estados = [];
  let errores = 0;
  let fallo;
  let cancelaciones = 0;
  const observador = crearObservadorFolio({
    escuchar: (_ref, _callback, error) => {
      fallo = error;
      return () => { cancelaciones++; };
    },
    mostrar: (...args) => estados.push(args),
    informarError: () => { errores++; }
  });
  observador.observar('uno', {});
  fallo(new Error('sin permisos'));
  observador.observar('uno', {});
  assert.equal(errores, 1);
  assert.equal(cancelaciones, 1);
  assert.deepEqual(estados, [['pendiente'], ['error'], ['pendiente']]);
});
