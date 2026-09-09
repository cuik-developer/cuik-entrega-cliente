# Cuik — Funcionalidades

> Documento de producto. Descripcion de roles, paneles, programa de fidelizacion, wallet, campanas, Cuik Office, exports y flujos end-to-end. Para detalles tecnicos ver `Dev/ARQUITECTURA-TECNICA.md`.

---

## 1. Que es Cuik

Cuik es una plataforma SaaS de **programas de fidelizacion para comercios**. El comercio configura un programa (sellos o puntos) y sus clientes reciben un pase digital (Apple Wallet o Google Wallet) que acumula visitas automaticamente al escanearse un QR.

**Primer cliente**: Mascota Veloz (pet services en Peru). Plataforma disenada para escalar a multiples verticales: cafeterias, restaurantes, peluquerias, veterinarias, gimnasios, spas, panaderias.

**Propuesta de valor al comercio**:
- Reemplazar tarjetas fisicas de sellos con un pase digital que no se pierde
- Automatizar notificaciones (push en wallet) para re-engagement
- Obtener analytics de comportamiento de clientes (segmentacion, retencion, horarios pico)
- Campanas dirigidas a segmentos especificos (en riesgo, inactivos, frecuentes)
- Reportes automaticos generados por IA (Cuik Office)

**Propuesta de valor al cliente final**:
- Pase en el wallet de su telefono, siempre disponible
- Notificaciones en lock screen cuando acumula sellos o gana premios
- Transparencia sobre su progreso y premios pendientes

---

## 2. Roles de usuario

| Rol | Audiencia | Acceso | URL base |
|---|---|---|---|
| **Super Admin** | Equipo Cuik | Toda la plataforma, todos los tenants | `/admin/*` |
| **Admin (owner del comercio)** | Dueno/encargado del comercio | Solo su tenant | `/panel/*` |
| **Cajero** | Personal del comercio | Registro de visitas en su tenant | `/cajero/*` |
| **Cliente final** | Cliente del comercio | Su pase digital, pagina publica del tenant | `/{slug}/bienvenido`, `/{slug}/premios` |

La asignacion a un tenant es via **organizations** de Better Auth: el tenant tiene un `slug`, y la organization con el mismo slug agrupa a los members. El `ownerId` del tenant es un shortcut que siempre pasa el check de membership.

---

## 3. Panel Super Admin

Sidebar izquierdo con navegacion. Rol requerido: `super_admin`.

### 3.1 Solicitudes (`/admin/solicitudes`)

**Proposito**: gestionar leads desde el formulario publico `/contacto`.

- Lista de solicitudes con estado (Pendiente, Aprobada, Rechazada).
- Columnas: nombre comercio, tipo de negocio, contacto, email, telefono, ciudad.
- Filtros por estado.

**Acciones**:
- **Aprobar**: crea automaticamente
  - Tenant con status `trial` y `trialEndsAt = +7 dias`
  - Usuario admin con contrasena temporal
  - Organization vinculada (slug = tenant.slug)
  - Promocion default de sellos (8 sellos)
  - Diseno de pase Apple por defecto
  - **Envia email de bienvenida** con credenciales
  - Modal muestra credenciales con botones "copiar"
- **Rechazar**: requiere motivo (textarea), se guarda en `notes`.

### 3.2 Tenants (`/admin/tenants`)

**Proposito**: gestionar todos los comercios de la plataforma.

- Tabla/grid de todos los tenants con KPIs: clientes activos, visitas, premios pendientes, tasa retorno.
- Busqueda por nombre; filtros por estado (`pending | trial | active | expired | cancelled | paused`).

**Acciones (modal con 6 tabs):**

- **General**: nombre, slug, plan, timezone, fechas trial/activacion, businessType, direccion, telefono, contactEmail.
- **Promociones**: crear/editar la promo activa (stamps o points), vincular diseno de pase. Una sola promo activa por tenant define el tipo de programa.
- **Apple Wallet**: wizard para cargar certificados Apple (passTypeId, teamId, signerCert, signerKey, wwdr). Modo: `configuring` | `demo` | `production`. En modo production, los certificados se encriptan con AES-256-GCM.
- **Segmentacion**: umbrales custom (newClientDays, frequentMaxDays, oneTimeInactiveDays, riskMultiplier). Override del default del businessType.
- **Registro**: que campos mostrar en el formulario publico `/registro` (DNI, email, phone, birthday) y cuales son requeridos.
- **Catalogo** (solo si points): items canjeables con name, pointsCost, imageUrl, category.

**Acciones adicionales**:
- Cambiar plan (modal con lista de planes)
- Activar / reactivar / pausar / cancelar
- Reset de contrasena del admin (genera nueva temporal)
- Ver diseno de pase vinculado (redirije a editor)

### 3.3 Pases (`/admin/pases`)

**Proposito**: gestionar disenos de pases Apple Wallet y Google Wallet.

- Lista de disenos agrupados por tenant.
- Columnas: nombre, tipo (Apple / Google), promocion vinculada, estado activo/inactivo, ultima actualizacion.

**Acciones**:
- **Crear nuevo diseno** → modal (tenant + nombre + tipo) → redirije al editor visual.
- **Editar** → editor visual (`/admin/pases/[designId]/editor`) basado en `@cuik/editor` (Zustand + Konva).
- **Generar diseno con IA** (si `GEMINI_API_KEY`) — genera imagenes de pase a partir de un prompt.
- **Eliminar** con confirmacion.
- **Preview** en phone frame.

### 3.4 Branding (`/admin/branding`)

**Proposito**: configurar branding (colores, logo) global o por tenant.

- Color picker para primary/accent con validacion hex.
- Upload de logo (URL en MinIO).
- Preview en contextos (pase, pagina de registro, emails).
- Sugerencia de paleta con IA a partir del logo.

