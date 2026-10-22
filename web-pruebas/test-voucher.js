// Pruebas del motor de reservas y del voucher (datos ficticios). Uso: node web-pruebas/test-voucher.js
const fs = require("fs"), path = require("path"), assert = require("assert");
const G = process.env.NODE_GLOBAL || "/home/claude/.npm-global/lib/node_modules/";
const PDFLib = require(G + "pdf-lib");
const R = require("../web/js/voucher.js");
const OUT = process.env.OUT || "/tmp";

function ejemplo() {
  const r = R.reservaVacia();
  r.numero = 7; r.estado = "confirmada"; r.asesorNombre = "Nicol";
  r.destino = "Cartagena y Santa Marta";
  r.titular = { nombre: "Laura Méndez (prueba)", telefono: "3000000001", email: "laura@ejemplo.com" };
  const a = R.pasajeroVacio("adulto", "Laura Méndez (prueba)"); a.docTipo = "Cédula"; a.docNumero = "1090999888";
  const b = R.pasajeroVacio("adulto", "Carlos Rojas (prueba)"); b.docNumero = "88111222";
  const c = R.pasajeroVacio("nino", "Sofía Rojas (prueba)");
  r.pasajeros = [a, b, c];
  r.vuelos = [{
    aerolinea: "Aerolínea de prueba", codigoReserva: "xk7p2q", equipaje: "1 maleta de 23 kg y un artículo personal por pasajero.",
    tiquetes: { [a.id]: "729-2100000001", [b.id]: "729-2100000002" }, notas: "",
    trayectos: [
      { tipo: "ida", fecha: "2026-12-10", origen: "Cúcuta (CUC)", destino: "Bogotá (BOG)", salida: "06:10", llegada: "07:20", vuelo: "XX 9301" },
      { tipo: "ida", fecha: "2026-12-10", origen: "Bogotá (BOG)", destino: "Cartagena (CTG)", salida: "09:35", llegada: "11:05", vuelo: "XX 9452" },
      { tipo: "regreso", fecha: "2026-12-17", origen: "Santa Marta (SMR)", destino: "Bogotá (BOG)", salida: "18:40", llegada: "20:15", vuelo: "XX 9611" },
      { tipo: "regreso", fecha: "2026-12-17", origen: "Bogotá (BOG)", destino: "Cúcuta (CUC)", salida: "22:30", llegada: "23:40", vuelo: "XX 9320" }
    ]
  }];
  r.hoteles = [
    Object.assign(R.hotelVacio(), { nombre: "Hotel de prueba Cartagena", ciudad: "Cartagena", direccion: "Calle ficticia 1 #2-3, Bocagrande", confirmacion: "CTG-55821", entrada: "2026-12-10", salida: "2026-12-14", habitacion: "Doble con vista al mar", adultos: 2, ninos: 1, alimentacion: "Desayuno incluido" }),
    Object.assign(R.hotelVacio(), { nombre: "Hotel de prueba Santa Marta", ciudad: "Santa Marta", direccion: "Carrera ficticia 4 #5-6, El Rodadero", confirmacion: "", entrada: "2026-12-14", salida: "2026-12-17", checkin: "14:00", checkout: "11:00", habitacion: "Familiar", adultos: 2, ninos: 1, alimentacion: "Todo incluido", alimentacionDetalle: "Bebidas nacionales y snacks de 10:00 a. m. a 11:00 p. m." })
  ];
  r.traslados = [
    Object.assign(R.trasladoVacio(), { tipo: "Aeropuerto → hotel", fecha: "2026-12-10", hora: "11:30", desde: "Aeropuerto Rafael Núñez", hasta: "Hotel de prueba Cartagena", proveedor: "Transportes de prueba", telefono: "3000000010", indicaciones: "El conductor espera en la salida de llegadas nacionales con un letrero a nombre del titular." }),
    Object.assign(R.trasladoVacio(), { tipo: "Terrestre entre ciudades", fecha: "2026-12-14", hora: "09:00", desde: "Cartagena", hasta: "Santa Marta", proveedor: "Transportes de prueba", confirmacion: "TR-889" })
  ];
  r.actividades = [
    { titulo: "Actividades en Cartagena", items: [
      Object.assign(R.actividadVacia(), { nombre: "Tour Islas del Rosario en lancha", fecha: "2026-12-11", hora: "07:30", duracion: "8 horas", puntoEncuentro: "Muelle de La Bodeguita, taquilla 5", proveedor: "Operador de prueba", telefono: "3000000020", incluye: "Lancha ida y regreso, almuerzo típico y entrada a playa.", comoSeToma: "Presentarse a las 7:00 a. m. en el muelle con este voucher y documento de identidad. Pagar el impuesto de muelle directamente en la taquilla (no incluido). Llevar bloqueador, toalla y traje de baño." }),
      Object.assign(R.actividadVacia(), { nombre: "City tour en chiva", fecha: "2026-12-12", hora: "15:00", duracion: "4 horas", puntoEncuentro: "Recepción del hotel" })
    ] },
    { titulo: "Actividades en Santa Marta", items: [
      Object.assign(R.actividadVacia(), { nombre: "Parque Tayrona – Cabo San Juan", fecha: "2026-12-15", hora: "06:30", comoSeToma: "El transporte recoge en el hotel. Llevar documento original (el parque lo exige) y dinero en efectivo para la entrada." })
    ] }
  ];
  r.incluye = [{ descripcion: "Tiquetes aéreos", incluido: true }, { descripcion: "Hospedaje", incluido: true }, { descripcion: "Asistencia médica", incluido: true }, { descripcion: "Impuesto de muelle", incluido: false }];
  r.asistencia = { compania: "Asistencia de prueba", voucher: "AS-123456", cobertura: "Hasta USD 30.000", desde: "2026-12-10", hasta: "2026-12-17", telefono: "+57 601 0000000" };
  r.notas = "Los horarios de vuelo pueden cambiar; te avisaremos cualquier novedad.";
  return r;
}

