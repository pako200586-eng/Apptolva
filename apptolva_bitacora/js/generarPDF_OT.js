const CATALOGO_SISTEMAS = [
  { sistema: 'SUSPENSIÓN', palabrasClave: ['bujes', 'muelles', 'tirantes', 'amortiguador', 'bolsa de aire', 'lanza', 'tacones'] },
  { sistema: 'FRENOS / AIRE', palabrasClave: ['freno', 'balata', 'matraca', 'camara', 'manguera', 'fuga de aire', 'siroco', 'valvula', 'presion'] },
  { sistema: 'LLANTAS Y RINES', palabrasClave: ['llanta', 'ponchada', 'chipote', 'rin', 'birlo', 'tuerca', 'cambiar llantas', 'desgaste'] },
  { sistema: 'CARROCERÍA / CHASIS', palabrasClave: ['parabrisas', 'golpe', 'defensa', 'cofre', 'puerta', 'manija', 'espejo', 'ganchos', 'cadena', 'plafonera'] },
  { sistema: 'ELÉCTRICO / LUCES', palabrasClave: ['plafon', 'foco', 'calavera', 'faros', 'bateria', 'marcha', 'alternador', 'testigos', 'espias'] },
  { sistema: 'QUINTA RUEDA', palabrasClave: ['quinta', 'mordaza', 'plato', 'juego de quinta'] },
  { sistema: 'CLIMATIZACIÓN', palabrasClave: ['a/c', 'aire acondicionado', 'clima', 'compresor'] }
];

