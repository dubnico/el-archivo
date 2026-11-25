# El Archivo — Periódico personal en un solo HTML

Herramienta local integrada con **Antigravity** para acumular artículos traducidos y maquetados en un **único archivo autónomo** (`periodico.html`), conservando exactamente tu diseño editorial (`Newsreader` + `Inter`, barra de progreso, modos Claro / Sepia / Oscuro, ajuste `A−/A+` y estilos de impresión).

## Cómo sumar una nueva nota

Abrí esta carpeta en Antigravity y escribí `/nota` acompañado de cualquiera de estas opciones:

- **Un link**: `/nota https://ejemplo.com/articulo`
- **Un PDF o texto en la carpeta `entrada/`**: dejá el archivo en `entrada/` y escribí `/nota entrada/mi-articulo.pdf` (o simplemente `/nota revisá entrada/`)
- **Texto largo pegado directo en el chat**: `/nota` + el texto completo

Si una URL tiene paywall o bloqueo anti-bot, el extractor te avisa para que pegues el texto o guardes la página como PDF desde el navegador en `entrada/`.

## Estructura del proyecto

- `periodico.html`: **tu periódico único y portable** (podés abrirlo con doble clic, sin servidor, y funciona offline).
- `data/config.json`: nombre del periódico, subtítulo y nombre del archivo de salida.
- `data/articulos/`: cada nota guardada en JSON (fuente de verdad para reconstruir `periodico.html` limpiamente).
- `entrada/`: carpeta para dejar PDFs o textos.
- `scripts/extract.mjs`: extractor de PDFs (`unpdf`), URLs (`@mozilla/readability` + `linkedom`) y archivos de texto.
- `scripts/build.mjs`: reconstruye `periodico.html` a partir de `data/articulos/*.json`.
- `scripts/add-article.mjs`: valida una nota nueva, la guarda en `data/articulos/`, reconstruye `periodico.html` y lo abre en el navegador.
- `.agents/skills/nota/SKILL.md`: instrucciones automáticas para Antigravity.

## Comandos útiles

```powershell
# Reconstruir periodico.html manualmente (por ejemplo, si editás data/config.json o algún JSON)
npm run build

# Ver archivos pendientes en entrada/
node scripts/extract.mjs --inbox
```
