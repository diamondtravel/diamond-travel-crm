const assert=require('assert'); const fs=require('fs');
const PDFLib=require('/home/claude/.npm-global/lib/node_modules/pdf-lib');
const D=require('../fuentes/cotizador.js');
const base={numero:7,fechaElaboracion:'2026-10-16',fechaVencimiento:'2026-10-19',asesorNombre:'Asesora de prueba',
 cliente:{nombre:'Cliente Ficticio de Prueba',telefono:'3000000001',email:'prueba@ejemplo.com'},
 viaje:{destinos:'Cancún y Riviera Maya (México)',ciudadSalida:'Cúcuta',fechaIda:'2026-12-20',fechaRegreso:'2026-12-27',noches:7,adultos:2,ninos:2,edadesNinos:'5, 8',infantes:1,
  aerolinea:'Aerolínea de prueba',equipaje:'1 maleta de 23 kg + artículo personal por pasajero',
  tramos:[{fecha:'2026-12-20',ruta:'Cúcuta – Bogotá',vuelo:'XX 101',salida:'06:10',llegada:'07:20'},{fecha:'2026-12-20',ruta:'Bogotá – Cancún',vuelo:'XX 202',salida:'10:05',llegada:'14:30'},{fecha:'2026-12-27',ruta:'Cancún – Bogotá – Cúcuta',vuelo:'XX 203 / XX 102',salida:'15:40',llegada:'23:55'}],
  hotel:'Hotel Ejemplo Riviera',categoriaHotel:'5 estrellas',habitacion:'Familiar, vista al jardín',regimen:'Todo incluido',traslados:'Aeropuerto – hotel – aeropuerto en servicio compartido',tours:'Tour a isla de prueba con almuerzo.\nVisita a parque de prueba (día completo).',asistencia:'Asistencia médica internacional de prueba durante todo el viaje'},
 servicios:[{descripcion:'Tiquetes aéreos ida y regreso',incluido:true},{descripcion:'7 noches de alojamiento',incluido:true},{descripcion:'Traslados aeropuerto – hotel – aeropuerto',incluido:true},{descripcion:'Gastos personales y propinas',incluido:false}],
 observacionesPaquete:'Texto de observaciones de prueba escrito por el asesor. 😀 Con emoji que debe eliminarse → y flecha.',
 valores:{moneda:'COP',precioAdulto:4500000,precioNino:3200000,precioInfante:0,cargos:[{concepto:'Cargo de prueba',valor:180000}],descuentos:[{concepto:'Descuento de prueba',valor:400000}],anticipo:5000000,mostrarPorPersona:true},
 condiciones:{politicaAnticipo:'Texto de prueba sobre la separación.',fechaLimitePago:'2026-11-20',politicaCancelacion:'Texto de prueba sobre cancelación.',equipaje:'',disponibilidad:'Texto de prueba sobre disponibilidad.',noIncluidos:'Texto de prueba de no incluidos.',adicionales:''}
};
// ---- cálculos
let r=D.calcular(base);
assert.strictEqual(r.subtotalPasajeros, 2*4500000+2*3200000+0);
assert.strictEqual(r.total, 15400000+180000-400000);
assert.strictEqual(r.pax,5); assert.strictEqual(r.porPersona, Math.round(15180000/5));
assert.strictEqual(r.saldo, 15180000-5000000);
assert.ok(D.validar(base,'pdf').ok, JSON.stringify(D.validar(base,'pdf')));
// cambiar pasajeros recalcula
let q2=JSON.parse(JSON.stringify(base)); q2.viaje.adultos=3; q2.viaje.ninos=1; q2.viaje.edadesNinos='10'; q2.viaje.infantes=0;
r=D.calcular(q2); assert.strictEqual(r.total, 3*4500000+3200000+180000-400000); assert.strictEqual(r.pax,4);
// precio vacío no se inventa
let q3=JSON.parse(JSON.stringify(base)); q3.valores.precioNino=null;
r=D.calcular(q3); assert.deepStrictEqual(r.faltantes,['ninos']); assert.strictEqual(r.completo,false); assert.strictEqual(r.porPersona,null);
let vq3=D.validar(q3,'pdf'); assert.ok(!vq3.ok && vq3.errores.some(e=>/precio por niño/.test(e.msg)));
assert.ok(D.validar(q3,'borrador').ok,'borrador con precio vacío debe poder guardarse');
// edades inconsistentes
let q4=JSON.parse(JSON.stringify(base)); q4.viaje.edadesNinos='5'; assert.ok(D.validar(q4,'borrador').errores.some(e=>e.campo==='v_edades'));
// fechas
let q5=JSON.parse(JSON.stringify(base)); q5.viaje.fechaRegreso='2026-12-10'; assert.ok(D.validar(q5,'borrador').errores.some(e=>e.campo==='v_regreso'));
q5=JSON.parse(JSON.stringify(base)); q5.fechaVencimiento='2026-10-01'; assert.ok(D.validar(q5,'borrador').errores.some(e=>e.campo==='q_venc'));
// anticipo > total
let q6=JSON.parse(JSON.stringify(base)); q6.valores.anticipo=99999999; assert.ok(D.validar(q6,'borrador').errores.some(e=>e.campo==='p_anticipo'));
// infantes sin adulto
let q7=JSON.parse(JSON.stringify(base)); q7.viaje.adultos=0; assert.ok(D.validar(q7,'pdf').errores.some(e=>/infantes/.test(e.msg)));
// descuentos mayores
let q8=JSON.parse(JSON.stringify(base)); q8.valores.descuentos=[{concepto:'x',valor:99999999}]; assert.ok(D.validar(q8,'borrador').errores.some(e=>/descuentos superan/.test(e.msg)));
console.log('textoPasajeros:',D.textoPasajeros(base.viaje));
console.log('archivo:',D.nombreArchivo(base));
console.log(D.mensajeWhatsApp(base)); console.log(D.enlaceWhatsApp(base.cliente.telefono,'hola').slice(0,40));
console.log('USD:',D.fmtMoneda(1250,'USD'),'EUR:',D.fmtMoneda(1250,'EUR'),'neg:',D.fmtMoneda(-400000,'COP'));
(async()=>{
  const logo=fs.readFileSync(__dirname+'/../../assets/logo-diamond-travel.png');
  fs.writeFileSync('out-full.pdf', await D.generarPDF(base,{PDFLib,logoPng:logo}));
  // mínimo: campos opcionales vacíos
  const min={numero:8,fechaElaboracion:'2026-10-16',cliente:{nombre:'Cliente Mínimo Prueba'},viaje:{destinos:'San Andrés',adultos:1},valores:{moneda:'COP',precioAdulto:2100000},condiciones:{}};
  assert.ok(D.validar(min,'pdf').ok, JSON.stringify(D.validar(min,'pdf')));
  fs.writeFileSync('out-min.pdf', await D.generarPDF(min,{PDFLib,logoPng:logo}));
  // largo: muchos servicios y condiciones para saltos de página
  const big=JSON.parse(JSON.stringify(base)); big.numero=9;
  for(let i=1;i<=22;i++) big.servicios.push({descripcion:'Servicio adicional de prueba número '+i+' con una descripción un poco más larga para comprobar que el texto se ajusta correctamente al ancho disponible',incluido:i%4!==0});
  for(let i=4;i<=14;i++) big.viaje.tramos.push({fecha:'2026-12-2'+(i%9),ruta:'Ciudad A – Ciudad B (tramo '+i+')',vuelo:'XX '+(300+i),salida:'08:00',llegada:'10:00'});
  big.condiciones.adicionales=('Texto largo de prueba para condiciones adicionales. ').repeat(40);
  fs.writeFileSync('out-big.pdf', await D.generarPDF(big,{PDFLib,logoPng:logo}));
  console.log('PDFs OK');
})().catch(e=>{console.error(e);process.exit(1)});
