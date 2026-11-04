// Prueba de extremo a extremo: filtro por mes y Resumen del mes. Datos ficticios, Supabase simulado.
// Uso: node web-pruebas/e2e-meses.js
const { chromium } = require(process.env.PW || '/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const G = process.env.NODE_GLOBAL || '/home/claude/.npm-global/lib/node_modules/';
const WEB = path.join(__dirname, '..', 'web');
const OUT = path.join(process.env.OUT || '/tmp', 'shots-meses'); fs.mkdirSync(OUT, { recursive: true });
const results = []; const ok = (n, c, x) => results.push((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : ''));
const tipos = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const enDias = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const ddmm = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
const plano = t => t.replace(/\s+/g, ' ');

async function nuevaPagina(browser, vp, antes) {
  const ctx = await browser.newContext({ viewport: vp || { width: 1024, height: 1366 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.errores = [];
  page.on('pageerror', e => page.errores.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) page.errores.push('console: ' + m.text()); });
  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.host === 'crm.test') { let p = u.pathname; if (p.endsWith('/')) p += 'index.html'; const f = path.join(WEB, p); return fs.existsSync(f) ? route.fulfill({ path: f, contentType: tipos[path.extname(f)] || 'application/octet-stream' }) : route.fulfill({ status: 404, body: 'no' }); }
    if (u.host === 'cdn.jsdelivr.net' && u.pathname.includes('@supabase/supabase-js')) return route.fulfill({ path: path.join(__dirname, 'mock-supabase.mjs'), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
    if (u.pathname.endsWith('pdf-lib.min.js')) return route.fulfill({ path: G + 'pdf-lib/dist/pdf-lib.min.js', contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } });
    if (u.pathname.includes('pdfjs-dist@6.2.108/legacy/build/')) return route.fulfill({ path: G + 'pdfjs-dist/legacy/build/' + u.pathname.split('/').pop(), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
    return route.abort();
  });
  if (antes) await page.addInitScript(antes);
  await page.goto('https://crm.test/');
  return page;
}
async function entrarAdmin(page) {
  await page.waitForSelector('#fLogin');
  await page.fill('#lEmail', 'reservasdiamondtravel@gmail.com'); await page.fill('#lPass', 'Prueba-1234'); await page.click('#lBtn');
  await page.waitForSelector('#fNombre'); await page.fill('#mNom', 'Nicol Prueba'); await page.click('#fNombre button[type=submit]');
  await page.waitForSelector('.tab[data-view="inicio"]:visible');
}

const mesK = n => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const NOMBRES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const etiqueta = k => NOMBRES[+k.slice(5) - 1] + ' ' + k.slice(0, 4);

(async () => {
  const browser = await chromium.launch();
  const page = await nuevaPagina(browser);
  const T = (s, o) => page.locator(s, o);
  const shot = n => page.screenshot({ path: path.join(OUT, n + '.png'), fullPage: true });
  const errores = [];
  const M0 = mesK(0), M1 = mesK(-1), M3 = mesK(-3);
  await entrarAdmin(page);
  // Datos ficticios repartidos en varios meses
  await page.evaluate(({ M0, M1, M3 }) => {
    const db = window.__mockDB(), adm = db.perfiles[0].id, ts = (m, d) => m + '-' + d + 'T15:00:00.000Z';
    const cli = (nombre, m, origen, destinos) => { const id = crypto.randomUUID(); db.clientes.push({ id, nombre, telefono: '3000000000', email: '', ciudad: 'Cúcuta', origen, destinos, tipo_viaje: '', intereses: [], preferencias: '', etapa: 'nuevo', asesor_id: adm, creado_por: adm, creado_en: ts(m, '02'), actualizado_en: ts(m, '02'), ejemplo: false }); return id; };
    const ca = cli('Cliente Prueba Uno', M0, 'Instagram', 'San Andrés'), cb = cli('Cliente Prueba Dos', M0, 'WhatsApp', 'Cartagena');
    const cc = cli('Cliente Prueba Tres', M1, 'Instagram', 'Santa Marta'); cli('Cliente Prueba Cuatro', M3, 'Referido', 'Medellín');
    const cot = (n, cid, nom, m, estado, precio, acept, dest) => { const id = crypto.randomUUID(); db.cotizaciones.push({ id, numero: n, estado, cliente_id: cid, asesor_id: adm, fecha_elaboracion: m + '-03', fecha_vencimiento: null, moneda: 'COP', total: precio * 2,
      datos: { cliente: { nombre: nom, telefono: '3000000000', email: '' }, viaje: { destinos: dest, adultos: 2, ninos: 0 }, servicios: [], valores: { moneda: 'COP', opciones: [{ precioAdulto: precio }], cargos: [], descuentos: [] }, condiciones: {} },
      historial_estados: acept ? [{ estado: 'enviada', fecha: m + '-03T16:00:00.000Z' }, { estado: 'aceptada', fecha: acept + '-04T16:00:00.000Z' }] : [], ejemplo: false, creado_por: adm, creado_en: ts(m, '03'), actualizado_en: ts(m, '03') }); return id; };
    const q1 = cot(1, ca, 'Cliente Prueba Uno', M0, 'aceptada', 3000000, M0, 'San Andrés');
    cot(2, cb, 'Cliente Prueba Dos', M0, 'borrador', 1000000, null, 'Cartagena');
    const q3 = cot(3, cc, 'Cliente Prueba Tres', M1, 'aceptada', 2000000, M1, 'Santa Marta');
    db.seq = 3;
    const res = (n, cid, qid, nom, m, estado, dest, extra) => { const id = crypto.randomUUID(); db.reservas.push({ id, numero: n, estado, cliente_id: cid, cotizacion_id: qid, asesor_id: adm, destino: dest, fecha_inicio: null, fecha_fin: null, voucher_enviado_en: null, ejemplo: false, creado_por: adm, creado_en: ts(m, '05'), actualizado_en: ts(m, '05'),
      datos: Object.assign({ titular: { nombre: nom, telefono: '3000000000', email: '' }, pasajeros: [], vuelos: [], hoteles: [], traslados: [], actividades: [], incluye: [], asistencia: {}, historialEstados: [] }, extra || {}) }); return id; };
    const r1 = res(1, ca, q1, 'Cliente Prueba Uno', M0, 'confirmada', 'San Andrés');
    const r2 = res(2, cc, q3, 'Cliente Prueba Tres', M1, 'finalizada', 'Santa Marta', { valorTotal: 4000000, monedaPagos: 'COP' });
    res(3, cb, null, 'Cliente Prueba Dos', M0, 'cancelada', 'Cartagena', { valorTotal: 9999999 });
    db.seqR = 3;
    const pago = (rid, tipo, valor, m, abono) => { const id = crypto.randomUUID(); db.pagos.push({ id, reserva_id: rid, tipo, concepto: tipo === 'cobro' ? 'Cuota 1' : 'Hotel', proveedor: tipo === 'pago' ? 'Hotel de prueba' : '', categoria: tipo === 'pago' ? 'hotel' : '', valor, moneda: 'COP', fecha_limite: m + '-20', orden: 0, notas: '', creado_por: adm, creado_en: ts(m, '05'), actualizado_en: ts(m, '05') });
      if (abono) db.abonos.push({ id: crypto.randomUUID(), pago_id: id, numero: tipo === 'cobro' ? ++db.seqRC : null, valor: abono, fecha: m + '-06', medio: 'Transferencia', referencia: '', notas: '', registrado_por: adm, registrado_en: ts(m, '06') }); };
    pago(r1, 'cobro', 6000000, M0, 2000000); pago(r1, 'pago', 1500000, M0, 1500000); pago(r2, 'cobro', 4000000, M1, 4000000);
    localStorage.setItem('mock-supabase-db', JSON.stringify(db));
  }, { M0, M1, M3 });
  await page.reload(); await page.waitForSelector('.tab[data-view="inicio"]:visible');

  // ---- Filtro por mes en Clientes
  await T('.tab[data-view="clientes"]:visible').click();
  ok('Clientes: filtro de mes en "Todos los meses" por defecto', (await T('#fMes').inputValue()) === 'todos' && (await T('#clientList [data-open]').count()) === 4, String(await T('#clientList [data-open]').count()));
  const opciones = await T('#fMes option').allInnerTexts();
  ok('Clientes: el filtro ofrece los meses desde el primer registro', opciones.length === 5 && opciones[1].toLowerCase() === etiqueta(M0), opciones.join(','));
  await T('#fMes').selectOption(M1);
  const txtC = await T('#view').innerText();
  ok('Clientes: al elegir el mes anterior sale solo el cliente de ese mes', (await T('#clientList [data-open]').count()) === 1 && /Cliente Prueba Tres/.test(txtC) && new RegExp('1 cliente registrado en ' + etiqueta(M1)).test(txtC));
  await shot('01-clientes-mes');

  // ---- El mes se mantiene en Cotizaciones y Reservas
  await T('.tab[data-view="cotizaciones"]:visible').click();
  ok('Cotizaciones: conserva el mes elegido', (await T('#qMes').inputValue()) === M1 && (await T('#cotList [data-cot]').count()) === 1, String(await T('#cotList [data-cot]').count()));
  await T('#qMes').selectOption(M0);
  ok('Cotizaciones: mes actual muestra las 2 elaboradas', (await T('#cotList [data-cot]').count()) === 2 && /2 cotizaciones elaboradas/.test(await T('#view').innerText()));
  await T('.tab[data-view="reservas"]:visible').click();
  ok('Reservas: conserva el mes y oculta la cancelada', (await T('#rMes').inputValue()) === M0 && (await T('#resList [data-res]').count()) === 1, String(await T('#resList [data-res]').count()));
  await T('#re').selectOption('todas');
  ok('Reservas: con "Todas" incluye la cancelada del mes', (await T('#resList [data-res]').count()) === 2);
  await T('[data-mes-quitar]').click();
  ok('Reservas: "Ver todos los meses" quita el filtro', (await T('#rMes').inputValue()) === 'todos' && (await T('#resList [data-res]').count()) === 3);
  await shot('02-reservas');

  // ---- Resumen del mes
  await T('.tab[data-view="inicio"]:visible').click();
  await T('[data-view-go="resumen"]').click();
  await page.waitForSelector('#resMes');
  let v = plano(await T('#view').innerText());
  ok('Resumen: abre en el mes actual', (await T('#resMes').inputValue()) === M0 && new RegExp(etiqueta(M0), 'i').test(await T('.page-head h1').innerText()));
  ok('Resumen: valor vendido y número de ventas (sin la cancelada)', /Valor vendido \$\s?6\.000\.000 1 venta/.test(v), v.slice(0, 300));
  ok('Resumen: comparación con el mes anterior', /▲ 50% frente a/.test(v));
  ok('Resumen: clientes nuevos 2, cotizaciones 2, aceptadas 1', /Clientes nuevos 2/.test(v) && /Cotizaciones elaboradas 2 50% ya aceptadas/.test(v) && /aceptadas en el mes 1/.test(v));
  ok('Resumen: recibido, pagado y diferencia', /Recibido de clientes \$\s?2\.000\.000/.test(v) && /Pagado a proveedores \$\s?1\.500\.000/.test(v) && /Diferencia recibido − pagado \$\s?500\.000/.test(v));
  ok('Resumen: origen de clientes y destinos', /Instagram 1/.test(v) && /WhatsApp 1/.test(v) && /San Andrés 1 \$\s?6\.000\.000/.test(v));
  ok('Resumen: lista de ventas con saldo', /RS-0001/.test(v) && /\$\s?4\.000\.000/.test(v) && !/RS-0003/.test(v));
  ok('Resumen: gráfico de 6 meses con el mes elegido resaltado', (await T('.grafico .gbar').count()) === 6 && (await T('.grafico .gbar.sel').getAttribute('data-mes-ir')) === M0);
  await shot('03-resumen');
  // CSV
  const [dl] = await Promise.all([page.waitForEvent('download'), T('[data-act="exp-mes"]').click()]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  ok('Resumen: descarga para Excel del mes', dl.suggestedFilename() === 'diamond-travel-resumen-' + M0 + '.csv' && /Valor vendido COP;6000000/.test(csv) && /RS-0001;Cliente Prueba Uno/.test(csv) && /Cliente Prueba Dos;3000000000;WhatsApp/.test(csv), csv.slice(0, 200));
  // Tocar la barra del mes anterior
  await T('.grafico .gbar[data-mes-ir="' + M1 + '"]').click();
  v = plano(await T('#view').innerText());
  ok('Resumen: tocar una barra cambia de mes', (await T('#resMes').inputValue()) === M1 && /Valor vendido \$\s?4\.000\.000 1 venta/.test(v) && /Recibido de clientes \$\s?4\.000\.000/.test(v) && /Clientes nuevos 1/.test(v));
  await T('#resMes').selectOption(M3);
  v = plano(await T('#view').innerText());
  ok('Resumen: mes sin ventas lo dice claramente', /Valor vendido \$\s?0 0 ventas/.test(v) && /No hay ventas este mes/.test(v) && /Clientes nuevos 1/.test(v));
  await T('.grafico details summary').click();
  ok('Resumen: tabla con los datos del gráfico', (await T('.grafico details tbody tr').count()) === 6);
  errores.push(...page.errores);

  // ---- Modo oscuro y teléfono
  const dbTxt = await page.evaluate(() => localStorage.getItem('mock-supabase-db'));
  const p2 = await nuevaPagina(browser, { width: 390, height: 844 }, `if(!sessionStorage.getItem('sembrado')){localStorage.setItem('mock-supabase-db',${JSON.stringify(dbTxt)});sessionStorage.setItem('sembrado','1');}`);
  await entrarAdminSiHaceFalta(p2);
  const visibles = await p2.locator('#tabNav .tab:visible').allInnerTexts();
  ok('Teléfono: el menú inferior no cambia', visibles.map(x => x.trim()).join(',') === 'Inicio,Clientes,Cotizaciones,Reservas,Pagos,Más', visibles.join(','));
  await p2.locator('#tabNav [data-mas]').click();
  await p2.locator('[data-mas-ir="resumen"]').click();
  await p2.waitForSelector('#resMes');
  ok('Teléfono: Resumen desde "Más" sin desbordar la pantalla', !(await p2.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  await p2.screenshot({ path: path.join(OUT, '04-movil.png'), fullPage: true });
  await p2.emulateMedia({ colorScheme: 'dark' });
  await p2.screenshot({ path: path.join(OUT, '05-movil-oscuro.png'), fullPage: true });
  errores.push(...p2.errores);

  ok('Sin errores de JavaScript', errores.length === 0, errores.slice(0, 4).join(' || '));
  await browser.close();
  console.log(results.join('\n'));
  const f = results.filter(r => r.startsWith('FAIL')).length;
  console.log(f ? f + ' FALLAS' : 'TODO OK (' + results.length + ')');
  process.exit(f ? 1 : 0);
})().catch(e => { console.log(results.join('\n')); console.error('ERROR', e.message); process.exit(1); });

async function entrarAdminSiHaceFalta(page) {
  if (await page.locator('.tab[data-view="inicio"]:visible').count()) return;
  await page.waitForSelector('#fLogin, .tab[data-view="inicio"]:visible');
  if (await page.locator('#fLogin').isVisible()) {
    await page.fill('#lEmail', 'reservasdiamondtravel@gmail.com'); await page.fill('#lPass', 'Prueba-1234'); await page.click('#lBtn');
    await page.waitForSelector('.tab[data-view="inicio"]:visible');
  }
}
