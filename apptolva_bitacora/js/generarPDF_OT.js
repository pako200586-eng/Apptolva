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
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter'
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('ORDEN DE TRABAJO MANTENIMIENTO FF PA CHAPO', 105, 14, { align: 'center' });

  doc.setFontSize(13);
  doc.setTextColor(232, 119, 34);
  doc.text('Bachoco', 195, 18, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Flota propia planta de alimentos el Chapo', 15, 18);
  doc.text('Carretera El Chapo', 15, 21);
  doc.text('Muelle del Gavilán', 15, 24);

  const fechaHoy = new Date().toLocaleDateString('es-MX');
  const matrizDatos = [
    [
      { content: 'UNIDAD:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: String(dataOT?.unidad || '') },
      { content: 'FOLIO ORDEN TRABAJO:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: `OT-${dataOT?.folio_ot || dataOT?.folio || ''}`, styles: { fontStyle: 'bold', textColor: [200, 0, 0] } }
    ],
    [
      { content: 'NOMBRE DEL OPERADOR:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: String(dataOT?.operador || '') },
      { content: 'TRABAJO:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: String(dataOT?.sistema || 'CORRECTIVO') }
    ],
    [
      { content: 'ELECTROMECÁNICO ASIGNADO:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: '' },
      { content: 'TURNO:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: '' }
    ],
    [
      { content: 'FECHA DE ASIGNACIÓN:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: fechaHoy },
      { content: 'FOLIO CHECK-LIST:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: String(dataOT?.folio_bitacora || dataOT?.reporteId || 'N/A') }
    ],
    [
      { content: 'SERVICIO MANTENIMIENTO:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: 'CORRECTIVO DERIVADO DE BITÁCORA' },
      { content: 'FIRMA:', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: '' }
    ]
  ];

  doc.autoTable({
    startY: 28,
    margin: { left: 15, right: 15 },
    body: matrizDatos,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5, lineColor: [80, 80, 80], lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 52 },
      2: { cellWidth: 42 },
      3: { cellWidth: 50 }
    }
  });

  const startDescY = doc.lastAutoTable.finalY + 3;
  const descripcionCompleta = `COMPONENTE AFECTADO: ${dataOT?.componente || 'GENERAL'}\nSISTEMA: ${dataOT?.sistema || ''}\nDESCRIPCIÓN DE LA FALLA: ${dataOT?.descripcion_falla || dataOT?.descripcion || ''}`;

  doc.autoTable({
    startY: startDescY,
    margin: { left: 15, right: 15 },
    body: [
      [{ content: 'DESCRIPCIÓN DEL TRABAJO A REALIZAR:', styles: { fontStyle: 'bold', fillColor: [230, 230, 230] } }],
      [{ content: descripcionCompleta, styles: { minCellHeight: 18 } }],
      [{ content: 'COMENTARIOS DEL EJECUTOR (TALLER):', styles: { fontStyle: 'bold', fillColor: [230, 230, 230] } }],
      [{ content: '', styles: { minCellHeight: 14 } }],
      [{ content: 'COMENTARIOS DEL OPERADOR AL RECIBIR:', styles: { fontStyle: 'bold', fillColor: [230, 230, 230] } }],
      [{ content: '', styles: { minCellHeight: 14 } }]
    ],
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.8, lineColor: [80, 80, 80], lineWidth: 0.2 }
  });

  const posGraficosY = doc.lastAutoTable.finalY + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('TRACTOCAMIÓN', 15, posGraficosY + 3);
  doc.text('TOLVA / DOLLY', 15, posGraficosY + 32);

  doc.setDrawColor(180, 180, 180);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.rect(15, posGraficosY + 5, 186, 23);
  doc.rect(15, posGraficosY + 34, 186, 25);
  doc.setLineDashPattern([], 0);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(120, 120, 120);
  doc.text('(Área de inspección y marcado visual para electromecánicos)', 105, posGraficosY + 17, { align: 'center' });
  doc.text('(Área de marcado: Dolly / Tolva 1 / Tolva 2)', 105, posGraficosY + 47, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  const posYFirmas = 250;
  doc.setDrawColor(0, 0, 0);
  doc.line(25, posYFirmas, 85, posYFirmas);
  doc.line(125, posYFirmas, 185, posYFirmas);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('EJECUTÓ MANTENIMIENTO', 55, posYFirmas + 4, { align: 'center' });
  doc.text('OPERADOR QUE VALIDA', 155, posYFirmas + 4, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 100, 100);
  doc.text('(Firma de Taller)', 55, posYFirmas + 7, { align: 'center' });
  doc.text('(Firma de Conformidad)', 155, posYFirmas + 7, { align: 'center' });

  doc.setFillColor(0, 150, 57);
  doc.rect(15, 262, 186, 2.5, 'F');

  window.open(doc.output('bloburl'), '_blank');
}

if (typeof window !== 'undefined') {
  window.generarDocumentoOT = generarDocumentoOT;
}

if (typeof globalThis !== 'undefined') {
  globalThis.generarDocumentoOT = generarDocumentoOT;
}

export { CATALOGO_SISTEMAS, generarDocumentoOT };
