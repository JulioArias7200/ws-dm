import {
  formatPriceBs,
  renderMainMenu,
  renderHelpMessage,
  renderSaludMenu,
  renderFarmaciaBuscarHint,
  renderMedicamentosComparativa,
  renderMedicamentosCatalogoPaginado,
  renderCanastaMenu,
  renderCanastaItems,
  renderProductDetail,
} from '../lib/TG-msj/index.ts';

console.log('🧪 Iniciando verificación de plantillas y componentes de Telegram...\n');

// 1. Test formatPriceBs
console.log('--- 1. Test formatPriceBs ---');
const p1 = formatPriceBs(1.1);
const p2 = formatPriceBs(1099);
const p3 = formatPriceBs(3950.5);
console.log('1.1 ->', p1);
console.log('1099 ->', p2);
console.log('3950.5 ->', p3);
if (!p2.includes('1.099') && !p2.includes('1,099')) {
  throw new Error(`formatPriceBs falló para 1099: ${p2}`);
}

// 2. Test renderMainMenu
console.log('\n--- 2. Test renderMainMenu ---');
const menu = renderMainMenu('Julio');
console.log('Menu texto:\n', menu.text);
const menuButtons = menu.replyMarkup?.inline_keyboard?.flat().map((b) => b.text) || [];
console.log('Menu botones:', menuButtons);
if (!menu.text.includes('Hipermaxi Farmacia') || menu.text.includes('S3')) {
  throw new Error('Menu principal no contiene Hipermaxi Farmacia o expone S3');
}

// 3. Test renderSaludMenu & 3 cadenas
console.log('\n--- 3. Test renderSaludMenu (3 Cadenas) ---');
const saludMenu = renderSaludMenu();
const saludButtons = saludMenu.replyMarkup?.inline_keyboard?.flat().map((b) => b.text) || [];
console.log('Salud botones:', saludButtons);
if (!saludButtons.some((b) => b.includes('Hipermaxi Farmacia'))) {
  throw new Error('Salud menu no incluye botón de Hipermaxi Farmacia');
}

// 4. Test renderMedicamentosComparativa (Tri-Cadena)
console.log('\n--- 4. Test renderMedicamentosComparativa ---');
const compMock = {
  termino: 'paracetamol',
  farmacorpTotal: 2,
  chavezTotal: 1,
  hipermaxiTotal: 1,
  items: [
    {
      id: 101,
      nombre: 'Paracetamol 500mg Farmacorp',
      cadena: 'Farmacorp',
      precio_bs: 12.5,
      laboratorio: 'Inti',
      presentacion: 'Caja 20 comp',
      enlace: 'https://farmacorp.com/p1',
      descuento_pct: 10,
    },
    {
      id: 102,
      nombre: 'Paracetamol 500mg Chávez',
      cadena: 'Farmacias Chavez',
      precio_bs: 11.0,
      laboratorio: 'Bagó',
      presentacion: 'Caja 20 comp',
      enlace: 'https://farmaciaschavez.com/p2',
      descuento_pct: null,
    },
    {
      id: 103,
      nombre: 'Paracetamol 500mg Hipermaxi',
      cadena: 'Hipermaxi Farmacia',
      precio_bs: 10.5,
      laboratorio: 'Roemmers',
      presentacion: 'Caja 20 comp',
      enlace: 'https://hipermaxi.com/p3',
      descuento_pct: null,
    },
  ],
  resumenAhorro: {
    mejorCadena: 'Hipermaxi Farmacia',
    precioMin: 10.5,
    precioMax: 12.5,
    ahorroBs: 2.0,
  },
};
const compResult = renderMedicamentosComparativa('paracetamol', compMock);
console.log('Comparativa texto:\n', compResult.text);
if (
  !compResult.text.includes('Farmacorp') ||
  !compResult.text.includes('Farmacias Chávez') ||
  !compResult.text.includes('Hipermaxi Farmacia')
) {
  throw new Error('renderMedicamentosComparativa no incluye las 3 cadenas');
}

