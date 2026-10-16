/* ---------- Demo data ---------- */
async function cargarDemo(){
  if(S.readOnly||S.dbMissing){toast("No puedes guardar cambios en este modo.");return;}
  const ahora=Date.now(), iso=t=>new Date(t).toISOString();
  const enDias=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());};
  const base=(o)=>Object.assign({email:"",ciudad:"Cúcuta",ejemplo:true,creadoPor:S.meId,asesorId:S.meId,intereses:[],preferencias:""},o);
  const demos=[
    base({nombre:"Laura Méndez (prueba)",telefono:"300 000 0001",origen:"Instagram",destinos:"San Andrés",tipoViaje:"Nacional",fechaViaje:enDias(45),adultos:2,ninos:1,presupuesto:6800000,intereses:["Playa","Familiar"],preferencias:"Hotel todo incluido, vuelo directo desde Cúcuta si es posible.",etapa:"cotizado",creadoEn:iso(ahora-12*864e5),actualizadoEn:iso(ahora-9*864e5),ultimoContacto:iso(ahora-9*864e5),
      historial:[{fecha:iso(ahora-12*864e5),tipo:"Registro",texto:"Cliente registrado en el CRM.",autor:S.meId},{fecha:iso(ahora-9*864e5),tipo:"WhatsApp",texto:"Se envió cotización de 5 noches todo incluido.",autor:S.meId}]}),
    base({nombre:"Andrés Rojas (prueba)",telefono:"300 000 0002",origen:"WhatsApp",destinos:"Cancún y Riviera Maya",tipoViaje:"Internacional",fechaViaje:enDias(90),adultos:2,ninos:0,presupuesto:14500000,intereses:["Luna de miel","Playa"],preferencias:"Viaje de luna de miel. Prefiere hotel solo adultos.",etapa:"negociacion",creadoEn:iso(ahora-5*864e5),actualizadoEn:iso(ahora-2*864e5),ultimoContacto:iso(ahora-2*864e5),
      historial:[{fecha:iso(ahora-5*864e5),tipo:"Registro",texto:"Cliente registrado en el CRM.",autor:S.meId},{fecha:iso(ahora-2*864e5),tipo:"Llamada",texto:"Pide comparar dos hoteles antes de decidir.",autor:S.meId}]}),
    base({nombre:"Familia Pabón (prueba)",telefono:"300 000 0003",origen:"Referido",destinos:"Eje Cafetero",tipoViaje:"Nacional",fechaViaje:enDias(20),adultos:4,ninos:2,presupuesto:9200000,intereses:["Cultura","Familiar"],etapa:"nuevo",creadoEn:iso(ahora-1*864e5),actualizadoEn:iso(ahora-1*864e5),ultimoContacto:null,
      historial:[{fecha:iso(ahora-1*864e5),tipo:"Registro",texto:"Cliente registrado en el CRM.",autor:S.meId}]})
  ];
  for(const d of demos){if(!(await guardar(()=>S.db.collection("clientes").add(d))))return;}
  toast("Se cargaron 3 clientes de prueba");
}
async function borrarDemo(){
  const demos=S.clientes.filter(c=>c.ejemplo);
  const ids=new Set(demos.map(c=>c.id));
  const dq=S.cotizaciones.filter(q=>q.ejemplo||ids.has(q.clienteId));
  if(!demos.length&&!dq.length)return;
  if(!(await confirmar("¿Eliminar datos de prueba?","Se borrarán "+demos.length+" clientes marcados como PRUEBA"+(dq.length?" y "+dq.length+" cotizaciones asociadas a ellos":"")+". Tus clientes reales no se tocan.","Eliminar",true)))return;
  for(const q of dq){if(!(await guardar(()=>S.db.doc("cotizaciones/"+q.id).delete())))return;}
  for(const c of demos){if(!(await guardar(()=>S.db.doc("clientes/"+c.id).delete())))return;}
  toast("Datos de prueba eliminados");
}

/* =====================================================================
   COTIZACIONES
   ===================================================================== */
const D=window.DTCot;
const LOGO_B64="__LOGO_B64__";
const TAB_ID="t"+Math.random().toString(36).slice(2,10);
const estadoLabel=k=>(D.ESTADOS.find(e=>e.k===k)||{l:k}).l;
const monedaDe=q=>((q.valores||{}).moneda)||"COP";
const ICON_PLUS='<path d="M12 5v14M5 12h14"/>';
const ICON_X='<path d="M6 6l12 12M18 6 6 18"/>';
function totalTxt(q){const r=D.calcular(q);return r.completo?D.fmtMoneda(r.total,monedaDe(q)):"Por definir";}
function vencida(q){return (q.estado==="borrador"||q.estado==="enviada")&&D.fechaValida(q.fechaVencimiento)&&q.fechaVencimiento<hoyISO();}
const clone=o=>JSON.parse(JSON.stringify(o==null?null:o));

/* ----- Lista ----- */
function filtrarCot(){
  const t=S.cq.trim().toLowerCase();
  return S.cotizaciones.filter(q=>{
    if(S.cestado!=="todas"&&q.estado!==S.cestado)return false;
    if(!t)return true;
    const c=q.cliente||{},v=q.viaje||{};
    return [D.codigo(q.numero),c.nombre,c.telefono,c.email,v.destinos].some(x=>String(x||"").toLowerCase().includes(t));
  }).sort((a,b)=>(b.numero||0)-(a.numero||0));
}
function cotCardHTML(q){
  const v=q.viaje||{};
  return '<div class="q-card" data-cot="'+esc(q.id)+'">'+
    '<div style="min-width:0;display:flex;flex-direction:column;gap:2px"><span class="q-code">'+esc(D.codigo(q.numero))+'</span><span style="font-weight:600;font-size:15.5px;overflow-wrap:anywhere">'+esc((q.cliente||{}).nombre||"Sin cliente")+(q.ejemplo?' <span class="tag-demo">Prueba</span>':'')+'</span></div>'+
    '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px"><span class="pill est-'+esc(q.estado)+'">'+esc(estadoLabel(q.estado))+'</span><span class="q-total">'+esc(totalTxt(q))+'</span></div>'+
    '<div class="q-meta"><span>'+esc(v.destinos||"Destino por definir")+'</span>'+(D.fechaValida(v.fechaIda)?'<span>Viaje '+D.fmtFecha(v.fechaIda)+'</span>':'')+'<span>Elaborada '+(D.fmtFecha(q.fechaElaboracion)||"—")+'</span>'+
    (vencida(q)?'<span class="flag">Vigencia vencida el '+D.fmtFecha(q.fechaVencimiento)+'</span>':(D.fechaValida(q.fechaVencimiento)?'<span>Válida hasta '+D.fmtFecha(q.fechaVencimiento)+'</span>':''))+'</div></div>';
}
function listaCotHTML(){const l=filtrarCot();return l.length?l.map(cotCardHTML).join(""):'<div class="empty"><p class="muted">Ninguna cotización coincide con la búsqueda.</p></div>';}
function viewCotizaciones(){
  let h='<div class="page-head"><div><span class="eyebrow">Generador de cotizaciones</span><h1>Cotizaciones</h1></div>'+
    (S.readOnly||S.dbMissing?'':'<button class="btn btn-gold" data-act="nueva-cot">'+icon(ICON_PLUS,18)+'Nueva cotización</button>')+'</div>';
  h+=bannerEstado();
  if(!S.cotReady&&!S.dbMissing)return h+'<div class="panel empty"><p class="muted">Cargando cotizaciones…</p></div>';
  if(!S.cotizaciones.length)return h+'<div class="panel empty"><h2 style="font-family:var(--f-display);font-size:22px">Aún no hay cotizaciones</h2>'+
    '<p class="muted">Llena el formulario con los datos del viaje: el CRM calcula los valores, asigna el número consecutivo y genera el PDF con el logo y los datos de contacto de Diamond Travel.</p>'+
    (S.readOnly||S.dbMissing?'':'<button class="btn btn-gold" data-act="nueva-cot">Crear la primera cotización</button>')+'</div>';
  const cuenta=k=>S.cotizaciones.filter(q=>q.estado===k).length;
  h+='<div class="toolbar"><input class="input search" id="qq" type="search" placeholder="Buscar por número, cliente, teléfono o destino" value="'+esc(S.cq)+'" aria-label="Buscar cotizaciones">'+
    '<select class="input" id="qe" style="width:auto;flex:0 1 220px" aria-label="Filtrar por estado"><option value="todas">Todos los estados ('+S.cotizaciones.length+')</option>'+
    D.ESTADOS.map(e=>'<option value="'+e.k+'"'+(S.cestado===e.k?" selected":"")+'>'+e.l+' ('+cuenta(e.k)+')</option>').join("")+'</select></div>';
  h+='<div class="panel" id="cotList">'+listaCotHTML()+'</div>';
  return h;
}
function panelCotCliente(c,puede){
  const qs=S.cotizaciones.filter(q=>q.clienteId===c.id).sort((a,b)=>(b.numero||0)-(a.numero||0));
  return '<div class="panel panel-pad" style="display:flex;flex-direction:column;gap:8px"><div class="section-title"><h2>Cotizaciones</h2>'+(puede?'<button class="btn btn-sm" id="dNuevaCot">'+icon(ICON_PLUS,16)+'Nueva cotización</button>':'')+'</div>'+
    (qs.length?'<div class="list">'+qs.map(q=>'<div class="row clickable" data-cot="'+esc(q.id)+'"><div class="row-main"><span class="row-title">'+esc(D.codigo(q.numero))+' · '+esc((q.viaje||{}).destinos||"Destino por definir")+'</span><span class="row-sub">Elaborada '+(D.fmtFecha(q.fechaElaboracion)||"—")+' · '+esc(totalTxt(q))+'</span></div><span class="pill est-'+esc(q.estado)+'">'+esc(estadoLabel(q.estado))+'</span></div>').join("")+'</div>'
      :'<p class="muted" style="margin:0">Este cliente aún no tiene cotizaciones.</p>')+'</div>';
}

