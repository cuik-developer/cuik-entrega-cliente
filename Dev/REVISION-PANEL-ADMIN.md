# Revisión del panel del comercio (`/panel`) — oportunidades de mejora

Fecha: 9 de setiembre de 2026. Método: se levantó la app en local con datos seed más 6 clientes sintéticos repartidos en todos los segmentos, se recorrió cada pantalla en el navegador a 1440 px y se inventarió el código de `apps/web/app/(dashboard)/panel/**`. Alcance: el panel del comercio. El super-admin (`/admin`) queda fuera y se menciona al final.

Cada ítem tiene un tamaño estimado: **S** (horas), **M** (1-2 días), **L** (3+ días).

> **Estado al cierre del 9 de setiembre de 2026.** Hecho en el mismo día: #1 (schedule de retención + corte por timezone), #2 (Dashboard en español, ejes enteros), #3 en su mayor parte (fechas `formatDateTime`, badges de segmento/estado compartidos, placeholder `—`; el tier quedó **oculto** en toda la UI por decisión de producto), #5 (filtro por sucursal), #6 (KPIs hoy vs. semana pasada + bloque "Para hoy"), #8 (timeline, badges, bloqueo con auditoría, cumpleaños editable). Además: heatmap día × hora, embudo, distribución por segmento, `analytics-daily` corregido y programado, "Última visita" en el export, saludo de cumpleaños automático (§3 #5) y el switch de cumpleaños en el registro. **Pendiente**: #4 (errores silenciosos en Clientes), #7 (tipos de negocio desalineados), visita manual con motivo (requiere tocar `register-visit.ts`, protegido), verificar que un cliente bloqueado no pueda recibir sellos al escanearlo, y el resto de §3 (automatizaciones genéricas, resumen semanal, acciones masivas, NPS, referidos). El detalle técnico de lo hecho está en `ARQUITECTURA-TECNICA.md` §8.3–8.11 y `FUNCIONALIDADES.md` §4.

---

## 0. Resumen ejecutivo — lo que haría primero

| # | Qué | Por qué importa | Tamaño |
|---|---|---|---|
| 1 | **Retención por cohorte está vacía en producción** porque la escribe el cron `analytics-retention`, que no tiene schedule en Dokploy | Un widget entero de Analítica muestra "Sin datos" desde siempre | S (infra) |
| 2 | **Gráfico semanal del Dashboard en inglés** (Thu/Fri/Sat/Sun) y eje Y con decimales (2.25, 0.75) para contar visitas | Es la primera pantalla que ve el comercio | S |
| 3 | **Un sistema de tokens común**: fechas, badges de tier/segmento/estado, placeholders y colores están duplicados 3-5 veces con criterios distintos | Cada pantalla se siente de un producto distinto; cada cambio hay que hacerlo N veces | M |
| 4 | **Errores silenciosos en Clientes**: todos los `catch` están vacíos, no hay toast ni reintento | Si falla un fetch el usuario ve una tabla vacía y cree que no tiene clientes | S |
| 5 | **Analítica por sucursal**: la API ya acepta `locationId`, Configuración permite crear sucursales, pero ningún widget filtra por ella | La función existe a medias; es la pregunta más natural de un comercio con 2+ locales | M |
| 6 | **Dashboard accionable**: hoy son 4 KPIs y una tabla; falta "qué hago hoy" (clientes en riesgo, premios por vencer, campaña programada) | El Dashboard debería ser el centro de operación, hoy es un resumen pasivo | M |
| 7 | **Tipo de negocio**: la lista del select (`tienda`, `nail_bar`, `pasteleria`…) y las tablas de umbrales de segmentación (`Peluqueria`, `Spa`, `Panaderia`…) no coinciden; 6 de 11 tipos caen al default | Los segmentos "Frecuente / En riesgo" se calculan con umbrales de cafetería para un autolavado | S |
| 8 | **Timeline y ficha 360 del cliente**: el detalle tiene 4 tabs pero no muestra el historial de visitas ni los premios | Es la pantalla que abre el cajero cuando el cliente reclama algo | M |

---

## 1. Hallazgos por pantalla

### 1.1 Layout / navegación

