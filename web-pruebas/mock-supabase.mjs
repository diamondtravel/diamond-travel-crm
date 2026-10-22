// Simulación de @supabase/supabase-js para pruebas locales con datos ficticios.
// Reproduce las reglas de permisos de supabase/schema.sql de forma simplificada.
const K = "mock-supabase-db";
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const clone = o => JSON.parse(JSON.stringify(o));

function cargarDB() {
  try { const s = localStorage.getItem(K); if (s) return JSON.parse(s); } catch (_) {}
  const users = [
    { id: "aaaaaaaa-0000-4000-8000-00000000000a", email: "reservasdiamondtravel@gmail.com", password: "Prueba-1234" },
    { id: "bbbbbbbb-0000-4000-8000-00000000000b", email: "asesora1@ejemplo.com", password: "Prueba-1234" }
  ];
  return {
    users, seq: 0,
    perfiles: [
      { id: users[0].id, email: users[0].email, nombre: "", rol: "admin", activo: true, creado_en: now() },
      { id: users[1].id, email: users[1].email, nombre: "Asesora Uno", rol: "asesor", activo: false, creado_en: now() }
    ],
    config: [], clientes: [], historial: [], cotizaciones: [], seguimientos: [], plantillas: [], solicitudes: []
  };
}
let DB = cargarDB();
if (!DB.seguimientos) DB.seguimientos = []; if (!DB.plantillas) DB.plantillas = []; if (!DB.solicitudes) DB.solicitudes = [];
const SIN_TABLAS = (() => { try { return localStorage.getItem("mock-sin-tablas") === "1"; } catch (_) { return false; } })();
const SIN_03 = (() => { try { return localStorage.getItem("mock-sin-03") === "1"; } catch (_) { return false; } })();
const guardarDB = () => { try { localStorage.setItem(K, JSON.stringify(DB)); } catch (_) {} };
window.__mockDB = () => DB;
// Simula lo que hace la función registrar_solicitud (formulario público) para preparar datos de prueba.
window.__mockSolicitud = (d, haceDias) => {
  const fecha = new Date(Date.now() - (haceDias || 0) * 864e5).toISOString();
  const tel = String(d.telefono).replace(/\D/g, "").slice(-10);
  let c = DB.clientes.find(x => String(x.telefono).replace(/\D/g, "").slice(-10) === tel), nuevo = false;
  const adminP = DB.perfiles.find(p => p.rol === "admin" && p.activo);
  if (!c) {
    nuevo = true;
    c = { id: uuid(), nombre: d.nombre, telefono: d.telefono, email: d.email || "", ciudad: "", origen: "Formulario web" + (d.comoNosConocio ? " · " + d.comoNosConocio : ""),
      destinos: d.destino, tipo_viaje: "", fecha_viaje: d.fechaIda || null, adultos: +d.adultos || 1, ninos: +d.ninos || 0, presupuesto: null, intereses: [],
      preferencias: d.comentarios || "", etapa: "nuevo", asesor_id: adminP.id, creado_por: null, creado_en: fecha, actualizado_en: fecha, ultimo_contacto: null, cerrado_en: null, ejemplo: false };
    DB.clientes.push(c);
  } else if (c.etapa === "perdido") c.etapa = "nuevo";
  DB.historial.push({ id: uuid(), cliente_id: c.id, fecha, tipo: "Formulario", texto: "Llegó por el formulario \"Cotiza tu viaje\". Destino: " + d.destino, autor: null });
  DB.solicitudes.push({ id: uuid(), cliente_id: c.id, creado_en: fecha, telefono_norm: tel, nuevo_cliente: nuevo, datos: Object.assign({ autorizaDatos: true }, d) });
  guardarDB();
};

let sesion = null;
try { sesion = JSON.parse(localStorage.getItem(K + "-sesion") || "null"); } catch (_) {}
const uid = () => sesion && sesion.user.id;
const perfil = () => DB.perfiles.find(p => p.id === uid());
const activo = () => !!(perfil() && perfil().activo);
const admin = () => activo() && perfil().rol === "admin";
const veTodo = () => admin() || (activo() && !!((DB.config.find(c => c.clave === "visibilidad") || {}).valor || {}).asesoresVenTodo);
const visible = {
  perfiles: r => r.id === uid() || activo(),
  config: () => activo(),
  clientes: r => activo() && (veTodo() || r.asesor_id === uid()),
  cotizaciones: r => activo() && (veTodo() || r.asesor_id === uid()),
  historial: r => { const c = DB.clientes.find(x => x.id === r.cliente_id); return !!c && visible.clientes(c); },
  seguimientos: r => { const c = DB.clientes.find(x => x.id === r.cliente_id); return !!c && visible.clientes(c); },
  plantillas: () => activo(),
  solicitudes: r => { const c = DB.clientes.find(x => x.id === r.cliente_id); return !!c && visible.clientes(c); }
};
const puedeInsertar = {
  perfiles: () => false, config: () => admin(),
  clientes: r => activo() && (admin() || r.asesor_id === uid()),
  cotizaciones: r => activo() && (admin() || r.asesor_id === uid()),
  historial: r => activo() && (r.autor === uid() || admin()) && visible.historial(r),
  seguimientos: r => activo() && r.autor === uid() && visible.seguimientos(r),
  plantillas: r => activo() && r.creado_por === uid(),
  solicitudes: () => false
};
const puedeEditar = {
  perfiles: (r) => r.id === uid() || admin(), config: () => admin(),
  clientes: (r, n) => visible.clientes(r) && (admin() || n.asesor_id === uid()),
  cotizaciones: (r, n) => visible.cotizaciones(r) && (admin() || n.asesor_id === uid()),
  historial: () => false, seguimientos: () => false, plantillas: () => activo(), solicitudes: () => false
};
const puedeBorrar = { perfiles: () => false, config: () => admin(), clientes: () => admin(), cotizaciones: () => admin(), historial: () => false,
  seguimientos: () => admin(), plantillas: r => admin() || (activo() && r.creado_por === uid()), solicitudes: () => admin() };
