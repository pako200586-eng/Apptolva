import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const checklist = readFileSync(new URL('../apptolva_bitacora/index.html', import.meta.url), 'utf8');
const bitacora = readFileSync(new URL('../apptolva_bitacora/bitacora_master.html', import.meta.url), 'utf8');

function extract(source, start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert.ok(first !== -1 && last !== -1);
  return source.slice(first, last);
}

function environment() {
  const entries = new Map();
  const localStorage = {
    getItem: key => entries.has(key) ? entries.get(key) : null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: key => entries.delete(key)
  };
  const elements = Object.fromEntries(
    ['unitId', 'employeeNumber', 'driverName', 'origin', 'destination', 'kmInicio', 'mode']
      .map(id => [id, { value: id === 'mode' ? 'Sencillo' : '', classList: { add() {} } }])
  );
  const errors = [];
  const context = vm.createContext({
    localStorage,
    document: { getElementById: id => elements[id] },
    driverNameInput: elements.driverName,
    getSelectedCatalogOperator: () => true,
    actualizarNombreOperadorUI() {},
    console: { error: (...args) => errors.push(args) },
    alert: message => errors.push(message)
  });
  vm.runInContext(
    "const CHECKLIST_BITACORA_KEY = 'nom087_checklist_compartido';\n" +
    extract(checklist, '        function guardarDatosChecklistParaBitacora(', '        function limpiarEstadoChecklistPorCompleto(') +
    extract(bitacora, '        function sincronizarDesdeChecklist(', '        // Semáforo de vigencia'),
    context
  );
  return { context, localStorage, elements, errors };
}

const report = {
  unitId: '13817', employeeNumber: '221948', driverName: 'OPERADOR',
  origen: 'Planta', destino: 'Granja', km: '8', modalidad: 'full',
  firmaOp: 'firma', checklist: [{ estado: 'MAL' }]
};

test('el envío conserva solo los campos compartidos después de limpiar el borrador', () => {
  const { context, localStorage, elements } = environment();
  localStorage.setItem('bachoco_tolva_draft_v9', '{"inputs":{"revUnidad":"antigua"}}');
  context.guardarDatosChecklistParaBitacora(report);
  localStorage.removeItem('bachoco_tolva_draft_v9');
  const snapshot = JSON.parse(localStorage.getItem('nom087_checklist_compartido'));
  assert.equal(snapshot.firmaOp, undefined);
  assert.equal(snapshot.checklist, undefined);

  context.sincronizarDesdeChecklist();
  assert.equal(elements.unitId.value, '13817');
  assert.equal(elements.employeeNumber.value, '221948');
  assert.equal(elements.driverName.value, 'OPERADOR');
  assert.equal(elements.origin.value, 'Planta');
  assert.equal(elements.destination.value, 'Granja');
  assert.equal(elements.kmInicio.value, '8');
  assert.equal(elements.mode.value, 'Full');
  assert.equal(localStorage.getItem('nom087_unitId'), '13817');
  assert.equal(localStorage.getItem('nom087_checklist_compartido'), null);
});

test('no sobrescribe datos de una bitácora existente ni copia marcadores vacíos', () => {
  const { context, localStorage, elements } = environment();
  elements.unitId.value = 'OTRA';
  localStorage.setItem('nom087_mode', 'Torton');
  elements.mode.value = 'Torton';
  context.guardarDatosChecklistParaBitacora({ ...report, origen: '-', destino: '-', km: '-' });
  context.sincronizarDesdeChecklist();
  assert.equal(elements.unitId.value, 'OTRA');
  assert.equal(elements.mode.value, 'Torton');
  assert.equal(elements.origin.value, '');
  assert.equal(elements.destination.value, '');
  assert.equal(elements.kmInicio.value, '');
});

test('el borrador actual tiene prioridad y descarta la entrega anterior', () => {
  const { context, localStorage, elements } = environment();
  context.guardarDatosChecklistParaBitacora(report);
  localStorage.setItem('bachoco_tolva_draft_v9', JSON.stringify({
    inputs: { revUnidad: 'NUEVA' }, modalidad: 'sencillo'
  }));
  context.sincronizarDesdeChecklist();
  assert.equal(elements.unitId.value, 'NUEVA');
  assert.equal(elements.mode.value, 'Sencillo');
  assert.equal(localStorage.getItem('nom087_checklist_compartido'), null);
});