### 3.5 Planes (`/admin/planes`)

**Proposito**: visualizar planes comerciales.

- Grid de planes con features (maxLocations, maxPromos, maxClients, precio).
- Cantidad de tenants usando cada plan.
- Gestion read-only en UI (cambios via BD / seed).

### 3.6 Metricas (`/admin/metricas`)

**Proposito**: analytics platform-wide para el equipo Cuik.

- **KPI Cards**: total tenants, total clientes, visitas totales ultimos 30d, total planes.
- **Grafico de visitas diarias**: linea con granularidad dia, rango seleccionable.
- **Distribucion de planes**: pie chart de tenants por plan.
- **Top 5 tenants**: ranking por visitas ultimos 30d con clientCount.
- **Selector de rango**: presets 7 / 30 / 90 dias **o Rango personalizado** (date range picker con minDate = primera visita de la plataforma).
- **Boton Exportar Datos**: descarga Excel con una hoja por tenant (ver §10).

### 3.7 Configuracion (`/admin/configuracion`)

Settings globales de la plataforma almacenados en `globalConfig` (key-value jsonb).

### 3.8 Office (`/admin/office`)

> Temporalmente oculto del sidebar. Archivos preservados.

**Proposito**: panel de control de agentes AI de Cuik Office.

- **Aprobaciones pendientes**: ejecuciones con status `pending_approval`.
- **Tareas programadas**: tasks con `cronExpression`, con `nextRun`, `lastRun`.
- **Actividad reciente**: ultimas 10 ejecuciones con su status.

**Acciones**:
- Crear task nueva (titulo, agentes, prompt, cron, recipients, requiresApproval)
- Ejecutar task manualmente
- Ver detalles de ejecucion (agentLogs, output text, attachments)
- Aprobar o rechazar ejecucion (envia email a recipients + tenant.contactEmail)

---

## 4. Panel Admin (comercio)

Sidebar izquierdo. Rol requerido: `admin` o `super_admin`.

### 4.1 Dashboard (`/panel`)

**KPI Cards** (4 columnas):
1. **Visitas hoy** con subtexto "N esta semana"
2. **Clientes activos** (total registrados)
3. **Nuevos hoy** (clientes creados hoy)
4. **Premios pendientes** (rewards con status=pending)

Todos los calculos de "hoy" y "semana" en el **timezone del tenant** (via SQL `AT TIME ZONE`).

**Grafico semanal**: BarChart con visitas por dia, hoy y los 6 dias anteriores en tz del tenant. Siempre 7 barras (dias sin visitas = 0), etiquetas en espanol (Lun…Dom) formateadas en la UI — no con `to_char('Dy')`, que depende del `lc_time` de Postgres y salia en ingles. Eje Y solo enteros.

**Transacciones recientes**: tabla con las ultimas 10 visitas.
- Cada fila: fecha relativa ("Hoy", "Ayer", "Mie 15 abr") + hora + cliente + sello # ciclo.
- Fecha se calcula en tz del tenant.

### 4.2 Clientes (`/panel/clientes`)

**Tabla paginada** (20 por pagina) con columnas: Cliente (nombre + badge tier), Segmento, Tier, Visitas, Estado, Acciones.

**Busqueda**: campo con debounce, busca en name, lastName, dni, phone, email.

**Filtro por segmento** (chips): Todos / Nuevos / Frecuentes / Esporadicos / Regulares / En riesgo / Inactivos / Una visita.

> Nota: el filtro actua sobre el **segmento** (computado dinamicamente desde comportamiento), no sobre el campo `status` administrativo.

**Modal de detalle del cliente**:
- Avatar + nombre + telefono + email + DNI + fecha registro
- Total visitas, ciclo actual (stamps) o puntos balance (points)
- Barra de progreso de sellos
- Segmento y tier
- Listado de rewards pendientes con boton "Canjear"
- Catalogo de items canjeables (solo points)
- QR code del cliente para escanear manualmente
- Tags asignadas (CRM)
- Notas (CRM) con editor inline

**Boton Exportar Excel**: descarga todos los clientes del tenant (ver §10).

### 4.3 Analitica (`/panel/analitica`)

**KPI Cards** (6): totalVisits, uniqueClients, newClients, rewardsRedeemed, redemptionRate, avgVisitsPerClient.

**Grafico de visitas**: BarChart con periodo seleccionable (Dia / Semana / Mes).
- Eje X: fechas bucketeadas en tz del tenant. Eje Y solo enteros.
- 3 series: Total visitas, Clientes unicos, Clientes nuevos.

**Visitas por dia y hora** (heatmap 7×24): en que momentos de la semana llegan los clientes. Filas Lun–Dom (ISO), columnas de 8am a 8pm en tz del tenant con etiquetas 9am · 11am · 1pm · 3pm · 5pm · 7pm, intensidad = cantidad de visitas. Debajo, "Pico: dia 4pm (N visitas) · Dia mas fuerte" y, si las hubo, "N visitas fuera de 8am–8pm" (la API devuelve las 24 h; la grilla solo muestra el horario comercial). Respeta rango y sucursal. Endpoint `GET /api/{tenant}/analytics/heatmap?from&to[&locationId]`.

**Embudo de fidelizacion** (historico, todo el comercio): Registrados → Visitaron 1+ vez → Visitaron 3+ veces → Canjearon un premio. El pase instalado no es un paso (no es prerequisito para visitar y ya tiene su propio widget). Cada barra muestra cantidad, % sobre registrados y % sobre el paso anterior (oculto si el paso anterior es 0). Excluye bloqueados. No se filtra por rango ni sucursal a proposito: un cliente se registra una vez y se vuelve fiel a lo largo de meses. Endpoint `GET /api/{tenant}/analytics/funnel`.

