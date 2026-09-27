// Generador del PDF "ORDEN DE TRABAJO MANTENIMIENTO FP PA CHAPO" (Grupo Bachoco).
// Se carga como <script> clásico, por eso NO usa `export`: la función queda en window.
// Replica el formato oficial usando jsPDF (js/jspdf.min.js) y descarga el archivo .pdf
// directamente, sin ventanas emergentes ni dependencias de CDN.
(function () {
  const CATALOGO_SISTEMAS = [
    { sistema: 'SUSPENSIÓN', palabrasClave: ['bujes', 'muelles', 'tirantes', 'amortiguador', 'bolsa de aire', 'lanza', 'tacones'] },
    { sistema: 'FRENOS / AIRE', palabrasClave: ['freno', 'balata', 'matraca', 'camara', 'manguera', 'fuga de aire', 'siroco', 'valvula', 'presion'] },
    { sistema: 'LLANTAS Y RINES', palabrasClave: ['llanta', 'ponchada', 'chipote', 'rin', 'birlo', 'tuerca', 'cambiar llantas', 'desgaste'] },
    { sistema: 'CARROCERÍA / CHASIS', palabrasClave: ['parabrisas', 'golpe', 'defensa', 'cofre', 'puerta', 'manija', 'espejo', 'ganchos', 'cadena', 'plafonera'] },
    { sistema: 'ELÉCTRICO / LUCES', palabrasClave: ['plafon', 'foco', 'calavera', 'faros', 'bateria', 'marcha', 'alternador', 'testigos', 'espias'] },
    { sistema: 'QUINTA RUEDA', palabrasClave: ['quinta', 'mordaza', 'plato', 'juego de quinta'] },
    { sistema: 'CLIMATIZACIÓN', palabrasClave: ['a/c', 'aire acondicionado', 'clima', 'compresor'] }
  ];

  const SUPERVISOR_DEFAULT = 'Pedro Palomec';

  const IMAGENES_OT = {
    logo: './img/ot/logo.jpg',
    tracto: './img/ot/tracto.jpg',
    tolva1: './img/ot/tolva1.jpg',
    tolva2: './img/ot/tolva2.jpg',
    dolly1: './img/ot/dolly1.jpg',
    dolly2: './img/ot/dolly2.jpg'
  };

  const COLORES = {
    borde: [150, 150, 150],
    negro: [0, 0, 0],
    etiqueta: [217, 222, 230],
    titulo: [110, 110, 110],
    texto: [30, 30, 30],
    verde: [80, 184, 72],
    naranja: [227, 119, 34]
  };

  const cacheImagenes = {};

  function cargarImagen(url) {
    if (!cacheImagenes[url]) {
      cacheImagenes[url] = new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext('2d').drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.92));
          } catch (error) {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }
    return cacheImagenes[url];
  }

  async function cargarImagenesOT() {
    const entradas = await Promise.all(
      Object.entries(IMAGENES_OT).map(async ([clave, url]) => [clave, await cargarImagen(url)])
    );
    return Object.fromEntries(entradas);
  }

  function texto(valor) {
    return valor == null ? '' : String(valor).trim();
  }

  function obtenerPayload(ordenData) {
    const payload = ordenData.payload;
    if (!payload) return {};
    if (typeof payload === 'string') {
      try { return JSON.parse(payload) || {}; } catch (error) { return {}; }
    }
    return payload;
  }

  function formatearFecha(valor) {
    const fecha = valor ? new Date(valor) : new Date();
    if (Number.isNaN(fecha.getTime())) return texto(valor);
    return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // "2026-09-27" -> "27/09/2026" sin pasar por Date (evita el desfase de zona horaria).
  function formatearFechaCorta(valor) {
    const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
    return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : valor;
  }

  function construirDatosOT(ordenData) {
    const payload = obtenerPayload(ordenData);
    const pick = (...claves) => {
      for (const clave of claves) {
        const valor = texto(ordenData[clave] ?? payload[clave]);
        if (valor) return valor;
      }
      return '';
    };

    const componente = pick('componente') || 'TRACTOCAMIÓN';
    const sistema = pick('sistema');
    const falla = pick('descripcion_falla', 'descripcion', 'observaciones') || 'Sin descripción';

    return {
      folioOT: ordenData.folio_ot ? `OT-${ordenData.folio_ot}` : (pick('folio') || 'S/F'),
      unidad: pick('unidad'),
      operador: pick('operador'),
      electromecanico: pick('electromecanico'),
      proveedor: pick('proveedor_externo', 'proveedor'),
      tolva1: pick('tolva1'),
      tolva2: pick('tolva2'),
      dolly: pick('dolly'),
      folioCheckList: pick('folio_bitacora', 'folio_checklist') || texto(ordenData.reporte_id),
      fechaSolicitud: formatearFecha(ordenData.fecha_apertura || payload.fecha),
      fechaRealizacion: formatearFechaCorta(pick('fecha_realizacion')),
      kilometraje: pick('kilometraje', 'km'),
      supervisor: pick('supervisor_mantenimiento') || SUPERVISOR_DEFAULT,
      descripcion: `${componente}${sistema ? ` | ${sistema}` : ''}: ${falla}`,
      comentariosEjecutor: pick('comentarios_ejecutor'),
      comentariosOperador: pick('comentarios_operador')
    };
  }

  function dibujarOT(doc, datos, imagenes) {
    // Coordenadas en mm (A4 vertical), tomadas del formato oficial.
    const X0 = 19.4;   // borde izquierdo de la tabla
    const X1 = 43.3;   // fin de la columna de etiquetas
    const X2 = 90.5;   // inicio del bloque derecho
    const X3 = 113.6;  // inicio de valores del bloque derecho
    const XF = 161.4;  // borde derecho de la tabla
    const ANCHO = XF - X0;

    const setColor = (tipo, color) => doc[tipo](color[0], color[1], color[2]);

    const celda = (x, y, w, h, opciones = {}) => {
      setColor('setDrawColor', opciones.bordeColor || COLORES.borde);
      doc.setLineWidth(opciones.grosor || 0.2);
      if (opciones.relleno) {
        setColor('setFillColor', opciones.relleno);
        doc.rect(x, y, w, h, 'FD');
      } else {
        doc.rect(x, y, w, h, 'S');
      }
    };

    const escribir = (contenido, x, y, w, h, opciones = {}) => {
      if (!contenido) return;
      doc.setFont('helvetica', opciones.negrita ? 'bold' : 'normal');
      doc.setFontSize(opciones.tamano || 5.5);
      setColor('setTextColor', opciones.color || COLORES.texto);
      const lineas = doc.splitTextToSize(String(contenido), w - 1.6);
      const alto = (opciones.tamano || 5.5) * 0.3528 * 1.15;
      const maxLineas = Math.max(1, Math.floor((h - 0.8) / alto));
      const visibles = lineas.slice(0, maxLineas);
      const bloque = visibles.length * alto;
      const inicioY = opciones.vAlign === 'top'
        ? y + 0.8 + alto * 0.8
        : opciones.vAlign === 'bottom'
          ? y + h - 0.8 - bloque + alto * 0.8
          : y + (h - bloque) / 2 + alto * 0.8;
      const align = opciones.align || 'left';
      const tx = align === 'center' ? x + w / 2 : align === 'right' ? x + w - 0.8 : x + 0.8;
      visibles.forEach((linea, i) => doc.text(linea, tx, inicioY + i * alto, { align }));
    };

    const etiqueta = (contenido, x, y, w, h, opciones = {}) => {
      celda(x, y, w, h, { relleno: opciones.sinRelleno ? null : COLORES.etiqueta });
      escribir(contenido, x, y, w, h, { negrita: true, tamano: 4.6, align: opciones.align || 'center', vAlign: opciones.vAlign });
    };

    const valor = (contenido, x, y, w, h, opciones = {}) => {
      celda(x, y, w, h, { grosor: opciones.grosor, bordeColor: opciones.bordeColor });
      escribir(contenido, x, y, w, h, { tamano: opciones.tamano || 6.5, negrita: opciones.negrita, color: opciones.color, align: opciones.align || 'left' });
    };

    const imagen = (dataUrl, x, y, w, h, leyenda) => {
      if (dataUrl) {
        doc.addImage(dataUrl, 'JPEG', x, y, w, h, undefined, 'FAST');
        return;
      }
      setColor('setDrawColor', COLORES.borde);
      doc.setLineDashPattern([1, 1], 0);
      doc.rect(x, y, w, h, 'S');
      doc.setLineDashPattern([], 0);
      escribir(leyenda, x, y, w, h, { tamano: 5, color: COLORES.titulo, align: 'center' });
    };

    // ENCABEZADO
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setColor('setTextColor', COLORES.titulo);
    doc.text('ORDEN DE TRABAJO MANTENIMIENTO FP PA CHAPO', X0 + ANCHO / 2, 22.5, { align: 'center' });

    doc.setFontSize(5);
    setColor('setTextColor', COLORES.texto);
    doc.text('Flota propia planta de alimentos el Chapo', 20.1, 35);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(4.8);
    doc.text('Localidad:  El chapo', 20.1, 37.8);
    doc.text('Ixhuatlan del Sureste', 20.1, 40.7);

    if (imagenes.logo) {
      doc.addImage(imagenes.logo, 'JPEG', 110.6, 27, 44.4, 17.1, undefined, 'FAST');
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(26);
      setColor('setTextColor', COLORES.naranja);
      doc.text('Bachoco', 132.8, 39, { align: 'center' });
      setColor('setDrawColor', COLORES.verde);
      doc.setLineWidth(0.8);
      doc.line(113, 42.5, 152.5, 42.5);
    }

    // TABLA DE DATOS
    const filas = [
      { y: 45.2, h: 5.6 },  // Unidad / Folio OT
      { y: 50.8, h: 5.6 },  // Operador / Tolva 1
      { y: 56.4, h: 8.8 },  // Electromecánico / Tolva 2 + Dolly
      { y: 65.2, h: 5.8 },  // Proveedor / Folio check list
      { y: 71.0, h: 6.8 },  // Fechas y kilometraje
      { y: 79.0, h: 5.6 }   // Supervisor / Firma
    ];

    const [f1, f2, f3, f4, f5, f6] = filas;

    etiqueta('UNIDAD', X0, f1.y, X1 - X0, f1.h);
    valor(datos.unidad, X1, f1.y, X2 - X1, f1.h, { negrita: true, tamano: 8 });
    etiqueta('FOLIO ORDEN TRABAJO', X2, f1.y, X3 - X2, f1.h, { sinRelleno: true, vAlign: 'bottom' });
    valor(datos.folioOT, X3, f1.y, XF - X3, f1.h, { grosor: 0.5, bordeColor: COLORES.negro, negrita: true, tamano: 9, color: [200, 30, 30], align: 'center' });

    etiqueta('NOMBRE DEL OPERADOR', X0, f2.y, X1 - X0, f2.h);
    valor(datos.operador, X1, f2.y, X2 - X1, f2.h);
    etiqueta('TOLVA 1', X2, f2.y, X3 - X2, f2.h, { align: 'left' });
    valor(datos.tolva1, X3, f2.y, XF - X3, f2.h);

    etiqueta('ELECTROMECÁNICO ASIGNADO', X0, f3.y, X1 - X0, f3.h);
    valor(datos.electromecanico, X1, f3.y, X2 - X1, f3.h);
    etiqueta('TOLVA2', X2, f3.y, X3 - X2, f3.h / 2, { align: 'left' });
    valor(datos.tolva2, X3, f3.y, XF - X3, f3.h / 2);
    etiqueta('DOLLY', X2, f3.y + f3.h / 2, X3 - X2, f3.h / 2, { align: 'left' });
    valor(datos.dolly, X3, f3.y + f3.h / 2, XF - X3, f3.h / 2);

    etiqueta('PROVEEDOR EXTERNO', X0, f4.y, X1 - X0, f4.h);
    valor(datos.proveedor, X1, f4.y, X2 - X1, f4.h);
    etiqueta('FOLIO CHECK LIST', X2, f4.y, X3 - X2, f4.h, { align: 'left' });
    valor(datos.folioCheckList, X3, f4.y, XF - X3, f4.h, { negrita: true });

    const XFS = 67.4;   // fin del valor "Fecha de la solicitud"
    const XKM = 136.4;  // inicio del valor "Kilometraje"
    etiqueta('FECHA DE LA SOLICITUD', X0, f5.y, X1 - X0, f5.h);
    valor(datos.fechaSolicitud, X1, f5.y, XFS - X1, f5.h, { grosor: 0.4, bordeColor: COLORES.negro });
    etiqueta('FECHA DE REALIZACION', XFS, f5.y, X2 - XFS, f5.h);
    valor(datos.fechaRealizacion, X2, f5.y, X3 - X2, f5.h);
    etiqueta('KILOMETRAJE', X3, f5.y, XKM - X3, f5.h);
    valor(datos.kilometraje, XKM, f5.y, XF - XKM, f5.h);

    etiqueta('SUPERVISOR MANTENIMIENTO', X0, f6.y, X1 - X0, f6.h);
    valor(datos.supervisor, X1, f6.y, X2 - X1, f6.h, { tamano: 5.5 });
    etiqueta('FIRMA', X2, f6.y, X3 - X2, f6.h, { align: 'right' });
    valor('', X3, f6.y, XF - X3, f6.h);

    // SECCIONES DESCRIPTIVAS (etiqueta gris a la izquierda y línea gruesa inferior)
    const secciones = [
      { titulo: 'DESCRIPCIÓN DEL TRABAJO', contenido: datos.descripcion, y: 84.6, h: 13.8 },
      { titulo: 'COMENTARIOS DEL EJECUTOR', contenido: datos.comentariosEjecutor, y: 99.0, h: 11.2 },
      { titulo: 'COMENTARIOS DEL OPERADOR', contenido: datos.comentariosOperador, y: 110.7, h: 18.3 }
    ];

    secciones.forEach((seccion) => {
      setColor('setFillColor', COLORES.etiqueta);
      doc.rect(X0, seccion.y, X1 - X0, seccion.h, 'F');
      escribir(seccion.titulo, X0, seccion.y, X1 - X0, seccion.h, { negrita: true, tamano: 4.6, align: 'center' });
      escribir(seccion.contenido, X1 + 1, seccion.y, XF - X1 - 1, seccion.h, { negrita: true, tamano: 7, vAlign: 'top' });
      setColor('setDrawColor', COLORES.negro);
      doc.setLineWidth(0.5);
      doc.line(X0, seccion.y + seccion.h, XF, seccion.y + seccion.h);
    });

    // ESQUEMAS DE INSPECCIÓN (marcar el área intervenida a mano)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    setColor('setTextColor', COLORES.texto);
    doc.text('TRACTOCAMION', 20.1, 143.3);
    imagen(imagenes.tracto, 50.5, 135.3, 74.5, 30.5, 'Diagrama tractocamión');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    setColor('setTextColor', COLORES.texto);
    doc.text('TOLVA', 20.1, 173.4);
    imagen(imagenes.tolva1, 25.8, 174.2, 39.3, 28.9, 'Tolva (lateral)');
    imagen(imagenes.tolva2, 84.6, 170.3, 42.8, 32.9, 'Tolva (posterior)');

    imagen(imagenes.dolly1, 26.0, 211.5, 46.3, 31.2, 'Dolly (vista isométrica)');
    imagen(imagenes.dolly2, 89.7, 217.0, 62.9, 24.5, 'Dolly (vista lateral)');

    // FIRMAS
    setColor('setDrawColor', COLORES.negro);
    doc.setLineWidth(0.25);
    doc.line(43.6, 256.4, 67.3, 256.4);
    doc.line(114.2, 256.4, 136.4, 256.4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(4.6);
    setColor('setTextColor', COLORES.texto);
    doc.text('EJECUTO MANTENIMIENTO', 55.4, 259.2, { align: 'center' });
    doc.text('OPERADOR QUE VALIDA', 125.3, 259.2, { align: 'center' });

    // FRANJA VERDE INSTITUCIONAL
    setColor('setFillColor', COLORES.verde);
    doc.rect(X0, 263.8, ANCHO, 10.2, 'F');
  }

  async function imprimirOT_Bachoco(ordenData = {}) {
    const jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) {
      throw new Error('La librería jsPDF no está disponible.');
    }

    const datos = construirDatosOT(ordenData || {});
    const imagenes = await cargarImagenesOT();

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setProperties({
      title: `Orden de Trabajo ${datos.folioOT}`,
      subject: 'Orden de trabajo mantenimiento FP PA Chapo',
      author: 'Grupo Bachoco - Flota propia'
    });

    dibujarOT(doc, datos, imagenes);

    const nombreArchivo = `${datos.folioOT}${datos.unidad ? `_${datos.unidad}` : ''}`.replace(/[^\w.-]+/g, '_');
    doc.save(`${nombreArchivo}.pdf`);
    return doc;
  }

  window.CATALOGO_SISTEMAS_OT = CATALOGO_SISTEMAS;
  window.imprimirOT_Bachoco = imprimirOT_Bachoco;
})();
