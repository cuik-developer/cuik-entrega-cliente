---
name: cuik-brand
description: Identidad visual de Cuik para producir cualquier pieza dirigida a clientes o prospectos — presentaciones (.pptx), documentos (.docx/.pdf), one-pagers, propuestas, guías de uso de un tenant, posts. Úsala SIEMPRE que se pida "una presentación", "un documento", "un PDF", "un one-pager" o "algo para el cliente/el artista/el comercio" de Cuik. Trae la paleta exacta, las tipografías (archivos .ttf incluidos), el logo, el motivo del asterisco, el tono de voz y dos helpers (python-pptx / python-docx) que ya aplican todo eso.
---

# Cuik — identidad para piezas de cliente

Fuente de verdad: `assets/cuik-brandbook.pdf` (una página: logo, paleta, tipografías, aplicaciones).
Todo lo de abajo está extraído de ahí y de la web pública (cuik.org).

## 1. Paleta (usar estos hex, no aproximaciones)

| Token | Hex | Uso |
|---|---|---|
| `blue` (primario) | `#0E70DB` | Logo, títulos de portada, botones, fondos de bloque destacado |
| `orange` (acento) | `#FF4810` | Un solo acento por pantalla: el asterisco, una palabra clave, una cifra |
| `ink` | `#231F20` | Texto principal (negro de marca, no `#000`) |
| `black` | `#000000` | Solo el asterisco negro y siluetas |
| `white` | `#FFFFFF` | Fondo base y texto sobre azul |
| `surface` | `#F8F8F8` | Fondo de página / tarjetas suaves |
| `navy` (producto) | `#0F172A` | Solo cuando se muestra la app (barra lateral, hero de la web). No es color de marca para papelería |
| `muted` | `#6B7280` | Texto secundario, pies, etiquetas |
| `line` | `#E5E7EB` | Bordes y separadores |

Regla: azul manda, naranja acentúa, el resto es blanco/gris. Nunca degradados azul→naranja. Nunca naranja como fondo de texto largo.

## 2. Tipografías (archivos en `assets/fonts/`)

| Rol | Fuente | Archivo | Fallback |
|---|---|---|---|
| Logotipo / display grande | Cocogoose Pro Regular | `Cocogoose-Pro-Regular-trial.ttf` | Poppins Black |
| Títulos | Poppins Black | `Poppins-Black.ttf` | Arial Black |
| Subtítulos, cifras, botones | Poppins Bold | `Poppins-Bold.ttf` | Arial Bold |
| Cuerpo | Poppins Regular | `Poppins-Regular.ttf` | Arial |

- **Cocogoose es versión trial**: úsala solo para el wordmark o un título de portada; el resto en Poppins. Si la pieza va a un cliente final, prefiere Poppins Black para display y evita depender de Cocogoose.
- Para que PowerPoint/Word rendericen las fuentes en la máquina del destinatario, las fuentes deben estar instaladas ahí o incrustadas. Regla práctica: **instala las .ttf localmente antes de exportar a PDF** (doble clic en cada .ttf → Instalar) y entrega PDF cuando la fidelidad importe. El .pptx/.docx nombran "Poppins"; si falta, cae a Arial y se ve aceptable.
- Escala tipográfica para slides 16:9 (13.33 × 7.5 in): título 40–44 pt Black, subtítulo 20–24 pt Bold, cuerpo 16–18 pt Regular, notas 12 pt. Para documentos A4: título 28 pt, H2 18 pt, cuerpo 11 pt, interlineado 1.25.
- Títulos en `sentence case` (solo la primera mayúscula). Nada en MAYÚSCULAS salvo etiquetas pequeñas con tracking.

## 3. Logo (archivos en `assets/logo/`)

- `logo-mark.jpeg` (1080²): isotipo "C" con flecha, azul sobre fondo blanco redondeado. Úsalo para favicon/marca de agua/esquinas.
- `logo-mark-on-blue.png`: isotipo blanco sobre bloque azul (portadas).
- `wordmark-blue-on-white.png`: palabra **Cuik** en azul (Cocogoose). Úsala en portadas y cierre; en cabeceras interiores basta el isotipo pequeño o el texto "Cuik" en Poppins Bold azul.
- Zona de respeto: la altura de la "C" alrededor. Mínimo 24 px / 8 mm de alto.
- Nunca: rotar, recolorear (solo azul, blanco o negro), estirar, poner sobre foto sin bloque de color.

