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
(async () => {
  const logo = fs.readFileSync(path.join(__dirname, '../web/assets/logo.png'));
  fs.writeFileSync(path.join(OUT, 'opciones.pdf'), await D.generarPDF(base, { PDFLib, logoPng: logo }));
  const una = JSON.parse(JSON.stringify(base)); una.valores.opciones = [una.valores.opciones[0]];
  fs.writeFileSync(path.join(OUT, 'una-opcion.pdf'), await D.generarPDF(una, { PDFLib, logoPng: logo }));
  console.log('PRUEBAS DEL COTIZADOR OK');
})().catch(e => { console.error(e); process.exit(1); });
