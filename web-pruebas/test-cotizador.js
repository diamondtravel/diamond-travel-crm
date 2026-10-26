// Pruebas de cálculos y PDF del cotizador web (datos ficticios). Uso: node web-pruebas/test-cotizador.js [carpeta_salida]
const assert = require('assert'), fs = require('fs'), path = require('path');
const PDFLib = require(process.env.PDFLIB || '/home/claude/.npm-global/lib/node_modules/pdf-lib');
const D = require('../web/js/cotizador.js');
const OUT = process.argv[2] || '/tmp';
const base = { numero: 12, fechaElaboracion: '2026-10-22', fechaVencimiento: '2026-10-25', asesorNombre: 'Asesora de prueba',
  cliente: { nombre: 'Cliente Ficticio', telefono: '3000000001' },
  viaje: { destinos: 'San Andrés', ciudadSalida: 'Cúcuta', fechaIda: '2026-12-10', fechaRegreso: '2026-12-14', noches: 4, adultos: 2, ninos: 1, edadesNinos: '6', hotel: 'Hotel de prueba' },
  servicios: [{ descripcion: 'Tiquetes aéreos', incluido: true }],
  valores: { moneda: 'COP', opciones: [
    { nombre: 'Hotel de prueba – Solo desayuno', detalle: 'Habitación doble estándar', precioAdulto: 2100000, precioNino: 1500000 },
    { nombre: 'Hotel de prueba – Todo incluido', detalle: 'Habitación doble vista al mar', precioAdulto: 2900000, precioNino: 1900000 }
  ], cargos: [{ concepto: 'Tarjeta de turismo (prueba)', valor: 300000 }], descuentos: [], anticipo: 1000000, mostrarPorPersona: true },
  condiciones: { fechaLimitePago: '2026-11-20', politicaCancelacion: 'Texto de prueba.' } };
