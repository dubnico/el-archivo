---
name: nota
description: >-
  Extrae, traduce íntegramente al español y agrega una nota periodística (desde un link, un PDF o un texto largo) al archivo único periodico.html conservando el diseño editorial original. Activar cuando el usuario pase una URL, un PDF, un archivo de entrada o texto largo para sumar al periódico.
---

# Publicar una nueva nota en `periodico.html`

Este skill agrega artículos al periódico personal acumulado en `periodico.html`, manteniendo 100% del diseño editorial original (`Newsreader` + `Inter`, Claro/Sepia/Oscuro, `A−/A+`, portada + vista de lectura).

## Reglas editoriales obligatorias

1. **Integridad 100% (sin resumir ni omitir)**:
   - Si el material está en otro idioma, traducirlo **íntegramente** al español rioplatense/neutro periodístico natural. Prohibido resumir, compactar o saltear párrafos.
   - Si ya está en español, conservar el texto íntegro y limpiar únicamente ruido de navegación, anuncios, pies de página repetidos o números de página.
   - Si el texto es muy extenso, traducirlo con calma por bloques antes de armar el JSON final, verificando que no falte ningún párrafo ni sección.
2. **Estilo tipográfico**:
   - Usar comillas latinas `«...»` para citas textuales (y `"..."` solo para citas anidadas dentro de `«...»`).
   - Envolver en `<em>...</em>` nombres de medios (*The Washington Post*, *Wired*, *The New York Times*), libros, ensayos y extranjerismos no adaptados.
   - Usar raya `—` para incisos cuando corresponda.
3. **Elementos opcionales**:
   - `masthead`: nombre del medio o lema original de la publicación (dinámico por nota). Si es un ensayo/PDF sin medio, usar el nombre de la fuente o autor.
   - `callout` y `readersBox`: **omitirlos** salvo que existan en el artículo original.
   - `heading` (`h2`), `subheading` (`h3`), `blockquote` y `list`: usarlos solo cuando el artículo original traiga subtítulos, citas destacadas o listas.

## Procedimiento paso a paso

### 1. Obtener el texto fuente

- **Si el usuario pegó el texto directamente**: trabajar directo con ese texto.
- **Si el usuario menciona la carpeta `entrada/` sin dar el archivo exacto**:
  ```powershell
  node scripts/extract.mjs --inbox
  ```
- **Si el usuario pasó una URL o la ruta de un PDF / `.txt` / `.md`**:
  ```powershell
  node scripts/extract.mjs "<url-o-ruta>" --out .tmp/extracted.json
  ```
  - Si el script sale con código `2` (`blocked: true` por paywall, HTTP 403/401, bloqueo anti-bot o PDF escaneado sin texto): **detenerse e informar al usuario** el motivo exacto, pidiéndole que pegue el texto acá o guarde el PDF desde el navegador en `entrada/`.
  - Si devuelve `warning`, avisar al usuario si parece incompleto antes de publicar.
  - Leer `.tmp/extracted.json` completo (en tramos si supera el límite de lectura) para no perder nada del texto.

### 2. Confirmar autor y fuente con el usuario

Antes de maquetar y publicar la nota, **preguntar siempre al usuario** (en texto directo y breve, sin saltear este paso):
1. **¿Quién escribió el artículo?** (`author`). Si el extractor o el texto ya detectaron un autor, mostrarlo para que lo confirme o corrija.
2. **¿Cuál es la fuente / medio?** (`sourceName` y `masthead`). Si viene de una URL o PDF con medio identificable, mostrarlo para confirmar; si no, pedirle el nombre del medio, sitio o publicación (ej. *The Atlantic*, *Substack*, *Ensayo personal*).

Con su respuesta, completar `author`, `sourceName` y `masthead` (y `sourceUrl` si corresponde). Si el usuario indica que no tiene autor o prefiere omitirlo, respetar esa indicación.

### 3. Construir el JSON editorial

Escribir el artículo traducido y estructurado en `.tmp/new-article.json` siguiendo este esquema:

```json
{
  "slug": "slug-descriptivo-en-minusculas",
  "title": "Título periodístico en español",
  "kicker": "Sección · Subtema",
  "section": "Sección",
  "deck": "Bajada o subtítulo editorial (si el artículo lo trae o una línea clara si conviene).",
  "masthead": "Nombre del medio o lema original",
  "sourceName": "Nombre del medio original (opcional)",
  "sourceUrl": "https://... (si vino de una URL)",
  "author": "Nombre del autor (si consta)",
  "date": "24 de noviembre de 2026",
  "dateIso": "2026-11-24",
  "dateline": "Ciudad (solo si el artículo abre con dateline periodístico, ej. San Francisco)",
  "blocks": [
    { "type": "lead", "html": "Primer párrafo (lleva letra capital automática y dateline si se definió)." },
    { "type": "paragraph", "html": "Párrafo normal con <em>cursivas</em> si corresponde." },
    { "type": "heading", "text": "Subtítulo principal de sección (opcional)" },
    { "type": "subheading", "text": "Subtítulo secundario (opcional)" },
    { "type": "blockquote", "html": "Cita destacada (opcional)", "cite": "Autor de la cita (opcional)" },
    { "type": "list", "ordered": false, "items": ["Primer ítem", "Segundo ítem"] },
    { "type": "code", "language": "json", "code": "{ \"sin_traducir\": true }" },
    { "type": "figure", "src": "assets/slug/fig-1.jpg", "alt": "Descripción", "caption": "Pie de gráfico (opcional)" },
    { "type": "section_break" },
    { "type": "callout", "titleHtml": "Título (solo si existe en el original)", "bodyHtml": "Texto" }
  ]
}
```

Notas del esquema:
- El primer párrafo del cuerpo debe usar `"type": "lead"` para activar la letra capital editorial.
- Si el artículo incluye `readersBox` en el original, agregar el objeto opcional:
  ```json
  "readersBox": {
    "title": "Qué están diciendo los lectores",
    "bodyHtml": "...",
    "aiNote": "..."
  }
  ```

### 4. Agregar al archivo, regenerar `periodico.html`, publicar en GitHub Pages y abrirlo

Ejecutar:

```powershell
node scripts/add-article.mjs .tmp/new-article.json --cleanup --open --push
```

- Esto valida el esquema, guarda el artículo en `data/articulos/<fecha>-<slug>.json`, regenera `periodico.html` e `index.html`, limpia `.tmp`, hace `git commit` + `git push` de los archivos publicados (actualizando **GitHub Pages** en `https://dubnico.github.io/el-archivo/`) y abre `periodico.html` en el navegador.
- Si el usuario pidió actualizar una nota ya existente con el mismo slug, sumar `--overwrite`.
- Si el usuario pidió expresamente NO subir a GitHub, omitir `--push`.

### 5. Confirmar

- Confirmar al usuario el título agregado, la sección, la cantidad total de notas en `periodico.html`, el enlace local a `periodico.html` y el enlace online `https://dubnico.github.io/el-archivo/`.
