# Revisión del programa de PUNTOS — cómo funciona hoy y qué falta

Fecha: 10 de setiembre de 2026. Método: lectura completa del código que toca puntos (config, acumulación, canje, wallet, panel, cajero, seed, tests) más una prueba de punta a punta en local: se convirtió el tenant seed `cafe-central` a puntos por SQL (1 pt por sol, mínimo S/ 10, máximo 3 visitas/día, cumpleaños ×2), se cargó un catálogo de 3 ítems y se ejercitaron acumulación, canje, ficha, timeline, registro público, pantalla del cajero y página pública de premios.

**Veredicto corto:** el núcleo (acumular por monto y canjear del catálogo) funciona y está bien protegido contra los errores obvios. Pero hay **seis defectos que hay que arreglar antes de ponerlo en producción con un comercio real**, el primero de los cuales hace que la configuración que carga el super-admin se pierda al crear la promoción.

> **Estado: PENDIENTE (11 set. 2026).** Ninguna corrección aplicada todavía. Francesco va a probar el programa de puntos por su cuenta antes de decidir el orden de los arreglos. Guía de prueba manual en §0; defectos bloqueantes en §2; plan en §5. Las correcciones 3 y 4 tocan rutas de wallet protegidas (`.claude/PROTECTED.md`), así que requieren aprobación explícita antes de editar.

---

## 0. Guía de prueba manual (para validar la revisión antes de arreglar)

Prerrequisito: un tenant con promoción tipo **Puntos** y al menos dos ítems en el catálogo con distinto costo. En local se puede convertir `cafe-central` por SQL (ver §1); en producción, crearlo desde el super-admin.

| Paso | Qué hacer | Qué debería pasar | Qué esperamos ver hoy (defecto) |
|---|---|---|---|
| A | Super-admin → crear promoción de puntos con 2 pts/sol, mínimo S/ 15, máximo 2/día | Al reabrir la promoción, los valores se conservan | Vuelven a 1 / vacío / 1 (defecto 1). Editar y guardar los corrige |
| B | Cajero → Buscar cliente → monto S/ 10 (bajo el mínimo) | Rechazo "compra mínima" | OK |
| C | Cajero → monto S/ 20 → registrar | Suma 20 pts (o 40 con 2 pts/sol), pase actualizado | OK |
| D | Registrar por tercera vez el mismo día con máximo 2 | Rechazo por tope diario | OK |
| E | Cliente con cumpleaños hoy y multiplicador ×2, monto S/ 20 | 40 pts | 20 pts (defecto 2) |
| F | Cajero → Buscar → Canjear un ítem que alcanza | Saldo baja, botón se deshabilita, pase muestra saldo nuevo | Saldo baja pero el pase sigue viejo hasta la próxima visita (defecto 3) |
| G | Abrir el pase de Google tras una visita de puntos | Saldo en puntos | "N de 8 visitas" o "0 de 0" (defecto 4) |
| H | Ficha del cliente → Actividad, tras el canje | Aparece quién entregó el premio | No hay cajero en el canje (defecto 5) |
| I | Doble click rápido en Canjear | Un solo canje | Dos canjes (defecto 6) |
| J | Cajero → Escanear QR de un cliente de puntos | Poder canjear desde ahí | Solo acumula; no permite canjear (§3) |
| K | Analítica → premios canjeados | Canjes de puntos contados aparte | Se mezclan con premios de sellos (§3) |

Anotar en cada fila si el resultado coincide con la columna "hoy"; lo que no coincida es información nueva para la revisión.

---

## 1. Cómo funciona hoy, paso a paso

### 1.1 Configuración (super-admin)

Tenants → Promoción → tipo **Puntos**. Campos: puntos por sol, redondeo (floor/round/ceil), mínimo de compra para sumar, visitas máximas por día, texto del premio. La configuración vive en `promotions.config` con esta forma:

