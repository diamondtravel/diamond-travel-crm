/* Diamond Travel CRM — aplicación web (Supabase). Código escrito para Diamond Travel. */
(function(){
"use strict";

/* ---------- Constants ---------- */
const ETAPAS=[
  {k:"nuevo",l:"Nuevo contacto"},
  {k:"contactado",l:"Contactado"},
  {k:"cotizado",l:"Cotización enviada"},
  {k:"negociacion",l:"En negociación"},
  {k:"ganado",l:"Venta cerrada"},
  {k:"perdido",l:"Perdido"}
];
const ACTIVAS=["nuevo","contactado","cotizado","negociacion"];
const ORIGENES=["WhatsApp","Instagram","Referido","Visita a la oficina","Llamada","Facebook","Otro"];
const INTERESES=["Playa","Cultura","Aventura","Crucero","Luna de miel","Familiar","Compras","Religioso","Nieve","Gastronomía"];
const TIPOS_SEG=["Llamada","WhatsApp","Correo","Reunión","Nota"];
const VIEWS=[
  {k:"inicio",l:"Inicio",i:'<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'},
  {k:"clientes",l:"Clientes",i:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.6c2.6.2 4.3 1.9 5 4.9"/>'},
  {k:"embudo",l:"Embudo",i:'<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>'},
  {k:"cotizaciones",l:"Cotizaciones",i:'<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5M8.5 13h7M8.5 16.5h4.5"/>'},
  {k:"respaldo",l:"Respaldo",i:'<path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>'},
  {k:"equipo",l:"Equipo",admin:true,i:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.9-3.6 3.6-5.5 7-5.5s6.1 1.9 7 5.5"/><path d="M19 3.5l.8 1.6 1.7.3-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.3z"/>'}
];
const etapaLabel=k=>(ETAPAS.find(e=>e.k===k)||{l:k}).l;

/* ---------- Formatting ---------- */
const COP=new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0});
const fmtCOP=n=>(typeof n==="number"&&isFinite(n))?COP.format(n):"—";
const pad=n=>String(n).padStart(2,"0");
function fmtFecha(iso){ // "2026-12-20" -> 20/12/2026
  if(!iso||typeof iso!=="string")return "—";
  const m=iso.match(/^(\d{4})-(\d{2})-(\d{2})/); if(!m)return "—";
  return m[3]+"/"+m[2]+"/"+m[1];
}
function fmtFechaHora(ts){ // ISO timestamp -> local DD/MM/AAAA HH:MM
  const d=new Date(ts); if(isNaN(d))return "—";
  return pad(d.getDate())+"/"+pad(d.getMonth()+1)+"/"+d.getFullYear()+" "+pad(d.getHours())+":"+pad(d.getMinutes());
}
function fmtFechaTs(ts){const d=new Date(ts);if(isNaN(d))return "—";return pad(d.getDate())+"/"+pad(d.getMonth()+1)+"/"+d.getFullYear();}
function hoyISO(){const d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
function diasHasta(iso){if(!iso)return null;const m=iso.match(/^(\d{4})-(\d{2})-(\d{2})/);if(!m)return null;
  const t=new Date(+m[1],+m[2]-1,+m[3]);const h=new Date();h.setHours(0,0,0,0);return Math.round((t-h)/86400000);}
function diasDesde(ts){const d=new Date(ts);if(isNaN(d))return null;return Math.floor((Date.now()-d.getTime())/86400000);}
const parseMonto=s=>{const d=String(s||"").replace(/[^\d]/g,"");return d?parseInt(d,10):null;};
const fmtMontoInput=s=>{const n=parseMonto(s);return n==null?"":new Intl.NumberFormat("es-CO").format(n);};
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function waLink(tel){let d=String(tel||"").replace(/[^\d]/g,"");if(!d)return null;if(d.length===10&&d[0]==="3")d="57"+d;return "https://wa.me/"+d;}
function icon(path,size){return '<svg viewBox="0 0 24 24" width="'+(size||22)+'" height="'+(size||22)+'" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';}

/* ---------- State ---------- */
const S={
  sb:null,session:null,perfil:null,equipo:[],config:{},hist:{},plantillas:[],segs:[],faltaActualizacion:false,segTodos:false,
  meId:null,isAdmin:false,
  ready:false,dbMissing:false,readOnly:false,loadError:null,
  clientes:[],cotizaciones:[],cotReady:false,
  view:"inicio",q:"",etapa:"todas",mine:false,cq:"",cestado:"todas"
};

/* ---------- Toast & overlay ---------- */
let toastTimer;
function toast(msg){const r=document.getElementById("toastRoot");r.innerHTML='<div class="toast" role="status">'+esc(msg)+'</div>';clearTimeout(toastTimer);toastTimer=setTimeout(()=>{r.innerHTML="";},3200);}
/* Capas superpuestas: cada ventana tiene una clave; abrir la misma clave la reemplaza en su lugar. */
const layers=[];
function openOverlay(html,cls,key,opts){
  key=key||"main";
  const root=document.getElementById("overlayRoot");
  let L=layers.find(l=>l.key===key);
  if(!L){
    const el=document.createElement("div");el.className="overlay";el.style.zIndex=String(50+layers.length*2);
    root.appendChild(el);L={key:key,el:el,noBackdrop:false};layers.push(L);
    el.addEventListener("click",e=>{if(e.target===el&&!L.noBackdrop)closeOverlay(key);});
  }
  L.noBackdrop=!!(opts&&opts.noBackdrop);
  L.el.innerHTML='<div class="sheet '+(cls||"")+'" role="dialog" aria-modal="true">'+html+'</div>';
  document.body.style.overflow="hidden";
  return L.el.querySelector(".sheet");
}
function closeOverlay(key){
  const i=key?layers.findIndex(l=>l.key===key):layers.length-1;
  if(i<0)return;
  layers[i].el.remove();layers.splice(i,1);
  if(!layers.length)document.body.style.overflow="";
}
const hayCapa=k=>layers.some(l=>l.key===k);
const capaSheet=k=>{const L=layers.find(l=>l.key===k);return L?L.el.querySelector(".sheet"):null;};
function confirmar(titulo,texto,accion,peligro,accion2){
  return new Promise(res=>{
    const s=openOverlay('<div class="sheet-head"><h2>'+esc(titulo)+'</h2></div><div class="sheet-body"><p style="margin:0;white-space:pre-line">'+esc(texto)+'</p><div class="sheet-foot"><button class="btn" id="cNo">Cancelar</button>'+(accion2?'<button class="btn" id="cAlt">'+esc(accion2)+'</button>':'')+'<button class="btn '+(peligro?"btn-danger":"btn-gold")+'" id="cSi">'+esc(accion)+'</button></div></div>',"confirm","confirm");
    s.querySelector("#cNo").onclick=()=>{closeOverlay("confirm");res(false);};
    s.querySelector("#cSi").onclick=()=>{closeOverlay("confirm");res(true);};
    const alt=s.querySelector("#cAlt"); if(alt)alt.onclick=()=>{closeOverlay("confirm");res("alt");};
  });
}
document.addEventListener("keydown",e=>{if(e.key!=="Escape"||!layers.length)return;const top=layers[layers.length-1];if(!top.noBackdrop)closeOverlay(top.key);});

/* ---------- Errors ---------- */
function explicarError(e){
  const c=e&&e.code?String(e.code):"", m=String(e&&e.message||e||"");
  if(c==="42501"||/row-level security|permission denied|violates row-level/i.test(m))return "No tienes permiso para hacer este cambio. Si crees que es un error, habla con el administrador.";
  if(c==="23505")return "Ese registro ya existe.";
  if(c==="23514"||c==="22P02"||c==="22007")return "Algún dato no es válido. Revisa el formulario.";
  if(c==="P0001")return m;
  if(/Failed to fetch|NetworkError|network|Load failed/i.test(m))return "Sin conexión a internet. Revisa tu conexión e intenta de nuevo.";
  if(/JWT|session|token|not authenticated/i.test(m))return "Tu sesión expiró. Vuelve a iniciar sesión.";
  return "No se pudo completar: "+(m||"error desconocido")+".";
}
/* Ejecuta una operación de Supabase; devuelve los datos (o true) si salió bien, o false y avisa si falló. */
async function guardar(fn){
  if(!S.perfil||!S.perfil.activo){toast("Tu cuenta aún no está activa para guardar cambios.");return false;}
  try{
    const r=await fn();
    if(r&&r.error)throw r.error;
    return r&&r.data!=null?r.data:true;
  }catch(e){console.error(e);toast(explicarError(e));return false;}
}

/* ---------- People ---------- */
async function resolverPerfiles(){}
const nombrePersona=id=>{
  if(!id)return "Sin asignar";
  const p=S.equipo.find(x=>x.id===id);
  const n=p?(p.nombre||p.email):"Asesor";
  return id===S.meId?n+" (tú)":n;
};

/* ---------- Navigation ---------- */
function renderNav(){
  const html=VIEWS.filter(v=>!v.admin||S.isAdmin).map(v=>'<button class="tab" data-view="'+v.k+'"'+(S.view===v.k?' aria-current="page"':'')+'>'+icon(v.i)+'<span>'+v.l+'</span></button>').join("");
  document.getElementById("railNav").innerHTML=html;
  document.getElementById("tabNav").innerHTML=html;
  document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>irA(b.dataset.view));
}
function irA(v){S.view=v;try{history.replaceState(null,"","#"+v);}catch(_){location.hash=v;}render();window.scrollTo(0,0);}
function renderMe(){
  let html="";
  if(S.perfil){
    const p=S.perfil;
    html='<button type="button" class="me-btn" data-cuenta title="Mi cuenta"><span class="me-ini">'+esc(((p.nombre||p.email||"?").trim()[0]||"?").toUpperCase())+'</span><span class="me-name">'+esc(p.nombre||p.email)+(S.isAdmin?' · Admin':'')+'</span></button>';
  }
  document.getElementById("meRail").innerHTML=html;
  document.getElementById("meTop").innerHTML=html;
  document.querySelectorAll("[data-cuenta]").forEach(b=>b.onclick=abrirMiCuenta);
}

/* ---------- Views ---------- */
function bannerEstado(){
  if(S.loadError)return '<div class="banner warn">No se pudieron cargar los datos: '+esc(explicarError(S.loadError))+'</div>';
  if(S.faltaActualizacion&&S.isAdmin)return '<div class="banner warn">Falta un paso: ejecuta en Supabase el archivo <b>02-seguimientos-y-plantillas.sql</b> para activar los seguimientos y las plantillas.</div>';
  return "";
}
function vacioInicial(){
  return '<div class="panel empty">'+
    '<svg width="54" height="54" viewBox="0 0 34 34" aria-hidden="true"><path d="M9 6h16l6 8-14 15L3 14z" fill="none" stroke="var(--gold)" stroke-width="1.4" stroke-linejoin="round"/><path d="M3 14h28M13 6l-3 8 7 15 7-15-3-8" fill="none" stroke="var(--gold)" stroke-width="1" opacity=".7" stroke-linejoin="round"/></svg>'+
    '<h2 style="font-family:var(--f-display);font-size:22px">Aún no hay clientes registrados</h2>'+
    '<p class="muted">Cada cliente que agregues queda guardado en la base de datos de Diamond Travel y lo puedes consultar desde el iPad, el celular o el computador.</p>'+
    '<div class="chips" style="justify-content:center"><button class="btn btn-gold" data-act="nuevo">Agregar primer cliente</button>'+(S.isAdmin?'<button class="btn" data-act="demo">Cargar 3 clientes de prueba</button>':'')+'</div>'+
    (S.isAdmin?'<p class="help">Los clientes de prueba quedan marcados como PRUEBA y puedes borrarlos todos desde Respaldo.</p>':'')+'</div>';
}

function mesClave(ts){const d=new Date(ts);if(isNaN(d))return "";return d.getFullYear()+"-"+pad(d.getMonth()+1);}
function viewInicio(){
  const cs=S.clientes, now=new Date();
  const mesKey=now.getFullYear()+"-"+pad(now.getMonth()+1);
  const MESES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const nuevosMes=cs.filter(c=>mesClave(c.creadoEn)===mesKey).length;
  const activos=cs.filter(c=>ACTIVAS.includes(c.etapa));
  const potencial=activos.reduce((a,c)=>a+(c.presupuesto||0),0);
  const ganadosMes=cs.filter(c=>c.etapa==="ganado"&&mesClave(c.cerradoEn)===mesKey).length;
  const proximos=cs
    .filter(c=>c.etapa!=="perdido"&&c.fechaViaje)
    .map(c=>({c:c,d:diasHasta(c.fechaViaje)}))
    .filter(x=>x.d!==null&&x.d>=0&&x.d<=60)
    .sort((a,b)=>a.d-b.d).slice(0,6);
  const conteo=ETAPAS.map(e=>({e:e,n:cs.filter(c=>c.etapa===e.k).length}));
  const maxN=Math.max(1,...conteo.map(x=>x.n));

  let h='<div class="page-head"><div><span class="eyebrow">Resumen de '+MESES[now.getMonth()]+' '+now.getFullYear()+'</span><h1>Buen día, equipo Diamond</h1></div>'+
    (S.readOnly||S.dbMissing?'':'<button class="btn btn-gold" data-act="nuevo">'+icon('<path d="M12 5v14M5 12h14"/>',18)+'Nuevo cliente</button>')+'</div>';
  h+=bannerEstado();
  if(!S.ready&&!S.dbMissing)return h+'<div class="panel empty"><p class="muted">Cargando clientes…</p></div>';
  if(!cs.length)return h+vacioInicial();

  const pend=S.cotizaciones.filter(q=>q.estado==="enviada");
  const valorPend=pend.reduce((a,q)=>{const r=DTCot.calcular(q);return a+((q.valores||{}).moneda==="COP"||!(q.valores||{}).moneda?(r.completo?r.total:0):0);},0);
  h+='<div class="kpis">'+
    '<div class="kpi lead"><span class="k">Presupuesto en proceso</span><span class="v money">'+fmtCOP(potencial)+'</span><span class="k">'+activos.length+' clientes activos de '+cs.length+'</span></div>'+
    '<div class="kpi"><span class="k">Clientes nuevos este mes</span><span class="v">'+nuevosMes+'</span></div>'+
    '<div class="kpi clickable" data-view-go="cotizaciones"><span class="k">Cotizaciones por responder</span><span class="v">'+pend.length+'</span><span class="k num">'+(valorPend?fmtCOP(valorPend):"Enviadas, sin respuesta")+'</span></div>'+
    '<div class="kpi"><span class="k">Ventas cerradas este mes</span><span class="v">'+ganadosMes+'</span></div></div>';

  h+=panelSeguimientos();
  h+='<div class="cols">';
  h+='<div class="panel panel-pad"><div class="section-title"><h2>Embudo comercial</h2><button class="btn btn-ghost btn-sm" data-view-go="embudo">Ver tablero</button></div>'+
    conteo.map(x=>'<div class="funnel-row"><span>'+esc(x.e.l)+'</span><div class="bar-track"><div class="bar-fill" style="width:'+(x.n/maxN*100)+'%"></div></div><span class="num" style="text-align:right;font-weight:600">'+x.n+'</span></div>').join("")+'</div>';

  h+='<div class="panel panel-pad"><div class="section-title"><h2>Viajes en los próximos 60 días</h2></div><div class="list">'+
    (proximos.length?proximos.map(x=>'<div class="row clickable" data-open="'+esc(x.c.id)+'"><div class="row-main"><span class="row-title">'+esc(x.c.destinos||"Destino por definir")+'</span><span class="row-sub">'+esc(x.c.nombre)+' · '+fmtFecha(x.c.fechaViaje)+'</span></div><span class="pill st-'+esc(x.c.etapa)+'">'+esc(etapaLabel(x.c.etapa))+'</span></div>').join("")
    :'<p class="muted" style="margin:6px 0">No hay viajes con fecha tentativa en los próximos 60 días.</p>')+'</div></div>';
  h+='</div>';
  h+='<p class="help">Las reservas y los pagos por cobrar se sumarán aquí cuando construyamos esos módulos.</p>';
  return h;
}

function filtrar(){
  const q=S.q.trim().toLowerCase();
  return S.clientes.filter(c=>{
    if(S.etapa!=="todas"&&c.etapa!==S.etapa)return false;
    if(S.mine&&c.asesorId!==S.meId)return false;
    if(!q)return true;
    return [c.nombre,c.telefono,c.email,c.destinos,c.ciudad].some(v=>String(v||"").toLowerCase().includes(q));
  }).sort((a,b)=>String(b.actualizadoEn||"").localeCompare(String(a.actualizadoEn||"")));
}
function viewClientes(){
  let h='<div class="page-head"><div><span class="eyebrow">Base de clientes</span><h1>Clientes</h1></div>'+
    (S.readOnly||S.dbMissing?'':'<button class="btn btn-gold" data-act="nuevo">'+icon('<path d="M12 5v14M5 12h14"/>',18)+'Nuevo cliente</button>')+'</div>';
  h+=bannerEstado();
  if(!S.ready&&!S.dbMissing)return h+'<div class="panel empty"><p class="muted">Cargando clientes…</p></div>';
  if(!S.clientes.length)return h+vacioInicial();
  h+='<div class="toolbar"><input class="input search" id="fq" type="search" placeholder="Buscar por nombre, teléfono, correo o destino" value="'+esc(S.q)+'" aria-label="Buscar clientes">'+
    '<select class="input" id="fe" style="width:auto;flex:0 1 210px" aria-label="Filtrar por etapa"><option value="todas">Todas las etapas</option>'+ETAPAS.map(e=>'<option value="'+e.k+'"'+(S.etapa===e.k?" selected":"")+'>'+e.l+'</option>').join("")+'</select>'+
    (S.meId?'<div class="seg" role="group" aria-label="Mostrar"><button id="fAll" aria-pressed="'+(!S.mine)+'">Todos</button><button id="fMine" aria-pressed="'+S.mine+'">Míos</button></div>':'')+'</div>';
  h+='<div class="panel" id="clientList">'+listaClientesHTML()+'</div>';
  return h;
}
function listaClientesHTML(){
  const lst=filtrar();
  if(!lst.length)return '<div class="empty"><p class="muted">Ningún cliente coincide con la búsqueda.</p></div>';
  return lst.map(c=>'<div class="client-card" data-open="'+esc(c.id)+'">'+
    '<div class="name">'+esc(c.nombre)+(c.ejemplo?' <span class="tag-demo">Prueba</span>':'')+'</div>'+
    '<span class="pill st-'+esc(c.etapa)+'">'+esc(etapaLabel(c.etapa))+'</span>'+
    '<div class="meta"><span>'+esc(c.telefono||"Sin teléfono")+'</span><span>'+esc(c.destinos||"Destino por definir")+'</span>'+
    (c.presupuesto?'<span>Presupuesto <b class="num">'+fmtCOP(c.presupuesto)+'</b></span>':'')+
    (c.fechaViaje?'<span>Viaje '+fmtFecha(c.fechaViaje)+'</span>':'')+
    '<span>Asesor: '+esc(nombrePersona(c.asesorId))+'</span></div></div>').join("");
}

function viewEmbudo(){
  let h='<div class="page-head"><div><span class="eyebrow">Seguimiento comercial</span><h1>Embudo de ventas</h1></div>'+
    (S.readOnly||S.dbMissing?'':'<button class="btn btn-gold" data-act="nuevo">'+icon('<path d="M12 5v14M5 12h14"/>',18)+'Nuevo cliente</button>')+'</div>';
  h+=bannerEstado();
  if(!S.ready&&!S.dbMissing)return h+'<div class="panel empty"><p class="muted">Cargando clientes…</p></div>';
  if(!S.clientes.length)return h+vacioInicial();
  h+='<p class="help" style="margin:0">Cambia la etapa de un cliente con el selector de su tarjeta. Desliza hacia los lados para ver todas las columnas.</p>';
  h+='<div class="board-scroll"><div class="board">'+ETAPAS.map(e=>{
    const items=S.clientes.filter(c=>c.etapa===e.k).sort((a,b)=>String(b.actualizadoEn||"").localeCompare(String(a.actualizadoEn||"")));
    const suma=items.reduce((a,c)=>a+(c.presupuesto||0),0);
    return '<section class="col" aria-label="'+esc(e.l)+'"><div class="col-head"><span class="pill st-'+e.k+'">'+esc(e.l)+' · '+items.length+'</span><span class="col-sum num">'+(suma?fmtCOP(suma):"")+'</span></div>'+
      (items.length?items.map(c=>'<div class="mini"><span class="t" data-open="'+esc(c.id)+'">'+esc(c.nombre)+(c.ejemplo?' <span class="tag-demo">Prueba</span>':'')+'</span>'+
        '<span class="s">'+esc(c.destinos||"Destino por definir")+(c.presupuesto?' · <span class="num">'+fmtCOP(c.presupuesto)+'</span>':'')+'</span>'+
        (S.readOnly||S.dbMissing?'':'<select class="input" data-move="'+esc(c.id)+'" aria-label="Mover a otra etapa">'+ETAPAS.map(x=>'<option value="'+x.k+'"'+(x.k===c.etapa?" selected":"")+'>'+(x.k===c.etapa?"Etapa: ":"Mover a: ")+x.l+'</option>').join("")+'</select>')+
        '</div>').join(""):'<p class="help" style="margin:4px 2px">Sin clientes en esta etapa.</p>')+'</section>';
  }).join("")+'</div></div>';
  return h;
}

function viewRespaldo(){
  let h='<div class="page-head"><div><span class="eyebrow">Protección de datos</span><h1>Respaldo</h1></div></div>';
  h+=bannerEstado();
  const demos=S.clientes.filter(c=>c.ejemplo).length;
  h+='<div class="panel panel-pad" style="display:flex;flex-direction:column;gap:12px"><h2>Descargar una copia de seguridad</h2>'+
    '<p class="muted" style="margin:0">Guarda una copia en tu iPad (Archivos o iCloud Drive) al menos una vez por semana. La copia completa (JSON) incluye clientes, historial y cotizaciones, y permite restaurarlos. Nunca la subas a GitHub.</p>'+
    '<div class="chips"><button class="btn btn-gold" data-act="exp-json"'+(S.clientes.length||S.cotizaciones.length?'':' disabled')+'>Copia completa (JSON)</button><button class="btn" data-act="exp-csv"'+(S.clientes.length?'':' disabled')+'>Clientes para Excel (CSV)</button><button class="btn" data-act="exp-csv-q"'+(S.cotizaciones.length?'':' disabled')+'>Cotizaciones para Excel (CSV)</button></div>'+
    '<p class="help" style="margin:0">'+S.clientes.length+' clientes y '+S.cotizaciones.length+' cotizaciones en la base de datos. La copia completa incluye ambos.</p></div>';
  if(S.isAdmin){
    h+='<div class="panel panel-pad" style="display:flex;flex-direction:column;gap:12px"><h2>Restaurar desde una copia</h2>'+
      '<p class="muted" style="margin:0">Elige un archivo JSON de respaldo, de esta versión web o de la versión que usabas dentro de Claude. Los clientes, su historial y las cotizaciones se guardan conservando los números de cotización; no se borra nada.</p>'+
      '<input type="file" id="impFile" accept=".json,application/json" class="input" style="padding:8px"><div id="impMsg">'+(S.impEstado||'')+'</div></div>';
  }
  if(demos&&S.isAdmin){
    const dq=S.cotizaciones.filter(q=>q.ejemplo||S.clientes.some(c=>c.ejemplo&&c.id===q.clienteId)).length;
    h+='<div class="panel panel-pad" style="display:flex;flex-direction:column;gap:12px"><h2>Clientes de prueba</h2><p class="muted" style="margin:0">Hay '+demos+' clientes marcados como PRUEBA'+(dq?' y '+dq+' cotizaciones asociadas a ellos':'')+'.</p><div><button class="btn btn-danger" data-act="del-demo">Eliminar datos de prueba</button></div></div>';
  }
  return h;
}

/* ---------- Render ---------- */
function render(){
  renderNav();renderMe();
  const v=document.getElementById("view");
  const fn={inicio:viewInicio,clientes:viewClientes,embudo:viewEmbudo,cotizaciones:viewCotizaciones,respaldo:viewRespaldo,equipo:viewEquipo}[S.view]||viewInicio;
  v.innerHTML=fn();
  bindView();
}
function bindView(){
  const v=document.getElementById("view");
  v.querySelectorAll('[data-act="nuevo"]').forEach(b=>b.onclick=()=>abrirFormulario(null));
  v.querySelectorAll('[data-act="demo"]').forEach(b=>b.onclick=cargarDemo);
  v.querySelectorAll("[data-open]").forEach(el=>el.onclick=()=>abrirDetalle(el.dataset.open));
  v.querySelectorAll("[data-view-go]").forEach(b=>b.onclick=()=>irA(b.dataset.viewGo));
  v.querySelectorAll("[data-move]").forEach(sel=>sel.onchange=()=>cambiarEtapa(sel.dataset.move,sel.value));
  const fq=v.querySelector("#fq");
  if(fq)fq.oninput=()=>{S.q=fq.value;v.querySelector("#clientList").innerHTML=listaClientesHTML();v.querySelectorAll("#clientList [data-open]").forEach(el=>el.onclick=()=>abrirDetalle(el.dataset.open));};
  const fe=v.querySelector("#fe"); if(fe)fe.onchange=()=>{S.etapa=fe.value;render();};
  const fa=v.querySelector("#fAll"); if(fa)fa.onclick=()=>{S.mine=false;render();};
  const fm=v.querySelector("#fMine"); if(fm)fm.onclick=()=>{S.mine=true;render();};
  const ej=v.querySelector('[data-act="exp-json"]'); if(ej)ej.onclick=exportarJSON;
  const ec=v.querySelector('[data-act="exp-csv"]'); if(ec)ec.onclick=exportarCSV;
  const ecq=v.querySelector('[data-act="exp-csv-q"]'); if(ecq)ecq.onclick=exportarCSVCot;
  v.querySelectorAll('[data-act="nueva-cot"]').forEach(b=>b.onclick=()=>abrirEditor(null));
  v.querySelectorAll('[data-act="plantillas"]').forEach(b=>b.onclick=abrirPlantillas);
  v.querySelectorAll("[data-cot]").forEach(el=>el.onclick=()=>abrirCotizacion(el.dataset.cot));
  const qq=v.querySelector("#qq");
  if(qq)qq.oninput=()=>{S.cq=qq.value;const L=v.querySelector("#cotList");L.innerHTML=listaCotHTML();L.querySelectorAll("[data-cot]").forEach(el=>el.onclick=()=>abrirCotizacion(el.dataset.cot));};
  const qe=v.querySelector("#qe"); if(qe)qe.onchange=()=>{S.cestado=qe.value;render();};
  const dd=v.querySelector('[data-act="del-demo"]'); if(dd)dd.onclick=borrarDemo;
  const imp=v.querySelector("#impFile"); if(imp)imp.onchange=()=>importar(imp);
  if(S.view==="equipo")bindEquipo(v);
  if(S.view==="inicio")bindSeguimientos(v);
}

/* ---------- Client form ---------- */
function abrirFormulario(id){
  if(S.readOnly){toast("No puedes guardar cambios en este modo.");return;}
  const c=id?S.clientes.find(x=>x.id===id):null;
  const d=c||{etapa:"nuevo",origen:"WhatsApp",tipoViaje:"Nacional",intereses:[],adultos:2,ninos:0};
  const sel=(arr,val)=>arr.map(o=>'<option'+(o===val?" selected":"")+'>'+esc(o)+'</option>').join("");
  const s=openOverlay(
    '<div class="sheet-head"><h2>'+(c?"Editar cliente":"Nuevo cliente")+'</h2><button class="btn btn-ghost btn-sm" id="fxClose">Cerrar</button></div>'+
    '<form class="sheet-body" id="cf" novalidate>'+
    '<div class="grid2">'+
      '<div class="field span2"><label for="f_nombre">Nombre completo *</label><input class="input" id="f_nombre" required maxlength="120" autocomplete="off" value="'+esc(d.nombre||"")+'"></div>'+
      '<div class="field"><label for="f_tel">WhatsApp / celular *</label><input class="input" id="f_tel" type="tel" inputmode="tel" maxlength="20" placeholder="300 123 4567" value="'+esc(d.telefono||"")+'"></div>'+
      '<div class="field"><label for="f_email">Correo</label><input class="input" id="f_email" type="email" inputmode="email" maxlength="120" value="'+esc(d.email||"")+'"></div>'+
      '<div class="field"><label for="f_ciudad">Ciudad</label><input class="input" id="f_ciudad" maxlength="60" placeholder="Cúcuta" value="'+esc(d.ciudad||"")+'"></div>'+
      '<div class="field"><label for="f_origen">¿Cómo nos conoció?</label><select class="input" id="f_origen">'+sel(ORIGENES,d.origen)+'</select></div>'+
    '</div>'+
    '<div class="grid2">'+
      '<div class="field span2"><label for="f_dest">Destinos de interés</label><input class="input" id="f_dest" maxlength="140" placeholder="San Andrés, Cancún…" value="'+esc(d.destinos||"")+'"></div>'+
      '<div class="field"><label for="f_tipo">Tipo de viaje</label><select class="input" id="f_tipo">'+sel(["Nacional","Internacional"],d.tipoViaje)+'</select></div>'+
      '<div class="field"><label for="f_fecha">Fecha tentativa de viaje</label><input class="input" id="f_fecha" type="date" value="'+esc(d.fechaViaje||"")+'"><span class="help" id="f_fecha_txt">'+(d.fechaViaje?fmtFecha(d.fechaViaje):"DD/MM/AAAA")+'</span></div>'+
      '<div class="field"><label for="f_ad">Adultos</label><input class="input num" id="f_ad" type="number" min="0" max="99" inputmode="numeric" value="'+esc(d.adultos!=null?d.adultos:"")+'"></div>'+
      '<div class="field"><label for="f_ni">Niños</label><input class="input num" id="f_ni" type="number" min="0" max="99" inputmode="numeric" value="'+esc(d.ninos!=null?d.ninos:"")+'"></div>'+
      '<div class="field span2"><label for="f_pres">Presupuesto aproximado (COP)</label><input class="input num" id="f_pres" inputmode="numeric" placeholder="$ 0" value="'+esc(d.presupuesto?new Intl.NumberFormat("es-CO").format(d.presupuesto):"")+'"></div>'+
    '</div>'+
    '<div class="field"><span class="label">Intereses</span><div class="chips" id="f_int">'+INTERESES.map(i=>'<button type="button" class="chip-toggle" aria-pressed="'+((d.intereses||[]).includes(i))+'">'+esc(i)+'</button>').join("")+'</div></div>'+
    '<div class="field"><label for="f_pref">Preferencias (hotel, aerolínea, plan de comidas, necesidades especiales)</label><textarea class="input" id="f_pref" maxlength="1500">'+esc(d.preferencias||"")+'</textarea></div>'+
    '<div class="field"><label for="f_etapa">Etapa del embudo</label><select class="input" id="f_etapa">'+ETAPAS.map(e=>'<option value="'+e.k+'"'+(e.k===d.etapa?" selected":"")+'>'+e.l+'</option>').join("")+'</select></div>'+
    (c?'':'<div class="field"><label for="f_nota">Primera nota de seguimiento (opcional)</label><textarea class="input" id="f_nota" maxlength="1500" placeholder="Ej.: Escribió por Instagram preguntando por San Andrés en diciembre."></textarea></div>')+
    '<div class="err" id="f_err" role="alert"></div>'+
    '<div class="sheet-foot"><button type="button" class="btn" id="fxCancel">Cancelar</button><button type="submit" class="btn btn-gold" id="fxSave">'+(c?"Guardar cambios":"Guardar cliente")+'</button></div>'+
    '</form>',"","cform",{noBackdrop:true});
  s.querySelector("#fxClose").onclick=()=>closeOverlay("cform");
  s.querySelector("#fxCancel").onclick=()=>closeOverlay("cform");
  s.querySelectorAll("#f_int .chip-toggle").forEach(b=>b.onclick=()=>b.setAttribute("aria-pressed",b.getAttribute("aria-pressed")==="true"?"false":"true"));
  const pres=s.querySelector("#f_pres"); pres.oninput=()=>{pres.value=fmtMontoInput(pres.value);};
  const fecha=s.querySelector("#f_fecha"); fecha.onchange=()=>{s.querySelector("#f_fecha_txt").textContent=fecha.value?fmtFecha(fecha.value):"DD/MM/AAAA";};
  s.querySelector("#cf").onsubmit=async ev=>{
    ev.preventDefault();
    const g=k=>s.querySelector(k).value.trim();
    const err=s.querySelector("#f_err");
    const nombre=g("#f_nombre"), tel=g("#f_tel"), email=g("#f_email");
    if(!nombre){err.textContent="Escribe el nombre del cliente.";s.querySelector("#f_nombre").focus();return;}
    if(tel.replace(/\D/g,"").length<7){err.textContent="Escribe un número de WhatsApp o celular válido (mínimo 7 dígitos).";s.querySelector("#f_tel").focus();return;}
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){err.textContent="Revisa el correo: debe tener el formato nombre@dominio.com.";s.querySelector("#f_email").focus();return;}
    const num=k=>{const v=g(k);if(v==="")return null;const n=parseInt(v,10);return isFinite(n)&&n>=0?n:null;};
    const ahora=new Date().toISOString();
    const etapa=g("#f_etapa");
    const datos={
      nombre:nombre,telefono:tel,email:email,ciudad:g("#f_ciudad"),origen:g("#f_origen"),
      destinos:g("#f_dest"),tipoViaje:g("#f_tipo"),fechaViaje:g("#f_fecha")||null,
      adultos:num("#f_ad"),ninos:num("#f_ni"),presupuesto:parseMonto(g("#f_pres")),
      intereses:[...s.querySelectorAll('#f_int [aria-pressed="true"]')].map(b=>b.textContent),
      preferencias:g("#f_pref"),etapa:etapa,actualizadoEn:ahora
    };
    if(!c){
      const dup=await api.buscarDuplicado(tel,email);
      if(dup){
        if(!dup.visible){err.textContent="Ya existe un cliente con ese teléfono o correo ("+dup.nombre+"), asignado a "+dup.asesor+". Pide al administrador que te lo asigne en lugar de crearlo de nuevo.";return;}
        const ans=await confirmar("Este cliente ya existe",dup.nombre+" ya está registrado con ese teléfono o correo.\n¿Quieres abrir su ficha en lugar de crear un duplicado?","Abrir ficha existente",false,"Es otra persona");
        if(ans===false)return;
        if(ans===true){closeOverlay("cform");abrirDetalle(dup.id);return;}
      }
    }
    const btn=s.querySelector("#fxSave"); btn.disabled=true; btn.textContent="Guardando…";
    let ok;
    if(c){
      if(c.etapa!==etapa&&etapa==="ganado")datos.cerradoEn=ahora;
      ok=await guardar(()=>api.actualizarCliente(c.id,datos));
      if(ok&&c.etapa!==etapa)await api.agregarHistorial(c.id,"Etapa","Cambió de “"+etapaLabel(c.etapa)+"” a “"+etapaLabel(etapa)+"”.");
    }else{
      const nota=g("#f_nota");
      datos.asesorId=S.meId;datos.ultimoContacto=nota?ahora:null;
      if(etapa==="ganado")datos.cerradoEn=ahora;
      const row=await guardar(()=>api.crearCliente(datos));
      ok=!!row;
      if(row){await api.agregarHistorial(row.id,"Registro","Cliente registrado en el CRM.");if(nota)await api.agregarHistorial(row.id,"Nota",nota);}
    }
    if(ok){closeOverlay("cform");toast(c?"Cambios guardados":"Cliente guardado");}
    else{btn.disabled=false;btn.textContent=c?"Guardar cambios":"Guardar cliente";}
  };
  setTimeout(()=>{const n=s.querySelector("#f_nombre");if(n&&!c)n.focus();},50);
}

/* ---------- Client detail ---------- */
let detalleId=null, segDraft="";
function abrirDetalle(id){detalleId=id;segDraft="";pintarDetalle();cargarHistorial(id);}
function pintarDetalle(){
  const c=S.clientes.find(x=>x.id===detalleId);
  if(!c){if(detalleId){closeOverlay("detalle");detalleId=null;}return;}
  const puede=!S.readOnly;
  const wa=waLink(c.telefono);
  const viajeros=[c.adultos?c.adultos+" adulto"+(c.adultos===1?"":"s"):"",c.ninos?c.ninos+" niño"+(c.ninos===1?"":"s"):""].filter(Boolean).join(", ")||"—";
  const hist=(S.hist[c.id]||[]).slice().sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
  const histCargado=!!S.hist[c.id];
  const s=openOverlay(
    '<div class="sheet-head"><span class="eyebrow">Ficha del cliente</span><button class="btn btn-ghost btn-sm" id="dClose">Cerrar</button></div>'+
    '<div class="sheet-body">'+
    '<div class="pass"><div class="pass-main"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><span class="pill st-'+esc(c.etapa)+'">'+esc(etapaLabel(c.etapa))+'</span>'+(c.ejemplo?'<span class="tag-demo">Prueba</span>':'')+'</div>'+
      '<div class="pass-name">'+esc(c.nombre)+'</div>'+
      '<div class="pass-grid"><div><div class="k">Destino</div><div class="v">'+esc(c.destinos||"Por definir")+'</div></div><div><div class="k">Fecha</div><div class="v num">'+fmtFecha(c.fechaViaje)+'</div></div>'+
      '<div><div class="k">Viajeros</div><div class="v">'+esc(viajeros)+'</div></div><div><div class="k">Tipo</div><div class="v">'+esc(c.tipoViaje||"—")+'</div></div></div></div>'+
      '<div class="pass-stub"><div><div class="brand-sub">Presupuesto</div><div class="budget">'+fmtCOP(c.presupuesto)+'</div></div><div style="font-size:12.5px;color:var(--on-navy-muted)">Asesor: '+esc(nombrePersona(c.asesorId))+'</div></div></div>'+

    '<div class="panel panel-pad" style="display:flex;flex-direction:column;gap:12px"><h2>Contacto</h2>'+
      '<div class="contact-line"><span class="muted" style="width:72px">WhatsApp</span><span class="contact-val num">'+esc(c.telefono||"—")+'</span>'+(c.telefono?'<button class="btn btn-sm" data-copy="'+esc(c.telefono)+'">Copiar</button>':'')+(wa?'<a class="btn btn-sm" href="'+esc(wa)+'" target="_blank" rel="noopener">Abrir WhatsApp</a>':'')+'</div>'+
      '<div class="contact-line"><span class="muted" style="width:72px">Correo</span><span class="contact-val" style="overflow-wrap:anywhere">'+esc(c.email||"—")+'</span>'+(c.email?'<button class="btn btn-sm" data-copy="'+esc(c.email)+'">Copiar</button>':'')+'</div>'+
      '<div class="contact-line"><span class="muted" style="width:72px">Ciudad</span><span>'+esc(c.ciudad||"—")+'</span></div>'+
      '<div class="contact-line"><span class="muted" style="width:72px">Origen</span><span>'+esc(c.origen||"—")+'</span></div></div>'+

    '<div class="panel panel-pad" style="display:flex;flex-direction:column;gap:10px"><h2>Preferencias</h2>'+
      ((c.intereses||[]).length?'<div class="chips">'+c.intereses.map(i=>'<span class="pill st-contactado">'+esc(i)+'</span>').join("")+'</div>':'')+
      '<p style="margin:0;white-space:pre-wrap;overflow-wrap:anywhere" class="'+(c.preferencias?'':'muted')+'">'+esc(c.preferencias||"Sin preferencias registradas.")+'</p></div>'+

    (puede?'<div class="panel panel-pad" style="display:flex;flex-direction:column;gap:12px"><h2>Registrar seguimiento</h2>'+
      '<div class="chips" id="segTipo">'+TIPOS_SEG.map((t,i)=>'<button type="button" class="chip-toggle" aria-pressed="'+(i===1)+'">'+t+'</button>').join("")+'</div>'+
      '<textarea class="input" id="segTxt" maxlength="1500" placeholder="¿Qué hablaron? ¿Cuál es el próximo paso?"></textarea>'+
      '<div class="sheet-foot" style="justify-content:space-between"><select class="input" id="segEtapa" style="width:auto;flex:1 1 200px" aria-label="Etapa después del seguimiento">'+ETAPAS.map(e=>'<option value="'+e.k+'"'+(e.k===c.etapa?" selected":"")+'>'+(e.k===c.etapa?"Mantener: ":"Pasar a: ")+e.l+'</option>').join("")+'</select><button class="btn btn-gold" id="segSave">Guardar seguimiento</button></div></div>':'')+

    panelCotCliente(c,puede)+
    '<div class="panel panel-pad"><div class="section-title"><h2>Historial</h2><span class="help">Registrado el '+fmtFechaTs(c.creadoEn)+'</span></div><div class="timeline" style="margin-top:10px">'+
      (!histCargado?'<p class="muted">Cargando historial…</p>':hist.length?hist.map(x=>'<div class="tl-item"><span class="tl-dot"></span><div class="tl-body"><span class="tl-meta">'+esc(x.tipo||"Nota")+' · '+fmtFechaHora(x.fecha)+' · '+esc(nombrePersona(x.autor))+'</span><span class="tl-text">'+esc(x.texto)+'</span></div></div>').join(""):'<p class="muted">Sin movimientos.</p>')+
    '</div></div>'+

    (puede?'<div class="sheet-foot" style="justify-content:space-between">'+
      '<div class="chips">'+(S.isAdmin?'<button class="btn btn-danger" id="dDel">Eliminar</button>':'')+(c.asesorId!==S.meId&&S.meId?'<button class="btn" id="dMine">Asignármelo</button>':'')+'</div>'+
      '<button class="btn btn-gold" id="dEdit">Editar datos</button></div>':'')+
    '</div>',"","detalle");
  s.querySelectorAll("[data-cot]").forEach(el=>el.onclick=()=>abrirCotizacion(el.dataset.cot));
  const nc=s.querySelector("#dNuevaCot"); if(nc)nc.onclick=()=>abrirEditor(null,{clienteId:c.id});
  s.querySelector("#dClose").onclick=()=>{detalleId=null;closeOverlay("detalle");};
  s.querySelectorAll("[data-copy]").forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);toast("Copiado");}catch(_){toast("Mantén presionado el dato para copiarlo.");}});
  if(!puede)return;
  const segTxt=s.querySelector("#segTxt"); segTxt.value=segDraft; segTxt.oninput=()=>{segDraft=segTxt.value;};
  s.querySelectorAll("#segTipo .chip-toggle").forEach(b=>b.onclick=()=>{s.querySelectorAll("#segTipo .chip-toggle").forEach(x=>x.setAttribute("aria-pressed","false"));b.setAttribute("aria-pressed","true");});
  s.querySelector("#segSave").onclick=async()=>{
    const txt=s.querySelector("#segTxt").value.trim();
    const nueva=s.querySelector("#segEtapa").value;
    if(!txt&&nueva===c.etapa){toast("Escribe qué hablaron con el cliente.");return;}
    const tipo=(s.querySelector('#segTipo [aria-pressed="true"]')||{}).textContent||"Nota";
    const ahora=new Date().toISOString();
    const patch={};
    if(txt)patch.ultimoContacto=ahora;
    if(nueva!==c.etapa){patch.etapa=nueva;if(nueva==="ganado")patch.cerradoEn=ahora;}
    const b=s.querySelector("#segSave");b.disabled=true;b.textContent="Guardando…";
    segDraft="";
    let ok=true;
    if(txt)ok=!!(await guardar(()=>api.agregarHistorial(c.id,tipo,txt,null,true)));
    if(ok&&nueva!==c.etapa)ok=!!(await guardar(()=>api.agregarHistorial(c.id,"Etapa","Cambió de “"+etapaLabel(c.etapa)+"” a “"+etapaLabel(nueva)+"”.",null,true)));
    if(ok&&Object.keys(patch).length)ok=!!(await guardar(()=>api.actualizarCliente(c.id,patch)));
    if(ok){toast("Seguimiento guardado");await cargarHistorial(c.id);}
    else{segDraft=txt;const t=document.getElementById("segTxt");if(t)t.value=txt;const b2=document.getElementById("segSave");if(b2){b2.disabled=false;b2.textContent="Guardar seguimiento";}}
  };
  s.querySelector("#dEdit").onclick=()=>abrirFormulario(c.id);
  const dm=s.querySelector("#dMine");
  if(dm)dm.onclick=async()=>{
    if(await guardar(()=>api.actualizarCliente(c.id,{asesorId:S.meId}))){await api.agregarHistorial(c.id,"Asignación","Tomó el cliente como asesor responsable.");toast("Cliente asignado a ti");}};
  const dd=s.querySelector("#dDel");
  if(dd)dd.onclick=async()=>{
    const id=c.id,nom=c.nombre;
    const nq=S.cotizaciones.filter(q=>q.clienteId===id).length;
    if(!(await confirmar("¿Eliminar a "+nom+"?","Se borrará el cliente y todo su historial."+(nq?" Sus "+nq+" cotizaciones se conservan, sin cliente vinculado.":"")+" Esta acción no se puede deshacer.","Eliminar definitivamente",true)))return;
    if(await guardar(()=>api.borrarCliente(id))){detalleId=null;closeOverlay("detalle");toast("Cliente eliminado");}
  };
}

