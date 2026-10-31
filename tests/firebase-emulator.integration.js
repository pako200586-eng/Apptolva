import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { cert, initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  getIdToken
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  setLogLevel,
  setDoc
} from 'firebase/firestore';
import cerrarFallasHandler, { idCobertura } from '../netlify/functions/cerrar-fallas-repetidas.js';
import { crearFirmaFalla } from '../apptolva_bitacora/js/firmaFalla.js';

const firestoreEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!firestoreEmulatorHost || !authEmulatorHost) {
  throw new Error('Ejecuta esta prueba con `npm run test:emulator` para iniciar Auth y Firestore Emulator.');
}

function dividirHost(host) {
  const separador = host.lastIndexOf(':');
  if (separador < 1) throw new Error(`Host de emulador no válido: ${host}`);
  return {
    hostname: host.slice(0, separador).replace(/^\[|\]$/g, ''),
    port: Number(host.slice(separador + 1))
  };
}

const proyecto = process.env.GCLOUD_PROJECT || 'demo-apptolva';
const firestoreAddress = dividirHost(firestoreEmulatorHost);
const appId = randomUUID().replace(/-/g, '');
const emailAdmin = `admin-${appId}@example.test`;
const emailLectura = `lectura-${appId}@example.test`;
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const adminApp = initializeAdminApp({
  credential: cert({
    project_id: proyecto,
    client_email: `emulator-admin-${appId}@${proyecto}.iam.gserviceaccount.com`,
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' })
  }),
  projectId: proyecto
});
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);
const clientApp = initializeClientApp({
  apiKey: 'emulator-only-key',
  authDomain: `${proyecto}.firebaseapp.com`,
  projectId: proyecto
}, `apptolva-test-${appId}`);
const clientAuth = getAuth(clientApp);
connectAuthEmulator(clientAuth, `http://${authEmulatorHost}`, { disableWarnings: true });
const clientDb = getFirestore(clientApp);
connectFirestoreEmulator(clientDb, firestoreAddress.hostname, firestoreAddress.port);
const readerApp = initializeClientApp({
  apiKey: 'emulator-only-key',
  authDomain: `${proyecto}.firebaseapp.com`,
  projectId: proyecto
}, `apptolva-reader-${appId}`);
const readerAuth = getAuth(readerApp);
connectAuthEmulator(readerAuth, `http://${authEmulatorHost}`, { disableWarnings: true });
const readerDb = getFirestore(readerApp);
connectFirestoreEmulator(readerDb, firestoreAddress.hostname, firestoreAddress.port);
setLogLevel('silent');