/* ----- Ficha de la cotización ----- */
let cotId=null;
function abrirCotizacion(id){cotId=id;pintarCotizacion();}
function pintarCotizacion(){
  const q=S.cotizaciones.find(x=>x.id===cotId);
  if(!q){if(cotId){closeOverlay("cot");cotId=null;}return;}
  const puede=!S.readOnly&&!S.dbMissing;
  const v=q.viaje||{},c=q.cliente||{},val=q.valores||{},r=D.calcular(q),mon=monedaDe(q);
  const chk=D.validar(q,"pdf");
  const wa=c.telefono?D.enlaceWhatsApp(c.telefono,D.mensajeWhatsApp(q)):null;
  const fechas=D.fechaValida(v.fechaIda)?D.fmtFecha(v.fechaIda)+(D.fechaValida(v.fechaRegreso)?" – "+D.fmtFecha(v.fechaRegreso):""):"Por definir";
  const cliExiste=q.clienteId&&S.clientes.some(x=>x.id===q.clienteId);
  const hist=(q.historialEstados||[]).slice().sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
  const kv=(k,x)=>x?'<dt>'+esc(k)+'</dt><dd>'+esc(x)+'</dd>':'';
  const s=openOverlay(
    '<div class="sheet-head"><span class="eyebrow">Cotización</span><button class="btn btn-ghost btn-sm" id="qClose">Cerrar</button></div>'+
    '<div class="sheet-body">'+
    '<div class="pass"><div class="pass-main"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><span class="pill est-'+esc(q.estado)+'">'+esc(estadoLabel(q.estado))+'</span>'+(vencida(q)?'<span class="pill est-vencida">Vigencia vencida</span>':'')+(q.ejemplo?'<span class="tag-demo">Prueba</span>':'')+'</div>'+
      '<div class="pass-name">'+esc(D.codigo(q.numero))+'</div>'+
      '<div class="pass-grid"><div><div class="k">Cliente</div><div class="v">'+esc(c.nombre||"—")+'</div></div><div><div class="k">Destino</div><div class="v">'+esc(v.destinos||"Por definir")+'</div></div>'+
      '<div><div class="k">Fechas</div><div class="v num">'+esc(fechas)+'</div></div><div><div class="k">Pasajeros</div><div class="v">'+esc(D.textoPasajeros(v)||"—")+'</div></div></div></div>'+
      '<div class="pass-stub"><div><div class="brand-sub">Valor total</div><div class="budget">'+esc(r.completo?D.fmtMoneda(r.total,mon):"Por definir")+'</div></div><div style="font-size:12.5px;color:var(--on-navy-muted)">'+(D.fechaValida(q.fechaVencimiento)?"Válida hasta "+D.fmtFecha(q.fechaVencimiento):"Sin fecha de vigencia")+'</div></div></div>'+
    (chk.ok?'':'<div class="errbox"><b>Para generar el PDF falta completar:</b><ul>'+chk.errores.map(e=>'<li>'+esc(e.msg)+'</li>').join("")+'</ul></div>')+
    '<div class="panel panel-pad" style="display:flex;flex-direction:column;gap:12px"><h2>Documento PDF</h2>'+
      '<div class="actions"><button class="btn btn-gold" id="qGen"'+(chk.ok?'':' disabled')+'>Generar PDF</button><button class="btn" id="qDown"'+(chk.ok?'':' disabled')+'>Descargar PDF</button></div>'+
      '<p class="help" style="margin:0">El PDF se arma con los datos guardados de esta cotización. En el iPad, al descargarlo se abre el menú de compartir: puedes guardarlo en Archivos o enviarlo directo por WhatsApp o correo.</p></div>'+
    '<div class="panel panel-pad" style="display:flex;flex-direction:column;gap:12px"><h2>Enviar por WhatsApp</h2>'+
      (wa?'<div class="actions"><a class="btn" id="qWa" href="'+esc(wa)+'" target="_blank" rel="noopener">Abrir WhatsApp con el mensaje</a><button class="btn" id="qCopy">Copiar mensaje</button>'+(puede&&q.estado==="borrador"?'<button class="btn" id="qMarkSent">Marcar como enviada</button>':'')+'</div>'+
        '<p class="help" style="margin:0;white-space:pre-line">'+esc(D.mensajeWhatsApp(q))+'</p><p class="help" style="margin:0">WhatsApp no permite adjuntar archivos desde un enlace: después de abrir la conversación, adjunta el PDF descargado.</p>'
        :'<p class="muted" style="margin:0">Esta cotización no tiene un número de WhatsApp del cliente.</p>')+'</div>'+
    '<div class="panel panel-pad" style="display:flex;flex-direction:column;gap:12px"><div class="section-title"><h2>Estado</h2></div>'+
      (puede?'<select class="input" id="qEstado" aria-label="Cambiar estado">'+D.ESTADOS.map(e=>'<option value="'+e.k+'"'+(e.k===q.estado?" selected":"")+'>'+e.l+'</option>').join("")+'</select>':'')+
      (hist.length?'<div class="timeline">'+hist.map(x=>'<div class="tl-item"><span class="tl-dot"></span><div class="tl-body"><span class="tl-meta">'+fmtFechaHora(x.fecha)+' · '+esc(nombrePersona(x.autor))+'</span><span class="tl-text">'+esc(estadoLabel(x.estado))+'</span></div></div>').join("")+'</div>':'')+'</div>'+
    '<div class="panel panel-pad" style="display:flex;flex-direction:column;gap:12px"><div class="section-title"><h2>Resumen</h2>'+(cliExiste?'<button class="btn btn-sm" id="qCli">Ver cliente</button>':'')+'</div><dl class="kv">'+
      kv("Teléfono",D.fmtTel(c.telefono))+kv("Correo",c.email)+kv("Asesor(a)",q.asesorNombre)+kv("Elaborada",D.fmtFecha(q.fechaElaboracion))+kv("Salida desde",v.ciudadSalida)+
      kv("Noches",v.noches!=null?String(v.noches):"")+kv("Aerolínea",v.aerolinea)+kv("Hotel",[v.hotel,v.categoriaHotel].filter(Boolean).join(" · "))+kv("Alimentación",v.regimen)+
      kv("Servicios incluidos",(q.servicios||[]).filter(x=>x.incluido!==false&&x.descripcion).length?String((q.servicios||[]).filter(x=>x.incluido!==false&&x.descripcion).length):"")+
      kv("Anticipo",r.anticipo!=null?D.fmtMoneda(r.anticipo,mon):"")+kv("Saldo",r.saldo!=null&&r.completo?D.fmtMoneda(r.saldo,mon):"")+kv("Fecha límite de pago",D.fmtFecha((q.condiciones||{}).fechaLimitePago))+
    '</dl></div>'+
    (puede?'<div class="sheet-foot" style="justify-content:space-between"><div class="chips">'+(S.isAdmin?'<button class="btn btn-danger" id="qDel">Eliminar</button>':'')+'<button class="btn" id="qDup">Duplicar</button></div><button class="btn btn-gold" id="qEdit">Editar cotización</button></div>':'')+
    '</div>',"","cot");
  s.querySelector("#qClose").onclick=()=>{cotId=null;closeOverlay("cot");};
  const g=s.querySelector("#qGen"); if(g)g.onclick=()=>abrirVistaPrevia(clone(q),{guardada:true});
  const d=s.querySelector("#qDown"); if(d)d.onclick=()=>descargarPDF(clone(q),null,d);
  const cp=s.querySelector("#qCopy"); if(cp)cp.onclick=async()=>{try{await navigator.clipboard.writeText(D.mensajeWhatsApp(q));toast("Mensaje copiado");}catch(_){toast("Mantén presionado el mensaje para copiarlo.");}};
  const ms=s.querySelector("#qMarkSent"); if(ms)ms.onclick=()=>cambiarEstadoCot(q,"enviada");
  const es=s.querySelector("#qEstado"); if(es)es.onchange=()=>cambiarEstadoCot(q,es.value);
  const cl=s.querySelector("#qCli"); if(cl)cl.onclick=()=>abrirDetalle(q.clienteId);
  const ed=s.querySelector("#qEdit"); if(ed)ed.onclick=()=>abrirEditor(q.id);
  const du=s.querySelector("#qDup"); if(du)du.onclick=()=>abrirEditor(null,{duplicarDe:q.id});
  const de=s.querySelector("#qDel"); if(de)de.onclick=async()=>{
    if(!(await confirmar("¿Eliminar la cotización "+D.codigo(q.numero)+"?","Se borrará definitivamente. El número no se vuelve a usar.","Eliminar definitivamente",true)))return;
    if(await guardar(()=>S.db.doc("cotizaciones/"+q.id).delete())){cotId=null;closeOverlay("cot");toast("Cotización eliminada");}
  };
}

