/* Diamond Travel CRM — motor de cotizaciones (cálculos, validación y PDF).
   Funciona en el navegador (window.DTCot) y en Node (module.exports) para pruebas. */
(function (root) {
"use strict";

const AGENCIA = {
  nombre: "Diamond Travel",
  whatsapp: "3052051183",
  whatsappTxt: "305 205 1183",
  direccion: "Calle 17 OE-48, barrio Caobos, Cúcuta, Norte de Santander, Colombia",
  correo: "reservasdiamondtravel@gmail.com",
  instagram: "@diamondtours_cucuta"
};

const ESTADOS = [
  { k: "borrador", l: "Borrador" },
  { k: "enviada", l: "Enviada" },
  { k: "aceptada", l: "Aceptada" },
  { k: "vencida", l: "Vencida" },
  { k: "cancelada", l: "Cancelada" }
];
const MONEDAS = {
  COP: { l: "Pesos colombianos (COP)", locale: "es-CO" },
  USD: { l: "Dólares estadounidenses (USD)", locale: "es-CO" },
  EUR: { l: "Euros (EUR)", locale: "es-CO" }
};

/* ---------- Helpers ---------- */
const s = v => (v == null ? "" : String(v)).trim();
const pad = n => String(n).padStart(2, "0");
function esNum(v) { return typeof v === "number" && isFinite(v); }
function fmtFecha(iso) {
  const m = s(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + "/" + m[2] + "/" + m[1] : "";
}
function fechaValida(iso) {
  const m = s(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
function diasEntre(a, b) { // b - a, ISO dates
  if (!fechaValida(a) || !fechaValida(b)) return null;
  const pa = a.split("-").map(Number), pb = b.split("-").map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}
function fmtMoneda(n, moneda) {
  if (!esNum(n)) return "";
  const m = MONEDAS[moneda] ? moneda : "COP";
  const neg = n < 0;
  const abs = new Intl.NumberFormat("es-CO", { style: "currency", currency: m, maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(Math.abs(Math.round(n)));
  return (neg ? "- " : "") + abs.replace(/ /g, " ");
}
function fmtTel(t) {
  const d = s(t).replace(/\D/g, "");
  if (d.length === 10) return d.slice(0, 3) + " " + d.slice(3, 6) + " " + d.slice(6);
  return s(t);
}
function plural(n, uno, varios) { return n + " " + (n === 1 ? uno : varios); }
function codigo(numero) { return esNum(numero) ? "DT-" + String(numero).padStart(4, "0") : "Sin número"; }

function parseEdades(txt) {
  const t = s(txt);
  if (!t) return [];
  return t.split(/[,;\s]+|\by\b/i).map(x => x.trim()).filter(Boolean).map(x => (/^\d{1,2}$/.test(x) ? parseInt(x, 10) : NaN));
}
function enteroONulo(v) {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isInteger(n) ? n : NaN;
}

/* ---------- Cálculos ---------- */
/* Opciones de precio: una cotización puede ofrecer varias (p. ej. solo desayuno / todo incluido).
   Las cotizaciones antiguas, con precios sueltos, se leen como una sola opción. */
function opcionesDe(val) {
  val = val || {};
  if (Array.isArray(val.opciones) && val.opciones.length) return val.opciones;
  return [{ nombre: "", detalle: "", precioAdulto: val.precioAdulto, precioNino: val.precioNino, precioInfante: val.precioInfante }];
}
function calcular(q) {
  const v = (q && q.viaje) || {}, val = (q && q.valores) || {};
  const cant = { adultos: enteroONulo(v.adultos) || 0, ninos: enteroONulo(v.ninos) || 0, infantes: enteroONulo(v.infantes) || 0 };
  const cargos = (val.cargos || []).filter(x => x && (s(x.concepto) || esNum(x.valor)));
  const descuentos = (val.descuentos || []).filter(x => x && (s(x.concepto) || esNum(x.valor)));
  const totalCargos = cargos.reduce((a, x) => a + (esNum(x.valor) ? x.valor : 0), 0);
  const totalDescuentos = descuentos.reduce((a, x) => a + (esNum(x.valor) ? x.valor : 0), 0);
  const pax = cant.adultos + cant.ninos + cant.infantes;
  const anticipo = esNum(val.anticipo) ? val.anticipo : null;
  const ops = opcionesDe(val).map(o => {
    o = o || {};
    const cats = [
      { k: "adultos", campo: "precioAdulto", l: "Adultos", unit: o.precioAdulto },
      { k: "ninos", campo: "precioNino", l: "Niños", unit: o.precioNino },
      { k: "infantes", campo: "precioInfante", l: "Infantes", unit: o.precioInfante }
    ];
    const faltantes = [], lineas = [];
    let subtotalPasajeros = 0;
    cats.forEach(c => {
      const n = cant[c.k];
      if (!(n > 0)) return;
      const ok = esNum(c.unit) && c.unit >= 0;
      if (!ok) faltantes.push(c.k);
      const sub = ok ? n * c.unit : null;
      if (ok) subtotalPasajeros += sub;
      lineas.push({ k: c.k, campo: c.campo, concepto: c.l, cant: n, unit: ok ? c.unit : null, subtotal: sub });
    });
    const total = subtotalPasajeros + totalCargos - totalDescuentos;
    const completo = faltantes.length === 0 && pax > 0;
    return { nombre: s(o.nombre), detalle: s(o.detalle), lineas, faltantes, completo, subtotalPasajeros, total,
      porPersona: completo && pax > 0 ? Math.round(total / pax) : null, saldo: anticipo != null ? total - anticipo : null };
  });
  const elegida = Number.isInteger(val.opcionElegida) && ops[val.opcionElegida] ? val.opcionElegida : null;
  const p = ops[elegida != null ? elegida : 0];
  const completos = ops.filter(o => o.completo);
  return {
    opciones: ops, multiple: ops.length > 1, elegida,
    lineas: p.lineas, faltantes: p.faltantes, subtotalPasajeros: p.subtotalPasajeros, total: p.total, porPersona: p.porPersona, saldo: p.saldo,
    completo: ops.every(o => o.completo),
    minimo: completos.length ? Math.min(...completos.map(o => o.total)) : null,
    cargos, descuentos, totalCargos, totalDescuentos, pax, anticipo
  };
}

/* ---------- Validación ----------
   modo "borrador": exige lo mínimo para guardar sin datos inconsistentes.
   modo "pdf": además exige lo necesario para un documento completo. */
function validar(q, modo) {
  const errores = [], avisos = [];
  const add = (tab, campo, msg) => errores.push({ tab, campo, msg });
  const c = q.cliente || {}, v = q.viaje || {}, val = q.valores || {}, cond = q.condiciones || {};
  if (!s(c.nombre)) add("cliente", "c_nombre", "Escribe el nombre del cliente.");
  if (s(c.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(c.email))) add("cliente", "c_email", "Revisa el correo del cliente: debe tener el formato nombre@dominio.com.");
  if (!fechaValida(q.fechaElaboracion)) add("cliente", "q_fecha", "Indica la fecha de elaboración.");
  if (s(q.fechaVencimiento)) {
    if (!fechaValida(q.fechaVencimiento)) add("cliente", "q_venc", "La fecha de vigencia no es válida.");
    else if (diasEntre(q.fechaElaboracion, q.fechaVencimiento) < 0) add("cliente", "q_venc", "La vigencia no puede ser anterior a la fecha de elaboración.");
  }
  // Viaje
  if (s(v.fechaIda) && !fechaValida(v.fechaIda)) add("viaje", "v_ida", "La fecha de ida no es válida.");
  if (s(v.fechaRegreso) && !fechaValida(v.fechaRegreso)) add("viaje", "v_regreso", "La fecha de regreso no es válida.");
  if (fechaValida(v.fechaIda) && fechaValida(v.fechaRegreso) && diasEntre(v.fechaIda, v.fechaRegreso) < 0) add("viaje", "v_regreso", "La fecha de regreso no puede ser anterior a la de ida.");
  if (fechaValida(v.fechaIda) && fechaValida(q.fechaElaboracion) && diasEntre(q.fechaElaboracion, v.fechaIda) < 0) avisos.push("La fecha de ida es anterior a la fecha de elaboración.");
  const noches = enteroONulo(v.noches);
  if (Number.isNaN(noches) || (noches != null && (noches < 0 || noches > 365))) add("viaje", "v_noches", "El número de noches debe ser un número entero entre 0 y 365.");
  const cantidades = [["adultos", "v_adultos", "adultos"], ["ninos", "v_ninos", "niños"], ["infantes", "v_infantes", "infantes"]];
  cantidades.forEach(([k, campo, l]) => {
    const n = enteroONulo(v[k]);
    if (Number.isNaN(n) || (n != null && (n < 0 || n > 99))) add("viaje", campo, "El número de " + l + " debe ser un número entero entre 0 y 99.");
  });
  const ninos = enteroONulo(v.ninos) || 0, adultos = enteroONulo(v.adultos) || 0, infantes = enteroONulo(v.infantes) || 0;
  const edades = parseEdades(v.edadesNinos);
  if (edades.some(e => Number.isNaN(e) || e < 0 || e > 17)) add("viaje", "v_edades", "Escribe las edades de los niños como números separados por comas (por ejemplo: 5, 8).");
  else if (edades.length && edades.length !== ninos) add("viaje", "v_edades", "Escribiste " + plural(edades.length, "edad", "edades") + " pero hay " + plural(ninos, "niño", "niños") + ".");
  (v.tramos || []).forEach((t, i) => { if (s(t.fecha) && !fechaValida(t.fecha)) add("viaje", "tramo_" + i, "La fecha del trayecto " + (i + 1) + " no es válida."); });
  // Valores
  const ops = opcionesDe(val), varias = ops.length > 1;
  const nomOp = i => "la opción " + (i + 1) + (s(ops[i].nombre) ? " (" + s(ops[i].nombre) + ")" : "");
  ops.forEach((o, i) => {
    [["precioAdulto", "precio por adulto"], ["precioNino", "precio por niño"], ["precioInfante", "precio por infante"]].forEach(([k, l]) => {
      if (o[k] != null && (!esNum(o[k]) || o[k] < 0)) add("valores", "op_" + i + "_" + k, "El " + l + (varias ? " de " + nomOp(i) : "") + " no es un valor válido.");
    });
    if (varias && !s(o.nombre)) add("valores", "op_" + i + "_nombre", "Escribe el nombre de la opción " + (i + 1) + " (por ejemplo: Todo incluido).");
  });
  if (val.anticipo != null && (!esNum(val.anticipo) || val.anticipo < 0)) add("valores", "p_anticipo", "El anticipo no es un valor válido.");
  (val.cargos || []).forEach((x, i) => {
    if (esNum(x.valor) && !s(x.concepto)) add("valores", "cargo_" + i, "Escribe el concepto del cargo " + (i + 1) + ".");
    if (s(x.concepto) && !esNum(x.valor)) add("valores", "cargo_" + i, "Escribe el valor del cargo “" + s(x.concepto) + "”.");
  });
  (val.descuentos || []).forEach((x, i) => {
    if (esNum(x.valor) && !s(x.concepto)) add("valores", "desc_" + i, "Escribe el concepto del descuento " + (i + 1) + ".");
    if (s(x.concepto) && !esNum(x.valor)) add("valores", "desc_" + i, "Escribe el valor del descuento “" + s(x.concepto) + "”.");
  });
  if (s(cond.fechaLimitePago) && !fechaValida(cond.fechaLimitePago)) add("condiciones", "k_limite", "La fecha límite de pago no es válida.");
  const r = calcular(q);
  if (r.opciones.some(o => o.total < 0)) add("valores", "desc_0", "Los descuentos superan el valor de la cotización.");
  if (r.anticipo != null && r.opciones.some(o => o.completo && r.anticipo > o.total)) add("valores", "p_anticipo", "El anticipo no puede ser mayor que el valor total" + (varias ? " de ninguna opción." : "."));

  if (modo === "pdf") {
    if (!s(v.destinos)) add("viaje", "v_destinos", "Escribe el destino del viaje.");
    if (adultos + ninos + infantes === 0) add("viaje", "v_adultos", "Indica al menos un pasajero.");
    if (infantes > 0 && adultos === 0) add("viaje", "v_adultos", "Los infantes deben viajar con al menos un adulto.");
    if (ninos > 0 && !edades.length) add("viaje", "v_edades", "Escribe la edad de cada niño.");
    const nombres = { adultos: "por adulto", ninos: "por niño", infantes: "por infante" };
    const campos = { adultos: "precioAdulto", ninos: "precioNino", infantes: "precioInfante" };
    r.opciones.forEach((o, i) => {
      o.faltantes.forEach(k => add("valores", "op_" + i + "_" + campos[k], "Falta el precio " + nombres[k] + (varias ? " en " + nomOp(i) : "") + ". Escribe 0 si no tiene costo."));
      if (o.completo && o.total <= 0) add("valores", "op_" + i + "_precioAdulto", "El valor total" + (varias ? " de " + nomOp(i) : "") + " debe ser mayor que cero.");
    });
  }
  return { errores, avisos, ok: errores.length === 0 };
}

function textoPasajeros(v) {
  const a = enteroONulo(v.adultos) || 0, n = enteroONulo(v.ninos) || 0, i = enteroONulo(v.infantes) || 0;
  const partes = [];
  if (a) partes.push(plural(a, "adulto", "adultos"));
  if (n) {
    const ed = parseEdades(v.edadesNinos).filter(x => !Number.isNaN(x));
    let t = plural(n, "niño", "niños");
    if (ed.length) t += " (" + (ed.length === 1 ? ed[0] + (ed[0] === 1 ? " año" : " años") : ed.slice(0, -1).join(", ") + " y " + ed[ed.length - 1] + " años") + ")";
    partes.push(t);
  }
  if (i) partes.push(plural(i, "infante", "infantes"));
  return partes.join(" · ");
}

function slug(t) {
  return s(t).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
function nombreArchivo(q) {
  const nom = slug((q.cliente || {}).nombre);
  return "Cotizacion-" + codigo(q.numero) + (nom ? "-" + nom : "") + ".pdf";
}

function mensajeWhatsApp(q) {
  const c = q.cliente || {}, v = q.viaje || {}, r = calcular(q);
  const nombre = s(c.nombre).split(/\s+/)[0] || "";
  const lineas = [];
  lineas.push("Hola" + (nombre ? " " + nombre : "") + ", te saluda " + (s(q.asesorNombre) ? s(q.asesorNombre) + " de " : "") + "Diamond Travel.");
  let l2 = "Te comparto la cotización " + codigo(q.numero);
  if (s(v.destinos)) l2 += " de tu viaje a " + s(v.destinos);
  if (fechaValida(v.fechaIda)) l2 += " (" + fmtFecha(v.fechaIda) + (fechaValida(v.fechaRegreso) ? " al " + fmtFecha(v.fechaRegreso) : "") + ")";
  lineas.push(l2 + ".");
  const mon = (q.valores || {}).moneda;
  if (r.completo && r.multiple && r.elegida == null) {
    lineas.push("Te preparé " + r.opciones.length + " opciones:");
    r.opciones.forEach((o, i) => lineas.push("• Opción " + (i + 1) + (o.nombre ? " – " + o.nombre : "") + ": " + fmtMoneda(o.total, mon)));
  } else if (r.completo) lineas.push("Valor total" + (r.multiple && o_nombre(r) ? " (" + o_nombre(r) + ")" : "") + ": " + fmtMoneda(r.total, mon) + ".");
  if (fechaValida(q.fechaVencimiento)) lineas.push("Esta cotización está vigente hasta el " + fmtFecha(q.fechaVencimiento) + ".");
  lineas.push("Te adjunto el PDF con todos los detalles. Quedamos atentos a tus preguntas.");
  return lineas.join("\n");
}
function o_nombre(r) { return r.elegida != null ? r.opciones[r.elegida].nombre : ""; }
function enlaceWhatsApp(tel, texto) {
  let d = s(tel).replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10 && d[0] === "3") d = "57" + d;
  return "https://wa.me/" + d + "?text=" + encodeURIComponent(texto);
}

/* ---------- PDF ---------- */
const MM = 72 / 25.4;
const C = {
  navy: [14, 31, 61], navy2: [24, 44, 85], gold: [184, 145, 58], goldInk: [134, 102, 31], goldSoft: [247, 241, 226],
  ink: [19, 33, 59], muted: [91, 104, 128], line: [220, 225, 235], zebra: [245, 246, 249], white: [255, 255, 255], onNavyMuted: [169, 180, 204]
};

async function generarPDF(q, opts) {
  const PDFLib = opts.PDFLib;
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const col = a => rgb(a[0] / 255, a[1] / 255, a[2] / 255);
  const doc = await PDFDocument.create();
  doc.setTitle("Cotización " + codigo(q.numero) + " — Diamond Travel");
  doc.setAuthor("Diamond Travel");
  doc.setSubject("Cotización de viaje" + (s((q.viaje || {}).destinos) ? " a " + s(q.viaje.destinos) : ""));
  doc.setCreator("Diamond Travel CRM");
  doc.setProducer("Diamond Travel CRM");
  const F = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    ital: await doc.embedFont(StandardFonts.HelveticaOblique),
    disp: await doc.embedFont(StandardFonts.TimesRomanBold)
  };
  const charset = new Set(F.reg.getCharacterSet());
  const MAP = { "→": "-", "←": "-", "•": "•", " ": " ", " ": " ", " ": " ", "\t": "    " };
  function limpio(t) {
    let out = "";
    for (const ch of String(t == null ? "" : t).normalize("NFC")) {
      if (ch === "\n") { out += ch; continue; }
      const m = MAP[ch] != null ? MAP[ch] : ch;
      for (const c2 of m) out += charset.has(c2.codePointAt(0)) ? c2 : "";
    }
    return out;
  }
  const logo = opts.logoPng ? await doc.embedPng(opts.logoPng) : null;

  const W = 595.28, H = 841.89, ML = 16 * MM, MR = 16 * MM, CW = W - ML - MR;
  const FOOT = 52, TOP_CONT = 64;
  let page, y;

  const T = (txt, x, yy, o) => {
    const t = limpio(txt); if (!t) return;
    page.drawText(t, { x, y: H - yy, size: o.size, font: o.font || F.reg, color: col(o.color || C.ink) });
  };
  const width = (txt, font, size) => font.widthOfTextAtSize(limpio(txt), size);
  const TR = (txt, xRight, yy, o) => T(txt, xRight - width(txt, o.font || F.reg, o.size), yy, o);
  const spaced = (txt, x, yy, o) => { // letter-spaced label
    let cx = x; const sp = o.spacing || 1.2;
    for (const ch of limpio(txt)) { T(ch, cx, yy, o); cx += width(ch, o.font || F.reg, o.size) + sp; }
    return cx - x - sp;
  };
  const spacedW = (txt, font, size, sp) => { let w = 0; for (const ch of limpio(txt)) w += width(ch, font, size) + sp; return w - sp; };
  const rect = (x, yy, w, h, fill, stroke, sw) => page.drawRectangle({ x, y: H - yy - h, width: w, height: h, color: fill ? col(fill) : undefined, borderColor: stroke ? col(stroke) : undefined, borderWidth: stroke ? (sw || 0.6) : 0 });
  const line = (x1, y1, x2, y2, c, th) => page.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: th || 0.6, color: col(c) });

  function wrap(txt, font, size, maxW) {
    const out = [];
    limpio(txt).split("\n").forEach(par => {
      const words = par.split(/ +/);
      let cur = "";
      words.forEach(w0 => {
        let w = w0;
        while (width(w, font, size) > maxW) { // palabra más larga que la línea
          let cut = w.length;
          while (cut > 1 && width(w.slice(0, cut), font, size) > maxW) cut--;
          if (cur) { out.push(cur); cur = ""; }
          out.push(w.slice(0, cut)); w = w.slice(cut);
        }
        const cand = cur ? cur + " " + w : w;
        if (width(cand, font, size) <= maxW) cur = cand; else { if (cur) out.push(cur); cur = w; }
      });
      out.push(cur);
    });
    while (out.length && out[out.length - 1] === "") out.pop();
    return out;
  }

  function nuevaPagina(primera) {
    page = doc.addPage([W, H]);
    if (primera) {
      const BH = 128;
      rect(0, 0, W, BH, C.navy);
      rect(0, BH, W, 2.2, C.gold);
      if (logo) {
        const lh = 100, lw = lh * logo.width / logo.height;
        page.drawImage(logo, { x: ML - 4, y: H - 14 - lh, width: lw, height: lh });
      } else {
        T("DIAMOND TRAVEL", ML, 60, { size: 20, font: F.disp, color: C.white });
      }
      const xr = W - MR;
      const lab = "COTIZACIÓN DE VIAJE";
      spaced(lab, xr - spacedW(lab, F.bold, 8.5, 1.6), 40, { size: 8.5, font: F.bold, color: C.gold, spacing: 1.6 });
      TR(codigo(q.numero), xr, 70, { size: 26, font: F.disp, color: C.white });
      TR("Elaborada el " + (fmtFecha(q.fechaElaboracion) || "—"), xr, 90, { size: 9.5, color: C.onNavyMuted });
      if (fechaValida(q.fechaVencimiento)) TR("Válida hasta el " + fmtFecha(q.fechaVencimiento), xr, 104, { size: 9.5, font: F.bold, color: C.white });
      y = BH + 26;
    } else {
      rect(0, 0, W, 40, C.navy);
      rect(0, 40, W, 1.6, C.gold);
      T("DIAMOND TRAVEL", ML, 25, { size: 12, font: F.disp, color: C.white });
      TR("Cotización " + codigo(q.numero), W - MR, 25, { size: 9.5, font: F.bold, color: C.gold });
      y = TOP_CONT;
    }
  }
  function cabe(h) { return y + h <= H - FOOT - 10; }
  function asegurar(h) { if (!cabe(h)) nuevaPagina(false); }

  function tituloSeccion(t, minSiguiente) {
    asegurar(30 + (minSiguiente || 30));
    y += 8;
    T(t, ML, y + 11, { size: 13, font: F.bold, color: C.navy });
    rect(ML, y + 17, 26, 1.6, C.gold);
    y += 28;
  }
  // filas etiqueta / valor
  function filasKV(filas, labelW) {
    const LW = labelW || 118, VW = CW - LW - 8;
    filas.filter(f => s(f[1])).forEach(([k, v]) => {
      const ls = wrap(v, F.reg, 10, VW);
      const h = ls.length * 13.5 + 7;
      asegurar(Math.min(h, 80));
      T(k, ML, y + 10, { size: 8.5, font: F.bold, color: C.muted });
      ls.forEach((ln, i) => {
        if (i > 0 && !cabe(13.5)) { nuevaPagina(false); }
        T(ln, ML + LW + 8, y + 10, { size: 10, color: C.ink }); y += 13.5;
      });
      y += 3; line(ML, y, ML + CW, y, C.line, 0.5); y += 4;
    });
  }
  function parrafo(txt, o) {
    const size = (o && o.size) || 10, lh = size * 1.42;
    wrap(txt, (o && o.font) || F.reg, size, (o && o.width) || CW).forEach(ln => {
      asegurar(lh);
      T(ln, (o && o.x) || ML, y + size, { size, font: (o && o.font) || F.reg, color: (o && o.color) || C.ink });
      y += lh;
    });
  }
  // tabla con encabezado repetido en saltos de página
  function tabla(cols, filas, o) {
    const hp = 6, size = (o && o.size) || 9.5, lh = size * 1.35;
    const xs = []; let acc = ML; cols.forEach(c => { xs.push(acc); acc += c.w * CW; });
    const head = () => {
      rect(ML, y, CW, 20, C.navy);
      cols.forEach((c, i) => {
        const cw = c.w * CW;
        if (c.align === "right") TR(c.l, xs[i] + cw - hp, y + 13.5, { size: 8, font: F.bold, color: C.white });
        else T(c.l, xs[i] + hp, y + 13.5, { size: 8, font: F.bold, color: C.white });
      });
      y += 20;
    };
    asegurar(20 + 24); head();
    filas.forEach((f, ri) => {
      const cells = cols.map((c, i) => wrap(s(f.celdas[i]), f.bold ? F.bold : F.reg, size, c.w * CW - hp * 2));
      const h = Math.max(...cells.map(cl => Math.max(cl.length, 1))) * lh + 10;
      if (!cabe(h)) { nuevaPagina(false); head(); }
      if (f.fondo) rect(ML, y, CW, h, f.fondo); else if (ri % 2 === 1) rect(ML, y, CW, h, C.zebra);
      cells.forEach((cl, i) => {
        const c = cols[i], cw = c.w * CW;
        cl.forEach((ln, li) => {
          const yy = y + 5 + size + li * lh;
          const st = { size, font: f.bold ? F.bold : F.reg, color: f.color || C.ink };
          if (c.align === "right") TR(ln, xs[i] + cw - hp, yy, st); else T(ln, xs[i] + hp, yy, st);
        });
      });
      y += h;
      line(ML, y, ML + CW, y, C.line, 0.5);
    });
    y += 6;
  }
  function vineta(txt, tipo) {
    const ls = wrap(txt, F.reg, 10, CW - 18);
    asegurar(ls.length * 14 + 4);
    const cy = y + 6.5;
    if (tipo === "si") { // check dorado
      page.drawLine({ start: { x: ML + 1, y: H - cy }, end: { x: ML + 4, y: H - cy - 3.2 }, thickness: 1.5, color: col(C.gold) });
      page.drawLine({ start: { x: ML + 4, y: H - cy - 3.2 }, end: { x: ML + 9.5, y: H - cy + 3.5 }, thickness: 1.5, color: col(C.gold) });
    } else {
      line(ML + 2, cy, ML + 8, cy, C.muted, 1.3);
    }
    ls.forEach(ln => { T(ln, ML + 18, y + 10, { size: 10, color: tipo === "si" ? C.ink : C.muted }); y += 14; });
    y += 2;
  }

  /* ----- Contenido ----- */
  const cli = q.cliente || {}, v = q.viaje || {}, val = q.valores || {}, cond = q.condiciones || {};
  const moneda = MONEDAS[val.moneda] ? val.moneda : "COP";
  const r = calcular(q);
  nuevaPagina(true);

  // Cliente y asesor
  const colW = CW * 0.62;
  T("PREPARADA PARA", ML, y + 8, { size: 7.5, font: F.bold, color: C.goldInk });
  T("ASESOR(A)", ML + colW + 10, y + 8, { size: 7.5, font: F.bold, color: C.goldInk });
  const nomL = wrap(s(cli.nombre) || "—", F.bold, 15, colW - 10);
  let yy = y + 26;
  nomL.forEach(l => { T(l, ML, yy, { size: 15, font: F.bold, color: C.navy }); yy += 18; });
  const contacto = [fmtTel(cli.telefono), s(cli.email)].filter(Boolean).join("   ·   ");
  if (contacto) { T(contacto, ML, yy, { size: 9.5, color: C.muted }); yy += 14; }
  let ya = y + 26;
  wrap(s(q.asesorNombre) || "Equipo Diamond Travel", F.bold, 11, CW - colW - 10).forEach(l => { T(l, ML + colW + 10, ya, { size: 11, font: F.bold, color: C.ink }); ya += 14; });
  T("WhatsApp " + AGENCIA.whatsappTxt, ML + colW + 10, ya, { size: 9.5, color: C.muted }); ya += 14;
  y = Math.max(yy, ya) + 10;

  // Resumen del viaje
  const fechas = fechaValida(v.fechaIda) ? fmtFecha(v.fechaIda) + (fechaValida(v.fechaRegreso) ? "  –  " + fmtFecha(v.fechaRegreso) : "") : (fechaValida(v.fechaRegreso) ? "Regreso " + fmtFecha(v.fechaRegreso) : "");
  const noches = enteroONulo(v.noches);
  const celdas = [
    ["DESTINO", s(v.destinos)],
    ["SALIDA DESDE", s(v.ciudadSalida)],
    ["FECHAS", fechas],
    ["NOCHES", noches != null && !Number.isNaN(noches) ? String(noches) : ""]
  ].filter(c => c[1]);
  const pasaj = textoPasajeros(v);
  {
    const pad2 = 14, n = Math.max(celdas.length, 1);
    const cw = (CW - pad2 * 2) / n;
    const cellLines = celdas.map(c => wrap(c[1], F.bold, 11, cw - 12));
    const h1 = celdas.length ? 18 + Math.max(...cellLines.map(l => l.length)) * 14 : 0;
    const h2 = pasaj ? 34 : 0;
    const h = h1 + h2 + 20;
    asegurar(h);
    rect(ML, y, CW, h, C.goldSoft);
    rect(ML, y, 3, h, C.gold);
    let cy = y + 12;
    celdas.forEach((c, i) => {
      const x = ML + pad2 + i * cw;
      T(c[0], x, cy + 7, { size: 7.5, font: F.bold, color: C.goldInk });
      cellLines[i].forEach((ln, li) => T(ln, x, cy + 22 + li * 14, { size: 11, font: F.bold, color: C.navy }));
    });
    cy += h1;
    if (pasaj) {
      if (h1) line(ML + pad2, cy - 2, ML + CW - pad2, cy - 2, [228, 216, 186], 0.6);
      T("PASAJEROS", ML + pad2, cy + 10, { size: 7.5, font: F.bold, color: C.goldInk });
      T(pasaj, ML + pad2, cy + 24, { size: 10.5, font: F.bold, color: C.navy });
    }
    y += h + 8;
  }

  // Vuelos
  const tramos = (v.tramos || []).filter(t => s(t.fecha) || s(t.ruta) || s(t.vuelo) || s(t.salida) || s(t.llegada));
  if (s(v.aerolinea) || s(v.equipaje) || tramos.length) {
    tituloSeccion("Vuelos", 40);
    filasKV([["Aerolínea", s(v.aerolinea)], ["Equipaje incluido", s(v.equipaje)]]);
    if (tramos.length) {
      y += 4;
      tabla([
        { l: "FECHA", w: 0.16 }, { l: "TRAYECTO", w: 0.38 }, { l: "VUELO", w: 0.16 }, { l: "SALIDA", w: 0.15 }, { l: "LLEGADA", w: 0.15 }
      ], tramos.map(t => ({ celdas: [fmtFecha(t.fecha) || s(t.fecha), s(t.ruta), s(t.vuelo), s(t.salida), s(t.llegada)] })));
    }
  }

  // Alojamiento
  if (s(v.hotel) || s(v.categoriaHotel) || s(v.habitacion) || s(v.regimen)) {
    tituloSeccion("Hotel y alojamiento");
    filasKV([["Hotel", s(v.hotel)], ["Categoría", s(v.categoriaHotel)], ["Tipo de habitación", s(v.habitacion)], ["Alimentación", s(v.regimen)]]);
  }
  // En destino
  if (s(v.traslados) || s(v.tours) || s(v.asistencia)) {
    tituloSeccion("Traslados, tours y asistencia");
    filasKV([["Traslados", s(v.traslados)], ["Tours y actividades", s(v.tours)], ["Asistencia médica", s(v.asistencia)]]);
  }

  // Servicios
  const incl = (q.servicios || []).filter(x => s(x.descripcion) && x.incluido !== false);
  const noIncl = (q.servicios || []).filter(x => s(x.descripcion) && x.incluido === false);
  if (incl.length) { tituloSeccion("Servicios incluidos"); incl.forEach(x => vineta(x.descripcion, "si")); }
  if (noIncl.length || s(cond.noIncluidos)) {
    tituloSeccion("Servicios no incluidos");
    noIncl.forEach(x => vineta(x.descripcion, "no"));
    if (s(cond.noIncluidos)) { y += 2; parrafo(cond.noIncluidos, { color: C.muted }); }
  }
  if (s(q.observacionesPaquete)) { tituloSeccion("Observaciones del paquete"); parrafo(q.observacionesPaquete); }

  // Precios: cada opción (tabla + total) se mantiene junta cuando cabe en una página
  const etiquetaMoneda = "Valores en " + MONEDAS[moneda].l.toLowerCase().replace(/\(.*\)/, "").trim() + " (" + moneda + ")";
  const filasDe = o => {
    const f = [];
    o.lineas.forEach(l => f.push({ celdas: [l.concepto, String(l.cant), l.unit != null ? fmtMoneda(l.unit, moneda) : "Por definir", l.subtotal != null ? fmtMoneda(l.subtotal, moneda) : "Por definir"] }));
    r.cargos.forEach(c => f.push({ celdas: [s(c.concepto), "", "", fmtMoneda(c.valor, moneda)] }));
    r.descuentos.forEach(d => f.push({ celdas: [s(d.concepto) || "Descuento", "", "", fmtMoneda(-(d.valor || 0), moneda)], color: C.goldInk }));
    return f;
  };
  const COLS_P = [{ l: "CONCEPTO", w: 0.43 }, { l: "CANTIDAD", w: 0.13, align: "right" }, { l: "VALOR UNITARIO", w: 0.22, align: "right" }, { l: "SUBTOTAL", w: 0.22, align: "right" }];
  const filaExtra = (k, vv, negrita) => {
    T(k, ML + 16, y + 13, { size: 10, color: C.ink, font: negrita ? F.bold : F.reg });
    TR(vv, ML + CW - 16, y + 13, { size: 10.5, font: F.bold, color: C.navy });
    y += 20; line(ML, y, ML + CW, y, C.line, 0.5);
  };
  r.opciones.forEach((o, i) => {
    const varias = r.multiple;
    const extra = [];
    if (val.mostrarPorPersona && o.porPersona != null && r.pax > 1) extra.push(["Valor promedio por pasajero (" + r.pax + " pasajeros)", fmtMoneda(o.porPersona, moneda)]);
    if (varias && o.saldo != null && o.completo) extra.push(["Saldo pendiente si se paga el anticipo", fmtMoneda(o.saldo, moneda)]);
    const bandaH = varias ? 46 : 58;
    const bloque = (i === 0 ? 36 : 0) + (varias ? 34 : 0) + 20 + (o.lineas.length + r.cargos.length + r.descuentos.length) * 24 + 6 + bandaH + 12 + extra.length * 20 + 12;
    if (!cabe(bloque) && bloque < H - FOOT - 10 - TOP_CONT) nuevaPagina(false);
    if (i === 0) tituloSeccion(varias ? "Opciones y precios" : "Desglose de precios", 90);
    if (varias) {
      const elegida = r.elegida === i;
      T("OPCIÓN " + (i + 1) + (elegida ? "  ·  ELEGIDA" : ""), ML, y + 9, { size: 8, font: F.bold, color: C.goldInk });
      wrap(o.nombre || "Opción " + (i + 1), F.bold, 12.5, CW).forEach(ln => { y += 16; T(ln, ML, y + 9, { size: 12.5, font: F.bold, color: C.navy }); });
      y += 6;
      if (o.detalle) { y += 4; parrafo(o.detalle, { size: 9.5, color: C.muted }); }
      y += 4;
    }
    tabla(COLS_P, filasDe(o));
    asegurar(bandaH + 8);
    y += 4;
    rect(ML, y, CW, bandaH, C.navy);
    rect(ML, y + bandaH, CW, 2, C.gold);
    spaced(varias ? "TOTAL OPCIÓN " + (i + 1) : "VALOR TOTAL", ML + 16, y + (varias ? 20 : 24), { size: 9, font: F.bold, color: C.gold, spacing: 1.8 });
    T(etiquetaMoneda, ML + 16, y + (varias ? 34 : 40), { size: 8.5, color: C.onNavyMuted });
    TR(o.completo ? fmtMoneda(o.total, moneda) : "Por definir", ML + CW - 16, y + (varias ? 31 : 38), { size: varias ? 20 : 24, font: F.bold, color: C.white });
    y += bandaH + 8;
    extra.forEach(([k, vv]) => { asegurar(20); filaExtra(k, vv, false); });
    y += varias ? 14 : 0;
  });
  {
    const comunes = [];
    if (r.anticipo != null) comunes.push(["Anticipo requerido", fmtMoneda(r.anticipo, moneda), false]);
    if (!r.multiple && r.saldo != null) comunes.push(["Saldo pendiente", fmtMoneda(r.saldo, moneda), true]);
    if (fechaValida(cond.fechaLimitePago)) comunes.push(["Fecha límite de pago", fmtFecha(cond.fechaLimitePago), false]);
    if (comunes.length) {
      asegurar(comunes.length * 20 + 6);
      comunes.forEach(([k, vv, b]) => filaExtra(k, vv, b));
    }
    y += 10;
  }

  // Condiciones
  const conds = [
    ["Separación y anticipo", cond.politicaAnticipo],
    ["Política de cancelación", cond.politicaCancelacion],
    ["Condiciones de equipaje", cond.equipaje],
    ["Disponibilidad y cambios de tarifa", cond.disponibilidad],
    ["Observaciones adicionales", cond.adicionales]
  ].filter(c => s(c[1]));
  if (conds.length) {
    tituloSeccion("Condiciones comerciales", 40);
    conds.forEach(([k, t]) => {
      asegurar(36);
      T(k, ML, y + 10, { size: 10, font: F.bold, color: C.navy }); y += 16;
      parrafo(t, { size: 9.5, color: C.ink }); y += 8;
    });
  }

  // Contacto (si no cabe en la última página, los datos siguen en el pie de cada página)
  {
    const h = 66;
    if (cabe(h + 12)) {
      y += 10;
      rect(ML, y, CW, h, null, C.gold, 0.9);
      T("¿Listo para viajar?", ML + 16, y + 22, { size: 14, font: F.disp, color: C.navy });
      T("Escríbenos para separar tu viaje o resolver cualquier duda.", ML + 16, y + 37, { size: 8.5, color: C.muted });
      wrap(AGENCIA.direccion, F.reg, 7.5, CW * 0.5).forEach((ln, i) => T(ln, ML + 16, y + 52 + i * 10, { size: 7.5, color: C.muted }));
      const x2 = ML + CW * 0.56;
      [["WhatsApp", AGENCIA.whatsappTxt], ["Correo", AGENCIA.correo], ["Instagram", AGENCIA.instagram]].forEach(([k, vv], i) => {
        T(k, x2, y + 20 + i * 15, { size: 7.5, font: F.bold, color: C.goldInk });
        T(vv, x2 + 50, y + 20 + i * 15, { size: 9, font: F.bold, color: C.ink });
      });
      y += h;
    }
  }

  // Pies de página con numeración
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    page = p;
    line(ML, H - FOOT + 8, W - MR, H - FOOT + 8, C.gold, 0.7);
    T("Diamond Travel  ·  WhatsApp " + AGENCIA.whatsappTxt + "  ·  " + AGENCIA.correo + "  ·  " + AGENCIA.instagram, ML, H - FOOT + 22, { size: 7.5, color: C.muted });
    T(AGENCIA.direccion, ML, H - FOOT + 33, { size: 7.5, color: C.muted });
    TR("Página " + (i + 1) + " de " + pages.length, W - MR, H - FOOT + 22, { size: 7.5, font: F.bold, color: C.navy });
  });
  return await doc.save();
}

const API = { opcionesDe, AGENCIA, ESTADOS, MONEDAS, fmtFecha, fechaValida, diasEntre, fmtMoneda, fmtTel, codigo, parseEdades, enteroONulo, calcular, validar, textoPasajeros, nombreArchivo, mensajeWhatsApp, enlaceWhatsApp, generarPDF };
if (typeof module !== "undefined" && module.exports) module.exports = API; else root.DTCot = API;
})(typeof window !== "undefined" ? window : globalThis);