const err = (code, message) => ({ data: null, error: { code, message } });
const PK = { config: "clave" };

function defaults(t, r) {
  const o = Object.assign({}, r);
  if (t !== "config" && !o.id) o.id = uuid();
  if (t === "clientes" || t === "cotizaciones") {
    if (!admin() || !o.creado_en) o.creado_en = now();
    o.creado_por = admin() && o.creado_por ? o.creado_por : uid();
    o.actualizado_en = now();
    if (o.asesor_id === undefined) o.asesor_id = uid();
  }
  if (t === "clientes") {
    for (const k of ["telefono", "email", "ciudad", "origen", "destinos", "tipo_viaje", "preferencias"]) if (o[k] == null) o[k] = "";
    if (!o.intereses) o.intereses = []; if (!o.etapa) o.etapa = "nuevo"; if (o.ejemplo == null) o.ejemplo = false;
    if (!String(o.nombre || "").trim()) return { error: { code: "23514", message: "nombre" } };
  }
  if (t === "cotizaciones") {
    if (o.numero == null || !admin()) o.numero = ++DB.seq;
    if (!o.estado) o.estado = "borrador"; if (!o.datos) o.datos = {}; if (!o.historial_estados) o.historial_estados = [];
    if (DB.cotizaciones.some(x => x.numero === o.numero && x.id !== o.id)) return { error: { code: "23505", message: "numero duplicado" } };
  }
  if (t === "seguimientos") {
    o.fecha = now(); if (!admin()) o.autor = uid();
    if (DB.seguimientos.some(x => x.clave === o.clave)) return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
  }
  if (t === "plantillas") {
    o.creado_en = now(); o.actualizado_en = now(); if (!admin() || !o.creado_por) o.creado_por = uid();
    if (DB.plantillas.some(x => x.nombre.trim().toLowerCase() === String(o.nombre).trim().toLowerCase())) return { error: { code: "23505", message: "duplicate key" } };
  }
  if (t === "historial") { if (!o.fecha) o.fecha = now(); if (o.autor === undefined) o.autor = uid(); if (!o.tipo) o.tipo = "Nota"; }
  return { row: o };
}

