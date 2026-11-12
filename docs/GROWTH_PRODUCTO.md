# Cuik Growth — definición de producto

Estado: definición aprobada por Francesco el 12 de noviembre de 2026 tras revisar las maquetas
(https://claude.ai/artifact/TDfNey7VJdQBkeV3X5zRcq). Es la referencia para implementar el módulo.
Las cifras de ejemplo son de Mascota Veloz (detalle por SKU del 11 nov 2026).

## 1. Qué es

Growth es el complemento de Loyalty que cruza las ventas del punto de venta (conector POS) con los
clientes registrados en Cuik para:

1. Calcular audiencias (quién debería recibir qué mensaje y cuándo).
2. Generar envíos medibles (WhatsApp 1 a 1 hoy, correo y WhatsApp API después).
3. Atribuir ventas reales del POS a cada envío y medir el impacto (con grupo de control).
4. Cobrar un fijo más un variable sobre la venta atribuida.

Objetivo: fidelizar y generar venta **sin saturar** al cliente. Un mensaje mal enviado pierde la
venta; por eso las reglas de presión de contacto mandan sobre cualquier audiencia.

## 2. Dónde vive

- **Un solo panel** (cuik.org, mismo login). Growth es un grupo del menú del comercio gateado por
  el servicio contratado. Un comercio solo-Loyalty ve una única entrada "Growth" con sus números
  reales como teaser (ej. "tienes 105 clientes en riesgo") y el botón de activar.
- **Una sola ficha de cliente** (Clientes › ficha) con pestañas Tarjeta / Visitas / Compras /
  Growth / Mensajes. Growth no tiene listado de clientes propio.
- **Super-admin › Growth** con secciones: Comercios, Conectores POS (se muda de la ficha del tenant),
  Maestras de producto, Reglas, Canales, Ads (próximamente).

Menú Growth del comercio: Resumen · Audiencias · Envíos · Correo · Resultados.
No usar "Campañas": en Loyalty ya significa campañas push del pase.

## 3. Conceptos

| Concepto | Qué es | Cuándo cambia |
|---|---|---|
| Audiencia | Regla viva (ej. "gato sin arena", "recompra próxima") | Se recalcula cada noche |
| Envío | Foto de una audiencia en un momento + plantilla + canal + seguimiento por cliente | Se congela al crearse |
| Venta atribuida | Venta real del POS enlazada a un envío confirmado | Se recalcula al cerrar cada día |
| No contactar | Estado manual del cliente con motivo | Lo marca el comercio; reversible |

Un envío nace desde la audiencia con "Crear envío". La página Envíos es el historial.

## 4. Reglas por cliente

### 4.1 Frecuencia y momento (recompra)

- `intervalo` = mediana de los últimos intervalos entre compras del cliente (mínimo 3 compras).
- Con menos de 3 compras: intervalo típico de su **categoría principal** (ej. alimento seco de gato);
  si la categoría no tiene dato, mediana del comercio.
- `dia_habitual` = día de la semana que concentra sus compras (si uno supera el 50 %).
- `fecha_esperada` = última compra + intervalo.
- `fecha_sugerida` = último `dia_habitual` estrictamente anterior a `fecha_esperada`;
  sin día habitual, `fecha_esperada - 2`. Nunca más de **7 días** antes de la esperada.
  Ej.: intervalo 34, compra los sábados → se sugiere el día 30. Adelanto pequeño a propósito:
  sube la frecuencia del comercio sin forzar.
- Cliente en el día 20 de 34: aparece en la audiencia como "listo el día 30", pero **no** entra en
  la lista sugerida de hoy.

Audiencias derivadas (distintas):

- **Recompra próxima**: hoy ≥ `fecha_sugerida` y hoy ≤ `fecha_esperada` + tolerancia.
- **En riesgo**: sin comprar más de 1.5 × intervalo (≥ 3 compras). Es el "te extrañamos".

### 4.2 Presión de contacto (anti-saturación)

| Regla | Valor por defecto | Quién lo fija |
|---|---|---|
| Cooldown: no sugerir a quien tuvo un envío confirmado hace menos de N días, en ninguna audiencia | **14 días** | Super-admin, por comercio |
| Un envío "pendiente" o "abierto" en otra lista también bloquea (evita que dos personas le escriban el mismo día) | siempre | fijo |
| Si compra o responde tras un envío, sale de Recompra y En riesgo hasta su siguiente ciclo | siempre | fijo |
| Adelanto máximo sobre la fecha esperada | 7 días | Super-admin |
| Mínimo de compras para calcular intervalo propio | 3 | Super-admin |

(El tope "N contactos por mes" se descarta: con cooldown 14 queda implícito.)

### 4.3 No contactar

- Estado por cliente: `activo` / `no_contactar` con motivo (`mascota_fallecio`, `pidio_no_recibir`,
  `numero_equivocado`, `otro`), fecha y quién lo marcó. Reversible.
- Se marca desde la fila del envío ("No contactar") o desde la ficha del cliente.
- Importable desde el Excel/lista de bloqueados del equipo de e-commerce del comercio.
- Excluye de todas las audiencias, envíos, correo y WhatsApp de Growth. Con motivo
  `pidio_no_recibir` excluye también de campañas push de Loyalty (regla "no comunicaciones").
- Los archivados/eliminados de Loyalty ya quedan fuera (regla vigente del 3 nov 2026).

## 5. Envíos

- Al crear un envío se congela la foto (ej. 40 clientes) y se sortea el **grupo de control**
  (10 %, 4 clientes, marcados "no enviar"). El control se sortea al crear, nunca se toma de los que
  el admin dejó sin enviar (eso sesgaría la medición).
- Fila por cliente con estado: `pendiente` → `abierto` (clic en "Abrir WhatsApp") → `enviado`
  (check manual del admin) → `respondio` / `compro`. También `control`, `omitido`, `no_contactar`.
- Solo `enviado` arranca el reloj de atribución y el cooldown.
- **Envío parcial**: 25 enviados de 40 → se mide sobre los 25. Los 11 no contactados no consumen
  cooldown y quedan disponibles para cualquier otra lista de inmediato.
- Canal hoy: WhatsApp 1 a 1 (deeplink con mensaje) y exportar lista (Whatzapper). Después:
  correo (Resend) y WhatsApp Business API.
- Plantillas con variables ({nombre} {cajero} {tienda} {dias} {mascota} {producto} {marca}
  {precio_oferta} {sellos_faltan} {cashback}).

## 6. Atribución y medición

- Ventana de atribución: **10 días** desde el `enviado_at` (super-admin, por comercio).
- Una venta se atribuye a **un solo envío**: el más reciente confirmado, siempre posterior a la
  hora del envío, mismo cliente (vínculo DNI / visita del conector POS).
- Tabla de enlace `growth.attributed_sales` (envío, venta, monto, días después, regla). No se copia
  la venta: si Odoo corrige o anula el ticket, la atribución apunta a la venta real.
  Se recalcula si cambian las reglas.
- Impacto incremental = compradores del grupo enviado vs grupo control, mismo periodo.
  Con menos de 30 en control el resultado se marca "orientativo".
- El comercio ve ticket por ticket qué vendió por Growth (Resultados › Ventas atribuidas).

## 7. Cobro

- Términos por comercio (super-admin): **fijo S/ 199 / mes** + **variable % sobre venta atribuida**,
  abierto por comercio (ej. Mascota Veloz 2–5 %, otro 10 %).
- El variable se cobra **solo sobre atribuida** (clientes que recibieron un envío confirmado y
  compraron dentro de la ventana). El incremental se muestra para sustentar, no para cobrar.
- Cierre mensual: suma de ventas atribuidas por fecha de venta × % → "Comisión del mes" en
  Super-admin › Growth › Comercios y línea en Finanzas para la factura.
- Conexión inicial de POS + maestra de productos: S/ 400 por única vez (propuesto).
- Piloto Mascota Veloz: 2 meses; sin resultados no se cobra (regla del 4 nov 2026).

## 8. Parámetros por comercio (super-admin › Reglas)

| Parámetro | Default | Rango |
|---|---|---|
| cooldown_dias | 14 | 3–60 |
| adelanto_max_dias | 7 | 0–14 |
| min_compras_intervalo | 3 | 2–10 |
| factor_riesgo | 1.5 | 1.2–3 |
| ventana_atribucion_dias | 10 | 3–30 |
| control_pct | 10 | 0–30 |
| audiencias habilitadas | por rubro | — |
| fee_fijo / fee_variable_pct | 199 / por comercio | — |

El admin del comercio ve los valores (Resumen › "Cómo decide Cuik a quién sugerir") y no los edita.

## 9. Datos (propuesta de tablas, schema `growth`)

- `client_stats` (tenant, client, intervalo_dias, dia_habitual, ultima_compra, fecha_esperada,
  fecha_sugerida, categoria_principal, marca_principal, compras_12m, gasto_12m): cálculo nocturno.
- `audiences` (tenant, slug, nombre, reglas json, origen: cuik|propia, activa).
- `audience_members` (audience, client, listo_desde, motivo): cálculo nocturno.
- `sends` (tenant, audience, plantilla, canal, creado_por, creado_at, foto_total, control_pct).
- `send_recipients` (send, client, estado, abierto_at, enviado_at, enviado_por, es_control).
- `attributed_sales` (tenant, send_recipient, sale_id, monto, dias_despues, regla_version).
- `contact_blocks` (tenant, client, motivo, nota, marcado_por, marcado_at, levantado_at).
- `tenant_rules` (tenant, parámetros de la sección 8, fee_fijo, fee_variable_pct).
- `product_master` (tenant, sku, nombre, categoria, especie, linea, marca): carga por super-admin.

## 10. Puesta en marcha

1. Fase 1 (MV): audiencias nocturnas, Envíos con check manual y deeplink WhatsApp, No contactar,
   Resultados con atribución 10 d y control; super-admin Comercios/Reglas/Conectores/Maestras.
   MV sigue usando Whatzapper para difusión masiva; Cuik mide lo que pasa por Envíos.
2. Fase 2: correo con Resend + captura de correo (registro, pase, partner de Odoo).
3. Fase 3: WhatsApp Business API (verificación de Meta pendiente) o proveedor.
4. Fase 4: automatizaciones (envío sugerido del día aprobado con un clic) y Ads.

Consentimiento y baja obligatorios (Ley 29733).

## 11. Plantillas por audiencia (datos ya disponibles)

Cuik define las plantillas base por rubro (super-admin › Plantillas de mensaje); el comercio puede editar el
texto y guardar variantes. Las variables se reemplazan solas y, si una no tiene dato, su frase se omite.

| Audiencia | Plantilla base | Datos que usa (origen) |
|---|---|---|
| Recompra próxima | "A {mascota} ya se le debe estar acabando su {producto}; lo tenemos listo para este {dia_habitual}" | producto habitual, día habitual, tienda (POS); cajero (quien escribe) |
| En riesgo | "Hace {dias} días no te vemos; tu {mascota} ya debe estar terminando su {producto}" | días sin comprar, producto habitual (POS); sello (Loyalty) |
| Gato sin arena / Perro sin snacks | "Para tu {mascota} que come {marca}, te recomendamos {producto_sugerido}" | marca principal (POS); producto sugerido = el más vendido de la categoría faltante en su tienda |
| Seco sin húmedo / Húmedo sin seco | "Prueba la versión {formato} de {marca}" | marca principal y formato (maestra de producto) |
| Compran antipulgas | "A {mascota} le toca su dosis de {producto} ({dias_dosis} días desde la última)" | último antipulgas y su duración (maestra: 30 o 90 días) |
| Tarjeta / cashback | "Te faltan {sellos_faltan} sellos para {cashback}" | tarjeta del cliente (Loyalty) |
| Cumpleaños del cliente | "Feliz cumpleaños, pásate por {tienda} por un regalo para {mascota}" | día y mes de cumpleaños (Loyalty) |
| Primera compra (bienvenida a los 7 días) | "Gracias por tu primera compra; con {sellos_meta} sellos tienes {premio}" | primera visita (Loyalty), programa del comercio |
| Servicios (baño, consulta) | "A {mascota} le toca su baño" | recurrencia del servicio (maestra; fase 2) |

Variables disponibles hoy: {nombre} {cajero} {tienda} {mascota} ("tu perro" / "tu gato", inferido de lo que
compra) {producto} {marca} {dias} {dia_habitual} {sellos_faltan} {cashback} {precio_oferta} (manual por envío).
No tenemos nombre de la mascota ni su cumpleaños; si el comercio los captura en el registro, se agregan.

**Un cliente, un mensaje.** Si un cliente califica en varias audiencias, el cooldown impide escribirle dos
veces; por eso el mensaje toma una intención principal y, como máximo, una línea añadida:
prioridad Recompra próxima > En riesgo > Antipulgas > Cross-sell > Tarjeta > Cumpleaños.
Ej.: Recompra + Gato sin arena → "…tu Monge de gato está listo; y si quieres probar la arena Cat's Best te la
dejamos a S/ 39". Las audiencias cross-sell no tienen "día que toca": salen pegadas a la recompra o, si el
cliente no está en recompra, como envío propio respetando el cooldown.

## 12. Estado de la implementación (fase 1, 12 nov 2026)

- **Datos:** migración `packages/db/migrations/0044_growth.sql` (schema `growth`, 7 tablas) y
  `packages/db/schema/growth.ts`. Se enciende por comercio con `tenants.features.growth`
  (super-admin › comercio › Funciones); las reglas y términos viven en `growth.tenant_rules`
  (super-admin › comercio › "Growth · reglas y términos").
- **Cálculo nocturno:** `POST /api/cron/growth-nightly` (6 AM Lima) recalcula `client_stats` y
  `audience_members` para cada comercio con Growth y atribuye ventas; `pos-sync` también atribuye
  tras cada corrida con órdenes nuevas. Lógica pura en `apps/web/lib/growth/` (tests en
  `growth.test.ts`).
- **Panel del comercio** (dueño y admins): Growth › Resumen, Audiencias, Audiencia › Crear envío,
  Envíos, Envío (flujo guiado: Abrir chat en WhatsApp → ✓ Enviado, Omitir, No contactar, Exportar
  lista CSV, Cerrar) y Resultados; pestaña Growth en la ficha del cliente con "No contactar".
- **Super-admin:** módulo Growth › Comercios (`/admin/growth`: conector, envíos, venta atribuida,
  términos y a facturar por mes). Conectores POS y maestras siguen en la ficha del comercio.
- **Pendiente:** canal correo (Resend), WhatsApp Business API, importar la lista de bloqueados del
  equipo e-commerce, línea automática en Finanzas › Facturación, plantillas editables por rubro
  desde el super-admin (hoy el comercio edita el texto al crear cada envío).
