// Prueba de extremo a extremo: pagos (cuotas, proveedores, Pagos de hoy, recibos). Datos ficticios, Supabase simulado.
// Uso: node web-pruebas/e2e-pagos.js
const { chromium } = require(process.env.PW || '/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const G = process.env.NODE_GLOBAL || '/home/claude/.npm-global/lib/node_modules/';
const WEB = path.join(__dirname, '..', 'web');
const OUT = path.join(process.env.OUT || '/tmp', 'shots-pagos'); fs.mkdirSync(OUT, { recursive: true });
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
async function textoPDF(file) {
  const pdfjs = await import(G + 'pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), isEvalSupported: false, verbosity: 0 }).promise;
  let t = ''; for (let i = 1; i <= doc.numPages; i++) t += (await (await doc.getPage(i)).getTextContent()).items.map(x => x.str).join(' ') + '\n';
  return t;
}

(async () => {
  const browser = await chromium.launch();
  const page = await nuevaPagina(browser);
  const T = (s, o) => page.locator(s, o);
  const shot = n => page.screenshot({ path: path.join(OUT, n + '.png') });
  const errores = [];
  await entrarAdmin(page);
  await T('button[data-act="demo"]:visible').first().click();
  await page.waitForFunction(() => window.__mockDB().clientes.length === 3);
  // Cotización aceptada (total $6.000.000) y su reserva RS-0001 (datos ficticios)
  await page.evaluate(({ IDA, VUELTA }) => {
    const db = window.__mockDB(), laura = db.clientes.find(c => c.nombre.startsWith('Laura')), ahora = new Date().toISOString(), adm = db.perfiles[0].id;
    const qid = crypto.randomUUID();
    db.seq = 1; db.seqR = 1;
    db.cotizaciones.push({ id: qid, numero: 1, estado: 'aceptada', cliente_id: laura.id, asesor_id: adm, fecha_elaboracion: ahora.slice(0, 10), fecha_vencimiento: null, moneda: 'COP', total: 6000000,
      datos: { cliente: { nombre: laura.nombre, telefono: laura.telefono, email: '' }, viaje: { destinos: 'San Andrés', adultos: 2, ninos: 0 }, servicios: [], valores: { moneda: 'COP', opciones: [{ precioAdulto: 3000000 }], cargos: [], descuentos: [] }, condiciones: {} },
      historial_estados: [], ejemplo: false, creado_por: adm, creado_en: ahora, actualizado_en: ahora });
    db.reservas.push({ id: crypto.randomUUID(), numero: 1, estado: 'confirmada', cliente_id: laura.id, cotizacion_id: qid, asesor_id: adm, destino: 'San Andrés', fecha_inicio: IDA, fecha_fin: VUELTA, voucher_enviado_en: null, ejemplo: false, creado_por: adm, creado_en: ahora, actualizado_en: ahora,
      datos: { titular: { nombre: laura.nombre, telefono: laura.telefono, email: '' }, fechaInicio: IDA, fechaFin: VUELTA, pasajeros: [{ id: 'pa1', nombre: laura.nombre, tipo: 'adulto' }],
        vuelos: [], hoteles: [{ nombre: 'Hotel de prueba San Andrés', ciudad: 'San Andrés', entrada: IDA, salida: VUELTA }], traslados: [], actividades: [{ titulo: 'Actividades en San Andrés', items: [{ nombre: 'Tour de prueba', proveedor: 'Operador de prueba' }] }],
        incluye: [], asistencia: {}, historialEstados: [] } });
    localStorage.setItem('mock-supabase-db', JSON.stringify(db));
  }, { IDA: enDias(30), VUELTA: enDias(35) });
  await page.reload(); await page.waitForSelector('.tab[data-view="inicio"]:visible');
  ok('Menú con la sección Pagos', await T('.tab[data-view="pagos"]:visible').count() === 1);
  ok('Inicio: "Pagos de hoy" al día', /Pagos de hoy\s*Al día/.test(await T('#pagosHoy').innerText()));

  // ---- Programar pagos desde la reserva
  await T('.tab[data-view="reservas"]:visible').click();
  await T('#resList [data-res]').first().click();
  await page.waitForSelector('#rPlan');
  await T('#rPlan').click();
  await page.waitForSelector('.sheet.plan');
  ok('Valor del viaje tomado de la cotización', (await T('[data-pe="valorTotal"]').inputValue()) === '6.000.000');
  await T('#peN').fill('3'); await T('[data-pe-a="dividir"]').click();
  ok('Divide el total en 3 cuotas iguales', (await T('[data-pe="cobros.0.valor"]').inputValue()) === '2.000.000' && (await T('[data-pe="cobros.2.valor"]').inputValue()) === '2.000.000');
  ok('Indica que las cuotas coinciden con el total', /Coinciden con el total/.test(await T('#pePie').innerText()));
  await T('[data-pe="cobros.0.fecha"]').fill(enDias(-2));
  await T('[data-pe="cobros.1.fecha"]').fill(enDias(0));
  await T('[data-pe-a="add-prov"][data-prov="Hotel de prueba San Andrés"]').click();
  ok('Sugiere los proveedores de la reserva', (await T('[data-pe="pagos.0.proveedor"]').inputValue()) === 'Hotel de prueba San Andrés' && (await T('[data-pe="pagos.0.categoria"]').inputValue()) === 'Hotel' && (await T('[data-pe-a="add-prov"][data-prov="Operador de prueba"]').count()) === 1);
  await T('[data-pe="pagos.0.concepto"]').fill('Saldo del hotel');
  await T('[data-pe="pagos.0.valor"]').pressSequentially('3000000');
  await T('[data-pe="pagos.0.fecha"]').fill(enDias(5));
  await T('[data-pe-a="save"]').click();
  ok('Exige la fecha límite de cada pago', (await T('.sheet.plan .errbox').count()) === 1 && (await T('[data-pe="cobros.2.fecha"].bad').count()) === 1);
  await T('[data-pe="cobros.2.fecha"]').fill(enDias(20));
  await shot('01-plan');
  await T('[data-pe-a="save"]').click();
  await page.waitForFunction(() => window.__mockDB().pagos.length === 4);
  const db1 = await page.evaluate(() => window.__mockDB());
  ok('Plan guardado: 3 cuotas y 1 pago a proveedor', db1.pagos.filter(p => p.tipo === 'cobro').length === 3 && db1.pagos.filter(p => p.tipo === 'pago').length === 1 && db1.reservas[0].datos.valorTotal === 6000000);
  await page.waitForSelector('#resPagos');
  const rp = plano(await T('#resPagos').innerText());
  ok('La reserva muestra valor, pagado y saldo', /Valor del viaje \$ 6\.000\.000 Pagado \$ 0 Saldo \$ 6\.000\.000/.test(rp), rp.slice(0, 200));
  ok('Cuotas con su estado', /Cuota 1 de 3/.test(rp) && /Venció hace 2 días/.test(rp) && /Vence hoy/.test(rp) && /Saldo del hotel/.test(rp));
  await T('#rClose').click();

  // ---- Pagos de hoy (Inicio)
  await T('.tab[data-view="inicio"]:visible').click();
  const ph = plano(await T('#pagosHoy').innerText());
  ok('Pagos de hoy: vencidos y de hoy, sin los futuros', /2 pendientes/.test(ph) && /Por cobrar: \$ 4\.000\.000/.test(ph) && /Por pagar: \$ 0/.test(ph) && !/Saldo del hotel/.test(ph), ph.slice(0, 300));
  const href = await T('#pagosHoy [data-pg-rec]').first().getAttribute('href');
  ok('Recordatorio por WhatsApp con la cuota y el saldo', decodeURIComponent(href).includes('el ' + ddmm(enDias(-2)) + ' venció la cuota 1 de 3 de tu viaje a San Andrés (reserva RS-0001), por $ 2.000.000') && decodeURIComponent(href).includes('Saldo total pendiente del viaje: $ 6.000.000'), decodeURIComponent(href).slice(0, 300));
  const [pop] = await Promise.all([page.waitForEvent('popup').catch(() => null), T('#pagosHoy [data-pg-rec]').first().click()]);
  if (pop) await pop.close().catch(() => {});
  await page.waitForFunction(() => window.__mockDB().historial.some(h => /Recordatorio de pago enviado/.test(h.texto)));
  ok('El recordatorio queda en el historial del cliente', true);
  await shot('02-pagos-hoy');

  // ---- Ya me pagó (parcial) y recibo
  await T('#pagosHoy [data-pg-abono]').first().click();
  await page.waitForSelector('#abValor');
  ok('Propone el valor pendiente', (await T('#abValor').inputValue()) === '2.000.000');
  await T('#abValor').fill(''); await T('#abValor').pressSequentially('1500000');
  await T('#abMedio').selectOption('Nequi'); await T('#abRef').fill('M-0001');
  await T('#abSi').click();
  await page.waitForSelector('#cSi');
  ok('Confirma el pago con el número de recibo', /RC-0001/.test(await T('.sheet.confirm').innerText()));
  await T('#cSi').click();
  await page.waitForFunction(() => document.querySelectorAll('#rcPages canvas').length > 0 || /no se pudo/i.test((document.getElementById('rcStatus') || {}).textContent || ''), null, { timeout: 30000 });
  ok('Genera el recibo', (await T('#rcPages canvas').count()) > 0, await T('#rcStatus').innerText());
  ok('Mensaje de WhatsApp del recibo', decodeURIComponent(await T('#rcWa').getAttribute('href')).includes('recibimos tu pago de $ 1.500.000 (Cuota 1 de 3) de tu viaje a San Andrés (reserva RS-0001)'));
  const [dl] = await Promise.all([page.waitForEvent('download'), T('#rcDown').click()]);
  const f = path.join(OUT, await dl.suggestedFilename()); await dl.saveAs(f);
  const tr = (await textoPDF(f)).replace(/\s+/g, '');
  ok('Recibo con valor, medio, saldo y próximas cuotas', path.basename(f) === 'Recibo-RC-0001-Laura-Mendez-prueba.pdf' && ['RC-0001', '$1.500.000', 'Nequi', 'M-0001', '$4.500.000', 'Cuota2de3', 'Cuota3de3'].every(x => tr.includes(x)), path.basename(f));
  await T('#rcClose').click();
  ok('Queda en el historial del cliente', await page.evaluate(() => window.__mockDB().historial.some(h => /Pago recibido: \$ 1\.500\.000 — Cuota 1 de 3/.test(h.texto))));
  const ph2 = plano(await T('#pagosHoy').innerText());
  ok('El pago parcial sigue pendiente hasta completarse', /Pagado \$ 1\.500\.000 de \$ 2\.000\.000/.test(ph2) && /\$ 500\.000/.test(ph2));
  // No se puede pagar de más
  await T('#pagosHoy [data-pg-abono]').first().click();
  await T('#abValor').fill(''); await T('#abValor').pressSequentially('900000'); await T('#abSi').click();
  ok('No permite pagar más de lo pendiente', /supera lo pendiente/.test(await T('#abErr').innerText()));
  await T('#abValor').fill(''); await T('#abValor').pressSequentially('500000'); await T('#abSi').click();
  await T('#cNo').click();
  await page.waitForFunction(() => window.__mockDB().abonos.length === 2);
  ok('Cuota pagada: sale de Pagos de hoy', !/Venció hace 2 días/.test(await T('#pagosHoy').innerText()) && /1 pendiente/.test(await T('#pagosHoy').innerText()));

  // ---- Vista Pagos
  await T('.tab[data-view="pagos"]:visible').click();
  const vp = plano(await T('#view').innerText());
  ok('Totales por cobrar, por pagar y recibido este mes', /Por cobrar a clientes \$ 4\.000\.000/.test(vp) && /Por pagar a proveedores \$ 3\.000\.000/.test(vp) && /Recibido este mes \$ 2\.000\.000/.test(vp), vp.slice(0, 400));
  ok('Agrupa: vencen hoy y próximos 7 días', /Vencen hoy/.test(vp) && /Próximos 7 días/.test(vp) && /Saldo del hotel/.test(vp) && !/Cuota 3 de 3/.test(vp));
  await shot('03-vista-pagos');
  await T('#pgPer').selectOption('pendientes');
  ok('Todos los pendientes incluye "Más adelante"', /Más adelante/.test(await T('#view').innerText()) && /Cuota 3 de 3/.test(await T('#view').innerText()));
  await T('#pgTipo').selectOption('pago');
  await T('[data-pg-abono]').first().click();
  ok('Ya pagué: propone el valor del proveedor', (await T('#abValor').inputValue()) === '3.000.000');
  await T('#abMedio').selectOption('Transferencia Bancolombia'); await T('#abSi').click();
  await page.waitForFunction(() => window.__mockDB().abonos.length === 3);
  ok('Pago a proveedor sin recibo de cliente', await page.evaluate(() => window.__mockDB().abonos[2].numero === null));
  await T('#pgTipo').selectOption('todos'); await T('#pgPer').selectOption('pagados');
  const pr = plano(await T('#pgList').innerText());
  ok('Lista de pagos registrados', /Hotel de prueba San Andrés · \$ 3\.000\.000/.test(pr) && /Recibo RC-0002/.test(pr) && /Recibo RC-0001/.test(pr), pr.slice(0, 300));
  // ---- Deshacer (admin)
  await T('.tab[data-view="reservas"]:visible').click();
  await T('#resList [data-res]').first().click();
  await page.waitForSelector('[data-pg-deshacer]');
  await T('[data-pg-deshacer]').nth(1).click(); await T('#cSi').click();
  await page.waitForFunction(() => window.__mockDB().abonos.length === 2);
  ok('Admin deshace un pago y vuelve a quedar pendiente', /Pagado \$ 1\.500\.000 de \$ 2\.000\.000/.test(plano(await T('#resPagos').innerText())));
  // El plan no deja bajar una cuota por debajo de lo pagado ni borrarla
  await T('#rPlan').click(); await page.waitForSelector('.sheet.plan');
  ok('Cuota con pagos: no se puede quitar', (await T('[data-pe-a="del"][data-l="cobros"][data-i="0"]').count()) === 0);
  await T('[data-pe="cobros.0.valor"]').fill(''); await T('[data-pe="cobros.0.valor"]').pressSequentially('1000000');
  await T('[data-pe-a="save"]').click();
  ok('Ni bajar su valor por debajo de lo pagado', (await T('[data-pe="cobros.0.valor"].bad').count()) === 1);
  await T('[data-pe-a="close"]').first().click(); await T('#cSi').click();
  await T('#rClose').click();
  // ---- Datos de pago en el recordatorio
  await T('.tab[data-view="equipo"]:visible').click();
  await T('#dpTxt').fill('Bancolombia ahorros 000-000000-00 (prueba)'); await T('#dpGuardar').click();
  await page.waitForFunction(() => window.__mockDB().config.some(c => c.clave === 'pagos'));
  await T('.tab[data-view="inicio"]:visible').click();
  ok('El recordatorio incluye los datos para pagar', decodeURIComponent(await T('#pagosHoy [data-pg-rec]').first().getAttribute('href')).includes('Puedes pagar así:\nBancolombia ahorros 000-000000-00 (prueba)'));
  // ---- Respaldo
  await T('.tab[data-view="respaldo"]:visible').click();
  const [dj] = await Promise.all([page.waitForEvent('download'), T('[data-act="exp-json"]').click()]);
  const fj = path.join(OUT, 'respaldo.json'); await dj.saveAs(fj);
  const rj = JSON.parse(fs.readFileSync(fj, 'utf8'));
  ok('El respaldo incluye pagos y abonos', rj.pagos.length === 4 && rj.abonos.length === 2);
  errores.push(...page.errores);

  // ---- Sin la actualización 5
  const p2 = await nuevaPagina(browser, null, () => { try { localStorage.setItem('mock-sin-05', '1'); } catch (_) {} });
  await entrarAdmin(p2);
  ok('Sin la actualización 5: aviso al administrador', /05-pagos\.sql/.test(await p2.locator('#view').innerText()));
  await p2.locator('.tab[data-view="pagos"]:visible').click();
  ok('Sin la actualización 5: Pagos explica cómo activarlo', /Falta activar los pagos/.test(await p2.locator('#view').innerText()));
  errores.push(...p2.errores);

  // ---- Teléfono: menú con "Más"
  const p3 = await nuevaPagina(browser, { width: 390, height: 844 });
  await entrarAdmin(p3);
  const visibles = await p3.locator('#tabNav .tab:visible').allInnerTexts();
  ok('Teléfono: menú inferior con "Más"', visibles.map(x => x.trim()).join(',') === 'Inicio,Clientes,Cotizaciones,Reservas,Pagos,Más' && !(await p3.evaluate(() => document.documentElement.scrollWidth > innerWidth)), visibles.join(','));
  await p3.locator('#tabNav [data-mas]').click();
  await p3.locator('[data-mas-ir="respaldo"]').click();
  ok('Teléfono: "Más" lleva a Respaldo, Embudo y Equipo', /Respaldo/.test(await p3.locator('.page-head h1').innerText()) && (await p3.locator('#tabNav [data-mas][aria-current="page"]').count()) === 1);
  await p3.screenshot({ path: path.join(OUT, '04-movil.png') });
  errores.push(...p3.errores);

  ok('Sin errores de JavaScript', errores.length === 0, errores.slice(0, 4).join(' || '));
  console.log(results.join('\n'));
  await browser.close();
  process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.log(results.join('\n')); console.error('ERROR', e.message); process.exit(1); });