async function cambiarEstadoCot(q,nuevo){
  if(q.estado===nuevo)return;
  const ahora=new Date().toISOString();
  const cl=q.clienteId?S.clientes.find(x=>x.id===q.clienteId):null;
  let marcarGanado=false;
  if(nuevo==="aceptada"&&cl&&cl.etapa!=="ganado"){
    const ans=await confirmar("Cotización aceptada","¿Quieres pasar también a "+cl.nombre+" a la etapa “Venta cerrada” del embudo?","Sí, venta cerrada",false,"Solo la cotización");
    if(ans===false){pintarCotizacion();return;}
    marcarGanado=ans===true;
  }
  const hist=(q.historialEstados||[]).slice();hist.push({estado:nuevo,fecha:ahora,autor:S.meId});
  if(!(await guardar(()=>S.db.doc("cotizaciones/"+q.id).update({estado:nuevo,historialEstados:hist,actualizadoEn:ahora})))){pintarCotizacion();return;}
  if(cl){
    const ch=(cl.historial||[]).slice(),patch={actualizadoEn:ahora};
    ch.push({fecha:ahora,tipo:"Cotización",texto:"Cotización "+D.codigo(q.numero)+" marcada como “"+estadoLabel(nuevo)+"”.",autor:S.meId});
    if(nuevo==="enviada"){patch.ultimoContacto=ahora;if(cl.etapa==="nuevo"||cl.etapa==="contactado"){ch.push({fecha:ahora,tipo:"Etapa",texto:"Cambió de “"+etapaLabel(cl.etapa)+"” a “"+etapaLabel("cotizado")+"”.",autor:S.meId});patch.etapa="cotizado";}}
    if(marcarGanado){ch.push({fecha:ahora,tipo:"Etapa",texto:"Cambió de “"+etapaLabel(cl.etapa)+"” a “"+etapaLabel("ganado")+"”.",autor:S.meId});patch.etapa="ganado";patch.cerradoEn=ahora;}
    patch.historial=ch;
    await guardar(()=>S.db.doc("clientes/"+cl.id).update(patch));
  }
  toast("Estado actualizado: "+estadoLabel(nuevo));
}

/* ----- PDF: carga de librerías, generación, vista previa y descarga ----- */
let pdfLibP=null,pdfjsP=null,logoBytes=null;
function cargarScript(urls){
  return new Promise((res,rej)=>{let i=0;const next=()=>{if(i>=urls.length)return rej(new Error("no_lib"));const sc=document.createElement("script");sc.src=urls[i++];sc.onload=()=>res();sc.onerror=()=>{sc.remove();next();};document.head.appendChild(sc);};next();});
}
function cargarPdfLib(){
  if(window.PDFLib)return Promise.resolve(window.PDFLib);
  if(!pdfLibP)pdfLibP=cargarScript([
    "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js",
    "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js",
    "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js"
  ]).then(()=>{if(!window.PDFLib)throw new Error("no_lib");return window.PDFLib;}).catch(e=>{pdfLibP=null;throw e;});
  return pdfLibP;
}
function cargarPdfJs(){
  if(!pdfjsP){
    const base="https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/legacy/build/";
    pdfjsP=(async()=>{
      const lib=await import(base+"pdf.min.mjs");
      if(!globalThis.pdfjsWorker)globalThis.pdfjsWorker=await import(base+"pdf.worker.min.mjs");
      lib.GlobalWorkerOptions.workerSrc=base+"pdf.worker.min.mjs";
      return lib;
    })().catch(e=>{pdfjsP=null;throw e;});
  }
  return pdfjsP;
}
function logoPng(){
  if(!logoBytes){const bin=atob(LOGO_B64);logoBytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)logoBytes[i]=bin.charCodeAt(i);}
  return logoBytes;
}
async function construirPDF(q){const PDFLib=await cargarPdfLib();return await D.generarPDF(q,{PDFLib:PDFLib,logoPng:logoPng()});}
async function renderPaginas(bytes,cont){
  const lib=await cargarPdfJs();
  const pdf=await lib.getDocument({data:bytes.slice(0)}).promise;
  const w=Math.max(280,Math.min((cont.clientWidth||640)-28,640));
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const frag=[];
  for(let n=1;n<=pdf.numPages;n++){
    const p=await pdf.getPage(n);
    const vp=p.getViewport({scale:w/p.getViewport({scale:1}).width*dpr});
    const cv=document.createElement("canvas");cv.width=Math.floor(vp.width);cv.height=Math.floor(vp.height);
    cv.setAttribute("role","img");cv.setAttribute("aria-label","Página "+n+" de "+pdf.numPages);
    await p.render({canvasContext:cv.getContext("2d"),canvas:cv,viewport:vp}).promise;
    frag.push(cv);
  }
  cont.innerHTML="";frag.forEach(cv=>cont.appendChild(cv));
  return pdf.numPages;
}
const kb=n=>Math.max(1,Math.round(n/1024))+" KB";
async function abrirVistaPrevia(q,opts){
  const guardada=!!(opts&&opts.guardada);
  const chk=D.validar(q,"pdf");
  const tel=(q.cliente||{}).telefono;
  const s=openOverlay(
    '<div class="sheet-head"><h2>'+(guardada?"PDF de la cotización ":"Vista previa ")+esc(q.numero?D.codigo(q.numero):"(sin guardar)")+'</h2><button class="btn btn-ghost btn-sm" id="pvClose">Cerrar</button></div>'+
    '<div class="sheet-body">'+
    (guardada?'':'<div class="banner info">Vista previa con los datos actuales del formulario. Para descargar el PDF, guarda primero la cotización.</div>')+
    (chk.ok?'':'<div class="errbox"><b>El documento aún no está completo:</b><ul>'+chk.errores.map(e=>'<li>'+esc(e.msg)+'</li>').join("")+'</ul></div>')+
    '<p class="help" id="pvStatus" style="margin:0" role="status">Generando el PDF…</p>'+
    (guardada?'<div class="actions" id="pvActs" hidden><button class="btn btn-gold" id="pvDown">Descargar PDF</button>'+(tel?'<a class="btn" href="'+esc(D.enlaceWhatsApp(tel,D.mensajeWhatsApp(q)))+'" target="_blank" rel="noopener">Abrir WhatsApp con el mensaje</a>':'')+'</div>':'')+
    '<div class="pv-pages" id="pvPages"><p class="muted" style="margin:24px 0">Preparando las páginas…</p></div>'+
    '</div>',"wide","preview");
  s.querySelector("#pvClose").onclick=()=>closeOverlay("preview");
  const st=s.querySelector("#pvStatus");
  let bytes;
  try{bytes=await construirPDF(q);}
  catch(e){console.error(e);st.textContent="No se pudo cargar el generador de PDF. Revisa tu conexión a internet e intenta de nuevo.";st.className="err";s.querySelector("#pvPages").innerHTML="";return;}
  if(!hayCapa("preview"))return;
  const acts=s.querySelector("#pvActs");
  if(acts){acts.hidden=false;const b=s.querySelector("#pvDown");b.onclick=()=>descargarPDF(q,bytes,b);}
  try{
    const n=await renderPaginas(bytes,s.querySelector("#pvPages"));
    st.textContent="PDF generado: "+n+(n===1?" página":" páginas")+" · "+kb(bytes.length)+(guardada?" · "+D.nombreArchivo(q):"");
  }catch(e){
    console.error(e);
    st.textContent="El PDF se generó ("+kb(bytes.length)+"), pero la vista previa no se pudo mostrar en este dispositivo."+(guardada?" Descárgalo para revisarlo.":"");
    s.querySelector("#pvPages").innerHTML="";
  }
}
async function descargarPDF(q,bytes,btn){
  if(!S.downloads){toast("Las descargas no están disponibles en esta vista. Abre el CRM desde su enlace en Claude.");return;}
  const chk=D.validar(q,"pdf"); if(!chk.ok){toast("Completa la cotización antes de descargar el PDF.");return;}
  const txt=btn?btn.textContent:"";
  if(btn){btn.disabled=true;btn.textContent="Preparando…";}
  try{
    if(!bytes)bytes=await construirPDF(q);
    await S.downloads.save({filename:D.nombreArchivo(q),data:new Blob([bytes],{type:"application/pdf"})});
    toast("PDF listo: elige dónde guardarlo o compartirlo");
  }catch(e){
    if(e&&e.code==="declined"){}
    else if(e&&e.code==="rate_limited")toast("Ya hay una descarga en curso.");
    else if(e&&e.message==="no_lib")toast("No se pudo cargar el generador de PDF. Revisa tu conexión.");
    else{console.error(e);toast("No se pudo preparar el PDF.");}
  }finally{if(btn){btn.disabled=false;btn.textContent=txt;}}
}

/* ----- Consecutivo ----- */
async function siguienteNumero(){
  const ref=S.db.doc("config/consecutivo");
  const maxLocal=S.cotizaciones.reduce((m,q)=>Math.max(m,Number.isInteger(q.numero)?q.numero:0),0);
  if(typeof ref.acquire!=="function")return maxLocal+1;
  for(let i=0;i<16;i++){
    const res=await ref.acquire({holder:TAB_ID,ttlMs:2500});
    if(res&&res.acquired){
      const snap=await ref.get();
      const prev=snap.exists&&Number.isInteger((snap.data()||{}).ultimo)?snap.data().ultimo:0;
      const n=Math.max(prev,maxLocal)+1;
      await ref.set({ultimo:n,actualizadoEn:new Date().toISOString()});
      return n;
    }
    await new Promise(r=>setTimeout(r,300+Math.random()*500));
  }
  throw {code:"resource_exhausted"};
}

/* ----- Editor ----- */
const TABS_ED=[{k:"cliente",l:"1. Cliente"},{k:"viaje",l:"2. Viaje"},{k:"servicios",l:"3. Servicios"},{k:"valores",l:"4. Valores"},{k:"condiciones",l:"5. Condiciones"}];
const SUG_SERV=["Tiquetes aéreos","Alojamiento","Alimentación según el plan","Traslados aeropuerto – hotel – aeropuerto","Tours y actividades","Asistencia médica","Impuestos y tasas aeroportuarias"];
const CATEG=["3 estrellas","4 estrellas","5 estrellas","Boutique","Hostal","Apartamento"];
const REGIMEN=["Solo alojamiento","Alojamiento y desayuno","Media pensión","Pensión completa","Todo incluido"];
let E=null,edTab="cliente",edErrores=[],edNuevoCli=false,edBusca="",edNochesManual=false,edBase="",edGuardando=false;