async function cambiarEtapa(id,nueva){
  const c=S.clientes.find(x=>x.id===id); if(!c||c.etapa===nueva)return;
  const ahora=new Date().toISOString();
  const patch={etapa:nueva};
  if(nueva==="ganado")patch.cerradoEn=ahora;
  if(await guardar(()=>api.actualizarCliente(id,patch))){
    await api.agregarHistorial(id,"Etapa","Cambió de “"+etapaLabel(c.etapa)+"” a “"+etapaLabel(nueva)+"”.");
    toast(c.nombre+" → "+etapaLabel(nueva));
  }
}

/* =====================================================================
   COTIZACIONES
   ===================================================================== */
const D=window.DTCot;
const estadoLabel=k=>(D.ESTADOS.find(e=>e.k===k)||{l:k}).l;
const monedaDe=q=>((q.valores||{}).moneda)||"COP";
const ICON_PLUS='<path d="M12 5v14M5 12h14"/>';
const ICON_X='<path d="M6 6l12 12M18 6 6 18"/>';
function totalTxt(q){
  const r=D.calcular(q);if(!r.completo)return "Por definir";
  if(r.multiple&&r.elegida==null)return "Desde "+D.fmtMoneda(r.minimo,monedaDe(q));
  return D.fmtMoneda(r.total,monedaDe(q));
}
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
    (S.readOnly||S.dbMissing?'':'<div class="actions"><button class="btn" data-act="plantillas">Plantillas'+(S.plantillas.length?' ('+S.plantillas.length+')':'')+'</button><button class="btn btn-gold" data-act="nueva-cot">'+icon(ICON_PLUS,18)+'Nueva cotización</button></div>')+'</div>';
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
      '<div class="pass-stub"><div><div class="brand-sub">'+(r.multiple?(r.elegida!=null?"Opción elegida":r.opciones.length+" opciones"):"Valor total")+'</div><div class="budget">'+esc(totalTxt(q))+'</div></div><div style="font-size:12.5px;color:var(--on-navy-muted)">'+(D.fechaValida(q.fechaVencimiento)?"Válida hasta "+D.fmtFecha(q.fechaVencimiento):"Sin fecha de vigencia")+'</div></div></div>'+
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
      kv("Anticipo",r.anticipo!=null?D.fmtMoneda(r.anticipo,mon):"")+kv("Saldo",r.saldo!=null&&r.completo&&(!r.multiple||r.elegida!=null)?D.fmtMoneda(r.saldo,mon):"")+
      (r.multiple?kv("Opciones",r.opciones.map((o,i)=>(r.elegida===i?"✓ ":"")+"Opción "+(i+1)+(o.nombre?" – "+o.nombre:"")+": "+(o.completo?D.fmtMoneda(o.total,mon):"por definir")).join("\n")):"")+kv("Fecha límite de pago",D.fmtFecha((q.condiciones||{}).fechaLimitePago))+
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
    if(await guardar(()=>api.borrarCotizacion(q.id))){cotId=null;closeOverlay("cot");toast("Cotización eliminada");}
  };
}

