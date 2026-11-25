import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../apptolva_bitacora/evaluacion_apptolva.html', import.meta.url), 'utf8');
const start = source.indexOf('  async function sincronizarImportadasAFirestore(');
const end = source.indexOf('  /* CONEXIÓN A LA NUBE', start);
assert.ok(start !== -1 && end !== -1);

function environment({ user = { uid: 'uid-1', email: 'EVALUADOR@example.test' }, existing = [], failures = [] } = {}) {
  const writes = new Map(existing.map(key => [key, { existente: true }]));
  const storage = new Map();
  const warnings = [];
  const input = { value: 'archivos' };
  let resolveAlert;
  const result = new Promise(resolve => { resolveAlert = resolve; });
  const context = vm.createContext({
    auth: { currentUser: user },
    db: {},
    doc: (_db, collection, id) => `${collection}/${id}`,
    getDoc: async ref => {
      if (failures.includes(ref)) throw new Error('sin permiso');
      return { exists: () => writes.has(ref) };
    },
    setDoc: async (ref, data) => { writes.set(ref, data); },
    STORAGE_KEY_EVALS: 'historial',
    obtenerHistorial: () => JSON.parse(storage.get('historial') || '[]'),
    localStorage: { setItem: (key, value) => storage.set(key, value) },
    actualizarTablaHistorial() {},
    cambiarPestana() {},
    window: { location: { search: '' } },
    URLSearchParams,
    document: { getElementById: () => input },
    alert: message => resolveAlert(message),
    console: { warn: (...args) => warnings.push(args), error: (...args) => warnings.push(args) },
    FileReader: class {
      readAsText(file) {
        setImmediate(() => this.onload({ target: { result: file.contents } }));
      }
    }
  });
  vm.runInContext(source.slice(start, end), context);
  return { context, writes, storage, warnings, input, result };
}

test('importa múltiples respaldos, conserva existentes y sube 14 evaluaciones', async () => {
  const env = environment({ existing: ['evaluaciones_conduccion/BACH-existente'] });
  const registros = Array.from({ length: 14 }, (_, index) => ({
    id: index === 13 ? 'DESC-14' : `BACH-${index}`,
    aspirante: `Operador ${index}`,
    tipoEvaluacion: index === 13 ? 'Descarga' : 'Conducción',
    score: index === 13 ? 120 : 85,
    apto: true,
    fullState: { datos: { nombre: `Operador ${index}` } }
  }));
  const files = [
    { contents: JSON.stringify([...registros.slice(0, 7), { id: 'BACH-existente', aspirante: 'Anterior' }]) },
    { contents: JSON.stringify(registros.slice(7)) }
  ];
  env.context.restaurarJSON({ target: { files } });
  const message = await env.result;

  assert.equal(env.writes.size, 15);
  assert.deepEqual(env.writes.get('evaluaciones_conduccion/BACH-existente'), { existente: true });
  const conduccion = env.writes.get('evaluaciones_conduccion/BACH-0');
  assert.equal(conduccion.creadoPor, 'uid-1');
  assert.equal(conduccion.score, 85);
  assert.equal(conduccion.fullState.datos.nombre, 'Operador 0');
  const descarga = env.writes.get('evaluaciones_descarga/DESC-14');
  assert.equal(descarga.operador, 'Operador 13');
  assert.equal(descarga.calificacion, 100);
  assert.equal(descarga.resultado, 'APTO (APROBADO)');
  assert.equal(descarga.evaluadorEmail, 'evaluador@example.test');
  assert.equal(JSON.parse(env.storage.get('historial')).length, 15);
  assert.match(message, /Subidas a Firestore: 14 \(ya existentes: 1, errores: 0\)/);
  assert.equal(env.input.value, '');
});

test('mantiene registros locales y reporta errores de Firestore', async () => {
  const env = environment({ failures: ['evaluaciones_conduccion/BACH-1'] });
  env.context.restaurarJSON({ target: { files: [{
    contents: JSON.stringify([{ id: 'BACH-1', aspirante: 'Operador' }])
  }] } });
  const message = await env.result;
  assert.equal(JSON.parse(env.storage.get('historial')).length, 1);
  assert.equal(env.writes.size, 0);
  assert.equal(env.warnings.length, 1);
  assert.match(message, /Subidas a Firestore: 0 \(ya existentes: 0, errores: 1\)/);
});