**Distribucion por segmento** (hoy, todo el comercio): donut con Nuevo / Frecuente / Esporadico / Regular / En riesgo / Una visita / Inactivo, calculado con `computeClientSegment` y los umbrales del tenant, es decir los mismos numeros que los chips de Clientes. Cada fila de la leyenda linkea a `/panel/clientes?segment=<key>` (la lista lee ese parametro al cargar). Endpoint `GET /api/{tenant}/analytics/segments`.

**Filtro por sucursal**: select "Todas las sucursales / <sucursal>" en el header, visible solo si el tenant tiene 2+ sucursales activas (`GET /api/{tenant}/locations`). Aplica a los widgets basados en visitas: KPIs de visitas / clientes unicos / promedio, grafico de visitas, heatmap y export. Clientes nuevos, premios, embudo, segmentos, wallets, retencion y top clientes son de todo el comercio (un cliente no pertenece a una sucursal). El parametro `locationId` (uuid) lo aceptan `visits`, `summary`, `heatmap` y `export-visits`; invalido → 400.

**Mapa de calor de retencion**: 6 meses de cohort analysis.
- Filas: mes de cohorte = mes de **registro** del cliente (`clients.created_at`, no primera visita), en tz del tenant.
- Columnas: month offset (0 = mes del cohorte, 1 = mes siguiente, etc).
- Celdas: % de la cohorte con **al menos una visita** en ese mes (no acumulado: un cliente visto en M1 y M3 pero no en M2 suma en M1 y M3). Tooltip con la cantidad de clientes. Excluye bloqueados.
- No se calcula en vivo: la escribe el cron `POST /api/cron/analytics-retention` (header `x-cron-secret`) en `analytics.retention_cohorts` recorriendo todos los tenants activos/trial y recalculando todas las cohortes historicas (`lib/analytics/calculate-retention.ts`, 2 queries por tenant). Sin ese schedule el widget muestra "Sin datos de retencion disponibles". Basta una corrida diaria.
- Todos los limites de mes se evaluan en el timezone del tenant: una visita del 31 de mayo 23:30 en Lima pertenece a mayo. La API devuelve `cohortMonth` como texto `YYYY-MM-DD` y el widget arma la etiqueta por componentes (evita el desfase de un dia al parsear en el navegador).

**Top clientes**: tabla de clientes mas activos (lifetime count, no scope a rango), columnas `#`, Nombre, Visitas, Tier.

**Distribucion de wallets**: donut chart con Apple / Google / Sin wallet. Logica: prioridad Apple > Google, sin double-count.

**Selector de rango**:
- Presets: 7 / 30 / 90 dias
- **Rango personalizado**: date range picker con `minDate` dinamico (primera visita del tenant), max 365 dias de span.

**Boton Exportar Visitas**: descarga Excel con una fila por visita del rango seleccionado (ver §10).

### 4.4 Campanas (`/panel/campanas`)

**Card "Prevencion de churn"**: campania pre-configurada para clientes `en_riesgo` con mensaje editable.

**Lista de campanas**: tabla con nombre, tipo, segmento objetivo, estado (`draft | scheduled | sending | sent | cancelled`), fecha envio, stats (target, sent, delivered).

**Crear campana** (modal):
- Nombre
- Tipo: **push** (notificacion visible en lock screen del wallet con `changeMessage`) o **wallet_update** (refresh silencioso del pase).
- Mensaje con placeholders soportados:
  - `{{client.name}}`, `{{client.lastName}}`, `{{client.tier}}`
  - `{{stamps.current}}`, `{{stamps.max}}`, `{{stamps.remaining}}`
  - `{{points.balance}}`
  - `{{rewards.pending}}`
  - `{{tenant.name}}`
- Boton "Insertar variable" con dropdown.
- **Destinatarios**: tres pestanas mutuamente excluyentes (una campana tiene una sola audiencia):
  - **Segmento** — select con los presets: Todos / Activos / Inactivos / VIP / Nuevos / Frecuentes / Esporadicos / Una visita / En riesgo. La descripcion del preset elegido se muestra debajo. "Nuevos" usa el mismo criterio que el segmento **nuevo** de Clientes (registrado hace ≤ `newClientDays`).
  - **Filtros** — rango de visitas (min/max) y de ultima visita (despues de / antes de). Un campo vacio no filtra.
  - **Lista (Excel)** — carga masiva de destinatarios (ver abajo).
- Checkbox "Programar envio" → datetime picker.

**Lista (Excel)** — carga masiva de destinatarios:
- Link **"Descargar plantilla"** junto al selector de archivo: baja un `.xlsx` vacio con los encabezados correctos, la columna DNI ya en formato texto (conserva ceros iniciales) y una hoja "Instrucciones" con los formatos aceptados. Sin filas de ejemplo a proposito: un DNI o telefono de ejemplo podria coincidir con un cliente real.
- El operador sube un `.xlsx` (max. 5 MB, 20.000 filas) con columnas `DNI` y/o `Telefono`. El encabezado es opcional: si no se reconoce ninguno, se asume columna A = DNI y B = telefono.
- Cada fila se cruza contra los clientes **del tenant** (nunca de otro comercio):
  - **DNI**: se ignoran espacios y puntuacion (`12.345.678` = `12345678`); se conservan ceros a la izquierda. Formatear la columna como texto en Excel para no perderlos.
  - **Telefono**: se comparan los ultimos 9 digitos, asi `+51 987 654 321`, `51987654321` y `987654321` son el mismo numero. Si la fila trae DNI y telefono, primero se intenta el DNI.