## 4. Motivo: el asterisco (`asterisk-*.png`)

Estrella de 8 puntas, el elemento gráfico de la marca. Se usa **una vez** por slide/página como remate: al final de un titular ("Tu loyalty no.*"), como viñeta grande de una cifra, o en una esquina como firma. Colores permitidos: naranja (preferido sobre blanco/azul), azul (sobre blanco), negro, contorno. Tamaño: entre 0.4× y 0.8× la altura del titular. Nunca como patrón repetido ni como bullet de listas.

## 5. Composición

- Fondo blanco/`surface`; **un bloque azul sólido por pieza** (portada, cierre, o una tarjeta clave) con texto blanco.
- Márgenes generosos: 0.6 in en slides, 2 cm en documentos. Aire antes que densidad.
- Grillas de 2–3 columnas; tarjetas con borde `line` de 1 px y radio 12–16 px, sin sombras pesadas.
- Tablas: cabecera azul con texto blanco Poppins Bold 12 pt, filas alternas `surface`, texto `ink` 11 pt. Números alineados a la derecha.
- Cifras destacadas: número en Poppins Black 40+ pt azul, etiqueta debajo en `muted`.
- Fotos: reales, de negocio local, cálidas; siempre con esquinas redondeadas o dentro de un mockup de teléfono. Nunca stock corporativo.
- Íconos: lineales, 1.5 px, un solo color (`ink` o `blue`). Sin emojis en piezas formales; se admite el asterisco.

## 6. Voz

- Español de Perú, **tú** (nunca voseo). Cercano, concreto, sin jerga.
- Palabras de marca: "negocio", "negocios locales", "tus clientes", "gente que conoce a sus clientes", "pase", "Wallet", "sello", "puntos", "canje". Evitar: "tenant", "usuario final", "app" (Cuik no es una app: "vive en el Wallet del celular, sin descargar nada"), "equipo pequeño", "inversión".
- Titulares cortos con una idea; el acento naranja subraya la palabra que importa.
- Cifras siempre con contexto: "El 80% de clientes vuelve cuando se siente recompensado".
- Firma de piezas: "Cuik · cuik.org" y, si aplica, "Hecho con amor en Lima, Perú".

## 7. Cómo producir

**Presentación (.pptx)** → usa `scripts/cuik_pptx.py`: expone `CuikDeck` con slides listos (portada, sección, título+texto, dos columnas, cifras, tabla, cierre) que ya aplican paleta, fuentes, isotipo y asterisco. Ejemplo mínimo en `references/deck-guide.md`. Para mecánica avanzada (html2pptx, gráficos) apóyate en la skill `pptx`, pero conserva los tokens de este archivo.

**Documento (.docx)** → usa `scripts/cuik_docx.py`: `CuikDoc` con estilos Título/H1/H2/Cuerpo/Tabla/Callout ya en marca. Guía en `references/doc-guide.md`. Para PDF: instala las fuentes y exporta desde Word/LibreOffice.

**Pieza web o HTML** → tokens CSS en `references/tokens.css`.

**Antes de entregar**, checklist: azul primario correcto · un solo acento naranja por vista · Poppins en todo el texto · isotipo en portada y cierre · un asterisco por slide como máximo · tú, no vos · sin "tenant"/"app" · márgenes amplios · tablas con cabecera azul.

## 8. Contexto de producto (para que las piezas digan cosas verdaderas)

- Cuik: fidelización digital para negocios físicos. El cliente escanea un QR, se registra y recibe su pase en Apple Wallet o Google Wallet; cada visita/compra actualiza el pase con una notificación.
- Programas: **sellos** (N visitas → premio, ciclos) y **puntos** (puntos por sol, catálogo de premios, vencimiento configurable: por compra, día fijo semanal/mensual, cada X días; aviso por push antes de vencer, configurable por el comercio).
- Panel del comercio: dashboard, clientes (segmentos automáticos: nuevo, frecuente, esporádico, regular, una visita, en riesgo, inactivo; archivar/bloquear), campañas push, analítica, cajeros, mi pase.
- Caja: Escanear y Buscar; registra visitas y canjes.
- Variables de mensajes/pase: `{{client.name}}`, `{{stamps.current}}`, `{{stamps.max}}`, `{{stamps.remaining}}`, `{{stamps.total}}`, `{{rewards.pending}}`, `{{points.balance}}`, `{{points.expiring}}`, `{{points.expiresAt}}`, `{{tenant.name}}`.
