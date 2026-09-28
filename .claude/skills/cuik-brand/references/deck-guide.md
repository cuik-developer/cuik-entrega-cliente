# Deck guide (pptx)

House style = the D'frios deck (assets/referencia-presentacion-dfrios.pdf): blue full-bleed,
giant uppercase titles, meta top-right, annotated mockups, GRACIAS closing.

Structure for a client deck (10-14 slides):

1. `hero("PRESENTACIÓN\nTU PROGRAMA\nDE PUNTOS", meta=("Setiembre 2026", "Guía del programa", "Presentado por: Cuik"), footnote="...")`
2. `hero_section("CÓMO SUMAN\nPUNTOS", kicker="Lo básico")`
3. `bullets(...)` (white slide), 3-5 items.
4. `annotated(mockup.png, left=[("Logotipo",""), ...], right=[("Puntos acumulados","{{points.balance}}"), ...], title_left="ELEMENTOS", title_right="TU PASE")`
5. `stats(...)`: real numbers from the tenant.
6. `table(...)`: reglas activas / catálogo.
7. `callout(...)`: the one rule to remember.
8. `bullets(...)`: variables del pase y campañas.
9. `bullets(...)`: día a día.
10. `thanks()`

`cover`/`closing` (softer, asterisk) remain available, but prefer `hero`/`thanks` for client decks.
Use \n in hero titles to control line breaks; 2-3 words per line.

```python
import sys; sys.path.insert(0, r".claude/skills/cuik-brand/scripts")
from cuik_pptx import CuikDeck
d = CuikDeck()
meta = ("Setiembre 2026", "Guía del programa", "Presentado por: Cuik")
d.hero("PRESENTACIÓN\nPROGRAMA\nDE PUNTOS", meta=meta, footnote="Documento con las reglas de tu programa, tu pase y cómo usar el panel.")
d.hero_section("CÓMO SUMAN\nPUNTOS", kicker="Lo básico", meta=meta)
d.bullets("Así funciona", ["Escanea el QR y recibe su pase en el Wallet", "Cada compra suma 1 punto por sol", "El pase se actualiza solo"])
d.stats("Tu programa hoy", [("6", "clientes"), ("30", "visitas"), ("120", "puntos en circulación")])
d.table("Reglas activas", ["Regla", "Valor"], [["Puntos por sol", "1"], ["Vencimiento", "Cada lunes"]], col_widths=[2, 3])
d.thanks()
d.save("out.pptx")
```

Export to PDF: PowerPoint → Guardar como PDF (fonts installed). No LibreOffice on this machine.