- Resultado inmediato en el modal: **"N encontrados · M rechazados · de T filas"**. Cada rechazo tiene motivo: no existe cliente con ese DNI/telefono, cliente bloqueado, repetido en el archivo (se cuenta una sola vez), o fila sin identificador. Las filas totalmente vacias se ignoran sin contar.
- Boton **"Descargar rechazados"** → `.xlsx` con fila, DNI, telefono y motivo, para corregir y volver a subir. Re-subir un archivo reemplaza la lista.
- La lista es un **snapshot**: los clientes se resuelven al subir, no al enviar. Quien se registre despues con un DNI de la lista no entra.
- No se puede crear la campana con lista vacia (el formulario muestra "Sube un archivo con al menos un destinatario valido"); una lista vacia enviaria a todos.
- En el detalle e historial la campana aparece con segmento `lista`.

**Ejecucion**:
- Envio inmediato o cron job `campaigns-scheduled` cada 5 min.
- Apple: APNs push en batches de 50 tokens.
- Google: update de `loyaltyObject` en batches.
- Cada envio inserta row en `notifications` con status (sent / delivered / failed).

**Detalles de campana**: modal con preview del mensaje rendereado, metrics (enviadas, entregadas, fallos), link para pausar o cancelar.

### 4.5 Cajeros (`/panel/cajeros`)

**Lista de miembros** de la organization (owner + cajeros):
- Columnas: nombre, email, rol, ultimo acceso, estado (activo/baneado), visitas escaneadas.

**Acciones del owner**:
- **Invitar cajero** (modal con email) → crea `invitation` + envia email con link `/accept-invitation/[id]`.
- **Editar nombre** inline.
- **Reset de contrasena** (genera temporal).
- **Banear / desbanear** (Better Auth admin plugin).
- **Eliminar miembro**.

### 4.6 Mi Pase (`/panel/mi-pase`)

- **Preview del pase** en phone frame (Apple y Google side-by-side).
- Estado: Activo / Inactivo.
- Informacion del programa: tipo (Sellos / Puntos), sellos requeridos o rewardValue, wallets soportados.
- **Campos del reverso**: visibles en back del pase.
- **Compartir pase**: genera link publico para difundir (ej. en redes).
- **Solicitar cambios**: textarea → crea `designChangeRequest` con type (color/texto/imagen/reglas/otro). Super admin lo ve en su panel.

### 4.7 Configuracion (`/panel/configuracion`)

Formulario con:
- Datos del comercio: nombre, tipo de negocio (dropdown), direccion, telefono, email contacto.
- **Timezone** (dropdown IANA) — afecta todos los calculos de fecha.
- **Locations (sucursales)**: agregar, editar, eliminar. Cada location con name, address, lat, lng.
- **Configuracion de wallet locations** (geofencing): hasta 10 ubicaciones con lat/lng + `relevantText` para que el pase aparezca en la lock screen al acercarse.
- **Registration config**: checkboxes para campos requeridos/opcionales en el formulario publico.

---

## 5. Panel Cajero

Rol: `user`. Layout: header con logo + nombre + hora, bottom nav con 3 items.

### 5.1 Escanear (`/cajero/escanear`)

**Flujo**:
1. Cajero selecciona sucursal (combobox searchable, obligatorio si >1 location).
2. Apunta la camara al QR del pase del cliente (o ingresa codigo manualmente).
3. QR se valida (formato `cuik:...` o `MV_...`).
4. Si promo es `points` o `stamps con minimumPurchase` → pide **monto de compra**.
5. Submit → `POST /api/{tenant}/visits`.
6. Resultado:
   - **OK (stamps)**: "Sello registrado. X de Y en ciclo actual." Si ciclo completo → pantalla "Premio disponible" con boton "Confirmar canje".
   - **OK (points)**: "N puntos ganados. Balance: M." Si hay bonificacion (double day / birthday) → badge visible.
   - **ALREADY_SCANNED_TODAY**: "Ya fue escaneado hoy" con balance actual.
   - **BELOW_MINIMUM_PURCHASE**: "Monto minimo requerido: $X."
   - **CLIENT_NOT_FOUND** / **NO_ACTIVE_PROMOTION** / **LOCATION_NOT_ALLOWED**: errores claros.

El pase del cliente se **actualiza automaticamente** (fire-and-forget): sellos/puntos visibles en la lock screen tras segundos.

### 5.2 Buscar (`/cajero/buscar`)

**Proposito**: para cuando el cliente no trae el telefono o el QR no se lee.

- Campo de busqueda por nombre, DNI o telefono.
- Resultado: card con datos del cliente, sellos/puntos, rewards pendientes.
- Boton **Registrar visita** (mismo flujo que escanear, sin QR scan).
- Si `points`: ver catalogo de items y canjear.

### 5.3 Historial (`/cajero/historial`)

**Proposito**: auditoria de actividad del cajero.

- Lista paginada (20/pagina) de visitas registradas **por este cajero** (registeredBy = user.id).
- Columnas: fecha + hora, cliente, sello #, ciclo, source (QR / manual / bonus).

---

## 6. Paginas publicas (cliente final)

### 6.1 Registro (`/{slug}/registro`)

**UI**: formulario con branding del tenant (colores + logo + nombre).

**Campos** (configurables por tenant via `registrationConfig`):
- Nombre (siempre requerido)
- Apellido (opcional)
- DNI (requerido / opcional)
- Telefono (requerido / opcional)
- Email (requerido / opcional)
- Fecha de nacimiento (para birthday bonus)
- Campos custom adicionales

**Submit**:
- Crea `clients` row
- Genera `passInstances` con `serialNumber` unico
- Si Apple configurado: genera `applePassUrl` con token HMAC
- Si Google configurado: `ensureLoyaltyClass` + `upsertLoyaltyObject` + `buildSaveToWalletUrl`
- Redirije a `/{slug}/bienvenido?token=...`

### 6.2 Bienvenido (`/{slug}/bienvenido`)