test('un fallo de almacenamiento se comunica y conserva la entrega para reintentar', () => {
  const { context, localStorage, elements, errors } = environment();
  context.guardarDatosChecklistParaBitacora(report);
  const setItem = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('cuota'); };
  context.sincronizarDesdeChecklist();
  assert.ok(localStorage.getItem('nom087_checklist_compartido'));
  assert.equal(elements.unitId.value, '');
  assert.equal(errors.length, 2);
  localStorage.setItem = setItem;
  context.sincronizarDesdeChecklist();
  assert.equal(localStorage.getItem('nom087_unitId'), '13817');
  assert.equal(localStorage.getItem('nom087_checklist_compartido'), null);
});

function entornoSincronizacionBitacora({
  setDocImpl = async () => {},
  getDocFromServerImpl = async () => ({ exists: () => false, get: () => undefined }),
  runTransactionImpl = null,
  folioInicial = 'OFF-1234ABCD',
  onLine = true
} = {}) {
  const entries = new Map();
  const localStorage = {
    getItem: (key) => (entries.has(key) ? entries.get(key) : null),
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key)
  };
  const elements = {
    folio: { value: folioInicial }
  };
  const estadosNube = [];
  const observados = [];
  const errores = [];
  let seq = 1000;
  let transacciones = 0;
  let uuidCounter = 0;

  const defaultRunTransaction = async (_db, callback) => {
    transacciones++;
    let valorActual = seq;
    const tx = {
      get: async () => ({ exists: () => true, data: () => ({ folio_bitacora: valorActual }) }),
      set: (_ref, data) => { seq = data.folio_bitacora; }
    };
    return callback(tx);
  };

  const context = vm.createContext({
    localStorage,
    navigator: { onLine },
    document: { getElementById: (id) => elements[id] || null },
    window: {
      location: { href: 'https://apptolva.test/bitacora_master.html' },
      CATALOGO_OPERADORES: { '221948': { nombre: 'MORALES REYES OMAR IGNACIO', depto: 'TRANSPORTES' } }
    },
    URL,
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}` },
    console: { error: (...args) => errores.push(args) },
    db: {},
    auth: { currentUser: { uid: 'uid-op-1' } },
    uidAutorizado: 'uid-op-1',
    doc: (_db, col, id) => ({ col, id }),
    serverTimestamp: () => ({ __serverTimestamp: true }),
    setDoc: (...args) => setDocImpl(...args),
    getDocFromServer: (...args) => getDocFromServerImpl(...args),
    runTransaction: (...args) => (runTransactionImpl || defaultRunTransaction)(...args),
    observadorFolio: { observar: (id, ref) => observados.push({ id, ref }) },
    setCloudStatus: (estado, detalle = '') => estadosNube.push({ estado, detalle }),
    esFolioProvisional: (f) => /^OFF-/.test(f || ''),
    nuevoFolioProvisional: () => 'OFF-ABCDEF12',
    obtenerDeviceId: () => 'device-test-1'
  });

  vm.runInContext(
    extract(bitacora, '        // Cola local de cierres de turno:', "        document.getElementById('reintentarCierres').addEventListener") +
    extract(bitacora, '            // Asigna el folio FB secuencial.', '            // Web Push NOM-087:'),
    context
  );

  return {
    context,
    localStorage,
    elements,
    estadosNube,
    observados,
    errores,
    getTransacciones: () => transacciones
  };
}

test('resolverFolioDefinitivo evita transacciones duplicadas con bloqueo en vuelo y libera tras error', async () => {
  let liberarTx;
  let txCount = 0;
  const env = entornoSincronizacionBitacora({
    runTransactionImpl: async (_db, callback) => {
      txCount++;
      await new Promise((resolve) => { liberarTx = resolve; });
      return callback({
        get: async () => ({ exists: () => true, data: () => ({ folio_bitacora: 1000 }) }),
        set: () => {}
      });
    }
  });

  const p1 = env.context.window.resolverFolioDefinitivo('OFF-AAAA1111');
  const p2 = env.context.window.resolverFolioDefinitivo('OFF-AAAA1111');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(txCount, 1);
  liberarTx();
  const [f1, f2] = await Promise.all([p1, p2]);
  assert.equal(f1, 'FB1001');
  assert.equal(f2, 'FB1001');
  assert.equal(env.localStorage.getItem('nom087_folio_map_OFF-AAAA1111'), 'FB1001');

  // Si falla la transacción, el bloqueo en vuelo se limpia y permite reintentar
  let intentos = 0;
  const envFallo = entornoSincronizacionBitacora({
    runTransactionImpl: async (_db, callback) => {
      intentos++;
      if (intentos === 1) throw new Error('red caída');
      return callback({
        get: async () => ({ exists: () => true, data: () => ({ folio_bitacora: 1005 }) }),
        set: () => {}
      });
    }
  });
  await assert.rejects(envFallo.context.window.resolverFolioDefinitivo('OFF-BBBB2222'), /red caída/);
  const recuperado = await envFallo.context.window.resolverFolioDefinitivo('OFF-BBBB2222');
  assert.equal(recuperado, 'FB1006');
  assert.equal(intentos, 2);
});

test('guardarBitacoraEnFirestore incluye synced_at ISO y actualiza el input #folio al resolver OFF-', async () => {
  const escritos = [];
  const env = entornoSincronizacionBitacora({
    folioInicial: 'OFF-1234ABCD',
    setDocImpl: async (ref, data, opts) => { escritos.push({ ref, data, opts }); }
  });

  const res = await env.context.window.guardarBitacoraEnFirestore({
    folio: 'OFF-1234ABCD',
    employeeNumber: '221948',
    unitId: '14120',
    license: 'LIC-1',
    shiftStartHour: 8,
    logs: []
  });

  assert.equal(res.status, 'synced');
  assert.equal(escritos.length, 1);
  assert.equal(typeof escritos[0].data.synced_at, 'string');
  assert.ok(escritos[0].data.synced_at.length <= 40);
  assert.equal(escritos[0].data.synced_at, escritos[0].data.updated_at);
  assert.equal(escritos[0].data.folio, 'FB1001');
  assert.equal(env.elements.folio.value, 'FB1001');
  assert.equal(env.localStorage.getItem('nom087_folio'), 'FB1001');
  assert.equal(env.observados.length, 1);
});

test('sincronizarCierresPendientes limpia cierre ya confirmado como turnoCerrado tras permission-denied y evita solapamientos', async () => {
  let llamadasSetDoc = 0;
  let liberarPrimera;
  const env = entornoSincronizacionBitacora({
    folioInicial: 'FB1050',
    setDocImpl: async () => {
      llamadasSetDoc++;
      await new Promise((resolve) => { liberarPrimera = resolve; });
      const err = new Error('Missing or insufficient permissions');
      err.code = 'permission-denied';
      throw err;
    },
    getDocFromServerImpl: async () => ({
      exists: () => true,
      get: (campo) => ({ owner_uid: 'uid-op-1', report_type: 'bitacora', turnoCerrado: true }[campo])
    })
  });

  const cierre = {
    id: 'cierre-1',
    payload: {
      folio: 'FB1050',
      employeeNumber: '221948',
      unitId: '14120',
      license: 'LIC-1',
      shiftStartHour: 8,
      turnoCerrado: true,
      logs: []
    }
  };
  env.localStorage.setItem('nom087_cierres_pendientes', JSON.stringify([cierre]));

  // Dos disparos simultáneos no deben ejecutar setDoc en paralelo para el mismo cierre
  const s1 = env.context.sincronizarCierresPendientes();
  const s2 = env.context.sincronizarCierresPendientes();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(llamadasSetDoc, 1);

  liberarPrimera();
  await Promise.all([s1, s2]);
  assert.deepEqual(JSON.parse(env.localStorage.getItem('nom087_cierres_pendientes')), []);
  assert.equal(env.estadosNube.at(-1).estado, 'synced');
});

test('sincronizarCierresPendientes conserva el cierre si permission-denied no corresponde a turnoCerrado confirmado', async () => {
  const env = entornoSincronizacionBitacora({
    folioInicial: 'FB1051',
    setDocImpl: async () => {
      const err = new Error('Missing or insufficient permissions');
      err.code = 'permission-denied';
      throw err;
    },
    getDocFromServerImpl: async () => ({
      exists: () => true,
      get: (campo) => ({ owner_uid: 'uid-op-1', report_type: 'bitacora', turnoCerrado: false }[campo])
    })
  });

  const cierre = {
    id: 'cierre-2',
    payload: {
      folio: 'FB1051',
      employeeNumber: '221948',
      unitId: '14120',
      license: 'LIC-1',
      shiftStartHour: 8,
      turnoCerrado: true,
      logs: []
    }
  };
  env.localStorage.setItem('nom087_cierres_pendientes', JSON.stringify([cierre]));

  await env.context.sincronizarCierresPendientes();
  assert.equal(JSON.parse(env.localStorage.getItem('nom087_cierres_pendientes')).length, 1);
  assert.equal(env.estadosNube.at(-1).estado, 'error');
});
