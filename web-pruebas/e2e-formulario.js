// Prueba de extremo a extremo: formulario público "Cotiza tu viaje" y su llegada al CRM.
// Datos ficticios; Supabase simulado. Uso: node web-pruebas/e2e-formulario.js
const { chromium } = require(process.env.PW || '/home/claude/.npm-global/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');
const WEB = path.join(__dirname, '..', 'web');
const OUT = path.join(process.env.OUT || '/tmp', 'shots-formulario'); fs.mkdirSync(OUT, { recursive: true });
const results = []; const ok = (n, c, x) => results.push((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : ''));
const tipos = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const RPC = 'https://ugkvdoywkvmjftdngxim.supabase.co/rest/v1/rpc/registrar_solicitud';
const enDias = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

async function nuevaPagina(browser, opts, antes) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1024, height: 1366 } }, opts || {}));
  const page = await ctx.newPage();
  page.errores = [];
  page.on('pageerror', e => page.errores.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) page.errores.push('console: ' + m.text()); });
  page.rpc = { llamadas: [], modo: 'ok' };
  await page.route('**/*', async route => {
    const req = route.request(), u = new URL(req.url());
    if (u.host === 'crm.test') {
      let p = u.pathname; if (p.endsWith('/')) p += 'index.html';
      const f = path.join(WEB, p);
      return fs.existsSync(f) ? route.fulfill({ path: f, contentType: tipos[path.extname(f)] || 'application/octet-stream' }) : route.fulfill({ status: 404, body: 'no' });
    }
    if (req.url().startsWith(RPC)) {
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
      page.rpc.llamadas.push({ headers: req.headers(), body: JSON.parse(req.postData() || '{}') });
      const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
      if (page.rpc.modo === 'caido') return route.abort('failed');
      if (page.rpc.modo === 'limite') return route.fulfill({ status: 400, headers: cors, body: JSON.stringify({ code: 'P0001', message: 'Estamos recibiendo muchas solicitudes. Escríbenos directamente por WhatsApp, por favor.' }) });
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ ok: true }) });
    }
    if (u.host === 'cdn.jsdelivr.net' && u.pathname.includes('@supabase/supabase-js')) return route.fulfill({ path: path.join(__dirname, 'mock-supabase.mjs'), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
    return route.abort();
  });
  if (antes) await page.addInitScript(antes);
  return page;
}
async function entrarAdmin(page) {
  await page.goto('https://crm.test/');
  await page.waitForSelector('#fLogin');
  await page.fill('#lEmail', 'reservasdiamondtravel@gmail.com'); await page.fill('#lPass', 'Prueba-1234'); await page.click('#lBtn');
  await page.waitForSelector('#fNombre'); await page.fill('#mNom', 'Nicol Prueba'); await page.click('#fNombre button[type=submit]');
  await page.waitForSelector('.tab[data-view="inicio"]:visible');
}