- **Campana de notificaciones decorativa** (`layout.tsx:114`): tiene un punto naranja permanente y ningún `onClick`. O se conecta a algo (campaña enviada, cliente en riesgo, pase instalado) o se quita; hoy invita a hacer click en vano.
- **Modo oscuro a medias**: el `main` soporta `dark:`, pero sidebar, topbar, Dashboard, Cajeros y Mi Pase están en `slate-*` fijo. O se completa o se elimina el soporte parcial.
- **Sin breadcrumb ni título de pestaña por página**: el `<title>` es siempre el de la landing ("Cuik — Fidelización Digital…"). Con varias pestañas abiertas no se distinguen.
- **Sin buscador global**: para llegar a un cliente hay que ir a Clientes → buscar. Un `⌘K` que busque clientes por nombre/DNI/teléfono desde cualquier pantalla es barato con `cmdk` (ya está en shadcn).
- El botón "Salir" está pegado al borde inferior sin el nombre del usuario logueado; el avatar "MV" del topbar tampoco abre nada.

### 1.2 Dashboard (`/panel`)

Observado:

- **Días en inglés** en "Visitas esta semana": el SQL usa `to_char(…, 'Dy')`, que depende del `lc_time` de Postgres. Debería devolver la fecha y formatear en la UI con `es-PE`.
- **Eje Y con decimales** (0.75 / 1.5 / 2.25): falta `allowDecimals={false}` en el `YAxis`.
- **El gráfico aparece vacío en el primer render** y se dibuja al hacer scroll (ResponsiveContainer con altura 0 inicial). Conviene fijar altura explícita al contenedor.
- KPI "Clientes activos · 9 registrados" y en Analítica "Clientes totales · 6": dos pantallas, dos números para "cuántos clientes tengo", sin explicar la diferencia (uno cuenta registrados, el otro con visitas en el rango).
- "Premios pendientes" muestra el subtítulo en gris casi invisible (contraste).
- Todo el Dashboard es de "hoy / esta semana", sin comparación con el período anterior (▲ 12 % vs. semana pasada). Es la mejora de percepción más barata en KPIs.

Propuestas:

- **Comparativa** en cada KPI: valor + delta vs. semana/mes anterior con flecha y color.
- **Bloque "Para hoy"**: N clientes en riesgo (link a Campañas con el segmento preseleccionado), premios que vencen en 7 días, próxima campaña programada, cajeros sin actividad esta semana.
- **Selector de sucursal** en el header del Dashboard cuando el tenant tiene 2+.
- Reemplazar "Transacciones recientes" por un feed con avatar + tipo (sello / canje / registro) + sucursal + cajero, en lugar de "Sello 5 (ciclo 1)".

### 1.3 Mi Pase (`/panel/mi-pase`)

- **Checks de Apple/Google Wallet hardcodeados** (`page.tsx:116-130`): siempre muestran ✓ aunque el tenant no tenga configurado uno de los dos.
- Los valores del preview del pase son fijos ("15", "325", "Regular").
- Es una pantalla de solo lectura; está bien por diseño (el pase lo gestiona Cuik), pero podría mostrar **cuántos clientes tienen el pase instalado por plataforma** (ya existe `wallet-distribution`) y un **historial de solicitudes de cambio** con su estado, que hoy desaparecen al enviarse.
- Muy larga verticalmente: teléfono + tabla + compartir + QR. Tabs "Diseño / Reglas / Compartir" la ordenarían.

### 1.4 Clientes (`/panel/clientes`)

Observado:

- Tier "-" para clientes sin tier, mientras Analítica muestra "Sin tier" y el detalle otra cosa.
- **Sin ordenamiento** por columna (visitas, última visita) ni columna "Última visita", que es el dato que más se usa para decidir a quién contactar.
- **Paginación solo prev/next**, sin "mostrando 1-20 de 9" ni salto de página.
- **Exportar Excel ignora el filtro de segmento** (comentario en `page.tsx:272-277`). Si filtro "En riesgo" y exporto, me baja todo el padrón. Es un cambio de un parámetro.
- **`ClienteDetailModal` es código muerto** (líneas 85-209): la fila navega a `/clientes/[id]`. Son 120 líneas duplicadas del detalle con sus propios mapas de colores.
- Errores silenciosos: `catch {}` en fetch, búsqueda y export. Sin toast, sin reintento.
- El chip de segmento activo y el header "9 clientes registrados" no cambian: al filtrar "Nuevos" debería decir "3 de 9".

Propuestas:

- Tabla con **ordenamiento**, columna **Última visita** (relativa: "hace 3 días") y **acciones rápidas** por fila: registrar visita manual, enviar mensaje, ver pase.
- **Acciones masivas**: seleccionar filas → crear campaña con esos clientes (reutiliza la pestaña "Lista" del segment-picker, ya soporta `clientIds`), asignar tag, exportar selección.
- **Filtros combinables** en un popover (segmento + tier + tag + rango de registro + con/sin wallet) en lugar de solo chips de segmento. La API de export ya acepta `tier`, `tagIds`, `createdFrom/To`; la lista no.
- **Alta manual de cliente** desde el panel (hoy solo por la página pública de registro o el cajero).