class Q {
  constructor(t) { this.t = t; this.op = "select"; this.filtros = []; this.ord = null; this.rng = null; this.sel = false; this.uno = false; }
  select() { if (this.op !== "select") this.sel = true; return this; }
  insert(rows) { this.op = "insert"; this.rows = [].concat(rows); return this; }
  upsert(rows, opts) { this.op = "upsert"; this.rows = [].concat(rows); this.opts = opts || {}; return this; }
  update(p) { this.op = "update"; this.patch = p; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c, v) { this.filtros.push(r => r[c] === v); return this; }
  order(c, o) { this.ord = { c, asc: !(o && o.ascending === false) }; return this; }
  range(a, b) { this.rng = [a, b]; return this; }
  single() { this.uno = true; return this; }
  maybeSingle() { this.uno = "maybe"; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }
  run() {
    if (!uid()) return err("42501", "permission denied (sin sesión)");
    if ((SIN_TABLAS || SIN_03) && this.t === "solicitudes") return err("PGRST205", "Could not find the table 'public.solicitudes' in the schema cache");
    if (SIN_TABLAS && (this.t === "seguimientos" || this.t === "plantillas")) return err("PGRST205", "Could not find the table 'public." + this.t + "' in the schema cache");
    const T = DB[this.t], vis = visible[this.t];
    let out;
    if (this.op === "select") {
      out = T.filter(r => vis(r) && this.filtros.every(f => f(r)));
      if (this.ord) { const { c, asc } = this.ord; out.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)); }
      if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
    } else if (this.op === "insert" || this.op === "upsert") {
      out = [];
      for (const r0 of this.rows) {
        const pk = PK[this.t] || "id";
        const prev = this.op === "upsert" ? T.find(x => x[pk] === r0[pk]) : null;
        if (prev) {
          if (this.opts.ignoreDuplicates) continue;
          const n = Object.assign({}, prev, r0);
          if (this.t === "cotizaciones") n.numero = admin() && r0.numero != null ? r0.numero : prev.numero;
          if (!puedeEditar[this.t](prev, n)) return err("42501", "new row violates row-level security policy");
          n.actualizado_en = now(); Object.assign(prev, n); out.push(prev);
        } else {
          const d = defaults(this.t, r0); if (d.error) return { data: null, error: d.error };
          if (!puedeInsertar[this.t](d.row)) return err("42501", "new row violates row-level security policy");
          T.push(d.row); out.push(d.row);
        }
      }
    } else if (this.op === "update") {
      out = [];
      for (const r of T.filter(r => vis(r) && this.filtros.every(f => f(r)))) {
        const n = Object.assign({}, r, this.patch);
        if (this.t === "cotizaciones") n.numero = r.numero;
        if (this.t === "perfiles" && !admin()) { n.rol = r.rol; n.activo = r.activo; }
        if (this.t === "perfiles" && r.rol === "admin" && r.activo && (n.rol !== "admin" || !n.activo) && !DB.perfiles.some(p => p.id !== r.id && p.rol === "admin" && p.activo))
          return err("P0001", "Debe quedar al menos un administrador activo.");
        if (!puedeEditar[this.t](r, n)) { if (this.t === "perfiles") continue; return err("42501", "new row violates row-level security policy"); }
        if (this.t === "clientes" || this.t === "cotizaciones" || this.t === "plantillas") n.actualizado_en = now();
        if (this.t === "plantillas") { n.creado_por = r.creado_por; n.creado_en = r.creado_en; }
        Object.assign(r, n); out.push(r);
      }
    } else if (this.op === "delete") {
      out = T.filter(r => vis(r) && this.filtros.every(f => f(r)) && puedeBorrar[this.t](r));
      DB[this.t] = T.filter(r => !out.includes(r));
      if (this.t === "clientes") { const ids = new Set(out.map(r => r.id)); DB.historial = DB.historial.filter(h => !ids.has(h.cliente_id)); DB.cotizaciones.forEach(q => { if (ids.has(q.cliente_id)) q.cliente_id = null; }); }
    }
    guardarDB();
    const data = clone(out);
    if (this.uno) { if (data.length !== 1) return this.uno === "maybe" && !data.length ? { data: null, error: null } : err("PGRST116", "JSON object requested, multiple (or no) rows returned"); return { data: data[0], error: null }; }
    return { data: this.op === "select" || this.sel || this.op === "upsert" || this.op === "insert" ? data : null, error: null };
  }
}

const listeners = [];
const auth = {
  async getSession() { return { data: { session: sesion }, error: null }; },
  onAuthStateChange(cb) { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
  async signInWithPassword({ email, password }) {
    await new Promise(r => setTimeout(r, 50));
    const u = DB.users.find(x => x.email === String(email).toLowerCase() && x.password === password);
    if (!u) return { data: { session: null }, error: { message: "Invalid login credentials" } };
    sesion = { access_token: "mock", user: { id: u.id, email: u.email } };
    localStorage.setItem(K + "-sesion", JSON.stringify(sesion));
    listeners.forEach(cb => cb("SIGNED_IN", sesion));
    return { data: { session: sesion, user: sesion.user }, error: null };
  },
  async signOut() { sesion = null; localStorage.removeItem(K + "-sesion"); listeners.forEach(cb => cb("SIGNED_OUT", null)); return { error: null }; },
  async resetPasswordForEmail() { window.__resetPedido = true; return { data: {}, error: null }; },
  async updateUser({ password }) { const u = DB.users.find(x => x.id === uid()); if (u && password) { u.password = password; guardarDB(); } return { data: { user: sesion && sesion.user }, error: null }; }
};

export function createClient(url, key) {
  window.__mockConfig = { url, key };
  return {
    auth,
    from: t => new Q(t),
    async rpc(fn, args) {
      if (!uid()) return err("42501", "sin sesión");
      if (fn === "buscar_duplicado") {
        if (!activo()) return { data: [], error: null };
        const tel = String(args.p_telefono || "").replace(/\D/g, "").slice(-10), mail = String(args.p_email || "").trim().toLowerCase();
        const c = DB.clientes.find(c => (tel.length >= 7 && String(c.telefono).replace(/\D/g, "").slice(-10) === tel) || (mail && String(c.email).trim().toLowerCase() === mail));
        if (!c) return { data: [], error: null };
        const p = DB.perfiles.find(p => p.id === c.asesor_id) || {};
        return { data: [{ id: c.id, nombre: c.nombre, asesor: p.nombre || p.email || "otro asesor", visible: veTodo() || c.asesor_id === uid() }], error: null };
      }
      if (fn === "ajustar_consecutivo") {
        if (!admin()) return err("P0001", "Solo el administrador puede hacer esto.");
        const m = Math.max(0, ...DB.cotizaciones.map(q => q.numero)); DB.seq = Math.max(DB.seq, m); guardarDB(); return { data: m, error: null };
      }
      return err("42883", "función desconocida");
    },
    channel() { const ch = { on() { return ch; }, subscribe() { return ch; } }; return ch; },
    removeChannel() {}
  };
}