(async () => {
  const browser = await chromium.launch();
  const errores = [];

  // ===== Formulario público =====
  const f = await nuevaPagina(browser);
  await f.goto('https://crm.test/cotiza/?destino=San%20Andr%C3%A9s&origen=instagram');
  await f.waitForSelector('#fCotiza');
  ok('Formulario: destino y red social llegan desde el enlace', (await f.inputValue('#destino')) === 'San Andrés' && (await f.inputValue('#comoNosConocio')) === 'Instagram');
  ok('Formulario: no se ven fechas pasadas', (await f.getAttribute('#fechaIda', 'min')) === enDias(0));
  ok('Formulario: campo trampa invisible', !(await f.isVisible('#web')) || (await f.locator('#web').boundingBox()).x < -1000);
  await f.screenshot({ path: path.join(OUT, '01-formulario.png'), fullPage: true });
  await f.click('#enviar');
  const err1 = await f.innerText('#errBox');
  ok('Formulario: avisa los datos que faltan', /nombre completo/.test(err1) && /WhatsApp válido/.test(err1) && /autorizar/.test(err1) && f.rpc.llamadas.length === 0, err1.replace(/\n/g, ' | '));
  await f.fill('#nombre', 'Valentina Ruiz (prueba)');
  ok('Formulario: el aviso del campo se quita al corregirlo', (await f.getAttribute('#nombre', 'aria-invalid')) === null);
  await f.fill('#telefono', '300 000 0099');
  await f.fill('#fechaIda', enDias(40)); await f.fill('#fechaRegreso', enDias(45));
  await f.click('[data-step="adultos:1"]');
  await f.click('[data-step="ninos:1"]');
  ok('Formulario: botones + y − y edades de los niños', (await f.inputValue('#adultos')) === '3' && (await f.isVisible('#edadesNinos')));
  await f.fill('#edadesNinos', '7');
  await f.locator('#presupuesto').pressSequentially('6500000');
  ok('Formulario: presupuesto con puntos de miles', (await f.inputValue('#presupuesto')) === '6.500.000');
  await f.fill('#comentarios', 'Hotel todo incluido, aniversario.');
  await f.check('#autorizaDatos');
  // 1) el servidor rechaza (límite por hora): se muestra su mensaje
  f.rpc.modo = 'limite'; await f.click('#enviar');
  await f.waitForFunction(() => !document.getElementById('errBox').hidden);
  ok('Formulario: muestra el mensaje del servidor', /muchas solicitudes/.test(await f.innerText('#errBox')));
  // 2) sin internet: mensaje claro con enlace a WhatsApp
  f.rpc.modo = 'caido'; await f.click('#enviar');
  await f.waitForFunction(() => /conexión/.test(document.getElementById('errBox').textContent));
  ok('Formulario: sin conexión ofrece escribir por WhatsApp', (await f.getAttribute('#errBox a', 'href')).startsWith('https://wa.me/573052051183?text='));
  // 3) envío correcto
  f.rpc.modo = 'ok'; await f.click('#enviar');
  await f.waitForSelector('#gracias:not([hidden])');
  const ll = f.rpc.llamadas[f.rpc.llamadas.length - 1];
  ok('Formulario: envía con la clave pública y sin sesión', ll.headers.apikey === 'sb_publishable_Yf3WinZRUrhYkHXsIq-f9A_RcghWZPL' && !ll.headers.authorization);
  const p = ll.body.p || {};
  ok('Formulario: envía todos los datos', p.nombre === 'Valentina Ruiz (prueba)' && p.telefono === '300 000 0099' && p.destino === 'San Andrés' && p.adultos === '3' && p.ninos === '1'
    && p.edadesNinos === '7' && p.presupuesto === '6500000' && p.fechaIda === enDias(40) && p.comoNosConocio === 'Instagram' && p.autorizaDatos === true && /Ley 1581/.test(p.textoAutorizacion) && p.web === '', JSON.stringify(p));
  ok('Formulario: pantalla de gracias con su nombre', /¡Gracias, Valentina!/.test(await f.innerText('#gTitulo')));
  ok('Formulario: botón de WhatsApp con mensaje', decodeURIComponent(await f.getAttribute('#gWhats', 'href')).includes('soy Valentina Ruiz (prueba). Acabo de enviar mi solicitud para viajar a San Andrés'));
  await f.screenshot({ path: path.join(OUT, '02-gracias.png') });
  await f.click('#gOtra');
  ok('Formulario: "Enviar otra solicitud" lo deja limpio', (await f.isVisible('#fCotiza')) && (await f.inputValue('#nombre')) === '');
  errores.push(...f.errores);

  // Teléfono y modo oscuro
  const m = await nuevaPagina(browser, { viewport: { width: 375, height: 812 }, colorScheme: 'dark' });
  await m.goto('https://crm.test/cotiza/');
  await m.waitForSelector('#fCotiza');
  ok('Formulario en teléfono: sin desplazamiento horizontal', !(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  await m.screenshot({ path: path.join(OUT, '03-movil-oscuro.png'), fullPage: true });
  errores.push(...m.errores);

  // ===== Llegada al CRM =====
  const c = await nuevaPagina(browser);
  await entrarAdmin(c);
  await c.locator('button[data-act="demo"]:visible').first().click();
  await c.waitForFunction(() => window.__mockDB().clientes.length === 3);
  await c.evaluate(() => {
    window.__mockSolicitud({ nombre: 'Valentina Ruiz (prueba)', telefono: '300 000 0099', destino: 'San Andrés', adultos: 3, ninos: 1, fechaIda: '', comoNosConocio: 'Instagram' }, 0);
    window.__mockSolicitud({ nombre: 'Laura M.', telefono: '300 000 0001', destino: 'Cartagena', adultos: 2, ninos: 0 }, 1);
  });
  await c.reload(); await c.waitForSelector('.tab[data-view="inicio"]:visible');
  await c.waitForSelector('#segPanel');
  const items = await c.locator('.seg-item').allInnerTexts();
  ok('CRM: las solicitudes salen de primeras, la más reciente arriba', /Valentina/.test(items[0]) && /Solicitud del formulario/.test(items[0]) && /Solicitud del formulario/.test(items[1]), items.slice(0, 2).map(t => t.replace(/\n/g, ' | ')).join(' ## '));
  ok('CRM: motivo con destino y personas', items.some(t => /Llenó el formulario hoy · San Andrés · 4 personas/.test(t)) && items.some(t => /Llenó el formulario ayer · Cartagena/.test(t)));
  ok('CRM: mensaje con el destino de la solicitud (no el de la ficha)', items.some(t => /Hola Laura, ¡gracias por escribirnos! Te saluda Nicol de Diamond Travel\. Recibí tu solicitud para viajar a Cartagena/.test(t)));
  ok('CRM: cliente nuevo creado en "Nuevo contacto" con origen', await c.evaluate(() => { const x = window.__mockDB().clientes.find(c => c.nombre.startsWith('Valentina')); return x && x.etapa === 'nuevo' && x.origen === 'Formulario web · Instagram'; }));
  await c.screenshot({ path: path.join(OUT, '04-crm-seguimientos.png') });
  const idx = items.findIndex(t => /Valentina/.test(t));
  const [pop] = await Promise.all([c.waitForEvent('popup').catch(() => null), c.locator('.seg-item a[data-seg-env]').nth(idx).click()]);
  if (pop) await pop.close().catch(() => {});
  await c.waitForFunction(() => window.__mockDB().seguimientos.some(s => s.regla === 'solicitud'));
  await c.waitForFunction(() => window.__mockDB().clientes.find(c => c.nombre.startsWith('Valentina')).etapa === 'contactado');
  ok('CRM: al responder pasa a "Contactado" y queda en el historial', await c.evaluate(() => { const db = window.__mockDB(); const v = db.clientes.find(c => c.nombre.startsWith('Valentina')); return !!v.ultimo_contacto && db.historial.some(h => h.cliente_id === v.id && /Seguimiento enviado \(solicitud del formulario\)/.test(h.texto)); }));
  await c.waitForFunction(() => !/Valentina/.test(document.getElementById('segPanel').innerText));
  ok('CRM: la solicitud respondida sale de la lista', true);
  // Equipo → Formulario
  await c.locator('.tab[data-view="equipo"]:visible').click();
  await c.waitForSelector('#formPanel');
  ok('CRM: Equipo muestra el enlace del formulario', (await c.inputValue('#fmLink')) === 'https://crm.test/cotiza' && /cotiza/.test(await c.inputValue('#fmBienv')));
  await c.fill('#fmDest', 'San Andrés'); await c.selectOption('#fmOrig', 'Instagram');
  ok('CRM: arma el enlace para una publicación', (await c.inputValue('#fmLink2')) === 'https://crm.test/cotiza?destino=San%20Andr%C3%A9s&origen=Instagram');
  const admId = await c.evaluate(() => window.__mockDB().perfiles[0].id);
  await c.selectOption('#fmAsesor', admId);
  await c.waitForFunction(() => window.__mockDB().config.some(x => x.clave === 'formulario'));
  ok('CRM: guarda a quién se asignan las solicitudes', await c.evaluate(id => window.__mockDB().config.find(x => x.clave === 'formulario').valor.asesorId === id, admId));
  await c.locator('#formPanel').screenshot({ path: path.join(OUT, '05-equipo-formulario.png') });
  errores.push(...c.errores);

  // Sin la actualización 3: el CRM sigue funcionando y avisa
  const s = await nuevaPagina(browser, null, () => { try { localStorage.setItem('mock-sin-03', '1'); } catch (_) {} });
  await entrarAdmin(s);
  const vt = await s.locator('#view').innerText();
  ok('Sin la actualización 3: avisa al administrador y sigue funcionando', /03-formulario-cotiza\.sql/.test(vt) && /Aún no hay clientes/.test(vt), vt.replace(/\n/g, ' | ').slice(0, 300));
  await s.locator('.tab[data-view="equipo"]:visible').click();
  ok('Sin la actualización 3: Equipo explica cómo activarlo', /Para activarlo/.test(await s.locator('#formPanel').innerText()));
  errores.push(...s.errores);

  ok('Sin errores de JavaScript', errores.length === 0, errores.slice(0, 4).join(' || '));
  console.log(results.join('\n'));
  await browser.close();
  process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.log(results.join('\n')); console.error('ERROR', e.message); process.exit(1); });