### 1.5 Detalle de cliente (`/panel/clientes/[id]`)

- Tabs Información / Notas / Tags / Comunicaciones, pero **no hay historial de visitas** ni **historial de premios** (canjeados, pendientes, vencidos). Son los dos datos que justifican abrir la ficha.
- El segmento no se muestra en el detalle (solo en la lista). Debería estar junto al tier, con un tooltip que explique el criterio ("3+ visitas, promedio 2,5 días, sin venir hace 145 días").
- Fecha de registro en `es-AR` ("07 de abr de 2026") mientras el resto del panel usa `es-PE`.
- **Acciones faltantes**: registrar visita manual / ajustar sellos (con motivo y auditoría), bloquear/desbloquear, reenviar link del pase, eliminar (GDPR / Ley 29733).
- Con promoción de puntos, el balance aparece en un banner azul separado de los KPIs; unificar.

Propuesta: una **timeline unificada** (visitas, canjes, notas, campañas recibidas, cambios de tier) en orden cronológico como tab principal, y un panel lateral con los KPIs y las acciones.

### 1.6 Cajeros (`/panel/cajeros`)

- Es la pantalla mejor terminada en estados (skeleton, vacío, error con reintentar). El resto del panel debería copiar ese patrón.
- "0 visitas" para todos aunque hubo visitas: la métrica solo cuenta visitas con `registered_by`; si un cajero fue eliminado o la visita entró por otro canal, no se atribuye. Conviene mostrar el período ("visitas este mes") y un total del tenant como referencia.
- Hex `#0e70db` fijo en botones (también en Configuración) en lugar de `bg-primary`; no respeta el color de marca del tenant que sí usa el sidebar.
- Falta un **resumen por cajero**: visitas por día de la semana, hora pico, premios entregados. Sirve para turnos y para detectar mal uso (un cajero que registra 40 sellos a las 23:59).
- Falta **límite por plan** visible ("2 de 3 cajeros disponibles").

### 1.7 Analítica (`/panel/analitica`)

Observado:

- **Retención por cohorte vacía**: lee `analytics.retention_cohorts`, que solo escribe el cron `analytics-retention`. Ese cron no está programado en Dokploy (quedó pendiente al configurar `campaigns-scheduled`). En producción este widget nunca tuvo datos.
- **Eje Y con decimales** en Visitas por día (mismo fix que Dashboard).
- Etiquetas de fecha del eje X: "10 ago." con punto y sin año; al cruzar de año se vuelve ambiguo.
- "Top 10 clientes" muestra 8 filas cuando hay 8 con visitas: título dinámico ("Top clientes").
- Top clientes es **histórico** (decidido en la sesión anterior) pero está bajo un header con rango de fechas; falta la etiqueta "histórico" junto al título.
- **Distribución por plataforma ocupa media pantalla** con una columna vacía al lado (grid de 2 columnas con un solo hijo).
- El donut dibuja un sector al 100 % gris "Sin wallet" sin mensaje de "aún nadie instaló el pase → compartí el link".
- `toYMD` usa `America/Lima` fijo en lugar del timezone del tenant (`page.tsx:30`). Todo lo demás del panel ya respeta el tz.
- `RetentionHeatmap.formatCohortLabel` hace `new Date("YYYY-MM-DD")`, el mismo bug de un día de desfase que ya se corrigió en `VisitsChart`.
- El error de carga solo se muestra si fallan **las tres** llamadas principales; si falla una, el widget queda vacío en silencio.
- Meses de retención fijos en 6; la API acepta 3-12.

Propuestas de gráficas (todo con datos que ya existen):

- **Visitas por día de la semana y hora** (heatmap 7×24). Es la gráfica más útil para un comercio físico (dotación, horarios de promo) y no requiere tablas nuevas: `loyalty.visits.created_at` + tz.
- **Canjes en el tiempo** como serie en el gráfico principal (hoy solo es un total). `visits_daily.rewards_redeemed` ya lo tiene.
- **Embudo de fidelización**: registrados → con pase instalado → 1 visita → 3+ visitas → premio canjeado. Cuenta la historia completa en una barra.
- **Distribución de segmentos** (donut o barras): cuántos Nuevos / Frecuentes / En riesgo / Inactivos hay y cómo se mueve mes a mes. Hoy solo se ve fila por fila en Clientes.
- **Ticket promedio** y monto total cuando la promo registra `amount` (ya se exporta a Excel pero no se muestra en ningún widget).
- **Comparación con período anterior** en los 6 KPIs.
- **Por sucursal**: selector arriba, y una tabla "Sucursal · visitas · clientes únicos · nuevos · canjes".
- Si no hay datos en un período, mostrar un estado vacío explícito con el rango ("Sin visitas entre el 1 y el 30 de agosto") en lugar de ejes vacíos.

