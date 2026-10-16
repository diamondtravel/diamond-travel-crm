// Prueba de extremo a extremo del CRM con base de datos simulada y datos ficticios.
const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs');
const G = '/home/claude/.npm-global/lib/node_modules/';
const page_html = fs.readFileSync(process.argv[2], 'utf8');
const mock = fs.readFileSync(__dirname + '/mock.js', 'utf8');
const doc = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style><script>' + mock + '</script></head><body>' + page_html + '</body></html>';
const OUT = __dirname + '/shots/'; fs.mkdirSync(OUT, { recursive: true });
const results = []; const ok = (name, cond, extra) => { results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push('console: ' + m.text()); }); page.on('requestfailed', r => { if (!r.url().includes('fonts.g')) errors.push('reqfail: ' + r.url()); });
  const served = [];
  await page.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith('https://crm.test/')) return route.fulfill({ body: doc, contentType: 'text/html' });
    if (u.includes('pdf-lib') && u.endsWith('pdf-lib.min.js')) { served.push(u); return route.fulfill({ path: G + 'pdf-lib/dist/pdf-lib.min.js', contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }); }
    if (u.includes('pdfjs-dist@6.2.108/legacy/build/')) { served.push(u); return route.fulfill({ path: G + 'pdfjs-dist/legacy/build/' + u.split('/').pop(), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }); }
    return route.abort();
  });
  await page.goto('https://crm.test/index.html');
  const T = (sel, opts) => page.locator(sel, opts);
  const shot = n => page.screenshot({ path: OUT + n + '.png', fullPage: false });

  // ---- 1. CRM anterior
  await T('text=Cargar 3 clientes de prueba').first().click();
  await page.waitForFunction(() => document.querySelectorAll('.kpi').length >= 4);
  ok('Carga clientes de prueba y muestra Inicio', true);
  ok('Logo cargado en la barra', await page.evaluate(() => [...document.querySelectorAll('img[data-logo]')].every(i => i.complete && i.naturalWidth > 100)));
  await shot('01-inicio');
  await T('.tab[data-view="clientes"]:visible').click();
  await page.waitForSelector('.client-card');
  ok('Lista de clientes', (await T('.client-card').count()) === 3);
  await T('.client-card', { hasText: 'Andrés Rojas' }).click();
  await page.waitForSelector('#segTxt');
  await T('#segTxt').fill('Llamada de prueba para comprobar el seguimiento.');
  await T('#segSave').click();
  await page.waitForFunction(() => [...window.__store.values()].some(d => (d.historial || []).some(h => h.texto === 'Llamada de prueba para comprobar el seguimiento.')));
  ok('Seguimiento de cliente se guarda', true);
  await T('#dClose').click();
  await T('.tab[data-view="embudo"]:visible').click();
  await page.waitForSelector('[data-move]');
  const famId = await page.evaluate(() => [...window.__store.entries()].find(([k, d]) => d.nombre === 'Familia Pabón (prueba)')[0].split('/')[1]);
  await T(`[data-move="${famId}"]`).selectOption('contactado');
  await page.waitForFunction(id => window.__store.get('clientes/' + id).etapa === 'contactado', famId);
  ok('Embudo: cambio de etapa', true);

  // ---- 2. Nueva cotización
  await T('.tab[data-view="cotizaciones"]:visible').click();
  await page.waitForSelector('text=Aún no hay cotizaciones');
  await shot('02-cot-vacio');
  await T('button[data-act="nueva-cot"]:visible').first().click();
  await page.waitForSelector('#cliBusca');
  await T('#cliBusca').fill('Laura');
  await T('button.pick', { hasText: 'Laura Méndez' }).click();
  await page.waitForSelector('.chosen');
  await T('#e_fechaVencimiento').fill('2026-10-19');
  await shot('03-editor-cliente');
  await T('.ed-tab[data-tab="viaje"]').click();
  await T('#e_viaje_destinos').fill('Cancún y Riviera Maya');
  await T('#e_viaje_ciudadSalida').fill('Cúcuta');
  await T('#e_viaje_fechaIda').fill('2026-12-20');
  await T('#e_viaje_fechaRegreso').fill('2026-12-27');
  ok('Noches se calculan con las fechas', (await T('#e_viaje_noches').inputValue()) === '7');
  await T('#e_viaje_adultos').fill('2');
  await T('#e_viaje_ninos').fill('2');
  await T('#e_viaje_edadesNinos').fill('5, 8');
  await T('#e_viaje_infantes').fill('1');
  await T('#e_viaje_aerolinea').fill('Aerolínea de prueba');
  await T('#e_viaje_equipaje').fill('Maleta de 23 kg por pasajero');
  await T('button[data-ed="add-tramo"]').click();
  await T('#e_viaje_tramos_0_fecha').fill('2026-12-20');
  await T('#e_viaje_tramos_0_ruta').fill('Cúcuta – Bogotá');
  await T('#e_viaje_tramos_0_vuelo').fill('XX 101');
  await T('#e_viaje_tramos_0_salida').fill('06:10');
  await T('#e_viaje_tramos_0_llegada').fill('07:20');
  await T('button[data-ed="add-tramo"]').click();
  await T('#e_viaje_tramos_1_ruta').fill('Bogotá – Cancún');
  await T('#e_viaje_hotel').fill('Hotel Ejemplo Riviera');
  await T('#e_viaje_categoriaHotel').fill('5 estrellas');
  await T('#e_viaje_regimen').fill('Todo incluido');
  await T('#e_viaje_tours').fill('Tour de prueba con almuerzo.');
  await shot('04-editor-viaje');
  await T('.ed-tab[data-tab="servicios"]').click();
  await T('button[data-ed="sug-serv"]', { hasText: 'Tiquetes aéreos' }).click();
  await T('button[data-ed="sug-serv"]', { hasText: 'Alojamiento' }).click();
  await T('button[data-ed="add-serv"]').click();
  await T('[data-k="servicios.2.descripcion"]').fill('Gastos personales');
  await T('button[data-ed="tog-serv"][data-i="2"]').click();
  await T('#e_observacionesPaquete').fill('Observación de prueba del paquete.');
  await T('.ed-tab[data-tab="valores"]').click();
  // precio vacío: no se inventa
  ok('Sin precios: total "Faltan precios"', (await T('#edTotal').innerText()).includes('Faltan precios'));
  await T('#e_valores_precioAdulto').pressSequentially('4500000');
  ok('Formato de miles en el precio', (await T('#e_valores_precioAdulto').inputValue()) === '4.500.000');
  await T('#e_valores_precioNino').pressSequentially('3200000');
  await T('#e_valores_precioInfante').pressSequentially('0');
  await T('button[data-ed="add-cargo"]').click();
  await T('#e_cargo_0c').fill('Cargo de prueba');
  await T('#e_cargo_0v').pressSequentially('180000');
  await T('button[data-ed="add-desc"]').click();
  await T('#e_desc_0c').fill('Descuento de prueba');
  await T('#e_desc_0v').pressSequentially('400000');
  await T('#e_valores_anticipo').pressSequentially('5000000');
  await T('#e_porPersona').check();
  const calc = await T('#calcBox').innerText();
  ok('Total calculado 15.180.000', calc.includes('15.180.000'), calc.replace(/\n/g, ' | '));
  ok('Saldo 10.180.000', calc.includes('10.180.000'));
  ok('Promedio por pasajero 3.036.000', calc.includes('3.036.000'));
  await shot('05-editor-valores');
  await T('.ed-tab[data-tab="condiciones"]').click();
  await T('#e_condiciones_politicaAnticipo').fill('Texto de prueba sobre la separación.');
  await T('#e_condiciones_fechaLimitePago').fill('2026-11-20');
  await T('#e_condiciones_politicaCancelacion').fill('Texto de prueba sobre cancelación.');
  await T('button[data-ed="cond-guardar"]').click();
  await T('#cSi').click();
  await page.waitForFunction(() => window.__store.has('config/condiciones'));
  ok('Condiciones guardadas como predeterminadas', true);
  // vista previa sin guardar
  await T('button[data-ed="preview"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#pvPages canvas').length > 0 || /no se pudo/i.test((document.getElementById('pvStatus') || {}).textContent || ''), null, { timeout: 30000 });
  ok('Vista previa desde el formulario', (await T('#pvPages canvas').count()) > 0, await T('#pvStatus').innerText());
  await T('#pvClose').click();
  // guardar y generar
  await T('button[data-ed="save-pdf"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#pvPages canvas').length > 0 || /no se pudo/i.test((document.getElementById('pvStatus') || {}).textContent || ''), null, { timeout: 30000 });
  const st = await T('#pvStatus').innerText(); console.log('ERRS', errors.join(' || '));
  ok('Guardar y generar PDF', (await T('#pvPages canvas').count()) > 0, st);
  const q1 = await page.evaluate(() => [...window.__store.entries()].filter(([k]) => k.startsWith('cotizaciones/')).map(([k, d]) => Object.assign({ id: k.split('/')[1] }, d)));
  ok('Cotización guardada con número 1', q1.length === 1 && q1[0].numero === 1, 'n=' + q1.length);
  ok('Vinculada al cliente', !!q1[0].clienteId);
  await shot('06-preview');
  await T('#pvDown').click();
  await page.waitForFunction(() => window.__downloads.length > 0);
  const dl = await page.evaluate(() => window.__downloads[0]);
  fs.writeFileSync(OUT + dl.filename, Buffer.from(dl.b64, 'base64'));
  ok('Descarga PDF', Buffer.from(dl.b64, 'base64').slice(0, 5).toString() === '%PDF-', dl.filename + ' ' + dl.size + ' bytes');
  await T('#pvClose').click();
  await page.waitForSelector('#qGen');
  await shot('07-ficha-cot');
  const waHref = await T('#qWa').getAttribute('href');
  ok('Enlace de WhatsApp', waHref.startsWith('https://wa.me/573000000001?text='), decodeURIComponent(waHref.split('text=')[1]).slice(0, 80));
  // historial del cliente
  const lauraHist = await page.evaluate(id => (window.__store.get('clientes/' + id).historial || []).map(h => h.texto).join(' | '), q1[0].clienteId);
  ok('Historial del cliente registra la cotización', lauraHist.includes('DT-0001'));

  // ---- 3. Editar
  await T('#qEdit').click();
  await T('.ed-tab[data-tab="viaje"]').click();
  await T('#e_viaje_adultos').fill('3');
  ok('Total se recalcula al cambiar pasajeros', (await T('#edTotal').innerText()).includes('19.680.000'), await T('#edTotal').innerText());
  await T('button[data-ed="save"]').click();
  await page.waitForFunction(() => [...window.__store.entries()].some(([k, d]) => k.startsWith('cotizaciones/') && d.viaje.adultos === 3));
  ok('Editar y guardar', true);
  await T('button[data-ed="close"]').click();

  // ---- 4. Duplicar
  await page.waitForSelector('#qDup');
  await T('#qDup').click();
  await page.waitForSelector('.ed-tab');
  ok('Duplicado abre sin número', (await T('.sheet-head h2').last().innerText()).includes('Nueva cotización'));
  await T('button[data-ed="save"]').click();
  await page.waitForFunction(() => [...window.__store.keys()].filter(k => k.startsWith('cotizaciones/')).length === 2);
  const nums = await page.evaluate(() => [...window.__store.entries()].filter(([k]) => k.startsWith('cotizaciones/')).map(([, d]) => d.numero).sort());
  ok('Duplicado recibe número 2', JSON.stringify(nums) === '[1,2]', JSON.stringify(nums));
  await T('button[data-ed="close"]').click();

  // ---- 5. Estado
  await T('#qEstado').selectOption('enviada');
  await page.waitForFunction(() => [...window.__store.entries()].some(([k, d]) => k.startsWith('cotizaciones/') && d.estado === 'enviada'));
  ok('Cambio de estado a enviada', true);
  await T('#qClose').click();

  // ---- 6. Validaciones y duplicados
  await T('button[data-act="nueva-cot"]:visible').first().click();
  await T('button[data-ed="nuevo-cli"]').click();
  await T('#e_cliente_nombre').fill('Otro Nombre');
  await T('#e_cliente_telefono').fill('300 000 0002');
  ok('Aviso de cliente duplicado', (await T('#dupHint').innerText()).includes('Andrés Rojas'));
  await T('#e_cliente_telefono').fill('300 999 0000');
  await T('.ed-tab[data-tab="viaje"]').click();
  await T('#e_viaje_fechaIda').fill('2026-12-20');
  await T('#e_viaje_fechaRegreso').fill('2026-12-10');
  await T('#e_viaje_ninos').fill('2');
  await T('#e_viaje_edadesNinos').fill('5');
  await T('button[data-ed="save-pdf"]').click();
  const errs = await T('.errbox').first().innerText();
  ok('Valida fecha de regreso', errs.includes('regreso no puede ser anterior'));
  ok('Valida edades de niños', errs.includes('edad'));
  ok('Exige destino y precios para el PDF', errs.includes('destino') && errs.includes('precio'), errs.replace(/\n/g, ' | '));
  await shot('08-validaciones');
  const before = await page.evaluate(() => window.__store.size);
  await T('button[data-ed="close"]').click();
  await T('#cSi').click();
  ok('No se guardó nada inválido', before === await page.evaluate(() => window.__store.size));

  // ---- 7. Lista, búsqueda, cliente y respaldo
  await page.waitForSelector('#qq');
  await T('#qq').fill('DT-0002');
  ok('Búsqueda por número', (await T('.q-card').count()) === 1);
  await T('#qq').fill('');
  await shot('09-lista');
  await T('.tab[data-view="clientes"]:visible').click();
  await T('.client-card', { hasText: 'Laura Méndez' }).click();
  await page.waitForSelector('#dNuevaCot');
  ok('Ficha del cliente lista sus cotizaciones', (await T('#overlayRoot [data-cot]').count()) === 2);
  await T('#dClose').click();
  await T('.tab[data-view="respaldo"]:visible').click();
  await T('button[data-act="exp-json"]').click();
  await page.waitForFunction(() => window.__downloads.length > 1);
  const bk = JSON.parse(Buffer.from((await page.evaluate(() => window.__downloads[1])).b64, 'base64').toString());
  ok('Respaldo JSON incluye cotizaciones', bk.version === 2 && bk.cotizaciones.length === 2 && bk.clientes.length === 3);
  fs.writeFileSync(OUT + 'respaldo.json', JSON.stringify(bk, null, 1));

  // ---- 8. Teléfono
  await page.setViewportSize({ width: 390, height: 844 });
  await T('.tab[data-view="cotizaciones"]:visible').click();
  await shot('10-movil-lista');
  await T('.q-card').first().click();
  await shot('11-movil-ficha');
  await T('#qEdit').click();
  await T('.ed-tab[data-tab="valores"]').click();
  await shot('12-movil-editor');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  ok('Sin desplazamiento horizontal en móvil', !overflow);
  ok('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 5).join(' || '));
  console.log(results.join('\n'));
  console.log('Librerías servidas:', [...new Set(served.map(u => u.split('/').slice(2, 3).join() + ':' + u.split('/').pop()))].join(', '));
  await browser.close();
})().catch(async e => { console.log(results.join('\n')); console.error('ERROR', e.message); process.exit(1); });
