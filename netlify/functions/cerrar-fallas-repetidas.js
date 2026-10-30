import { createHash } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { crearFirmasFalla, normalizarTextoFalla } from '../../apptolva_bitacora/js/firmaFalla.js';
import '../../apptolva_bitacora/js/catalogoBachoco.js';
import '../../apptolva_bitacora/js/normalizadorFallas.js';

const COLECCION_REPORTES = 'bitacora_reports';
const COLECCION_ORDENES = 'ordenes_trabajo';
const COLECCION_EVENTOS = 'ot_seguimiento';
const COLECCION_COBERTURAS = 'falla_ot_cobertura';
const COLECCION_CIERRES = 'cierres_masivos_ot';
const ESTATUS_CERRADOS = new Set(['TERMINADA', 'CERRADA']);
const TAMANO_PAGINA = 200;

function respuesta(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function serviciosFirebase() {
  const emuladoresActivos = Boolean(
    process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST
  );
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson && !emuladoresActivos) {
    throw new Error('Falta configurar FIREBASE_SERVICE_ACCOUNT_JSON en Netlify.');
  }

  const serviceAccount = serviceAccountJson ? JSON.parse(serviceAccountJson) : null;
  if (serviceAccount?.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  const appOptions = {
    projectId: serviceAccount?.project_id || process.env.GCLOUD_PROJECT || 'demo-apptolva'
  };
  if (serviceAccount) appOptions.credential = cert(serviceAccount);
  const app = getApps()[0] || initializeApp(appOptions);
  return { auth: getAuth(app), db: getFirestore(app) };
}

async function verificarAdministrador(request, auth, db) {
  const autorizacion = request.headers.get('authorization') || '';
  const token = autorizacion.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  const identidad = await auth.verifyIdToken(token);
  const correo = String(identidad.email || '').trim().toLowerCase();
  if (!correo) return null;
  const usuario = await db.collection('usuarios').doc(correo).get();
  return usuario.exists && usuario.get('rol') === 'admin'
    ? { uid: identidad.uid, correo }
    : null;
}

function componenteKey(valor) {
  const texto = normalizarTextoFalla(valor);
  if (texto.includes('DOLLY')) return 'DOLLY';
  if (/TOLVA\s*2|TOLVA2|2DA\s*TOLVA/.test(texto)) return 'TOLVA2';
  if (/TOLVA\s*1|TOLVA1|1RA\s*TOLVA/.test(texto)) return 'TOLVA1';
  if (texto === 'TRACTO' || texto.includes('TRACTOCAMION')) return 'TRACTO';
  return texto;
}

function componenteKeyId(valor) {
  const texto = String(valor || '').trim().toLowerCase();
  if (texto === 'dolly') return 'DOLLY';
  if (texto === 'tolva1') return 'TOLVA1';
  if (texto === 'tolva2') return 'TOLVA2';
  return 'TRACTO';
}

export function extraerFallasReporte(datos) {
  const payload = datos?.payload && typeof datos.payload === 'object' ? datos.payload : datos || {};
  const tipo = String(datos?.report_type || datos?.reportType || payload.reportType || '').toLowerCase();
  const folio = String(datos?.folio || payload.folio || '').trim();
  const pareceBitacora = /^(?:FB\d+|OFF-\d+)/i.test(folio)
    || Array.isArray(payload.logs)
    || datos?.gpsEvidenceVersion !== undefined;
  if ((tipo && tipo !== 'checklist') || (!tipo && pareceBitacora)) return [];
  const economicos = {
    tracto: payload.unitId || datos?.unit_id || datos?.unitId,
    tolva1: payload.tolva1,
    dolly: payload.dolly,
    tolva2: payload.tolva2
  };
  const normalizar = globalThis.procesarReporteFallas;
  if (typeof normalizar !== 'function') throw new Error('No se pudo cargar el normalizador de fallas.');
  return normalizar({ ...datos, payload }).fallas.flatMap((falla) => {
    const key = falla.componenteKey || componenteKey(falla.componente);
    const unidad = economicos[key] || '';
    const firmas = crearFirmasFalla({
      unidad,
      componente: componenteKey(key),
      sistema: falla.sistema || falla.categoria || 'GENERAL',
      item: falla.itemReportado || falla.descripcion || falla.itemOficial
    });
    return firmas.map((firma) => ({
      firma,
      unidad: String(unidad).trim(),
      componente: componenteKey(key)
    }));
  });
}

function extraerFallasOrden(orden) {
  const firmasGuardadas = orden.cobertura_falla_keys || orden.payload?.cobertura_falla_keys;
  if (Array.isArray(firmasGuardadas) && firmasGuardadas.length) {
    return [...new Set(firmasGuardadas)].map((firma) => ({ firma }));
  }
  const payload = orden.payload && typeof orden.payload === 'object' ? orden.payload : {};
  const fallas = Array.isArray(payload.fallas) && payload.fallas.some((falla) => falla && typeof falla === 'object')
    ? payload.fallas
    : extraerFallasReporte({ payload });
  return fallas.map((falla) => {
    const componente = componenteKey(falla.componenteKey || falla.componente);
    const unidad = payload[componenteKeyId(falla.componenteKey || falla.componente)]
      || (componente === 'TRACTO' ? payload.unitId || orden.unidad : '');
    const firmas = crearFirmasFalla({
      unidad,
      componente,
      sistema: falla.sistema || falla.categoria,
      item: falla.itemReportado || falla.item || falla.descripcion || falla.itemOficial
    });
    return firmas.map((firma) => ({ firma, unidad: String(unidad).trim(), componente }));
  }).flat();
}

export function idCobertura(reporteId, firma) {
  const hash = createHash('sha256').update(firma).digest('hex');
  return `${reporteId}_${hash}`;
}

function fechaLegacy(orden) {
  const fecha = orden.fecha_realizacion || orden.updated_at || orden.fecha_apertura;
  if (!fecha) return '';
  if (typeof fecha?.toDate === 'function') return fecha.toDate().toISOString();
  const texto = String(fecha).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return `${texto}T23:59:59.999Z`;
  const parsed = new Date(texto);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function fechaReporte(datos) {
  const payload = datos?.payload && typeof datos.payload === 'object' ? datos.payload : {};
  const candidata = datos.created_at || payload.created_at || datos.fecha || payload.fecha || datos.hora_salida || payload.horaSalida;
  if (!candidata) return '';
  if (typeof candidata?.toDate === 'function') return candidata.toDate().toISOString();
  const texto = String(candidata).trim();
  const matchDMY = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const normalizada = matchDMY
    ? `${matchDMY[3]}-${matchDMY[2].padStart(2, '0')}-${matchDMY[1].padStart(2, '0')}T12:00:00.000Z`
    : texto;
  const parsed = new Date(normalizada);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

async function abrirCierre(db, ordenRef, usuario, estatusObjetivo = '', cierreForzado = '') {
  const eventoRef = db.collection(COLECCION_EVENTOS).doc();
  return db.runTransaction(async (transaction) => {
    const otSnapshot = await transaction.get(ordenRef);
    if (!otSnapshot.exists) throw new Error('La Orden de Trabajo ya no existe.');

    const datosOT = otSnapshot.data();
    const estatusActual = String(datosOT.estatus || 'NUEVA').toUpperCase();
    const yaCerrada = ESTATUS_CERRADOS.has(estatusActual);
    if (!cierreForzado && !ESTATUS_CERRADOS.has(estatusObjetivo)) {
      throw new Error('El estatus de cierre no es válido.');
    }

    const cerradoAt = cierreForzado
      ? fechaLegacy({ fecha_realizacion: cierreForzado })
      : (yaCerrada
        ? datosOT.cerrada_at
          ? fechaLegacy({ fecha_realizacion: datosOT.cerrada_at })
          : fechaLegacy(datosOT)
        : new Date().toISOString());
    if (!cerradoAt) throw new Error(`La OT ${ordenRef.id} no tiene una fecha de cierre válida.`);
    const jobId = cierreForzado
      ? `${ordenRef.id}_${Date.parse(cerradoAt)}`
      : (yaCerrada && datosOT.cierre_masivo_job_id
        ? datosOT.cierre_masivo_job_id
        : `${ordenRef.id}_${Date.parse(cerradoAt)}`);
    const jobRef = db.collection(COLECCION_CIERRES).doc(jobId);
    const jobSnapshot = await transaction.get(jobRef);

    if (!cierreForzado && (!yaCerrada || estatusActual !== estatusObjetivo)) {
      transaction.update(ordenRef, {
        estatus: estatusObjetivo,
        cerrada_at: cerradoAt,
        updated_at: new Date().toISOString(),
        cierre_masivo_job_id: jobId
      });
      transaction.set(eventoRef, {
        id: eventoRef.id,
        ot_id: ordenRef.id,
        accion: 'CAMBIO_ESTATUS',
        usuario: usuario.correo,
        comentario: `Estatus actualizado a ${estatusObjetivo}`,
        fecha: new Date().toISOString()
      });
    } else if (!datosOT.cerrada_at || datosOT.cierre_masivo_job_id !== jobId) {
      transaction.update(ordenRef, {
        cerrada_at: cerradoAt,
        cierre_masivo_job_id: jobId,
        ...(cierreForzado ? { cierre_masivo_fecha_inferida: true } : {})
      });
    }

    if (!jobSnapshot.exists) {
      const orden = { id: ordenRef.id, ...datosOT };
      transaction.create(jobRef, {
        ot_id: ordenRef.id,
        cerrada_at: cerradoAt,
        firmas_falla: [...new Set(extraerFallasOrden(orden).map((falla) => falla.firma))],
        estado: 'pendiente',
        cursor_created_at: null,
        cursor_report_id: null,
        reportes_revisados: 0,
        incidencias_vinculadas: 0,
        incidencias_ya_vinculadas: 0,
        modo: cierreForzado ? 'retroactivo' : 'regular',
        iniciado_por: usuario.correo,
        iniciado_at: new Date().toISOString()
      });
    } else if (cierreForzado && (
      jobSnapshot.get('estado') === 'completado'
      || jobSnapshot.get('modo') !== 'retroactivo'
    )) {
      transaction.update(jobRef, {
        firmas_falla: [...new Set(extraerFallasOrden({ id: ordenRef.id, ...datosOT }).map((falla) => falla.firma))],
        modo: 'retroactivo',
        estado: 'pendiente',
        cursor_created_at: null,
        cursor_report_id: null,
        reportes_revisados: 0,
        incidencias_vinculadas: 0,
        incidencias_ya_vinculadas: 0,
        reanudado_at: new Date().toISOString()
      });
    }
    return { jobId };
  });
}

async function procesarPagina(db, jobId) {
  const jobRef = db.collection(COLECCION_CIERRES).doc(jobId);
  const jobSnapshot = await jobRef.get();
  if (!jobSnapshot.exists) throw new Error('No se encontró el proceso de cierre.');
  const job = jobSnapshot.data();
  if (job.estado === 'completado') return { jobId, done: true, ...job };

  const ordenSnapshot = await db.collection(COLECCION_ORDENES).doc(job.ot_id).get();
  if (!ordenSnapshot.exists) throw new Error('La OT asociada al cierre ya no existe.');

  const firmas = new Set(job.firmas_falla || []);
  if (firmas.size > 400) throw new Error('La OT contiene más de 400 fallas distintas y no puede procesarse en un lote seguro.');
  const limitePagina = Math.min(
    TAMANO_PAGINA,
    Math.floor(400 / Math.max(firmas.size, 1))
  );
  const reportesRef = db.collection(COLECCION_REPORTES);
  let consulta;
  if (job.modo === 'retroactivo') {
    consulta = reportesRef.orderBy(FieldPath.documentId(), 'asc').limit(limitePagina);
    if (job.cursor_report_id) consulta = consulta.startAfter(job.cursor_report_id);
  } else {
    consulta = reportesRef
      .where('created_at', '<=', job.cerrada_at)
      .orderBy('created_at', 'asc')
      .orderBy(FieldPath.documentId(), 'asc')
      .limit(limitePagina);
    if (job.cursor_created_at && job.cursor_report_id) {
      consulta = consulta.startAfter(job.cursor_created_at, job.cursor_report_id);
    }
  }

  const snapshot = await consulta.get();
  const coincidencias = new Map();
  snapshot.forEach((reporte) => {
    const fecha = fechaReporte(reporte.data());
    if (!fecha || fecha > job.cerrada_at) return;
    const fallas = extraerFallasReporte({ id: reporte.id, ...reporte.data() });
    fallas.forEach((falla) => {
      if (!firmas.has(falla.firma)) return;
      const ref = db.collection(COLECCION_COBERTURAS).doc(idCobertura(reporte.id, falla.firma));
      coincidencias.set(ref.id, {
        ref,
        reporteId: reporte.id,
        reporte: reporte.data(),
        falla
      });
    });
  });

  const registrosCoincidentes = [...coincidencias.values()];
  const refs = registrosCoincidentes.map((coincidencia) => coincidencia.ref);
  const existentes = refs.length ? await db.getAll(...refs) : [];
  const existentesPorId = new Map(existentes.map((item) => [item.id, item]));
  const reportesUnicos = [...new Set(registrosCoincidentes.map((item) => item.reporteId))];
  const refsLegadas = reportesUnicos.map((reporteId) =>
    db.collection('ot_por_reporte').doc(reporteId)
  );
  const existentesLegados = refsLegadas.length ? await db.getAll(...refsLegadas) : [];
  const legadosPorReporte = new Map(reportesUnicos.map((reporteId, index) => [
    reporteId,
    existentesLegados[index]
  ]));
  const batch = db.batch();
  let vinculadas = 0;
  let yaVinculadas = 0;
  registrosCoincidentes.forEach(({ ref, reporteId, reporte, falla }) => {
    const existente = existentesPorId.get(ref.id);
    if (existente?.exists && existente.get('ot_id') !== job.ot_id) {
      yaVinculadas += 1;
      return;
    }
    const legado = legadosPorReporte.get(reporteId);
    if (legado?.exists && legado.get('ot_id') !== job.ot_id) {
      yaVinculadas += 1;
      return;
    }

    batch.set(ref, {
      reporte_id: reporteId,
      folio: reporte.folio || reporte.payload?.folio || reporteId,
      created_at: reporte.created_at || reporte.payload?.created_at || null,
      ot_id: job.ot_id,
      falla_key: falla.firma,
      unidad: falla.unidad,
      componente: falla.componente,
      estado: 'ATENDIDA',
      atendido_en_bloque: true,
      cerrada_at: job.cerrada_at,
      updated_at: new Date().toISOString()
    }, { merge: true });
    if (!existente?.exists || existente.get('estado') !== 'ATENDIDA') vinculadas += 1;
  });

  const ultimo = snapshot.docs[snapshot.docs.length - 1];
  const terminado = snapshot.size < limitePagina;
  const reportesRevisados = Number(job.reportes_revisados || 0) + snapshot.size;
  const totalVinculadas = Number(job.incidencias_vinculadas || 0) + vinculadas;
  const totalYaVinculadas = Number(job.incidencias_ya_vinculadas || 0) + yaVinculadas;
  const actualizado = {
    reportes_revisados: reportesRevisados,
    incidencias_vinculadas: totalVinculadas,
    incidencias_ya_vinculadas: totalYaVinculadas,
    estado: terminado ? 'completado' : 'pendiente',
    cursor_created_at: job.modo === 'retroactivo'
      ? null
      : ultimo?.get('created_at') || job.cursor_created_at || null,
    cursor_report_id: ultimo?.id || job.cursor_report_id || null,
    actualizado_at: new Date().toISOString()
  };

  batch.set(jobRef, actualizado, { merge: true });
  if (terminado) {
    const eventoRef = db.collection(COLECCION_EVENTOS).doc(`CIERRE-${jobId}`);
    batch.set(eventoRef, {
      id: eventoRef.id,
      ot_id: job.ot_id,
      accion: 'CIERRE_MASIVO_BLOQUE',
      usuario: job.iniciado_por,
      comentario: `Se vincularon ${totalVinculadas} incidencias de ${reportesRevisados} reportes revisados hasta ${job.cerrada_at}.`,
      fecha: new Date().toISOString()
    });
  }

  await batch.commit();
  return { jobId, done: terminado, cerrada_at: job.cerrada_at, ...actualizado };
}

async function iniciarCierre(db, otId, estatus, usuario, cierreForzado = '') {
  const ordenRef = db.collection(COLECCION_ORDENES).doc(otId);
  const snapshot = await ordenRef.get();
  if (!snapshot.exists) throw new Error('No se encontró la Orden de Trabajo.');
  return abrirCierre(db, ordenRef, usuario, estatus, cierreForzado);
}

export default async function handler(request) {
  if (request.method !== 'POST') return respuesta(405, { error: 'Método no permitido.' });

  try {
    const { auth, db } = serviciosFirebase();
    const usuario = await verificarAdministrador(request, auth, db);
    if (!usuario) return respuesta(403, { error: 'Se requiere una cuenta de administrador autorizada.' });

    const body = await request.json();
    if (body.action === 'close') {
      const otId = String(body.ot_id || '').trim();
      const estatus = String(body.estatus || '').trim().toUpperCase();
      if (!otId) return respuesta(400, { error: 'Falta el identificador de la OT.' });
      const { jobId } = await iniciarCierre(db, otId, estatus, usuario);
      return respuesta(200, await procesarPagina(db, jobId));
    }

    if (body.action === 'continue') {
      const jobId = String(body.job_id || '').trim();
      if (!jobId) return respuesta(400, { error: 'Falta el identificador del proceso.' });
      return respuesta(200, await procesarPagina(db, jobId));
    }

    if (body.action === 'retroactive-list') {
      const snapshot = await db.collection(COLECCION_ORDENES)
        .where('estatus', 'in', [...ESTATUS_CERRADOS])
        .get();
      const ordenes = [];
      for (const documento of snapshot.docs) {
        const datos = documento.data();
        const fecha = datos.cerrada_at
          ? fechaLegacy({ fecha_realizacion: datos.cerrada_at })
          : fechaLegacy(datos);
        if (!fecha) continue;
        ordenes.push({
          id: documento.id,
          folio_ot: datos.folio_ot || '',
          cerrada_at: fecha,
          fecha_inferida: !datos.cerrada_at || Boolean(datos.cierre_masivo_fecha_inferida)
        });
      }
      ordenes.sort((a, b) => Date.parse(a.cerrada_at) - Date.parse(b.cerrada_at));
      return respuesta(200, { ordenes });
    }

    if (body.action === 'retroactive-close') {
      const otId = String(body.ot_id || '').trim();
      if (!otId) return respuesta(400, { error: 'Falta el identificador de la OT.' });
      const fechaSolicitada = fechaLegacy({ fecha_realizacion: body.cerrada_at });
      if (!fechaSolicitada) return respuesta(400, { error: 'La fecha de cierre retroactivo no es válida.' });
      const ordenRef = db.collection(COLECCION_ORDENES).doc(otId);
      const snapshot = await ordenRef.get();
      if (!snapshot.exists) return respuesta(404, { error: 'No se encontró la Orden de Trabajo.' });
      const orden = { id: snapshot.id, ...snapshot.data() };
      if (!ESTATUS_CERRADOS.has(String(orden.estatus || '').toUpperCase())) {
        return respuesta(409, { error: 'La OT ya no tiene estatus terminado o cerrado.' });
      }
      const { jobId } = await abrirCierre(db, ordenRef, usuario, '', fechaSolicitada);
      return respuesta(200, await procesarPagina(db, jobId));
    }

    return respuesta(400, { error: 'Acción no reconocida.' });
  } catch (error) {
    console.error('Error en cierre masivo de fallas:', error);
    if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired' || error.code === 'auth/invalid-id-token') {
      return respuesta(401, { error: 'La sesión expiró. Inicia sesión nuevamente.' });
    }
    return respuesta(500, {
      error: error.message || 'No se pudo procesar el cierre masivo.'
    });
  }
}