### 1.8 Campañas (`/panel/campanas`)

- Es la sección más completa en estados y feedback. Lo que falta es **medición**: `deliveredCount` se trae de la API y nunca se muestra; no hay tasa de entrega ni "visitas en los 7 días posteriores" por campaña (la efectividad existe como badge, pero sin serie ni comparación).
- El mensaje placeholder de "Prevención de abandono" habla de "cafetería" para cualquier tipo de negocio. Personalizar por `businessType` y con el nombre del comercio.
- **Sin duplicar campaña** ni **plantillas** guardadas: cada mes se reescribe el mismo mensaje.
- **Sin previsualización del push** como se vería en el lock screen (iOS/Android) antes de enviar.
- La pestaña "Filtros" muestra el badge como `totalVisits gte 3` (identificadores crudos) en lugar de "Visitas ≥ 3".
- El CSV de destinatarios se arma a mano sin escapar comillas; un cliente con `"` en el nombre rompe el archivo. El resto del panel exporta xlsx desde el servidor: unificar.
- Campañas **recurrentes/automáticas** (ver §3).

### 1.9 Configuración (`/panel/configuracion`)

- **Tipo de negocio aparece vacío** si el valor guardado no coincide exactamente con el slug de la lista (el select usa `veterinaria`, la segmentación usa `Veterinaria`; el match es insensible a mayúsculas, el select no).
- **Listas desalineadas**: `BUSINESS_TYPES` (select) tiene `tienda`, `salon_belleza`, `nail_bar`, `pasteleria`, `autolavado`, `otro`; los umbrales de segmentación tienen `Cafe`, `Peluqueria`, `Spa`, `Panaderia`, `Lavanderia`, `Gym`. Seis tipos elegibles no tienen umbrales propios y seis umbrales nunca se pueden elegir.
- **Eliminar sucursal sin confirmación**, único destructivo del panel sin `AlertDialog`.
- Todo en una sola columna larga; con tabs (Negocio · Sucursales · Wallet · Equipo · Plan) sería más navegable y "Cajeros" podría vivir acá como tab "Equipo".
- Faltan en Configuración: **horario de atención** (para el heatmap y para "cerrado" en el pase), **logo/colores** al menos en lectura, **notificaciones por email al dueño** (resumen semanal, cliente en riesgo), **umbrales de segmentación** en lectura (hoy solo el super-admin los ve; el comercio no sabe por qué alguien es "Frecuente").

---

## 2. Consistencia visual y de código

Lo que más pesa estéticamente no es un componente feo, es que cada pantalla resuelve lo mismo distinto:

| Tema | Variantes encontradas | Propuesta |
|---|---|---|
| Fechas | 9 sitios, locales `es-PE`, `es-AR`, `es-MX`, `en-CA`; con y sin timezone; `America/Lima` fijo en 3 lugares | `lib/format-date.ts` con `formatDate`, `formatDateTime`, `formatRelative`, siempre `es-PE` + tz del tenant |
| Badge de tier | 3 mapas (`tierColors` ×2, `getTierBadgeClass`) con claves en distinta capitalización | `<TierBadge tier />` |
| Badge de segmento | `segmentColors` + `segmentLabels` en Clientes, `SEGMENT_LABELS/COLORS` en lib, `PRESET_OPTIONS` en Campañas | `<SegmentBadge segment />` que consume `SEGMENT_LABELS` |
| Badge de estado | `statusColors` ×2, `STATUS_CONFIG`, `statusConfig`, `STATUS_STYLES` | `<StatusBadge />` |
| Placeholder vacío | `—`, `--`, `-`, `?`, `""`, "Sin tier" | un solo `—` |
| Color primario | `bg-primary` / `#0e70db` / `var(--color-primary)` / `branding.primaryColor` | token `primary` que el layout inyecta desde branding |
| Tablas | shadcn `Table` ×3, `<table>` a mano ×3, listas de divs ×2 | shadcn `Table` + `DataTable` con sort/paginación |
| Loading | `Skeleton` (Cajeros), `Loader2` (resto), spinner CSS a mano (Campañas) | `Skeleton` por pantalla, con la forma del contenido |
| Errores | toast / banner rojo / `<p>` / silencio | toast + banner inline con "Reintentar" |
| Padding de cards | `p-3`, `p-3.5`, `p-4`, `px-4 py-3` | `p-4` |

