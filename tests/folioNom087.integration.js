import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getFirestore, onSnapshot, setDoc } from 'firebase/firestore';
import { crearObservadorFolio } from '../apptolva_bitacora/js/observadorFolio.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    process.env.GCLOUD_PROJECT !== 'demo-apptolva') {
  throw new Error('Esta prueba requiere los emuladores Auth, Firestore y Functions con el proyecto demo-apptolva.');
}

test('el listener recibe el folio asignado por la función y se desuscribe', { timeout: 60000 }, async () => {
  const app = initializeApp({ apiKey: 'demo-api-key', projectId: 'demo-apptolva' }, randomUUID());
  const auth = getAuth(app);
  const [authHost, authPort] = process.env.FIREBASE_AUTH_EMULATOR_HOST.split(':');
  connectAuthEmulator(auth, `http://${authHost}:${authPort}`, { disableWarnings: true });
  const [firestoreHost, firestorePort] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const db = getFirestore(app);
  connectFirestoreEmulator(db, firestoreHost, Number(firestorePort));
  const user = (await signInAnonymously(auth)).user;
  const ref = doc(db, 'bitacora_reports', randomUUID());
  let cancelaciones = 0;
  let resolver;
  let rechazar;
  const asignado = new Promise((resolve, reject) => { resolver = resolve; rechazar = reject; });
  const observador = crearObservadorFolio({
    escuchar: (referencia, next, error) => {
      const cancelar = onSnapshot(referencia, next, error);
      return () => { cancelaciones++; cancelar(); };
    },
    mostrar: (estado, folio) => { if (estado === 'asignado') resolver(folio); },
    informarError: rechazar
  });
  try {
    observador.observar(ref.id, ref);
    await setDoc(ref, { report_type: 'bitacora', owner_uid: user.uid, folio: 'OFF-12345678' });
    const folio = await asignado;
    assert.match(folio, /^NOM-\d{6,}$/);
    assert.equal(cancelaciones, 1);
  } finally {
    observador.detener();
    await deleteApp(app);
  }
});
