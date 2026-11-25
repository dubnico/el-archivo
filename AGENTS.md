# AGENTS.md — El Archivo (Periódico Personal)

Este proyecto genera y mantiene un **único archivo HTML autónomo** ([periodico.html](periodico.html)) que acumula artículos periodísticos, ensayos, entrevistas e investigaciones traducidos íntegramente al español, conservando el diseño editorial original (`Newsreader` + `Inter`, modos Claro/Sepia/Oscuro, `A−/A+`, barra de progreso y estilos de impresión).

## Reglas fundamentales del proyecto

1. **Archivo único de salida**: Todas las lecturas acumuladas viven en `periodico.html`, reconstruido de forma determinística a partir de `data/articulos/*.json`. Nunca editar `periodico.html` a mano; modificar `scripts/build.mjs` o los JSON y correr `npm run build`.
2. **Conservar referencia original**: Mantener intacto `visiones-secretas-dario-amodei-anthropic.html` como referencia de diseño original.
3. **Fidelidad 100% (sin resumir)**: Todo artículo sumado al archivo debe traducirse/conservarse de forma íntegra al español periodístico natural, sin recortar ni resumir párrafos.
4. **Flujo `/nota`**: Al agregar una nota manualmente desde el chat, seguir `.agents/skills/nota/SKILL.md` (incluyendo confirmar **autor** y **fuente/medio** con el usuario antes de publicar).
5. **Validar después de editar**: Verificar la generación ejecutando `npm run build` o `node scripts/add-article.mjs`.

## Estructura y comandos principales

- `periodico.html` e `index.html`: Periódico único portable y offline (portada con grilla de 12 columnas, buscador y filtros por sección + vista de lectura de 680px). `scripts/build.mjs` mantiene `index.html` sincronizado para **GitHub Pages** (`https://dubnico.github.io/el-archivo/`, repo `https://github.com/dubnico/el-archivo.git`, rama `main`).
- `data/config.json`: Nombre del periódico, subtítulo y archivo de salida.
- `data/curacion.json`: Guía editorial (temas de IA, personajes curados y medios internacionales de economías centrales; excluir medios latinoamericanos).
- `data/articulos/*.json`: Fuente de verdad de cada nota publicada.
- `entrada/`: Carpeta para dejar PDFs o textos locales.
- `scripts/extract.mjs`: Extrae texto de URLs (`@mozilla/readability` + `linkedom`), PDFs (`unpdf`) o archivos de texto; detecta paywalls/bloqueos.
- `scripts/build.mjs`: Reconstruye `periodico.html` e `index.html` (soporta `--list` para listar notas existentes sin duplicar; renderiza bloques `lead`, `paragraph`, `heading`, `subheading`, `blockquote`, `list`, `code`, `figure`, `section_break` y `callout`, embebiendo imágenes locales de `assets/` como data URIs base64 para mantener el HTML 100% autónomo).
- `assets/`: Imágenes y gráficos originales descargados por artículo (embebidos automáticamente al compilar `periodico.html`).
- `scripts/add-article.mjs`: Valida el JSON editorial, guarda en `data/articulos/`, reconstruye `periodico.html` e `index.html` y soporta `--open`, `--overwrite`, `--cleanup` y `--push` (hace `git add / commit / push` solo de `data/articulos/`, `assets/`, `periodico.html` e `index.html` para actualizar **GitHub Pages** automáticamente).

## Automatización diaria

- **Nombre**: `Edición Diaria — El Archivo (IA)` (`~/.gemini/config/sidecars/diario-ia-el-archivo/sidecar.json`).
- **Horario**: Todos los días a las 16:00 hs (`CRON_TZ=America/Argentina/Buenos_Aires`).
- **Comportamiento**: Busca 1 o 2 notas recientes de acceso abierto guiándose por `data/curacion.json`, evita duplicados con `node scripts/build.mjs --list`, extrae, traduce íntegramente, publica en `periodico.html` y sube automáticamente a GitHub Pages (`--cleanup --push`).

## Features futuras (Roadmap)

- **Alternativa en Google (Firebase Hosting)**: Si se prefiere no depender de un repositorio público en GitHub, migrar la publicación online a Firebase Hosting (`firebase deploy`, `https://<proyecto>.web.app`).
