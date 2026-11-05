import test from 'node:test';
import assert from 'node:assert/strict';
import { procesarAlertasPush } from '../netlify/functions/lib/push-nom087.js';

function crearDbFalsa(documentos) {
  const almacen = new Map(Object.entries(documentos));
  const ref = (id) => ({
    id,
    delete: async () => { almacen.delete(id); },
    update: async (cambios) => { almacen.set(id, { ...almacen.get(id), ...cambios }); }
  });
  return {
    almacen,
    collection: () => ({
      where: (campo, _op, valor) => ({
        get: async () => ({
          docs: [...almacen.entries()]
            .filter(([, d]) => d[campo] <= valor)
            .map(([id, d]) => ({ ref: ref(id), data: () => ({ ...d }) }))
        })
      })
    }),
    runTransaction: async (fn) => fn({
      get: async (r) => ({ exists: almacen.has(r.id), get: (c) => almacen.get(r.id)?.[c] }),
      update: (r, cambios) => r.update(cambios)
    })
  };
}

const ahora = 1_000_000_000_000;
const suscripcion = { endpoint: 'https://push.example.test/x', keys: { p256dh: 'p', auth: 'a' } };
const base = { subscription: suscripcion, sent_270: false, sent_300: false };

test('envía el aviso de 4 h 30 min una sola vez y conserva el documento', async () => {
  const db = crearDbFalsa({ a: { ...base, fire_at_270: ahora - 1000, fire_at_300: ahora + 1_800_000 } });
  const enviados = [];
  const enviar = async (_s, carga) => { enviados.push(carga.tag); assert.equal(carga.fireAt, ahora - 1000); };
  const r1 = await procesarAlertasPush({ db, enviar, ahora });
  const r2 = await procesarAlertasPush({ db, enviar, ahora: ahora + 1000 });
  assert.deepEqual(enviados, ['limite-4h30']);
  assert.equal(r1.enviadas, 1);
  assert.equal(r2.enviadas, 0);
  assert.equal(db.almacen.has('a'), true);
});

test('envía el aviso de 5 h y elimina el documento', async () => {
  const db = crearDbFalsa({ a: { ...base, sent_270: true, fire_at_270: ahora - 1_800_000, fire_at_300: ahora - 1000 } });
  const enviados = [];
  await procesarAlertasPush({ db, enviar: async (_s, c) => { enviados.push(c.tag); }, ahora });
  assert.deepEqual(enviados, ['limite-5h']);
  assert.equal(db.almacen.has('a'), false);
});

test('omite avisos atrasados más de 10 minutos', async () => {
  const db = crearDbFalsa({ a: { ...base, fire_at_270: ahora - 3_600_000, fire_at_300: ahora - 1_800_000 } });
  const enviados = [];
  const r = await procesarAlertasPush({ db, enviar: async () => { enviados.push(1); }, ahora });
  assert.equal(enviados.length, 0);
  assert.equal(r.omitidas, 2);
  assert.equal(db.almacen.has('a'), false);
});

test('elimina la suscripción cuando el servicio push responde 410', async () => {
  const db = crearDbFalsa({ a: { ...base, fire_at_270: ahora - 1000, fire_at_300: ahora + 1_800_000 } });
  const r = await procesarAlertasPush({
    db,
    enviar: async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }); },
    ahora
  });
  assert.equal(r.eliminadas, 1);
  assert.equal(db.almacen.has('a'), false);
});