async function cambiarEstadoCot(q,nuevo){
  if(q.estado===nuevo)return;
  const ahora=new Date().toISOString();
  const cl=q.clienteId?S.clientes.find(x=>x.id===q.clienteId):null;
  let qNueva=null;
  const rq=D.calcular(q);
  if(nuevo==="aceptada"&&rq.multiple){
    const idx=await elegirOpcion(q);
    if(idx==null){pintarCotizacion();return;}
    qNueva=clone(q);qNueva.valores=Object.assign({},qNueva.valores,{opcionElegida:idx});
  }
  let marcarGanado=false;
  if(nuevo==="aceptada"&&cl&&cl.etapa!=="ganado"){
    const ans=await confirmar("Cotización aceptada","¿Quieres pasar también a "+cl.nombre+" a la etapa “Venta cerrada” del embudo?","Sí, venta cerrada",false,"Solo la cotización");
    if(ans===false){pintarCotizacion();return;}
    marcarGanado=ans===true;
  }
  const hist=(q.historialEstados||[]).slice();hist.push({estado:nuevo,fecha:ahora,autor:S.meId});
  if(!(await guardar(()=>api.actualizarCotizacion(q.id,{estado:nuevo,historialEstados:hist,cotizacion:qNueva})))){pintarCotizacion();return;}
  if(cl){
    const patch={};
    await api.agregarHistorial(cl.id,"Cotización","Cotización "+D.codigo(q.numero)+" marcada como “"+estadoLabel(nuevo)+"”.");
    if(nuevo==="enviada"){patch.ultimoContacto=ahora;if(cl.etapa==="nuevo"||cl.etapa==="contactado"){await api.agregarHistorial(cl.id,"Etapa","Cambió de “"+etapaLabel(cl.etapa)+"” a “"+etapaLabel("cotizado")+"”.");patch.etapa="cotizado";}}
    if(marcarGanado){await api.agregarHistorial(cl.id,"Etapa","Cambió de “"+etapaLabel(cl.etapa)+"” a “"+etapaLabel("ganado")+"”.");patch.etapa="ganado";patch.cerradoEn=ahora;}
    if(Object.keys(patch).length)await guardar(()=>api.actualizarCliente(cl.id,patch));
  }
  toast("Estado actualizado: "+estadoLabel(nuevo));
}

function elegirOpcion(q){
  const r=D.calcular(q),mon=monedaDe(q);
  return new Promise(res=>{
    const s=openOverlay('<div class="sheet-head"><h2>¿Qué opción eligió el cliente?</h2></div><div class="sheet-body">'+
      '<p class="muted" style="margin:0">La cotización '+esc(D.codigo(q.numero))+' tiene '+r.opciones.length+' opciones. La elegida queda marcada en el PDF y su valor se usa en los reportes.</p>'+
      '<div class="list">'+r.opciones.map((o,i)=>'<button type="button" class="pick" data-op="'+i+'"><span><b>Opción '+(i+1)+(o.nombre?' – '+esc(o.nombre):'')+'</b>'+(o.detalle?'<br><span class="help">'+esc(o.detalle)+'</span>':'')+'</span><b class="num">'+(o.completo?esc(D.fmtMoneda(o.total,mon)):"Por definir")+'</b></button>').join("")+'</div>'+
      '<div class="sheet-foot"><button class="btn" id="opNo">Cancelar</button></div></div>',"confirm","elegir");
    s.querySelectorAll("[data-op]").forEach(b=>b.onclick=()=>{closeOverlay("elegir");res(+b.dataset.op);});
    s.querySelector("#opNo").onclick=()=>{closeOverlay("elegir");res(null);};
  });
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
async function logoPng(){
  if(!logoBytes){const r=await fetch("assets/logo.png");if(!r.ok)throw new Error("logo");logoBytes=new Uint8Array(await r.arrayBuffer());}
  return logoBytes;
}
const pdfCache={};
async function construirPDF(q){
  const PDFLib=await cargarPdfLib();
  const bytes=await D.generarPDF(q,{PDFLib:PDFLib,logoPng:await logoPng()});
  if(q.id)pdfCache[q.id]={v:q.actualizadoEn||"",bytes:bytes};
  return bytes;
}
async function renderPaginas(bytes,cont){
  const lib=await cargarPdfJs();
  const pdf=await lib.getDocument({data:bytes.slice(0),isEvalSupported:false}).promise;
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
    (guardada?'<div class="actions" id="pvActs" hidden><button class="btn btn-gold" id="pvDown">Descargar PDF</button><button class="btn" id="pvOpen">Abrir PDF para compartir</button>'+(tel?'<a class="btn" href="'+esc(D.enlaceWhatsApp(tel,D.mensajeWhatsApp(q)))+'" target="_blank" rel="noopener">Abrir WhatsApp con el mensaje</a>':'')+'</div>':'')+
    '<div class="pv-pages" id="pvPages"><p class="muted" style="margin:24px 0">Preparando las páginas…</p></div>'+
    '</div>',"wide","preview");
  s.querySelector("#pvClose").onclick=()=>closeOverlay("preview");
  const st=s.querySelector("#pvStatus");
  let bytes;
  try{bytes=await construirPDF(q);}
  catch(e){console.error(e);st.textContent="No se pudo cargar el generador de PDF. Revisa tu conexión a internet e intenta de nuevo.";st.className="err";s.querySelector("#pvPages").innerHTML="";return;}
  if(!hayCapa("preview"))return;
  const acts=s.querySelector("#pvActs");
  if(acts){acts.hidden=false;const b=s.querySelector("#pvDown");b.onclick=()=>descargarPDF(q,bytes,b);
    s.querySelector("#pvOpen").onclick=()=>{const u=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));const w=window.open(u,"_blank");if(!w)descargarPDF(q,bytes,null);setTimeout(()=>URL.revokeObjectURL(u),60000);};}
  try{
    const n=await renderPaginas(bytes,s.querySelector("#pvPages"));
    st.textContent="PDF generado: "+n+(n===1?" página":" páginas")+" · "+kb(bytes.length)+(guardada?" · "+D.nombreArchivo(q):"");
  }catch(e){
    console.error(e);
    st.textContent="El PDF se generó ("+kb(bytes.length)+"), pero la vista previa no se pudo mostrar en este dispositivo."+(guardada?" Descárgalo para revisarlo.":"");
    s.querySelector("#pvPages").innerHTML="";
  }
}
function descargarArchivo(nombre,blob){
  const url=URL.createObjectURL(blob);const a=document.createElement("a");
  a.href=url;a.download=nombre;a.rel="noopener";document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},10000);
}
async function descargarPDF(q,bytes,btn){
  const chk=D.validar(q,"pdf"); if(!chk.ok){toast("Completa la cotización antes de descargar el PDF.");return;}
  const c=q.id&&pdfCache[q.id];
  if(!bytes&&c&&c.v===(q.actualizadoEn||""))bytes=c.bytes;
  if(!bytes){abrirVistaPrevia(q,{guardada:true});return;} // se genera y se descarga desde la vista previa
  descargarArchivo(D.nombreArchivo(q),new Blob([bytes],{type:"application/pdf"}));
  toast("PDF descargado: "+D.nombreArchivo(q));
}

