# Cuik — Guía de diseño del panel (estilo "enterprise")

Toda pantalla nueva del **panel del comercio** (`/panel/*`) y del **super-admin** (`/admin/*`)
sigue esta guía para que el producto se vea homogéneo. La referencia viva es
`apps/web/components/admin/enterprise.tsx` y las pantallas Campañas, Configuración y Analítica.

Fuera de alcance (tienen su propio look): cajero (`/cajero/*`), landing, páginas públicas del
cliente final (registro, premios públicos) y los pases de Wallet.

## Principios

- Sobrio y denso, tipo consola empresarial: información primero, decoración nunca.
- Una sola paleta neutra con un único color de acento (azul). El color se usa **solo para estados**.
- Sin sombras, sin degradados, sin emojis, sin íconos dentro de cuadros de color.
- Radio de 4px (`rounded-[4px]`) en todo. Nada de `rounded-xl` / `rounded-2xl`.

## Colores (tokens de `globals.css`)

Usa siempre las clases `ent-*`; nunca colores de Tailwind sueltos (`amber-*`, `emerald-*`,
`violet-*`…) ni hex nuevos.

| Token | Uso |
|---|---|
| `bg-ent-bg` | Fondo de la página |
| `bg-ent-panel` / `bg-ent-panel-2` | Superficie blanca / gris claro (vistas previas, cabeceras de tabla) |
| `border-ent-line` / `border-ent-line-strong` | Bordes de 1px / bordes de inputs y cabecera de tabla |
| `text-ent-fg` / `text-ent-fg-2` / `text-ent-fg-3` | Texto principal / secundario / ayudas y etiquetas |
| `text-ent-accent`, `bg-ent-accent-soft` | Enlaces, ítem activo, selección |
| `ent-ok` / `ent-warn` / `ent-bad` / `ent-info` | **Solo estados**: correcto, atención, error, información |

## Tipografía

IBM Plex Sans (la aplica `.ent`), números tabulares.

| Elemento | Clase |
|---|---|
| Título de página | lo pone `PageHeader` (17px semibold) |
| Texto normal | `text-[12.5px]` |
| Ayudas y descripciones | `text-[12px] text-ent-fg-3` |
| Etiquetas de campo / secciones | `text-[11px] uppercase tracking-[0.05em] text-ent-fg-3` |

Nada de `text-2xl font-extrabold` ni títulos grandes.

## Componentes (importar de `@/components/admin/enterprise`)

| Necesito… | Usa |
|---|---|
| Encabezado de página | `PageHeader` con `crumbs` (`Inicio › Sección`), `title`, `subtitle`, `actions` |
| Una tarjeta / bloque | `Panel` + `PanelHeader` (título y acciones a la derecha). No uses `Card` de shadcn |
| Cifras clave | `StatStrip` (sin íconos ni cuadros de color) |
| Filtros y búsqueda | `Toolbar` encima de la tabla |
| Listas de registros | `DataTable` + `Th` / `Td` / `Tr`; números con `align="right"` |
| Un estado (activo, pausado, error…) | `StatusChip tone="ok|info|warn|bad|mute"` (punto de color + texto). No uses `Badge` de colores |
| Un aviso | `Notice tone="info|ok|warn|bad"` (franja lateral + una frase). Nada de cajas `bg-amber-50` |
| Detalle clave/valor | `FieldList` |
| Cargando / vacío / error | `PanelMessage` |

## Botones e inputs

- Botón de acción de página o panel: `<Button size="sm" className="h-7 text-[12px] gap-1.5">` con
  ícono `w-3.5 h-3.5`.
- Botones de ícono en filas: `variant="ghost" size="icon" className="h-7 w-7"`.
- Interruptores (`Switch`) con el texto del estado al lado ("Activado" / "Desactivado").
- Diálogos: `Dialog` de shadcn está bien; dentro, los mismos tamaños de texto de esta guía.
- Respeta `readOnly` (vista de solo lectura del super-admin): deshabilita y pon
  `title="Solo lectura"`.

## Textos

- Español neutro con **tú** ("Crea", "Tienes"), nunca voseo ("Creá", "Tenés").
- Lenguaje neutro en género ("Sin mentir" en vez de "Sé honesto/a").
- Frases cortas; explica qué pasa para el cliente final ("Así lo verá Ana").
- Sin estadísticas inventadas.

## Excepciones que se mantienen

`panel/premios`, `panel/cajeros` y partes de `panel/mi-pase` usan el estilo anterior (cuadros
de color, `rounded-xl`, `Card`) y **se quedan así por decisión** (22 oct 2026): no los cambies
salvo que se pida. Todo lo nuevo sigue esta guía.