test('cierre, reintento retroactivo y permisos funcionan con los emuladores', async (t) => {
  const adminUser = await createUserWithEmailAndPassword(clientAuth, emailAdmin, 'Emulator123!');
  const tokenAdmin = await getIdToken(adminUser.user);
  const lecturaUser = await createUserWithEmailAndPassword(readerAuth, emailLectura, 'Emulator123!');

  const otId = `ot-${appId}`;
  const reportesIds = {
    anterior: `reporte-anterior-${appId}`,
    posterior: `reporte-posterior-${appId}`,
    otroComponente: `reporte-componente-${appId}`,
    sincronizadoTarde: `reporte-tardio-${appId}`
  };
  const firmaTracto = crearFirmaFalla({
    unidad: 'TR-101',
    componente: 'TRACTO',
    sistema: 'MOTOR',
    item: 'Fuga de aceite'
  });
  const firmaTolva = crearFirmaFalla({
    unidad: 'TL-202',
    componente: 'TOLVA1',
    sistema: 'MOTOR',
    item: 'Fuga de aceite'
  });
  const firmaOrden = firmaTracto;
  const cierreBase = Date.now();
  const antes = new Date(cierreBase - 5 * 60 * 1000).toISOString();
  const despues = new Date(cierreBase + 5 * 60 * 1000).toISOString();

  const construirReporte = (id, createdAt, componente = 'tracto') => ({
    id,
    folio: id,
    report_type: 'checklist',
    created_at: createdAt,
    payload: {
      unitId: 'TR-101',
      tolva1: 'TL-202',
      checklistData: [{
        id: componente,
        categorias: [{
          cat: 'MOTOR',
          items: [{ item: 'Fuga de aceite', estado: 'MAL' }]
        }]
      }]
    }
  });

  const idsCobertura = [
    idCobertura(reportesIds.anterior, firmaTracto),
    idCobertura(reportesIds.posterior, firmaTracto),
    idCobertura(reportesIds.otroComponente, firmaTolva),
    idCobertura(reportesIds.sincronizadoTarde, firmaTracto),
    `directo-${appId}`
  ];
  let jobId = '';

  t.after(async () => {
    for (const id of Object.values(reportesIds)) {
      await adminDb.collection('bitacora_reports').doc(id).delete();
    }
    for (const id of idsCobertura) {
      await adminDb.collection('falla_ot_cobertura').doc(id).delete();
    }
    await adminDb.collection('ordenes_trabajo').doc(otId).delete();
    if (jobId) await adminDb.collection('cierres_masivos_ot').doc(jobId).delete();
    await adminDb.collection('control_depuracion').doc('retroactiva').delete();
    const eventos = await adminDb.collection('ot_seguimiento').where('ot_id', '==', otId).get();
    await Promise.all(eventos.docs.map((evento) => evento.ref.delete()));
    await adminDb.collection('usuarios').doc(emailAdmin).delete();
    await adminDb.collection('usuarios').doc(emailLectura).delete();
    await adminAuth.deleteUser(adminUser.user.uid);
    await adminAuth.deleteUser(lecturaUser.user.uid);
    await deleteClientApp(clientApp);
    await deleteClientApp(readerApp);
    await deleteAdminApp(adminApp);
  });

  await adminDb.collection('usuarios').doc(emailAdmin).set({ rol: 'admin' });
  await adminDb.collection('usuarios').doc(emailLectura).set({ rol: 'lectura' });
  await adminDb.collection('ordenes_trabajo').doc(otId).set({
    id: otId,
    folio_ot: 90001,
    estatus: 'NUEVA',
    payload: {
      unitId: 'TR-101',
      tolva1: 'TL-202',
      cobertura_falla_keys: [firmaOrden],
      fallas: [{
        componenteKey: 'tracto',
        sistema: 'MOTOR',
        itemReportado: 'Fuga de aceite'
      }]
    }
  });

  const reportesIniciales = [
    [reportesIds.anterior, construirReporte(reportesIds.anterior, antes)],
    [reportesIds.posterior, construirReporte(reportesIds.posterior, despues)],
    [reportesIds.otroComponente, construirReporte(reportesIds.otroComponente, antes, 'tolva1')]
  ];
  await Promise.all(reportesIniciales.map(([id, reporte]) =>
    adminDb.collection('bitacora_reports').doc(id).set(reporte)
  ));

  const ejecutar = async (body, token = tokenAdmin) => cerrarFallasHandler(new Request(
    'http://localhost/.netlify/functions/cerrar-fallas-repetidas',
    {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  ));

  const sinSesion = await ejecutar({ action: 'retroactive-list' }, '');
  assert.equal(sinSesion.status, 403);
  process.env.DEPURACION_MASIVA_EMAILS = emailAdmin;
  process.env.DEPURACION_INTERVALO_DIAS = '30';

  const cierreResponse = await ejecutar({ action: 'close', ot_id: otId, estatus: 'TERMINADA' });
  assert.equal(cierreResponse.status, 200);
  const cierre = await cierreResponse.json();
  assert.equal(cierre.done, true);
  assert.ok(cierre.cerrada_at);
  jobId = cierre.jobId;

  const otCerrada = await adminDb.collection('ordenes_trabajo').doc(otId).get();
  assert.equal(otCerrada.get('estatus'), 'TERMINADA');
  assert.equal(otCerrada.get('cerrada_at'), cierre.cerrada_at);

  const coberturaAnterior = await adminDb.collection('falla_ot_cobertura')
    .doc(idCobertura(reportesIds.anterior, firmaTracto)).get();
  assert.equal(coberturaAnterior.get('ot_id'), otId);
  assert.equal(coberturaAnterior.get('atendido_en_bloque'), true);
  assert.equal(coberturaAnterior.get('estado'), 'ATENDIDA');
  assert.equal((await adminDb.collection('falla_ot_cobertura')
    .doc(idCobertura(reportesIds.posterior, firmaTracto)).get()).exists, false);
  assert.equal((await adminDb.collection('falla_ot_cobertura')
    .doc(idCobertura(reportesIds.otroComponente, firmaTolva)).get()).exists, false);

  const lateReport = construirReporte(reportesIds.sincronizadoTarde, antes);
  lateReport.synced_at = new Date().toISOString();
  await adminDb.collection('bitacora_reports').doc(reportesIds.sincronizadoTarde).set(lateReport);
  const listaResponse = await ejecutar({ action: 'retroactive-list' });
  assert.equal(listaResponse.status, 200);
  const lista = await listaResponse.json();
  assert.ok(lista.ordenes.some((orden) => orden.id === otId));
  const sinInicio = await ejecutar({
    action: 'retroactive-close',
    run_id: 'inexistente',
    ot_id: otId,
    cerrada_at: cierre.cerrada_at
  });
  assert.equal(sinInicio.status, 409);

  process.env.DEPURACION_MASIVA_EMAILS = 'otra-persona@example.test';
  assert.equal((await ejecutar({ action: 'retroactive-list' })).status, 403);
  assert.equal((await ejecutar({ action: 'retroactive-start' })).status, 403);
  assert.equal((await ejecutar({ action: 'firestore-page', modo: 'backup', coleccion: 'ordenes_trabajo' })).status, 403);
  assert.equal((await (await ejecutar({ action: 'privileges' })).json()).sensibles, false);
  process.env.DEPURACION_MASIVA_EMAILS = emailAdmin;
  assert.equal((await (await ejecutar({ action: 'privileges' })).json()).sensibles, true);
  assert.equal((await ejecutar({ action: 'firestore-page', modo: 'backup', coleccion: 'usuarios' })).status, 400);
  const respaldo = await (await ejecutar({ action: 'firestore-page', modo: 'backup', coleccion: 'ordenes_trabajo' })).json();
  assert.equal(respaldo.done, true);
  assert.ok(respaldo.documentos.some((json) => JSON.parse(json)._id === otId));
  const auditoria = await (await ejecutar({ action: 'firestore-page', modo: 'audit', coleccion: 'ordenes_trabajo' })).json();
  assert.ok(auditoria.stats.documentos >= 1 && auditoria.stats.bytesJson > 0);

  const inicioResponse = await ejecutar({ action: 'retroactive-start' });
  assert.equal(inicioResponse.status, 200);
  const { run_id: runId } = await inicioResponse.json();
  assert.ok(runId);
  const reanudada = await (await ejecutar({ action: 'retroactive-start' })).json();
  assert.equal(reanudada.run_id, runId);

  const retroactivoResponse = await ejecutar({
    action: 'retroactive-close',
    run_id: runId,
    ot_id: otId,
    cerrada_at: cierre.cerrada_at
  });
  assert.equal(retroactivoResponse.status, 200);
  assert.equal((await retroactivoResponse.json()).done, true);
  assert.equal((await ejecutar({ action: 'retroactive-finish', run_id: runId })).status, 200);
  const repetida = await ejecutar({ action: 'retroactive-start' });
  assert.equal(repetida.status, 429);
  assert.ok((await repetida.json()).disponible_desde);
  assert.equal((await adminDb.collection('falla_ot_cobertura')
    .doc(idCobertura(reportesIds.sincronizadoTarde, firmaTracto)).get()).get('ot_id'), otId);

  const jobAdminSnapshot = await getDoc(doc(clientDb, 'cierres_masivos_ot', jobId));
  assert.equal(jobAdminSnapshot.exists(), true);
  const directCoverage = doc(clientDb, 'falla_ot_cobertura', `directo-${appId}`);
  await setDoc(directCoverage, { report_id: 'prueba-reglas', falla_key: firmaTracto });

  assert.equal((await getDoc(doc(readerDb, 'falla_ot_cobertura', `directo-${appId}`))).exists(), true);
  await assert.rejects(
    setDoc(doc(readerDb, 'falla_ot_cobertura', `lectura-${appId}`), { report_id: 'no-autorizado' }),
    (error) => error.code === 'permission-denied'
  );
  await assert.rejects(
    getDoc(doc(readerDb, 'cierres_masivos_ot', jobId)),
    (error) => error.code === 'permission-denied'
  );
  await deleteDoc(directCoverage);
});