/* ----- Editor ----- */
const TABS_ED=[{k:"cliente",l:"1. Cliente"},{k:"viaje",l:"2. Viaje"},{k:"servicios",l:"3. Servicios"},{k:"valores",l:"4. Valores"},{k:"condiciones",l:"5. Condiciones"}];
const SUG_SERV=["Tiquetes aéreos","Alojamiento","Alimentación según el plan","Traslados aeropuerto – hotel – aeropuerto","Tours y actividades","Asistencia médica","Impuestos y tasas aeroportuarias"];
const CATEG=["3 estrellas","4 estrellas","5 estrellas","Boutique","Hostal","Apartamento"];
const REGIMEN=["Solo alojamiento","Alojamiento y desayuno","Media pensión","Pensión completa","Todo incluido"];
let E=null,edTab="cliente",edErrores=[],edNuevoCli=false,edBusca="",edNochesManual=false,edBase="",edGuardando=false;

function cotVacia(){
  return {numero:null,estado:"borrador",fechaElaboracion:hoyISO(),fechaVencimiento:"",asesorId:S.meId,asesorNombre:(S.perfil||{}).nombre||"",
    clienteId:null,cliente:{nombre:"",telefono:"",email:""},
    viaje:{destinos:"",ciudadSalida:"",fechaIda:"",fechaRegreso:"",noches:null,adultos:null,ninos:null,edadesNinos:"",infantes:null,aerolinea:"",equipaje:"",tramos:[],hotel:"",categoriaHotel:"",habitacion:"",regimen:"",traslados:"",tours:"",asistencia:""},
    servicios:[],observacionesPaquete:"",
    valores:{moneda:"COP",opciones:[opcionVacia()],cargos:[],descuentos:[],anticipo:null,mostrarPorPersona:false},
    condiciones:{politicaAnticipo:"",fechaLimitePago:"",politicaCancelacion:"",equipaje:"",disponibilidad:"",noIncluidos:"",adicionales:""},
    historialEstados:[]};
}
function opcionVacia(){return {nombre:"",detalle:"",precioAdulto:null,precioNino:null,precioInfante:null};}
function normalizarValores(e){
  const v=e.valores||(e.valores={});
  v.opciones=clone(D.opcionesDe(v)).map(o=>Object.assign(opcionVacia(),o));
  delete v.precioAdulto;delete v.precioNino;delete v.precioInfante;
  return e;
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
    E.asesorId=S.meId;E.asesorNombre=(S.perfil||{}).nombre||src.asesorNombre||"";
    E.duplicadaDe=src.numero||null;
    if(E.valores)delete E.valores.opcionElegida;
  }else{
    E=cotVacia();
    if(opts.clienteId){
      const c=S.clientes.find(x=>x.id===opts.clienteId);
      if(c){vincularCliente(c);E.viaje.destinos=c.destinos||"";if(c.fechaViaje)E.viaje.fechaIda=c.fechaViaje;if(c.adultos!=null)E.viaje.adultos=c.adultos;if(c.ninos)E.viaje.ninos=c.ninos;}
    }
  }
  normalizarValores(E);
  if(opts.plantillaId){const pl=S.plantillas.find(x=>x.id===opts.plantillaId);if(pl)aplicarPlantilla(pl);}
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
    plantillaSelectorHTML()+
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
function lineaCat(i,k){
  const r=D.calcular(E),mon=E.valores.moneda,o=r.opciones[i];if(!o)return "";
  const l=o.lineas.find(x=>x.k===k);
  if(!l)return "Sin pasajeros en esta categoría";
  return l.cant+" × "+(l.unit!=null?D.fmtMoneda(l.unit,mon):"sin precio")+" = "+(l.subtotal!=null?D.fmtMoneda(l.subtotal,mon):"falta el precio");
}
function calcHTML(){
  const r=D.calcular(E),mon=E.valores.moneda,f=n=>D.fmtMoneda(n,mon);
  let h='';
  if(!r.pax)return '<div class="calc"><div class="calc-row"><span class="muted">Indica los pasajeros en la pestaña Viaje.</span></div></div>';
  r.opciones.forEach((o,i)=>{
    h+='<div class="calc">';
    if(r.multiple)h+='<div class="calc-row"><b>Opción '+(i+1)+(o.nombre?' – '+esc(o.nombre):'')+'</b></div>';
    o.lineas.forEach(l=>{h+='<div class="calc-row"><span>'+esc(l.concepto)+' ('+l.cant+')</span><b>'+(l.subtotal!=null?f(l.subtotal):'<span class="err">Falta el precio</span>')+'</b></div>';});
    if(r.totalCargos)h+='<div class="calc-row"><span>Otros cargos</span><b>'+f(r.totalCargos)+'</b></div>';
    if(r.totalDescuentos)h+='<div class="calc-row"><span>Descuentos</span><b>'+f(-r.totalDescuentos)+'</b></div>';
    h+='<div class="calc-total"><span>'+(r.multiple?"Total opción "+(i+1):"Valor total")+'</span><b>'+(o.completo?f(o.total):"Por definir")+'</b></div>';
    if(o.completo&&r.pax>1)h+='<div class="calc-row"><span>Promedio por pasajero ('+r.pax+')</span><b>'+f(o.porPersona)+'</b></div>';
    if(r.anticipo!=null&&o.completo)h+='<div class="calc-row"><span>Saldo después del anticipo</span><b>'+f(o.saldo)+'</b></div>';
    h+='</div>';
  });
  if(r.anticipo!=null)h+='<div class="calc"><div class="calc-row"><span>Anticipo requerido</span><b>'+f(r.anticipo)+'</b></div></div>';
  return '<div class="calc-stack">'+h+'</div>';
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
    '<p class="help" style="margin:0">¿Vas a ofrecer más de una alternativa (por ejemplo, solo desayuno y todo incluido)? Agrega otra opción de precio: cada una tiene su nombre, sus precios y su total en el PDF.</p>'+
    E.valores.opciones.map((op,i)=>{
      const varias=E.valores.opciones.length>1;
      return '<div class="opt-card"><div class="opt-head"><b>'+(varias?"Opción "+(i+1):"Precios")+'</b><div class="actions">'+
        '<button type="button" class="btn btn-sm" data-ed="dup-opcion" data-i="'+i+'">Duplicar</button>'+
        (varias?'<button type="button" class="icon-btn" data-ed="del-opcion" data-i="'+i+'" aria-label="Quitar opción '+(i+1)+'">'+icon(ICON_X,18)+'</button>':'')+'</div></div>'+
        '<div class="grid2">'+fld(varias?"Nombre de la opción *":"Nombre de la opción (opcional)","valores.opciones."+i+".nombre","text",{campo:"op_"+i+"_nombre",max:120,ph:"Ej.: Hotel Sunrise – Todo incluido"})+
        fld("Detalle (opcional)","valores.opciones."+i+".detalle","text",{max:200,ph:"Ej.: Habitación doble vista al mar"})+'</div>'+
        [["precioAdulto","Precio por adulto","adultos"],["precioNino","Precio por niño","ninos"],["precioInfante","Precio por infante","infantes"]].map(([k,l,c])=>
          '<div class="price-line">'+fld(l+(n(c)?" ("+n(c)+")":""),"valores.opciones."+i+"."+k,"money",{campo:"op_"+i+"_"+k,ph:n(c)?"Escribe el precio (0 si no tiene costo)":"Sin pasajeros"})+'<span class="sub" data-sub="'+i+':'+c+'">'+esc(lineaCat(i,c))+'</span></div>').join("")+
      '</div>';
    }).join("")+
    '<div><button type="button" class="btn" data-ed="add-opcion">'+icon(ICON_PLUS,16)+'Agregar otra opción de precio</button></div>'+
    '<span class="fs-title">Otros cargos</span>'+(E.valores.opciones.length>1?'<p class="help" style="margin:0">Los cargos y descuentos se aplican a todas las opciones.</p>':'')+listaMontos("valores.cargos","cargo")+
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
    '<div class="actions"><button type="button" class="btn btn-sm" data-ed="cond-cargar">Usar condiciones guardadas</button>'+(S.isAdmin?'<button type="button" class="btn btn-sm" data-ed="cond-guardar">Guardar como predeterminadas</button>':'')+'</div>'+
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
  const r=D.calcular(E),mon=E.valores.moneda;
  let t;
  if(!r.pax)t="—";
  else if(r.multiple)t=r.minimo!=null?(r.opciones.length+" opciones · desde "+D.fmtMoneda(r.minimo,mon)):"Faltan precios";
  else t=r.completo?D.fmtMoneda(r.total,mon):"Faltan precios";
  return '<span>'+(r.pax?r.pax+(r.pax===1?" pasajero":" pasajeros"):"Sin pasajeros")+'</span><b>'+esc(t)+'</b>';
}
function pintarEditor(arriba){
  const prevSc=document.querySelector("#overlayRoot .ed-scroll"),top=prevSc&&!arriba?prevSc.scrollTop:0;
  const err=tabsConError();
  const cuerpo={cliente:edTabCliente,viaje:edTabViaje,servicios:edTabServicios,valores:edTabValores,condiciones:edTabCondiciones}[edTab]();
  const s=openOverlay(
    '<div class="sheet-head"><h2>'+(E.id?"Editar "+esc(D.codigo(E.numero)):"Nueva cotización")+'</h2><div class="actions"><button type="button" class="btn btn-sm" data-ed="guardar-plantilla">Guardar como plantilla</button><button type="button" class="btn btn-ghost btn-sm" data-ed="close">Cerrar</button></div></div>'+
    '<div class="ed-tabs" role="tablist">'+TABS_ED.map(t=>'<button type="button" class="ed-tab" role="tab" data-ed="tab" data-tab="'+t.k+'" aria-selected="'+(t.k===edTab)+'">'+t.l+(err.has(t.k)?'<span class="dot" aria-label="con errores"></span>':'')+'</button>').join("")+'</div>'+
    '<div class="ed-scroll"><form class="sheet-body" id="edForm" novalidate>'+
      (edErrores.length?'<div class="errbox" role="alert"><b>Revisa estos datos:</b><ul>'+edErrores.map(e=>'<li><button type="button" data-ed="goto" data-tab="'+e.tab+'" data-campo="'+esc(e.campo||"")+'">'+esc(e.msg)+'</button></li>').join("")+'</ul></div>':'')+
      cuerpo+
    '</form></div>'+
    '<div class="ed-foot"><div class="ed-total" id="edTotal">'+edTotalHTML()+'</div><div class="actions">'+
      '<button type="button" class="btn" data-ed="preview">Vista previa</button>'+
      '<button type="button" class="btn" data-ed="save"'+(edGuardando?" disabled":"")+'>'+(edGuardando?"Guardando…":"Guardar borrador")+'</button>'+
      '<button type="button" class="btn btn-gold" data-ed="save-pdf"'+(edGuardando?" disabled":"")+'>Guardar y generar PDF</button></div></div>',
    "wide editor","editor",{noBackdrop:true});
  const sc=s.querySelector(".ed-scroll");if(sc)sc.scrollTop=top;
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
  document.querySelectorAll("[data-sub]").forEach(el=>{const p=el.dataset.sub.split(":");el.textContent=lineaCat(+p[0],p[1]);});
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
  if(a==="add-opcion"){E.valores.opciones.push(opcionVacia());pintarEditor();const ins=document.querySelectorAll('#overlayRoot [data-k$=".nombre"][data-k^="valores.opciones."]');if(ins.length){ins[ins.length-1].focus();ins[ins.length-1].scrollIntoView({block:"center"});}return;}
  if(a==="dup-opcion"){const o=clone(E.valores.opciones[+b.dataset.i]);o.nombre=o.nombre?o.nombre+" (copia)":"";E.valores.opciones.splice(+b.dataset.i+1,0,o);pintarEditor();return;}
  if(a==="del-opcion"){
    if(E.valores.opciones.length<2)return;
    const o=E.valores.opciones[+b.dataset.i];
    if((o.nombre||o.precioAdulto!=null)&&!(await confirmar("¿Quitar la opción "+(+b.dataset.i+1)+"?","Se borrarán su nombre y sus precios.","Quitar",true)))return;
    E.valores.opciones.splice(+b.dataset.i,1);delete E.valores.opcionElegida;edErrores=[];pintarEditor();return;
  }
  if(a==="usar-plantilla"){
    const sel=document.getElementById("plSel");const pl=sel&&S.plantillas.find(x=>x.id===sel.value);
    if(!pl){toast("Elige una plantilla de la lista.");return;}
    if(tieneContenido(E)&&!(await confirmar("¿Usar la plantilla “"+pl.nombre+"”?","Se reemplazarán el destino, los vuelos, el hotel, los servicios, las condiciones y las opciones de precio que ya escribiste. El cliente y las fechas se conservan.","Usar plantilla")))return;
    aplicarPlantilla(pl);pintarEditor();toast("Plantilla aplicada. Completa cliente, fechas, pasajeros y precios.");return;
  }
  if(a==="guardar-plantilla"){await dialogoGuardarPlantilla();return;}
  if(a==="add-cargo"){E.valores.cargos.push({concepto:"",valor:null});pintarEditor();return;}
  if(a==="add-desc"){E.valores.descuentos.push({concepto:"",valor:null});pintarEditor();return;}
  if(a==="del"){const l=getP(E,b.dataset.list);l.splice(+b.dataset.i,1);edErrores=[];pintarEditor();return;}
  if(a==="cond-cargar"){await cargarCondiciones();return;}
  if(a==="cond-guardar"){await guardarCondiciones();return;}
  if(a==="preview"){abrirVistaPrevia(clone(E),{guardada:false});return;}
  if(a==="save"){await guardarCot("borrador");return;}
  if(a==="save-pdf"){await guardarCot("pdf");return;}
}
/* ----- Seguimientos de hoy ----- */
const REGLAS_SEG=[
  {k:"cotizacion",l:"Cotización sin respuesta",dias:2,ayudaDias:"días después de enviar la cotización",
    texto:"Hola {nombre}, te saluda {asesor} de Diamond Travel. ¿Pudiste revisar la cotización {cotizacion} de tu viaje a {destino}? Si tienes alguna pregunta o quieres ajustar algo, con gusto te ayudo."},
  {k:"contacto",l:"Cliente sin contacto",dias:7,ayudaDias:"días sin ningún contacto",
    texto:"Hola {nombre}, te saluda {asesor} de Diamond Travel. ¿Sigues pensando en tu próximo viaje? Cuéntame qué tienes en mente y te ayudo a encontrar la mejor opción."},
  {k:"viaje",l:"Viaje próximo",dias:5,ayudaDias:"días antes de la salida",
    texto:"Hola {nombre}, ¡ya casi es tu viaje a {destino}! Sales el {fecha_ida}. Te recomendamos tener listos tus documentos de identidad y revisar tu equipaje. Cualquier duda, aquí estamos. Diamond Travel."},
  {k:"regreso",l:"Regreso del viaje",dias:1,ayudaDias:"días después del regreso",
    texto:"Hola {nombre}, ¡bienvenido(a) de regreso de {destino}! Esperamos que hayas disfrutado mucho tu viaje. Nos encantaría saber cómo te fue. Gracias por viajar con Diamond Travel."}
];
function cfgSeg(k){
  const base=REGLAS_SEG.find(x=>x.k===k),c=((S.config.seguimientos||{})[k])||{};
  return {activa:c.activa!==false,dias:Number.isInteger(c.dias)&&c.dias>=0?c.dias:base.dias,texto:typeof c.texto==="string"&&c.texto.trim()?c.texto:base.texto};
}
const soloFecha=ts=>{const d=new Date(ts);return isNaN(d)?"":d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());};
function llenarMensaje(t,dat){
  return t.replace(/\{(\w+)\}/g,(m,k)=>dat[k]!=null&&dat[k]!==""?String(dat[k]):(k==="destino"?"tu destino":""))
    .replace(/[ \t]+([,.!?])/g,"$1").replace(/[ \t]{2,}/g," ").trim();
}
function datosMensaje(c,q,dias){
  const v=(q&&q.viaje)||{};
  return {nombre:String(c.nombre||"").trim().split(/\s+/)[0],nombre_completo:c.nombre,asesor:((S.perfil||{}).nombre||"").trim().split(/\s+/)[0]||"el equipo",
    destino:v.destinos||c.destinos||"",cotizacion:q?D.codigo(q.numero):"",fecha_ida:D.fmtFecha(v.fechaIda||c.fechaViaje||""),fecha_regreso:D.fmtFecha(v.fechaRegreso||""),dias:dias!=null?dias:""};
}
function seguimientosPendientes(){
  const hechos=new Set(S.segs.map(x=>x.clave));
  const out=[],porCliente=new Set();
  const add=(regla,c,q,clave,motivo,dias,orden)=>{
    if(!c||c.etapa==="perdido"||hechos.has(clave))return;
    const cfg=cfgSeg(regla);
    out.push({regla:regla,cliente:c,cot:q||null,clave:clave,motivo:motivo,orden:orden,mensaje:llenarMensaje(cfg.texto,datosMensaje(c,q,dias))});
    porCliente.add(c.id);
  };
  const cli=id=>S.clientes.find(x=>x.id===id);
  const vivas=S.cotizaciones.filter(q=>q.clienteId&&cli(q.clienteId));
  // 1. Cotización enviada sin respuesta
  if(cfgSeg("cotizacion").activa)vivas.filter(q=>q.estado==="enviada").forEach(q=>{
    const env=(q.historialEstados||[]).filter(h=>h.estado==="enviada").map(h=>h.fecha).sort().pop()||q.actualizadoEn;
    const d=diasDesde(env);if(d==null||d<cfgSeg("cotizacion").dias)return;
    add("cotizacion",cli(q.clienteId),q,"cotizacion:"+q.id+":"+soloFecha(env),"Cotización "+D.codigo(q.numero)+" enviada hace "+d+(d===1?" día":" días")+", sin respuesta",d,1);
  });
  // 2. Viaje próximo y 3. regreso (cotizaciones aceptadas; o clientes en venta cerrada con fecha de viaje)
  const aceptadas=vivas.filter(q=>q.estado==="aceptada");
  if(cfgSeg("viaje").activa){
    const lim=cfgSeg("viaje").dias;
    aceptadas.forEach(q=>{const f=(q.viaje||{}).fechaIda;const d=diasHasta(f);if(d==null||d<0||d>lim)return;
      add("viaje",cli(q.clienteId),q,"viaje:"+q.id+":"+f,d===0?"Viaja hoy":"Viaja en "+d+(d===1?" día":" días")+" ("+D.fmtFecha(f)+")",d,0);});
    S.clientes.filter(c=>c.etapa==="ganado"&&c.fechaViaje&&!aceptadas.some(q=>q.clienteId===c.id)).forEach(c=>{const d=diasHasta(c.fechaViaje);if(d==null||d<0||d>lim)return;
      add("viaje",c,null,"viaje:c:"+c.id+":"+c.fechaViaje,d===0?"Viaja hoy":"Viaja en "+d+(d===1?" día":" días")+" ("+D.fmtFecha(c.fechaViaje)+")",d,0);});
  }
  if(cfgSeg("regreso").activa){
    const min=Math.max(1,cfgSeg("regreso").dias);
    aceptadas.forEach(q=>{const f=(q.viaje||{}).fechaRegreso;const d=f?-diasHasta(f):null;if(d==null||d<min||d>30)return;
      add("regreso",cli(q.clienteId),q,"regreso:"+q.id+":"+f,"Regresó de "+((q.viaje||{}).destinos||"su viaje")+" hace "+d+(d===1?" día":" días"),d,3);});
  }
  // 4. Sin contacto (no se repite si ya tiene otro seguimiento hoy)
  if(cfgSeg("contacto").activa){
    const lim=cfgSeg("contacto").dias;
    S.clientes.filter(c=>["nuevo","contactado","cotizado","negociacion"].includes(c.etapa)&&!porCliente.has(c.id)).forEach(c=>{
      const base=c.ultimoContacto||c.creadoEn;const d=diasDesde(base);if(d==null||d<lim)return;
      add("contacto",c,null,"contacto:"+c.id+":"+soloFecha(base),d+" días sin contacto · "+etapaLabel(c.etapa),d,2);
    });
  }
  return out.sort((a,b)=>a.orden-b.orden||String(a.cliente.nombre).localeCompare(String(b.cliente.nombre),"es"));
}
function panelSeguimientos(){
  if(S.faltaActualizacion)return "";
  const l=seguimientosPendientes(),max=S.segTodos?l.length:6;
  let h='<div class="panel panel-pad" id="segPanel"><div class="section-title"><h2>Seguimientos de hoy</h2><span class="pill '+(l.length?"est-vencida":"est-aceptada")+'">'+(l.length?l.length+" pendiente"+(l.length===1?"":"s"):"Al día")+'</span></div>';
  if(!l.length)return h+'<p class="muted" style="margin:6px 0">No hay mensajes pendientes. El CRM te avisará aquí cuando toque escribirle a un cliente.</p></div>';
  h+='<div class="seg-list">'+l.slice(0,max).map((x,i)=>{
    const wa=x.cliente.telefono?D.enlaceWhatsApp(x.cliente.telefono,x.mensaje):null;
    return '<div class="seg-item"><div class="seg-top"><div style="min-width:0"><b class="clickable" data-seg-ver="'+i+'" style="overflow-wrap:anywhere">'+esc(x.cliente.nombre)+'</b><div class="help">'+esc(x.motivo)+'</div></div><span class="pill st-cotizado">'+esc(REGLAS_SEG.find(r=>r.k===x.regla).l)+'</span></div>'+
      '<p class="seg-msg">'+esc(x.mensaje)+'</p>'+
      '<div class="actions">'+(wa?'<a class="btn btn-gold btn-sm" href="'+esc(wa)+'" target="_blank" rel="noopener" data-seg-env="'+i+'">Enviar por WhatsApp</a>':'<span class="help">Sin número de WhatsApp</span>')+
      '<button type="button" class="btn btn-sm" data-seg-omit="'+i+'">Omitir</button><button type="button" class="btn btn-sm btn-ghost" data-seg-ver="'+i+'">Ver cliente</button></div></div>';
  }).join("")+'</div>';
  if(l.length>6)h+='<div style="margin-top:10px"><button type="button" class="btn btn-sm" data-seg-todos>'+(S.segTodos?"Ver menos":"Ver los "+l.length+" seguimientos")+'</button></div>';
  return h+'</div>';
}
function bindSeguimientos(v){
  const l=seguimientosPendientes();
  v.querySelectorAll("[data-seg-env]").forEach(a=>a.addEventListener("click",()=>{
    const x=l[+a.dataset.segEnv];if(!x)return;
    // El enlace abre WhatsApp; aquí solo se registra (sin bloquear la apertura).
    setTimeout(async()=>{
      const ok=await guardar(()=>api.registrarSeguimiento({clienteId:x.cliente.id,cotizacionId:x.cot&&x.cot.id,regla:x.regla,clave:x.clave,resultado:"enviado",mensaje:x.mensaje}));
      if(ok){
        await api.agregarHistorial(x.cliente.id,"WhatsApp","Seguimiento enviado ("+REGLAS_SEG.find(r=>r.k===x.regla).l.toLowerCase()+"): "+x.mensaje);
        await guardar(()=>api.actualizarCliente(x.cliente.id,{ultimoContacto:new Date().toISOString()}));
        toast("Seguimiento registrado en el historial de "+x.cliente.nombre);
      }
    },0);
  }));
  v.querySelectorAll("[data-seg-omit]").forEach(b=>b.onclick=async()=>{
    const x=l[+b.dataset.segOmit];if(!x)return;
    if(await guardar(()=>api.registrarSeguimiento({clienteId:x.cliente.id,cotizacionId:x.cot&&x.cot.id,regla:x.regla,clave:x.clave,resultado:"omitido",mensaje:""})))toast("Seguimiento omitido");
  });
  v.querySelectorAll("[data-seg-ver]").forEach(b=>b.onclick=()=>{const x=l[+b.dataset.segVer];if(x)abrirDetalle(x.cliente.id);});
  const t=v.querySelector("[data-seg-todos]");if(t)t.onclick=()=>{S.segTodos=!S.segTodos;render();};
}
function editorSeguimientosHTML(){
  if(S.faltaActualizacion)return '<div class="panel panel-pad"><h2>Mensajes de seguimiento</h2><p class="muted" style="margin:0">Disponible después de ejecutar la actualización 2 de la base de datos.</p></div>';
  return '<div class="panel panel-pad" style="display:flex;flex-direction:column;gap:14px"><h2>Mensajes de seguimiento</h2>'+
    '<p class="help" style="margin:0">El CRM arma cada día la lista "Seguimientos de hoy" con estas reglas. Puedes usar: {nombre}, {nombre_completo}, {asesor}, {destino}, {cotizacion}, {fecha_ida}, {fecha_regreso}, {dias}.</p>'+
    REGLAS_SEG.map(r=>{const c=cfgSeg(r.k);return '<div class="opt-card"><div class="opt-head"><b>'+esc(r.l)+'</b><label class="check"><input type="checkbox" data-sg-act="'+r.k+'"'+(c.activa?" checked":"")+'> Activa</label></div>'+
      '<div class="field"><label for="sgd_'+r.k+'">Cuándo (en '+esc(r.ayudaDias)+')</label><input class="input num" style="max-width:120px" id="sgd_'+r.k+'" type="number" min="0" max="365" inputmode="numeric" data-sg-dias="'+r.k+'" value="'+c.dias+'"></div>'+
      '<div class="field"><label for="sgt_'+r.k+'">Mensaje</label><textarea class="input" id="sgt_'+r.k+'" maxlength="1500" data-sg-txt="'+r.k+'">'+esc(c.texto)+'</textarea></div>'+
      '<div><button type="button" class="btn btn-sm btn-ghost" data-sg-reset="'+r.k+'">Restaurar texto original</button></div></div>';}).join("")+
    '<div><button type="button" class="btn btn-gold" id="sgGuardar">Guardar mensajes de seguimiento</button></div></div>';
}
function bindEditorSeguimientos(v){
  v.querySelectorAll("[data-sg-reset]").forEach(b=>b.onclick=()=>{const r=REGLAS_SEG.find(x=>x.k===b.dataset.sgReset);const t=v.querySelector('[data-sg-txt="'+r.k+'"]');if(t)t.value=r.texto;});
  const g=v.querySelector("#sgGuardar");
  if(g)g.onclick=async()=>{
    const val={};
    for(const r of REGLAS_SEG){
      const d=parseInt(v.querySelector('[data-sg-dias="'+r.k+'"]').value,10);
      const t=v.querySelector('[data-sg-txt="'+r.k+'"]').value.trim();
      if(!Number.isInteger(d)||d<0||d>365){toast("Revisa los días de “"+r.l+"”: debe ser un número entre 0 y 365.");return;}
      if(!t){toast("Escribe el mensaje de “"+r.l+"”.");return;}
      val[r.k]={activa:v.querySelector('[data-sg-act="'+r.k+'"]').checked,dias:d,texto:t};
    }
    if(await guardar(()=>api.guardarConfig("seguimientos",val))){S.config.seguimientos=val;toast("Mensajes de seguimiento guardados");render();}
  };
}

