import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const REPO = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.join(REPO, 'apptolva_bitacora', 'js', 'catalogoOperadores.js');
const MASTERS = new Set(['221948']);

export async function leerCatalogo() {
  const source = await readFile(CATALOG, 'utf8');
  const context = {};
  vm.runInNewContext(`${source}\nglobalThis.catalogo = CATALOGO_OPERADORES;`, context, { timeout: 1000 });
  const entries = Object.entries(context.catalogo);
  const declaredNumbers = [...source.matchAll(/^\s*["'](\d+)["']\s*:/gm)].map((match) => match[1]);
  if (declaredNumbers.length !== entries.length || new Set(declaredNumbers).size !== declaredNumbers.length) {
    throw new Error('El catálogo contiene números duplicados o entradas que no se pudieron validar.');
  }
  if (!entries.length || entries.some(([numero, data]) =>
    !/^\d+$/.test(numero) || typeof data?.nombre !== 'string' || !data.nombre.trim())) {
    throw new Error('El catálogo de operadores está vacío o contiene registros inválidos.');
  }
  for (const numero of MASTERS) {
    if (!Object.hasOwn(context.catalogo, numero)) throw new Error(`Master fuera del catálogo: ${numero}.`);
  }
  return entries.map(([numero, data]) => ({
    numero,
    nombre: data.nombre.trim(),
    email: `${numero}@apptolva.com`,
    rol: MASTERS.has(numero) ? 'master' : 'operador'
  }));
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function validateJournalPath(filename) {
  const resolvedRepo = await realpath(REPO);
  const parent = await realpath(path.dirname(path.resolve(filename)));
  if (isWithin(resolvedRepo, parent)) throw new Error('El archivo de credenciales debe estar fuera del repositorio.');
  const target = path.join(parent, path.basename(filename));
  try {
    if ((await lstat(target)).isSymbolicLink()) throw new Error('El archivo de credenciales no puede ser un enlace simbólico.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return target;
}

function cifrar(journal, key) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', scryptSync(key, salt, 32), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(journal), 'utf8'), cipher.final()]);
  return JSON.stringify({
    version: 1, salt: salt.toString('base64'), iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64')
  });
}

function descifrar(contents, key) {
  const envelope = JSON.parse(contents);
  if (envelope.version !== 1) throw new Error('Versión de credenciales no compatible.');
  const decipher = createDecipheriv('aes-256-gcm',
    scryptSync(key, Buffer.from(envelope.salt, 'base64'), 32), Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()
  ]).toString('utf8'));
}

export async function abrirCredenciales(filename, projectId, operadores, key, createIfMissing = true) {
  if (typeof key !== 'string' || key.length < 16) {
    throw new Error('Define APPTOLVA_MIGRATION_KEY con una frase secreta de al menos 16 caracteres.');
  }
  const journalPath = await validateJournalPath(filename);
  let journal;
  try {
    journal = descifrar(await readFile(journalPath, 'utf8'), key);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!createIfMissing) throw new Error('No existe el archivo de credenciales.');
    journal = {
      projectId,
      cuentas: operadores.map(({ numero, email, rol }) => ({
        numero, email, rol, uid: randomUUID(), password: randomBytes(24).toString('base64url')
      }))
    };
    const handle = await open(journalPath, 'wx', 0o600);
    try {
      await handle.writeFile(cifrar(journal, key), 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  if (journal.projectId !== projectId || !Array.isArray(journal.cuentas) ||
      journal.cuentas.length !== operadores.length) {
    throw new Error('El archivo de credenciales no corresponde al proyecto o al catálogo.');
  }
  const byNumero = new Map(journal.cuentas.map((entry) => [entry.numero, entry]));
  if (byNumero.size !== operadores.length || new Set(journal.cuentas.map((entry) => entry.uid)).size !== operadores.length ||
      new Set(journal.cuentas.map((entry) => entry.password)).size !== operadores.length ||
      operadores.some(({ numero, email, rol }) => {
        const entry = byNumero.get(numero);
        return !entry || entry.email !== email || entry.rol !== rol ||
          typeof entry.uid !== 'string' || !entry.uid ||
          typeof entry.password !== 'string' || entry.password.length < 20;
      })) {
    throw new Error('El archivo de credenciales no coincide con el catálogo o contiene datos inválidos.');
  }
  return byNumero;
}

async function buscarUsuario(auth, method, value) {
  try {
    return await auth[method](value);
  } catch (error) {
    if (error.code === 'auth/user-not-found') return null;
    throw error;
  }
}

export async function migrarCuenta({ auth, db, operador, credencial, timestamp }) {
  const ref = db.collection('usuarios').doc(operador.email);
  const profile = await ref.get();
  const existingByUid = await buscarUsuario(auth, 'getUser', credencial.uid);
  const existingByEmail = await buscarUsuario(auth, 'getUserByEmail', operador.email);

  if (existingByEmail && existingByEmail.uid !== credencial.uid) return 'conflicto';
  if (existingByUid && existingByUid.email?.toLowerCase() !== operador.email) return 'conflicto';
  if (profile.exists) {
    const data = profile.data();
    return existingByUid && data.uid === credencial.uid && data.numero_empleado === operador.numero &&
      data.rol === operador.rol && (operador.rol !== 'master' || data.rol_evaluaciones === 'evaluador')
      ? 'existente' : 'conflicto';
  }
  if (!existingByUid) {
    await auth.createUser({
      uid: credencial.uid,
      email: operador.email,
      password: credencial.password,
      displayName: operador.nombre
    });
  }
  await ref.create({
    uid: credencial.uid,
    numero_empleado: operador.numero,
    nombre: operador.nombre,
    rol: operador.rol,
    ...(operador.rol === 'master' ? { rol_evaluaciones: 'evaluador' } : {}),
    creado_en: timestamp()
  });
  return existingByUid ? 'reanudado' : 'creado';
}

async function main(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--apply') options.apply = true;
    else if (['--project', '--credentials-file', '--confirm', '--show-credential'].includes(key) && args[i + 1]) options[key] = args[++i];
    else throw new Error(`Argumento no reconocido o incompleto: ${key}`);
  }
  const projectId = options['--project'];
  if (!projectId || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
    throw new Error('Indica un ID de proyecto explícito con --project.');
  }
  const operadores = await leerCatalogo();
  if (options['--show-credential']) {
    if (options.apply || !options['--credentials-file']) {
      throw new Error('Para mostrar una credencial indica --credentials-file, sin --apply.');
    }
    const credentials = await abrirCredenciales(options['--credentials-file'], projectId, operadores, process.env.APPTOLVA_MIGRATION_KEY, false);
    const entry = credentials.get(options['--show-credential']);
    if (!entry) throw new Error('Empleado fuera del catálogo.');
    const app = initializeApp({ projectId, credential: applicationDefault() });
    try {
      const user = await buscarUsuario(getAuth(app), 'getUser', entry.uid);
      const profile = await getFirestore(app).collection('usuarios').doc(entry.email).get();
      if (!user || user.email?.toLowerCase() !== entry.email || !profile.exists || profile.data().uid !== entry.uid) {
        throw new Error('La cuenta y el perfil no coinciden con la migración; no se mostrará la contraseña.');
      }
      console.log(`${entry.email}\n${entry.password}`);
    } finally {
      await deleteApp(app);
    }
    return;
  }
  if (!options.apply) {
    console.log(`Simulación: proyecto ${projectId}; ${operadores.length} cuentas, ${MASTERS.size} master(s). Sin escrituras.`);
    return;
  }
  if (options['--confirm'] !== projectId || !options['--credentials-file']) {
    throw new Error('Para aplicar, indica --confirm con el mismo proyecto y --credentials-file fuera del repositorio.');
  }
  const credentials = await abrirCredenciales(options['--credentials-file'], projectId, operadores, process.env.APPTOLVA_MIGRATION_KEY);
  const app = initializeApp({ projectId, credential: applicationDefault() });
  const auth = getAuth(app);
  const db = getFirestore(app);
  const counts = { creado: 0, reanudado: 0, existente: 0, conflicto: 0, fallo: 0 };
  try {
    for (const operador of operadores) {
      try {
        const result = await migrarCuenta({
          auth, db, operador, credencial: credentials.get(operador.numero), timestamp: () => FieldValue.serverTimestamp()
        });
        counts[result]++;
        console.log(`Empleado ${operador.numero}: ${result}`);
      } catch (error) {
        counts.fallo++;
        console.error(`Fallo para empleado ${operador.numero}: ${error.code || error.message}`);
      }
    }
  } finally {
    await deleteApp(app);
  }
  console.log('Resultado:', counts);
  if (counts.conflicto || counts.fallo) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`Migración detenida: ${error.message}`);
    process.exitCode = 1;
  });
}