function cotVacia(){
  return {numero:null,estado:"borrador",fechaElaboracion:hoyISO(),fechaVencimiento:"",asesorId:S.meId,asesorNombre:(S.profiles[S.meId]||{}).name||"",
    clienteId:null,cliente:{nombre:"",telefono:"",email:""},
    viaje:{destinos:"",ciudadSalida:"",fechaIda:"",fechaRegreso:"",noches:null,adultos:null,ninos:null,edadesNinos:"",infantes:null,aerolinea:"",equipaje:"",tramos:[],hotel:"",categoriaHotel:"",habitacion:"",regimen:"",traslados:"",tours:"",asistencia:""},
    servicios:[],observacionesPaquete:"",
    valores:{moneda:"COP",precioAdulto:null,precioNino:null,precioInfante:null,cargos:[],descuentos:[],anticipo:null,mostrarPorPersona:false},
    condiciones:{politicaAnticipo:"",fechaLimitePago:"",politicaCancelacion:"",equipaje:"",disponibilidad:"",noIncluidos:"",adicionales:""},
    historialEstados:[]};
}
function completar(base,obj){ // rellena claves que falten sin pisar las existentes
  Object.keys(base).forEach(k=>{
    if(obj[k]===undefined)obj[k]=clone(base[k]);
    else if(base[k]&&typeof base[k]==="object"&&!Array.isArray(base[k])&&obj[k]&&typeof obj[k]==="object")completar(base[k],obj[k]);
  });
  return obj;
}
function abrirEditor(id,opts){
  if(S.readOnly||S.dbMissing){toast("No puedes guardar cambios en este modo.");return;}
  opts=opts||{};
  if(id){const q=S.cotizaciones.find(x=>x.id===id);if(!q)return;E=completar(cotVacia(),clone(q));}
  else if(opts.duplicarDe){
    const src=S.cotizaciones.find(x=>x.id===opts.duplicarDe);if(!src)return;
    E=completar(cotVacia(),clone(src));
    ["id","numero","creadoEn","creadoPor","actualizadoEn","ejemplo"].forEach(k=>delete E[k]);
    E.numero=null;E.estado="borrador";E.fechaElaboracion=hoyISO();E.fechaVencimiento="";E.historialEstados=[];
    E.asesorId=S.meId;E.asesorNombre=(S.profiles[S.meId]||{}).name||src.asesorNombre||"";
    E.duplicadaDe=src.numero||null;
  }else{
    E=cotVacia();
    if(opts.clienteId){
      const c=S.clientes.find(x=>x.id===opts.clienteId);
      if(c){vincularCliente(c);E.viaje.destinos=c.destinos||"";if(c.fechaViaje)E.viaje.fechaIda=c.fechaViaje;if(c.adultos!=null)E.viaje.adultos=c.adultos;if(c.ninos)E.viaje.ninos=c.ninos;}
    }
  }
  edTab="cliente";edErrores=[];edBusca="";edGuardando=false;
  edNuevoCli=!E.clienteId&&!!(E.cliente&&E.cliente.nombre);
  const auto=D.diasEntre(E.viaje.fechaIda,E.viaje.fechaRegreso);
  edNochesManual=E.viaje.noches!=null&&E.viaje.noches!==auto;
  edBase=JSON.stringify(E);
  pintarEditor(true);
}
function vincularCliente(c){E.clienteId=c.id;E.cliente={nombre:c.nombre||"",telefono:c.telefono||"",email:c.email||""};edNuevoCli=false;}

/* acceso por rutas "viaje.tramos.0.ruta" */
function getP(o,p){return p.split(".").reduce((a,k)=>a==null?a:a[k],o);}
function setP(o,p,v){const ks=p.split(".");let a=o;for(let i=0;i<ks.length-1;i++){if(a[ks[i]]==null)a[ks[i]]=/^\d+$/.test(ks[i+1])?[]:{};a=a[ks[i]];}a[ks[ks.length-1]]=v;}
const montoTxt=n=>typeof n==="number"&&isFinite(n)?new Intl.NumberFormat("es-CO").format(n):"";
function fld(label,path,t,o){
  o=o||{};const v=getP(E,path);const id="e_"+path.replace(/\./g,"_");
  const campo=o.campo?' data-campo="'+o.campo+'"':'';
  const bad=o.campo&&edErrores.some(e=>e.campo===o.campo)?" bad":"";
  const common=' id="'+id+'" data-k="'+path+'" data-t="'+t+'"'+campo;
  let input;
  if(t==="textarea")input='<textarea class="input'+bad+'"'+common+' maxlength="'+(o.max||3000)+'"'+(o.ph?' placeholder="'+esc(o.ph)+'"':'')+'>'+esc(v||"")+'</textarea>';
  else if(t==="select")input='<select class="input'+bad+'"'+common+'>'+o.opts.map(x=>'<option value="'+esc(x[0])+'"'+(x[0]===v?" selected":"")+'>'+esc(x[1])+'</option>').join("")+'</select>';
  else if(t==="money")input='<input class="input num'+bad+'"'+common+' inputmode="numeric" autocomplete="off" placeholder="'+esc(o.ph||"Sin valor")+'" value="'+esc(montoTxt(v))+'">';
  else if(t==="int")input='<input class="input num'+bad+'"'+common+' type="number" min="0" max="'+(o.maxN||99)+'" step="1" inputmode="numeric" placeholder="'+esc(o.ph||"0")+'" value="'+esc(v==null||Number.isNaN(v)?"":v)+'">';
  else if(t==="date")input='<input class="input'+bad+'"'+common+' type="date" value="'+esc(v||"")+'">';
  else if(t==="time")input='<input class="input'+bad+'"'+common+' type="time" value="'+esc(v||"")+'">';
  else input='<input class="input'+bad+'"'+common+' type="'+(o.type||"text")+'" maxlength="'+(o.max||200)+'" autocomplete="off"'+(o.list?' list="'+o.list+'"':'')+(o.im?' inputmode="'+o.im+'"':'')+(o.ph?' placeholder="'+esc(o.ph)+'"':'')+' value="'+esc(v||"")+'">';
  const help=t==="date"?'<span class="help" data-fecha-de="'+path+'">'+(v?D.fmtFecha(v):"DD/MM/AAAA")+'</span>':(o.help?'<span class="help">'+esc(o.help)+'</span>':'');
  return '<div class="field'+(o.span?" span2":"")+'"><label for="'+id+'">'+esc(label)+'</label>'+input+help+'</div>';
}
function tabsConError(){const s=new Set();edErrores.forEach(e=>s.add(e.tab));return s;}

function edTabCliente(){
  let h='<div class="fieldset"><div class="grid3">'+
    fld("Fecha de elaboración *","fechaElaboracion","date",{campo:"q_fecha"})+
    fld("Válida hasta","fechaVencimiento","date",{campo:"q_venc"})+
    fld("Asesor(a) que elabora","asesorNombre","text",{max:80,ph:"Tu nombre"})+'</div>'+
    '<p class="help" style="margin:0">'+(E.numero?"Número de cotización: <b>"+esc(D.codigo(E.numero))+"</b>":"El número consecutivo se asigna automáticamente al guardar.")+(E.duplicadaDe?" · Copia de "+esc(D.codigo(E.duplicadaDe)):"")+'</p>'+
    '<span class="fs-title">Cliente</span>';
  if(E.clienteId){
    const existe=S.clientes.some(x=>x.id===E.clienteId);
    h+='<div class="chosen"><div style="min-width:0"><b style="overflow-wrap:anywhere">'+esc(E.cliente.nombre)+'</b><div class="help">'+esc([D.fmtTel(E.cliente.telefono),E.cliente.email].filter(Boolean).join(" · ")||"Sin datos de contacto")+(existe?"":" · el cliente ya no existe en el CRM")+'</div></div>'+
      '<button type="button" class="btn btn-sm" data-ed="cambiar-cli">Cambiar cliente</button></div>';
  }else if(!edNuevoCli){
    h+='<div class="field"><label for="cliBusca">Buscar cliente existente</label><input class="input'+(edErrores.some(e=>e.campo==="cliBusca")?" bad":"")+'" id="cliBusca" data-campo="cliBusca" type="search" autocomplete="off" placeholder="Nombre o teléfono" value="'+esc(edBusca)+'"></div>'+
      '<div class="pick-list" id="cliRes">'+resultadosCliHTML()+'</div>'+
      '<div><button type="button" class="btn" data-ed="nuevo-cli">'+icon(ICON_PLUS,16)+'Registrar cliente nuevo</button></div>';
  }else{
    h+='<div class="grid2">'+fld("Nombre completo *","cliente.nombre","text",{campo:"c_nombre",max:120,span:true})+
      fld("WhatsApp / celular *","cliente.telefono","text",{campo:"c_tel",type:"tel",im:"tel",max:20,ph:"300 123 4567"})+
      fld("Correo electrónico","cliente.email","text",{campo:"c_email",type:"email",im:"email",max:120})+'</div>'+
      '<div id="dupHint">'+dupHintHTML()+'</div>'+
      '<p class="help" style="margin:0">Al guardar, este cliente también queda registrado en Clientes. <button type="button" class="btn btn-ghost btn-sm" data-ed="buscar-cli">Buscar uno existente</button></p>';
  }
  return h+'</div>';
}
function resultadosCliHTML(){
  const t=edBusca.trim().toLowerCase(),td=t.replace(/\D/g,"");
  let l=S.clientes.filter(c=>!t||String(c.nombre||"").toLowerCase().includes(t)||(td.length>=3&&String(c.telefono||"").replace(/\D/g,"").includes(td)));
  l=l.sort((a,b)=>String(b.actualizadoEn||"").localeCompare(String(a.actualizadoEn||""))).slice(0,8);
  if(!l.length)return '<p class="help" style="margin:10px 12px">'+(S.clientes.length?"No hay clientes con ese nombre o teléfono.":"Aún no hay clientes registrados.")+'</p>';
  return l.map(c=>'<button type="button" class="pick" data-ed="pick" data-id="'+esc(c.id)+'"><span style="min-width:0"><b style="overflow-wrap:anywhere">'+esc(c.nombre)+'</b><br><span class="help">'+esc(D.fmtTel(c.telefono)||"Sin teléfono")+(c.destinos?" · "+esc(c.destinos):"")+'</span></span><span class="pill st-'+esc(c.etapa)+'">'+esc(etapaLabel(c.etapa))+'</span></button>').join("");
}
function buscarDuplicado(cli){
  const tel=String(cli.telefono||"").replace(/\D/g,"").slice(-10),mail=String(cli.email||"").trim().toLowerCase();
  for(const c of S.clientes){
    if(tel.length>=7&&String(c.telefono||"").replace(/\D/g,"").slice(-10)===tel)return {c:c,por:"el mismo teléfono"};
    if(mail&&String(c.email||"").trim().toLowerCase()===mail)return {c:c,por:"el mismo correo"};
  }
  return null;
}
function dupHintHTML(){
  const d=buscarDuplicado(E.cliente||{});
  return d?'<div class="banner warn" style="flex-wrap:wrap;align-items:center;justify-content:space-between"><span>Ya existe <b>'+esc(d.c.nombre)+'</b> con '+d.por+'.</span><button type="button" class="btn btn-sm" data-ed="pick" data-id="'+esc(d.c.id)+'">Usar ese cliente</button></div>':'';
}