/* ----- Plantillas de cotización ----- */
const SIN_PLANTILLA_VIAJE=["fechaIda","fechaRegreso","adultos","ninos","edadesNinos","infantes"];
function tieneContenido(e){
  const v=e.viaje||{};
  return !!(String(v.destinos||"").trim()||String(v.hotel||"").trim()||(e.servicios||[]).some(x=>String(x.descripcion||"").trim())||(e.valores.opciones||[]).some(o=>String(o.nombre||"").trim()));
}
function datosDePlantilla(e){
  const v=clone(e.viaje||{});SIN_PLANTILLA_VIAJE.forEach(k=>delete v[k]);
  v.tramos=(v.tramos||[]).filter(t=>["ruta","vuelo","salida","llegada"].some(k=>String(t[k]||"").trim())).map(t=>Object.assign({},t,{fecha:""}));
  const c=clone(e.condiciones||{});delete c.fechaLimitePago;
  const val=e.valores||{};
  return {viaje:v,servicios:clone((e.servicios||[]).filter(x=>String(x.descripcion||"").trim())),observacionesPaquete:e.observacionesPaquete||"",condiciones:c,
    valores:{moneda:val.moneda||"COP",opciones:(val.opciones||[]).map(o=>({nombre:o.nombre||"",detalle:o.detalle||"",precioAdulto:null,precioNino:null,precioInfante:null})),
      cargos:clone((val.cargos||[]).filter(x=>String(x.concepto||"").trim()||typeof x.valor==="number")),descuentos:clone((val.descuentos||[]).filter(x=>String(x.concepto||"").trim()||typeof x.valor==="number")),mostrarPorPersona:!!val.mostrarPorPersona}};
}
function aplicarPlantilla(pl){
  const d=pl.datos||{},base=cotVacia();
  const conservar={};SIN_PLANTILLA_VIAJE.forEach(k=>{conservar[k]=E.viaje[k];});
  E.viaje=Object.assign(clone(base.viaje),clone(d.viaje||{}),conservar);
  if(!Array.isArray(E.viaje.tramos))E.viaje.tramos=[];
  E.servicios=clone(d.servicios||[]);
  E.observacionesPaquete=d.observacionesPaquete||"";
  E.condiciones=Object.assign(clone(base.condiciones),clone(d.condiciones||{}),{fechaLimitePago:E.condiciones.fechaLimitePago||""});
  const dv=d.valores||{};
  E.valores=Object.assign({},E.valores,{moneda:dv.moneda||"COP",opciones:(dv.opciones&&dv.opciones.length?dv.opciones:[opcionVacia()]).map(o=>Object.assign(opcionVacia(),{nombre:o.nombre||"",detalle:o.detalle||""})),
    cargos:clone(dv.cargos||[]),descuentos:clone(dv.descuentos||[]),mostrarPorPersona:!!dv.mostrarPorPersona});
  delete E.valores.opcionElegida;
  E.plantillaId=pl.id;
  const n=D.diasEntre(E.viaje.fechaIda,E.viaje.fechaRegreso);
  if(n!=null&&n>=0)E.viaje.noches=n;
  edNochesManual=false;
}
function plantillaSelectorHTML(){
  if(S.faltaActualizacion)return "";
  if(!S.plantillas.length)return '<div class="banner info" style="font-size:13.5px">Consejo: cuando termines una cotización de un destino frecuente, toca <b>Guardar como plantilla</b> (arriba). La próxima vez la cargas con un toque.</div>';
  const lista=S.plantillas.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre,"es"));
  return '<div class="tpl-box"><label for="plSel" class="label">Empezar desde una plantilla</label><div class="tpl-row">'+
    '<select class="input" id="plSel"><option value="">Elige una plantilla…</option>'+lista.map(p=>'<option value="'+esc(p.id)+'"'+(E.plantillaId===p.id?" selected":"")+'>'+esc(p.nombre)+'</option>').join("")+'</select>'+
    '<button type="button" class="btn btn-gold" data-ed="usar-plantilla">Usar</button></div>'+
    '<span class="help">Llena destino, vuelos, hotel, servicios, condiciones y nombres de las opciones. Tú completas cliente, fechas, pasajeros y precios.</span></div>';
}
async function dialogoGuardarPlantilla(){
  if(S.faltaActualizacion){toast("Falta ejecutar la actualización 2 de la base de datos para usar plantillas.");return;}
  const datos=datosDePlantilla(E);
  if(!String(datos.viaje.destinos||"").trim()&&!datos.servicios.length){toast("Escribe al menos el destino o los servicios antes de guardar la plantilla.");return;}
  const actual=E.plantillaId&&S.plantillas.find(x=>x.id===E.plantillaId);
  const sugerido=actual?actual.nombre:[E.viaje.destinos,E.viaje.noches?E.viaje.noches+" noches":""].filter(Boolean).join(" ");
  const s=openOverlay('<div class="sheet-head"><h2>Guardar como plantilla</h2></div><div class="sheet-body">'+
    '<p class="muted" style="margin:0">Se guardan el destino, los vuelos (sin fechas), el hotel, los servicios, las observaciones, las condiciones, los cargos y los nombres de las opciones de precio. <b>No</b> se guardan el cliente, las fechas, los pasajeros ni los precios por pasajero.</p>'+
    '<div class="field"><label for="plNom">Nombre de la plantilla</label><input class="input" id="plNom" maxlength="120" value="'+esc(sugerido)+'" placeholder="Ej.: San Andrés 4 noches"></div>'+
    (actual?'<label class="check"><input type="radio" name="plModo" value="actualizar" checked> Actualizar la plantilla “'+esc(actual.nombre)+'”</label><label class="check"><input type="radio" name="plModo" value="nueva"> Guardar como plantilla nueva</label>':'')+
    '<div class="err" id="plErr" role="alert"></div>'+
    '<div class="sheet-foot"><button class="btn" id="plNo">Cancelar</button><button class="btn btn-gold" id="plSi">Guardar plantilla</button></div></div>',"confirm","plantilla");
  s.querySelector("#plNo").onclick=()=>closeOverlay("plantilla");
  s.querySelector("#plSi").onclick=async()=>{
    const nombre=s.querySelector("#plNom").value.trim();const err=s.querySelector("#plErr");
    if(!nombre){err.textContent="Escribe un nombre para la plantilla.";return;}
    const modo=actual&&s.querySelector('input[name="plModo"]:checked').value==="actualizar"?"actualizar":"nueva";
    const otra=S.plantillas.find(p=>p.nombre.trim().toLowerCase()===nombre.toLowerCase()&&(!actual||modo==="nueva"||p.id!==actual.id));
    if(otra){err.textContent="Ya existe una plantilla con ese nombre. Elige otro nombre o actualiza la existente desde la cotización que la usa.";return;}
    s.querySelector("#plSi").disabled=true;
    const res=modo==="actualizar"?await guardar(()=>api.actualizarPlantilla(actual.id,{nombre:nombre,datos:datos})):await guardar(()=>api.crearPlantilla(nombre,datos));
    s.querySelector("#plSi").disabled=false;
    if(res){E.plantillaId=res.id;closeOverlay("plantilla");toast(modo==="actualizar"?"Plantilla actualizada":"Plantilla guardada: "+nombre);if(edTab==="cliente")pintarEditor();}
  };
  setTimeout(()=>{const n=s.querySelector("#plNom");if(n){n.focus();n.select();}},50);
}
function abrirPlantillas(){
  const lista=S.plantillas.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre,"es"));
  const puedeBorrar=p=>S.isAdmin||p.creadoPor===S.meId;
  const s=openOverlay('<div class="sheet-head"><h2>Plantillas de cotización</h2><button class="btn btn-ghost btn-sm" id="tpClose">Cerrar</button></div><div class="sheet-body">'+
    (S.faltaActualizacion?'<div class="banner warn">Para usar plantillas falta ejecutar la actualización 2 de la base de datos en Supabase.</div>':
    (lista.length?'<div class="panel">'+lista.map(p=>{const v=(p.datos||{}).viaje||{},ops=((p.datos||{}).valores||{}).opciones||[];
      return '<div class="eq-row"><div class="eq-who"><b>'+esc(p.nombre)+'</b><span class="help">'+esc([v.destinos,v.hotel,ops.length>1?ops.length+" opciones de precio":""].filter(Boolean).join(" · ")||"Sin destino")+'</span><span class="help">Actualizada '+fmtFechaTs(p.actualizadoEn)+'</span></div>'+
        '<div class="eq-actions"><button class="btn btn-sm btn-gold" data-tp-usar="'+esc(p.id)+'">Usar</button>'+(puedeBorrar(p)?'<button class="btn btn-sm" data-tp-del="'+esc(p.id)+'">Eliminar</button>':'')+'</div></div>';}).join("")+'</div>':
      '<div class="panel empty"><p class="muted">Aún no hay plantillas. Abre o crea una cotización y toca <b>Guardar como plantilla</b>.</p></div>'))+
    '<p class="help" style="margin:0">Para editar una plantilla: tócale <b>Usar</b>, haz los cambios y vuelve a tocar <b>Guardar como plantilla → Actualizar</b>.</p></div>',"","plantillas");
  s.querySelector("#tpClose").onclick=()=>closeOverlay("plantillas");
  s.querySelectorAll("[data-tp-usar]").forEach(b=>b.onclick=()=>{closeOverlay("plantillas");abrirEditor(null,{plantillaId:b.dataset.tpUsar});});
  s.querySelectorAll("[data-tp-del]").forEach(b=>b.onclick=async()=>{
    const p=S.plantillas.find(x=>x.id===b.dataset.tpDel);if(!p)return;
    if(!(await confirmar("¿Eliminar la plantilla “"+p.nombre+"”?","Las cotizaciones hechas con ella no cambian.","Eliminar",true)))return;
    if(await guardar(()=>api.borrarPlantilla(p.id))){toast("Plantilla eliminada");abrirPlantillas();}
  });
}

