import {
  getFirebaseConfig, initializeApp, getAuth, onAuthStateChanged,
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, setDoc
} from './firebase-sdk.js';
import {
  borrarRespaldoReporte, guardarRespaldoReporte, leerPerfil,
  listarRespaldosReportes, validarEspacio
} from './controlSesion.js';

const button = document.getElementById('btnRegistrarEmergencia');
const status = document.getElementById('fallaSaveStatus');
let usuario = null;
let db;
let projectId;
const observadores = new Map();

function mostrarEstado(texto, color) {
  status.className = `text-center text-xs font-bold mt-3 p-2 rounded ${color}`;
  status.textContent = texto;
}

function observarReporte(data, user, alPendiente = () => {}, alError = () => {}) {
  if (observadores.has(data.id)) return;
  const ref = doc(db, 'bitacora_reports', data.id);
  const unsubscribe = onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
    if (!snap.exists() || usuario?.uid !== user.uid) return;
    if (snap.metadata.hasPendingWrites) {
      mostrarEstado('Guardado en este dispositivo; pendiente de sincronización con el servidor.', 'bg-amber-100 text-amber-700');
      alPendiente();
    } else if (!snap.metadata.fromCache) {
      borrarRespaldoReporte(localStorage, projectId, user.uid, data);
      mostrarEstado(`Emergencia ${data.folio} confirmada por el servidor.`, 'bg-green-100 text-green-700');
      observadores.get(data.id)?.();
      observadores.delete(data.id);
    }
  }, (error) => {
    console.error('Error al comprobar la emergencia:', error);
    mostrarEstado(`No se pudo confirmar la emergencia: ${error.message}. El respaldo sigue en este dispositivo.`, 'bg-red-100 text-red-700');
    observadores.delete(data.id);
    alError(error);
  });
  observadores.set(data.id, unsubscribe);
}

