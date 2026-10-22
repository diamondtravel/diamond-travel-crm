# Diamond Travel CRM

CRM de la agencia de viajes **Diamond Travel** (Cúcuta, Norte de Santander, Colombia).
Diseño azul marino, dorado y blanco · interfaz en español · moneda COP · fechas DD/MM/AAAA.

> Este repositorio guarda **solo código**. Nunca subas aquí respaldos con datos de clientes
> (archivos `.json` o `.csv` exportados desde el CRM). Esos se guardan en la app Archivos del iPad.

## Estado actual

| Versión | Dónde funciona | Estado |
|---|---|---|
| `version-claude/` | Dentro de la app de Claude (artefacto con base de datos propia) | En uso |
| `web/` (versión web independiente: Supabase + Netlify) | https://diamondtravel-crm.netlify.app | Publicada |

### Módulos de la versión Claude
- Inicio con indicadores (presupuesto en proceso, clientes nuevos, cotizaciones por responder, ventas cerradas).
- Clientes con contacto, preferencias, presupuesto e historial de seguimientos.
- Embudo comercial por etapas.
- Generador de cotizaciones: formulario por pestañas, número consecutivo, cálculos automáticos,
  PDF con logo y datos de la agencia, vista previa, descarga, duplicar, estados y envío por WhatsApp.
- Respaldo: copia completa JSON (clientes y cotizaciones), listas CSV para Excel y restauración.

## Versión web (`web/`)
- Sitio estático (HTML, CSS y JavaScript, sin compilación) que publica Netlify desde la carpeta `web/` (ver `netlify.toml`).
- Datos, inicio de sesión y permisos en **Supabase**. La estructura y los permisos están en `supabase/schema.sql`
  (se ejecuta una vez en Supabase → SQL Editor). Pruebas de permisos: `supabase/pruebas/`.
- Roles: **administrador** (ve todo, activa cuentas, borra, restaura respaldos) y **asesor** (ve y edita solo sus clientes
  y cotizaciones, salvo que el administrador habilite ver todo). Las cuentas nuevas quedan pendientes hasta que el administrador las activa.
- El número de cotización lo asigna la base de datos (consecutivo sin repetidos).
- Migración desde la versión Claude: Respaldo → Restaurar con el JSON descargado desde la versión Claude.
- **Seguimientos de hoy** (Inicio): el CRM prepara el mensaje (cotización sin respuesta, cliente sin contacto,
  viaje próximo, regreso) y se envía por WhatsApp con un toque. El administrador edita textos y días en Equipo.
- **Plantillas de cotización** (por ejemplo "San Andrés"): guardan destino, servicios, condiciones y opciones;
  no guardan cliente, fechas, pasajeros ni precios.
- **Varias opciones de precio** por cotización (por ejemplo solo desayuno / todo incluido), cada una con su total en el PDF.
- Actualizaciones de la base de datos: `supabase/02-seguimientos-y-plantillas.sql` (se ejecuta una vez, después de `schema.sql`).
- Pruebas de extremo a extremo con Supabase simulado y datos ficticios: `web-pruebas/`.

## Estructura

```
assets/                      Logo de Diamond Travel (original y versión sin fondo)
web/                         Versión web independiente (lo que publica Netlify)
supabase/schema.sql          Tablas, permisos (RLS) y funciones de la base de datos
web-pruebas/                 Prueba de extremo a extremo de la web con Supabase simulado
netlify.toml                 Configuración de publicación y cabeceras de seguridad
version-claude/
  diamond-travel-crm.html    Página publicada en Claude (generada, no editar a mano)
  fuentes/                   Código fuente y script build.py que arma la página
  pruebas/                   Pruebas de cálculos/PDF y prueba de extremo a extremo con datos ficticios
```

Para regenerar la página: `python3 version-claude/fuentes/build.py version-claude/diamond-travel-crm.html`

## Datos de contacto que usa el PDF
WhatsApp 305 205 1183 · reservasdiamondtravel@gmail.com · @diamondtours_cucuta ·
Calle 17 OE-48, barrio Caobos, Cúcuta, Norte de Santander, Colombia.