Extraer `TierBadge`, `SegmentBadge`, `StatusBadge`, `KpiCard` (con delta), `EmptyState`, `PageHeader` y `DataTable` a `apps/web/components/panel/` es el cambio con más impacto visual por hora invertida, y elimina ~400 líneas duplicadas.

---

## 3. Funcionalidades nuevas que faltan

Ordenadas por valor para el comercio / esfuerzo.

1. **Automatizaciones** (L). Reglas "cuando pasa X, enviá Y": cliente pasa a En riesgo → push; cumple 7 días registrado sin visita → push; le falta 1 sello → push; premio vence en 3 días → push. Hoy todo es manual salvo el card de churn. El motor de segmentos y el cron ya existen; falta la tabla de reglas y un cron que las evalúe.
2. **Timeline del cliente** (M). Ver §1.5.
3. **Registro manual de visita / ajuste con auditoría** (M). El dueño hoy no puede corregir un sello mal dado sin tocar la base.
4. **Analítica por sucursal y heatmap horario** (M). Ver §1.7.
5. **Cumpleaños** (M). `rules-engine` ya contempla `birthdayMultiplier` con `clientBirthday: null // Phase 1`. Agregar el campo al registro y una campaña automática de cumpleaños es de las funciones más pedidas en fidelización.
6. **Resumen semanal por email al dueño** (S-M). Visitas, nuevos, canjes, en riesgo, mejor día. Retención del propio producto: el dueño que no entra al panel igual ve valor.
7. **Encuesta / NPS post-visita** (M). Push a las 2 h de la visita con 1-5 estrellas; se guarda en `analytics.events` (tabla que existe y nadie usa).
8. **Referidos** (L). "Traé un amigo, ambos ganan un sello". Requiere código de referido en el pase y regla en el rules-engine.
9. **Historial de solicitudes de cambio de pase** (S). Ver §1.3.
10. **Plantillas y duplicado de campañas** (S).
11. **Exportar cualquier vista filtrada** (S): Clientes respetando filtros, Top clientes, tabla de sucursales.
12. **Paleta y logo del comercio en el panel** (S): el sidebar ya usa `branding.primaryColor`; extenderlo a botones y gráficos para que el panel se sienta del comercio.

---

## 4. Bugs encontrados de paso (no estéticos)

- Retención por cohorte sin datos en prod por cron no programado (ver §0).
- `to_char('Dy')` devuelve días en inglés según `lc_time`.
- `RetentionHeatmap` parsea `YYYY-MM-DD` como UTC (desfase de un día).
- `toYMD` en Analítica con `America/Lima` fijo.
- Select de tipo de negocio vacío por diferencia de mayúsculas; listas de tipos desalineadas.
- Export CSV de destinatarios sin escapar comillas.
- Eliminar sucursal sin confirmación.
- `ClienteDetailModal` y `_selectClient` muertos en Clientes.
- `/api/analytics/route.ts` devuelve `not implemented` (ruta huérfana).
- Campana de notificaciones sin handler.

---

## 5. Plan sugerido

**Fase 1 — una semana, sin cambiar funcionalidad**: bugs de §4, tokens comunes de §2 (formato de fecha, badges, EmptyState, KpiCard), `allowDecimals`, estados de error en Clientes, schedules de Dokploy faltantes (`analytics-daily`, `analytics-retention`). El panel se ve consistente y todo lo que hoy está roto o vacío empieza a mostrar datos.

**Fase 2 — dos semanas**: Dashboard accionable con deltas y "Para hoy"; Clientes con ordenamiento, última visita, filtros combinables y acciones masivas; timeline del cliente; visita manual con auditoría.

**Fase 3 — tres semanas**: analítica por sucursal + heatmap horario + embudo + segmentos; automatizaciones; cumpleaños; resumen semanal por email.

---

## Anexo — super-admin (`/admin`)

No se revisó en detalle. Tiene 9 secciones (branding, configuración, editor, métricas, office, pases, planes, solicitudes, tenants). Comparte varios de los problemas de consistencia (mapas de colores propios, `America/Lima` inline en `admin/metricas/actions.ts`). Se puede hacer una pasada equivalente cuando el panel del comercio esté estabilizado.