const CAMPOS_COND=["politicaAnticipo","politicaCancelacion","equipaje","disponibilidad","noIncluidos","adicionales"];
async function cargarCondiciones(){
  await cargarConfig();
  const d=S.config.condiciones;
  if(!d){toast(S.isAdmin?"Aún no hay condiciones guardadas. Escríbelas y toca “Guardar como predeterminadas”.":"El administrador aún no ha guardado condiciones predeterminadas.");return;}
  const llenos=CAMPOS_COND.some(k=>String(E.condiciones[k]||"").trim());
  if(llenos&&!(await confirmar("¿Reemplazar las condiciones?","Los textos que ya escribiste en esta cotización se reemplazarán por las condiciones guardadas.","Reemplazar")))return;
  CAMPOS_COND.forEach(k=>{E.condiciones[k]=typeof d[k]==="string"?d[k]:"";});
  pintarEditor();toast("Condiciones cargadas");
}
async function guardarCondiciones(){
  if(!S.isAdmin){toast("Solo el administrador puede cambiar las condiciones predeterminadas.");return;}
  const d={};CAMPOS_COND.forEach(k=>{d[k]=String(E.condiciones[k]||"");});
  if(!CAMPOS_COND.some(k=>d[k].trim())){toast("Escribe al menos una condición antes de guardarla.");return;}
  if(!(await confirmar("¿Guardar como predeterminadas?","Estos textos quedarán disponibles para todas las cotizaciones nuevas con el botón “Usar condiciones guardadas”. La fecha límite de pago no se guarda.","Guardar")))return;
  if(await guardar(()=>api.guardarConfig("condiciones",d))){S.config.condiciones=d;toast("Condiciones guardadas como predeterminadas");}
}
function cuerpoCot(e){
  const b=clone(e);delete b.id;
  const limpiarNum=o=>{Object.keys(o).forEach(k=>{if(typeof o[k]==="number"&&!isFinite(o[k]))o[k]=null;else if(o[k]&&typeof o[k]==="object")limpiarNum(o[k]);});};
  limpiarNum(b);
  b.servicios=(b.servicios||[]).filter(x=>String(x.descripcion||"").trim());
  b.viaje.tramos=(b.viaje.tramos||[]).filter(t=>["fecha","ruta","vuelo","salida","llegada"].some(k=>String(t[k]||"").trim()));
  delete b.valores.precioAdulto;delete b.valores.precioNino;delete b.valores.precioInfante;
  delete b.plantillaId;
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
    const dup=await api.buscarDuplicado(E.cliente.telefono,E.cliente.email);
    if(dup){
      if(!dup.visible){edErrores=[{tab:"cliente",campo:"c_tel",msg:"Ya existe un cliente con ese teléfono o correo ("+dup.nombre+"), asignado a "+dup.asesor+". Pide al administrador que te lo asigne."}];edTab="cliente";pintarEditor(true);return;}
      const ans=await confirmar("Este cliente ya existe",dup.nombre+" ya está registrado con ese teléfono o correo.\n¿Quieres vincular la cotización a ese cliente para no duplicarlo?","Usar cliente existente",false,"Es otra persona");
      if(ans===false)return;
      if(ans===true){const c=S.clientes.find(x=>x.id===dup.id);if(c)vincularCliente(c);else{E.clienteId=dup.id;edNuevoCli=false;}}
    }
  }
  edGuardando=true;pintarEditor();
  const fin=ok=>{edGuardando=false;if(hayCapa("editor"))pintarEditor();return ok;};
  const ahora=new Date().toISOString();
  if(!E.clienteId){
    const row=await guardar(()=>api.crearCliente({nombre:E.cliente.nombre.trim(),telefono:E.cliente.telefono.trim(),email:(E.cliente.email||"").trim(),origen:"Otro",
      destinos:E.viaje.destinos||"",fechaViaje:E.viaje.fechaIda||null,adultos:D.enteroONulo(E.viaje.adultos),ninos:D.enteroONulo(E.viaje.ninos),etapa:"nuevo",asesorId:S.meId}));
    if(!row)return fin(false);
    await api.agregarHistorial(row.id,"Registro","Cliente registrado desde una cotización.");
    E.clienteId=row.id;edNuevoCli=false;
  }
  const nuevo=!E.id;
  const body=cuerpoCot(E);
  if(nuevo){body.estado="borrador";body.historialEstados=[{estado:"borrador",fecha:ahora,autor:S.meId}];}
  const saved=await guardar(()=>api.guardarCotizacion(body,E.id));
  if(!saved)return fin(false);
  E.id=saved.id;E.numero=saved.numero;E.estado=saved.estado;E.historialEstados=saved.historialEstados;E.actualizadoEn=saved.actualizadoEn;
  edBase=JSON.stringify(E);
  if(nuevo)await api.agregarHistorial(E.clienteId,"Cotización","Cotización "+D.codigo(saved.numero)+" creada"+(E.viaje.destinos?" para "+E.viaje.destinos:"")+".");
  fin(true);
  if(modo==="pdf"){closeOverlay("editor");E=null;abrirCotizacion(saved.id);abrirVistaPrevia(saved,{guardada:true});}
  else toast("Borrador guardado: "+D.codigo(saved.numero));
}

/* ---------- Datos de prueba (solo administrador) ---------- */
async function cargarDemo(){
  if(!S.isAdmin){toast("Solo el administrador puede cargar datos de prueba.");return;}
  const ahora=Date.now(),iso=t=>new Date(t).toISOString();
  const enDias=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());};
  const base=o=>Object.assign({email:"",ciudad:"Cúcuta",ejemplo:true,asesorId:S.meId,intereses:[],preferencias:""},o);
  const demos=[
    [base({nombre:"Laura Méndez (prueba)",telefono:"300 000 0001",origen:"Instagram",destinos:"San Andrés",tipoViaje:"Nacional",fechaViaje:enDias(45),adultos:2,ninos:1,presupuesto:6800000,intereses:["Playa","Familiar"],preferencias:"Hotel todo incluido, vuelo directo desde Cúcuta si es posible.",etapa:"cotizado",creadoEn:iso(ahora-12*864e5),ultimoContacto:iso(ahora-9*864e5)}),
      [["Registro","Cliente registrado en el CRM.",12],["WhatsApp","Se envió cotización de 5 noches todo incluido.",9]]],
    [base({nombre:"Andrés Rojas (prueba)",telefono:"300 000 0002",origen:"WhatsApp",destinos:"Cancún y Riviera Maya",tipoViaje:"Internacional",fechaViaje:enDias(90),adultos:2,ninos:0,presupuesto:14500000,intereses:["Luna de miel","Playa"],preferencias:"Viaje de luna de miel. Prefiere hotel solo adultos.",etapa:"negociacion",creadoEn:iso(ahora-5*864e5),ultimoContacto:iso(ahora-2*864e5)}),
      [["Registro","Cliente registrado en el CRM.",5],["Llamada","Pide comparar dos hoteles antes de decidir.",2]]],
    [base({nombre:"Familia Pabón (prueba)",telefono:"300 000 0003",origen:"Referido",destinos:"Eje Cafetero",tipoViaje:"Nacional",fechaViaje:enDias(20),adultos:4,ninos:2,presupuesto:9200000,intereses:["Cultura","Familiar"],etapa:"nuevo",creadoEn:iso(ahora-1*864e5),ultimoContacto:null}),
      [["Registro","Cliente registrado en el CRM.",1]]]
  ];
  for(const [c,hs] of demos){
    const row=await guardar(()=>api.crearCliente(c));if(!row)return;
    for(const [tipo,texto,dias] of hs)await api.agregarHistorial(row.id,tipo,texto,iso(ahora-dias*864e5));
  }
  toast("Se cargaron 3 clientes de prueba");
}
async function borrarDemo(){
  if(!S.isAdmin)return;
  const demos=S.clientes.filter(c=>c.ejemplo);
  const ids=new Set(demos.map(c=>c.id));
  const dq=S.cotizaciones.filter(q=>q.ejemplo||ids.has(q.clienteId));
  if(!demos.length&&!dq.length)return;
  if(!(await confirmar("¿Eliminar datos de prueba?","Se borrarán "+demos.length+" clientes marcados como PRUEBA"+(dq.length?" y "+dq.length+" cotizaciones asociadas a ellos":"")+". Tus clientes reales no se tocan.","Eliminar",true)))return;
  for(const q of dq){if(!(await guardar(()=>api.borrarCotizacion(q.id))))return;}
  for(const c of demos){if(!(await guardar(()=>api.borrarCliente(c.id))))return;}
  toast("Datos de prueba eliminados");
}

