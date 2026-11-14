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
