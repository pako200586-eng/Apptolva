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
  getIdToken,
  signInAnonymously
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setLogLevel,
  setDoc,
  where
} from 'firebase/firestore';
import cerrarFallasHandler, { idCobertura } from '../netlify/functions/cerrar-fallas-repetidas.js';
import { crearFirmaFalla } from '../apptolva_bitacora/js/firmaFalla.js';
import { migrarCuenta } from '../migrar_operadores.js';

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
const ownerApp = initializeClientApp({
  apiKey: 'demo-api-key',
  projectId: proyecto
}, `apptolva-owner-${appId}`);
const ownerAuth = getAuth(ownerApp);
connectAuthEmulator(ownerAuth, `http://${authEmulatorHost}`, { disableWarnings: true });
const ownerDb = getFirestore(ownerApp);
connectFirestoreEmulator(ownerDb, firestoreAddress.hostname, firestoreAddress.port);
const emailResponsable = 'frank@apptolva.com';
setLogLevel('silent');

test('migración crea el perfil por correo y es reanudable en Auth y Firestore', async (t) => {
  const uid = `migration-${appId}`;
  const email = `migration-${appId}@example.test`;
  const operador = { numero: '221948', nombre: 'Prueba', email, rol: 'master' };
  const credencial = { uid, password: 'Temporal-unica-para-emulador' };
  const ctx = { auth: adminAuth, db: adminDb, operador, credencial, timestamp: () => new Date() };
  t.after(async () => {
    await adminDb.collection('usuarios').doc(email).delete();
    try {
      await adminAuth.deleteUser(uid);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
    }
  });
  assert.equal(await migrarCuenta(ctx), 'creado');
  const profile = await adminDb.collection('usuarios').doc(email).get();
  assert.equal(profile.get('uid'), uid);
  assert.equal(profile.get('rol_evaluaciones'), 'evaluador');
  assert.equal(await migrarCuenta(ctx), 'existente');
});