/* ---------- Respaldo ---------- */
function sello(){const d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
function descargar(nombre,data){
  const tipo=/\.json$/.test(nombre)?"application/json":"text/csv;charset=utf-8";
  descargarArchivo(nombre,new Blob([data],{type:tipo}));
  toast("Descargado: "+nombre+". Guárdalo en Archivos.");
}
async function exportarJSON(){
  let hist=[];
  try{hist=await todas("historial","fecha");}catch(e){toast(explicarError(e));return;}
  const porCliente={};hist.forEach(h=>{(porCliente[h.cliente_id]=porCliente[h.cliente_id]||[]).push({id:h.id,fecha:h.fecha,tipo:h.tipo,texto:h.texto,autor:h.autor});});
  const data={sistema:"Diamond Travel CRM",version:3,formato:"web",exportadoEn:new Date().toISOString(),exportadoPor:(S.perfil||{}).email||"",
    clientes:S.clientes.map(c=>Object.assign({},c,{historial:porCliente[c.id]||[]})),cotizaciones:S.cotizaciones.map(q=>Object.assign({},q)),plantillas:S.plantillas.map(p=>Object.assign({},p))};
  descargar("diamond-travel-respaldo-"+sello()+".json",JSON.stringify(data,null,2));
}
const celdaCSV=v=>{v=v==null?"":String(v);return /[";\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
function exportarCSV(){
  const cols=[["Nombre","nombre"],["WhatsApp","telefono"],["Correo","email"],["Ciudad","ciudad"],["Origen","origen"],["Destinos","destinos"],["Tipo","tipoViaje"],["Fecha viaje",c=>c.fechaViaje?fmtFecha(c.fechaViaje):""],["Adultos","adultos"],["Niños","ninos"],["Presupuesto COP","presupuesto"],["Etapa",c=>etapaLabel(c.etapa)],["Intereses",c=>(c.intereses||[]).join(", ")],["Preferencias","preferencias"],["Asesor(a)",c=>nombrePersona(c.asesorId).replace(" (tú)","")],["Registrado",c=>fmtFechaTs(c.creadoEn)],["Último contacto",c=>c.ultimoContacto?fmtFechaTs(c.ultimoContacto):""]];
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
const esUUID=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
// Mismo identificador antiguo → mismo UUID siempre (así restaurar dos veces no duplica).
async function uuidDesde(texto){
  const h=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode("diamond-travel-crm:"+texto)));
  h[6]=(h[6]&0x0f)|0x50;h[8]=(h[8]&0x3f)|0x80;
  const x=[...h.slice(0,16)].map(b=>b.toString(16).padStart(2,"0")).join("");
  return x.slice(0,8)+"-"+x.slice(8,12)+"-"+x.slice(12,16)+"-"+x.slice(16,20)+"-"+x.slice(20,32);
}
const nuevoUUID=()=>(window.crypto&&crypto.randomUUID)?crypto.randomUUID():"10000000-1000-4000-8000-100000000000".replace(/[018]/g,c=>(c^Math.random()*16>>c/4).toString(16));
function setImp(html){S.impEstado=html;const m=document.getElementById("impMsg");if(m)m.innerHTML=html;}
function importar(input){
  const msg={set innerHTML(h){setImp(h);}}; // el mensaje sobrevive a los redibujos de la pantalla
  const f=input.files&&input.files[0]; if(!f)return;
  const rd=new FileReader();
  rd.onload=async()=>{
    let data;
    try{data=JSON.parse(rd.result);}catch(_){msg.innerHTML='<p class="err">El archivo no es un respaldo válido (JSON dañado).</p>';return;}
    if(!data||data.sistema!=="Diamond Travel CRM"||!Array.isArray(data.clientes)){msg.innerHTML='<p class="err">Este archivo no es un respaldo de Diamond Travel CRM.</p>';return;}
    const cs=data.clientes.filter(c=>c&&typeof c.id==="string"&&typeof c.nombre==="string"&&c.nombre.trim());
    const qs=(Array.isArray(data.cotizaciones)?data.cotizaciones:[]).filter(q=>q&&typeof q.id==="string"&&q.cliente&&typeof q.cliente==="object");
    const origen=data.formato==="web"?"de la versión web":"de la versión dentro de Claude";
    if(!(await confirmar("¿Restaurar el respaldo?","Respaldo "+origen+" del "+fmtFechaHora(data.exportadoEn)+": "+cs.length+" clientes y "+qs.length+" cotizaciones.\nLos registros que ya existen se actualizarán con la versión del archivo; no se borra nada.","Restaurar")))return;
    msg.innerHTML='<p class="help">Restaurando… no cierres esta pantalla.</p>';
    const equipoIds=new Set(S.equipo.map(p=>p.id));
    const asesorValido=id=>esUUID(id)&&equipoIds.has(id)?id:S.meId;
    const existentes=new Set(S.clientes.map(c=>c.id));
    const mapa={};for(const c of cs)mapa[c.id]=esUUID(c.id)?c.id:await uuidDesde("cliente:"+c.id);
    const qids={};for(const q of qs)qids[q.id]=esUUID(q.id)?q.id:await uuidDesde("cotizacion:"+q.id);
    // Clientes
    const filas=cs.map(c=>Object.assign(aFilaCliente(Object.assign({},c,{asesorId:asesorValido(c.asesorId)})),{id:mapa[c.id],creado_en:c.creadoEn||new Date().toISOString(),ejemplo:!!c.ejemplo}));
    for(let i=0;i<filas.length;i+=200){
      const r=await S.sb.from("clientes").upsert(filas.slice(i,i+200),{onConflict:"id"});
      if(r.error){msg.innerHTML='<p class="err">Se detuvo al restaurar clientes: '+esc(explicarError(r.error))+'</p>';return;}
    }
    // Historial: solo de clientes que no existían (o entradas con identificador propio) para no duplicar
    const hfilas=[];
    cs.forEach(c=>(c.historial||[]).forEach(h=>{
      if(!h||!h.texto)return;
      if(existentes.has(mapa[c.id])&&!esUUID(h.id))return;
      const fila={cliente_id:mapa[c.id],fecha:h.fecha||new Date().toISOString(),tipo:String(h.tipo||"Nota"),texto:String(h.texto).slice(0,4000),autor:esUUID(h.autor)&&equipoIds.has(h.autor)?h.autor:null};
      if(esUUID(h.id))fila.id=h.id;
      hfilas.push(fila);
    }));
    for(let i=0;i<hfilas.length;i+=300){
      const lote=hfilas.slice(i,i+300);
      const conId=lote.filter(h=>h.id),sinId=lote.filter(h=>!h.id);
      const r1=conId.length?await S.sb.from("historial").upsert(conId,{onConflict:"id",ignoreDuplicates:true}):{};
      const r2=sinId.length?await S.sb.from("historial").insert(sinId):{};
      const e=r1.error||r2.error;if(e){msg.innerHTML='<p class="err">Se detuvo al restaurar el historial: '+esc(explicarError(e))+'</p>';return;}
    }
    // Cotizaciones (se respeta su número)
    const porNumero={};S.cotizaciones.forEach(q=>{porNumero[q.numero]=q.id;});
    const qfilas=qs.map(q=>{
      const id=porNumero[q.numero]||qids[q.id];
      const f=aFilaCot(Object.assign({},q,{clienteId:q.clienteId&&mapa[q.clienteId]?mapa[q.clienteId]:null}));
      return Object.assign(f,{id:id,numero:Number.isInteger(q.numero)?q.numero:undefined,asesor_id:asesorValido(q.asesorId),creado_en:q.creadoEn||new Date().toISOString()});
    });
    for(let i=0;i<qfilas.length;i+=200){
      const r=await S.sb.from("cotizaciones").upsert(qfilas.slice(i,i+200),{onConflict:"id"});
      if(r.error){msg.innerHTML='<p class="err">Se detuvo al restaurar cotizaciones: '+esc(explicarError(r.error))+'</p>';return;}
    }
    const ps=(Array.isArray(data.plantillas)?data.plantillas:[]).filter(p=>p&&esUUID(p.id)&&typeof p.nombre==="string"&&p.nombre.trim());
    if(ps.length&&!S.faltaActualizacion){
      const r=await S.sb.from("plantillas").upsert(ps.map(p=>({id:p.id,nombre:p.nombre,datos:p.datos||{}})),{onConflict:"id"});
      if(r.error)console.error(r.error);
    }
    try{await S.sb.rpc("ajustar_consecutivo");}catch(_){}
    await recargarTodo();
    msg.innerHTML='<p class="ok-msg">Listo: '+cs.length+' clientes y '+qs.length+' cotizaciones restaurados. Compara estos números con los del respaldo.</p>';
    toast("Respaldo restaurado");input.value="";
  };
  rd.readAsText(f);
}

/* =====================================================================
   DATOS (Supabase)
   ===================================================================== */
const CLI_MAP={nombre:"nombre",telefono:"telefono",email:"email",ciudad:"ciudad",origen:"origen",destinos:"destinos",tipoViaje:"tipo_viaje",fechaViaje:"fecha_viaje",
  adultos:"adultos",ninos:"ninos",presupuesto:"presupuesto",intereses:"intereses",preferencias:"preferencias",etapa:"etapa",asesorId:"asesor_id",
  ultimoContacto:"ultimo_contacto",cerradoEn:"cerrado_en",ejemplo:"ejemplo",creadoEn:"creado_en"};
const TEXTOS_CLI=["telefono","email","ciudad","origen","destinos","tipoViaje","preferencias"];
function aFilaCliente(o){
  const r={};
  Object.keys(CLI_MAP).forEach(k=>{
    if(o[k]===undefined)return;
    let v=o[k];
    if(TEXTOS_CLI.includes(k))v=v==null?"":String(v);
    if((k==="fechaViaje"||k==="ultimoContacto"||k==="cerradoEn")&&!v)v=null;
    if(k==="intereses")v=Array.isArray(v)?v:[];
    r[CLI_MAP[k]]=v;
  });
  return r;
}
function deFilaCliente(r){
  return {id:r.id,nombre:r.nombre,telefono:r.telefono||"",email:r.email||"",ciudad:r.ciudad||"",origen:r.origen||"",destinos:r.destinos||"",tipoViaje:r.tipo_viaje||"",
    fechaViaje:r.fecha_viaje||null,adultos:r.adultos,ninos:r.ninos,presupuesto:r.presupuesto==null?null:Number(r.presupuesto),intereses:r.intereses||[],preferencias:r.preferencias||"",
    etapa:r.etapa,asesorId:r.asesor_id,creadoPor:r.creado_por,creadoEn:r.creado_en,actualizadoEn:r.actualizado_en,ultimoContacto:r.ultimo_contacto,cerradoEn:r.cerrado_en,ejemplo:!!r.ejemplo};
}
const DATOS_COT=["cliente","viaje","servicios","observacionesPaquete","valores","condiciones","asesorNombre","duplicadaDe"];
function aFilaCot(q){
  const d={};DATOS_COT.forEach(k=>{if(q[k]!==undefined)d[k]=q[k];});
  const r=D.calcular(q);
  return {estado:q.estado||"borrador",cliente_id:q.clienteId||null,fecha_elaboracion:q.fechaElaboracion||hoyISO(),fecha_vencimiento:q.fechaVencimiento||null,
    moneda:((q.valores||{}).moneda)||"COP",total:r.completo?Math.round(r.total):null,datos:d,historial_estados:q.historialEstados||[],ejemplo:!!q.ejemplo};
}
function deFilaCot(r){
  return Object.assign({},r.datos||{},{id:r.id,numero:Number(r.numero),estado:r.estado,clienteId:r.cliente_id,asesorId:r.asesor_id,fechaElaboracion:r.fecha_elaboracion,
    fechaVencimiento:r.fecha_vencimiento||"",historialEstados:r.historial_estados||[],ejemplo:!!r.ejemplo,creadoPor:r.creado_por,creadoEn:r.creado_en,actualizadoEn:r.actualizado_en});
}
function ponerLocal(lista,obj){
  const arr=S[lista],i=arr.findIndex(x=>x.id===obj.id);
  if(i>=0)arr[i]=obj;else arr.unshift(obj);
  refrescarTodo();
}
function quitarLocal(lista,id){S[lista]=S[lista].filter(x=>x.id!==id);refrescarTodo();}
const sinPermiso={code:"42501",message:"permission denied"};
const api={
  async crearCliente(o){const r=await S.sb.from("clientes").insert(aFilaCliente(o)).select().single();if(r.error)return r;const c=deFilaCliente(r.data);ponerLocal("clientes",c);return {data:c};},
  async actualizarCliente(id,patch){const r=await S.sb.from("clientes").update(aFilaCliente(patch)).eq("id",id).select();if(r.error)return r;if(!r.data.length)return {error:sinPermiso};const c=deFilaCliente(r.data[0]);ponerLocal("clientes",c);return {data:c};},
  async borrarCliente(id){const r=await S.sb.from("clientes").delete().eq("id",id).select("id");if(r.error)return r;if(!r.data.length)return {error:sinPermiso};delete S.hist[id];quitarLocal("clientes",id);return {data:true};},
  async agregarHistorial(clienteId,tipo,texto,fecha){
    const fila={cliente_id:clienteId,tipo:tipo,texto:String(texto).slice(0,4000),autor:S.meId};if(fecha)fila.fecha=fecha;
    const r=await S.sb.from("historial").insert(fila).select().single();
    if(r.error){console.error(r.error);return r;}
    if(S.hist[clienteId]){S.hist[clienteId]=[{id:r.data.id,fecha:r.data.fecha,tipo:r.data.tipo,texto:r.data.texto,autor:r.data.autor}].concat(S.hist[clienteId].filter(h=>h.id!==r.data.id));if(detalleId===clienteId)refrescarCapa("detalle",pintarDetalle);}
    return {data:r.data};
  },
  async guardarCotizacion(q,id){
    const fila=aFilaCot(q);
    const r=id?await S.sb.from("cotizaciones").update(fila).eq("id",id).select():await S.sb.from("cotizaciones").insert(Object.assign(fila,{asesor_id:S.meId})).select();
    if(r.error)return r;if(!r.data.length)return {error:sinPermiso};
    const c=deFilaCot(r.data[0]);ponerLocal("cotizaciones",c);return {data:c};
  },
  async actualizarCotizacion(id,o){
    const f={};if(o.estado)f.estado=o.estado;if(o.historialEstados)f.historial_estados=o.historialEstados;
    if(o.cotizacion){const fc=aFilaCot(o.cotizacion);f.datos=fc.datos;f.total=fc.total;}
    const r=await S.sb.from("cotizaciones").update(f).eq("id",id).select();if(r.error)return r;if(!r.data.length)return {error:sinPermiso};
    const c=deFilaCot(r.data[0]);ponerLocal("cotizaciones",c);return {data:c};
  },
  async borrarCotizacion(id){const r=await S.sb.from("cotizaciones").delete().eq("id",id).select("id");if(r.error)return r;if(!r.data.length)return {error:sinPermiso};quitarLocal("cotizaciones",id);return {data:true};},
  async crearPlantilla(nombre,datos){const r=await S.sb.from("plantillas").insert({nombre:nombre,datos:datos,creado_por:S.meId}).select().single();if(r.error)return r;const p=deFilaPlantilla(r.data);ponerPlantilla(p);return {data:p};},
  async actualizarPlantilla(id,o){const r=await S.sb.from("plantillas").update({nombre:o.nombre,datos:o.datos}).eq("id",id).select();if(r.error)return r;if(!r.data.length)return {error:sinPermiso};const p=deFilaPlantilla(r.data[0]);ponerPlantilla(p);return {data:p};},
  async borrarPlantilla(id){const r=await S.sb.from("plantillas").delete().eq("id",id).select("id");if(r.error)return r;if(!r.data.length)return {error:sinPermiso};S.plantillas=S.plantillas.filter(x=>x.id!==id);refrescarTodo();return {data:true};},
  async registrarSeguimiento(o){
    const r=await S.sb.from("seguimientos").insert({cliente_id:o.clienteId,cotizacion_id:o.cotizacionId||null,regla:o.regla,clave:o.clave,resultado:o.resultado,mensaje:String(o.mensaje||"").slice(0,4000),autor:S.meId}).select().single();
    if(r.error){if(r.error.code==="23505"){S.segs.push({clave:o.clave});refrescarTodo();return {data:true};}return r;}
    S.segs.unshift(deFilaSeg(r.data));refrescarTodo();return {data:true};
  },
  async guardarConfig(clave,valor){return await S.sb.from("config").upsert({clave:clave,valor:valor,actualizado_por:S.meId,actualizado_en:new Date().toISOString()},{onConflict:"clave"});},
  async buscarDuplicado(tel,email){
    if(String(tel||"").replace(/\D/g,"").length<7&&!String(email||"").trim())return null;
    const r=await S.sb.rpc("buscar_duplicado",{p_telefono:tel||"",p_email:email||""});
    if(r.error){console.error(r.error);return null;}
    return (r.data&&r.data[0])||null;
  },
  async actualizarPerfil(id,patch){const r=await S.sb.from("perfiles").update(patch).eq("id",id).select();if(r.error)return r;if(!r.data.length)return {error:sinPermiso};return {data:r.data[0]};}
};

async function todas(tabla,orden){
  let out=[],desde=0;const N=1000;
  for(;;){
    const r=await S.sb.from(tabla).select("*").order(orden,{ascending:false}).range(desde,desde+N-1);
    if(r.error)throw r.error;
    out=out.concat(r.data);
    if(r.data.length<N)break;
    desde+=N;
  }
  return out;
}
function deFilaPlantilla(r){return {id:r.id,nombre:r.nombre,datos:r.datos||{},creadoPor:r.creado_por,creadoEn:r.creado_en,actualizadoEn:r.actualizado_en};}
function deFilaSeg(r){return {id:r.id,clienteId:r.cliente_id,cotizacionId:r.cotizacion_id,regla:r.regla,clave:r.clave,resultado:r.resultado,fecha:r.fecha,autor:r.autor};}
function ponerPlantilla(p){const i=S.plantillas.findIndex(x=>x.id===p.id);if(i>=0)S.plantillas[i]=p;else S.plantillas.push(p);refrescarTodo();}
const tablaFalta=e=>e&&(e.code==="42P01"||e.code==="PGRST205"||/does not exist|Could not find the table/i.test(String(e.message||"")));
async function cargarExtras(){ // tablas de la actualización 2: si aún no existen, el resto del CRM sigue funcionando
  try{S.plantillas=(await todas("plantillas","actualizado_en")).map(deFilaPlantilla);S.segs=(await todas("seguimientos","fecha")).map(deFilaSeg);S.faltaActualizacion=false;}
  catch(e){if(tablaFalta(e)){S.faltaActualizacion=true;S.plantillas=[];S.segs=[];}else console.error(e);}
}
async function cargarClientes(){S.clientes=(await todas("clientes","actualizado_en")).map(deFilaCliente);S.ready=true;}
async function cargarCotizaciones(){S.cotizaciones=(await todas("cotizaciones","numero")).map(deFilaCot);S.cotReady=true;}
async function cargarEquipo(){
  const r=await S.sb.from("perfiles").select("*").order("creado_en");
  if(r.error)throw r.error;
  S.equipo=r.data||[];
  S.perfil=S.equipo.find(p=>p.id===S.meId)||null;
  S.isAdmin=!!(S.perfil&&S.perfil.activo&&S.perfil.rol==="admin");
  S.readOnly=!(S.perfil&&S.perfil.activo);
}
async function cargarConfig(){
  const r=await S.sb.from("config").select("*");
  if(!r.error){S.config={};(r.data||[]).forEach(x=>{S.config[x.clave]=x.valor;});}
}
async function cargarHistorial(id){
  const r=await S.sb.from("historial").select("*").eq("cliente_id",id).order("fecha",{ascending:false});
  if(r.error){console.error(r.error);S.hist[id]=[];}
  else S.hist[id]=(r.data||[]).map(h=>({id:h.id,fecha:h.fecha,tipo:h.tipo,texto:h.texto,autor:h.autor}));
  if(detalleId===id)refrescarCapa("detalle",pintarDetalle);
}
async function recargarTodo(){
  try{await cargarEquipo();}catch(e){console.error(e);}
  if(!S.perfil||!S.perfil.activo){mostrarAuth("pendiente");return;}
  try{await Promise.all([cargarClientes(),cargarCotizaciones(),cargarConfig(),cargarExtras()]);S.loadError=null;}
  catch(e){console.error(e);S.loadError=e;S.ready=true;S.cotReady=true;}
  Object.keys(S.hist).forEach(id=>{if(id===detalleId)cargarHistorial(id);else delete S.hist[id];});
  refrescarTodo();
}
function refrescarCapa(key,fn){const sc=capaSheet(key);if(!sc)return;const top=sc.scrollTop;fn();const sc2=capaSheet(key);if(sc2)sc2.scrollTop=top;}
function renderConFoco(){
  if(document.getElementById("appRoot").hidden)return;
  const view=document.getElementById("view");
  const f=view.querySelector("#fq")||view.querySelector("#qq");
  const fid=f&&document.activeElement===f?f.id:null;
  render();
  if(fid){const n=document.getElementById(fid);if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length);}}
}
function refrescarTodo(){
  renderConFoco();
  if(detalleId)refrescarCapa("detalle",pintarDetalle);
  if(cotId)refrescarCapa("cot",pintarCotizacion);
  const cr=document.getElementById("cliRes");if(cr)cr.innerHTML=resultadosCliHTML();
}
let tRec={};
function luego(k,fn){clearTimeout(tRec[k]);tRec[k]=setTimeout(fn,350);}
function suscribir(){
  if(S.canal){try{S.sb.removeChannel(S.canal);}catch(_){}}
  S.canal=S.sb.channel("crm-cambios")
    .on("postgres_changes",{event:"*",schema:"public",table:"clientes"},()=>luego("c",async()=>{try{await cargarClientes();refrescarTodo();}catch(e){console.error(e);}}))
    .on("postgres_changes",{event:"*",schema:"public",table:"cotizaciones"},()=>luego("q",async()=>{try{await cargarCotizaciones();refrescarTodo();}catch(e){console.error(e);}}))
    .on("postgres_changes",{event:"*",schema:"public",table:"historial"},p=>{const id=(p.new&&p.new.cliente_id)||(p.old&&p.old.cliente_id);if(id&&S.hist[id])luego("h"+id,()=>cargarHistorial(id));})
    .on("postgres_changes",{event:"*",schema:"public",table:"plantillas"},()=>luego("pl",async()=>{await cargarExtras();refrescarTodo();}))
    .on("postgres_changes",{event:"*",schema:"public",table:"seguimientos"},()=>luego("sg",async()=>{await cargarExtras();refrescarTodo();}))
    .on("postgres_changes",{event:"*",schema:"public",table:"perfiles"},()=>luego("p",async()=>{try{await cargarEquipo();if(!S.perfil||!S.perfil.activo){mostrarAuth("pendiente");return;}refrescarTodo();}catch(e){console.error(e);}}))
    .subscribe();
}
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&S.perfil&&S.perfil.activo&&!document.getElementById("appRoot").hidden)luego("todo",recargarTodo);});

/* =====================================================================
   ACCESO: inicio de sesión, recuperación de contraseña y cuenta
   ===================================================================== */
