# AGENTS.md — El Archivo (Periódico Personal)

Este proyecto genera y mantiene un **único archivo HTML autónomo** ([periodico.html](periodico.html)) que acumula artículos periodísticos, ensayos, entrevistas e investigaciones traducidos íntegramente al español, conservando el diseño editorial original (`Newsreader` + `Inter`, modos Claro/Sepia/Oscuro, `A−/A+`, barra de progreso y estilos de impresión).

## Reglas fundamentales del proyecto

1. **Archivo único de salida**: Todas las lecturas acumuladas viven en `periodico.html`, reconstruido de forma determinística a partir de `data/articulos/*.json`. Nunca editar `periodico.html` a mano; modificar `scripts/build.mjs` o los JSON y correr `npm run build`.
2. **Conservar referencia original**: Mantener intacto `visiones-secretas-dario-amodei-anthropic.html` como referencia de diseño original.
3. **Fidelidad 100% (sin resumir)**: Todo artículo sumado al archivo debe traducirse/conservarse de forma íntegra al español periodístico natural, sin recortar ni resumir párrafos.
4. **Flujo `/nota`**: Al agregar una nota manualmente desde el chat, seguir `.agents/skills/nota/SKILL.md` (incluyendo confirmar **autor** y **fuente/medio** con el usuario antes de publicar).
5. **Validar después de editar**: Verificar la generación ejecutando `npm run build` o `node scripts/add-article.mjs`.

## Estructura y comandos principales

- `periodico.html`: Periódico único portable y offline (portada con grilla de 12 columnas, buscador y filtros por sección + vista de lectura de 680px).
- `data/config.json`: Nombre del periódico, subtítulo y archivo de salida.
- `data/curacion.json`: Guía editorial (temas de IA, personajes curados y medios internacionales de economías centrales; excluir medios latinoamericanos).
- `data/articulos/*.json`: Fuente de verdad de cada nota publicada.
- `entrada/`: Carpeta para dejar PDFs o textos locales.
- `scripts/extract.mjs`: Extrae texto de URLs (`@mozilla/readability` + `linkedom`), PDFs (`unpdf`) o archivos de texto; detecta paywalls/bloqueos.
- `scripts/build.mjs`: Reconstruye `periodico.html` (soporta `--list` para listar notas existentes sin duplicar).
- `scripts/add-article.mjs`: Valida el JSON editorial, guarda en `data/articulos/`, reconstruye `periodico.html` y soporta `--open`, `--overwrite` y `--cleanup`.

## Automatización diaria

- **Nombre**: `Edición Diaria — El Archivo (IA)` (`~/.gemini/config/sidecars/diario-ia-el-archivo/sidecar.json`).
- **Horario**: Todos los días a las 16:00 hs (`CRON_TZ=America/Argentina/Buenos_Aires`).
- **Comportamiento**: Busca 1 o 2 notas recientes de acceso abierto guiándose por `data/curacion.json`, evita duplicados con `node scripts/build.mjs --list`, extrae, traduce íntegramente y publica en `periodico.html`.

## Features futuras (Roadmap)

- **Publicación online con Firebase Hosting**: Configurar Firebase Hosting (`firebase deploy`) para publicar `periodico.html` en una URL propia con HTTPS (ej. `https://<proyecto>.web.app`) y poder leerlo cómodamente desde el celular (especialmente iOS/Android) sin depender de visores locales de mail. Opcionalmente integrar el deploy automático al final de `scripts/add-article.mjs` o de la automatización diaria.