**UI**:
- Bienvenida personalizada con nombre del cliente
- QR code del cliente (para escanear en siguientes visitas)
- **Botones**:
  - "Agregar a Apple Wallet" → descarga `.pkpass` (token-authenticated, no requiere login)
  - "Agregar a Google Pay" → redirije a `https://pay.google.com/gp/v/save/{jwt}`
- Info del programa: tipo, sellos/puntos requeridos, premio
- Link para compartir el pase

Token de acceso: HMAC-SHA256 validado en server — si expira se muestra "Link expirado".

### 6.3 Premios (`/{slug}/premios`)

> Solo disponible si el programa es `points`.

- Catalogo de items canjeables con imagen, descripcion, costo en puntos.
- Puntos disponibles del cliente visibles en header.
- Filtrado por categoria.

---

## 7. Programa de fidelizacion

### 7.1 Programa de sellos (stamps)

Configuracion en `promotions.config`:
- `stamps.maxVisitsPerDay` (default 1)
- `accumulation.minimumPurchaseAmount` (opcional)
- `accumulation.restrictToLocations` + `allowedLocationIds`
- `accumulation.doubleStampsDays`: array de `{ dayOfWeek, hourStart, hourEnd }` → x2 sellos
- `accumulation.birthdayBonus`: multiplier en el cumpleanos del cliente
- `stamps.rewardExpirationDays`: dias hasta que expire un premio pendiente

**Ciclo**:
- `promotions.maxVisits` define el tamano del ciclo (ej: 8 sellos).
- Cliente acumula hasta llegar a `maxVisits` → se crea un `reward` con `status=pending`.
- Al canjear, el reward pasa a `redeemed`; el ciclo continua con el sobrante.
- `clients.currentCycle` se incrementa; `visits.cycleNumber` marca a que ciclo pertenece cada visita.

### 7.2 Programa de puntos (points)

Configuracion:
- `points.pointsPerCurrency` (ej: 1 punto por cada 1 PEN)
- `points.rounding` (floor / round / ceil)
- `points.minimumPurchaseForPoints` (opcional)
- `points.maxVisitsPerDay` (default mayor que stamps)
- `points.dayMultipliers`: `{ dayOfWeek, hourStart, hourEnd, multiplier }` — primer match gana
- `points.birthdayMultiplier`: stack multiplicativo sobre day multiplier

**Flujo**:
- Cada visita genera un `points_transactions` de tipo `earn`.
- `clients.pointsBalance` acumula.
- Canjes: cliente elige item del `rewardCatalog` → `points_transactions` de tipo `redeem` que decrementa balance.
- Expiracion de puntos (futuro): tipo `expire`.

### 7.3 Segmentacion de clientes

Calculada dinamicamente en `apps/web/lib/loyalty/client-segments.ts` (`computeClientSegment`, funcion pura). Los umbrales dependen del `businessType` del tenant, con override via `segmentationConfig`. Se evalua en este orden; gana la primera regla que matchea:

| Segmento | Criterio |
|---|---|
| **nuevo** | Registrado hace ≤ `newClientDays`, sin importar las visitas. Solo por antiguedad: un cliente es nuevo sus primeros dias y nunca mas. |
| **inactivo** | 0 visitas AND creado hace ≥ `oneTimeInactiveDays` |
| **one_time** | Exactamente 1 visita AND ultima visita hace ≥ `oneTimeInactiveDays` |
| **en_riesgo** | ≥3 visitas, `avgDaysBetweenVisits < frequentMaxDays` (era frecuente) pero no visita hace ≥ `avgDaysBetweenVisits × riskMultiplier` |
| **frecuente** | ≥3 visitas AND `avgDaysBetweenVisits < frequentMaxDays` |
| **esporadico** | ≥3 visitas AND `avgDaysBetweenVisits >= frequentMaxDays` |
| **regular** | Ninguna regla anterior aplica (p. ej. 2 visitas; 1 visita reciente pasada la ventana de nuevo). Es el valor por defecto. |

`lastVisitAt` y `avgDaysBetweenVisits` salen de `loyalty.visits` (no de `clients.total_visits`) via `visitStatsSubquery` (`apps/web/lib/loyalty/visit-stats.ts`), un subquery agregado que se hace `LEFT JOIN` a `clients`. **No usar subqueries correlacionados en la lista de columnas del select**: Drizzle quita el prefijo de tabla en selects de una sola tabla y `${clients.id}` se renderiza como `"id"`, que dentro del subquery resuelve a `visits.id`. Ese bug hizo que todo el listado leyera "Nuevo" hasta sep-2026; `visit-stats.test.ts` verifica el SQL generado.

**Defaults por businessType** (en `client-segments.ts`; match case/accent-insensitive; base `DEFAULT_THRESHOLDS` = 7 / 7 / 30 / 3):

| businessType | newClientDays | frequentMaxDays | oneTimeInactiveDays | riskMultiplier |
|---|---|---|---|---|
| Cafeteria / Cafe | 7 | 5 | 15 | 3 |
| Restaurante | 7 | 7 | 21 | 3 |
| Barberia / Peluqueria | 14 | 21 | 45 | 3 |
| Veterinaria | 14 | 30 | 60 | 3 |
| Gym / Gimnasio | 7 | 3 | 14 | 3 |
| Spa | 7 | 14 | 30 | 3 |
| Panaderia | 7 | 4 | 14 | 3 |
| Lavanderia | 7 | 10 | 30 | 3 |

### 7.4 Tiers

Niveles basados en `totalVisits` (historico), configurables en `promotions.config.tiers`:
```json
[
  { "name": "Nuevo", "minVisits": 0, "maxVisits": 2 },
  { "name": "Regular", "minVisits": 3, "maxVisits": 9 },
  { "name": "VIP", "minVisits": 10, "maxVisits": null }
]
```

Se computa en cada visita via `computeTier()` y se persiste en `clients.tier`.

---

## 8. Wallet passes

