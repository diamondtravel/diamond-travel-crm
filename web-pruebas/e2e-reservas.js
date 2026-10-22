// Prueba de extremo a extremo: reservas y voucher de viaje (datos ficticios, Supabase simulado).
// Uso: node web-pruebas/e2e-reservas.js
const { chromium } = require(process.env.PW || '/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const G = process.env.NODE_GLOBAL || '/home/claude/.npm-global/lib/node_modules/';
const WEB = path.join(__dirname, '..', 'web');
const OUT = path.join(process.env.OUT || '/tmp', 'shots-reservas'); fs.mkdirSync(OUT, { recursive: true });
const results = []; const ok = (n, c, x) => results.push((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : ''));
const tipos = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const enDias = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const ddmm = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);

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
  return { t, n: doc.numPages };
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
  const IDA = enDias(40), VUELTA = enDias(47), MITAD = enDias(44);
  // Cotización aceptada de Laura (datos ficticios)
  await page.evaluate(({ IDA, VUELTA }) => {
    const db = window.__mockDB(), laura = db.clientes.find(c => c.nombre.startsWith('Laura')), ahora = new Date().toISOString();
    db.seq = 1;
    db.cotizaciones.push({ id: crypto.randomUUID(), numero: 1, estado: 'aceptada', cliente_id: laura.id, asesor_id: db.perfiles[0].id, fecha_elaboracion: ahora.slice(0, 10), fecha_vencimiento: null, moneda: 'COP', total: 9000000,
      datos: { cliente: { nombre: laura.nombre, telefono: laura.telefono, email: '' }, asesorNombre: 'Nicol Prueba',
        viaje: { destinos: 'Cartagena y Santa Marta', ciudadSalida: 'Cúcuta', fechaIda: IDA, fechaRegreso: VUELTA, adultos: 2, ninos: 1, edadesNinos: '7', aerolinea: 'Aerolínea de prueba', equipaje: 'Maleta de 23 kg', tramos: [{ fecha: IDA, ruta: 'Cúcuta – Cartagena', vuelo: 'XX 1', salida: '', llegada: '' }], hotel: 'Hotel de prueba Cartagena', regimen: 'Desayuno incluido', habitacion: 'Doble' },
        servicios: [{ descripcion: 'Tiquetes aéreos', incluido: true }, { descripcion: 'Hospedaje', incluido: true }, { descripcion: 'Impuesto de muelle', incluido: false }],
        valores: { moneda: 'COP', opciones: [{ precioAdulto: 3500000, precioNino: 2000000 }], cargos: [], descuentos: [] }, condiciones: {} },
      historial_estados: [{ estado: 'aceptada', fecha: ahora }], ejemplo: false, creado_por: db.perfiles[0].id, creado_en: ahora, actualizado_en: ahora });
    localStorage.setItem('mock-supabase-db', JSON.stringify(db));
  }, { IDA, VUELTA });
  await page.reload(); await page.waitForSelector('.tab[data-view="inicio"]:visible');
  ok('Menú con la sección Reservas', await T('.tab[data-view="reservas"]:visible').count() === 1);

  // ---- Crear la reserva desde la cotización aceptada
  await T('.tab[data-view="cotizaciones"]:visible').click();
  await T('[data-cot]').first().click();
  await page.waitForSelector('#qCrearRes');
  await T('#qCrearRes').click();
  await page.waitForSelector('.sheet.reditor');
  ok('Se copia el titular, el destino y las fechas', (await T('#r_titular_nombre').inputValue()) === 'Laura Méndez (prueba)' && (await T('#r_destino').inputValue()) === 'Cartagena y Santa Marta' && (await T('#r_fechaInicio').inputValue()) === IDA);
  ok('Se crean los pasajeros (2 adultos y 1 niño)', (await T('[data-rk$=".nombre"][data-rk^="pasajeros."]').count()) === 3 && (await T('#r_pasajeros_2_tipo').inputValue()) === 'nino');
  await T('#r_pasajeros_1_nombre').fill('Carlos Rojas (prueba)');
  await T('#r_pasajeros_2_nombre').fill('Sofía Rojas (prueba)');
  await T('#r_pasajeros_0_docTipo').selectOption('Cédula');
  await T('#r_pasajeros_0_docNumero').fill('1090999888');
  // Pestañas fijas
  const a0 = await T('.reditor .ed-tabs').boundingBox();
  await page.evaluate(() => { const sc = document.querySelector('.reditor .ed-scroll'); sc.scrollTop = sc.scrollHeight; });
  await page.waitForTimeout(150);
  const a1 = await T('.reditor .ed-tabs').boundingBox();
  ok('Pestañas fijas en el editor de reservas', Math.abs(a0.y - a1.y) < 1, 'y ' + a0.y.toFixed(0) + ' → ' + a1.y.toFixed(0));

  // ---- Vuelos con escalas
  await T('.reditor .ed-tab[data-tab="vuelos"]').click();
  ok('Se copia el vuelo de la cotización', (await T('#r_vuelos_0_trayectos_0_origen').inputValue()) === 'Cúcuta' && (await T('#r_vuelos_0_aerolinea').inputValue()) === 'Aerolínea de prueba');
  await T('#r_vuelos_0_codigoReserva').fill('XK7P2Q');
  await T('#r_vuelos_0_trayectos_0_origen').fill('Cúcuta (CUC)'); await T('#r_vuelos_0_trayectos_0_destino').fill('Bogotá (BOG)');
  await T('#r_vuelos_0_trayectos_0_salida').fill('06:10'); await T('#r_vuelos_0_trayectos_0_llegada').fill('07:20');
  await T('#r_vuelos_0_trayectos_0_vuelo').fill('XX 9301');
  await T('[data-r="add-tramo"][data-vi="0"]').click();
  ok('El nuevo trayecto sale de donde llegó el anterior', (await T('#r_vuelos_0_trayectos_1_origen').inputValue()) === 'Bogotá (BOG)' && (await T('#r_vuelos_0_trayectos_1_fecha').inputValue()) === IDA);
  await T('#r_vuelos_0_trayectos_1_destino').fill('Cartagena (CTG)');
  await T('#r_vuelos_0_trayectos_1_salida').fill('09:35'); await T('#r_vuelos_0_trayectos_1_llegada').fill('11:05');
  await T('#r_vuelos_0_trayectos_1_vuelo').fill('XX 9452');
  ok('Calcula la escala en Bogotá', /Escala en Bogotá \(BOG\) · 2 h 15 min/.test(await T('[data-escalas="0"]').innerText()));
  await T('[data-r="add-regreso"][data-vi="0"]').click();
  ok('Regreso invertido automáticamente', (await T('#r_vuelos_0_trayectos_2_origen').inputValue()) === 'Cartagena (CTG)' && (await T('#r_vuelos_0_trayectos_3_destino').inputValue()) === 'Cúcuta (CUC)' && (await T('#r_vuelos_0_trayectos_2_tipo').inputValue()) === 'regreso' && (await T('#r_vuelos_0_trayectos_2_fecha').inputValue()) === VUELTA);
  await T('#r_vuelos_0_trayectos_2_origen').fill('Santa Marta (SMR)');
  await T('#r_vuelos_0_trayectos_2_salida').fill('18:40'); await T('#r_vuelos_0_trayectos_2_llegada').fill('20:15');
  await T('#r_vuelos_0_trayectos_3_salida').fill('22:30'); await T('#r_vuelos_0_trayectos_3_llegada').fill('23:40');
  const tq = T('[data-rk^="vuelos.0.tiquetes."]');
  ok('Un número de tiquete por pasajero', (await tq.count()) === 3);
  await tq.nth(0).fill('729-2100000001'); await tq.nth(1).fill('729-2100000002');
  await shot('01-vuelos');

  // ---- Hospedaje (dos hoteles)
  await T('.reditor .ed-tab[data-tab="hoteles"]').click();
  ok('Se copia el hotel de la cotización', (await T('#r_hoteles_0_nombre').inputValue()) === 'Hotel de prueba Cartagena' && (await T('#r_hoteles_0_alimentacion').inputValue()) === 'Desayuno incluido');
  await T('#r_hoteles_0_ciudad').fill('Cartagena');
  await T('#r_hoteles_0_salida').fill(MITAD);
  await T('#r_hoteles_0_confirmacion').fill('CTG-55821');
  ok('Noches calculadas solas', (await T('[data-noches="0"]').innerText()) === '4');
  await T('[data-r="add-hotel"]').click();
  ok('El segundo hotel empieza cuando termina el primero', (await T('#r_hoteles_1_entrada').inputValue()) === MITAD && (await T('#r_hoteles_1_adultos').inputValue()) === '2');
  await T('#r_hoteles_1_nombre').fill('Hotel de prueba Santa Marta'); await T('#r_hoteles_1_ciudad').fill('Santa Marta');
  await T('#r_hoteles_1_salida').fill(VUELTA); await T('#r_hoteles_1_alimentacion').selectOption('Todo incluido');
  // ---- Traslados
  await T('.reditor .ed-tab[data-tab="traslados"]').click();
  await T('[data-r="add-traslado"]').click();
  await T('#r_traslados_0_tipo').fill('Terrestre entre ciudades'); await T('#r_traslados_0_fecha').fill(MITAD); await T('#r_traslados_0_hora').fill('09:00');
  await T('#r_traslados_0_desde').fill('Cartagena'); await T('#r_traslados_0_hasta').fill('Santa Marta');
  // ---- Actividades por secciones
  await T('.reditor .ed-tab[data-tab="actividades"]').click();
  ok('Sugiere secciones por ciudad de los hoteles', (await T('[data-r="add-seccion"][data-titulo="Actividades en Cartagena"]').count()) === 1 && (await T('[data-r="add-seccion"][data-titulo="Actividades en Santa Marta"]').count()) === 1);
  await T('[data-r="add-seccion"][data-titulo="Actividades en Cartagena"]').click();
  await T('[data-r="add-seccion"][data-titulo="Actividades en Santa Marta"]').click();
  await T('#r_actividades_0_items_0_nombre').fill('Tour Islas del Rosario (prueba)');
  await T('#r_actividades_0_items_0_fecha').fill(enDias(41)); await T('#r_actividades_0_items_0_hora').fill('07:30');
  await T('#r_actividades_0_items_0_comoSeToma').fill('Presentarse a las 7:00 a. m. en el muelle con este voucher y el documento de identidad.');
  await T('[data-r="add-act"][data-si="0"]').click();
  await T('#r_actividades_0_items_1_nombre').fill('City tour en chiva (prueba)');
  await T('#r_actividades_1_items_0_nombre').fill('Parque Tayrona (prueba)');
  // ---- Incluye y asistencia
  await T('.reditor .ed-tab[data-tab="incluye"]').click();
  ok('Se copian los servicios de la cotización', (await T('[data-rk="incluye.2.descripcion"]').inputValue()) === 'Impuesto de muelle' && (await T('[data-r="tog-inc"][data-i="2"]').getAttribute('aria-pressed')) === 'false');
  await T('[data-r="sug-inc"][data-v="Asistencia médica"]').click();
  await T('#r_asistencia_compania').fill('Asistencia de prueba'); await T('#r_asistencia_voucher').fill('AS-123456');
  await shot('02-incluye');
  // ---- Guardar y ver voucher
  await T('[data-r="save-voucher"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#vvPages canvas').length > 0 || /no se pudo/i.test((document.getElementById('vvStatus') || {}).textContent || ''), null, { timeout: 30000 });
  ok('Genera el voucher', (await T('#vvPages canvas').count()) > 0, await T('#vvStatus').innerText());
  const db1 = await page.evaluate(() => window.__mockDB());
  const rs = db1.reservas[0];
  ok('Reserva RS-0001 guardada y vinculada', db1.reservas.length === 1 && rs.numero === 1 && rs.cotizacion_id === db1.cotizaciones[0].id && rs.fecha_inicio === IDA && rs.fecha_fin === VUELTA && rs.destino === 'Cartagena y Santa Marta');
  ok('El documento queda guardado en el CRM', rs.datos.pasajeros[0].docNumero === '1090999888');
  const laura = db1.clientes.find(c => c.nombre.startsWith('Laura'));
  ok('Cliente pasa a "Venta cerrada" con historial', laura.etapa === 'ganado' && db1.historial.some(h => h.cliente_id === laura.id && /Reserva RS-0001 creada/.test(h.texto)));
  const [dl] = await Promise.all([page.waitForEvent('download'), T('#vvDown').click()]);
  const archivo = path.join(OUT, await dl.suggestedFilename()); await dl.saveAs(archivo);
  ok('Nombre del archivo', path.basename(archivo) === 'Voucher-RS-0001-Laura-Mendez-prueba.pdf', path.basename(archivo));
  const pdf = await textoPDF(archivo), plano = pdf.t.replace(/\s+/g, '');
  ok('El voucher NO incluye el número de documento', !pdf.t.includes('1090999888'));
  ok('El voucher incluye código, tiquetes, escalas, hoteles y actividades', ['XK7P2Q', '729-2100000001', 'EscalaenBogotá', 'HoteldepruebaSantaMarta', 'ActividadesenSantaMarta', 'CÓMOSETOMALAACTIVIDAD', '3123824183', '3052051183', 'VOUCHERDEVIAJE'].every(x => plano.includes(x)), pdf.n + ' páginas');
  await T('#vvClose').click();

  // ---- Ficha de la reserva: alertas, WhatsApp y estado
  await page.waitForSelector('#rEstado');
  const ficha = await T('.sheet').last().innerText();
  ok('Alertas de datos pendientes', /Hotel de prueba Santa Marta no tiene número de confirmación/.test(ficha) && /falta el número de tiquete de Sofía Rojas/.test(ficha), ficha.replace(/\n/g, ' | ').slice(0, 400));
  const wa = await T('#rWa').getAttribute('href');
  ok('Mensaje de WhatsApp con el voucher', decodeURIComponent(wa).includes('Te comparto el voucher de tu viaje a Cartagena y Santa Marta (RS-0001), del ' + ddmm(IDA) + ' al ' + ddmm(VUELTA)) && wa.startsWith('https://wa.me/57300000000'));
  await shot('03-ficha');
  const [pop] = await Promise.all([page.waitForEvent('popup').catch(() => null), T('#rWa').click()]);
  if (pop) await pop.close().catch(() => {});
  await page.waitForFunction(() => !!window.__mockDB().reservas[0].voucher_enviado_en);
  ok('Al abrir WhatsApp queda marcado "voucher enviado" en el historial', await page.evaluate(() => window.__mockDB().historial.some(h => /Voucher de viaje RS-0001 enviado/.test(h.texto))));
  await T('#rEstado').selectOption('confirmada');
  await page.waitForFunction(() => window.__mockDB().reservas[0].estado === 'confirmada');
  ok('Cambio de estado con historial', await page.evaluate(() => window.__mockDB().reservas[0].datos.historialEstados.length === 2 && window.__mockDB().historial.some(h => /marcada como “Confirmada”/.test(h.texto))));
  await T('#rClose').click();
  await T('#qClose').click().catch(() => {});

  // ---- Lista de reservas y búsqueda
  await T('.tab[data-view="reservas"]:visible').click();
  await page.waitForSelector('#resList');
  await T('#rq').fill('xk7p2q');
  ok('Buscar por código de reserva', (await T('#resList [data-res]').count()) === 1 && /Confirmada/.test(await T('#resList').innerText()));
  await shot('04-lista');
  // ---- Seguimientos e Inicio usan las fechas de la reserva
  await page.evaluate(f => { const db = window.__mockDB(); const r = db.reservas[0]; r.datos.fechaInicio = f; r.fecha_inicio = f; localStorage.setItem('mock-supabase-db', JSON.stringify(db)); }, enDias(3));
  await page.reload(); await page.waitForSelector('.tab[data-view="inicio"]:visible'); await T('.tab[data-view="inicio"]:visible').click();
  await page.waitForSelector('#segPanel');
  const panel = await T('#segPanel').innerText();
  ok('Seguimiento "viaje próximo" desde la reserva', /Viaja en 3 días .* reserva RS-0001/.test(panel) && /tu viaje a Cartagena y Santa Marta/.test(panel), panel.replace(/\n/g, ' | ').slice(0, 300));
  ok('Inicio muestra la reserva en viajes próximos', /RS-0001/.test(await T('#view').innerText()));
  // ---- Respaldo incluye reservas
  await T('.tab[data-view="respaldo"]:visible').click();
  const [dj] = await Promise.all([page.waitForEvent('download'), T('[data-act="exp-json"]').click()]);
  const fj = path.join(OUT, 'respaldo.json'); await dj.saveAs(fj);
  ok('El respaldo incluye las reservas', JSON.parse(fs.readFileSync(fj, 'utf8')).reservas.length === 1);
  // ---- Nueva reserva vacía: pide los datos mínimos
  await T('.tab[data-view="reservas"]:visible').click();
  await T('[data-act="nueva-res"]').first().click();
  await page.waitForSelector('.sheet.reditor');
  await T('[data-r="save-voucher"]').click();
  const eb = await T('.reditor .errbox').innerText();
  ok('Valida titular, destino y pasajeros', /titular/.test(eb) && /destino/.test(eb) && /al menos un pasajero/.test(eb), eb.replace(/\n/g, ' | '));
  await T('[data-r="close"]').click();
  errores.push(...page.errores);

  // ---- Sin la actualización 4
  const p2 = await nuevaPagina(browser, null, () => { try { localStorage.setItem('mock-sin-04', '1'); } catch (_) {} });
  await entrarAdmin(p2);
  ok('Sin la actualización 4: aviso al administrador', /04-reservas\.sql/.test(await p2.locator('#view').innerText()));
  await p2.locator('.tab[data-view="reservas"]:visible').click();
  ok('Sin la actualización 4: Reservas explica cómo activarla', /Falta activar las reservas/.test(await p2.locator('#view').innerText()));
  errores.push(...p2.errores);

  // ---- Teléfono
  const p3 = await nuevaPagina(browser, { width: 390, height: 844 });
  await entrarAdmin(p3);
  ok('Teléfono: el menú inferior cabe sin desplazamiento horizontal', !(await p3.evaluate(() => document.documentElement.scrollWidth > innerWidth)) && (await p3.locator('#tabNav .tab').count()) === 7);
  await p3.screenshot({ path: path.join(OUT, '05-movil-inicio.png') });
  await p3.locator('.tab[data-view="reservas"]:visible').click();
  await p3.locator('[data-act="nueva-res"]').first().click();
  await p3.locator('.reditor .ed-tab[data-tab="vuelos"]').click();
  await p3.locator('[data-r="add-vuelo"]').click();
  await p3.evaluate(() => { const sc = document.querySelector('.reditor .ed-scroll'); sc.scrollTop = 800; });
  const bt = await p3.locator('.reditor .ed-tabs').boundingBox();
  ok('Teléfono: pestañas de la reserva visibles tras desplazar', bt.y > 0 && bt.y < 200, 'y=' + bt.y.toFixed(0));
  await p3.screenshot({ path: path.join(OUT, '06-movil-editor.png') });
  errores.push(...p3.errores);

  ok('Sin errores de JavaScript', errores.length === 0, errores.slice(0, 4).join(' || '));
  console.log(results.join('\n'));
  await browser.close();
  process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.log(results.join('\n')); console.error('ERROR', e.message); process.exit(1); });