try {
  const config = getFirebaseConfig();
  projectId = config.projectId;
  const app = initializeApp(config);
  const auth = getAuth(app);
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });

  onAuthStateChanged(auth, (user) => {
    observadores.forEach((unsubscribe) => unsubscribe());
    observadores.clear();
    usuario = null;
    button.disabled = true;
    try {
      if (!user) throw new Error('Inicia sesión desde el menú antes de registrar una emergencia.');
      let perfil = null;
      if (user.isAnonymous) {
        if (sessionStorage.getItem(`apptolva_legacy_${projectId}`) !== user.uid) {
          throw new Error('Vuelve al menú y habilita la sesión anterior antes de registrar.');
        }
      } else {
        validarEspacio(localStorage, projectId, user);
        perfil = leerPerfil(localStorage, projectId, user.uid);
        if (!perfil) {
          throw new Error('Vuelve al menú para validar tu sesión antes de registrar.');
        }
      }
      usuario = user;
      const operador = document.getElementById('fallaOperador');
      if (!operador.value.trim()) {
        operador.value = localStorage.getItem('nombreOperadorActual')
          || localStorage.getItem('nom087_driverName') || localStorage.getItem('driverName') || perfil?.nombre || '';
      }
      const pendientes = listarRespaldosReportes(localStorage, projectId, user.uid)
        .filter((data) => data.report_type === 'emergencia');
      pendientes.forEach((data) => observarReporte(data, user));
      mostrarEstado(pendientes.length
        ? `Hay ${pendientes.length} emergencia(s) pendiente(s). Para reintentar un respaldo, vuelve al menú.`
        : 'Sesión lista para registrar.', 'bg-blue-100 text-blue-700');
      button.disabled = false;
    } catch (error) {
      console.error('No se pudo habilitar el registro de emergencias:', error);
      mostrarEstado(error.message, 'bg-red-100 text-red-700');
    }
  });

  window.registrarEmergenciaEnSistema = async () => {
    if (!usuario || auth.currentUser?.uid !== usuario.uid) {
      mostrarEstado('Inicia sesión desde el menú antes de registrar.', 'bg-red-100 text-red-700');
      return;
    }
    const user = usuario;
    const unidad = document.getElementById('fallaUnidad').value.trim().toUpperCase();
    const descripcion = document.getElementById('fallaDesc').value.trim();
    if (!unidad || !descripcion) {
      mostrarEstado('Escribe la unidad y describe la falla.', 'bg-red-100 text-red-700');
      return;
    }
    button.disabled = true;
    mostrarEstado('Obteniendo ubicación y preparando el registro...', 'bg-blue-100 text-blue-700');
    let respaldoCreado = false;
    let bloquearReintento = false;
    try {
      let gps;
      try {
        gps = await window.obtenerUbicacionActual();
      } catch (error) {
        console.warn('Se usará la ubicación capturada anteriormente, si está disponible:', error);
      }
      if (auth.currentUser?.uid !== user.uid || usuario?.uid !== user.uid) {
        throw new Error('La sesión cambió. Vuelve al menú antes de registrar.');
      }
      const payload = window.construirPayload();
      if (payload.km && !/^\d{1,30}$/.test(payload.km)) {
        throw new Error('El kilometraje debe contener solo dígitos.');
      }
      const ubicacion = gps || payload.gps;
      const ref = doc(collection(db, 'bitacora_reports'));
      const data = {
        id: ref.id,
        owner_uid: user.uid,
        folio: `EMG-${ref.id}`,
        report_type: 'emergencia',
        unit_id: unidad,
        driver_name: payload.operador,
        priority: 'maxima',
        created_at: payload.fecha,
        payload: {
          descripcion,
          tolva1: payload.tolva1,
          dolly: payload.dolly,
          tolva2: payload.tolva2,
          km: payload.km,
          gps: ubicacion ? {
            lat: ubicacion.lat, lng: ubicacion.lng,
            accuracy: ubicacion.accuracy, capturedAt: ubicacion.capturedAt
          } : null,
          fotoBase64: payload.fotoBase64
        }
      };
      if ((data.payload.fotoBase64?.length || 0) > 600000 || new Blob([JSON.stringify(data)]).size > 800000) {
        throw new Error('La foto es demasiado grande. Selecciona una imagen más pequeña.');
      }
      guardarRespaldoReporte(localStorage, projectId, user.uid, data);
      respaldoCreado = true;
      let pendiente;
      let errorLocal;
      const guardadoLocal = new Promise((resolve, reject) => { pendiente = resolve; errorLocal = reject; });
      const escritura = setDoc(ref, data);
      observarReporte(data, user, pendiente, errorLocal);
      escritura.then(() => {
        borrarRespaldoReporte(localStorage, projectId, user.uid, data);
      }, (error) => {
        console.error('No se pudo sincronizar la emergencia:', error);
        mostrarEstado(`No se pudo sincronizar: ${error.message}. El respaldo sigue en este dispositivo.`, 'bg-red-100 text-red-700');
      }).catch((error) => console.error('No se pudo actualizar el respaldo de emergencia:', error));
      await Promise.race([escritura, guardadoLocal]);
      document.getElementById('fallaUnidad').value = '';
      document.getElementById('fallaTolva1').value = '';
      document.getElementById('fallaDolly').value = '';
      document.getElementById('fallaTolva2').value = '';
      document.getElementById('fallaKm').value = '';
      document.getElementById('fallaDesc').value = '';
      document.getElementById('fallaFotoInput').value = '';
      document.getElementById('fallaFotoPreview').classList.add('hidden');
      document.getElementById('fallaFotoLabel').textContent = 'TOMAR FOTO DE EVIDENCIA';
      window.limpiarFotoEmergencia();
    } catch (error) {
      bloquearReintento = respaldoCreado;
      console.error('No se pudo registrar la emergencia:', error);
      mostrarEstado(`No se pudo registrar: ${error.message}${respaldoCreado ? '. Reintenta el respaldo desde el menú.' : ''}`, 'bg-red-100 text-red-700');
    } finally {
      button.disabled = !usuario || bloquearReintento;
    }
  };
} catch (error) {
  console.error('No se pudo iniciar Firebase para emergencias:', error);
  mostrarEstado(`No se pudo iniciar el registro: ${error.message}`, 'bg-red-100 text-red-700');
}