### 8.1 Como los recibe el cliente

1. Cliente se registra en `/{slug}/registro`.
2. Landing `/{slug}/bienvenido` muestra botones "Agregar a Apple Wallet" y "Agregar a Google Pay".
3. Apple: descarga un `.pkpass` firmado → el telefono detecta el mime type y abre Wallet para agregar.
4. Google: redirije a pay.google.com con un JWT → Google muestra preview y botones "Add to Wallet".

### 8.2 Cuando se actualiza

El pase se actualiza **automaticamente** tras:

| Evento | Que cambia | Notificacion |
|---|---|---|
| Visita registrada | sellos/puntos, barra de progreso | Apple: APNs silent push → refetch; Google: update silencioso |
| Ciclo completo | "Premio disponible" en campo principal | Apple + Google: update silencioso |
| Premio canjeado | Vuelve a "X de Y sellos" | Apple + Google: update silencioso |
| Campana tipo `push` | `campaignMessage` visible en lock screen | Apple: APNs background push; Google: update con `messages` field |
| Campana tipo `wallet_update` | Refresh silencioso del pase | Apple: APNs silent; Google: update silencioso |

### 8.3 Geofencing (locations relevantes)

Configurado en `/panel/configuracion` → "Wallet locations":
- Hasta 10 ubicaciones con `{ lat, lng, name, relevantText }`
- Apple Wallet hace aparecer el pase en la lock screen cuando el cliente esta cerca (default ~100m, no es configurable el radio desde el app actualmente).
- Google Wallet no soporta geofencing de la misma forma — esta feature es solo Apple.

### 8.4 Apple vs Google

| | Apple Wallet | Google Wallet |
|---|---|---|
| Formato | `.pkpass` firmado con PKCS#7 | `loyaltyObject` JSON vivo |
| Update | APNs push → device hace fetch | Server POST/PUT a Google API |
| Confirmacion de instalacion | Si (via Web Service Protocol registration) | No hay callback — se asume |
| Geofencing | Si | No en esta implementacion |
| Mensaje de campania | `changeMessage` en APNs payload + backFields | `messages` field en loyaltyObject |

---

## 9. Cuik Office (agentes AI)

### 9.1 Que es

Sistema de agentes AI basados en Anthropic Agent API que automatizan tareas como:
- Generar reportes de analytics en Excel con narrativa
- Sugerir copys para campanas
- Redactar mensajes de push/email personalizados
- Analizar comportamiento y detectar anomalias

### 9.2 Agentes disponibles

| Agente | Emoji | Dominio | Uso actual |
|---|---|---|---|
| **Luna** | 🛣️ | Marketing (CRO, copywriting, SEO, growth, social, email) | Activo |
| **Data** | 🟠 | Analytics (EDA, cohort analysis, A/B, storytelling) | Activo |
| **Pixel** | 🟢 | Diseno grafico | En desarrollo |
| **Dev** | 🔵 | Frontend | En desarrollo |

### 9.3 Flujo de uso

1. Super Admin entra a `/admin/office/tasks/new`.
2. Crea una task:
   - **Titulo**: "Reporte semanal Mascota Veloz"
   - **Agentes**: ["data"]
   - **Prompt**: "Analiza las visitas ultima semana, detecta anomalias, genera plan de accion"
   - **Cron**: `0 8 * * MON` (lunes 8am) o null para solo manual
   - **Recipients**: `["admin@mascotaveloz.com"]`
   - **Requiere aprobacion**: ✓
3. Al ejecutarse:
   - Se corren 13 queries de analytics en paralelo → `DB_CONTEXT`
   - **Sesion 1** del agente: recibe el contexto, genera analisis en markdown
   - **Sesion 2** del agente: lee el markdown, genera Excel de 9 hojas con openpyxl (fallback ExcelJS)
   - Excel sube a MinIO, genera execution row con status `pending_approval`
4. Super Admin revisa, aprueba o rechaza.
5. Al aprobar: envia email (template `ReporteAprobado`) a recipients + `tenant.contactEmail` con el link de descarga.

### 9.4 Excel generado (9 hojas)

1. **Dashboard Ejecutivo** — KPIs con semaforo (verde/amarillo/rojo)
2. **Patrones Temporales** — visitas por dia de semana, nuevos clientes por semana
3. **Segmentacion Clientes** — piramide de lealtad, clientes inactivos
4. **Retencion** — cohortes mensuales, tiempo promedio entre visitas
5. **Performance por Local** — visitas y trend por sucursal
6. **Digital & Rewards** — wallet adoption, tasa de canje
7. **Crecimiento** — nuevos clientes, top 10, visitas recientes
8. **Plan de Accion** — extraido del analisis del agente
9. **Anomalias** — extraido del analisis del agente

Estilo: azul corporativo `#0E70DB`, Calibri 11pt, semaforo de KPIs, filas alternadas.

### 9.5 Tareas programadas

Tasks con `cronExpression` corren automaticamente via `POST /api/cron/office-tasks` (cada 5 min). Si `requiresApproval=true`, queda pendiente hasta que el super admin apruebe.

---

## 10. Exports de Excel

### 10.1 Super Admin → Metricas → Exportar Datos

**Ruta**: `GET /api/admin/reports/export?from=YYYY-MM-DD&to=YYYY-MM-DD` (rango opcional, en tz Lima).

**Estructura**: un Excel con **una hoja por tenant activo**. Una fila por visita. Clientes con 0 visitas igual aparecen con "Sin visitas".

**Columnas (dinamicas segun programa del tenant)**:
```
Nombre | Email | Telefono | DNI |
  [# Sellos | Ciclo]   ← si promo type = stamps
  [Puntos]             ← si promo type = points
Fecha Registro | Fecha Visita | Local | Plataforma Wallet |
  [Monto]              ← si minimumPurchase configurado
```