function imprimirOT_Bachoco(ordenData = {}) {
  const folioOT = ordenData.folio_ot ? `OT-${ordenData.folio_ot}` : (ordenData.folio || 'S/F');
  const unidad = ordenData.unidad || '';
  const operador = ordenData.operador || '';
  const componente = ordenData.componente || 'TRACTOCAMIÓN';
  const sistema = ordenData.sistema || 'GENERAL';
  const descripcion = ordenData.descripcion_falla || ordenData.descripcion || 'Sin descripción';
  const folioCheckList = ordenData.folio_bitacora || ordenData.reporte_id || 'N/A';
  const fechaHoy = new Date().toLocaleDateString('es-MX');

  const renderCell = (value) => {
    const text = value == null ? '' : String(value);
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  const ventanaImpresion = window.open('', '_blank', 'noopener,noreferrer');
  if (!ventanaImpresion) {
    alert('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para continuar.');
    return;
  }

  ventanaImpresion.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Orden de Trabajo Mantenimiento</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .page-break { page-break-after: always; }
    }
  </style>
</head>
<body class="bg-gray-100 p-4 flex justify-center text-black font-sans text-xs">
  <div class="w-[216mm] min-h-[279mm] bg-white p-8 border border-gray-300 shadow-lg flex flex-col justify-between">
    <div>
      <div class="flex justify-between items-start mb-4">
        <div>
          <h1 class="text-sm font-bold tracking-wider text-gray-700">ORDEN DE TRABAJO MANTENIMIENTO FP PA CHAPO</h1>
          <div class="mt-2 text-[10px] text-gray-800 leading-tight">
            <p class="font-bold">Flota propia planta de alimentos el Chapo</p>
            <p>Localidad: El chapo</p>
            <p>Ixhuatlan del Sureste</p>
          </div>
        </div>
        <div>
          <span class="text-3xl font-extrabold text-[#E35205] tracking-tight">Bachoco</span>
          <div class="h-1 bg-green-500 rounded-full mt-0.5 w-full"></div>
        </div>
      </div>

      <table class="w-full border-collapse border border-gray-600 mb-4 text-[10px]">
        <tbody>
          <tr>
            <td class="bg-gray-200 border border-gray-600 font-bold p-1 w-[20%] text-center uppercase">Unidad</td>
            <td class="border border-gray-600 p-1 w-[30%] font-bold text-sm">${renderCell(unidad)}</td>
            <td class="bg-gray-200 border border-gray-600 font-bold p-1 w-[20%] uppercase">Folio Orden Trabajo</td>
            <td class="border border-gray-600 p-1 w-[30%] font-bold text-red-600 text-center text-sm">${renderCell(folioOT)}</td>
          </tr>
          <tr>
            <td class="bg-gray-200 border border-gray-600 font-bold p-1 text-center uppercase">Nombre del Operador</td>
            <td class="border border-gray-600 p-1">${renderCell(operador)}</td>
            <td class="bg-gray-200 border border-gray-600 font-bold p-1 uppercase">Tolva 1</td>
            <td class="border border-gray-600 p-1"></td>
          </tr>
          <tr>
            <td class="bg-gray-200 border border-gray-600 font-bold p-1 text-center uppercase">Electromecánico Asignado</td>
            <td class="border border-gray-600 p-1"></td>
            <td class="bg-gray-200 border border-gray-600 font-bold p-1 uppercase">Tolva 2</td>
            <td class="border border-gray-600 p-1"></td>
          </tr>
          <tr>
            <td class="bg-gray-200 border border-gray-600 font-bold p-1 text-center uppercase">Proveedor Externo</td>
            <td class="border border-gray-600 p-1"></td>
            <td class="bg-gray-200 border border-gray-600 font-bold p-1 uppercase">Dolly</td>
            <td class="border border-gray-600 p-1"></td>
          </tr>
          <tr>
            <td class="bg-gray-200 border border-gray-600 font-bold p-1 text-center uppercase">Fecha de la Solicitud</td>
            <td class="border border-gray-600 p-1">${renderCell(fechaHoy)}</td>
            <td class="bg-gray-200 border border-gray-600 font-bold p-1 uppercase">Folio Check List</td>
            <td class="border border-gray-600 p-1">${renderCell(folioCheckList)}</td>
          </tr>
          <tr>
            <td class="bg-gray-200 border border-gray-600 font-bold p-1 text-center uppercase">Fecha de Realización</td>
            <td class="border border-gray-600 p-1"></td>
            <td class="bg-gray-200 border border-gray-600 font-bold p-1 uppercase">Kilometraje</td>
            <td class="border border-gray-600 p-1"></td>
          </tr>
          <tr>
            <td class="bg-gray-200 border border-gray-600 font-bold p-1 text-center uppercase">Supervisor Mantenimiento</td>
            <td class="border border-gray-600 p-1"></td>
            <td class="bg-gray-200 border border-gray-600 font-bold p-1 uppercase">Firma</td>
            <td class="border border-gray-600 p-1"></td>
          </tr>
        </tbody>
      </table>

      <div class="border border-gray-600 mb-2">
        <div class="flex">
          <div class="w-[20%] bg-gray-200 p-2 border-r border-gray-600 font-bold uppercase text-[9px] flex items-center justify-center text-center">
            Descripción del Trabajo
          </div>
          <div class="w-[80%] min-h-[45px] p-2 bg-white">${renderCell(descripcion)}</div>
        </div>
      </div>

      <div class="border border-gray-600 mb-2">
        <div class="flex">
          <div class="w-[20%] bg-gray-200 p-2 border-r border-gray-600 font-bold uppercase text-[9px] flex items-center justify-center text-center">
            Comentarios del Ejecutor
          </div>
          <div class="w-[80%] min-h-[45px] p-2 bg-white"></div>
        </div>
      </div>

      <div class="border border-gray-600 mb-4">
        <div class="flex">
          <div class="w-[20%] bg-gray-200 p-2 border-r border-gray-600 font-bold uppercase text-[9px] flex items-center justify-center text-center">
            Comentarios del Operador
          </div>
          <div class="w-[80%] min-h-[45px] p-2 bg-white"></div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4 border border-gray-300 p-2 mb-4">
        <div class="border-b border-gray-200 pb-2 col-span-2">
          <span class="text-[10px] font-bold tracking-wider block mb-1">TRACTOCAMION</span>
          <div class="h-28 border border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
            <img src="/img/esquema-tractocamion.png" alt="Esquema Tracto" class="max-h-full object-contain" onerror="this.parentElement.innerHTML='<span class=\'text-gray-400 text-[9px]\'>Diagrama Tracto (Marcar área intervenida)</span>'">
          </div>
        </div>

        <div class="col-span-1">
          <span class="text-[10px] font-bold tracking-wider block mb-1">TOLVA</span>
          <div class="h-24 border border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
            <img src="/img/esquema-tolva.png" alt="Esquema Tolva" class="max-h-full object-contain" onerror="this.parentElement.innerHTML='<span class=\'text-gray-400 text-[9px]\'>Diagrama Tolva (Descarga/Manivelas)</span>'">
          </div>
        </div>

        <div class="col-span-1">
          <span class="text-[10px] font-bold tracking-wider block mb-1">DOLLY</span>
          <div class="h-24 border border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
            <img src="/img/esquema-dolly.png" alt="Esquema Dolly" class="max-h-full object-contain" onerror="this.parentElement.innerHTML='<span class=\'text-gray-400 text-[9px]\'>Diagrama Dolly (Lanza/Quinta)</span>'">
          </div>
        </div>
      </div>
    </div>

    <div>
      <div class="grid grid-cols-2 gap-16 mt-4 mb-3 px-8 text-center text-[9px] font-bold">
        <div>
          <div class="border-b border-black mb-1"></div>
          <span>EJECUTÓ MANTENIMIENTO</span>
        </div>
        <div>
          <div class="border-b border-black mb-1"></div>
          <span>OPERADOR QUE VALIDA</span>
        </div>
      </div>
      <div class="h-4 bg-[#00A850] w-full mt-2"></div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(() => window.print(), 400);
    };
  </script>
</body>
</html>`);

  ventanaImpresion.document.close();
}

if (typeof window !== 'undefined') {
  window.imprimirOT_Bachoco = imprimirOT_Bachoco;
}

if (typeof globalThis !== 'undefined') {
  globalThis.imprimirOT_Bachoco = imprimirOT_Bachoco;
}

export { CATALOGO_SISTEMAS, imprimirOT_Bachoco };

