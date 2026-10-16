# Diamond Travel CRM

CRM de la agencia de viajes **Diamond Travel** (Cúcuta, Norte de Santander, Colombia).
Diseño azul marino, dorado y blanco · interfaz en español · moneda COP · fechas DD/MM/AAAA.

> Este repositorio guarda **solo código**. Nunca subas aquí respaldos con datos de clientes
> (archivos `.json` o `.csv` exportados desde el CRM). Esos se guardan en la app Archivos del iPad.

## Estado actual

| Versión | Dónde funciona | Estado |
|---|---|---|
| `version-claude/` | Dentro de la app de Claude (artefacto con base de datos propia) | En uso |
| Versión web independiente (React + Supabase + Netlify) | Enlace propio en Safari | En construcción |

### Módulos de la versión Claude
- Inicio con indicadores (presupuesto en proceso, clientes nuevos, cotizaciones por responder, ventas cerradas).
- Clientes con contacto, preferencias, presupuesto e historial de seguimientos.
- Embudo comercial por etapas.
- Generador de cotizaciones: formulario por pestañas, número consecutivo, cálculos automáticos,
  PDF con logo y datos de la agencia, vista previa, descarga, duplicar, estados y envío por WhatsApp.
- Respaldo: copia completa JSON (clientes y cotizaciones), listas CSV para Excel y restauración.

## Estructura

```
assets/                      Logo de Diamond Travel (original y versión sin fondo)
version-claude/
  diamond-travel-crm.html    Página publicada en Claude (generada, no editar a mano)
  fuentes/                   Código fuente y script build.py que arma la página
  pruebas/                   Pruebas de cálculos/PDF y prueba de extremo a extremo con datos ficticios
```

Para regenerar la página: `python3 version-claude/fuentes/build.py version-claude/diamond-travel-crm.html`

## Datos de contacto que usa el PDF
WhatsApp 305 205 1183 · reservasdiamondtravel@gmail.com · @diamondtours_cucuta ·
Calle 17 OE-48, barrio Caobos, Cúcuta, Norte de Santander, Colombia.
