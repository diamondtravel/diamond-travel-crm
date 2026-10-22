// Prueba de extremo a extremo: opciones de precio, plantillas, pestañas fijas y Seguimientos de hoy.
// Datos ficticios y Supabase simulado. Uso: node web-pruebas/e2e-novedades.js
const { chromium } = require(process.env.PW || '/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const G = process.env.NODE_GLOBAL || '/home/claude/.npm-global/lib/node_modules/';
const WEB = path.join(__dirname, '..', 'web');
const OUT = path.join(process.env.OUT || '/tmp', 'shots-novedades'); fs.mkdirSync(OUT, { recursive: true });
const results = []; const ok = (n, c, x) => results.push((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : ''));
const tipos = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const enDias = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const haceDias = n => new Date(Date.now() - n * 864e5).toISOString();

async function nuevaPagina(browser, vp, antes) {
  const ctx = await browser.newContext({ viewport: vp || { width: 1024, height: 1366 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.errores = [];
  page.on('pageerror', e => page.errores.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) page.errores.push('console: ' + m.text()); });
  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.host === 'crm.test') { const p = u.pathname === '/' ? '/index.html' : u.pathname; const f = path.join(WEB, p); return fs.existsSync(f) ? route.fulfill({ path: f, contentType: tipos[path.extname(f)] || 'application/octet-stream' }) : route.fulfill({ status: 404, body: 'no' }); }
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

(async () => {
  const browser = await chromium.launch();
  const page = await nuevaPagina(browser);
  const T = (s, o) => page.locator(s, o);
  const shot = n => page.screenshot({ path: path.join(OUT, n + '.png') });
  await entrarAdmin(page);
  await T('button[data-act="demo"]:visible').first().click();
  await page.waitForFunction(() => window.__mockDB().clientes.length === 3);

  // ---- Cotización con dos opciones de precio
  await T('.tab[data-view="cotizaciones"]:visible').click();
  await T('button[data-act="nueva-cot"]:visible').first().click();
  await T('#cliBusca').fill('Laura'); await T('button.pick', { hasText: 'Laura' }).click();
  await T('.ed-tab[data-tab="viaje"]').click();
  await T('#e_viaje_destinos').fill('San Andrés'); await T('#e_viaje_ciudadSalida').fill('Cúcuta');
  await T('#e_viaje_fechaIda').fill(enDias(40)); await T('#e_viaje_fechaRegreso').fill(enDias(44));
  await T('#e_viaje_adultos').fill('2');
  await T('#e_viaje_aerolinea').fill('Aerolínea de prueba');
  await T('#e_viaje_hotel').fill('Hotel de prueba');
  // pestañas fijas: desplazar el contenido y comprobar que las pestañas no se mueven
  const antes = await T('.ed-tabs').boundingBox();
  await page.evaluate(() => { const sc = document.querySelector('.ed-scroll'); sc.scrollTop = sc.scrollHeight; });
  await page.waitForTimeout(150);
  const despues = await T('.ed-tabs').boundingBox();
  ok('Pestañas fijas al desplazar el formulario', Math.abs(antes.y - despues.y) < 1 && despues.y >= 0, `y antes ${antes.y.toFixed(0)}, después ${despues.y.toFixed(0)}`);
  await shot('01-pestanas-fijas');
  await T('.ed-tab[data-tab="servicios"]').click();
  await T('button[data-ed="sug-serv"]', { hasText: 'Tiquetes aéreos' }).click();
  await T('button[data-ed="sug-serv"]', { hasText: 'Alojamiento' }).click();
  await T('.ed-tab[data-tab="valores"]').click();
  await T('#e_valores_opciones_0_nombre').fill('Hotel de prueba – Solo desayuno');
  await T('#e_valores_opciones_0_precioAdulto').pressSequentially('2100000');
  await T('button[data-ed="add-opcion"]').click();
  await T('#e_valores_opciones_1_precioAdulto').pressSequentially('2900000');
  await T('button[data-ed="add-cargo"]').click(); await T('#e_cargo_0c').fill('Tarjeta de turismo (prueba)'); await T('#e_cargo_0v').pressSequentially('300000');
  const calc = await T('#calcBox').innerText();
  ok('Calcula un total por opción', calc.includes('4.500.000') && calc.includes('6.100.000'), calc.replace(/\n/g, ' | '));
  ok('Pie del editor muestra "desde"', (await T('#edTotal').innerText()).includes('desde'));
  await T('button[data-ed="save-pdf"]').click();
  await page.waitForSelector('.errbox');
  ok('Exige el nombre de la segunda opción', (await T('.errbox').innerText()).includes('nombre de la opción 2'));
  await T('#e_valores_opciones_1_nombre').fill('Hotel de prueba – Todo incluido');
  await shot('02-opciones');
  // guardar como plantilla
  await T('button[data-ed="guardar-plantilla"]').click();
  await T('#plNom').fill('San Andrés prueba 4 noches'); await T('#plSi').click();
  await page.waitForFunction(() => window.__mockDB().plantillas.length === 1);
  const pl = await page.evaluate(() => window.__mockDB().plantillas[0]);
  ok('Plantilla guardada sin cliente, fechas ni precios', pl.datos.viaje.destinos === 'San Andrés' && !pl.datos.viaje.fechaIda && !pl.datos.viaje.adultos && pl.datos.valores.opciones.length === 2 && pl.datos.valores.opciones.every(o => o.precioAdulto == null) && !pl.datos.cliente,
    JSON.stringify(pl.datos.valores.opciones));
  await T('button[data-ed="save-pdf"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#pvPages canvas').length > 0 || /no se pudo/i.test((document.getElementById('pvStatus') || {}).textContent || ''), null, { timeout: 30000 });
  ok('PDF con dos opciones', (await T('#pvPages canvas').count()) > 0, await T('#pvStatus').innerText());
  const q = await page.evaluate(() => window.__mockDB().cotizaciones[0]);
  ok('Cotización guarda las dos opciones', q.datos.valores.opciones.length === 2 && q.datos.valores.precioAdulto === undefined);
  const [dl] = await Promise.all([page.waitForEvent('download'), T('#pvDown').click()]);
  await dl.saveAs(path.join(OUT, 'dos-opciones.pdf'));
  await T('#pvClose').click();
  ok('Ficha muestra "Desde" con varias opciones', (await T('.pass-stub').innerText()).includes('Desde'));
  // aceptar: elegir opción
  await T('#qEstado').selectOption('aceptada');
  await page.waitForSelector('[data-op="1"]'); await T('[data-op="1"]').click();
  await page.waitForSelector('#cSi'); await T('#cSi').click();
  await page.waitForFunction(() => window.__mockDB().cotizaciones[0].estado === 'aceptada');
  const qa = await page.evaluate(() => window.__mockDB().cotizaciones[0]);
  ok('Al aceptar se registra la opción elegida', qa.datos.valores.opcionElegida === 1 && qa.total === 2 * 2900000 + 300000, 'total ' + qa.total);
  await T('#qClose').click();

  // ---- Nueva cotización desde la plantilla
  await T('button[data-act="plantillas"]:visible').click();
  await T('[data-tp-usar]').first().click();
  await page.waitForSelector('#plSel');
  await T('.ed-tab[data-tab="viaje"]').click();
  ok('La plantilla llena el destino y el hotel', (await T('#e_viaje_destinos').inputValue()) === 'San Andrés' && (await T('#e_viaje_hotel').inputValue()) === 'Hotel de prueba');
  ok('La plantilla deja vacías fechas y pasajeros', (await T('#e_viaje_fechaIda').inputValue()) === '' && (await T('#e_viaje_adultos').inputValue()) === '');
  await T('.ed-tab[data-tab="valores"]').click();
  ok('La plantilla trae las opciones sin precios', (await T('#e_valores_opciones_1_nombre').inputValue()).includes('Todo incluido') && (await T('#e_valores_opciones_0_precioAdulto').inputValue()) === '');
  await T('.ed-tab[data-tab="servicios"]').click();
  ok('La plantilla trae los servicios', (await T('[data-k="servicios.1.descripcion"]').inputValue()) === 'Alojamiento');
  await T('button[data-ed="close"]').click();
  await page.waitForTimeout(200); if (await T('#cSi').count()) await T('#cSi').click();
  await page.waitForFunction(() => !document.querySelector('.ed-tabs'));

  // ---- Seguimientos de hoy
  // Cotización enviada hace 3 días y viaje aceptado que sale en 3 días
  await page.evaluate(({ h3 }) => {
    const db = window.__mockDB();
    const andres = db.clientes.find(c => c.nombre.startsWith('Andrés'));
    db.cotizaciones.push({ id: crypto.randomUUID(), numero: 50, estado: 'enviada', cliente_id: andres.id, asesor_id: db.perfiles[0].id, fecha_elaboracion: h3.slice(0, 10), datos: { cliente: { nombre: andres.nombre, telefono: andres.telefono }, viaje: { destinos: 'Cancún' }, valores: { opciones: [{ precioAdulto: 1 }] } }, historial_estados: [{ estado: 'enviada', fecha: h3 }], creado_en: h3, actualizado_en: h3, ejemplo: false });
    localStorage.setItem('mock-supabase-db', JSON.stringify(db));
  }, { h3: haceDias(3) });
  await page.reload(); await page.waitForSelector('.tab[data-view="inicio"]:visible'); await T('.tab[data-view="inicio"]:visible').click();
  await page.waitForSelector('#segPanel');
  // Fecha de ida de la cotización aceptada → en 3 días
  await page.evaluate(({ f }) => { const db = window.__mockDB(); db.cotizaciones[0].datos.viaje.fechaIda = f; db.clientes.find(c => c.nombre.startsWith('Familia')).ultimo_contacto = new Date(Date.now() - 10 * 864e5).toISOString(); localStorage.setItem('mock-supabase-db', JSON.stringify(db)); }, { f: enDias(3) });
  await page.reload(); await page.waitForSelector('.tab[data-view="inicio"]:visible'); await T('.tab[data-view="inicio"]:visible').click();
  await page.waitForSelector('.seg-item');
  const panel = await T('#segPanel').innerText();
  ok('Seguimiento: cotización sin respuesta', /DT-0050 enviada hace 3 días/.test(panel));
  ok('Seguimiento: viaje próximo', /Viaja en 3 días/.test(panel));
  ok('Seguimiento: cliente sin contacto (10 días); no a quien ya compró', /10 días sin contacto/.test(panel) && !/9 días sin contacto/.test(panel), panel.replace(/\n/g, ' | ').slice(0, 300));
  ok('Mensaje personalizado con nombre y destino', /Hola Andrés, te saluda Nicol de Diamond Travel\. ¿Pudiste revisar la cotización DT-0050 de tu viaje a Cancún\?/.test(panel));
  await shot('03-seguimientos');
  const n0 = await T('.seg-item').count();
  const href = await T('.seg-item a[data-seg-env]').first().getAttribute('href');
  ok('Botón abre WhatsApp con el mensaje', href.startsWith('https://wa.me/57300000000'));
  const [popup] = await Promise.all([page.waitForEvent('popup').catch(() => null), T('.seg-item a[data-seg-env]').first().click()]);
  if (popup) await popup.close().catch(() => {});
  await page.waitForFunction(n => document.querySelectorAll('.seg-item').length === n - 1, n0);
  const db = await page.evaluate(() => window.__mockDB());
  ok('Envío queda registrado y en el historial', db.seguimientos.length === 1 && db.seguimientos[0].resultado === 'enviado' && db.historial.some(h => h.texto.startsWith('Seguimiento enviado')));
  await T('[data-seg-omit]').first().click();
  await page.waitForFunction(n => document.querySelectorAll('.seg-item').length === n - 2, n0);
  ok('Omitir lo quita de la lista', (await page.evaluate(() => window.__mockDB().seguimientos.filter(s => s.resultado === 'omitido').length)) === 1);

  // ---- Editar mensajes de seguimiento
  await T('.tab[data-view="equipo"]:visible').click();
  await T('[data-sg-txt="contacto"]').fill('Hola {nombre}, ¿seguimos con tu viaje? Escribe {asesor}.');
  await T('[data-sg-dias="contacto"]').fill('8');
  await T('#sgGuardar').click();
  await page.waitForFunction(() => window.__mockDB().config.some(c => c.clave === 'seguimientos'));
  await T('.tab[data-view="inicio"]:visible').click();
  const panel2 = await T('#segPanel').innerText();
  ok('El mensaje editado se usa en la lista', /Hola Familia, ¿seguimos con tu viaje\? Escribe Nicol\./.test(panel2), panel2.replace(/\n/g, ' | ').slice(0, 300));
  const errores = page.errores.slice();

  // ---- Sin la actualización 2 de la base de datos, el CRM sigue funcionando
  const p2 = await nuevaPagina(browser, null, () => { try { localStorage.setItem('mock-sin-tablas', '1'); } catch (_) {} });
  await entrarAdmin(p2);
  const txt = await p2.locator('#view').innerText();
  ok('Sin la actualización: el CRM carga y avisa al administrador', /02-seguimientos-y-plantillas\.sql/.test(txt) && /Aún no hay clientes/.test(txt));
  errores.push(...p2.errores);

  // ---- Teléfono: editor con pestañas fijas
  const p3 = await nuevaPagina(browser, { width: 390, height: 844 });
  await entrarAdmin(p3);
  await p3.locator('.tab[data-view="cotizaciones"]:visible').click();
  await p3.locator('button[data-act="nueva-cot"]:visible').first().click();
  await p3.locator('.ed-tab[data-tab="viaje"]').click();
  await p3.evaluate(() => { const sc = document.querySelector('.ed-scroll'); sc.scrollTop = 600; });
  const bt = await p3.locator('.ed-tabs').boundingBox();
  ok('Teléfono: pestañas visibles tras desplazar', bt.y > 0 && bt.y < 200, 'y=' + bt.y.toFixed(0));
  ok('Teléfono: sin desplazamiento horizontal', !(await p3.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  await p3.screenshot({ path: path.join(OUT, '04-movil-editor.png') });
  errores.push(...p3.errores);
  ok('Sin errores de JavaScript', errores.length === 0, errores.slice(0, 4).join(' || '));
  console.log(results.join('\n'));
  await browser.close();
  process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.log(results.join('\n')); console.error('ERROR', e.message); process.exit(1); });