// 5. Test renderProductDetail
console.log('\n--- 5. Test renderProductDetail (Ficha con Sucursales e Histórico) ---');
const detailMock = {
  item: {
    id: '2328',
    producto: 'Whisky Johnnie Walker Green Label 750 ml',
    categoria: 'Licores',
    macroCategoria: 'licores',
    unidad_medida: '750 ml',
    precio_bs: 1099.0,
    cadena: 'Hipermaxi Calacoto',
    departamento: 'La Paz',
    imagen: 'https://cdn.hipermaxi.com/green_label.jpg',
    enlace: 'https://hipermaxi.com/producto/whisky-green-label',
    fecha: '2026-11-15',
    sector: 'supermercado',
  },
  isS3: true,
  s3Key: 'canasta/hipermaxi/2328.webp',
  rawImagen: 'https://cdn.hipermaxi.com/green_label.jpg',
  enlace: 'https://hipermaxi.com/producto/whisky-green-label',
  sucursales: [
    {
      cadena: 'Hipermaxi Calacoto',
      departamento: 'La Paz',
      precio_bs: 1099.0,
      fecha: '2026-11-15',
      enlace: 'https://hipermaxi.com/producto/whisky-green-label',
    },
    {
      cadena: 'Hipermaxi Cañoto',
      departamento: 'Santa Cruz',
      precio_bs: 1099.0,
      fecha: '2026-11-15',
      enlace: 'https://hipermaxi.com/producto/whisky-green-label',
    },
    {
      cadena: 'Hipermaxi Blanco Galindo',
      departamento: 'Cochabamba',
      precio_bs: 1099.0,
      fecha: '2026-11-15',
      enlace: 'https://hipermaxi.com/producto/whisky-green-label',
    },
  ],
  historicoPrecios: [
    {
      fecha: '2026-11-15',
      precio_bs: 1099.0,
      delta_bs: 0,
      delta_pct: 0,
    },
  ],
  comparativas: [],
};

const prodCard = renderProductDetail(detailMock);
console.log('Ficha detallada texto:\n', prodCard.text);
console.log('Ficha photoUrl:', prodCard.photoUrl);
if (prodCard.text.includes('S3') || prodCard.text.includes('Bucket')) {
  throw new Error('La ficha detallada expone términos técnicos de S3/Bucket al usuario');
}
if (!prodCard.text.includes('Calacoto') || !prodCard.text.includes('Cañoto') || !prodCard.text.includes('Blanco Galindo')) {
  throw new Error('La ficha detallada no lista todas las sucursales');
}
if (!prodCard.photoUrl) {
  throw new Error('No se extrajo photoUrl');
}

// 6. Test renderCanastaMenu & Macro-Categorías
console.log('\n--- 6. Test renderCanastaMenu (Macro-Categorías) ---');
const canastaMenu = renderCanastaMenu();
const canastaButtons = canastaMenu.replyMarkup?.inline_keyboard?.flat().map((b) => b.text) || [];
console.log('Canasta botones:', canastaButtons);
if (!canastaButtons.some((b) => b.includes('Limpieza') || b.includes('Licores'))) {
  throw new Error('Canasta menu no incluye macro-categorías');
}

// 7. Test renderCanastaItems (Omnicanal)
console.log('\n--- 7. Test renderCanastaItems (Búsqueda Panetón / Leche) ---');
const canastaItemsMock = [
  {
    id: '1001',
    fecha: '2026-11-15',
    departamento: 'La Paz',
    producto: 'Panetón D’Onofrio 900g',
    categoria: 'Abarrotes',
    unidad_medida: '1 Unidad',
    precio_bs: 65.0,
    fuente: 'Hipermaxi Calacoto',
    enlace: 'https://hipermaxi.com/paneton',
  },
  {
    id: '1002',
    fecha: '2026-11-15',
    departamento: 'Santa Cruz',
    producto: 'Panetón D’Onofrio 900g',
    categoria: 'Abarrotes',
    unidad_medida: '1 Unidad',
    precio_bs: 64.0,
    fuente: 'Hipermaxi Cañoto',
    enlace: 'https://hipermaxi.com/paneton-scz',
  },
  {
    id: '1003',
    fecha: '2026-11-15',
    departamento: 'La Paz',
    producto: 'Panetón Tradicional San Gabriel',
    categoria: 'Abarrotes',
    unidad_medida: '1 Unidad',
    precio_bs: 35.0,
    fuente: 'OAP Mercados Populares',
  },
];

const canastaSearch = renderCanastaItems(canastaItemsMock, {
  title: '🔎 Resultados para "Panetón" en Todas las Sucursales y Plazas',
  searchTerm: 'paneton',
});
console.log('Búsqueda Panetón texto:\n', canastaSearch.text);
const searchButtons = canastaSearch.replyMarkup?.inline_keyboard?.flat().map((b) => b.text) || [];
console.log('Botones de Ficha en búsqueda:', searchButtons);
if (!canastaSearch.text.includes('Calacoto') || !canastaSearch.text.includes('Cañoto') || !canastaSearch.text.includes('Mercados Populares')) {
  throw new Error('renderCanastaItems no desglosa todas las sucursales');
}

console.log('\n🎉 ¡TODAS LAS 7 VERIFICACIONES UNITARIAS DE TELEGRAM PASARON EXITOSAMENTE!');

