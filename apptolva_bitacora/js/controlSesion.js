const CLAVE_ESPACIO = 'apptolva_espacio_operativo_v1';
const CLAVE_PERFIL = 'apptolva_perfil_v1';
const ROLES = new Set(['operador', 'master', 'admin', 'lectura']);
const PREFIJO_RESPALDO = 'apptolva_pending_firestore_backup_';

export function guardarRespaldoReporte(storage, projectId, uid, data) {
  if (!projectId || !uid || !data?.id || data.owner_uid !== uid) {
    throw new Error('No se pudo identificar al propietario del reporte.');
  }
  const key = PREFIJO_RESPALDO + data.id;
  const contenido = JSON.stringify({ projectId, uid, data });
  const anterior = storage.getItem(key);
  if (anterior && anterior !== contenido) throw new Error('Ya existe un respaldo diferente con ese identificador.');
  storage.setItem(key, contenido);
}

export function listarRespaldosReportes(storage, projectId, uid) {
  const result = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key.startsWith(PREFIJO_RESPALDO)) continue;
    const raw = storage.getItem(key);
    let backup;
    try { backup = JSON.parse(raw); } catch { throw new Error('Hay un respaldo de reporte dañado; no lo borres y contacta al administrador.'); }
    if (!backup || !backup.data || typeof backup.data.id !== 'string' ||
        key !== PREFIJO_RESPALDO + backup.data.id || backup.data.owner_uid !== backup.uid) {
      throw new Error('Hay un respaldo de reporte inválido; no lo borres y contacta al administrador.');
    }
    if (backup.projectId === projectId && backup.uid === uid) result.push(backup.data);
  }
  return result;
}

export function borrarRespaldoReporte(storage, projectId, uid, data) {
  const key = PREFIJO_RESPALDO + data.id;
  const esperado = JSON.stringify({ projectId, uid, data });
  if (storage.getItem(key) === esperado) storage.removeItem(key);
}

export function intervaloHistorial(now = Date.now()) {
  return {
    desde: new Date(now - 48 * 60 * 60 * 1000).toISOString(),
    hasta: new Date(now).toISOString()
  };
}

export function hayTrabajoAnterior(storage) {
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key === 'bachoco_tolva_draft_v9' || key === 'nombreOperadorActual' ||
        key.startsWith('apptolva_pending_firestore_') || key.startsWith('apptolva_sig_') ||
        (key.startsWith('nom087_') && key !== 'nom087_device_id')) {
      if (storage.getItem(key)) return true;
    }
  }
  return false;
}

function leerObjeto(storage, key) {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export function validarEspacio(storage, projectId, user) {
  const espacio = leerObjeto(storage, CLAVE_ESPACIO);
  if (!espacio) {
    if (storage.getItem(CLAVE_ESPACIO) || hayTrabajoAnterior(storage)) {
      throw new Error('Hay datos de una sesión anterior sin propietario confirmado. Termina y sincroniza ese trabajo antes de cambiar de cuenta.');
    }
    return;
  }
  if (espacio.projectId !== projectId || espacio.uid !== user.uid) {
    throw new Error('Este dispositivo contiene datos de otra cuenta o entorno. Usa otro perfil de navegador para evitar mezclar o perder pendientes.');
  }
}

export function registrarEspacio(storage, projectId, user) {
  validarEspacio(storage, projectId, user);
  storage.setItem(CLAVE_ESPACIO, JSON.stringify({ projectId, uid: user.uid, email: user.email?.toLowerCase() || '' }));
}

export function validarEntrada(storage, projectId, email) {
  const espacio = leerObjeto(storage, CLAVE_ESPACIO);
  if (!espacio) {
    if (storage.getItem(CLAVE_ESPACIO) || hayTrabajoAnterior(storage)) {
      throw new Error('Hay datos de una sesión anterior sin propietario confirmado. Termina y sincroniza ese trabajo antes de cambiar de cuenta.');
    }
    return;
  }
  if (espacio.projectId !== projectId || espacio.email !== email.toLowerCase()) {
    throw new Error('Este dispositivo contiene datos de otra cuenta o entorno. Usa otro perfil de navegador para evitar mezclar o perder pendientes.');
  }
}

export function perfilValido(data, nombreAlternativo = '') {
  if (!data || !ROLES.has(data.rol)) return null;
  const nombre = typeof data.nombre === 'string' && data.nombre.trim()
    ? data.nombre.trim() : nombreAlternativo;
  return nombre ? { rol: data.rol, nombre, rolEvaluaciones: data.rol_evaluaciones || null } : null;
}

export function permisosMenu(user, profile) {
  return {
    operacion: user?.isAnonymous === true || profile?.rol === 'operador',
    panel: ['admin', 'master', 'lectura'].includes(profile?.rol),
    evaluaciones: ['admin', 'evaluador'].includes(profile?.rolEvaluaciones)
  };
}

export function guardarPerfil(storage, projectId, uid, profile) {
  storage.setItem(CLAVE_PERFIL, JSON.stringify({ projectId, uid, profile }));
}

export function leerPerfil(storage, projectId, uid) {
  const cached = leerObjeto(storage, CLAVE_PERFIL);
  if (!cached || cached.projectId !== projectId || cached.uid !== uid) return null;
  const profile = cached.profile;
  if (!profile || !ROLES.has(profile.rol) || typeof profile.nombre !== 'string' || !profile.nombre.trim()) return null;
  return profile;
}

export function borrarPerfil(storage) {
  storage.removeItem(CLAVE_PERFIL);
}
