import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rmdir, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { abrirCredenciales, leerCatalogo, migrarCuenta } from '../migrar_operadores.js';

const operador = { numero: '221948', email: '221948@apptolva.com', nombre: 'Ejemplo', rol: 'master' };
const credencial = { uid: 'uid-prueba', password: 'contraseña-temporal-de-prueba' };

function entorno() {
  const users = new Map();
  const profiles = new Map();
  const notFound = () => Object.assign(new Error('No existe'), { code: 'auth/user-not-found' });
  const auth = {
    async getUser(uid) {
      if (!users.has(uid)) throw notFound();
      return users.get(uid);
    },
    async getUserByEmail(email) {
      const user = [...users.values()].find((item) => item.email === email);
      if (!user) throw notFound();
      return user;
    },
    async createUser(user) {
      users.set(user.uid, { ...user });
      return user;
    }
  };
  const db = {
    collection() {
      return {
        doc(email) {
          return {
            async get() {
              return { exists: profiles.has(email), data: () => profiles.get(email) };
            },
            async create(data) {
              if (profiles.has(email)) throw new Error('Documento existente');
              profiles.set(email, data);
            }
          };
        }
      };
    }
  };
  return { auth, db, users, profiles, operador, credencial, timestamp: () => 'timestamp' };
}

test('el catálogo conserva la cuenta operativa y el master confirmados', async () => {
  const catalogo = await leerCatalogo();
  assert.equal(catalogo.find((item) => item.numero === '221417').rol, 'operador');
  assert.deepEqual(catalogo.filter((item) => item.rol === 'master').map((item) => item.numero), ['221948']);
});

test('crea el perfil por correo y permite repetir sin sobrescribir', async () => {
  const ctx = entorno();
  assert.equal(await migrarCuenta(ctx), 'creado');
  assert.equal(ctx.profiles.get(operador.email).rol_evaluaciones, 'evaluador');
  assert.equal(await migrarCuenta(ctx), 'existente');
  assert.equal(ctx.users.size, 1);
});

test('reanuda si Auth se creó pero faltó el perfil', async () => {
  const ctx = entorno();
  ctx.users.set(credencial.uid, { uid: credencial.uid, email: operador.email });
  assert.equal(await migrarCuenta(ctx), 'reanudado');
  assert.equal(ctx.profiles.get(operador.email).uid, credencial.uid);
});

test('no reemplaza una cuenta o perfil preexistentes', async () => {
  const ctx = entorno();
  ctx.users.set('otro-uid', { uid: 'otro-uid', email: operador.email });
  assert.equal(await migrarCuenta(ctx), 'conflicto');
  assert.equal(ctx.profiles.size, 0);
  ctx.users.clear();
  ctx.profiles.set(operador.email, { rol: 'admin' });
  assert.equal(await migrarCuenta(ctx), 'conflicto');
  assert.equal(ctx.profiles.get(operador.email).rol, 'admin');
});

test('cifra y recupera las credenciales sin generar otras al reanudar', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'apptolva-migration-'));
  const filename = path.join(dir, 'credenciales.json');
  t.after(async () => { await unlink(filename); await rmdir(dir); });
  const key = 'frase larga solo para pruebas';
  const first = await abrirCredenciales(filename, 'demo-apptolva', [operador], key);
  const stored = await readFile(filename, 'utf8');
  assert.ok(!stored.includes(first.get(operador.numero).password));
  const second = await abrirCredenciales(filename, 'demo-apptolva', [operador], key);
  assert.deepEqual(second.get(operador.numero), first.get(operador.numero));
  await assert.rejects(abrirCredenciales(filename, 'demo-apptolva', [operador], 'otra frase suficientemente larga'));
  await assert.rejects(abrirCredenciales(filename, 'otro-proyecto', [operador], key));
});
