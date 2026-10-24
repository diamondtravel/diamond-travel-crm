// Prueba del recibo de pago y de los mensajes (datos ficticios). Uso: node web-pruebas/test-recibo.js
const fs = require("fs"), path = require("path"), assert = require("assert");
const G = process.env.NODE_GLOBAL || "/home/claude/.npm-global/lib/node_modules/";
const PDFLib = require(G + "pdf-lib");
const R = require("../web/js/voucher.js");
const OUT = process.env.OUT || "/tmp";
(async () => {
  const d = { numero: 3, fecha: "2026-10-24", valor: 1500000, moneda: "COP", medio: "Nequi", referencia: "M123456", titular: { nombre: "Laura Méndez (prueba)", telefono: "3000000001" },
    reservaCodigo: "RS-0001", destino: "San Andrés", concepto: "Cuota 2 de 3", total: 6000000, pagadoAcum: 3500000, saldo: 2500000, asesorNombre: "Nicol",
    proximas: [{ concepto: "Cuota 3 de 3", fecha: "2026-11-20", pendiente: 2500000 }] };
  assert.strictEqual(R.codigoRecibo(3), "RC-0003");
  assert.strictEqual(R.nombreRecibo(d), "Recibo-RC-0003-Laura-Mendez-prueba.pdf");
  assert.strictEqual(R.fmtMoneda(1500000, "COP"), "$ 1.500.000");
  const m = R.mensajeRecibo(d);
  assert.ok(/recibimos tu pago de \$ 1\.500\.000 \(Cuota 2 de 3\) de tu viaje a San Andrés \(reserva RS-0001\)/.test(m) && /RC-0003/.test(m) && /Saldo pendiente del viaje: \$ 2\.500\.000/.test(m), m);
  assert.ok(/totalmente pagado/.test(R.mensajeRecibo(Object.assign({}, d, { saldo: 0 }))));
  const r1 = R.mensajeRecordatorio({ nombre: "Laura Méndez", asesor: "Nicol", concepto: "Cuota 2 de 3", destino: "San Andrés", reservaCodigo: "RS-0001", pendiente: 1000000, pagado: 500000, fecha: "2026-10-24", dias: 0, saldo: 3500000, moneda: "COP", datosPago: "Bancolombia ahorros 000-000000-00 a nombre de Diamond Travel" });
  assert.ok(/hoy vence la cuota 2 de 3 de tu viaje a San Andrés \(reserva RS-0001\), por \$ 1\.000\.000/.test(r1) && /ya recibimos \$ 500\.000/.test(r1) && /Saldo total pendiente del viaje: \$ 3\.500\.000/.test(r1) && /Bancolombia/.test(r1), r1);
  const r2 = R.mensajeRecordatorio({ nombre: "Ana", concepto: "Anticipo", pendiente: 1, fecha: "2026-10-20", dias: -4, moneda: "COP" });
  assert.ok(/el 20\/10\/2026 venció el pago “Anticipo”/.test(r2), r2);
  const logo = fs.readFileSync(path.join(__dirname, "..", "web", "assets", "logo.png"));
  const bytes = await R.generarRecibo(d, { PDFLib, logoPng: logo });
  fs.writeFileSync(path.join(OUT, "recibo.pdf"), bytes);
  const pdfjs = await import(G + "pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 }).promise;
  const t = (await (await doc.getPage(1)).getTextContent()).items.map(x => x.str).join(" ").replace(/\s+/g, "");
  for (const x of ["RECIBODEPAGO", "RC-0003", "LauraMéndez(prueba)", "$1.500.000", "Nequi", "M123456", "$2.500.000", "Cuota3de3", "Noreemplazalafacturaelectrónica"]) assert.ok(t.includes(x), "falta " + x);
  assert.strictEqual(doc.numPages, 1);
  console.log("PRUEBAS DEL RECIBO OK");
})().catch(e => { console.error("FALLA", e.message); process.exit(1); });
