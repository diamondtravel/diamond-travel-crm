/* Diamond Travel — formulario público "Cotiza tu viaje".
   Envía la solicitud a la función registrar_solicitud de Supabase (la única acción permitida sin sesión). */
(function(){
  "use strict";
  var CFG = window.DT_CONFIG || {};
  var WHATSAPP_AGENCIA = "573052051183";
  var $ = function(id){ return document.getElementById(id); };
  var f = $("fCotiza"), errBox = $("errBox"), btn = $("enviar");

  function hoy(){ var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,10); }
  function soloDigitos(s){ return String(s || "").replace(/\D/g, ""); }
  function miles(s){ var d = soloDigitos(s).replace(/^0+(?=\d)/, ""); return d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : ""; }
  function primerNombre(s){ return String(s || "").trim().split(/\s+/)[0] || ""; }
  function enlaceWhats(texto){ return "https://wa.me/" + WHATSAPP_AGENCIA + "?text=" + encodeURIComponent(texto); }

  // Fechas: no se pueden elegir fechas pasadas; el regreso no puede ser antes de la ida.
  $("fechaIda").min = hoy(); $("fechaRegreso").min = hoy();
  $("fechaIda").addEventListener("change", function(){ $("fechaRegreso").min = this.value || hoy(); });

  // Enlaces con datos ya puestos, por ejemplo: /cotiza?destino=San%20Andrés&origen=Instagram
  try {
    var q = new URLSearchParams(location.search);
    if (q.get("destino")) $("destino").value = q.get("destino").slice(0, 200);
    var o = (q.get("origen") || "").toLowerCase();
    if (o) Array.prototype.forEach.call($("comoNosConocio").options, function(op){ if (op.value && op.value.toLowerCase() === o) $("comoNosConocio").value = op.value; });
  } catch (_) { /* navegadores antiguos: se ignora */ }

  // Botones − y + de adultos y niños
  Array.prototype.forEach.call(document.querySelectorAll("[data-step]"), function(b){
    b.addEventListener("click", function(){
      var p = b.getAttribute("data-step").split(":"), inp = $(p[0]);
      var min = +inp.min, max = +inp.max, v = parseInt(inp.value, 10);
      v = (isNaN(v) ? min : v) + (+p[1]);
      inp.value = Math.max(min, Math.min(max, v));
      inp.dispatchEvent(new Event("input"));
    });
  });
  function verEdades(){ var n = parseInt($("ninos").value, 10); $("edadesBox").hidden = !(n > 0); }
  $("ninos").addEventListener("input", verEdades); verEdades();
  $("presupuesto").addEventListener("input", function(){ this.value = miles(this.value); });

  function marcar(id, msg){
    var el = $(id); el.setAttribute("aria-invalid", "true");
    var box = el.closest(".field") || el.closest(".consent");
    if (box && !box.querySelector(".field-err")) { var s = document.createElement("span"); s.className = "field-err"; s.textContent = msg; box.appendChild(s); }
  }
  function limpiar(){
    errBox.hidden = true; errBox.textContent = "";
    Array.prototype.forEach.call(f.querySelectorAll("[aria-invalid]"), function(x){ x.removeAttribute("aria-invalid"); });
    Array.prototype.forEach.call(f.querySelectorAll(".field-err"), function(x){ x.remove(); });
  }
  function mostrarError(html){
    errBox.innerHTML = html; errBox.hidden = false;
    errBox.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]; }); }

  function datos(){
    return {
      nombre: $("nombre").value.trim(), telefono: $("telefono").value.trim(), email: $("email").value.trim(),
      ciudad: $("ciudad").value.trim(), destino: $("destino").value.trim(),
      fechaIda: $("fechaIda").value, fechaRegreso: $("fechaRegreso").value, fechasFlexibles: $("fechasFlexibles").checked,
      adultos: String($("adultos").value).trim(), ninos: String($("ninos").value).trim() || "0",
      edadesNinos: $("ninos").value > 0 ? $("edadesNinos").value.trim() : "",
      presupuesto: soloDigitos($("presupuesto").value), comoNosConocio: $("comoNosConocio").value,
      comentarios: $("comentarios").value.trim(), autorizaDatos: $("autorizaDatos").checked,
      textoAutorizacion: $("textoAutorizacion").textContent.trim(), web: $("web").value
    };
  }
  function validar(d){
    var errs = [];
    if (d.nombre.length < 2) errs.push(["nombre", "Escribe tu nombre completo."]);
    var t = soloDigitos(d.telefono);
    if (t.length < 7 || t.length > 15) errs.push(["telefono", "Escribe un número de WhatsApp válido."]);
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) errs.push(["email", "Revisa el correo electrónico."]);
    if (d.destino.length < 2) errs.push(["destino", "Cuéntanos a qué destino quieres viajar."]);
    if (d.fechaIda && d.fechaIda < hoy()) errs.push(["fechaIda", "La fecha de ida debe ser una fecha futura."]);
    if (d.fechaRegreso && d.fechaIda && d.fechaRegreso < d.fechaIda) errs.push(["fechaRegreso", "La fecha de regreso debe ser posterior a la de ida."]);
    if (!/^\d{1,2}$/.test(d.adultos) || +d.adultos < 1) errs.push(["adultos", "Indica cuántos adultos viajan."]);
    if (!/^\d{1,2}$/.test(d.ninos)) errs.push(["ninos", "Revisa el número de niños."]);
    if (d.presupuesto.length > 12) errs.push(["presupuesto", "Revisa el presupuesto."]);
    if (!d.autorizaDatos) errs.push(["autorizaDatos", "Para enviar la solicitud debes autorizar el tratamiento de tus datos."]);
    return errs;
  }

  f.addEventListener("submit", function(ev){
    ev.preventDefault();
    limpiar();
    var d = datos(), errs = validar(d);
    if (errs.length) {
      errs.forEach(function(e){ marcar(e[0], e[1]); });
      mostrarError("Revisa los datos marcados:<br>" + errs.map(function(e){ return "• " + esc(e[1]); }).join("<br>"));
      $(errs[0][0]).focus({ preventScroll: true });
      return;
    }
    btn.disabled = true; btn.textContent = "Enviando…";
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function(){ ctrl.abort(); }, 20000) : null;
    fetch(String(CFG.supabaseUrl || "").replace(/\/$/, "") + "/rest/v1/rpc/registrar_solicitud", {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": CFG.supabaseKey || "" },
      body: JSON.stringify({ p: d }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function(r){
      return r.text().then(function(txt){
        var j = null; try { j = JSON.parse(txt); } catch (_) { j = null; }
        if (r.ok && j && j.ok) return;
        var msg = j && j.code === "P0001" && j.message ? j.message : "";
        var e = new Error(msg || "envio"); e.legible = !!msg; throw e;
      });
    }).then(function(){
      if (timer) clearTimeout(timer);
      var n = primerNombre(d.nombre);
      $("gTitulo").textContent = "¡Gracias" + (n ? ", " + n : "") + "! Recibimos tu solicitud.";
      $("gTexto").textContent = "Un asesor de Diamond Travel te escribirá muy pronto por WhatsApp al " + d.telefono + ".";
      $("gWhats").href = enlaceWhats("Hola Diamond Travel, soy " + d.nombre + ". Acabo de enviar mi solicitud para viajar a " + d.destino + ".");
      f.hidden = true; $("gracias").hidden = false; $("gracias").focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }).catch(function(e){
      if (timer) clearTimeout(timer);
      var w = enlaceWhats("Hola Diamond Travel, soy " + d.nombre + ". Quiero cotizar un viaje a " + d.destino + ".");
      mostrarError(e && e.legible ? esc(e.message)
        : "No pudimos enviar tu solicitud. Revisa tu conexión a internet e inténtalo de nuevo, o <a href=\"" + esc(w) + "\" target=\"_blank\" rel=\"noopener\">escríbenos por WhatsApp</a>.");
    }).then(function(){
      btn.disabled = false; btn.textContent = "Enviar solicitud";
    });
  });

  // Quitar el aviso de error de un campo en cuanto la persona lo corrige
  f.addEventListener("input", function(ev){
    var el = ev.target; if (!el.hasAttribute || !el.hasAttribute("aria-invalid")) return;
    el.removeAttribute("aria-invalid");
    var box = el.closest(".field") || el.closest(".consent"), s = box && box.querySelector(".field-err"); if (s) s.remove();
  });

  $("gOtra").addEventListener("click", function(){
    f.reset(); $("adultos").value = 2; $("ninos").value = 0; verEdades(); limpiar();
    $("gracias").hidden = true; f.hidden = false; $("nombre").focus();
  });
})();
