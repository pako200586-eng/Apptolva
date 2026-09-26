const CATALOGO_SISTEMAS = [
  { sistema: 'SUSPENSIÓN', palabrasClave: ['bujes', 'muelles', 'tirantes', 'amortiguador', 'bolsa de aire', 'lanza', 'tacones'] },
  { sistema: 'FRENOS / AIRE', palabrasClave: ['freno', 'balata', 'matraca', 'camara', 'manguera', 'fuga de aire', 'siroco', 'valvula', 'presion'] },
  { sistema: 'LLANTAS Y RINES', palabrasClave: ['llanta', 'ponchada', 'chipote', 'rin', 'birlo', 'tuerca', 'cambiar llantas', 'desgaste'] },
  { sistema: 'CARROCERÍA / CHASIS', palabrasClave: ['parabrisas', 'golpe', 'defensa', 'cofre', 'puerta', 'manija', 'espejo', 'ganchos', 'cadena', 'plafonera'] },
  { sistema: 'ELÉCTRICO / LUCES', palabrasClave: ['plafon', 'foco', 'calavera', 'faros', 'bateria', 'marcha', 'alternador', 'testigos', 'espias'] },
  { sistema: 'QUINTA RUEDA', palabrasClave: ['quinta', 'mordaza', 'plato', 'juego de quinta'] },
  { sistema: 'CLIMATIZACIÓN', palabrasClave: ['a/c', 'aire acondicionado', 'clima', 'compresor'] }
];

