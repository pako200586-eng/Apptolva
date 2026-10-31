(function (global) {
  const PAGE_W = 210;
  const MARGIN = 14;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const NUM_COLS = 3;
  const COL_GAP = 4;
  const COL_W = (CONTENT_W - COL_GAP * (NUM_COLS - 1)) / NUM_COLS;
  const COL_HEIGHT = 164;
  const CAT_BOX_H = 6;
  const CAT_INCREMENT = 9.5;
  const ITEM_INCREMENT = 5.6;
  const ITEM_LINE_HEIGHT = 3.1;
  const MIN_OBS_H = 12;
  const MAX_OBS_H = 18;
  const OBS_TOP_PADDING = 8;
  const OBS_LINE_HEIGHT = 4;

  function firmaValida(img) {
    return typeof img === 'string'
      && (img.startsWith('data:image/png') || img.startsWith('data:image/jpeg'))
      && img.length > 200;
  }

  function dibujarEncabezado(doc, data, logoUrl, y) {
    doc.setFillColor(234, 88, 12);
    doc.rect(MARGIN, y, CONTENT_W, 12, 'F');
    if (logoUrl) {
      doc.setFillColor(255, 255, 255);
      doc.rect(MARGIN + 1, y + 1, 40, 10, 'F');
      try { doc.addImage(logoUrl, 'JPEG', MARGIN + 2, y + 1.4, 36.9, 9.2, undefined, 'FAST'); } catch (e) { /* el PDF sale sin logo */ }
    } else {
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('BACHOCO', MARGIN + 3, y + 8);
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('FECHA: ' + data.fecha + '   HORA: ' + data.hora, PAGE_W - MARGIN - 2, y + 5, { align: 'right' });
    doc.text('FOLIO: ' + data.folio, PAGE_W - MARGIN - 2, y + 10, { align: 'right' });

    y += 16;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.rect(MARGIN, y, CONTENT_W, 31, 'FD');
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const half = CONTENT_W / 2;
    const empleado = data.employeeNumber ? '   |   No. EMP: ' + data.employeeNumber : '';
    doc.text('OPERADOR: ' + data.driverName + empleado, PAGE_W / 2, y + 6, { align: 'center' });
    doc.line(MARGIN + 3, y + 9, MARGIN + CONTENT_W - 3, y + 9);
    doc.setFontSize(8);
    doc.text('UNIDAD: ' + data.unitId, MARGIN + 3, y + 14.5);
    doc.text('KM: ' + data.km, MARGIN + half + 3, y + 14.5);
    doc.text('TOLVA 1: ' + data.tolva1, MARGIN + 3, y + 20);
    doc.text('TOLVA 2: ' + data.tolva2, MARGIN + half + 3, y + 20);
    doc.text('DOLLY: ' + data.dolly, MARGIN + 3, y + 25.5);
    doc.text('ORIGEN: ' + data.origen + '   DESTINO: ' + data.destino, MARGIN + half + 3, y + 25.5);
    return y + 35;
  }

  function dibujarFirmas(doc, data, sigY) {
    const sigW = (CONTENT_W - 8) / 3;
    const cajas = [
      { img: data.firmaOp, nombre: data.driverName, cargo: 'FIRMA OPERADOR', x: MARGIN },
      { img: data.firmaOp2, nombre: data.operador2 || 'N/A', cargo: 'FIRMA OPERADOR 2', x: MARGIN + sigW + 4 },
      { img: data.firmaSup, nombre: data.supervisor || 'N/A', cargo: 'FIRMA SUPERVISOR', x: MARGIN + (sigW + 4) * 2 }
    ];
    cajas.forEach((sig) => {
      if (firmaValida(sig.img)) {
        try {
          const formato = sig.img.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
          doc.addImage(sig.img, formato, sig.x, sigY, sigW, 18, undefined, 'FAST');
        } catch (e) {
          console.warn('Error al estampar firma ' + sig.cargo + ':', e);
        }
      }
      doc.setDrawColor(100, 100, 100);
      doc.setLineWidth(0.5);
      doc.line(sig.x, sigY + 20, sig.x + sigW, sigY + 20);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(String(sig.nombre), sig.x + sigW / 2, sigY + 25, { align: 'center' });
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(sig.cargo, sig.x + sigW / 2, sigY + 29, { align: 'center' });
    });
  }

  global.generarPdfChecklist = function generarPdfChecklist(entrada, { logoUrl = null } = {}) {
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const data = {
      ...entrada,
      folio: entrada.folio || 'S/F',
      unitId: entrada.unitId || '-',
      driverName: entrada.driverName || '-',
      tolva1: entrada.tolva1 || 'S/N',
      tolva2: entrada.tolva2 || 'S/N',
      dolly: entrada.dolly || 'S/N',
      km: entrada.km || '-',
      origen: entrada.origen || '-',
      destino: entrada.destino || '-',
      fecha: entrada.fecha || new Date().toLocaleDateString('es-MX'),
      hora: entrada.hora || new Date().toLocaleTimeString('es-MX')
    };
    const secciones = Array.isArray(data.checklistData) ? data.checklistData : [];

    secciones.forEach((sec, pageIndex) => {
      if (pageIndex > 0) doc.addPage();
      let y = dibujarEncabezado(doc, data, logoUrl, 13);

      doc.setFillColor(51, 65, 85);
      doc.rect(MARGIN, y, CONTENT_W, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(sec.titulo || '', MARGIN + 3, y + 5.5);
      y += 12;

      const colStartY = y;
      const colBottom = colStartY + COL_HEIGHT;
      const obsY = colBottom + 3;
      const sigY = obsY + MAX_OBS_H + 2;
      const colX = [MARGIN, MARGIN + COL_W + COL_GAP, MARGIN + (COL_W + COL_GAP) * 2];
      let col = 0;

      (sec.categorias || []).forEach((cat) => {
        if (col < NUM_COLS - 1 && y + CAT_INCREMENT + ITEM_INCREMENT > colBottom) {
          col += 1;
          y = colStartY;
        }
        const cx = colX[col];
        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(234, 88, 12);
        doc.setLineWidth(0.4);
        doc.rect(cx, y, COL_W, CAT_BOX_H, 'FD');
        doc.setFillColor(234, 88, 12);
        doc.rect(cx, y, 1.5, CAT_BOX_H, 'F');
        doc.setTextColor(51, 65, 85);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.text(cat.cat || '', cx + 5, y + 4.1);
        y += CAT_INCREMENT;

        (cat.items || []).forEach((entry) => {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          const itemLines = doc.splitTextToSize(entry.item || '', COL_W - 17);
          const itemHeight = Math.max(ITEM_INCREMENT, 2.5 + itemLines.length * ITEM_LINE_HEIGHT);
          if (col < NUM_COLS - 1 && y + itemHeight > colBottom) {
            col += 1;
            y = colStartY;
          }
          const cxItem = colX[col];
          const cxRight = cxItem + COL_W;

          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(238, 238, 238);
          doc.setLineWidth(0.15);
          doc.rect(cxItem, y - 3, COL_W, itemHeight - 0.5, 'FD');
          doc.setTextColor(50, 50, 50);
          doc.text(itemLines, cxItem + 3, y + 0.2);

          if (entry.estado === 'OK') {
            doc.setTextColor(22, 163, 74);
            doc.setFont('helvetica', 'bold');
            doc.text('OK', cxRight - 2, y + 0.5, { align: 'right' });
          } else if (entry.estado === 'MAL') {
            doc.setFillColor(220, 38, 38);
            doc.roundedRect(cxRight - 11, y - 2.5, 9, 5, 1, 1, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.text('MAL', cxRight - 6.5, y + 0.5, { align: 'center' });
          } else {
            doc.setTextColor(180, 180, 180);
            doc.setFont('helvetica', 'normal');
            doc.text('-', cxRight - 2, y + 0.5, { align: 'right' });
          }
          y += itemHeight;
        });
        y += 2;
      });

      const obsTexto = String(sec.observacion || data.observaciones?.[sec.id] || '').trim() || 'Sin observaciones';
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      const obsLines = doc.splitTextToSize(obsTexto, CONTENT_W - 10);
      const obsH = Math.min(MAX_OBS_H, Math.max(MIN_OBS_H, OBS_TOP_PADDING + obsLines.length * OBS_LINE_HEIGHT));
      doc.setFillColor(255, 247, 237);
      doc.setDrawColor(253, 186, 116);
      doc.setLineWidth(0.3);
      doc.rect(MARGIN, obsY, CONTENT_W, obsH, 'FD');
      doc.setTextColor(154, 52, 18);
      doc.setFont('helvetica', 'bold');
      doc.text('NOTAS ' + (sec.titulo || '') + ':', MARGIN + 3, obsY + 5);
      doc.setFont('helvetica', 'normal');
      doc.text(obsLines, MARGIN + 3, obsY + 10);

      dibujarFirmas(doc, data, sigY);
    });

    return doc;
  };
})(globalThis);
