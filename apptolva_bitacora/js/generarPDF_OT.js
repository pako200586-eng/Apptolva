const CATALOGO_SISTEMAS = [
  { sistema: 'SUSPENSIÓN', palabrasClave: ['bujes', 'muelles', 'tirantes', 'amortiguador', 'bolsa de aire', 'lanza', 'tacones'] },
  { sistema: 'FRENOS / AIRE', palabrasClave: ['freno', 'balata', 'matraca', 'camara', 'manguera', 'fuga de aire', 'siroco', 'valvula', 'presion'] },
  { sistema: 'LLANTAS Y RINES', palabrasClave: ['llanta', 'ponchada', 'chipote', 'rin', 'birlo', 'tuerca', 'cambiar llantas', 'desgaste'] },
  { sistema: 'CARROCERÍA / CHASIS', palabrasClave: ['parabrisas', 'golpe', 'defensa', 'cofre', 'puerta', 'manija', 'espejo', 'ganchos', 'cadena', 'plafonera'] },
  { sistema: 'ELÉCTRICO / LUCES', palabrasClave: ['plafon', 'foco', 'calavera', 'faros', 'bateria', 'marcha', 'alternador', 'testigos', 'espias'] },
  { sistema: 'QUINTA RUEDA', palabrasClave: ['quinta', 'mordaza', 'plato', 'juego de quinta'] },
  { sistema: 'CLIMATIZACIÓN', palabrasClave: ['a/c', 'aire acondicionado', 'clima', 'compresor'] }
];

