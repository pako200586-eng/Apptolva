import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { abrirCredenciales, leerCatalogo, migrarCuenta, verificarCredenciales } from '../migrar_operadores.js';

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

test('genera frases únicas para operadores y conserva contraseña aleatoria para master', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'apptolva-migration-'));
  const filename = path.join(dir, 'credenciales.json');
  t.after(async () => { await unlink(filename); await rmdir(dir); });
  const key = 'frase larga solo para pruebas';
  const operadores = [
    { numero: '101', email: '101@apptolva.com', rol: 'operador' },
    { numero: '102', email: '102@apptolva.com', rol: 'operador' },
    operador
  ];
  const first = await abrirCredenciales(filename, 'demo-apptolva', operadores, key);
  const firstPassword = first.get('101').password;
  assert.match(firstPassword, /^(?:[a-z]+-){8}\d{4}$/);
  assert.match(first.get('102').password, /^(?:[a-z]+-){8}\d{4}$/);
  assert.notEqual(firstPassword, first.get('102').password);
  assert.match(first.get(operador.numero).password, /^[A-Za-z0-9_-]{32}$/);
  assert.ok(!(await readFile(filename, 'utf8')).includes(firstPassword));
  const second = await abrirCredenciales(filename, 'demo-apptolva', operadores, key);
  assert.deepEqual([...second], [...first]);
});

test('mantiene las contraseñas de un archivo cifrado creado antes del cambio', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'apptolva-migration-'));
  const filename = path.join(dir, 'credenciales.json');
  t.after(async () => { await unlink(filename); await rmdir(dir); });
  const key = 'frase larga solo para pruebas';
  const op = { numero: '101', email: '101@apptolva.com', rol: 'operador' };
  const anterior = { ...op, uid: 'uid-anterior', password: 'antigua-clave-aleatoria-segura' };
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', scryptSync(key, salt, 32), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify({ projectId: 'demo-apptolva', cuentas: [anterior] })), cipher.final()]);
  await writeFile(filename, JSON.stringify({
    version: 1, salt: salt.toString('base64'), iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64')
  }));
  const restored = await abrirCredenciales(filename, 'demo-apptolva', [op], key);
  assert.deepEqual(restored.get(op.numero), anterior);
});

test('verifica todas las cuentas antes de mostrar credenciales', async () => {
  const ctx = entorno();
  await migrarCuenta(ctx);
  const entry = { ...operador, ...credencial };
  const second = { numero: '123', email: '123@apptolva.com', rol: 'operador', uid: 'uid-segundo' };
  ctx.users.set(second.uid, { uid: second.uid, email: second.email });
  ctx.profiles.set(second.email, { uid: second.uid, numero_empleado: second.numero, rol: second.rol });
  await verificarCredenciales({ auth: ctx.auth, db: ctx.db, entries: [entry, second] });
  ctx.users.delete(second.uid);
  await assert.rejects(verificarCredenciales({ auth: ctx.auth, db: ctx.db, entries: [entry, second] }), /123.*no coincide/);
  await assert.rejects(verificarCredenciales({ auth: ctx.auth, db: ctx.db, entries: [] }), /No hay credenciales/);
  ctx.profiles.get(operador.email).rol = 'operador';
  await assert.rejects(verificarCredenciales({ auth: ctx.auth, db: ctx.db, entries: [entry] }), /no coincide/);
  ctx.profiles.get(operador.email).rol = 'master';
  ctx.users.get(credencial.uid).disabled = true;
  await assert.rejects(verificarCredenciales({ auth: ctx.auth, db: ctx.db, entries: [entry] }), /deshabilitado/);
});