function mostrarApp(){
  document.getElementById("authRoot").hidden=true;
  document.getElementById("appRoot").hidden=false;
  document.getElementById("tabNav").hidden=false;
}
function mostrarAuth(modo,mensaje){
  layers.slice().forEach(l=>closeOverlay(l.key));
  document.getElementById("appRoot").hidden=true;
  document.getElementById("tabNav").hidden=true;
  const r=document.getElementById("authRoot");r.hidden=false;
  const p=S.perfil;
  let card="";
  if(modo==="login")card='<h1>Iniciar sesión</h1><form id="fLogin" novalidate>'+
    '<div class="field"><label for="lEmail">Correo</label><input class="input" id="lEmail" type="email" inputmode="email" autocomplete="username" required></div>'+
    '<div class="field"><label for="lPass">Contraseña</label><input class="input" id="lPass" type="password" autocomplete="current-password" required></div>'+
    '<div class="err" id="lErr" role="alert"></div><button class="btn btn-gold" type="submit" id="lBtn">Ingresar</button></form>'+
    '<button type="button" class="linkbtn" id="lOlvido">¿Olvidaste tu contraseña?</button>';
  else if(modo==="olvido")card='<h1>Recuperar contraseña</h1><p class="muted" style="margin:0">Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.</p><form id="fOlvido" novalidate>'+
    '<div class="field"><label for="oEmail">Correo</label><input class="input" id="oEmail" type="email" inputmode="email" autocomplete="username" required></div>'+
    '<div id="oMsg" role="status"></div><button class="btn btn-gold" type="submit" id="oBtn">Enviar enlace</button></form><button type="button" class="linkbtn" id="oVolver">Volver a iniciar sesión</button>';
  else if(modo==="nueva")card='<h1>Crea tu nueva contraseña</h1><form id="fNueva" novalidate>'+
    '<div class="field"><label for="nPass">Nueva contraseña</label><input class="input" id="nPass" type="password" autocomplete="new-password" minlength="8" required><span class="help">Mínimo 8 caracteres.</span></div>'+
    '<div class="field"><label for="nPass2">Repite la contraseña</label><input class="input" id="nPass2" type="password" autocomplete="new-password" required></div>'+
    '<div class="err" id="nErr" role="alert"></div><button class="btn btn-gold" type="submit" id="nBtn">Guardar contraseña</button></form>';
  else if(modo==="pendiente")card='<h1>Cuenta pendiente</h1><p class="muted" style="margin:0">La cuenta <b>'+esc((S.session&&S.session.user&&S.session.user.email)||"")+'</b> todavía no está activa. El administrador de Diamond Travel debe activarla desde la sección Equipo.</p>'+
    '<div class="actions"><button class="btn btn-gold" id="pRe">Volver a comprobar</button><button class="btn" id="pSalir">Cerrar sesión</button></div>';
  else if(modo==="nombre")card='<h1>¡Te damos la bienvenida!</h1><p class="muted" style="margin:0">Antes de empezar, escribe tu nombre. Aparecerá en las cotizaciones que elabores.</p><form id="fNombre" novalidate>'+
    '<div class="field"><label for="mNom">Nombre completo</label><input class="input" id="mNom" maxlength="80" autocomplete="name" required value="'+esc((p&&p.nombre)||"")+'"></div>'+
    '<div class="err" id="mErr" role="alert"></div><button class="btn btn-gold" type="submit">Continuar</button></form>';
  else card='<h1>No se pudo cargar</h1><p class="muted" style="margin:0">'+esc(mensaje||"Revisa tu conexión a internet y recarga la página.")+'</p><button class="btn btn-gold" id="eRe">Recargar</button>';
  r.innerHTML='<img class="auth-logo" src="assets/logo.png" alt="Diamond Travel" width="180" height="146"><div class="auth-card">'+card+'</div>'+
    '<p class="auth-foot">CRM privado de Diamond Travel · Cúcuta. El acceso es solo para el equipo autorizado.</p>';
  const $=id=>r.querySelector("#"+id);
  if(modo==="login"){
    $("fLogin").onsubmit=async ev=>{
      ev.preventDefault();
      const email=$("lEmail").value.trim(),pass=$("lPass").value,err=$("lErr"),b=$("lBtn");
      if(!email||!pass){err.textContent="Escribe tu correo y tu contraseña.";return;}
      b.disabled=true;b.textContent="Ingresando…";err.textContent="";
      const res=await S.sb.auth.signInWithPassword({email:email,password:pass});
      if(res.error){
        b.disabled=false;b.textContent="Ingresar";
        const m=String(res.error.message||"");
        err.textContent=/invalid login|invalid credentials/i.test(m)?"Correo o contraseña incorrectos.":/not confirmed/i.test(m)?"Este correo aún no está confirmado. Revisa tu bandeja de entrada.":/fetch|network/i.test(m)?"Sin conexión a internet. Intenta de nuevo.":"No se pudo iniciar sesión: "+m;
        return;
      }
      await entrar(res.data.session);
    };
    $("lOlvido").onclick=()=>mostrarAuth("olvido");
    setTimeout(()=>{const e=$("lEmail");if(e)e.focus();},50);
  }
  if(modo==="olvido"){
    $("fOlvido").onsubmit=async ev=>{
      ev.preventDefault();
      const email=$("oEmail").value.trim(),m=$("oMsg"),b=$("oBtn");
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){m.innerHTML='<p class="err" style="margin:0">Escribe un correo válido.</p>';return;}
      b.disabled=true;
      const res=await S.sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
      b.disabled=false;
      m.innerHTML=res.error&&/rate|limit/i.test(res.error.message||"")?'<p class="err" style="margin:0">Ya se enviaron varios correos. Espera unos minutos e intenta de nuevo.</p>':
        '<p class="ok-msg" style="margin:0">Si el correo está registrado, te llegará un enlace en unos minutos. Ábrelo en este mismo dispositivo.</p>';
    };
    $("oVolver").onclick=()=>mostrarAuth("login");
  }
  if(modo==="nueva"){
    $("fNueva").onsubmit=async ev=>{
      ev.preventDefault();
      const a=$("nPass").value,b2=$("nPass2").value,err=$("nErr");
      if(a.length<8){err.textContent="La contraseña debe tener al menos 8 caracteres.";return;}
      if(a!==b2){err.textContent="Las contraseñas no coinciden.";return;}
      $("nBtn").disabled=true;
      const res=await S.sb.auth.updateUser({password:a});
      if(res.error){$("nBtn").disabled=false;err.textContent="No se pudo guardar: "+res.error.message;return;}
      S.recuperando=false;
      try{history.replaceState(null,"",location.pathname);}catch(_){}
      toast("Contraseña actualizada");
      const ses=await S.sb.auth.getSession();
      if(ses.data.session)await entrar(ses.data.session);else mostrarAuth("login");
    };
  }
  if(modo==="pendiente"){
    $("pRe").onclick=async()=>{if(S.session)await entrar(S.session);};
    $("pSalir").onclick=cerrarSesion;
  }
  if(modo==="nombre"){
    $("fNombre").onsubmit=async ev=>{
      ev.preventDefault();
      const n=$("mNom").value.trim();
      if(n.length<2){$("mErr").textContent="Escribe tu nombre.";return;}
      const res=await api.actualizarPerfil(S.meId,{nombre:n});
      if(res.error){$("mErr").textContent=explicarError(res.error);return;}
      S.perfil=Object.assign({},S.perfil,{nombre:n});
      await entrar(S.session);
    };
  }
  const er=$("eRe");if(er)er.onclick=()=>location.reload();
}
async function entrar(session){
  S.session=session;S.meId=session.user.id;
  try{await cargarEquipo();}catch(e){console.error(e);mostrarAuth("error",explicarError(e));return;}
  if(!S.perfil||!S.perfil.activo){mostrarAuth("pendiente");return;}
  if(!S.perfil.nombre){mostrarAuth("nombre");return;}
  mostrarApp();
  const h=(location.hash||"").replace("#","");
  if(VIEWS.some(v=>v.k===h&&(!v.admin||S.isAdmin)))S.view=h;
  render();
  try{await Promise.all([cargarClientes(),cargarCotizaciones(),cargarConfig(),cargarExtras()]);S.loadError=null;}
  catch(e){console.error(e);S.loadError=e;S.ready=true;S.cotReady=true;}
  render();
  suscribir();
}
async function cerrarSesion(){
  try{if(S.canal)S.sb.removeChannel(S.canal);}catch(_){}
  await S.sb.auth.signOut();
  Object.assign(S,{session:null,perfil:null,equipo:[],config:{},hist:{},clientes:[],cotizaciones:[],ready:false,cotReady:false,meId:null,isAdmin:false,loadError:null});
  mostrarAuth("login");
}
function abrirMiCuenta(){
  const p=S.perfil||{};
  const s=openOverlay('<div class="sheet-head"><h2>Mi cuenta</h2><button class="btn btn-ghost btn-sm" id="mcClose">Cerrar</button></div>'+
    '<div class="sheet-body">'+
    '<div class="panel panel-pad" style="display:flex;flex-direction:column;gap:12px"><h2>Mis datos</h2>'+
      '<p class="help" style="margin:0">'+esc(p.email||"")+' · '+(p.rol==="admin"?"Administrador(a)":"Asesor(a)")+'</p>'+
      '<div class="field"><label for="mcNom">Nombre</label><input class="input" id="mcNom" maxlength="80" value="'+esc(p.nombre||"")+'"></div>'+
      '<div><button class="btn btn-gold" id="mcGuardarNom">Guardar nombre</button></div></div>'+
    '<div class="panel panel-pad" style="display:flex;flex-direction:column;gap:12px"><h2>Cambiar contraseña</h2>'+
      '<div class="field"><label for="mcP1">Nueva contraseña</label><input class="input" id="mcP1" type="password" autocomplete="new-password" minlength="8"><span class="help">Mínimo 8 caracteres.</span></div>'+
      '<div class="field"><label for="mcP2">Repite la contraseña</label><input class="input" id="mcP2" type="password" autocomplete="new-password"></div>'+
      '<div class="err" id="mcErr" role="alert"></div><div><button class="btn" id="mcGuardarPass">Cambiar contraseña</button></div></div>'+
    '<div class="sheet-foot"><button class="btn btn-danger" id="mcSalir">Cerrar sesión</button></div></div>',"","cuenta");
  s.querySelector("#mcClose").onclick=()=>closeOverlay("cuenta");
  s.querySelector("#mcSalir").onclick=cerrarSesion;
  s.querySelector("#mcGuardarNom").onclick=async()=>{
    const n=s.querySelector("#mcNom").value.trim();if(n.length<2){toast("Escribe tu nombre.");return;}
    const r=await api.actualizarPerfil(S.meId,{nombre:n});
    if(r.error){toast(explicarError(r.error));return;}
    S.perfil.nombre=n;const e=S.equipo.find(x=>x.id===S.meId);if(e)e.nombre=n;renderMe();toast("Nombre actualizado");
  };
  s.querySelector("#mcGuardarPass").onclick=async()=>{
    const a=s.querySelector("#mcP1").value,b=s.querySelector("#mcP2").value,err=s.querySelector("#mcErr");
    if(a.length<8){err.textContent="La contraseña debe tener al menos 8 caracteres.";return;}
    if(a!==b){err.textContent="Las contraseñas no coinciden.";return;}
    const r=await S.sb.auth.updateUser({password:a});
    if(r.error){err.textContent="No se pudo cambiar: "+r.error.message;return;}
    err.textContent="";s.querySelector("#mcP1").value="";s.querySelector("#mcP2").value="";toast("Contraseña cambiada");
  };
}

/* ---------- Equipo (solo administrador) ---------- */
function viewEquipo(){
  let h='<div class="page-head"><div><span class="eyebrow">Accesos y permisos</span><h1>Equipo</h1></div></div>';
  if(!S.isAdmin)return h+'<div class="panel empty"><p class="muted">Solo el administrador puede ver esta sección.</p></div>';
  const pend=S.equipo.filter(p=>!p.activo);
  const lista=S.equipo.slice().sort((a,b)=>(a.activo===b.activo?0:a.activo?1:-1)||String(a.nombre||a.email).localeCompare(String(b.nombre||b.email)));
  if(pend.length)h+='<div class="banner warn">'+pend.length+(pend.length===1?" cuenta espera":" cuentas esperan")+' tu aprobación. Actívalas solo si reconoces a la persona.</div>';
  h+='<div class="panel panel-pad"><div class="section-title"><h2>Personas con acceso</h2><span class="help">'+S.equipo.filter(p=>p.activo).length+' activas</span></div><div>'+
    lista.map(p=>'<div class="eq-row"><div class="eq-who"><b>'+esc(p.nombre||"Sin nombre")+(p.id===S.meId?" (tú)":"")+'</b><span class="help" style="overflow-wrap:anywhere">'+esc(p.email)+'</span>'+
      '<span><span class="pill '+(p.activo?"est-aceptada":"est-pend")+'">'+(p.activo?"Activa":"Pendiente o desactivada")+'</span></span></div>'+
      '<div class="eq-actions"><select class="input" data-eq-rol="'+esc(p.id)+'" aria-label="Rol de '+esc(p.nombre||p.email)+'"><option value="asesor"'+(p.rol==="asesor"?" selected":"")+'>Asesor(a)</option><option value="admin"'+(p.rol==="admin"?" selected":"")+'>Administrador(a)</option></select>'+
      '<button class="btn btn-sm '+(p.activo?"":"btn-gold")+'" data-eq-act="'+esc(p.id)+'">'+(p.activo?"Desactivar":"Activar")+'</button></div></div>').join("")+'</div></div>';
  const ver=!!((S.config.visibilidad||{}).asesoresVenTodo);
  h+='<div class="panel panel-pad" style="display:flex;flex-direction:column;gap:12px"><h2>Qué ven los asesores</h2>'+
    '<label class="check"><input type="checkbox" id="eqVer"'+(ver?" checked":"")+'> Los asesores pueden ver todos los clientes y cotizaciones</label>'+
    '<p class="help" style="margin:0">Desmarcado (recomendado): cada asesor ve solo sus clientes y cotizaciones. El administrador siempre ve todo. Solo el administrador puede borrar registros.</p></div>';
  h+=editorSeguimientosHTML();
  h+='<div class="panel panel-pad" style="display:flex;flex-direction:column;gap:12px"><h2>Agregar a un asesor</h2><ol class="steps">'+
    '<li>Entra a <b>supabase.com</b>, abre el proyecto <b>diamond-travel-crm</b> y ve a <b>Authentication → Users</b>.</li>'+
    '<li>Toca <b>Add user → Create new user</b>, escribe su correo y una contraseña temporal, y marca <b>Auto Confirm User</b>.</li>'+
    '<li>Vuelve aquí: aparecerá como pendiente. Tócale <b>Activar</b>.</li>'+
    '<li>Envíale el enlace del CRM y la contraseña temporal; al entrar, puede cambiarla en Mi cuenta.</li></ol>'+
    '<p class="help" style="margin:0">Para quitarle el acceso a alguien, toca Desactivar: deja de ver los datos de inmediato.</p></div>';
  return h;
}
function bindEquipo(v){
  bindEditorSeguimientos(v);
  v.querySelectorAll("[data-eq-rol]").forEach(sel=>sel.onchange=async()=>{
    const id=sel.dataset.eqRol;
    if(id===S.meId&&sel.value!=="admin"&&!(await confirmar("¿Quitarte el rol de administrador?","Perderás el acceso a Equipo y a las funciones de administrador.","Sí, cambiar mi rol",true))){render();return;}
    if(await guardar(()=>api.actualizarPerfil(id,{rol:sel.value}))){await cargarEquipo();toast("Rol actualizado");}
    render();
  });
  v.querySelectorAll("[data-eq-act]").forEach(b=>b.onclick=async()=>{
    const p=S.equipo.find(x=>x.id===b.dataset.eqAct);if(!p)return;
    if(p.activo&&!(await confirmar("¿Desactivar a "+(p.nombre||p.email)+"?","Dejará de ver los datos del CRM de inmediato. Sus clientes y cotizaciones se conservan.","Desactivar",true)))return;
    if(await guardar(()=>api.actualizarPerfil(p.id,{activo:!p.activo}))){await cargarEquipo();toast(p.activo?"Cuenta desactivada":"Cuenta activada");}
    render();
  });
  const ver=v.querySelector("#eqVer");
  if(ver)ver.onchange=async()=>{
    if(await guardar(()=>api.guardarConfig("visibilidad",{asesoresVenTodo:ver.checked}))){S.config.visibilidad={asesoresVenTodo:ver.checked};toast("Permisos actualizados");}
    else ver.checked=!ver.checked;
  };
}

/* ---------- Arranque ---------- */
async function importarSupabase(){
  let ultimo;
  for(const u of window.DT_CONFIG.supabaseJs){try{return await import(u);}catch(e){ultimo=e;console.warn("No cargó",u,e);}}
  throw ultimo;
}
async function start(){
  if(/type=recovery/.test(location.hash))S.recuperando=true;
  let mod;
  try{mod=await importarSupabase();}
  catch(e){mostrarAuth("error","No se pudo cargar el sistema. Revisa tu conexión a internet y recarga la página.");return;}
  const cfg=window.DT_CONFIG;
  S.sb=mod.createClient(cfg.supabaseUrl,cfg.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  S.sb.auth.onAuthStateChange((ev,session)=>{
    if(ev==="PASSWORD_RECOVERY"){S.recuperando=true;S.session=session;mostrarAuth("nueva");return;}
    if(ev==="SIGNED_OUT"&&S.perfil){Object.assign(S,{session:null,perfil:null});mostrarAuth("login");}
    if(ev==="TOKEN_REFRESHED"&&session)S.session=session;
  });
  const res=await S.sb.auth.getSession();
  if(S.recuperando){if(res.data.session)S.session=res.data.session;mostrarAuth("nueva");return;}
  if(!res.data.session){mostrarAuth("login");return;}
  await entrar(res.data.session);
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
