# Deck guide (pptx)

Structure that works for a client-facing deck (10-14 slides):

1. `cover` — título en Poppins Black blanco sobre azul, subtítulo "Guía para <negocio>", tag con fecha.
2. `section` — "Tu programa en una frase".
3. `bullets` / `text` — cómo funciona para el cliente (escanea, se registra, pase en Wallet, cada visita suma).
4. `two_columns` — Antes / Ahora (tarjeta azul a la derecha).
5. `stats` — números reales del tenant (clientes, visitas, puntos en circulación).
6. `table` — reglas activas (puntos por sol, mínimo, vencimiento, aviso) o catálogo de premios.
7. `callout` — la regla más importante en una frase ("Los puntos vencen cada lunes.").
8. `image` — mockup del pase o captura del panel, con caption.
9. `bullets` — variables del pase / campañas y qué muestra cada una.
10. `bullets` — día a día en caja y panel.
11. `closing` — contacto.

Rules: one idea per slide; max 5 bullets; numbers in the tables right-aligned; never more than one orange element per slide (the helper already places the asterisk).

Minimal example:

```python
import sys; sys.path.insert(0, r".claude/skills/cuik-brand/scripts")
from cuik_pptx import CuikDeck
d = CuikDeck()
d.cover("Tu programa de puntos", "Guía para Café Central", tag="Setiembre 2026")
d.section("Cómo suman puntos tus clientes", kicker="Lo básico")
d.bullets("Así funciona", ["Escanea el QR del mostrador y recibe su pase en el Wallet", "Cada compra suma 1 punto por sol", "El pase se actualiza solo, con notificación"])
d.stats("Tu programa hoy", [("6", "clientes"), ("30", "visitas"), ("120", "puntos en circulación")])
d.table("Reglas activas", ["Regla", "Valor"], [["Puntos por sol", "1"], ["Vencimiento", "Cada lunes"], ["Aviso", "2 días antes, 10:00"]], col_widths=[2, 3])
d.closing()
d.save("out.pptx")
```

Export to PDF: open in PowerPoint (fonts installed) → Guardar como PDF. There is no LibreOffice on this machine.