(async () => {
  const r = ejemplo();
  // Escalas
  const it = R.itinerario(r.vuelos[0]);
  const esc = it.filter(x => x.tipo === "escala");
  assert.strictEqual(esc.length, 2, "dos escalas");
  assert.strictEqual(esc[0].ciudad, "Bogotá (BOG)"); assert.strictEqual(esc[0].min, 135);
  assert.strictEqual(R.fmtDuracion(135), "2 h 15 min");
  assert.strictEqual(esc[1].min, 135);
  // sin escala entre Cartagena y Santa Marta (otra ciudad) ni entre ida y regreso
  assert.ok(!it.some(x => x.tipo === "escala" && /Cartagena/.test(x.ciudad)));
  // llegada al día siguiente
  const v2 = { trayectos: [{ fecha: "2026-12-10", origen: "Bogotá", destino: "Madrid", salida: "22:00", llegada: "14:00", llegaOtroDia: true }, { fecha: "2026-12-11", origen: "Madrid (MAD)", destino: "Roma", salida: "17:30", llegada: "20:00" }] };
  assert.strictEqual(R.itinerario(v2).find(x => x.tipo === "escala").min, 210);
  // Fechas y noches
  assert.deepStrictEqual(R.fechasCalculadas(r), { inicio: "2026-12-10", fin: "2026-12-17" });
  assert.strictEqual(R.nochesHotel(r.hoteles[0]), 4);
  assert.strictEqual(R.fmtHora("15:00"), "3:00 p. m."); assert.strictEqual(R.fmtHora("00:15"), "12:15 a. m.");
  assert.strictEqual(R.textoPasajeros(r), "2 adultos · 1 niño");
  // Validación
  assert.ok(R.validar(r, "voucher").ok, JSON.stringify(R.validar(r, "voucher").errores));
  const malo = ejemplo(); malo.titular.nombre = ""; malo.pasajeros[2].nombre = ""; malo.hoteles[1].salida = "2026-12-01"; malo.vuelos[0].trayectos[1].salida = "25:00";
  const e = R.validar(malo, "voucher").errores.map(x => x.msg).join(" | ");
  assert.ok(/titular/.test(e) && /pasajero 3/.test(e) && /salida es anterior/.test(e) && /hora de salida/.test(e), e);
  assert.ok(R.validar(R.reservaVacia(), "guardar").errores.length === 1, "borrador solo exige titular");
  // Alertas
  const al = R.alertas(r).join(" | ");
  assert.ok(/falta el número de tiquete de Sofía Rojas/.test(al) && /Hotel de prueba Santa Marta no tiene número de confirmación/.test(al) && /Falta el documento de Sofía/.test(al), al);
  // Mensaje
  const m = R.mensajeWhatsApp(r);
  assert.ok(/Hola Laura, te saluda Nicol de Diamond Travel\./.test(m) && /RS-0007/.test(m) && /del 10\/12\/2026 al 17\/12\/2026/.test(m) && /312 382 4183/.test(m), m);
  assert.strictEqual(R.nombreArchivo(r), "Voucher-RS-0007-Laura-Mendez-prueba.pdf");
  // PDF
  const logo = fs.readFileSync(path.join(__dirname, "..", "web", "assets", "logo.png"));
  const bytes = await R.generarPDF(r, { PDFLib, logoPng: logo, hoy: "2026-10-22" });
  fs.writeFileSync(path.join(OUT, "voucher.pdf"), bytes);
  // Los documentos de identidad no deben estar en el PDF
  const pdfjs = await import(G + "pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  let texto = "";
  for (let i = 1; i <= doc.numPages; i++) { const tc = await (await doc.getPage(i)).getTextContent(); texto += tc.items.map(x => x.str).join(" ") + "\n"; }
  assert.ok(!texto.includes("1090999888") && !texto.includes("88111222"), "el voucher no incluye documentos");
  for (const t of ["VOUCHER DE VIAJE", "RS-0007", "XK7P2Q", "729-2100000001", "Escala en Bogotá", "Hotel de prueba Santa Marta", "Actividades en Santa Marta", "CÓMO SE TOMA LA ACTIVIDAD", "312 382 4183", "305 205 1183", "Tour Islas del Rosario"])
    assert.ok(texto.replace(/\s+/g, "").includes(t.replace(/\s+/g, "")), "falta en el PDF: " + t);
  // Reserva mínima (solo un hotel) también genera PDF
  const min = R.reservaVacia(); min.numero = 8; min.destino = "San Andrés"; min.titular.nombre = "Prueba Mínima";
  min.pasajeros = [R.pasajeroVacio("adulto", "Prueba Mínima")];
  min.hoteles = [Object.assign(R.hotelVacio(), { nombre: "Hotel mínimo", entrada: "2026-11-01", salida: "2026-11-03" })];
  assert.ok(R.validar(min, "voucher").ok);
  fs.writeFileSync(path.join(OUT, "voucher-minimo.pdf"), await R.generarPDF(min, { PDFLib, logoPng: logo }));
  console.log("PRUEBAS DEL VOUCHER OK ·", doc.numPages, "páginas");
})().catch(e => { console.error("FALLA", e.message); process.exit(1); });
