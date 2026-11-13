const REGLAS = [
  { tipo: 'ERGONÓMICO', expresion: /manivela|compuerta\s*dura|dura\s*para\s*(abrir|cerrar)|atorad/i },
  { tipo: 'VIAL', expresion: /7\s*v[ií]as|siete\s*v[ií]as|cable\s*el[eé]ctrico|chup[oó]n\s*el[eé]ctrico|enchufes\s*7\s*v[ií]as/i },
  { tipo: 'VIAL/ERGONÓMICO', expresion: /[cs]intur[oó]n|broche\s*de\s*seguridad/i },
  { tipo: 'ERGONÓMICO', expresion: /pasamanos|escal[oó]n|estribo|respaldo|asiento/i },
  { tipo: 'VIAL', expresion: /plaf[oó]n|luces|stop|torreta|banderola|reversero/i },
  { tipo: 'VIAL', expresion: /perno\s*rey|quinta\s*rueda|puente\s*inferior|pat[ií]n|patines/i }
];
const CRITICA = /dura|atorad|roto|falta|sin\s+cable|quebrado|juego/i;
const SIETE_DIAS = 7 * 24 * 60 * 60 * 1000;

export function calcularAlertasSeguridad(incidencias, ahora = Date.now()) {
  const equipos = new Map();
  incidencias.forEach(({ reporteId, folio, equipoId, tipoEquipo, fecha, texto, detalle, estado }) => {
    const tiempo = new Date(fecha).getTime();
    if (!Number.isFinite(tiempo) || tiempo < ahora - SIETE_DIAS || tiempo > ahora) return;
    if (estado !== 'PENDIENTE') return;
    const riesgos = REGLAS.filter((regla) => regla.expresion.test(texto));
    if (!riesgos.length) return;
    const id = String(equipoId || '').trim().toUpperCase();
    if (!id || id === 'S/N') return;
    const grupo = equipos.get(id) || { equipoId: id, tipoEquipo, reportes: new Set(), riesgos: new Set(), detalles: new Map(), critico: false };
    grupo.reportes.add(String(reporteId));
    riesgos.forEach((riesgo) => grupo.riesgos.add(riesgo.tipo));
    grupo.critico ||= CRITICA.test(texto);
    const descripcion = String(detalle || texto || '').replace(/\s+/g, ' ').trim();
    const detalleCorto = descripcion.length > 120 ? `${descripcion.slice(0, 117)}...` : descripcion;
    const folioReporte = String(folio || reporteId || 'S/F');
    grupo.detalles.set(JSON.stringify([folioReporte, detalleCorto]), { folio: folioReporte, detalle: detalleCorto });
    equipos.set(id, grupo);
  });
  return [...equipos.values()]
    .filter((grupo) => grupo.reportes.size >= 2 || grupo.critico)
    .map((grupo) => ({ ...grupo, reportes: grupo.reportes.size, riesgos: [...grupo.riesgos], detalles: [...grupo.detalles.values()] }))
    .sort((a, b) => Number(b.critico) - Number(a.critico) || b.reportes - a.reportes || a.equipoId.localeCompare(b.equipoId));
}