function imprimirOT_Bachoco(ordenData) {
  const folioOT = ordenData.folio_ot ? `OT-${ordenData.folio_ot}` : (ordenData.folio || 'S/F');
  const unidad = ordenData.unidad || '';
  const operador = ordenData.operador || '';
  const componente = ordenData.componente || 'TRACTOCAMIÓN';
  const sistema = ordenData.sistema || 'GENERAL';
  const descripcion = ordenData.descripcion_falla || ordenData.descripcion || 'Sin descripción';
  const folioCheckList = ordenData.folio_bitacora || ordenData.reporte_id || 'N/A';
  const fechaHoy = new Date().toLocaleDateString('es-MX');

  const ventanaImpresion = window.open('', '_blank');

  ventanaImpresion.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Orden de Trabajo - ${folioOT}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        @page {
          size: letter portrait;
          margin: 8mm;
        }
        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background-color: white !important;
            padding: 0 !important;
          }
          .no-print { display: none !important; }
        }
      </style>
    </head>
    <body class="bg-gray-100 flex justify-center text-black font-sans text-xs p-2">
      <div class="w-[216mm] min-h-[265mm] bg-white p-6 border border-gray-400 flex flex-col justify-between">
        <div>
          <div class="flex justify-between items-start mb-3">
            <div>
              <h1 class="text-xs font-bold tracking-wider text-gray-800">ORDEN DE TRABAJO MANTENIMIENTO FP PA CHAPO</h1>
              <div class="mt-1 text-[9px] text-gray-700 leading-tight">
                <p class="font-bold">Flota propia planta de alimentos el Chapo</p>
                <p>Localidad: El chapo</p>
                <p>Ixhuatlan del Sureste</p>
              </div>
            </div>
            <div class="text-right">
              <span class="text-2xl font-extrabold text-[#E35205] tracking-tight">Bachoco</span>
              <div class="h-1 bg-green-600 rounded-full mt-0.5 w-full"></div>
            </div>
          </div>

          <table class="w-full border-collapse border border-gray-600 mb-3 text-[9px]">
            <tbody>
              <tr>
                <td class="bg-gray-200 border border-gray-600 font-bold p-1 w-[20%] text-center uppercase">Unidad</td>
                <td class="border border-gray-600 p-1 w-[30%] font-bold text-sm">${unidad}</td>
                <td class="bg-gray-200 border border-gray-600 font-bold p-1 w-[20%] uppercase text-center">Folio Orden Trabajo</td>
                <td class="border border-gray-600 p-1 w-[30%] font-bold text-red-600 text-center text-sm">${folioOT}</td>
              </tr>
              <tr>
                <td class="bg-gray-200 border border-gray-600 font-bold p-1 text-center uppercase">Nombre del Operador</td>
                <td class="border border-gray-600 p-1">${operador}</td>
                <td class="bg-gray-200 border border-gray-600 font-bold p-1 uppercase text-center">Componente Afectado</td>
                <td class="border border-gray-600 p-1 font-bold text-blue-900 text-center">${componente}</td>
              </tr>
              <tr>
                <td class="bg-gray-200 border border-gray-600 font-bold p-1 text-center uppercase">Electromecánico Asignado</td>
                <td class="border border-gray-600 p-1"></td>
                <td class="bg-gray-200 border border-gray-600 font-bold p-1 uppercase text-center">Sistema Mecánico</td>
                <td class="border border-gray-600 p-1 text-center">${sistema}</td>
              </tr>
              <tr>
                <td class="bg-gray-200 border border-gray-600 font-bold p-1 text-center uppercase">Proveedor Externo</td>
                <td class="border border-gray-600 p-1"></td>
                <td class="bg-gray-200 border border-gray-600 font-bold p-1 uppercase text-center">Turno</td>
                <td class="border border-gray-600 p-1 text-center">48 HRS</td>
              </tr>
              <tr>
                <td class="bg-gray-200 border border-gray-600 font-bold p-1 text-center uppercase">Fecha de la Solicitud</td>
                <td class="border border-gray-600 p-1">${fechaHoy}</td>
                <td class="bg-gray-200 border border-gray-600 font-bold p-1 uppercase text-center">Folio Check List</td>
                <td class="border border-gray-600 p-1 text-center font-bold">${folioCheckList}</td>
              </tr>
              <tr>
                <td class="bg-gray-200 border border-gray-600 font-bold p-1 text-center uppercase">Fecha de Realización</td>
                <td class="border border-gray-600 p-1"></td>
                <td class="bg-gray-200 border border-gray-600 font-bold p-1 uppercase text-center">Kilometraje</td>
                <td class="border border-gray-600 p-1"></td>
              </tr>
              <tr>
                <td class="bg-gray-200 border border-gray-600 font-bold p-1 text-center uppercase">Supervisor Mantenimiento</td>
                <td class="border border-gray-600 p-1 font-semibold">Pedro Palomec</td>
                <td class="bg-gray-200 border border-gray-600 font-bold p-1 uppercase text-center">Firma</td>
                <td class="border border-gray-600 p-1"></td>
              </tr>
            </tbody>
          </table>

          <div class="border border-gray-600 mb-2">
            <div class="flex">
              <div class="w-[22%] bg-gray-200 p-2 border-r border-gray-600 font-bold uppercase text-[9px] flex items-center justify-center text-center">
                Descripción del Trabajo
              </div>
              <div class="w-[78%] min-h-[45px] p-2 bg-white text-[10px] font-semibold">
                ${descripcion}
              </div>
            </div>
          </div>

          <div class="border border-gray-600 mb-2">
            <div class="flex">
              <div class="w-[22%] bg-gray-200 p-2 border-r border-gray-600 font-bold uppercase text-[9px] flex items-center justify-center text-center">
                Comentarios del Ejecutor
              </div>
              <div class="w-[78%] min-h-[40px] p-2 bg-white"></div>
            </div>
          </div>

          <div class="border border-gray-600 mb-3">
            <div class="flex">
              <div class="w-[22%] bg-gray-200 p-2 border-r border-gray-600 font-bold uppercase text-[9px] flex items-center justify-center text-center">
                Comentarios del Operador
              </div>
              <div class="w-[78%] min-h-[40px] p-2 bg-white"></div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 border border-gray-400 p-2 mb-2 bg-gray-50">
            <div class="col-span-2 border-b border-gray-300 pb-1">
              <span class="text-[9px] font-bold tracking-wider block mb-1">TRACTOCAMION</span>
              <div class="h-20 border border-dashed border-gray-400 flex items-center justify-center bg-white">
                <img src="/img/esquema-tractocamion.png" onerror="this.parentElement.innerHTML='<span class=\'text-gray-400 text-[9px]\'>Diagrama Tracto (Marcar área intervenida)</span>'" class="max-h-full object-contain">
              </div>
            </div>

            <div class="col-span-1">
              <span class="text-[9px] font-bold tracking-wider block mb-1">TOLVA</span>
              <div class="h-18 border border-dashed border-gray-400 flex items-center justify-center bg-white">
                <img src="/img/esquema-tolva.png" onerror="this.parentElement.innerHTML='<span class=\'text-gray-400 text-[9px]\'>Diagrama Tolva (Descarga/Manivelas)</span>'" class="max-h-full object-contain">
              </div>
            </div>

            <div class="col-span-1">
              <span class="text-[9px] font-bold tracking-wider block mb-1">DOLLY</span>
              <div class="h-18 border border-dashed border-gray-400 flex items-center justify-center bg-white">
                <img src="/img/esquema-dolly.png" onerror="this.parentElement.innerHTML='<span class=\'text-gray-400 text-[9px]\'>Diagrama Dolly (Lanza/Quinta)</span>'" class="max-h-full object-contain">
              </div>
            </div>
          </div>
        </div>

        <div>
          <div class="grid grid-cols-2 gap-16 mt-3 mb-2 px-8 text-center text-[9px] font-bold">
            <div>
              <div class="border-b border-black mb-1"></div>
              <span>EJECUTÓ MANTENIMIENTO</span>
            </div>
            <div>
              <div class="border-b border-black mb-1"></div>
              <span>OPERADOR QUE VALIDA</span>
            </div>
          </div>
          <div class="h-3 bg-[#00A850] w-full mt-2"></div>
        </div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(() => {
            window.print();
          }, 400);
        };
      </script>
    </body>
    </html>
  `);

  ventanaImpresion.document.close();
}

if (typeof window !== 'undefined') {
  window.imprimirOT_Bachoco = imprimirOT_Bachoco;
}

if (typeof globalThis !== 'undefined') {
  globalThis.imprimirOT_Bachoco = imprimirOT_Bachoco;
}

export { CATALOGO_SISTEMAS, imprimirOT_Bachoco };