test('operadores autenticados solo consultan y modifican sus propios reportes', async (t) => {
  const apps = ['a', 'b', 'master'].map((suffix) => initializeClientApp({
    apiKey: 'demo-api-key', projectId: proyecto
  }, `route-${suffix}-${appId}`));
  const clients = apps.map((app) => {
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${authEmulatorHost}`, { disableWarnings: true });
    const db = getFirestore(app);
    connectFirestoreEmulator(db, firestoreAddress.hostname, firestoreAddress.port);
    return { auth, db };
  });
  const emails = clients.map((_, i) => `route-${i}-${appId}@example.test`);
  const users = [];
  const id = `route-report-${appId}`;
  const historicos = ['inside', 'outside', 'future'].map((suffix) => `${id}-${suffix}`);
  t.after(async () => {
    await adminDb.collection('bitacora_reports').doc(id).delete();
    for (const historico of historicos) await adminDb.collection('bitacora_reports').doc(historico).delete();
    for (const email of emails) await adminDb.collection('usuarios').doc(email).delete();
    for (const user of users) await adminAuth.deleteUser(user.uid);
    for (const app of apps) await deleteClientApp(app);
  });
  for (let i = 0; i < clients.length; i++) {
    const { user } = await createUserWithEmailAndPassword(clients[i].auth, emails[i], 'Emulator123!');
    users.push(user);
    await adminDb.collection('usuarios').doc(emails[i]).set({
      rol: i === 2 ? 'master' : 'operador',
      ...(i === 2 ? { rol_evaluaciones: 'evaluador' } : {})
    });
  }
  const reference = clients.map(({ db }) => doc(db, 'bitacora_reports', id));
  const report = {
    id, owner_uid: users[0].uid, report_type: 'checklist',
    created_at: new Date().toISOString(), payload: {}
  };
  await setDoc(reference[0], report);
  assert.equal((await getDoc(reference[0])).exists(), true);
  await assert.rejects(getDoc(reference[1]), { code: 'permission-denied' });
  await assert.rejects(setDoc(reference[1], { ...report, owner_uid: users[1].uid }));
  await assert.rejects(setDoc(reference[0], { ...report, owner_uid: users[1].uid }));
  await assert.rejects(setDoc(reference[0], { ...report, extra: true }));
  await assert.rejects(setDoc(reference[0], { ...report, folio_definitivo: 'falso' }));
  await setDoc(reference[0], { synced_at: new Date().toISOString() }, { merge: true });
  const own = query(collection(clients[0].db, 'bitacora_reports'), where('owner_uid', '==', users[0].uid));
  assert.equal((await getDocs(own)).size, 1);
  const porId = (idBuscado) => query(collection(clients[0].db, 'bitacora_reports'),
    where('owner_uid', '==', users[0].uid), where('id', '==', idBuscado));
  assert.equal((await getDocs(porId(id))).size, 1);
  assert.equal((await getDocs(porId(`${id}-inexistente`))).size, 0);
  const ahora = Date.now();
  for (const [i, offset] of [-47, -49, 1].entries()) {
    await adminDb.collection('bitacora_reports').doc(historicos[i]).set({
      ...report, id: historicos[i], created_at: new Date(ahora + offset * 3600000).toISOString()
    });
  }
  const reciente = query(collection(clients[0].db, 'bitacora_reports'),
    where('owner_uid', '==', users[0].uid),
    where('created_at', '>=', new Date(ahora - 48 * 3600000).toISOString()),
    where('created_at', '<=', new Date(ahora).toISOString()));
  assert.deepEqual((await getDocs(reciente)).docs.map((d) => d.id).sort(), [id, historicos[0]].sort());
  await assert.rejects(getDocs(collection(clients[1].db, 'bitacora_reports')), { code: 'permission-denied' });
  assert.equal((await getDoc(reference[2])).exists(), true);
  await assert.rejects(setDoc(reference[2], report));
});

test('cierre, reintento retroactivo y permisos funcionan con los emuladores', async (t) => {
  const adminUser = await createUserWithEmailAndPassword(clientAuth, emailAdmin, 'Emulator123!');
  const tokenAdmin = await getIdToken(adminUser.user);
  const lecturaUser = await createUserWithEmailAndPassword(readerAuth, emailLectura, 'Emulator123!');
  const responsableUser = await createUserWithEmailAndPassword(ownerAuth, emailResponsable, 'Emulator123!');
  const otId = `ot-${appId}`;
  const otLegadaId = `ot-legada-${appId}`;
  const otLegadaCoincidenteId = `ot-legada-coincidente-${appId}`;
  const reportesIds = {
    anterior: `reporte-anterior-${appId}`,
    posterior: `reporte-posterior-${appId}`,
    otroComponente: `reporte-componente-${appId}`,
    legadoCoincidente: `reporte-legado-${appId}`,
    notaEquivalente: `reporte-nota-${appId}`,
    notaPosterior: `reporte-nota-posterior-${appId}`,
    notaOtroEquipo: `reporte-nota-otro-${appId}`,
    notaDescartada: `reporte-nota-descartada-${appId}`,
    tolvaPrimera: `tolva-primera-${appId}`,
    tolvaSegunda: `tolva-segunda-${appId}`,
    tolvaPosterior: `tolva-posterior-${appId}`,
    tolvaOtra: `tolva-otra-${appId}`,
    tolvaDescartada: `tolva-descartada-${appId}`,
    tolvaOtraOt: `tolva-otra-ot-${appId}`,
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
  const firmaNota = crearFirmaFalla({
    unidad: '14096', componente: 'TOLVA2', sistema: 'GENERAL / REVISIÓN TALLER',
    item: 'Motor de arrastre tira aceite'
  });
  const firmaNotaEquivalente = crearFirmaFalla({
    unidad: '14096', componente: 'TOLVA1', sistema: 'GENERAL / REVISIÓN TALLER',
    item: 'Tira aceite el motor de arrastre'
  });
  const firmaNotaPosterior = crearFirmaFalla({
    unidad: '14096', componente: 'TOLVA2', sistema: 'GENERAL / REVISIÓN TALLER',
    item: 'Tira aceite el motor de arrastre'
  });
  const firmaNotaOtro = crearFirmaFalla({
    unidad: '14097', componente: 'TOLVA2', sistema: 'GENERAL / REVISIÓN TALLER',
    item: 'Tira aceite el motor de arrastre'
  });
  const firmaTolvaPrimera = crearFirmaFalla({ unidad: '14107', componente: 'TOLVA1', sistema: 'FRENOS', item: 'ABS' });
  const firmaTolvaSegunda = crearFirmaFalla({ unidad: '14107', componente: 'TOLVA2', sistema: 'FRENOS', item: 'ABS' });
  const firmaTolvaOtra = crearFirmaFalla({ unidad: '14108', componente: 'TOLVA2', sistema: 'FRENOS', item: 'ABS' });
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

  const construirTolva = (id, createdAt, posicion, unidad = '14107') => ({
    id, report_type: 'checklist', created_at: createdAt,
    payload: {
      unitId: '14132', [posicion]: unidad,
      checklistData: [{ id: posicion, categorias: [{ cat: 'FRENOS', items: [{ item: 'ABS', estado: 'MAL' }] }] }]
    }
  });

  const idsCobertura = [
    idCobertura(reportesIds.anterior, firmaTracto),
    idCobertura(reportesIds.posterior, firmaTracto),
    idCobertura(reportesIds.otroComponente, firmaTolva),
    idCobertura(reportesIds.legadoCoincidente, firmaTracto),
    idCobertura(reportesIds.notaEquivalente, firmaNotaEquivalente),
    idCobertura(reportesIds.notaPosterior, firmaNotaPosterior),
    idCobertura(reportesIds.notaOtroEquipo, firmaNotaOtro),
    idCobertura(reportesIds.notaDescartada, firmaNota),
    idCobertura(reportesIds.notaDescartada, firmaNotaEquivalente),
    idCobertura(reportesIds.tolvaPrimera, firmaTolvaPrimera),
    idCobertura(reportesIds.tolvaSegunda, firmaTolvaSegunda),
    idCobertura(reportesIds.tolvaPosterior, firmaTolvaSegunda),
    idCobertura(reportesIds.tolvaOtra, firmaTolvaOtra),
    idCobertura(reportesIds.tolvaDescartada, firmaTolvaPrimera),
    idCobertura(reportesIds.tolvaDescartada, firmaTolvaSegunda),
    idCobertura(reportesIds.tolvaOtraOt, firmaTolvaPrimera),
    idCobertura(reportesIds.tolvaOtraOt, firmaTolvaSegunda),
    idCobertura(reportesIds.sincronizadoTarde, firmaTracto),
    `directo-${appId}`
  ];
  let jobId = '';
  const economicoEquipo = String(Date.now()).slice(-9);
  const idEquipoPrueba = `dolly_${economicoEquipo}`;
  let uidAnonimo = '';

  t.after(async () => {
    await adminDb.collection('catalogo_equipos').doc(idEquipoPrueba).delete();
    if (uidAnonimo) {
      await adminDb.collection('alertas_nom087').doc(uidAnonimo).delete();
      await adminAuth.deleteUser(uidAnonimo);
    }
    for (const id of Object.values(reportesIds)) {
      await adminDb.collection('bitacora_reports').doc(id).delete();
      await adminDb.collection('ot_por_reporte').doc(id).delete();
    }
    for (const id of idsCobertura) {
      await adminDb.collection('falla_ot_cobertura').doc(id).delete();
    }
    await adminDb.collection('ordenes_trabajo').doc(otId).delete();
    await adminDb.collection('ordenes_trabajo').doc(otLegadaId).delete();
    await adminDb.collection('ordenes_trabajo').doc(otLegadaCoincidenteId).delete();
    if (jobId) await adminDb.collection('cierres_masivos_ot').doc(jobId).delete();
    await adminDb.collection('control_depuracion').doc('retroactiva').delete();
    const eventos = await adminDb.collection('ot_seguimiento').where('ot_id', '==', otId).get();
    await Promise.all(eventos.docs.map((evento) => evento.ref.delete()));
    await adminDb.collection('usuarios').doc(emailAdmin).delete();
    await adminDb.collection('usuarios').doc(emailLectura).delete();
    await adminDb.collection('usuarios').doc(emailResponsable).delete();
    await adminAuth.deleteUser(adminUser.user.uid);
    await adminAuth.deleteUser(lecturaUser.user.uid);
    await adminAuth.deleteUser(responsableUser.user.uid);
    await deleteClientApp(clientApp);
    await deleteClientApp(readerApp);
    await deleteClientApp(ownerApp);
    await deleteAdminApp(adminApp);
  });

  await adminDb.collection('usuarios').doc(emailAdmin).set({ rol: 'admin' });
  await adminDb.collection('usuarios').doc(emailLectura).set({ rol: 'lectura' });
  await adminDb.collection('usuarios').doc(emailResponsable).set({ rol: 'admin' });
  await adminDb.collection('ordenes_trabajo').doc(otId).set({
    id: otId,
    folio_ot: 90001,
    estatus: 'NUEVA',
    payload: {
      unitId: 'TR-101',
      tolva1: 'TL-202',
      cobertura_falla_keys: [firmaOrden, firmaNota, firmaTolvaPrimera],
      fallas: [{
        componenteKey: 'tracto',
        sistema: 'MOTOR',
        itemReportado: 'Fuga de aceite'
      }]
    }
  });
  await Promise.all([
    adminDb.collection('ordenes_trabajo').doc(otLegadaId).set({
      estatus: 'TERMINADA', payload: {
        tolva1: 'TL-202',
        fallas: [{ componente: '1ra TOLVA', sistema: 'MOTOR', itemReportado: 'Fuga de aceite' }]
      }
    }),
    adminDb.collection('ordenes_trabajo').doc(otLegadaCoincidenteId).set({
      estatus: 'TERMINADA', payload: {
        unitId: 'TR-101',
        fallas: [{ componente: 'TRACTOCAMIÓN', sistema: 'MOTOR', itemReportado: 'Fuga de aceite' }]
      }
    }),
    adminDb.collection('ot_por_reporte').doc(reportesIds.anterior).set({ ot_id: otLegadaId }),
    adminDb.collection('ot_por_reporte').doc(reportesIds.legadoCoincidente).set({ ot_id: otLegadaCoincidenteId }),
    adminDb.collection('falla_ot_cobertura').doc(idCobertura(reportesIds.tolvaDescartada, firmaTolvaPrimera))
      .set({ reporte_id: reportesIds.tolvaDescartada, falla_key: firmaTolvaPrimera, estado: 'DESCARTADA', ot_id: '' }),
    adminDb.collection('falla_ot_cobertura').doc(idCobertura(reportesIds.tolvaOtraOt, firmaTolvaPrimera))
      .set({ reporte_id: reportesIds.tolvaOtraOt, falla_key: firmaTolvaPrimera, estado: 'EN_PROCESO', ot_id: otLegadaId }),
    adminDb.collection('falla_ot_cobertura').doc(idCobertura(reportesIds.notaDescartada, firmaNota))
      .set({ reporte_id: reportesIds.notaDescartada, falla_key: firmaNota, estado: 'DESCARTADA', ot_id: '' })
  ]);

  const reportesIniciales = [
    [reportesIds.anterior, construirReporte(reportesIds.anterior, antes)],
    [reportesIds.posterior, construirReporte(reportesIds.posterior, despues)],
    [reportesIds.otroComponente, construirReporte(reportesIds.otroComponente, antes, 'tolva1')],
    [reportesIds.legadoCoincidente, construirReporte(reportesIds.legadoCoincidente, antes)],
    [reportesIds.tolvaPrimera, construirTolva(reportesIds.tolvaPrimera, antes, 'tolva1')],
    [reportesIds.tolvaSegunda, construirTolva(reportesIds.tolvaSegunda, antes, 'tolva2')],
    [reportesIds.tolvaPosterior, construirTolva(reportesIds.tolvaPosterior, despues, 'tolva2')],
    [reportesIds.tolvaOtra, construirTolva(reportesIds.tolvaOtra, antes, 'tolva2', '14108')],
    [reportesIds.tolvaDescartada, construirTolva(reportesIds.tolvaDescartada, antes, 'tolva2')],
    [reportesIds.tolvaOtraOt, construirTolva(reportesIds.tolvaOtraOt, antes, 'tolva2')],
    ...[
      [reportesIds.notaEquivalente, antes, '14096', 'tolva1'],
      [reportesIds.notaDescartada, antes, '14096', 'tolva1'],
      [reportesIds.notaPosterior, despues, '14096', 'tolva2'],
      [reportesIds.notaOtroEquipo, antes, '14097', 'tolva2']
    ].map(([id, fecha, unidad, posicion]) => [id, {
      id, report_type: 'checklist', created_at: fecha,
      payload: { unitId: 'TR-101', [posicion]: unidad, observaciones: { [posicion]: 'Tira aceite el motor de arrastre' } }
    }])
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
  assert.equal((await adminDb.collection('falla_ot_cobertura')
    .doc(idCobertura(reportesIds.legadoCoincidente, firmaTracto)).get()).exists, false);
  assert.equal((await adminDb.collection('falla_ot_cobertura')
    .doc(idCobertura(reportesIds.notaEquivalente, firmaNotaEquivalente)).get()).get('estado'), 'ATENDIDA');
  assert.equal((await adminDb.collection('falla_ot_cobertura')
    .doc(idCobertura(reportesIds.notaPosterior, firmaNotaPosterior)).get()).exists, false);
  assert.equal((await adminDb.collection('falla_ot_cobertura')
    .doc(idCobertura(reportesIds.notaOtroEquipo, firmaNotaOtro)).get()).exists, false);
  assert.equal((await adminDb.collection('falla_ot_cobertura')
    .doc(idCobertura(reportesIds.notaDescartada, firmaNotaEquivalente)).get()).exists, false);
  assert.equal((await adminDb.collection('falla_ot_cobertura')
    .doc(idCobertura(reportesIds.notaDescartada, firmaNota)).get()).get('estado'), 'DESCARTADA');
  for (const [id, firma] of [[reportesIds.tolvaPrimera, firmaTolvaPrimera], [reportesIds.tolvaSegunda, firmaTolvaSegunda]]) {
    const cobertura = await adminDb.collection('falla_ot_cobertura').doc(idCobertura(id, firma)).get();
    assert.equal(cobertura.get('estado'), 'ATENDIDA');
    assert.equal(cobertura.get('ot_id'), otId);
  }
  for (const [id, firma] of [
    [reportesIds.tolvaPosterior, firmaTolvaSegunda], [reportesIds.tolvaOtra, firmaTolvaOtra],
    [reportesIds.tolvaDescartada, firmaTolvaSegunda], [reportesIds.tolvaOtraOt, firmaTolvaSegunda]
  ]) {
    assert.equal((await adminDb.collection('falla_ot_cobertura').doc(idCobertura(id, firma)).get()).exists, false);
  }
  assert.equal((await adminDb.collection('falla_ot_cobertura')
    .doc(idCobertura(reportesIds.tolvaDescartada, firmaTolvaPrimera)).get()).get('estado'), 'DESCARTADA');
  assert.equal((await adminDb.collection('falla_ot_cobertura')
    .doc(idCobertura(reportesIds.tolvaOtraOt, firmaTolvaPrimera)).get()).get('ot_id'), otLegadaId);

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

  const equipoValido = {
    id: idEquipoPrueba,
    economico: economicoEquipo,
    display: `T${economicoEquipo}`,
    tipo: 'dolly',
    estado: 'activo'
  };
  const referenciaEquipo = (db, id = idEquipoPrueba) => doc(db, 'catalogo_equipos', id);
  const rechazadoPorReglas = (error) => error.code === 'permission-denied';

  await assert.rejects(
    setDoc(referenciaEquipo(clientDb), equipoValido),
    rechazadoPorReglas,
    'un admin que no es el responsable no modifica el catálogo'
  );
  await setDoc(referenciaEquipo(ownerDb), equipoValido);
  await assert.rejects(
    setDoc(referenciaEquipo(ownerDb, `dolly_${economicoEquipo}9`), equipoValido),
    rechazadoPorReglas,
    'el id debe coincidir con tipo y económico'
  );
  await assert.rejects(
    setDoc(referenciaEquipo(ownerDb, 'dolly_AB'), { ...equipoValido, id: 'dolly_AB', economico: 'AB' }),
    rechazadoPorReglas,
    'el económico debe ser numérico'
  );
  await assert.rejects(
    setDoc(referenciaEquipo(ownerDb), { ...equipoValido, estado: 'perdido' }),
    rechazadoPorReglas,
    'el estado debe ser uno de los definidos'
  );
  await assert.rejects(
    setDoc(referenciaEquipo(ownerDb), { ...equipoValido, campo_extra: true }),
    rechazadoPorReglas,
    'no se admiten campos fuera del esquema'
  );
  await setDoc(referenciaEquipo(ownerDb), { ...equipoValido, estado: 'taller' });
  assert.equal((await getDoc(referenciaEquipo(ownerDb))).get('estado'), 'taller');
  await assert.rejects(deleteDoc(referenciaEquipo(ownerDb)), rechazadoPorReglas, 'el catálogo nunca se borra');

  assert.equal((await getDoc(referenciaEquipo(readerDb))).exists(), true);
  await assert.rejects(
    setDoc(referenciaEquipo(readerDb), { ...equipoValido, estado: 'activo' }),
    rechazadoPorReglas,
    'un usuario de solo lectura no modifica el catálogo'
  );

  const operador = await signInAnonymously(readerAuth);
  uidAnonimo = operador.user.uid;
  assert.equal((await getDoc(referenciaEquipo(readerDb))).get('tipo'), 'dolly');
  await assert.rejects(
    setDoc(referenciaEquipo(readerDb), { ...equipoValido, estado: 'activo' }),
    rechazadoPorReglas,
    'un operador anónimo lee pero no modifica el catálogo'
  );

  const alertaPush = {
    owner_uid: uidAnonimo,
    unit_id: 'TR-101',
    driver_name: 'Operador de prueba',
    subscription: { endpoint: 'https://push.example.test/abc', keys: { p256dh: 'p', auth: 'a' } },
    fire_at_270: Date.now() + 60000,
    fire_at_300: Date.now() + 1860000,
    sent_270: false,
    sent_300: false,
    updated_at: Date.now()
  };
  const referenciaAlerta = (db, id = uidAnonimo) => doc(db, 'alertas_nom087', id);
  await setDoc(referenciaAlerta(readerDb), alertaPush);
  assert.equal((await getDoc(referenciaAlerta(readerDb))).get('unit_id'), 'TR-101');
  await assert.rejects(
    setDoc(referenciaAlerta(readerDb, `otro-${appId}`), alertaPush),
    rechazadoPorReglas,
    'el operador solo escribe su propio documento de alerta'
  );
  await assert.rejects(
    setDoc(referenciaAlerta(readerDb), { ...alertaPush, sent_270: true }),
    rechazadoPorReglas,
    'solo el servidor marca los avisos como enviados'
  );
  await assert.rejects(
    setDoc(referenciaAlerta(readerDb), {
      ...alertaPush,
      subscription: { ...alertaPush.subscription, endpoint: 'http://inseguro.example.test' }
    }),
    rechazadoPorReglas,
    'el endpoint push debe ser https'
  );
  await assert.rejects(
    getDoc(referenciaAlerta(clientDb)),
    rechazadoPorReglas,
    'ni un administrador lee suscripciones push'
  );
  await deleteDoc(referenciaAlerta(readerDb));
  assert.equal((await getDoc(referenciaAlerta(readerDb))).exists(), false);
});
