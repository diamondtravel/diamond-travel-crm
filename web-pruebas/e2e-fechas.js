// Prueba de extremo a extremo: cotización con varias fechas y trayectos con escala (datos ficticios, Supabase simulado).
// Uso: node web-pruebas/e2e-fechas.js
const { chromium } = require(process.env.PW || '/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const G = process.env.NODE_GLOBAL || '/home/claude/.npm-global/lib/node_modules/';
const WEB = path.join(__dirname, '..', 'web');
const OUT = path.join(process.env.OUT || '/tmp', 'shots-fechas'); fs.mkdirSync(OUT, { recursive: true });
const results = []; const ok = (n, c, x) => results.push((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : ''));
const tipos = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const enDias = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const plano = t => t.replace(/\s+/g, ' ');

async function nuevaPagina(browser, vp) {
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
  await page.goto('https://crm.test/');
  return page;
}
async function entrarAdmin(page) {
  await page.waitForSelector('#fLogin');
  await page.fill('#lEmail', 'reservasdiamondtravel@gmail.com'); await page.fill('#lPass', 'Prueba-1234'); await page.click('#lBtn');
  await page.waitForSelector('#fNombre'); await page.fill('#mNom', 'Nicol Prueba'); await page.click('#fNombre button[type=submit]');
  await page.waitForSelector('.tab[data-view="inicio"]:visible');
}

(async () => {
  const browser = await chromium.launch();
  const page = await nuevaPagina(browser);
  const T = (s, o) => page.locator(s, o);
  const shot = n => page.screenshot({ path: path.join(OUT, n + '.png') });
  await entrarAdmin(page);
  await T('button[data-act="demo"]:visible').first().click();
  await page.waitForFunction(() => window.__mockDB().clientes.length === 3);
  const IDA1 = enDias(45), REG1 = enDias(49), IDA2 = enDias(75), REG2 = enDias(80);

  // ---- Fecha 1: trayectos con escala
  await T('.tab[data-view="cotizaciones"]:visible').click();
  await T('button[data-act="nueva-cot"]:visible').first().click();
  await T('#cliBusca').fill('Laura'); await T('button.pick', { hasText: 'Laura' }).click();
  await T('.ed-tab[data-tab="viaje"]').click();
  await T('#e_viaje_destinos').fill('San Andrés'); await T('#e_viaje_ciudadSalida').fill('Cúcuta'); await T('#e_viaje_adultos').fill('2');
  await T('#e_fechas_0_fechaIda').fill(IDA1); await T('#e_fechas_0_fechaRegreso').fill(REG1);
  ok('Noches de la fecha 1 calculadas', (await T('#e_fechas_0_noches').inputValue()) === '4');
  await T('[data-ed="add-tramo"]').click();
  ok('Primer trayecto: ida con ruta y fecha propuestas', (await T('#e_fechas_0_tramos_0_tipo').inputValue()) === 'ida' && (await T('#e_fechas_0_tramos_0_ruta').inputValue()) === 'Cúcuta – San Andrés' && (await T('#e_fechas_0_tramos_0_fecha').inputValue()) === IDA1);
  ok('El campo de escala aparece solo con escala', await T('[data-escala-en="0"]').isHidden());
  await T('#e_fechas_0_tramos_0_escala').selectOption('escala');
  ok('Al elegir "Con escala" pide la ciudad', await T('[data-escala-en="0"]').isVisible());
  await T('#e_fechas_0_tramos_0_escalaEn').fill('Bogotá');
  await T('#e_fechas_0_tramos_0_salida').fill('06:10'); await T('#e_fechas_0_tramos_0_llegada').fill('10:05');
  await T('[data-ed="add-regreso"]').click();
  ok('Regreso propuesto (ruta invertida, fecha de regreso, misma escala)', (await T('#e_fechas_0_tramos_1_tipo').inputValue()) === 'regreso' && (await T('#e_fechas_0_tramos_1_ruta').inputValue()) === 'San Andrés – Cúcuta' && (await T('#e_fechas_0_tramos_1_fecha').inputValue()) === REG1 && (await T('#e_fechas_0_tramos_1_escalaEn').inputValue()) === 'Bogotá');
  await T('#e_fechas_0_hotel').fill('Hotel de prueba San Andrés');
  await T('.ed-tab[data-tab="servicios"]').click();
  await T('button[data-ed="sug-serv"]', { hasText: 'Tiquetes aéreos' }).click();
  await T('.ed-tab[data-tab="valores"]').click();
  await T('#e_fechas_0_opciones_0_nombre').fill('Solo desayuno'); await T('#e_fechas_0_opciones_0_precioAdulto').pressSequentially('2000000');
  await T('button[data-ed="add-opcion"]').click();
  await T('#e_fechas_0_opciones_1_nombre').fill('Todo incluido'); await T('#e_fechas_0_opciones_1_precioAdulto').pressSequentially('2800000');

  // ---- Fecha 2 copiada de la 1
  await T('.ed-tab[data-tab="viaje"]').click();
  await T('[data-ed="add-fecha"]').click();
  ok('Agregar otra fecha copia hotel, trayectos y escalas', (await T('#e_fechas_1_hotel').inputValue()) === 'Hotel de prueba San Andrés' && (await T('#e_fechas_1_tramos_0_ruta').inputValue()) === 'Cúcuta – San Andrés' && (await T('#e_fechas_1_tramos_0_escalaEn').inputValue()) === 'Bogotá');
  ok('…sin fechas', (await T('#e_fechas_1_fechaIda').inputValue()) === '' && (await T('#e_fechas_1_tramos_0_fecha').inputValue()) === '');
  ok('Selector con 2 fechas y la 2 activa', (await T('[data-ed="fecha"]').count()) === 2 && (await T('[data-ed="fecha"][data-i="1"]').getAttribute('aria-pressed')) === 'true');
  await shot('01-fecha2');
  // Validación: la fecha 2 necesita su fecha de ida y sus precios
  await T('button[data-ed="save-pdf"]').click();
  await page.waitForSelector('.errbox');
  const eb = await T('.errbox').innerText();
  ok('Valida la fecha 2 por separado', /Fecha 2: Escribe la fecha de ida/.test(eb) && /Fecha 2: Falta el precio por adulto en la opción 1/.test(eb), plano(eb).slice(0, 300));
  await T('.errbox button', { hasText: 'Fecha 2: Falta el precio por adulto en la opción 1' }).click();
  ok('El error lleva a la fecha y al campo', (await T('[data-ed="fecha"][data-i="1"]').getAttribute('aria-pressed')) === 'true' && (await T('#e_fechas_1_opciones_0_precioAdulto').count()) === 1);
  ok('Los nombres de las opciones se copian, los precios no', (await T('#e_fechas_1_opciones_1_nombre').inputValue()) === 'Todo incluido' && (await T('#e_fechas_1_opciones_1_precioAdulto').inputValue()) === '');
  await T('#e_fechas_1_opciones_0_precioAdulto').pressSequentially('1800000');
  await T('#e_fechas_1_opciones_1_precioAdulto').pressSequentially('2500000');
  const calc = plano(await T('#calcBox').innerText());
  ok('Resumen con las 4 opciones', /Resumen de todas las fechas/.test(calc) && (calc.match(/Fecha [12] [(·]/g) || []).length === 4, calc.slice(-300));
  ok('Pie: 4 opciones desde el menor valor', /4 opciones · desde \$ 3\.600\.000/.test(plano(await T('#edTotal').innerText())));
  await T('.ed-tab[data-tab="viaje"]').click();
  await T('#e_fechas_1_fechaIda').fill(IDA2); await T('#e_fechas_1_fechaRegreso').fill(REG2);
  await T('#e_fechas_1_tramos_0_fecha').fill(IDA2); await T('#e_fechas_1_tramos_1_fecha').fill(REG2);
  ok('El selector muestra las fechas de cada opción', /Fecha 2 · /.test(await T('[data-ed="fecha"][data-i="1"]').innerText()));
  await T('[data-ed="fecha"][data-i="0"]').click();
  ok('Volver a la fecha 1 conserva sus datos', (await T('#e_fechas_0_fechaIda').inputValue()) === IDA1);
  await shot('02-viaje');

  // ---- Guardar y PDF
  await T('button[data-ed="save-pdf"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#pvPages canvas').length > 0 || /no se pudo/i.test((document.getElementById('pvStatus') || {}).textContent || ''), null, { timeout: 30000 });
  ok('Genera el PDF con varias fechas', (await T('#pvPages canvas').count()) > 0, await T('#pvStatus').innerText());
  const q = await page.evaluate(() => window.__mockDB().cotizaciones[0]);
  ok('Guarda las 2 fechas y deja la primera en los campos de siempre', q.datos.fechas.length === 2 && q.datos.viaje.fechaIda === IDA1 && q.datos.fechas[1].tramos[0].escala === 'escala');
  const [dl] = await Promise.all([page.waitForEvent('download'), T('#pvDown').click()]);
  const f = path.join(OUT, 'varias-fechas.pdf'); await dl.saveAs(f);
  const pdfjs = await import(G + 'pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(f)), isEvalSupported: false, verbosity: 0 }).promise;
  let txt = ''; for (let i = 1; i <= doc.numPages; i++) txt += (await (await doc.getPage(i)).getTextContent()).items.map(x => x.str).join(' ');
  const tp = txt.replace(/\s+/g, '');
  ok('El PDF trae cada fecha, las escalas y el resumen', ['OPCIÓNDEFECHA1', 'OPCIÓNDEFECHA2', 'ConescalaenBogotá', 'Regreso', 'Resumendeopciones', '$3.600.000', '$5.000.000', '2opcionesdefecha'].every(x => tp.includes(x)), doc.numPages + ' páginas');
  await T('#pvClose').click();
  ok('Ficha: "Desde" el menor valor', /Desde \$ 3\.600\.000/.test(await T('.pass-stub').innerText()));
  const wa = decodeURIComponent(await T('#qWa').getAttribute('href'));
  ok('WhatsApp lista las 4 opciones con su fecha', /con 2 opciones de fecha/.test(wa) && (wa.match(/• Fecha/g) || []).length === 4, wa.slice(0, 400));

  // ---- Aceptar: elegir fecha y opción
  await T('#qEstado').selectOption('aceptada');
  await page.waitForSelector('[data-op="3"]');
  ok('Se elige entre las 4 opciones', (await T('[data-op]').count()) === 4 && /Fecha 2 .*Opción 2 – Todo incluido/.test(await T('[data-op="3"]').innerText()));
  await T('[data-op="3"]').click();
  await page.waitForSelector('#cSi'); await T('#cSi').click();
  await page.waitForFunction(() => window.__mockDB().cotizaciones[0].estado === 'aceptada');
  const qa = await page.evaluate(() => window.__mockDB().cotizaciones[0]);
  ok('Queda la fecha 2 / Todo incluido como elegida', qa.datos.valores.eleccion.fecha === 1 && qa.datos.valores.eleccion.opcion === 1 && qa.total === 5000000 && qa.datos.viaje.fechaIda === IDA2, JSON.stringify(qa.datos.valores.eleccion) + ' ' + qa.total);

  // ---- Reserva con la fecha elegida (escala → dos tramos)
  await page.waitForSelector('#qCrearRes');
  await T('#qCrearRes').click();
  await page.waitForSelector('.sheet.reditor');
  ok('La reserva toma las fechas de la opción elegida', (await T('#r_fechaInicio').inputValue()) === IDA2 && (await T('#r_fechaFin').inputValue()) === REG2);
  await T('.reditor .ed-tab[data-tab="vuelos"]').click();
  ok('Cada vuelo con escala se divide en dos tramos', (await T('[data-rk$=".origen"][data-rk^="vuelos.0.trayectos."]').count()) === 4 && (await T('#r_vuelos_0_trayectos_0_destino').inputValue()) === 'Bogotá' && (await T('#r_vuelos_0_trayectos_1_origen').inputValue()) === 'Bogotá' && (await T('#r_vuelos_0_trayectos_1_destino').inputValue()) === 'San Andrés');
  await T('[data-r="save"]').click();
  await page.waitForFunction(() => window.__mockDB().reservas.length === 1);
  await T('[data-r="close"]').click();
  await T('.tab[data-view="reservas"]:visible').click().catch(() => {});
  // ---- Pagos: el valor del viaje es el de la opción elegida
  await page.evaluate(() => { document.querySelectorAll('#overlayRoot .overlay').forEach(o => o.remove()); document.body.style.overflow = ''; });
  await page.reload(); await page.waitForSelector('.tab[data-view="reservas"]:visible'); await T('.tab[data-view="reservas"]:visible').click();
  await T('#resList [data-res]').first().click();
  await page.waitForSelector('#rPlan'); await T('#rPlan').click();
  ok('El plan de pagos toma el valor de la opción elegida', (await T('[data-pe="valorTotal"]').inputValue()) === '5.000.000');
  await T('[data-pe-a="close"]').first().click();
  await T('#rClose').click();

  // ---- Plantilla con 2 fechas
  await T('.tab[data-view="cotizaciones"]:visible').click();
  await T('[data-cot]').first().click();
  await page.waitForSelector('#qDup'); await T('#qDup').click();
  await page.waitForSelector('.sheet.editor');
  await T('.ed-tab[data-tab="viaje"]').click();
  ok('Duplicar conserva las 2 fechas', (await T('[data-ed="fecha"]').count()) === 2 && (await T('#e_fechas_1_fechaIda').count()) + (await T('#e_fechas_0_fechaIda').count()) === 1);
  await T('button[data-ed="guardar-plantilla"]').click();
  await T('#plNom').fill('San Andrés dos fechas (prueba)'); await T('#plSi').click();
  await page.waitForFunction(() => window.__mockDB().plantillas.length === 1);
  const pl = await page.evaluate(() => window.__mockDB().plantillas[0].datos);
  ok('La plantilla guarda las 2 fechas sin fechas ni precios', pl.fechas.length === 2 && pl.fechas.every(x => !x.fechaIda && x.opciones.every(o => o.precioAdulto == null) && x.tramos.every(t => !t.fecha)) && pl.fechas[0].tramos[0].escalaEn === 'Bogotá');
  await T('button[data-ed="close"]').click(); await page.waitForTimeout(200); if (await T('#cSi').count()) await T('#cSi').click();
  await T('#qClose').click();
  await T('button[data-act="plantillas"]:visible').click();
  await T('[data-tp-usar]').first().click();
  await page.waitForSelector('#plSel');
  await T('.ed-tab[data-tab="viaje"]').click();
  ok('Usar la plantilla trae las 2 fechas para completar', (await T('[data-ed="fecha"]').count()) === 2 && (await T('#e_fechas_0_hotel').inputValue()) === 'Hotel de prueba San Andrés');
  await T('button[data-ed="close"]').click(); if (await T('#cSi').count()) await T('#cSi').click();

  // ---- Teléfono
  const p3 = await nuevaPagina(browser, { width: 390, height: 844 });
  await entrarAdmin(p3);
  await p3.locator('.tab[data-view="cotizaciones"]:visible').click();
  await p3.locator('button[data-act="nueva-cot"]:visible').first().click();
  await p3.locator('.ed-tab[data-tab="viaje"]').click();
  await p3.locator('[data-ed="add-tramo"]').click(); await p3.locator('[data-ed="add-fecha"]').click();
  ok('Teléfono: sin desplazamiento horizontal', !(await p3.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  await p3.screenshot({ path: path.join(OUT, '03-movil.png') });

  const errores = page.errores.concat(p3.errores);
  ok('Sin errores de JavaScript', errores.length === 0, errores.slice(0, 4).join(' || '));
  console.log(results.join('\n'));
  await browser.close();
  process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.log(results.join('\n')); console.error('ERROR', e.message); process.exit(1); });