let r = D.calcular(base);
assert.strictEqual(r.opciones.length, 2);
assert.strictEqual(r.opciones[0].total, 2 * 2100000 + 1500000 + 300000);
assert.strictEqual(r.opciones[1].total, 2 * 2900000 + 1900000 + 300000);
assert.strictEqual(r.minimo, 6000000);
assert.ok(D.validar(base, 'pdf').ok, JSON.stringify(D.validar(base, 'pdf').errores));
// Falta precio en la opción 2 y sin nombre
const q2 = JSON.parse(JSON.stringify(base)); q2.valores.opciones[1].precioNino = null; q2.valores.opciones[1].nombre = '';
const e2 = D.validar(q2, 'pdf').errores.map(e => e.msg).join(' | ');
assert.ok(/opción 2/.test(e2) && /nombre de la opción 2/.test(e2), e2);
// Cotización antigua (precios sueltos) sigue funcionando
const viejo = { viaje: { adultos: 2 }, valores: { precioAdulto: 1000000, cargos: [], descuentos: [] } };
assert.strictEqual(D.calcular(viejo).total, 2000000);
// Opción elegida
const q3 = JSON.parse(JSON.stringify(base)); q3.valores.opcionElegida = 1; assert.strictEqual(D.calcular(q3).total, r.opciones[1].total);
console.log(D.mensajeWhatsApp(base));
// ---- Varias fechas, trayectos con escala
const mf = JSON.parse(JSON.stringify(base));
mf.fechas = [
  { fechaIda: '2026-12-10', fechaRegreso: '2026-12-14', noches: 4, aerolinea: 'Aerolínea de prueba', equipaje: '1 maleta de 23 kg',
    tramos: [{ tipo: 'ida', fecha: '2026-12-10', ruta: 'Cúcuta – San Andrés', vuelo: 'XX 101', salida: '06:10', llegada: '10:05', escala: 'escala', escalaEn: 'Bogotá' },
             { tipo: 'regreso', fecha: '2026-12-14', ruta: 'San Andrés – Cúcuta', vuelo: 'XX 102', salida: '15:00', llegada: '18:40', escala: 'directo' }],
    hotel: 'Hotel de prueba', regimen: 'Todo incluido', servicios: [{ descripcion: 'Tiquetes aéreos', incluido: true }, { descripcion: 'Tarjeta de turismo', incluido: false }],
    opciones: [{ nombre: 'Solo desayuno', precioAdulto: 2100000, precioNino: 1500000 }, { nombre: 'Todo incluido', precioAdulto: 2900000, precioNino: 1900000 }], cargos: [], descuentos: [], anticipo: 1000000 },
  { fechaIda: '2027-01-05', fechaRegreso: '2027-01-09', noches: 4, aerolinea: 'Aerolínea de prueba',
    tramos: [{ tipo: 'ida', fecha: '2027-01-05', ruta: 'Cúcuta – San Andrés', escala: 'directo' }],
    hotel: 'Hotel de prueba', servicios: [{ descripcion: 'Tiquetes aéreos', incluido: true }],
    opciones: [{ nombre: 'Todo incluido', precioAdulto: 2500000, precioNino: 1700000 }], cargos: [{ concepto: 'Temporada baja', valor: -0 }], descuentos: [{ concepto: 'Descuento de prueba', valor: 200000 }], anticipo: null }
];
let rf = D.calcular(mf);
assert.strictEqual(rf.fechas.length, 2); assert.ok(rf.multipleFechas && rf.multiple);
assert.strictEqual(rf.todas.length, 3);
assert.strictEqual(rf.fechas[1].opciones[0].total, 2 * 2500000 + 1700000 - 200000);
assert.strictEqual(rf.minimo, 2 * 2100000 + 1500000);
assert.strictEqual(D.etiquetaOpcion(rf, rf.todas[1]), 'Fecha 1 (10/12/2026 – 14/12/2026) · Opción 2 – Todo incluido');
assert.strictEqual(D.etiquetaOpcion(rf, rf.todas[2]), 'Fecha 2 (05/01/2027 – 09/01/2027) · Todo incluido');
assert.strictEqual(D.escalaTxt(mf.fechas[0].tramos[0]), 'Con escala en Bogotá');
assert.ok(D.validar(mf, 'pdf').ok, JSON.stringify(D.validar(mf, 'pdf').errores));
const mf2 = JSON.parse(JSON.stringify(mf)); mf2.fechas[1].fechaIda = ''; mf2.fechas[1].opciones[0].precioNino = null;
const em = D.validar(mf2, 'pdf').errores;
assert.ok(em.some(e => e.fecha === 1 && /^Fecha 2: Escribe la fecha de ida/.test(e.msg)) && em.some(e => e.fecha === 1 && e.campo === 'op_1_0_precioNino'), JSON.stringify(em));
const msj = D.mensajeWhatsApp(mf);
assert.ok(/con 2 opciones de fecha/.test(msj) && /• Fecha 2 \(05\/01\/2027 – 09\/01\/2027\) · Todo incluido: \$ 6\.500\.000/.test(msj), msj);
// Elegir fecha 2 y sincronizar: los campos de siempre quedan con la fecha elegida
const el = JSON.parse(JSON.stringify(mf)); el.valores.eleccion = { fecha: 1, opcion: 0 };
D.sincronizar(el);
assert.strictEqual(el.viaje.fechaIda, '2027-01-05'); assert.strictEqual(D.calcular(el).total, 6500000);
assert.strictEqual(el.valores.opciones[0].nombre, 'Todo incluido');
assert.ok(/Valor total \(Fecha 2 .*Todo incluido\): \$ 6\.500\.000/.test(D.mensajeWhatsApp(el)), D.mensajeWhatsApp(el));
// Una cotización antigua se convierte a fechas sin perder nada
const vieja = JSON.parse(JSON.stringify(base)); vieja.viaje.tramos = [{ fecha: '2026-12-14', ruta: 'San Andrés – Cúcuta', vuelo: 'XX 9' }];
D.sincronizar(vieja);
assert.strictEqual(vieja.fechas.length, 1); assert.strictEqual(vieja.fechas[0].opciones.length, 2); assert.strictEqual(vieja.fechas[0].tramos[0].tipo, 'regreso');
assert.strictEqual(D.calcular(vieja).opciones[0].total, r.opciones[0].total);
(async () => {
  const logo = fs.readFileSync(path.join(__dirname, '../web/assets/logo.png'));
  fs.writeFileSync(path.join(OUT, 'opciones.pdf'), await D.generarPDF(base, { PDFLib, logoPng: logo }));
  const una = JSON.parse(JSON.stringify(base)); una.valores.opciones = [una.valores.opciones[0]];
  fs.writeFileSync(path.join(OUT, 'una-opcion.pdf'), await D.generarPDF(una, { PDFLib, logoPng: logo }));
  fs.writeFileSync(path.join(OUT, 'varias-fechas.pdf'), await D.generarPDF(mf, { PDFLib, logoPng: logo }));
  console.log('PRUEBAS DEL COTIZADOR OK');
})().catch(e => { console.error(e); process.exit(1); });