| Campo | Default | Efecto |
|---|---|---|
| `points.pointsPerCurrency` | 1 | puntos por cada sol |
| `points.roundingMethod` | floor | cómo redondear el resultado |
| `points.minimumPurchaseForPoints` | null | debajo de este monto no suma |
| `points.maxVisitsPerDay` | 1 | tope de registros por día |
| `points.pointsExpiration` | never | **no hace nada** (nadie lo lee) |
| `accumulation.pointsMultipliers[]` | [] | multiplicador por día/hora (sin UI para cargarlo) |
| `accumulation.birthdayMultiplier` | 1 | multiplicador en el cumpleaños (**nunca se aplica**, ver §2) |
| `accumulation.bonusPointsOnRegistration` | 0 | **no hace nada**; el bono real sale de la configuración de registro (bono de marketing) |
| `tiers` | Nuevo/Frecuente/VIP | por cantidad de **visitas**, no de puntos (y hoy oculto en la UI) |

**Catálogo de premios**: solo el super-admin lo administra (nombre, descripción, costo en puntos, categoría, activo, orden). Sin stock, sin vigencia, sin límite por cliente, sin campo de imagen en el formulario aunque la base y la página pública lo soportan.

### 1.2 Acumulación (cajero)

El cajero escanea o busca al cliente, escribe el **monto de compra** y registra. El sistema:

1. Rechaza si ya llegó al máximo diario (`MAX_VISITS_REACHED`; con máximo 1 se llama `ALREADY_SCANNED_TODAY`).
2. Rechaza si la sucursal no está permitida.
3. Rechaza sin monto (`AMOUNT_REQUIRED`) o con monto menor al mínimo (`BELOW_MINIMUM_PURCHASE`).
4. Calcula `monto × puntos por sol`, redondea, aplica multiplicador de día/hora si hay, aplica multiplicador de cumpleaños si corresponde.
5. Graba la visita (con `points` y `amount`), una transacción de puntos tipo `earn`, y actualiza saldo, visitas totales y tier del cliente.
6. Dispara la actualización del pase en Apple/Google.

**Probado en local** (1 pt/sol, mínimo 10, máximo 3/día, floor):

| Prueba | Resultado |
|---|---|
| Sin monto | `AMOUNT_REQUIRED` ✔ |
| Monto 5 (< 10) | `BELOW_MINIMUM_PURCHASE` ✔ |
| Monto 45.70 | 45 puntos (floor) ✔ |
| 2.ª y 3.ª del día (30 c/u) | 75 → 105 ✔ |
| 4.ª del día | `MAX_VISITS_REACHED`, saldo intacto ✔ |
| Monto −3 o "20" como texto | 400 con mensaje claro ✔ |
| QR inexistente | `CLIENT_NOT_FOUND` ✔ |
| **Cliente que cumple años hoy, monto 20, multiplicador ×2** | **20 puntos, no 40** ✘ |

### 1.3 Canje (cajero)

Solo desde **Buscar** (no desde Escanear): al abrir un cliente de puntos, el cajero ve saldo, "premios disponibles" y el catálogo con un botón **Canjear** por ítem, habilitado si el saldo alcanza. Al canjear, el sistema, en una sola transacción con el cliente bloqueado:

1. Verifica promoción de puntos activa, ítem existente del tenant y activo, saldo suficiente.
2. Descuenta el saldo, graba una transacción `redeem` negativa con el ítem, y **también** graba una fila en `rewards` como "canjeado".

**Probado en local**:

| Prueba | Resultado |
|---|---|
| Torta (250) con 105 pts | `INSUFFICIENT_POINTS` ✔ |
| Café (100) con 105 pts | OK, saldo 5 ✔ |
| Café otra vez con 5 pts | `INSUFFICIENT_POINTS` ✔ |
| Ítem inactivo | `CATALOG_ITEM_INACTIVE` ✔ |
| Ítem de otro tenant / inexistente | `CATALOG_ITEM_NOT_FOUND` ✔ |
| Canje "de sellos" en tenant de puntos | `NO_PENDING_REWARD` (inofensivo) ✔ |

### 1.4 Lo que ve el cliente y el comercio

