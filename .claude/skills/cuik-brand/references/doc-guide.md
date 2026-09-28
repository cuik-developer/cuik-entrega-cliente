# Document guide (docx)

Use `scripts/cuik_docx.py`. A4, 2 cm margins, Poppins 11 pt, titles Poppins Black, H2 blue.

Typical client document (guía de tenant, propuesta, manual corto):

1. `cover_blue(title, meta, footnote)` (house style, blue block + giant uppercase title) or `cover(title, subtitle, tag)` (soft) — page 1.
2. `h1` + `p` — qué es y para quién.
3. `stat_row` — 3-4 números del negocio.
4. `h1` reglas → `kv([...])` — regla por fila (label gris, valor).
5. `callout` — la regla que el comercio debe recordar.
6. `h1` catálogo → `table(headers, rows)`.
7. `h1` variables del pase → `table` con variable / qué muestra / ejemplo.
8. `h1` día a día → `numbered`.
9. `p(muted=True)` — contacto y fecha.

Keep paragraphs under 4 lines. Prefer tables to prose for anything with more than 3 datos.
Export to PDF from Word with the fonts installed (assets/fonts).
