// Prueba de extremo a extremo de la versión web con Supabase simulado y datos ficticios.
// Uso: node web-pruebas/e2e-web.js   (requiere Playwright, pdf-lib y pdfjs-dist instalados)
const { chromium } = require(process.env.PW || '/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const G = process.env.NODE_GLOBAL || '/home/claude/.npm-global/lib/node_modules/';
const WEB = path.join(__dirname, '..', 'web');
const OUT = path.join(process.env.OUT || '/tmp', 'shots-web'); fs.mkdirSync(OUT, { recursive: true });
const RESPALDO_CLAUDE = process.env.RESPALDO;
const results = []; const ok = (n, c, x) => results.push((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : ''));
const tipos = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.mjs': 'text/javascript' };

async function nuevaPagina(browser, vp) {
  const ctx = await browser.newContext({ viewport: vp || { width: 1180, height: 820 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.errores = [];
  page.on('pageerror', e => page.errores.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.errores.push('console: ' + m.text()); });
  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.host === 'crm.test') { let p = u.pathname === '/' ? '/index.html' : u.pathname; const f = path.join(WEB, p); if (fs.existsSync(f)) return route.fulfill({ path: f, contentType: tipos[path.extname(f)] || 'application/octet-stream' }); return route.fulfill({ status: 404, body: 'no' }); }
    if (u.host === 'cdn.jsdelivr.net' && u.pathname.includes('@supabase/supabase-js')) return route.fulfill({ path: path.join(__dirname, 'mock-supabase.mjs'), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
    if (u.pathname.endsWith('pdf-lib.min.js')) return route.fulfill({ path: G + 'pdf-lib/dist/pdf-lib.min.js', contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } });
    if (u.pathname.includes('pdfjs-dist@6.2.108/legacy/build/')) return route.fulfill({ path: G + 'pdfjs-dist/legacy/build/' + u.pathname.split('/').pop(), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
    return route.abort();
  });
  await page.goto('https://crm.test/');
  return page;
}
const vis = (page, sel) => page.locator(sel + ':visible');

(async () => {
  const browser = await chromium.launch();
  let page = await nuevaPagina(browser);
  const T = (s, o) => page.locator(s, o);
  const shot = n => page.screenshot({ path: path.join(OUT, n + '.png') });

  // ---- Acceso
  await page.waitForSelector('#fLogin');
  ok('Usa la URL y la clave pública configuradas', await page.evaluate(() => window.__mockConfig.url === 'https://ugkvdoywkvmjftdngxim.supabase.co' && window.__mockConfig.key.startsWith('sb_publishable_')));
  await shot('01-login');
  await T('#lEmail').fill('reservasdiamondtravel@gmail.com'); await T('#lPass').fill('incorrecta'); await T('#lBtn').click();
  await page.waitForFunction(() => document.getElementById('lErr').textContent.length > 0);
  ok('Contraseña incorrecta muestra error', (await T('#lErr').innerText()).includes('incorrectos'));
  await T('#lPass').fill('Prueba-1234'); await T('#lBtn').click();
  await page.waitForSelector('#fNombre');
  ok('Pide el nombre la primera vez', true);
  await T('#mNom').fill('Nicol Admin Prueba'); await T('#fNombre button[type=submit]').click();
  await page.waitForSelector('text=Aún no hay clientes registrados');
  ok('Entra al CRM como administradora', await page.evaluate(() => !document.getElementById('appRoot').hidden));
  ok('Menú Equipo visible para admin', await vis(page, '.tab[data-view="equipo"]').count() === 1);

  // ---- Clientes y seguimiento
  await T('button[data-act="demo"]:visible').first().click();
  await page.waitForFunction(() => window.__mockDB().clientes.length === 3 && window.__mockDB().historial.length === 5);
  ok('Datos de prueba: 3 clientes y su historial', true);
  await vis(page, '.tab[data-view="clientes"]').click();
  await T('.client-card', { hasText: 'Andrés Rojas' }).click();
  await page.waitForSelector('.tl-item');
  ok('Ficha muestra el historial desde la base de datos', (await T('.tl-item').count()) === 2);
  await T('#segTxt').fill('Llamada de prueba.'); await T('#segEtapa').selectOption('ganado'); await T('#segSave').click();
  await page.waitForFunction(() => window.__mockDB().historial.some(h => h.texto === 'Llamada de prueba.') && window.__mockDB().clientes.find(c => c.nombre.startsWith('Andrés')).etapa === 'ganado');
  await page.waitForFunction(() => document.querySelectorAll('#overlayRoot .tl-item').length === 4);
  ok('Seguimiento y cambio de etapa guardados', true);
  await T('#dClose').click();
  await T('button[data-act="nuevo"]:visible').first().click();
  await T('#f_nombre').fill('Otra Persona'); await T('#f_tel').fill('300 000 0002'); await T('#fxSave').click();
  await page.waitForSelector('#cSi');
  ok('Detecta cliente duplicado al crear', (await T('.sheet.confirm').innerText()).includes('Andrés Rojas'));
  await T('#cNo').click(); await T('#fxCancel').click();

  // ---- Cotización
  await vis(page, '.tab[data-view="cotizaciones"]').click();
  await T('button[data-act="nueva-cot"]:visible').first().click();
  await T('#cliBusca').fill('Laura'); await T('button.pick', { hasText: 'Laura' }).click();
  ok('Asesor(a) se llena con el nombre del perfil', (await T('#e_asesorNombre').inputValue()) === 'Nicol Admin Prueba');
  await T('#e_fechaVencimiento').fill('2026-10-19');
  await T('.ed-tab[data-tab="viaje"]').click();
  await T('#e_viaje_destinos').fill('Cancún y Riviera Maya'); await T('#e_viaje_fechaIda').fill('2026-12-20'); await T('#e_viaje_fechaRegreso').fill('2026-12-27');
  await T('#e_viaje_adultos').fill('2'); await T('#e_viaje_ninos').fill('2'); await T('#e_viaje_edadesNinos').fill('5, 8'); await T('#e_viaje_infantes').fill('1');
  await T('#e_viaje_hotel').fill('Hotel Ejemplo');
  await T('.ed-tab[data-tab="servicios"]').click();
  await T('button[data-ed="sug-serv"]', { hasText: 'Tiquetes aéreos' }).click();
  await T('.ed-tab[data-tab="valores"]').click();
  await T('#e_valores_precioAdulto').pressSequentially('4500000'); await T('#e_valores_precioNino').pressSequentially('3200000'); await T('#e_valores_precioInfante').pressSequentially('0');
  await T('button[data-ed="add-cargo"]').click(); await T('#e_cargo_0c').fill('Cargo de prueba'); await T('#e_cargo_0v').pressSequentially('180000');
  await T('button[data-ed="add-desc"]').click(); await T('#e_desc_0c').fill('Descuento de prueba'); await T('#e_desc_0v').pressSequentially('400000');
  await T('#e_valores_anticipo').pressSequentially('5000000');
  ok('Total calculado 15.180.000', (await T('#calcBox').innerText()).includes('15.180.000'));
  await T('.ed-tab[data-tab="condiciones"]').click();
  await T('#e_condiciones_politicaCancelacion').fill('Texto de prueba de cancelación.');
  await T('button[data-ed="cond-guardar"]').click(); await T('#cSi').click();
  await page.waitForFunction(() => window.__mockDB().config.some(c => c.clave === 'condiciones'));
  ok('Admin guarda condiciones predeterminadas', true);
  await T('button[data-ed="save-pdf"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#pvPages canvas').length > 0 || /no se pudo/i.test((document.getElementById('pvStatus') || {}).textContent || ''), null, { timeout: 30000 });
  ok('Guardar y generar PDF', (await T('#pvPages canvas').count()) > 0, await T('#pvStatus').innerText());
  const q = await page.evaluate(() => window.__mockDB().cotizaciones[0]);
  ok('Cotización en la base: número 1, total 15180000, vinculada', q.numero === 1 && q.total === 15180000 && !!q.cliente_id && q.datos.viaje.destinos === 'Cancún y Riviera Maya');
  await shot('02-preview');
  const [dl] = await Promise.all([page.waitForEvent('download'), T('#pvDown').click()]);
  const pdfPath = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(pdfPath);
  ok('Descarga el PDF', fs.readFileSync(pdfPath).slice(0, 5).toString() === '%PDF-', dl.suggestedFilename());
  await T('#pvClose').click();
  await T('#qDup').click(); await T('button[data-ed="save"]').click();
  await page.waitForFunction(() => window.__mockDB().cotizaciones.length === 2);
  ok('Duplicar asigna el número 2', await page.evaluate(() => window.__mockDB().cotizaciones.map(q => q.numero).sort().join() === '1,2'));
  await T('button[data-ed="close"]').click();
  await T('#qEstado').selectOption('enviada');
  await page.waitForFunction(() => window.__mockDB().cotizaciones.some(q => q.estado === 'enviada'));
  ok('Cambio de estado', true);
  await T('#qClose').click();

  // ---- Equipo
  await vis(page, '.tab[data-view="equipo"]').click();
  await page.waitForSelector('[data-eq-act]');
  await shot('03-equipo');
  await T('[data-eq-act="bbbbbbbb-0000-4000-8000-00000000000b"]').click();
  await page.waitForFunction(() => window.__mockDB().perfiles.find(p => p.email === 'asesora1@ejemplo.com').activo);
  ok('Admin activa a la asesora', true);
  // Respaldo antes de salir
  await vis(page, '.tab[data-view="respaldo"]').click();
  const [bk] = await Promise.all([page.waitForEvent('download'), T('button[data-act="exp-json"]').click()]);
  const bkPath = path.join(OUT, bk.suggestedFilename()); await bk.saveAs(bkPath);
  const bkData = JSON.parse(fs.readFileSync(bkPath, 'utf8'));
  ok('Respaldo JSON con clientes, historial y cotizaciones', bkData.version === 3 && bkData.clientes.length === 3 && bkData.cotizaciones.length === 2 && bkData.clientes.some(c => c.historial.length >= 2));
  // Cerrar sesión
  await T('[data-cuenta]:visible').first().click(); await T('#mcSalir').click();
  await page.waitForSelector('#fLogin');
  ok('Cerrar sesión vuelve al inicio de sesión', true);

  // ---- Asesora: solo ve lo suyo
  await T('#lEmail').fill('asesora1@ejemplo.com'); await T('#lPass').fill('Prueba-1234'); await T('#lBtn').click();
  await page.waitForSelector('.tab[data-view="inicio"]:visible'); await T('.tab[data-view="inicio"]:visible').click();
  await page.waitForSelector('text=Aún no hay clientes registrados');
  ok('Asesora no ve clientes de la administradora', await page.evaluate(() => !document.querySelector('.client-card')));
  ok('Asesora no ve el menú Equipo', await vis(page, '.tab[data-view="equipo"]').count() === 0);
  ok('Asesora no ve el botón de datos de prueba', await T('button[data-act="demo"]:visible').count() === 0);
  await T('button[data-act="nuevo"]:visible').first().click();
  await T('#f_nombre').fill('Cliente de la asesora'); await T('#f_tel').fill('300 000 0001'); await T('#fxSave').click();
  await page.waitForFunction(() => /asignado a/.test((document.getElementById('f_err') || {}).textContent || ''));
  ok('Duplicado ajeno: avisa sin mostrar datos del cliente', (await T('#f_err').innerText()).includes('Pide al administrador'));
  await T('#f_tel').fill('300 555 0000'); await T('#fxSave').click();
  await page.waitForFunction(() => window.__mockDB().clientes.some(c => c.nombre === 'Cliente de la asesora'));
  await T('.tab[data-view="clientes"]:visible').click();
  await T('.client-card', { hasText: 'Cliente de la asesora' }).click();
  ok('Asesora no tiene botón Eliminar', await T('#dDel').count() === 0);
  await T('#dClose').click();
  await shot('04-asesora');
  await T('[data-cuenta]:visible').first().click(); await T('#mcSalir').click();
  await page.waitForSelector('#fLogin');
  const errores1 = page.errores.slice();

  // ---- Migración desde la versión Claude (base nueva)
  if (RESPALDO_CLAUDE) {
    const p2 = await nuevaPagina(browser);
    await p2.evaluate(() => { localStorage.clear(); }); await p2.reload();
    await p2.waitForSelector('#fLogin');
    await p2.fill('#lEmail', 'reservasdiamondtravel@gmail.com'); await p2.fill('#lPass', 'Prueba-1234'); await p2.click('#lBtn');
    await p2.waitForSelector('#fNombre'); await p2.fill('#mNom', 'Nicol'); await p2.click('#fNombre button[type=submit]');
    await p2.waitForSelector('text=Aún no hay clientes registrados');
    await p2.locator('.tab[data-view="respaldo"]:visible').click();
    await p2.setInputFiles('#impFile', RESPALDO_CLAUDE);
    await p2.click('#cSi');
    try { await p2.waitForFunction(() => document.querySelector('#impMsg .ok-msg, #impMsg .err'), null, { timeout: 20000 }); }
    catch (e) { console.log('IMPORT STUCK:', await p2.locator('#impMsg').innerText(), '|', p2.errores.join(' | '), '|', JSON.stringify(await p2.evaluate(() => ({ c: window.__mockDB().clientes.length, h: window.__mockDB().historial.length, q: window.__mockDB().cotizaciones.length })))); throw e; }
    const im = await p2.locator('#impMsg').innerText(); if (!/Listo/.test(im)) console.log('IMPORT MSG:', im, p2.errores.join(' | '));
    const db = await p2.evaluate(() => window.__mockDB());
    const src = JSON.parse(fs.readFileSync(RESPALDO_CLAUDE, 'utf8'));
    const nHist = src.clientes.reduce((a, c) => a + (c.historial || []).length, 0);
    ok('Migración: mismos clientes, historial y cotizaciones', db.clientes.length === src.clientes.length && db.historial.length === nHist && db.cotizaciones.length === src.cotizaciones.length,
      `clientes ${db.clientes.length}/${src.clientes.length}, historial ${db.historial.length}/${nHist}, cotizaciones ${db.cotizaciones.length}/${src.cotizaciones.length}`);
    ok('Migración: conserva números y vínculos con clientes', db.cotizaciones.every(q => q.cliente_id && db.clientes.some(c => c.id === q.cliente_id)) && db.cotizaciones.map(q => q.numero).sort().join() === src.cotizaciones.map(q => q.numero).sort().join());
    // segunda importación no duplica
    await p2.setInputFiles('#impFile', RESPALDO_CLAUDE); await p2.click('#cSi');
    await p2.waitForSelector('#impMsg .ok-msg');
    const db2 = await p2.evaluate(() => window.__mockDB());
    ok('Restaurar dos veces no duplica nada', db2.cotizaciones.length === src.cotizaciones.length && db2.clientes.length === src.clientes.length && db2.historial.length === db.historial.length, `clientes ${db2.clientes.length}, historial ${db2.historial.length}, cotizaciones ${db2.cotizaciones.length}`);
    await p2.locator('.tab[data-view="cotizaciones"]:visible').click();
    await p2.locator('button[data-act="nueva-cot"]:visible').first().click();
    await p2.fill('#cliBusca', 'Laura'); await p2.locator('button.pick').first().click();
    await p2.click('button[data-ed="save"]');
    await p2.waitForFunction(n => window.__mockDB().cotizaciones.length === n + 1, src.cotizaciones.length);
    const maxN = Math.max(...src.cotizaciones.map(q => q.numero));
    ok('Tras migrar, el consecutivo continúa', await p2.evaluate(m => window.__mockDB().cotizaciones.some(q => q.numero === m + 1), maxN));
    errores1.push(...p2.errores);
  }

  // ---- Teléfono
  const p3 = await nuevaPagina(browser, { width: 390, height: 844 });
  await p3.waitForSelector('#fLogin');
  await p3.screenshot({ path: path.join(OUT, '05-movil-login.png') });
  ok('Sin desplazamiento horizontal en móvil (acceso)', !(await p3.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  errores1.push(...p3.errores);
  ok('Sin errores de JavaScript', errores1.length === 0, errores1.slice(0, 4).join(' || '));
  console.log(results.join('\n'));
  await browser.close();
  process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.log(results.join('\n')); console.error('ERROR', e.message); process.exit(1); });