- **Página pública `/{slug}/premios`**: catálogo por categoría con costo en puntos, con los colores del comercio. Es un folleto: no muestra el saldo del cliente ni permite canjear.
- **Pase en el celular**: la plantilla del pase usa `{{points.balance}}`; en Apple se refresca al registrar una visita. Ver §2 para los problemas.
- **Ficha del cliente (panel)**: KPIs "Puntos" y "Premios disp.", timeline con `+N pts` por visita y el canje como "Ganó un premio / Canjeó su premio".
- **Registro público**: si el super-admin configuró bono de marketing en puntos, el cliente arranca con saldo. (Probado: registro OK con DNI porque `cafe-central` lo tiene obligatorio; el bono `bonusPointsOnRegistration` de la promoción no aplica, ver §1.1).

---

## 2. Defectos que bloquean producción

| # | Defecto | Dónde | Impacto |
|---|---|---|---|
| 1 | **Crear la promoción de puntos descarta su configuración.** El validador usa una unión (sellos \| puntos) y Zod toma la primera rama que valida: la de sellos, que acepta todo con defaults. Resultado verificado: el config guardado es `{stamps:{...}, accumulation:{birthdayBonus:0,...}}`. Puntos por sol, mínimo y máximo diario quedan en 1 / null / 1 hasta que alguien **edita** la promoción (la edición usa el validador correcto). | `packages/shared/validators/promotion-schema.ts:110`, `promotion-actions.ts:85` | Un comercio nuevo de puntos arranca con reglas distintas a las que cargó el super-admin, sin ningún aviso |
| 2 | **El multiplicador de cumpleaños nunca se aplica.** El despachador no pasa `birthday` al registro de puntos; y el tipo esperado es `Date` mientras la base devuelve texto, así que el arreglo obvio explotaría. | `register-visit.ts:129-136`, `rules-engine.ts:188-192` | Config visible en la promoción que no hace nada |
| 3 | **El canje no actualiza el pase.** Ni la ruta de canje ni la función tocan el ETag ni disparan el push. El cliente canjea 100 puntos y su tarjeta sigue mostrando el saldo viejo hasta la próxima visita. | `api/[tenant]/redeem/route.ts`, `redeem-points.ts` | Confusión y reclamos en el mostrador |
| 4 | **El pase muestra matemática de sellos.** Las rutas de wallet calculan `totalVisits % 8` (el 8 es inventado cuando no hay config de sellos) y Google recibe "3 de 8 visitas / Te faltan 5 para el premio" con etiqueta "Puntos"; tras una visita de puntos, Google recibe "0 de 0 visitas". | `wallet/google/[clientId]/route.ts:89-91`, `wallet/apple/...:156`, `visits/route.ts:74-77`, `packages/wallet/src/google/loyalty-object.ts` | El pase de Google es directamente incorrecto para puntos |
| 5 | **Sin auditoría del canje.** `cashierId` se recibe y se descarta; no queda quién entregó el premio. En sellos tampoco, pero en puntos el premio es dinero. | `redeem-points.ts:20` | Imposible investigar un canje sospechoso |
| 6 | **Doble canje.** No hay confirmación en la UI ni idempotencia: dos clicks rápidos en "Canjear" descuentan dos veces. | `cajero/buscar/page.tsx:335-357` | Pérdida de puntos del cliente |

Además, el **seed no tiene ningún tenant de puntos**: los dos son de sellos. Por eso nadie ejercitó este camino hasta hoy.

---

## 3. Defectos importantes (no bloquean, pero hay que planificarlos)

