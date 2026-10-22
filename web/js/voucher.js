/* Diamond Travel CRM — reservas y voucher de viaje (datos, escalas, alertas, validación y PDF).
   Funciona en el navegador (window.DTRes) y en Node (module.exports) para pruebas.
   Los documentos de identidad de los pasajeros quedan solo en el CRM: el voucher nunca los incluye. */
(function (root) {
"use strict";

const AGENCIA = {
  nombre: "Diamond Travel",
  whatsappTxt: "305 205 1183",
  emergenciaTxt: "312 382 4183",
  direccion: "Calle 17 OE-48, barrio Caobos, Cúcuta, Norte de Santander, Colombia",
  correo: "reservasdiamondtravel@gmail.com",
  instagram: "@diamondtours_cucuta"
};

const ESTADOS = [
  { k: "por_confirmar", l: "Por confirmar" },
  { k: "confirmada", l: "Confirmada" },
  { k: "en_viaje", l: "En viaje" },
  { k: "finalizada", l: "Finalizada" },
  { k: "cancelada", l: "Cancelada" }
];
const TIPOS_PAX = [{ k: "adulto", l: "Adulto" }, { k: "nino", l: "Niño" }, { k: "infante", l: "Infante" }];
const TIPOS_DOC = ["Cédula", "Tarjeta de identidad", "Registro civil", "Pasaporte", "Cédula de extranjería", "Otro"];
const TIPOS_TRAYECTO = [{ k: "ida", l: "Ida" }, { k: "regreso", l: "Regreso" }, { k: "tramo", l: "Tramo" }];
const ALIMENTACION = ["Solo alojamiento", "Desayuno incluido", "Media pensión", "Pensión completa", "Todo incluido"];
const SUG_INCLUYE = ["Tiquetes aéreos", "Hospedaje", "Alimentación según el plan", "Traslados aeropuerto – hotel – aeropuerto", "Actividades y tours", "Asistencia médica", "Impuestos y tasas aeroportuarias", "Tarjeta de turismo"];
const RECOMENDACIONES = [
  "Lleva tu documento de identidad original: cédula, tarjeta de identidad o registro civil para menores, y pasaporte vigente en viajes internacionales.",
  "Preséntate en el aeropuerto 2 horas antes en vuelos nacionales y 3 horas antes en vuelos internacionales.",
  "Revisa las condiciones de equipaje de tu aerolínea antes de empacar.",
  "Verifica que los nombres de este voucher coincidan con tus documentos. Si ves algún error, avísanos de inmediato.",
  "Guarda este voucher en tu celular: te lo pueden pedir en el hotel, en los traslados y en las actividades."
].join("\n");

/* ---------- Ayudas ---------- */
const s = v => (v == null ? "" : String(v)).trim();
const pad = n => String(n).padStart(2, "0");
const esNum = v => typeof v === "number" && isFinite(v);
function fechaValida(iso) {
  const m = s(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
function fmtFecha(iso) { const m = s(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + "/" + m[2] + "/" + m[1] : ""; }
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
function fmtFechaDia(iso) {
  if (!fechaValida(iso)) return fmtFecha(iso);
  const p = iso.split("-").map(Number);
  return DIAS[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()] + " " + fmtFecha(iso);
}
function horaValida(h) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(s(h)); }
function fmtHora(h) { // "15:30" -> "3:30 p. m."
  if (!horaValida(h)) return s(h);
  let [hh, mm] = s(h).split(":").map(Number);
  const pm = hh >= 12; hh = hh % 12 || 12;
  return hh + ":" + pad(mm) + (pm ? " p. m." : " a. m.");
}
function diasEntre(a, b) {
  if (!fechaValida(a) || !fechaValida(b)) return null;
  const pa = a.split("-").map(Number), pb = b.split("-").map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}
function minutos(fecha, hora) { // minutos desde una fecha base, para medir escalas
  if (!fechaValida(fecha) || !horaValida(hora)) return null;
  const p = fecha.split("-").map(Number), h = hora.split(":").map(Number);
  return Date.UTC(p[0], p[1] - 1, p[2], h[0], h[1]) / 60000;
}
function fmtDuracion(min) { const h = Math.floor(min / 60), m = min % 60; return (h ? h + " h" : "") + (h && m ? " " : "") + (m || !h ? m + " min" : ""); }
function fmtTel(t) { const d = s(t).replace(/\D/g, ""); return d.length === 10 ? d.slice(0, 3) + " " + d.slice(3, 6) + " " + d.slice(6) : s(t); }
function plural(n, uno, varios) { return n + " " + (n === 1 ? uno : varios); }
function codigo(numero) { return esNum(numero) ? "RS-" + String(numero).padStart(4, "0") : "Sin número"; }
const nuevoId = () => "p" + Math.random().toString(36).slice(2, 10);
const ciudadClave = t => s(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/* ---------- Modelo ---------- */
function pasajeroVacio(tipo, nombre) { return { id: nuevoId(), nombre: nombre || "", tipo: tipo || "adulto", docTipo: "", docNumero: "", fechaNacimiento: "" }; }
function trayectoVacio(tipo) { return { tipo: tipo || "ida", fecha: "", origen: "", destino: "", salida: "", llegada: "", llegaOtroDia: false, vuelo: "", aerolinea: "" }; }
function vueloVacio() { return { aerolinea: "", codigoReserva: "", equipaje: "", tiquetes: {}, trayectos: [trayectoVacio("ida")], notas: "" }; }
function hotelVacio() { return { nombre: "", ciudad: "", direccion: "", telefono: "", confirmacion: "", entrada: "", salida: "", checkin: "15:00", checkout: "12:00", habitacion: "", habitaciones: 1, adultos: null, ninos: null, alimentacion: "", alimentacionDetalle: "", notas: "" }; }
function trasladoVacio() { return { tipo: "", fecha: "", hora: "", desde: "", hasta: "", proveedor: "", telefono: "", confirmacion: "", indicaciones: "" }; }
function actividadVacia() { return { nombre: "", fecha: "", hora: "", duracion: "", puntoEncuentro: "", proveedor: "", telefono: "", incluye: "", comoSeToma: "" }; }
function seccionActividadesVacia(titulo) { return { titulo: titulo || "", items: [actividadVacia()] }; }
function reservaVacia() {
  return {
    numero: null, estado: "por_confirmar", clienteId: null, cotizacionId: null, asesorId: null, asesorNombre: "",
    destino: "", fechaInicio: "", fechaFin: "",
    titular: { nombre: "", telefono: "", email: "" },
    pasajeros: [], vuelos: [], hoteles: [], traslados: [], actividades: [],
    incluye: [], asistencia: { compania: "", voucher: "", cobertura: "", desde: "", hasta: "", telefono: "" },
    recomendaciones: RECOMENDACIONES, notas: ""
  };
}
const TIPO_L = k => (TIPOS_PAX.find(t => t.k === k) || TIPOS_PAX[0]).l;
function conteoPasajeros(r) {
  const c = { adulto: 0, nino: 0, infante: 0 };
  (r.pasajeros || []).forEach(p => { c[p.tipo in c ? p.tipo : "adulto"]++; });
  return c;
}
function textoPasajeros(r) {
  const c = conteoPasajeros(r), out = [];
  if (c.adulto) out.push(plural(c.adulto, "adulto", "adultos"));
  if (c.nino) out.push(plural(c.nino, "niño", "niños"));
  if (c.infante) out.push(plural(c.infante, "infante", "infantes"));
  return out.join(" · ");
}
function nochesHotel(h) { const n = diasEntre(h.entrada, h.salida); return n != null && n >= 0 ? n : null; }

/* Fechas del viaje calculadas con todo lo registrado (vuelos, hoteles, traslados y actividades). */
function fechasCalculadas(r) {
  const fechas = [];
  (r.vuelos || []).forEach(v => (v.trayectos || []).forEach(t => { if (fechaValida(t.fecha)) fechas.push(t.fecha); }));
  (r.hoteles || []).forEach(h => { if (fechaValida(h.entrada)) fechas.push(h.entrada); if (fechaValida(h.salida)) fechas.push(h.salida); });
  (r.traslados || []).forEach(t => { if (fechaValida(t.fecha)) fechas.push(t.fecha); });
  (r.actividades || []).forEach(sec => (sec.items || []).forEach(a => { if (fechaValida(a.fecha)) fechas.push(a.fecha); }));
  fechas.sort();
  return { inicio: fechas[0] || "", fin: fechas[fechas.length - 1] || "" };
}
function fechasViaje(r) {
  const c = fechasCalculadas(r);
  return { inicio: fechaValida(r.fechaInicio) ? r.fechaInicio : c.inicio, fin: fechaValida(r.fechaFin) ? r.fechaFin : c.fin };
}

/* Itinerario de una reserva aérea: cada trayecto y las escalas entre trayectos seguidos
   (cuando un vuelo llega a la ciudad de donde sale el siguiente en menos de 24 horas). */
function itinerario(v) {
  const tr = (v.trayectos || []).filter(t => s(t.origen) || s(t.destino) || s(t.fecha) || s(t.vuelo));
  const out = [];
  tr.forEach((t, i) => {
    out.push({ tipo: "trayecto", t, i });
    const sig = tr[i + 1];
    if (!sig) return;
    const fechaLlega = t.llegaOtroDia && fechaValida(t.fecha) ? sumarDias(t.fecha, 1) : t.fecha;
    const a = minutos(fechaLlega, t.llegada), b = minutos(sig.fecha, sig.salida);
    const mismaCiudad = ciudadClave(t.destino) && ciudadClave(t.destino) === ciudadClave(sig.origen);
    if (mismaCiudad && a != null && b != null && b - a >= 0 && b - a < 24 * 60) out.push({ tipo: "escala", ciudad: s(t.destino), min: b - a });
  });
  return out;
}
function sumarDias(iso, n) {
  const p = iso.split("-").map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
}

/* ---------- Validación ----------
   modo "guardar": lo mínimo para no guardar datos inconsistentes.
   modo "voucher": además lo necesario para un voucher completo. */
function validar(r, modo) {
  const errores = [];
  const add = (tab, campo, msg) => errores.push({ tab, campo, msg });
  const t = r.titular || {};
  if (!s(t.nombre)) add("viaje", "r_titular", "Escribe el nombre del titular de la reserva.");
  if (s(t.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(t.email))) add("viaje", "r_email", "Revisa el correo del titular.");
  if (s(r.fechaInicio) && !fechaValida(r.fechaInicio)) add("viaje", "r_inicio", "La fecha de inicio del viaje no es válida.");
  if (s(r.fechaFin) && !fechaValida(r.fechaFin)) add("viaje", "r_fin", "La fecha de fin del viaje no es válida.");
  if (fechaValida(r.fechaInicio) && fechaValida(r.fechaFin) && diasEntre(r.fechaInicio, r.fechaFin) < 0) add("viaje", "r_fin", "La fecha de fin no puede ser anterior a la de inicio.");
  (r.pasajeros || []).forEach((p, i) => {
    if (s(p.fechaNacimiento) && !fechaValida(p.fechaNacimiento)) add("viaje", "pax_" + i, "La fecha de nacimiento del pasajero " + (i + 1) + " no es válida.");
  });
  (r.vuelos || []).forEach((v, vi) => (v.trayectos || []).forEach((tr, ti) => {
    const n = "trayecto " + (ti + 1) + (r.vuelos.length > 1 ? " de la reserva aérea " + (vi + 1) : "");
    if (s(tr.fecha) && !fechaValida(tr.fecha)) add("vuelos", "tr_" + vi + "_" + ti, "La fecha del " + n + " no es válida.");
    if (s(tr.salida) && !horaValida(tr.salida)) add("vuelos", "tr_" + vi + "_" + ti, "La hora de salida del " + n + " no es válida.");
    if (s(tr.llegada) && !horaValida(tr.llegada)) add("vuelos", "tr_" + vi + "_" + ti, "La hora de llegada del " + n + " no es válida.");
  }));
  (r.hoteles || []).forEach((h, i) => {
    const n = "hospedaje " + (i + 1) + (s(h.nombre) ? " (" + s(h.nombre) + ")" : "");
    if (s(h.entrada) && !fechaValida(h.entrada)) add("hoteles", "ho_" + i, "La fecha de entrada del " + n + " no es válida.");
    if (s(h.salida) && !fechaValida(h.salida)) add("hoteles", "ho_" + i, "La fecha de salida del " + n + " no es válida.");
    if (fechaValida(h.entrada) && fechaValida(h.salida) && diasEntre(h.entrada, h.salida) < 0) add("hoteles", "ho_" + i, "En el " + n + " la salida es anterior a la entrada.");
  });
  (r.traslados || []).forEach((x, i) => { if (s(x.fecha) && !fechaValida(x.fecha)) add("traslados", "tl_" + i, "La fecha del traslado " + (i + 1) + " no es válida."); });
  (r.actividades || []).forEach((sec, si) => (sec.items || []).forEach((a, ai) => {
    if (s(a.fecha) && !fechaValida(a.fecha)) add("actividades", "ac_" + si + "_" + ai, "La fecha de una actividad" + (s(a.nombre) ? " (" + s(a.nombre) + ")" : "") + " no es válida.");
  }));
  const as = r.asistencia || {};
  if (s(as.desde) && !fechaValida(as.desde)) add("incluye", "as_desde", "La fecha de inicio de la asistencia no es válida.");
  if (s(as.hasta) && !fechaValida(as.hasta)) add("incluye", "as_hasta", "La fecha final de la asistencia no es válida.");

  if (modo === "voucher") {
    if (!s(r.destino)) add("viaje", "r_destino", "Escribe el destino del viaje.");
    if (!(r.pasajeros || []).length) add("viaje", "pax_add", "Agrega al menos un pasajero.");
    (r.pasajeros || []).forEach((p, i) => { if (!s(p.nombre)) add("viaje", "pax_" + i, "Escribe el nombre completo del pasajero " + (i + 1) + "."); });
    if (!(r.vuelos || []).length && !(r.hoteles || []).length && !(r.traslados || []).length && !(r.actividades || []).length)
      add("vuelos", "vu_add", "Agrega al menos un vuelo, un hospedaje, un traslado o una actividad.");
    (r.vuelos || []).forEach((v, vi) => (v.trayectos || []).forEach((tr, ti) => {
      if (!s(tr.origen) || !s(tr.destino)) add("vuelos", "tr_" + vi + "_" + ti, "Escribe el origen y el destino del trayecto " + (ti + 1) + (r.vuelos.length > 1 ? " de la reserva aérea " + (vi + 1) : "") + ".");
      if (!fechaValida(tr.fecha)) add("vuelos", "tr_" + vi + "_" + ti, "Escribe la fecha del trayecto " + (ti + 1) + (r.vuelos.length > 1 ? " de la reserva aérea " + (vi + 1) : "") + ".");
    }));
    (r.hoteles || []).forEach((h, i) => {
      if (!s(h.nombre)) add("hoteles", "ho_" + i, "Escribe el nombre del hospedaje " + (i + 1) + ".");
      if (!fechaValida(h.entrada) || !fechaValida(h.salida)) add("hoteles", "ho_" + i, "Escribe las fechas de entrada y salida del hospedaje " + (i + 1) + ".");
    });
    (r.actividades || []).forEach((sec, si) => (sec.items || []).forEach((a, ai) => {
      if (!s(a.nombre)) add("actividades", "ac_" + si + "_" + ai, "Escribe el nombre de la actividad " + (ai + 1) + (s(sec.titulo) ? " en “" + s(sec.titulo) + "”" : "") + ".");
    }));
  }
  return { errores, ok: errores.length === 0 };
}

/* Alertas: datos que suelen faltar antes de enviar el voucher (no impiden generarlo). */
function alertas(r) {
  const out = [];
  const pax = r.pasajeros || [];
  if (!pax.length) out.push("No hay pasajeros registrados.");
  (r.vuelos || []).forEach((v, vi) => {
    const n = (r.vuelos.length > 1 ? "Reserva aérea " + (vi + 1) : "El vuelo") + (s(v.aerolinea) ? " (" + s(v.aerolinea) + ")" : "");
    if (!s(v.codigoReserva)) out.push(n + " no tiene código de reserva.");
    const sinT = pax.filter(p => !s((v.tiquetes || {})[p.id]));
    if (pax.length && sinT.length) out.push(n + ": falta el número de tiquete de " + (sinT.length === pax.length ? "todos los pasajeros" : sinT.map(p => s(p.nombre) || "un pasajero").join(", ")) + ".");
    if ((v.trayectos || []).some(t => !horaValida(t.salida) || !horaValida(t.llegada))) out.push(n + ": hay trayectos sin hora de salida o llegada.");
  });
  (r.hoteles || []).forEach((h, i) => { if (!s(h.confirmacion)) out.push("El hospedaje " + (s(h.nombre) || i + 1) + " no tiene número de confirmación."); });
  const pe = pax.filter(p => !s(p.docNumero));
  if (pax.length && pe.length) out.push("Falta el documento de " + (pe.length === pax.length ? "todos los pasajeros" : pe.map(p => s(p.nombre) || "un pasajero").join(", ")) + " (solo queda en el CRM).");
  if ((r.incluye || []).some(x => /asistencia/i.test(s(x.descripcion)) && x.incluido !== false) && !s((r.asistencia || {}).voucher)) out.push("La asistencia médica está incluida pero no tiene número de voucher o póliza.");
  return out;
}

function slug(t) { return s(t).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40); }
function nombreArchivo(r) { const n = slug((r.titular || {}).nombre); return "Voucher-" + codigo(r.numero) + (n ? "-" + n : "") + ".pdf"; }
function mensajeWhatsApp(r) {
  const nombre = s((r.titular || {}).nombre).split(/\s+/)[0] || "";
  const f = fechasViaje(r);
  let l2 = "Te comparto el voucher de tu viaje" + (s(r.destino) ? " a " + s(r.destino) : "") + " (" + codigo(r.numero) + ")";
  if (f.inicio) l2 += ", del " + fmtFecha(f.inicio) + (f.fin && f.fin !== f.inicio ? " al " + fmtFecha(f.fin) : "");
  const partes = [];
  if ((r.vuelos || []).length) partes.push("vuelos");
  if ((r.hoteles || []).length) partes.push("hospedaje");
  if ((r.traslados || []).length) partes.push("traslados");
  if ((r.actividades || []).length) partes.push("actividades");
  if (partes.length) l2 += ", con " + (partes.length > 1 ? partes.slice(0, -1).join(", ") + " y " + partes[partes.length - 1] : partes[0]);
  return [
    "Hola" + (nombre ? " " + nombre : "") + ", te saluda " + (s(r.asesorNombre) ? s(r.asesorNombre) + " de " : "") + "Diamond Travel.",
    l2 + ".",
    "Por favor revisa que los nombres de los pasajeros estén correctos.",
    "Si tienes una emergencia durante el viaje, escríbenos o llámanos 24/7 al " + AGENCIA.emergenciaTxt + ".",
    "¡Feliz viaje!"
  ].join("\n");
}

/* ---------- PDF ---------- */
const MM = 72 / 25.4;
const C = {
  navy: [14, 31, 61], gold: [184, 145, 58], goldInk: [134, 102, 31], goldSoft: [247, 241, 226], goldLine: [228, 216, 186],
  ink: [19, 33, 59], muted: [91, 104, 128], line: [220, 225, 235], zebra: [245, 246, 249], white: [255, 255, 255], onNavyMuted: [169, 180, 204],
  red: [169, 52, 52], redSoft: [250, 236, 236]
};

async function generarPDF(r, opts) {
  const { PDFDocument, StandardFonts, rgb } = opts.PDFLib;
  const col = a => rgb(a[0] / 255, a[1] / 255, a[2] / 255);
  const doc = await PDFDocument.create();
  doc.setTitle("Voucher de viaje " + codigo(r.numero) + " — Diamond Travel");
  doc.setAuthor("Diamond Travel"); doc.setCreator("Diamond Travel CRM"); doc.setProducer("Diamond Travel CRM");
  doc.setSubject("Voucher de viaje" + (s(r.destino) ? " a " + s(r.destino) : ""));
  const F = {
    reg: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold),
    ital: await doc.embedFont(StandardFonts.HelveticaOblique), disp: await doc.embedFont(StandardFonts.TimesRomanBold)
  };
  const charset = new Set(F.reg.getCharacterSet());
  const MAP = { "→": "–", "←": "–", "–": "–", " ": " ", " ": " ", " ": " ", "\t": "    " };
  const limpio = t => { let o = ""; for (const ch of String(t == null ? "" : t).normalize("NFC")) { if (ch === "\n") { o += ch; continue; } const m = MAP[ch] != null ? MAP[ch] : ch; for (const c2 of m) o += charset.has(c2.codePointAt(0)) ? c2 : ""; } return o; };
  const logo = opts.logoPng ? await doc.embedPng(opts.logoPng) : null;

  const W = 595.28, H = 841.89, ML = 16 * MM, MR = 16 * MM, CW = W - ML - MR, FOOT = 56, TOP_CONT = 64;
  let page, y;
  const T = (txt, x, yy, o) => { const t = limpio(txt); if (!t) return; page.drawText(t, { x, y: H - yy, size: o.size, font: o.font || F.reg, color: col(o.color || C.ink) }); };
  const width = (txt, font, size) => font.widthOfTextAtSize(limpio(txt), size);
  const TR = (txt, xr, yy, o) => T(txt, xr - width(txt, o.font || F.reg, o.size), yy, o);
  const spaced = (txt, x, yy, o) => { let cx = x; const sp = o.spacing || 1.2; for (const ch of limpio(txt)) { T(ch, cx, yy, o); cx += width(ch, o.font || F.reg, o.size) + sp; } };
  const spacedW = (txt, font, size, sp) => { let w = 0; for (const ch of limpio(txt)) w += width(ch, font, size) + sp; return w - sp; };
  const rect = (x, yy, w, h, fill, stroke, sw) => page.drawRectangle({ x, y: H - yy - h, width: w, height: h, color: fill ? col(fill) : undefined, borderColor: stroke ? col(stroke) : undefined, borderWidth: stroke ? (sw || 0.6) : 0 });
  const line = (x1, y1, x2, y2, c, th) => page.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: th || 0.6, color: col(c) });
  function wrap(txt, font, size, maxW) {
    const out = [];
    limpio(txt).split("\n").forEach(par => {
      let cur = "";
      par.split(/ +/).forEach(w0 => {
        let w = w0;
        while (width(w, font, size) > maxW) { let cut = w.length; while (cut > 1 && width(w.slice(0, cut), font, size) > maxW) cut--; if (cur) { out.push(cur); cur = ""; } out.push(w.slice(0, cut)); w = w.slice(cut); }
        const cand = cur ? cur + " " + w : w;
        if (width(cand, font, size) <= maxW) cur = cand; else { if (cur) out.push(cur); cur = w; }
      });
      out.push(cur);
    });
    while (out.length && out[out.length - 1] === "") out.pop();
    return out;
  }

  const fv = fechasViaje(r);
  function nuevaPagina(primera) {
    page = doc.addPage([W, H]);
    if (primera) {
      const BH = 128;
      rect(0, 0, W, BH, C.navy); rect(0, BH, W, 2.2, C.gold);
      if (logo) { const lh = 100, lw = lh * logo.width / logo.height; page.drawImage(logo, { x: ML - 4, y: H - 14 - lh, width: lw, height: lh }); }
      else T("DIAMOND TRAVEL", ML, 60, { size: 20, font: F.disp, color: C.white });
      const xr = W - MR, lab = "VOUCHER DE VIAJE";
      spaced(lab, xr - spacedW(lab, F.bold, 8.5, 1.6), 38, { size: 8.5, font: F.bold, color: C.gold, spacing: 1.6 });
      TR(codigo(r.numero), xr, 68, { size: 26, font: F.disp, color: C.white });
      TR("Emitido el " + fmtFecha(opts.hoy || new Date().toISOString().slice(0, 10)), xr, 88, { size: 9.5, color: C.onNavyMuted });
      if (r.estado === "confirmada" || r.estado === "en_viaje") TR("RESERVA CONFIRMADA", xr, 104, { size: 9, font: F.bold, color: C.gold });
      y = BH + 24;
    } else {
      rect(0, 0, W, 40, C.navy); rect(0, 40, W, 1.6, C.gold);
      T("DIAMOND TRAVEL", ML, 25, { size: 12, font: F.disp, color: C.white });
      TR("Voucher " + codigo(r.numero) + (s((r.titular || {}).nombre) ? "  ·  " + s(r.titular.nombre) : ""), W - MR, 25, { size: 9.5, font: F.bold, color: C.gold });
      y = TOP_CONT;
    }
  }
  const cabe = h => y + h <= H - FOOT - 10;
  const asegurar = h => { if (!cabe(h)) nuevaPagina(false); };
  function tituloSeccion(t, minSig) { asegurar(30 + (minSig || 40)); y += 10; T(t, ML, y + 11, { size: 13, font: F.bold, color: C.navy }); rect(ML, y + 17, 26, 1.6, C.gold); y += 28; }
  function subtitulo(t, o) {
    asegurar((o && o.min) || 50);
    wrap(t, F.bold, 11.5, CW).forEach(ln => { T(ln, ML, y + 11, { size: 11.5, font: F.bold, color: C.navy }); y += 15; });
    y += 3;
  }
  function parrafo(txt, o) {
    o = o || {}; const size = o.size || 10, lh = size * 1.42, font = o.font || F.reg, x = o.x || ML;
    wrap(txt, font, size, o.width || CW).forEach(ln => { asegurar(lh); T(ln, x, y + size, { size, font, color: o.color || C.ink }); y += lh; });
  }
  // rejilla de datos: pares [etiqueta, valor] en 2 o 3 columnas
  function rejilla(pares, cols, x0, w0) {
    pares = pares.filter(p => s(p[1])); if (!pares.length) return;
    x0 = x0 == null ? ML : x0; w0 = w0 || CW; cols = cols || 3;
    const cw = w0 / cols;
    for (let i = 0; i < pares.length; i += cols) {
      const fila = pares.slice(i, i + cols);
      const lns = fila.map(p => wrap(p[1], F.bold, 10, cw - 10));
      const h = 13 + Math.max(...lns.map(l => l.length)) * 13 + 6;
      asegurar(h);
      fila.forEach((p, j) => {
        const x = x0 + j * cw;
        T(p[0].toUpperCase(), x, y + 8, { size: 7, font: F.bold, color: C.goldInk });
        lns[j].forEach((ln, k) => T(ln, x, y + 21 + k * 13, { size: 10, font: F.bold, color: C.ink }));
      });
      y += h;
    }
  }
  function tabla(cols, filas, o) {
    const hp = 6, size = (o && o.size) || 9.5, lh = size * 1.35;
    const xs = []; let acc = ML; cols.forEach(c => { xs.push(acc); acc += c.w * CW; });
    const head = () => { rect(ML, y, CW, 20, C.navy); cols.forEach((c, i) => T(c.l, xs[i] + hp, y + 13.5, { size: 8, font: F.bold, color: C.white })); y += 20; };
    asegurar(20 + 26); head();
    filas.forEach((f, ri) => {
      if (f.escala) {
        const h = 20; if (!cabe(h)) { nuevaPagina(false); head(); }
        rect(ML, y, CW, h, C.goldSoft);
        T(f.escala, ML + hp + 4, y + 13.5, { size: 8.5, font: F.bold, color: C.goldInk });
        y += h; line(ML, y, ML + CW, y, C.line, 0.5); return;
      }
      const cells = cols.map((c, i) => {
        const v = f.celdas[i];
        const partes = Array.isArray(v) ? v : [v];
        return partes.map((p, pi) => ({ ls: wrap(s(p), pi === 0 && c.negrita ? F.bold : F.reg, pi === 0 ? size : size - 1, c.w * CW - hp * 2), pi }));
      });
      const altoCelda = cl => cl.reduce((a, x) => a + Math.max(x.ls.length, x.ls.length ? 1 : 0) * lh, 0);
      const h = Math.max(...cells.map(altoCelda), lh) + 10;
      if (!cabe(h)) { nuevaPagina(false); head(); }
      if (ri % 2 === 1) rect(ML, y, CW, h, C.zebra);
      cells.forEach((cl, i) => {
        let yy = y + 5 + size;
        cl.forEach(x => x.ls.forEach(ln => {
          T(ln, xs[i] + hp, yy, { size: x.pi === 0 ? size : size - 1, font: x.pi === 0 && cols[i].negrita ? F.bold : F.reg, color: x.pi === 0 ? C.ink : C.muted });
          yy += lh;
        }));
      });
      y += h; line(ML, y, ML + CW, y, C.line, 0.5);
    });
    y += 6;
  }
  function vineta(txt, tipo) {
    const ls = wrap(txt, F.reg, 10, CW - 18);
    asegurar(ls.length * 14 + 4);
    const cy = y + 6.5;
    if (tipo === "si") {
      page.drawLine({ start: { x: ML + 1, y: H - cy }, end: { x: ML + 4, y: H - cy - 3.2 }, thickness: 1.5, color: col(C.gold) });
      page.drawLine({ start: { x: ML + 4, y: H - cy - 3.2 }, end: { x: ML + 9.5, y: H - cy + 3.5 }, thickness: 1.5, color: col(C.gold) });
    } else if (tipo === "no") line(ML + 2, cy, ML + 8, cy, C.muted, 1.3);
    else page.drawCircle({ x: ML + 4, y: H - cy, size: 1.8, color: col(C.gold) });
    ls.forEach(ln => { T(ln, ML + 18, y + 10, { size: 10, color: tipo === "no" ? C.muted : C.ink }); y += 14; });
    y += 2;
  }
  // tarjeta con borde: se dibuja después de medir el contenido (si no cabe en la página, empieza en la siguiente)
  function tarjeta(dibujar, alto) {
    if (!cabe(alto) && alto < H - FOOT - 10 - TOP_CONT) nuevaPagina(false);
    const y0 = y, p0 = page;
    y += 12;
    dibujar();
    y += 6;
    if (page === p0) { p0.drawRectangle({ x: ML - 8, y: H - y, width: CW + 16, height: y - y0, borderColor: col(C.line), borderWidth: 0.8 }); rect(ML - 8, y0, 3, y - y0, C.gold); }
    y += 10;
  }

  /* ----- Contenido ----- */
  const ti = r.titular || {};
  nuevaPagina(true);
  // Titular y contactos
  {
    const colW = CW * 0.58;
    T("TITULAR DE LA RESERVA", ML, y + 8, { size: 7.5, font: F.bold, color: C.goldInk });
    let yy = y + 26;
    wrap(s(ti.nombre) || "—", F.bold, 15, colW - 10).forEach(l => { T(l, ML, yy, { size: 15, font: F.bold, color: C.navy }); yy += 18; });
    const cont = [fmtTel(ti.telefono), s(ti.email)].filter(Boolean).join("   ·   ");
    if (cont) { T(cont, ML, yy, { size: 9.5, color: C.muted }); yy += 14; }
    if (s(r.asesorNombre)) { T("Asesor(a): " + s(r.asesorNombre), ML, yy, { size: 9.5, color: C.muted }); yy += 14; }
    // caja de emergencia
    const bx = ML + colW + 6, bw = CW - colW - 6, bh = 70;
    rect(bx, y, bw, bh, C.redSoft); rect(bx, y, 3, bh, C.red);
    T("EMERGENCIAS 24/7", bx + 14, y + 16, { size: 7.5, font: F.bold, color: C.red });
    T(AGENCIA.emergenciaTxt, bx + 14, y + 36, { size: 17, font: F.bold, color: C.navy });
    T("Contacto y reservas: " + AGENCIA.whatsappTxt, bx + 14, y + 54, { size: 8.5, color: C.muted });
    y = Math.max(yy, y + bh) + 12;
  }
  // Resumen del viaje
  {
    const noches = fv.inicio && fv.fin ? diasEntre(fv.inicio, fv.fin) : null;
    const celdas = [
      ["DESTINO", s(r.destino)],
      ["FECHAS", fv.inicio ? fmtFecha(fv.inicio) + (fv.fin && fv.fin !== fv.inicio ? "  –  " + fmtFecha(fv.fin) : "") : ""],
      ["DURACIÓN", noches != null && noches > 0 ? plural(noches + 1, "día", "días") + " · " + plural(noches, "noche", "noches") : ""],
      ["PASAJEROS", textoPasajeros(r)]
    ].filter(c => c[1]);
    if (celdas.length) {
      const p2 = 14, cw = (CW - p2 * 2) / celdas.length;
      const lns = celdas.map(c => wrap(c[1], F.bold, 11, cw - 12));
      const h = 30 + Math.max(...lns.map(l => l.length)) * 14;
      asegurar(h);
      rect(ML, y, CW, h, C.goldSoft); rect(ML, y, 3, h, C.gold);
      celdas.forEach((c, i) => {
        const x = ML + p2 + i * cw;
        T(c[0], x, y + 19, { size: 7.5, font: F.bold, color: C.goldInk });
        lns[i].forEach((ln, li) => T(ln, x, y + 34 + li * 14, { size: 11, font: F.bold, color: C.navy }));
      });
      y += h + 6;
    }
  }
  // Pasajeros (sin documentos)
  const pax = r.pasajeros || [];
  if (pax.length) {
    tituloSeccion("Pasajeros", 50);
    tabla([{ l: "#", w: 0.07 }, { l: "NOMBRE COMPLETO", w: 0.68, negrita: true }, { l: "TIPO", w: 0.25 }],
      pax.map((p, i) => ({ celdas: [String(i + 1), s(p.nombre) || "—", TIPO_L(p.tipo)] })));
  }
  // Vuelos
  const vuelos = (r.vuelos || []).filter(v => s(v.aerolinea) || s(v.codigoReserva) || (v.trayectos || []).some(t => s(t.origen) || s(t.destino)));
  if (vuelos.length) {
    tituloSeccion("Vuelos", 90);
    vuelos.forEach((v, vi) => {
      if (vi > 0) y += 8;
      asegurar(110);
      // franja con aerolínea y código de reserva
      const bh = 40;
      rect(ML, y, CW, bh, C.navy); rect(ML, y + bh, CW, 1.6, C.gold);
      T(vuelos.length > 1 ? "RESERVA AÉREA " + (vi + 1) : "RESERVA AÉREA", ML + 12, y + 15, { size: 7, font: F.bold, color: C.gold });
      T(s(v.aerolinea) || "Aerolínea por confirmar", ML + 12, y + 31, { size: 12, font: F.bold, color: C.white });
      if (s(v.codigoReserva)) {
        TR("CÓDIGO DE RESERVA", W - MR - 12, y + 15, { size: 7, font: F.bold, color: C.gold });
        TR(s(v.codigoReserva).toUpperCase(), W - MR - 12, y + 32, { size: 15, font: F.bold, color: C.white });
      }
      y += bh + 8;
      const it = itinerario(v);
      if (it.length) {
        const tl = k => (TIPOS_TRAYECTO.find(t => t.k === k) || { l: "" }).l;
        tabla([{ l: "TRAYECTO", w: 0.17, negrita: true }, { l: "VUELO", w: 0.15 }, { l: "SALE", w: 0.34, negrita: true }, { l: "LLEGA", w: 0.34, negrita: true }],
          it.map(x => x.tipo === "escala" ? { escala: "Escala en " + x.ciudad + "  ·  " + fmtDuracion(x.min) + " de espera" } : {
            celdas: [
              [tl(x.t.tipo), fmtFechaDia(x.t.fecha)],
              [s(x.t.vuelo) || "—", s(x.t.aerolinea) && s(x.t.aerolinea) !== s(v.aerolinea) ? s(x.t.aerolinea) : ""],
              [s(x.t.origen), fmtHora(x.t.salida)],
              [s(x.t.destino), fmtHora(x.t.llegada) + (x.t.llegaOtroDia ? " (día siguiente)" : "")]
            ]
          }));
      }
      const tiq = pax.filter(p => s((v.tiquetes || {})[p.id]));
      if (tiq.length) {
        asegurar(40);
        T("NÚMEROS DE TIQUETE", ML, y + 8, { size: 7.5, font: F.bold, color: C.goldInk }); y += 14;
        tiq.forEach(p => {
          asegurar(16);
          T(s(p.nombre) || "Pasajero", ML, y + 10, { size: 9.5, color: C.ink });
          TR(s(v.tiquetes[p.id]), ML + CW, y + 10, { size: 9.5, font: F.bold, color: C.navy });
          y += 14; line(ML, y, ML + CW, y, C.line, 0.4); y += 2;
        });
        y += 4;
      }
      if (s(v.equipaje)) { asegurar(30); T("EQUIPAJE", ML, y + 8, { size: 7.5, font: F.bold, color: C.goldInk }); y += 12; parrafo(v.equipaje, { size: 9.5 }); }
      if (s(v.notas)) { y += 2; parrafo(v.notas, { size: 9.5, color: C.muted }); }
    });
  }
  // Hospedaje
  const hoteles = (r.hoteles || []).filter(h => s(h.nombre));
  if (hoteles.length) {
    tituloSeccion("Hospedaje", 120);
    hoteles.forEach(h => {
      const n = nochesHotel(h);
      const huesp = [h.adultos ? plural(h.adultos, "adulto", "adultos") : "", h.ninos ? plural(h.ninos, "niño", "niños") : ""].filter(Boolean).join(" · ");
      const alim = [s(h.alimentacion), s(h.alimentacionDetalle)].filter(Boolean).join(" — ");
      const alto = 60 + 3 * 40 + (alim ? 30 : 0) + (s(h.notas) ? 40 : 0);
      tarjeta(() => {
        wrap(s(h.nombre), F.bold, 13, CW - 10).forEach(ln => { T(ln, ML + 4, y + 11, { size: 13, font: F.bold, color: C.navy }); y += 16; });
        const dir = [s(h.direccion), s(h.ciudad)].filter(Boolean).join(", ");
        if (dir) { y += 1; parrafo(dir + (s(h.telefono) ? "  ·  Tel. " + fmtTel(h.telefono) : ""), { size: 9, color: C.muted, x: ML + 4, width: CW - 10 }); }
        y += 8;
        rejilla([
          ["Entrada (check-in)", h.entrada ? fmtFechaDia(h.entrada) + (horaValida(h.checkin) ? "\nDesde las " + fmtHora(h.checkin) : "") : ""],
          ["Salida (check-out)", h.salida ? fmtFechaDia(h.salida) + (horaValida(h.checkout) ? "\nHasta las " + fmtHora(h.checkout) : "") : ""],
          ["Noches", n != null ? String(n) : ""],
          ["Confirmación", s(h.confirmacion)],
          ["Habitación", [h.habitaciones > 1 ? h.habitaciones + " habitaciones" : "", s(h.habitacion)].filter(Boolean).join(" · ")],
          ["Huéspedes", huesp]
        ], 3, ML + 4, CW - 8);
        if (alim) { asegurar(30); y += 2; rejilla([["Alimentación", alim]], 1, ML + 4, CW - 8); }
        if (s(h.notas)) { y += 2; parrafo(h.notas, { size: 9.5, color: C.muted, x: ML + 4, width: CW - 10 }); }
      }, alto);
    });
  }
  // Traslados
  const traslados = (r.traslados || []).filter(t => s(t.tipo) || s(t.desde) || s(t.hasta) || s(t.fecha));
  if (traslados.length) {
    tituloSeccion("Traslados", 60);
    tabla([{ l: "FECHA Y HORA", w: 0.22, negrita: true }, { l: "TRAYECTO", w: 0.43, negrita: true }, { l: "EMPRESA Y CONTACTO", w: 0.35 }],
      traslados.map(t => ({ celdas: [
        [fmtFechaDia(t.fecha) || "Por confirmar", fmtHora(t.hora)],
        [[s(t.desde), s(t.hasta)].filter(Boolean).join(" – ") || s(t.tipo), [s(t.desde) || s(t.hasta) ? s(t.tipo) : "", s(t.confirmacion) ? "Confirmación: " + s(t.confirmacion) : "", s(t.indicaciones)].filter(Boolean).join("\n")],
        [s(t.proveedor) || "—", s(t.telefono) ? "Tel. " + fmtTel(t.telefono) : ""]
      ] })));
  }
  // Actividades por secciones
  const secciones = (r.actividades || []).map(sec => ({ titulo: s(sec.titulo), items: (sec.items || []).filter(a => s(a.nombre)) })).filter(sec => sec.items.length);
  if (secciones.length) {
    tituloSeccion("Actividades", 100);
    secciones.forEach((sec, si) => {
      if (secciones.length > 1 || sec.titulo) { if (si > 0) y += 4; subtitulo(sec.titulo || "Actividades", { min: 110 }); }
      sec.items.forEach(a => {
        const meta = [
          ["Fecha", fmtFechaDia(a.fecha)], ["Hora", fmtHora(a.hora)], ["Duración", s(a.duracion)],
          ["Punto de encuentro", s(a.puntoEncuentro)], ["Operador", [s(a.proveedor), s(a.telefono) ? "Tel. " + fmtTel(a.telefono) : ""].filter(Boolean).join("\n")]
        ];
        const lnsComo = s(a.comoSeToma) ? wrap(a.comoSeToma, F.reg, 9.5, CW - 34).length : 0;
        const alto = 40 + Math.ceil(meta.filter(m => s(m[1])).length / 3) * 32 + (s(a.incluye) ? 34 : 0) + (lnsComo ? 30 + lnsComo * 13.5 : 0);
        tarjeta(() => {
          wrap(s(a.nombre), F.bold, 12, CW - 10).forEach(ln => { T(ln, ML + 4, y + 10, { size: 12, font: F.bold, color: C.navy }); y += 15; });
          y += 6;
          rejilla(meta, 3, ML + 4, CW - 8);
          if (s(a.incluye)) { asegurar(28); y += 2; T("INCLUYE", ML + 4, y + 8, { size: 7, font: F.bold, color: C.goldInk }); y += 12; parrafo(a.incluye, { size: 9.5, x: ML + 4, width: CW - 10 }); }
          if (lnsComo) {
            y += 6; asegurar(40);
            const y0 = y;
            T("CÓMO SE TOMA LA ACTIVIDAD", ML + 16, y + 12, { size: 7.5, font: F.bold, color: C.goldInk }); y += 18;
            const p0 = page;
            parrafo(a.comoSeToma, { size: 9.5, x: ML + 16, width: CW - 34 });
            y += 6;
            if (page === p0) rect(ML + 4, y0, 2, y - y0, C.gold);
          }
        }, alto);
      });
    });
  }
  // Incluye / no incluye
  const incl = (r.incluye || []).filter(x => s(x.descripcion) && x.incluido !== false);
  const noIncl = (r.incluye || []).filter(x => s(x.descripcion) && x.incluido === false);
  if (incl.length) { tituloSeccion("Tu viaje incluye"); incl.forEach(x => vineta(x.descripcion, "si")); }
  if (noIncl.length) { tituloSeccion("No incluye"); noIncl.forEach(x => vineta(x.descripcion, "no")); }
  // Asistencia médica
  const as = r.asistencia || {};
  if (s(as.compania) || s(as.voucher) || s(as.telefono)) {
    tituloSeccion("Asistencia médica", 60);
    rejilla([
      ["Compañía", s(as.compania)], ["Voucher o póliza", s(as.voucher)], ["Teléfono de asistencia", s(as.telefono)],
      ["Vigencia", as.desde || as.hasta ? [fmtFecha(as.desde), fmtFecha(as.hasta)].filter(Boolean).join(" al ") : ""], ["Cobertura", s(as.cobertura)]
    ], 3);
  }
  // Recomendaciones y observaciones
  if (s(r.recomendaciones)) {
    tituloSeccion("Recomendaciones", 50);
    s(r.recomendaciones).split("\n").map(x => x.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean).forEach(x => vineta(x, "punto"));
  }
  if (s(r.notas)) { tituloSeccion("Observaciones", 40); parrafo(r.notas); }

  // Contacto final
  {
    const h = 74;
    asegurar(h + 14); y += 12;
    rect(ML, y, CW, h, C.navy); rect(ML, y + h, CW, 2, C.gold);
    T("¡Feliz viaje!", ML + 16, y + 26, { size: 16, font: F.disp, color: C.white });
    T("Estamos contigo antes, durante y después de tu viaje.", ML + 16, y + 42, { size: 8.5, color: C.onNavyMuted });
    T(AGENCIA.correo + "  ·  " + AGENCIA.instagram, ML + 16, y + 58, { size: 8.5, color: C.onNavyMuted });
    const x2 = ML + CW * 0.58;
    T("EMERGENCIAS 24/7", x2, y + 20, { size: 7, font: F.bold, color: C.gold });
    T(AGENCIA.emergenciaTxt, x2, y + 36, { size: 13, font: F.bold, color: C.white });
    T("CONTACTO Y RESERVAS", x2, y + 52, { size: 7, font: F.bold, color: C.gold });
    T("WhatsApp " + AGENCIA.whatsappTxt, x2, y + 66, { size: 10, font: F.bold, color: C.white });
    y += h;
  }
  // Pies de página
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    page = p;
    line(ML, H - FOOT + 8, W - MR, H - FOOT + 8, C.gold, 0.7);
    T("Diamond Travel  ·  WhatsApp " + AGENCIA.whatsappTxt + "  ·  Emergencias 24/7: " + AGENCIA.emergenciaTxt + "  ·  " + AGENCIA.correo, ML, H - FOOT + 22, { size: 7.5, color: C.muted });
    T(AGENCIA.direccion, ML, H - FOOT + 33, { size: 7.5, color: C.muted });
    TR("Página " + (i + 1) + " de " + pages.length, W - MR, H - FOOT + 22, { size: 7.5, font: F.bold, color: C.navy });
  });
  return await doc.save();
}

const API = {
  AGENCIA, ESTADOS, TIPOS_PAX, TIPOS_DOC, TIPOS_TRAYECTO, ALIMENTACION, SUG_INCLUYE, RECOMENDACIONES,
  codigo, fmtFecha, fmtFechaDia, fmtHora, horaValida, fechaValida, diasEntre, nochesHotel, fechasCalculadas, fechasViaje, itinerario, fmtDuracion,
  pasajeroVacio, trayectoVacio, vueloVacio, hotelVacio, trasladoVacio, actividadVacia, seccionActividadesVacia, reservaVacia,
  conteoPasajeros, textoPasajeros, validar, alertas, nombreArchivo, mensajeWhatsApp, generarPDF
};
if (typeof module !== "undefined" && module.exports) module.exports = API; else root.DTRes = API;
})(typeof window !== "undefined" ? window : globalThis);