- **# Sellos** = `visits.visitNum` (posicion dentro del ciclo, 1..maxVisits)
- **Ciclo** = `visits.cycleNumber`
- **Puntos** = `visits.points` (puntos ganados en esa visita, no balance)
- **Plataforma Wallet** = "Apple Wallet" / "Google Wallet" / "Sin Wallet" (prioridad Apple > Google)
- **Monto** = `visits.amount` (solo si `accumulation.minimumPurchaseAmount > 0` para stamps o `points.minimumPurchaseForPoints > 0` para points)

**Formato visual**: headers con fondo `#0E70DB`, texto blanco bold, auto-filter, fechas en es-MX en timezone Lima.

### 10.2 Admin → Analitica → Exportar Visitas

**Ruta**: `GET /api/{tenant}/analytics/export-visits?from=YYYY-MM-DD&to=YYYY-MM-DD[&locationId=uuid]` (con `locationId`, solo visitas de esa sucursal).

**Estructura**: Excel con **una hoja "Visitas"**, una fila por visita en el rango seleccionado. Mismas columnas que el super admin (dinamicas segun programa). Solo visitas dentro del rango (INNER JOIN, no incluye clientes con 0 visitas).

### 10.3 Admin → Clientes → Exportar Excel

**Ruta**: `GET /api/{tenant}/clients/export`. 

**Estructura**: exporta todos los clientes del tenant (ignora filtro de segmento — es un convenience UX del listado). Columnas incluyen `Segmento` computado.

### 10.4 Cliente individual → Exportar

Desde el modal de detalle del cliente, descarga Excel con historial completo de visitas de ese cliente.

### 10.5 Admin → Campanas → Importar destinatarios / Descargar rechazados

El unico flujo donde Excel **entra** a Cuik. Ver detalle funcional en §4.4.

**Importar**: `POST /api/{tenant}/campaigns/import-recipients` (multipart, campo `file`, `.xlsx`).
- Acepta con o sin encabezado; detecta las columnas `DNI` / `Telefono` por nombre (case-insensitive, sin tildes; tambien `documento`, `celular`, `whatsapp`, `movil`...).
- Limites: 5 MB, 20.000 filas de datos. Extension `.xlsx` + parseo valido son el filtro (el MIME que manda el navegador no se usa).
- Responde `{ matched, rejected, stats, layout }` — no crea nada; los ids matched se guardan recien al crear la campana.

**Plantilla**: `GET /api/{tenant}/campaigns/import-recipients/template` → `plantilla-destinatarios-cuik.xlsx` (hoja "Destinatarios" con solo el encabezado `DNI | Telefono`, columna DNI en formato texto; hoja "Instrucciones"). Subirla vacia devuelve "No se encontraron filas con datos".

**Descargar rechazados**: `POST /api/{tenant}/campaigns/import-recipients/rejected` con las filas rechazadas → `rechazados-YYYY-MM-DD.xlsx`.

| Columna | Contenido |
|---|---|
| Fila | Numero de fila en el archivo original |
| DNI / Telefono | Tal como venian en el archivo |
| Motivo | "No existe un cliente con ese DNI ni telefono" · "Cliente bloqueado" · "Cliente repetido en el archivo" · "Fila sin DNI ni telefono" |

Mismo estilo que los demas exports (encabezado azul `#0E70DB`, auto-filter). Ambos endpoints exigen rol admin y membresia del tenant.

---

## 11. Cron jobs

Todos requieren header `x-cron-secret: ${CRON_SECRET}`. Configuracion en proveedor de hosting (Dokploy / Vercel / Railway).

| Ruta | Frecuencia recomendada | Funcion |
|---|---|---|
| `POST /api/cron/office-tasks` | cada 5 min | Ejecuta tasks de Office con `nextRun <= NOW()` y recalcula `nextRun` con cron-parser (tz America/Lima) |
| `POST /api/cron/analytics-daily` | 1×/dia (3am Lima) | Agrega visitas de ayer en `visits_daily` por tenant × location |
| `POST /api/cron/analytics-retention` | 1×/dia (4am Lima) | Calcula cohortes de retencion (`retention_cohorts`) |
| `POST /api/cron/campaigns-scheduled` | cada 5 min | Ejecuta campaigns programadas con `scheduledAt <= NOW()` y status `scheduled` |

---

## 12. Sistema de emails

Resend + React Email. Configuracion: `RESEND_API_KEY`, `EMAIL_FROM` (dominio verificado).

| Email | Cuando | Template | Destinatario |
|---|---|---|---|
| **Bienvenida al comercio** | Super admin aprueba solicitud | `BienvenidaComercio` | email del solicitante |
| **Reporte de Office aprobado** | Super admin aprueba ejecucion de agente | `ReporteAprobado` | `task.recipients` + `tenant.contactEmail` (deduplicados) |
| **Invitacion a cajero** | Owner invita miembro | Better Auth default | email invitado |
| **Reset de contrasena** | User solicita reset | Better Auth default | email del user |

Dev: variable `EMAIL_TEST_TO` redirige todos los emails a una direccion para testing sin llegar a usuarios reales.

---

## 13. Flujo end-to-end: cliente nuevo

Caso: cafeteria "Cafe Lima" recien onboardeada. Cliente Maria va por primera vez.

1. **Onboarding del comercio** (1 vez)
   - Dueno llena formulario en `/contacto` con datos del negocio.
   - Super admin ve la solicitud en `/admin/solicitudes`, clickea **Aprobar**.
   - Sistema crea tenant (trial 7 dias), organization, usuario admin, promo default de 8 sellos, diseno de pase basico.
   - Dueno recibe email con credenciales → entra a `/login` → ve su `/panel`.
   - Configura: sube logo, elige colores, edita diseno de pase, agrega sucursales, configura promo (sellos para cafe gratis al 8to).
   - Invita a su cajero desde `/panel/cajeros`. Cajero recibe email, acepta, instala app.