1. **Los canjes de puntos escriben en `rewards`** como si fueran premios de sellos → inflan "Premios canjeados" y "Tasa de canje" en Analítica y aparecen dos veces en el timeline ("Ganó un premio" y "Canjeó su premio" en el mismo instante).
2. **Cada guardado de la promoción borra** multiplicadores, cumpleaños y expiración (el formulario los resetea a vacío). Como no hay UI para cargarlos, hoy no se nota, pero es una trampa.
3. **`pointsTransactions` es de solo escritura**: nadie la lee. No hay historial de puntos en la ficha, no hay ajuste manual ("+50 por compensación"), no hay vencimiento. La expiración configurable es decorativa.
4. **Escanear no permite canjear**; solo Buscar. Y el escáner rechaza QRs que no empiecen con `cuik:` o `MV_` (prefijo hardcodeado de Mascota Veloz): los QR `CC_…` del seed son "QR no válido".
5. **Vocabulario de sellos en pantallas de puntos**: historial del cajero "Sello 8 (ciclo 1)", timeline "Visita · sello 8 (ciclo 1)", bienvenida "Acumula sellos", variables de campaña de sellos ofrecidas a tenants de puntos.
6. **Analítica sin métricas de puntos**: no hay puntos emitidos, canjeados, saldo total en circulación (pasivo del comercio), ni ticket promedio aunque el monto es obligatorio. El export oculta "Monto" si no hay mínimo configurado.
7. **La lista de Clientes no muestra saldo** ni permite ordenar/filtrar por puntos.
8. **`updateVisitsDaily` no corre para puntos** (está dentro de la rama de sellos), así que el resumen diario en vivo no se actualiza hasta el cron nocturno.
9. **Multiplicadores por hora** usan la hora del servidor, no la del comercio (el tope diario sí usa la del comercio).
10. **Catálogo**: no se puede reactivar un ítem desde la lista (el botón solo desactiva y el toast dice lo mismo en ambos casos); sin campo de imagen; solo super-admin (el comercio no gestiona su propio catálogo).
11. **Tiers por visitas en un programa de puntos**: hoy irrelevante porque el tier está oculto, pero si vuelve debería ser por puntos.
12. **`visitNum` significa dos cosas**: posición en el ciclo (sellos) vs. visita de por vida (puntos); `cycleNumber` siempre 1 en puntos.
13. **Cero tests** de reglas de puntos, registro de puntos, canje, validador de config y catálogo. Por eso el defecto #1 nunca saltó.
14. El label "Puntos por sol (S/)" está fijo; no hay moneda por tenant.

---

## 4. Lo que sí está bien

- La secuencia de validaciones de acumulación es correcta y en el orden lógico; los mensajes de error son claros y distinguibles.
- El canje corre en una transacción con bloqueo de fila (`FOR UPDATE`): dos cajeros no pueden gastar el mismo saldo a la vez.
- Ítems de otro tenant, inactivos o inexistentes se rechazan.
- La pantalla Buscar del cajero para puntos está completa y clara: saldo, premios disponibles, botones deshabilitados cuando no alcanza, monto y registrar.
- La página pública de premios se ve bien y respeta el branding.

---

## 5. Plan sugerido

**Antes de un comercio real (2–3 días):**

1. Arreglar el validador de creación (discriminar por `type` en vez de unión) y agregar test. (#1)
2. Pasar `birthday` al flujo de puntos con conversión de fecha, y test del multiplicador. (#2)
3. Disparar la actualización del pase al canjear, y corregir la matemática del pase para puntos (Google: mostrar saldo, no "N de 8 visitas"). (#3, #4) — toca rutas de wallet **protegidas**: requiere aprobación.
4. Guardar quién canjeó (usar `pointsTransactions.metadata` o una nota, sin migración) y confirmar el canje en la UI con bloqueo de doble click. (#5, #6)
5. Agregar un tenant de puntos al seed con catálogo y transacciones, y tests de reglas/canje.

**Después:** historial de puntos en la ficha y ajuste manual; métricas de puntos y ticket promedio en Analítica; vocabulario de puntos en cajero/timeline/bienvenida; canje desde Escanear y quitar el prefijo `MV_` hardcodeado; catálogo administrable por el comercio; decidir qué hacer con los `rewards` de puntos en las métricas; expiración de puntos si se va a ofrecer.

---

*Detalle de archivos y líneas en el inventario técnico que acompañó esta revisión; el código de referencia está en `apps/web/lib/loyalty/{register-visit,register-points-visit,redeem-points,rules-engine}.ts`, `apps/web/app/api/[tenant]/{visits,redeem,premios}/route.ts`, `apps/web/app/(cajero)/cajero/{buscar,escanear}/page.tsx`, `apps/web/app/(super-admin)/admin/tenants/{promotion-form-dialog,catalog-section,catalog-form-dialog}.tsx` y `packages/wallet/src/google/loyalty-object.ts`.*