function generarDocumentoOT(dataOT) {
  const hoja = document.getElementById('hoja-ot');

  if (hoja) {
    const unidad = String(dataOT?.unidad || 'N/A');
    const folio = String(dataOT?.folio_ot || dataOT?.folio || 'N/A');
    const componente = String(dataOT?.componente || 'TRACTOCAMIÓN');
    const sistema = String(dataOT?.sistema || 'GENERAL / REVISIÓN');
    const operador = String(dataOT?.operador || '');
    const descripcion = String(dataOT?.descripcion_falla || dataOT?.descripcion || 'Sin descripción');
    const fecha = dataOT?.fecha_apertura
      ? new Date(dataOT.fecha_apertura).toLocaleDateString('es-MX')
      : new Date().toLocaleDateString('es-MX');

    const normalizedComponent = String(componente).toUpperCase();
    const selectedMark = normalizedComponent.includes('DOLLY')
      ? 'dolly'
      : normalizedComponent.includes('TOLVA')
        ? 'tolva'
        : 'tracto';

    document.querySelectorAll('.component-mark').forEach((mark) => {
      const shouldShow = mark.dataset.component === selectedMark;
      mark.classList.toggle('hidden', !shouldShow);
      mark.style.border = shouldShow ? '2px solid #d33' : '1px solid transparent';
      mark.style.borderRadius = shouldShow ? '6px' : '0';
      mark.style.padding = shouldShow ? '4px' : '0';
      mark.style.background = shouldShow ? '#fff7ed' : 'transparent';
    });

    document.getElementById('ot-unidad').textContent = unidad;
    document.getElementById('ot-folio').textContent = folio;
    document.getElementById('ot-componente').textContent = componente;
    document.getElementById('ot-trabajo').textContent = sistema;
    document.getElementById('ot-operador').textContent = operador;
    document.getElementById('ot-fecha').textContent = fecha;
    document.getElementById('ot-folio-checklist').textContent = String(dataOT?.folio_bitacora || 'N/A');
    document.getElementById('ot-descripcion').innerHTML = `SISTEMA: ${sistema} | ÍTEM: ${componente}<br>FALLA REPORTADA: ${descripcion}`;

    hoja.classList.remove('hidden');
    hoja.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.print();
    return;
  }

  if (!window.jspdf) {
    throw new Error('La librería jsPDF no está disponible.');
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  doc.setFillColor(220, 110, 20);
  doc.rect(0, 0, 210, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('ORDEN DE TRABAJO MANTENIMIENTO FF PA CHAPO', 105, 12, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Bachoco', 170, 18, { align: 'right' });
  doc.text('Flota propia planta de alimentos el Chapo', 14, 28);
  doc.text('Carretera El Chapo', 14, 32);
  doc.text('Muelle del Gavilán', 14, 36);

  const headersMatriz = [
    [
      { content: 'UNIDAD:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: dataOT?.unidad || '' },
      { content: 'FOLIO OT:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: String(dataOT?.folio_ot || 'N/A'), styles: { fontStyle: 'bold', textColor: [200, 0, 0] } }
    ],
    [
      { content: 'OPERADOR:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: dataOT?.operador || '' },
      { content: 'SISTEMA:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: dataOT?.sistema || 'CORRECTIVO' }
    ],
    [
      { content: 'COMPONENTE:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: dataOT?.componente || 'TRACTOCAMIÓN' },
      { content: 'TURNO:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: '' }
    ],
    [
      { content: 'FECHA:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: dataOT?.fecha_apertura ? new Date(dataOT.fecha_apertura).toLocaleDateString('es-MX') : new Date().toLocaleDateString('es-MX') },
      { content: 'FOLIO REPORT:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: String(dataOT?.folio_bitacora || dataOT?.reporte_id || 'N/A') }
    ]
  ];

  if (typeof doc.autoTable === 'function') {
    doc.autoTable({
      startY: 42,
      body: headersMatriz,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.8, lineColor: [100, 100, 100], lineWidth: 0.2 },
      columnStyles: { 0: { cellWidth: 36 }, 1: { cellWidth: 54 }, 2: { cellWidth: 34 }, 3: { cellWidth: 54 } }
    });
  }

  let curY = (typeof doc.lastAutoTable !== 'undefined' ? doc.lastAutoTable.finalY : 120) + 6;

  const bloques = [
    [{ content: `COMPONENTE AFECTADO: ${dataOT?.componente || 'TRACTOCAMIÓN'} - SISTEMA: ${dataOT?.sistema || 'GENERAL / REVISIÓN'}`, styles: { fontStyle: 'bold', fillColor: [230, 230, 230] } }],
    [{ content: `DESCRIPCIÓN DEL TRABAJO:\n${dataOT?.descripcion_falla || dataOT?.descripcion || 'Sin descripción'}\n(Recurrencias reportadas: ${dataOT?.recurrencia || 1})`, styles: { minCellHeight: 22 } }],
    [{ content: 'COMENTARIOS DEL EJECUTOR:', styles: { fontStyle: 'bold', fillColor: [230, 230, 230] } }],
    [{ content: '', styles: { minCellHeight: 15 } }],
    [{ content: 'COMENTARIOS DEL OPERADOR:', styles: { fontStyle: 'bold', fillColor: [230, 230, 230] } }],
    [{ content: '', styles: { minCellHeight: 15 } }]
  ];

  if (typeof doc.autoTable === 'function') {
    doc.autoTable({
      startY: curY,
      body: bloques,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2, lineColor: [100, 100, 100], lineWidth: 0.2 }
    });
    curY = doc.lastAutoTable.finalY + 8;
  }

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('TRACTOCAMIÓN', 18, curY);
  doc.text('TOLVA 1 / DOLLY / TOLVA 2', 18, curY + 30);

  const posYFirmas = 248;
  doc.line(22, posYFirmas, 85, posYFirmas);
  doc.line(125, posYFirmas, 190, posYFirmas);
  doc.setFontSize(7);
  doc.text('EJECUTÓ MANTENIMIENTO', 53, posYFirmas + 4, { align: 'center' });
  doc.text('OPERADOR QUE VALIDA', 158, posYFirmas + 4, { align: 'center' });

  doc.setFillColor(0, 150, 60);
  doc.rect(14, 260, 182, 3, 'F');

  const blobUrl = doc.output('bloburl');
  window.open(blobUrl, '_blank');
}

if (typeof window !== 'undefined') {
  window.generarDocumentoOT = generarDocumentoOT;
}

if (typeof globalThis !== 'undefined') {
  globalThis.generarDocumentoOT = generarDocumentoOT;
}

export { CATALOGO_SISTEMAS, generarDocumentoOT };