2. **Registro de Maria** (1 vez)
   - Maria llega al cafe. El cafe tiene un QR impreso que apunta a `cafe-lima.cuik.org/registro`.
   - Maria escanea, ve formulario con branding de Cafe Lima, ingresa nombre + telefono + email.
   - Submit → landing `/bienvenido` con botones "Agregar a Apple Wallet" y "Agregar a Google Pay".
   - Tap Apple → telefono descarga `.pkpass` → Wallet se abre → Maria confirma → el pase aparece en su Wallet.
   - Apple registra device en background → `apple_devices` row se crea via WSP.

3. **Primera visita** (mismo dia)
   - Maria compra su cafe. En la caja, el cajero abre `/cajero/escanear`, selecciona sucursal "Centro".
   - Maria muestra su pase → cajero escanea el QR.
   - Cajero presiona "Confirmar visita".
   - Server: `register-visit.ts` detecta que es la primera visita, inserta `visits` row (visitNum=1, cycleNumber=1), actualiza `clients.totalVisits=1`.
   - Fire-and-forget: `updateVisitsDaily`, update del pase (APNs silent push).
   - Segundos despues, el pase de Maria se refresca: "1 de 8 sellos".
   - En tenant.timezone, la visita queda en el `visits_daily` bucket correcto.

4. **Octava visita (ciclo completo)** (2 meses despues)
   - Maria viene por su octavo cafe. Cajero escanea, confirma.
   - Server detecta que `newTotalVisits % maxVisits === 0` → `cycleComplete = true`.
   - Inserta `rewards` row con `status=pending`, `expiresAt = now + 30 dias`.
   - Pase de Maria se actualiza a: "Premio disponible! 8 de 8 sellos".
   - Cajero ve en pantalla "Ciclo completo - Maria tiene un premio pendiente".

5. **Canje** (misma visita o despues)
   - Cajero presiona "Confirmar canje" → `POST /api/{tenant}/redeem`.
   - Reward pasa a `status=redeemed`, `redeemedAt = NOW()`.
   - Pase vuelve a "0 de 8 sellos" (comienza ciclo 2).
   - Maria disfruta su cafe gratis.

6. **Maria no vuelve por 3 semanas** (en riesgo)
   - El segmento de Maria se recomputa dinamicamente al listarse: con avg 7 dias entre visitas previas y ahora 21 dias sin visitar, con `riskMultiplier=2.5` → `avgDaysBetweenVisits × riskMultiplier = 17.5 < 21` → segmento `en_riesgo`.
   - Dueno de Cafe Lima va a `/panel/campanas`, clickea la card "Prevencion de churn".
   - Redacta: "Hola {{client.name}}, te extranamos en Cafe Lima. Te esperamos con un cafe gratis esta semana."
   - Segmento objetivo: `en_riesgo`. Tipo: `push`.
   - Envia → APNs push silencioso con `changeMessage` + update de campo visible del pase.
   - Maria ve en su lock screen: "Cafe Lima: Hola Maria, te extranamos..."

7. **Reporte semanal automatico** (cada lunes)
   - Cron `analytics-daily` ya tiene los datos agregados en `visits_daily`.
   - Cron `office-tasks` corre la task "Reporte semanal Cafe Lima" (agente Data):
     - Sesion 1: analiza, detecta que 12% de clientes estan en riesgo vs 8% hace un mes → alerta.
     - Sesion 2: genera Excel de 9 hojas.
     - Execution queda `pending_approval`.
   - Super admin revisa, aprueba → email con Excel al dueno de Cafe Lima.
   - Dueno actua sobre las recomendaciones del "Plan de Accion" y "Anomalias".

---

## 14. Gotchas operacionales

1. **Timezone**: todos los calculos de "hoy" / "semana" usan el timezone del tenant (default `America/Lima`). Un tenant en Mexico City necesita cambiar `tenants.timezone` a `America/Mexico_City` para que "visitas hoy" refleje el dia correcto.

2. **Plataforma wallet**: un cliente puede aparecer como "Apple Wallet" en reportes aunque el cliente nunca haya abierto el pase — el check es que `applePassUrl` existe. Apple si tiene confirmacion real via registro WSP; Google no (no hay callback).

3. **Pases antiguos**: si cambias el `passDesign`, los pases ya emitidos **no se regeneran automaticamente**. Se actualizan los campos dinamicos (sellos, texto) pero no la imagen strip o el layout.

4. **`passkit-generator` PINNED a 3.5.7**: upgrades requieren testear el workaround Symbol hack para `additionalInfoFields`.

5. **MinIO en dev vs prod**: en dev sin MinIO configurado, los assets van a `.local-storage/` en disco. En prod obligatorio configurar MINIO_*.

6. **Invitacion de cajeros**: Better Auth admin plugin requiere el user creador tenga `role='admin'` o plugin admin permissions. Owners de tenant tienen permisos via organization role.

7. **Monto en visitas stamps**: es **opcional** salvo que `minimumPurchaseAmount > 0`. Muchas cafeterias no lo usan.

8. **Premios no se canjean automaticamente**: queda `pending` hasta que el cajero confirme. Si expiran (`expiresAt < NOW()`), se marcan `expired` (pendiente de implementar cron de expiracion).

9. **Points programs**: siempre requieren monto (es cero vs null → reject `AMOUNT_REQUIRED`).

10. **Campaign messages**: los placeholders se resuelven por cliente al enviar. Si un placeholder no existe en el contexto, aparece literalmente (ej `{{client.tier}}` cuando cliente no tiene tier).

---

*Fin de documento de producto. Ver `Dev/ARQUITECTURA-TECNICA.md` para detalle tecnico.*