function edTabViaje(){
  const tramos=E.viaje.tramos||[];
  return '<div class="fieldset">'+
    '<span class="fs-title">Destino y fechas</span><div class="grid2">'+
      fld("Destino o destinos *","viaje.destinos","text",{campo:"v_destinos",max:160,span:true,ph:"Ej.: Cancún y Riviera Maya"})+
      fld("Ciudad de salida","viaje.ciudadSalida","text",{max:80,ph:"Ej.: Cúcuta"})+
      fld("Noches","viaje.noches","int",{campo:"v_noches",maxN:365,help:"Se calcula con las fechas; puedes cambiarlo."})+
      fld("Fecha de ida","viaje.fechaIda","date",{campo:"v_ida"})+
      fld("Fecha de regreso","viaje.fechaRegreso","date",{campo:"v_regreso"})+'</div>'+
    '<span class="fs-title">Pasajeros</span><div class="grid3">'+
      fld("Adultos","viaje.adultos","int",{campo:"v_adultos"})+
      fld("Niños","viaje.ninos","int",{campo:"v_ninos"})+
      fld("Infantes (menores de 2 años)","viaje.infantes","int",{campo:"v_infantes"})+'</div>'+
      fld("Edades de los niños","viaje.edadesNinos","text",{campo:"v_edades",max:60,im:"numeric",ph:"Ej.: 5, 8",help:"Separadas por comas, una por cada niño."})+
    '<span class="fs-title">Vuelos</span><div class="grid2">'+
      fld("Aerolínea","viaje.aerolinea","text",{max:80,ph:"Si ya se conoce"})+
      fld("Equipaje incluido","viaje.equipaje","text",{max:200,ph:"Ej.: maleta de 23 kg + artículo personal"})+'</div>'+
      '<div class="rowlist">'+tramos.map((t,i)=>'<div class="ritem tramo">'+
        '<div class="field"><label for="e_viaje_tramos_'+i+'_fecha">Fecha</label><input class="input'+(edErrores.some(e=>e.campo==="tramo_"+i)?" bad":"")+'" id="e_viaje_tramos_'+i+'_fecha" data-campo="tramo_'+i+'" type="date" data-k="viaje.tramos.'+i+'.fecha" data-t="date" value="'+esc(t.fecha||"")+'"></div>'+
        '<div class="field"><label for="e_viaje_tramos_'+i+'_ruta">Trayecto</label><input class="input" id="e_viaje_tramos_'+i+'_ruta" data-k="viaje.tramos.'+i+'.ruta" data-t="text" maxlength="120" placeholder="Cúcuta – Bogotá" value="'+esc(t.ruta||"")+'"></div>'+
        '<div class="field"><label for="e_viaje_tramos_'+i+'_vuelo">Vuelo</label><input class="input" id="e_viaje_tramos_'+i+'_vuelo" data-k="viaje.tramos.'+i+'.vuelo" data-t="text" maxlength="30" value="'+esc(t.vuelo||"")+'"></div>'+
        '<div class="field"><label for="e_viaje_tramos_'+i+'_salida">Sale</label><input class="input" id="e_viaje_tramos_'+i+'_salida" type="time" data-k="viaje.tramos.'+i+'.salida" data-t="time" value="'+esc(t.salida||"")+'"></div>'+
        '<div class="field"><label for="e_viaje_tramos_'+i+'_llegada">Llega</label><input class="input" id="e_viaje_tramos_'+i+'_llegada" type="time" data-k="viaje.tramos.'+i+'.llegada" data-t="time" value="'+esc(t.llegada||"")+'"></div>'+
        '<button type="button" class="icon-btn" data-ed="del" data-list="viaje.tramos" data-i="'+i+'" aria-label="Quitar trayecto '+(i+1)+'">'+icon(ICON_X,18)+'</button></div>').join("")+'</div>'+
      '<div><button type="button" class="btn btn-sm" data-ed="add-tramo">'+icon(ICON_PLUS,16)+'Agregar trayecto aéreo</button></div>'+
    '<span class="fs-title">Alojamiento</span><div class="grid2">'+
      fld("Nombre del hotel","viaje.hotel","text",{max:120,span:true})+
      fld("Categoría","viaje.categoriaHotel","text",{max:60,list:"dl_categ"})+
      fld("Tipo de habitación","viaje.habitacion","text",{max:100,ph:"Ej.: doble, vista al mar"})+
      fld("Régimen de alimentación","viaje.regimen","text",{max:80,list:"dl_reg",span:true})+'</div>'+
      '<datalist id="dl_categ">'+CATEG.map(x=>'<option value="'+esc(x)+'">').join("")+'</datalist><datalist id="dl_reg">'+REGIMEN.map(x=>'<option value="'+esc(x)+'">').join("")+'</datalist>'+
    '<span class="fs-title">En destino</span>'+
      fld("Traslados","viaje.traslados","text",{max:200})+
      fld("Tours y actividades","viaje.tours","textarea",{max:2000})+
      fld("Asistencia médica","viaje.asistencia","text",{max:200})+
  '</div>';
}
function edTabServicios(){
  const sv=E.servicios||[];
  const presentes=new Set(sv.map(x=>String(x.descripcion||"").trim().toLowerCase()));
  const sug=SUG_SERV.filter(x=>!presentes.has(x.toLowerCase()));
  return '<div class="fieldset"><span class="fs-title">Servicios</span>'+
    '<p class="help" style="margin:0">Marca cada servicio como incluido o no incluido. Solo aparece en el PDF lo que agregues aquí.</p>'+
    '<div class="rowlist">'+(sv.length?sv.map((x,i)=>'<div class="ritem serv">'+
      '<input class="input" aria-label="Descripción del servicio '+(i+1)+'" data-k="servicios.'+i+'.descripcion" data-t="text" maxlength="300" placeholder="Descripción del servicio" value="'+esc(x.descripcion||"")+'">'+
      '<button type="button" class="toggle-inc" data-ed="tog-serv" data-i="'+i+'" aria-pressed="'+(x.incluido!==false)+'">'+(x.incluido!==false?"Incluido":"No incluido")+'</button>'+
      '<button type="button" class="icon-btn" data-ed="del" data-list="servicios" data-i="'+i+'" aria-label="Quitar servicio '+(i+1)+'">'+icon(ICON_X,18)+'</button></div>').join(""):'<p class="muted" style="margin:0">Aún no hay servicios.</p>')+'</div>'+
    '<div><button type="button" class="btn btn-sm" data-ed="add-serv">'+icon(ICON_PLUS,16)+'Agregar servicio</button></div>'+
    (sug.length?'<div class="field"><span class="label">Atajos: toca para agregar como incluido</span><div class="chips">'+sug.map(x=>'<button type="button" class="chip-toggle" data-ed="sug-serv" data-v="'+esc(x)+'">'+esc(x)+'</button>').join("")+'</div></div>':'')+
    '<span class="fs-title">Observaciones del paquete</span>'+
    fld("Observaciones específicas de este paquete","observacionesPaquete","textarea",{max:4000})+
  '</div>';
}
function lineaCat(k){
  const r=D.calcular(E),mon=E.valores.moneda;const l=r.lineas.find(x=>x.k===k);
  if(!l)return "Sin pasajeros en esta categoría";
  return l.cant+" × "+(l.unit!=null?D.fmtMoneda(l.unit,mon):"sin precio")+" = "+(l.subtotal!=null?D.fmtMoneda(l.subtotal,mon):"falta el precio");
}
function calcHTML(){
  const r=D.calcular(E),mon=E.valores.moneda,f=n=>D.fmtMoneda(n,mon);
  let h='<div class="calc">';
  if(!r.pax)h+='<div class="calc-row"><span class="muted">Indica los pasajeros en la pestaña Viaje.</span></div>';
  r.lineas.forEach(l=>{h+='<div class="calc-row"><span>'+esc(l.concepto)+' ('+l.cant+')</span><b>'+(l.subtotal!=null?f(l.subtotal):'<span class="err">Falta el precio</span>')+'</b></div>';});
  if(r.totalCargos)h+='<div class="calc-row"><span>Otros cargos</span><b>'+f(r.totalCargos)+'</b></div>';
  if(r.totalDescuentos)h+='<div class="calc-row"><span>Descuentos</span><b>'+f(-r.totalDescuentos)+'</b></div>';
  h+='<div class="calc-total"><span>Valor total</span><b>'+(r.completo?f(r.total):"Por definir")+'</b></div>';
  if(r.completo&&r.pax>1)h+='<div class="calc-row"><span>Promedio por pasajero ('+r.pax+')</span><b>'+f(r.porPersona)+'</b></div>';
  if(r.anticipo!=null)h+='<div class="calc-row"><span>Anticipo requerido</span><b>'+f(r.anticipo)+'</b></div>';
  if(r.anticipo!=null&&r.completo)h+='<div class="calc-row"><span>Saldo pendiente</span><b>'+f(r.saldo)+'</b></div>';
  return h+'</div>';
}
function listaMontos(path,etq){
  const l=getP(E,path)||[],pre=path==="valores.cargos"?"cargo_":"desc_";
  return '<div class="rowlist">'+l.map((x,i)=>'<div class="ritem monto">'+
    '<div class="field"><label for="e_'+pre+i+'c">Concepto</label><input class="input" id="e_'+pre+i+'c" data-k="'+path+'.'+i+'.concepto" data-t="text" maxlength="120" value="'+esc(x.concepto||"")+'"></div>'+
    '<div class="field"><label for="e_'+pre+i+'v">Valor</label><input class="input num'+(edErrores.some(e=>e.campo===pre+i)?" bad":"")+'" id="e_'+pre+i+'v" data-campo="'+pre+i+'" data-k="'+path+'.'+i+'.valor" data-t="money" inputmode="numeric" autocomplete="off" value="'+esc(montoTxt(x.valor))+'"></div>'+
    '<button type="button" class="icon-btn" data-ed="del" data-list="'+path+'" data-i="'+i+'" aria-label="Quitar '+etq+' '+(i+1)+'">'+icon(ICON_X,18)+'</button></div>').join("")+'</div>';
}
function edTabValores(){
  const v=E.viaje,n=k=>D.enteroONulo(v[k])||0;
  return '<div class="fieldset">'+
    fld("Moneda","valores.moneda","select",{opts:Object.keys(D.MONEDAS).map(k=>[k,D.MONEDAS[k].l])})+
    '<span class="fs-title">Precios por pasajero</span>'+
    [["precioAdulto","Precio por adulto","adultos"],["precioNino","Precio por niño","ninos"],["precioInfante","Precio por infante","infantes"]].map(([k,l,c])=>
      '<div class="price-line">'+fld(l+(n(c)?" ("+n(c)+")":""),"valores."+k,"money",{campo:"p_"+k,ph:n(c)?"Escribe el precio (0 si no tiene costo)":"Sin pasajeros"})+'<span class="sub" data-sub="'+c+'">'+esc(lineaCat(c))+'</span></div>').join("")+
    '<span class="fs-title">Otros cargos</span>'+listaMontos("valores.cargos","cargo")+
    '<div><button type="button" class="btn btn-sm" data-ed="add-cargo">'+icon(ICON_PLUS,16)+'Agregar cargo</button></div>'+
    '<span class="fs-title">Descuentos</span>'+listaMontos("valores.descuentos","descuento")+
    '<div><button type="button" class="btn btn-sm" data-ed="add-desc">'+icon(ICON_PLUS,16)+'Agregar descuento</button></div>'+
    '<span class="fs-title">Pago</span>'+
    fld("Anticipo requerido","valores.anticipo","money",{campo:"p_anticipo",ph:"Sin anticipo definido"})+
    '<label class="check"><input type="checkbox" id="e_porPersona" data-k="valores.mostrarPorPersona" data-t="bool"'+(E.valores.mostrarPorPersona?" checked":"")+'> Mostrar en el PDF el valor promedio por pasajero</label>'+
    '<span class="fs-title">Resumen</span><div id="calcBox">'+calcHTML()+'</div>'+
  '</div>';
}
function edTabCondiciones(){
  return '<div class="fieldset">'+
    '<p class="help" style="margin:0">Solo se incluye en el PDF lo que escribas aquí. Los campos vacíos no aparecen.</p>'+
    '<div class="actions"><button type="button" class="btn btn-sm" data-ed="cond-cargar">Usar condiciones guardadas</button><button type="button" class="btn btn-sm" data-ed="cond-guardar">Guardar como predeterminadas</button></div>'+
    fld("Política de separación y anticipo","condiciones.politicaAnticipo","textarea",{max:3000})+
    fld("Fecha límite de pago","condiciones.fechaLimitePago","date",{campo:"k_limite"})+
    fld("Política de cancelación","condiciones.politicaCancelacion","textarea",{max:3000})+
    fld("Condiciones de equipaje","condiciones.equipaje","textarea",{max:3000})+
    fld("Disponibilidad y cambios de tarifa","condiciones.disponibilidad","textarea",{max:3000})+
    fld("Servicios no incluidos (texto adicional)","condiciones.noIncluidos","textarea",{max:3000})+
    fld("Observaciones adicionales","condiciones.adicionales","textarea",{max:4000})+
  '</div>';
}
function edTotalHTML(){
  const r=D.calcular(E);
  return '<span>'+(r.pax?r.pax+(r.pax===1?" pasajero":" pasajeros"):"Sin pasajeros")+'</span><b>'+(r.completo?esc(D.fmtMoneda(r.total,E.valores.moneda)):(r.pax?"Faltan precios":"—"))+'</b>';
}
function pintarEditor(arriba){
  const prev=capaSheet("editor"),top=prev&&!arriba?prev.scrollTop:0;
  const err=tabsConError();
  const cuerpo={cliente:edTabCliente,viaje:edTabViaje,servicios:edTabServicios,valores:edTabValores,condiciones:edTabCondiciones}[edTab]();
  const s=openOverlay(
    '<div class="sheet-head"><h2>'+(E.id?"Editar "+esc(D.codigo(E.numero)):"Nueva cotización")+'</h2><button type="button" class="btn btn-ghost btn-sm" data-ed="close">Cerrar</button></div>'+
    '<div class="ed-tabs" role="tablist">'+TABS_ED.map(t=>'<button type="button" class="ed-tab" role="tab" data-ed="tab" data-tab="'+t.k+'" aria-selected="'+(t.k===edTab)+'">'+t.l+(err.has(t.k)?'<span class="dot" aria-label="con errores"></span>':'')+'</button>').join("")+'</div>'+
    '<form class="sheet-body" id="edForm" novalidate>'+
      (edErrores.length?'<div class="errbox" role="alert"><b>Revisa estos datos:</b><ul>'+edErrores.map(e=>'<li><button type="button" data-ed="goto" data-tab="'+e.tab+'" data-campo="'+esc(e.campo||"")+'">'+esc(e.msg)+'</button></li>').join("")+'</ul></div>':'')+
      cuerpo+
    '</form>'+
    '<div class="ed-foot"><div class="ed-total" id="edTotal">'+edTotalHTML()+'</div><div class="actions">'+
      '<button type="button" class="btn" data-ed="preview">Vista previa</button>'+
      '<button type="button" class="btn" data-ed="save"'+(edGuardando?" disabled":"")+'>'+(edGuardando?"Guardando…":"Guardar borrador")+'</button>'+
      '<button type="button" class="btn btn-gold" data-ed="save-pdf"'+(edGuardando?" disabled":"")+'>Guardar y generar PDF</button></div></div>',
    "wide","editor",{noBackdrop:true});
  s.scrollTop=top;
  if(!s.dataset.bound){
    s.dataset.bound="1";
    s.addEventListener("input",edInput);
    s.addEventListener("change",edInput);
    s.addEventListener("click",edClick);
    s.addEventListener("submit",e=>e.preventDefault());
  }
}
function edInput(ev){
  const el=ev.target;
  if(el.id==="cliBusca"){if(ev.type!=="input")return;edBusca=el.value;const r=document.getElementById("cliRes");if(r)r.innerHTML=resultadosCliHTML();return;}
  const path=el.dataset&&el.dataset.k;if(!path)return;
  const t=el.dataset.t;let v;
  if(t==="money"){const d=el.value.replace(/[^\d]/g,"");v=d?parseInt(d,10):null;if(ev.type==="input"){const nv=montoTxt(v);if(el.value!==nv)el.value=nv;}}
  else if(t==="int"){v=el.value===""?null:Number(el.value);}
  else if(t==="bool"){v=el.checked;}
  else v=el.value;
  setP(E,path,v);
  el.classList.remove("bad");
  if(t==="date"){const h=el.closest(".field")&&el.closest(".field").querySelector("[data-fecha-de]");if(h)h.textContent=v?D.fmtFecha(v):"DD/MM/AAAA";}
  if(path==="viaje.noches")edNochesManual=v!=null;
  if((path==="viaje.fechaIda"||path==="viaje.fechaRegreso")&&!edNochesManual){
    const n=D.diasEntre(E.viaje.fechaIda,E.viaje.fechaRegreso);
    if(n!=null&&n>=0){E.viaje.noches=n;const ni=document.getElementById("e_viaje_noches");if(ni)ni.value=n;}
  }
  if(path.startsWith("cliente.")){const dh=document.getElementById("dupHint");if(dh)dh.innerHTML=dupHintHTML();}
  if(path==="valores.moneda"&&ev.type==="change"){pintarEditor();return;}
  actualizarCalc();
}
function actualizarCalc(){
  const t=document.getElementById("edTotal");if(t)t.innerHTML=edTotalHTML();
  const cb=document.getElementById("calcBox");if(cb)cb.innerHTML=calcHTML();
  document.querySelectorAll("[data-sub]").forEach(el=>{el.textContent=lineaCat(el.dataset.sub);});
}
async function edClick(ev){
  const b=ev.target.closest("[data-ed]");if(!b)return;
  const a=b.dataset.ed;
  if(a==="tab"){edTab=b.dataset.tab;pintarEditor(true);return;}
  if(a==="close"){
    if(JSON.stringify(E)!==edBase&&!(await confirmar("¿Salir sin guardar?","Los cambios que no guardaste se perderán.","Salir sin guardar",true)))return;
    closeOverlay("editor");E=null;return;
  }
  if(a==="goto"){edTab=b.dataset.tab;pintarEditor(true);const c=b.dataset.campo;if(c){const el=document.querySelector('#overlayRoot [data-campo="'+c+'"]');if(el){el.focus();el.scrollIntoView({block:"center"});}}return;}
  if(a==="pick"){const c=S.clientes.find(x=>x.id===b.dataset.id);if(c){vincularCliente(c);if(!E.viaje.destinos&&c.destinos)E.viaje.destinos=c.destinos;}edErrores=edErrores.filter(e=>["cliBusca","c_tel","c_nombre","c_email"].indexOf(e.campo)<0);pintarEditor();return;}
  if(a==="nuevo-cli"){edNuevoCli=true;E.clienteId=null;if(!E.cliente.nombre&&edBusca&&!/\d{3}/.test(edBusca))E.cliente.nombre=edBusca.trim();pintarEditor();const n=document.getElementById("e_cliente_nombre");if(n)n.focus();return;}
  if(a==="buscar-cli"){edNuevoCli=false;pintarEditor();return;}
  if(a==="cambiar-cli"){E.clienteId=null;E.cliente={nombre:"",telefono:"",email:""};edNuevoCli=false;edBusca="";pintarEditor();return;}
  if(a==="add-tramo"){E.viaje.tramos.push({fecha:"",ruta:"",vuelo:"",salida:"",llegada:""});pintarEditor();return;}
  if(a==="add-serv"){E.servicios.push({descripcion:"",incluido:true});pintarEditor();const ins=document.querySelectorAll('#overlayRoot [data-k^="servicios."]');if(ins.length)ins[ins.length-1].focus();return;}
  if(a==="sug-serv"){E.servicios.push({descripcion:b.dataset.v,incluido:true});pintarEditor();return;}
  if(a==="tog-serv"){const x=E.servicios[+b.dataset.i];x.incluido=x.incluido===false;b.setAttribute("aria-pressed",String(x.incluido));b.textContent=x.incluido?"Incluido":"No incluido";return;}
  if(a==="add-cargo"){E.valores.cargos.push({concepto:"",valor:null});pintarEditor();return;}
  if(a==="add-desc"){E.valores.descuentos.push({concepto:"",valor:null});pintarEditor();return;}
  if(a==="del"){const l=getP(E,b.dataset.list);l.splice(+b.dataset.i,1);edErrores=[];pintarEditor();return;}
  if(a==="cond-cargar"){await cargarCondiciones();return;}
  if(a==="cond-guardar"){await guardarCondiciones();return;}
  if(a==="preview"){abrirVistaPrevia(clone(E),{guardada:false});return;}
  if(a==="save"){await guardarCot("borrador");return;}
  if(a==="save-pdf"){await guardarCot("pdf");return;}
}
const CAMPOS_COND=["politicaAnticipo","politicaCancelacion","equipaje","disponibilidad","noIncluidos","adicionales"];
async function cargarCondiciones(){
  let snap;try{snap=await S.db.doc("config/condiciones").get();}catch(e){toast(explicarError(e));return;}
  if(!snap.exists){toast("Aún no hay condiciones guardadas. Escríbelas y toca “Guardar como predeterminadas”.");return;}
  const d=snap.data()||{};
  const llenos=CAMPOS_COND.some(k=>String(E.condiciones[k]||"").trim());
  if(llenos&&!(await confirmar("¿Reemplazar las condiciones?","Los textos que ya escribiste en esta cotización se reemplazarán por las condiciones guardadas.","Reemplazar")))return;
  CAMPOS_COND.forEach(k=>{E.condiciones[k]=typeof d[k]==="string"?d[k]:"";});
  pintarEditor();toast("Condiciones cargadas");
}
async function guardarCondiciones(){
  const d={};CAMPOS_COND.forEach(k=>{d[k]=String(E.condiciones[k]||"");});
  if(!CAMPOS_COND.some(k=>d[k].trim())){toast("Escribe al menos una condición antes de guardarla.");return;}
  if(!(await confirmar("¿Guardar como predeterminadas?","Estos textos quedarán disponibles para todas las cotizaciones nuevas con el botón “Usar condiciones guardadas”. La fecha límite de pago no se guarda.","Guardar")))return;
  d.actualizadoEn=new Date().toISOString();d.actualizadoPor=S.meId;
  if(await guardar(()=>S.db.doc("config/condiciones").set(d)))toast("Condiciones guardadas como predeterminadas");
}
function cuerpoCot(e){
  const b=clone(e);delete b.id;
  const limpiarNum=o=>{Object.keys(o).forEach(k=>{if(typeof o[k]==="number"&&!isFinite(o[k]))o[k]=null;else if(o[k]&&typeof o[k]==="object")limpiarNum(o[k]);});};
  limpiarNum(b);
  b.servicios=(b.servicios||[]).filter(x=>String(x.descripcion||"").trim());
  b.viaje.tramos=(b.viaje.tramos||[]).filter(t=>["fecha","ruta","vuelo","salida","llegada"].some(k=>String(t[k]||"").trim()));
  b.valores.cargos=(b.valores.cargos||[]).filter(x=>String(x.concepto||"").trim()||typeof x.valor==="number");
  b.valores.descuentos=(b.valores.descuentos||[]).filter(x=>String(x.concepto||"").trim()||typeof x.valor==="number");
  return b;
}
async function guardarCot(modo){
  if(edGuardando)return;
  const chk=D.validar(E,modo==="pdf"?"pdf":"borrador");
  const errs=chk.errores.slice();
  if(!E.clienteId){
    if(!edNuevoCli)errs.unshift({tab:"cliente",campo:"cliBusca",msg:"Selecciona un cliente existente o registra uno nuevo."});
    else if(String(E.cliente.telefono||"").replace(/\D/g,"").length<7)errs.unshift({tab:"cliente",campo:"c_tel",msg:"Escribe el WhatsApp o celular del cliente nuevo (mínimo 7 dígitos)."});
  }
  if(errs.length){edErrores=errs;edTab=errs[0].tab;pintarEditor(true);toast("Revisa los datos marcados");return;}
  edErrores=[];
  if(!E.clienteId){
    const dup=buscarDuplicado(E.cliente);
    if(dup){
      const ans=await confirmar("Este cliente ya existe",dup.c.nombre+" ya está registrado con "+dup.por+".\n¿Quieres vincular la cotización a ese cliente para no duplicarlo?","Usar cliente existente",false,"Es otra persona");
      if(ans===false)return;
      if(ans===true)vincularCliente(dup.c);
    }
  }
  edGuardando=true;pintarEditor();
  const fin=ok=>{edGuardando=false;if(hayCapa("editor"))pintarEditor();return ok;};
  const ahora=new Date().toISOString();
  if(!E.clienteId){
    const ref=S.db.collection("clientes").doc();
    const cli={nombre:E.cliente.nombre.trim(),telefono:E.cliente.telefono.trim(),email:(E.cliente.email||"").trim(),ciudad:"",origen:"Otro",
      destinos:E.viaje.destinos||"",tipoViaje:"",fechaViaje:E.viaje.fechaIda||null,adultos:D.enteroONulo(E.viaje.adultos),ninos:D.enteroONulo(E.viaje.ninos),presupuesto:null,
      intereses:[],preferencias:"",etapa:"nuevo",creadoEn:ahora,actualizadoEn:ahora,creadoPor:S.meId,asesorId:S.meId,ultimoContacto:null,
      historial:[{fecha:ahora,tipo:"Registro",texto:"Cliente registrado desde una cotización.",autor:S.meId}]};
    if(!(await guardar(()=>ref.set(cli))))return fin(false);
    E.clienteId=ref.id;edNuevoCli=false;
  }
  const nuevo=!E.id;
  if(!Number.isInteger(E.numero)){
    try{E.numero=await siguienteNumero();}
    catch(e){toast(e&&e.code==="resource_exhausted"?"Otra persona está guardando una cotización. Intenta de nuevo en unos segundos.":explicarError(e));return fin(false);}
  }
  const id=E.id||S.db.collection("cotizaciones").doc().id;
  const body=cuerpoCot(E);
  body.actualizadoEn=ahora;
  if(nuevo){body.creadoEn=ahora;body.creadoPor=S.meId;body.estado="borrador";body.historialEstados=[{estado:"borrador",fecha:ahora,autor:S.meId}];}
  if(!(await guardar(()=>S.db.doc("cotizaciones/"+id).set(body))))return fin(false);
  E.id=id;E.historialEstados=body.historialEstados;E.creadoEn=body.creadoEn;E.creadoPor=body.creadoPor;E.estado=body.estado;
  edBase=JSON.stringify(E);
  if(nuevo){
    const cl=S.clientes.find(x=>x.id===E.clienteId);
    if(cl){const h=(cl.historial||[]).slice();h.push({fecha:ahora,tipo:"Cotización",texto:"Cotización "+D.codigo(E.numero)+" creada"+(E.viaje.destinos?" para "+E.viaje.destinos:"")+".",autor:S.meId});
      await guardar(()=>S.db.doc("clientes/"+cl.id).update({historial:h,actualizadoEn:ahora}));}
  }
  fin(true);
  if(modo==="pdf"){
    const saved=Object.assign({id:id},clone(body));
    closeOverlay("editor");E=null;
    if(!S.cotizaciones.some(x=>x.id===id))S.cotizaciones=S.cotizaciones.concat([saved]);
    abrirCotizacion(id);abrirVistaPrevia(saved,{guardada:true});
  }else toast("Borrador guardado: "+D.codigo(E.numero));
}

/* ---------- Backup ---------- */
async function descargar(nombre,data){
  if(!S.downloads){toast("Las descargas no están disponibles en esta vista.");return;}
  try{await S.downloads.save({filename:nombre,data:data});toast("Copia lista. Elige dónde guardarla.");}
  catch(e){if(e&&e.code==="declined")return;if(e&&e.code==="rate_limited"){toast("Ya hay una descarga en curso.");return;}toast("No se pudo preparar la descarga.");}
}
function sello(){const d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
function exportarJSON(){
  const data={sistema:"Diamond Travel CRM",version:2,exportadoEn:new Date().toISOString(),
    clientes:S.clientes.map(c=>Object.assign({},c)),cotizaciones:S.cotizaciones.map(q=>Object.assign({},q))};
  descargar("diamond-travel-respaldo-"+sello()+".json",JSON.stringify(data,null,2));
}
const celdaCSV=v=>{v=v==null?"":String(v);return /[";\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
function exportarCSV(){
  const cols=[["Nombre","nombre"],["WhatsApp","telefono"],["Correo","email"],["Ciudad","ciudad"],["Origen","origen"],["Destinos","destinos"],["Tipo","tipoViaje"],["Fecha viaje",c=>c.fechaViaje?fmtFecha(c.fechaViaje):""],["Adultos","adultos"],["Niños","ninos"],["Presupuesto COP","presupuesto"],["Etapa",c=>etapaLabel(c.etapa)],["Intereses",c=>(c.intereses||[]).join(", ")],["Preferencias","preferencias"],["Registrado",c=>fmtFechaTs(c.creadoEn)],["Último contacto",c=>c.ultimoContacto?fmtFechaTs(c.ultimoContacto):""]];
  const lines=[cols.map(c=>c[0]).join(";")].concat(S.clientes.map(c=>cols.map(([,k])=>celdaCSV(typeof k==="function"?k(c):c[k])).join(";")));
  descargar("diamond-travel-clientes-"+sello()+".csv","﻿"+lines.join("\r\n"));
}
function exportarCSVCot(){
  const cols=[["Número",q=>D.codigo(q.numero)],["Estado",q=>estadoLabel(q.estado)],["Elaborada",q=>D.fmtFecha(q.fechaElaboracion)],["Válida hasta",q=>D.fmtFecha(q.fechaVencimiento)],
    ["Cliente",q=>(q.cliente||{}).nombre],["WhatsApp",q=>(q.cliente||{}).telefono],["Destino",q=>(q.viaje||{}).destinos],["Ida",q=>D.fmtFecha((q.viaje||{}).fechaIda)],["Regreso",q=>D.fmtFecha((q.viaje||{}).fechaRegreso)],
    ["Pasajeros",q=>D.textoPasajeros(q.viaje||{})],["Moneda",monedaDe],["Total",q=>{const r=D.calcular(q);return r.completo?r.total:"";}],["Anticipo",q=>D.calcular(q).anticipo],["Saldo",q=>{const r=D.calcular(q);return r.completo&&r.saldo!=null?r.saldo:"";}],["Asesor(a)",q=>q.asesorNombre]];
  const l=S.cotizaciones.slice().sort((a,b)=>(a.numero||0)-(b.numero||0));
  const lines=[cols.map(c=>c[0]).join(";")].concat(l.map(q=>cols.map(([,f])=>celdaCSV(f(q))).join(";")));
  descargar("diamond-travel-cotizaciones-"+sello()+".csv","﻿"+lines.join("\r\n"));
}
function importar(input){
  const msg=document.getElementById("impMsg");
  const f=input.files&&input.files[0]; if(!f)return;
  const r=new FileReader();
  r.onload=async()=>{
    let data;
    try{data=JSON.parse(r.result);}catch(_){msg.innerHTML='<p class="err">El archivo no es un respaldo válido (JSON dañado).</p>';return;}
    if(!data||data.sistema!=="Diamond Travel CRM"||!Array.isArray(data.clientes)){msg.innerHTML='<p class="err">Este archivo no es un respaldo de Diamond Travel CRM.</p>';return;}
    const okId=x=>x&&typeof x.id==="string"&&/^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(x.id);
    const cs=data.clientes.filter(c=>okId(c)&&typeof c.nombre==="string");
    const qs=(Array.isArray(data.cotizaciones)?data.cotizaciones:[]).filter(q=>okId(q)&&q.cliente&&typeof q.cliente==="object");
    if(!(await confirmar("¿Restaurar el respaldo?","Respaldo del "+fmtFechaHora(data.exportadoEn)+": "+cs.length+" clientes y "+qs.length+" cotizaciones.\nLos registros que ya existen se reemplazarán con la versión del archivo.","Restaurar")))return;
    msg.innerHTML='<p class="help">Restaurando…</p>';
    let n=0;
    for(const c of cs){const b=Object.assign({},c);delete b.id;if(!(await guardar(()=>S.db.doc("clientes/"+c.id).set(b)))){msg.innerHTML='<p class="err">Se detuvo después de '+n+' registros.</p>';return;}n++;}
    let maxN=0;
    for(const q of qs){const b=Object.assign({},q);delete b.id;if(Number.isInteger(b.numero))maxN=Math.max(maxN,b.numero);if(!(await guardar(()=>S.db.doc("cotizaciones/"+q.id).set(b)))){msg.innerHTML='<p class="err">Se detuvo después de '+n+' registros.</p>';return;}n++;}
    if(maxN){try{const ref=S.db.doc("config/consecutivo");const sn=await ref.get();const prev=sn.exists?((sn.data()||{}).ultimo||0):0;if(maxN>prev)await ref.set({ultimo:maxN,actualizadoEn:new Date().toISOString()});}catch(_){}}
    msg.innerHTML='<p class="help">Listo: '+cs.length+' clientes y '+qs.length+' cotizaciones restaurados.</p>';toast("Respaldo restaurado");input.value="";
  };
  r.readAsText(f);
}

/* ---------- Boot ---------- */
function refrescarCapa(key,fn){
  const sc=capaSheet(key);if(!sc)return;const top=sc.scrollTop;fn();const sc2=capaSheet(key);if(sc2)sc2.scrollTop=top;
}
function renderConFoco(){
  const view=document.getElementById("view");
  const f=view.querySelector("#fq")||view.querySelector("#qq");
  const fid=f&&document.activeElement===f?f.id:null;
  render();
  if(fid){const n=document.getElementById(fid);if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length);}}
}
function start(){
  document.querySelectorAll("img[data-logo]").forEach(i=>{i.src="data:image/png;base64,"+LOGO_B64;});
  const h=(location.hash||"").replace("#","");
  if(VIEWS.some(v=>v.k===h))S.view=h;
  render();
  const use=window.claude&&typeof window.claude.use==="function"?window.claude.use.bind(window.claude):null;
  if(!use){S.dbMissing=true;S.readOnly=true;render();return;}
  use("downloads").then(d=>{S.downloads=d;}).catch(()=>{});
  use("user").then(async u=>{
    S.user=u;
    if(u){
      try{S.meId=await u.id();}catch(_){}
      try{S.isAdmin=!!(await u.canEdit());}catch(_){}
      try{const w=await u.can("data.write");S.canWrite=w;if(w===false)S.readOnly=true;}catch(_){}
      await resolverPerfiles();
    }
    render();if(detalleId)refrescarCapa("detalle",pintarDetalle);if(cotId)refrescarCapa("cot",pintarCotizacion);
  }).catch(()=>{});
  use("db").then(db=>{
    if(!db){S.dbMissing=true;S.readOnly=true;render();return;}
    S.db=db;
    const errSnap=err=>{S.loadError=err;S.ready=true;S.cotReady=true;toast(err&&err.code==="revoked"?"Tu acceso a este CRM cambió. Vuelve a abrir el enlace.":"Se perdió la conexión con la base de datos. Recarga la página.");render();};
    db.collection("clientes").onSnapshot(async snap=>{
      S.clientes=snap.docs.map(d=>Object.assign({id:d.id},d.data()));
      S.ready=true;
      await resolverPerfiles();
      renderConFoco();
      if(detalleId)refrescarCapa("detalle",pintarDetalle);
      if(cotId)refrescarCapa("cot",pintarCotizacion);
      const cr=document.getElementById("cliRes");if(cr)cr.innerHTML=resultadosCliHTML();
    },errSnap);
    db.collection("cotizaciones").onSnapshot(snap=>{
      S.cotizaciones=snap.docs.map(d=>Object.assign({id:d.id},d.data()));
      S.cotReady=true;
      renderConFoco();
      if(cotId)refrescarCapa("cot",pintarCotizacion);
      if(detalleId)refrescarCapa("detalle",pintarDetalle);
    },errSnap);
  }).catch(()=>{S.dbMissing=true;S.readOnly=true;render();});
}
