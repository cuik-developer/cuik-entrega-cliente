# Cambios en archivos protegidos — programa de puntos

> **Estado: APLICADOS (19 set. 2026).** Francesco aprobo A, B, C, D y E; se aplicaron tal cual y se verificaron en local con una BD de prueba (registro con opt-in: +10 pts con visita `bonus` y transaccion enlazada; visita de S/ 20 en cumpleanos con x2: 40 pts; canje y reintento inmediato: `OK` y luego `DUPLICATE_REDEEM`; `metadata` con `cashierId` y `balanceAfter`; refresco del pase disparado tras el canje). Apple y Google no se pudieron ejercitar en local por falta de certificados: el strip de puntos queda cubierto por `points-strip.test.ts` y se valida en prod al publicar el diseno.
>
> Hallazgo nuevo al probar: `register-visit.ts` tambien elige la promocion activa con `LIMIT 1` sin `ORDER BY`. Con la de sellos por defecto todavia activa junto a la de puntos, una visita puede registrarse como sello. Mitigacion operativa: dejar una sola promocion activa por tenant (desactivar la de sellos). Arreglo de fondo pendiente de aprobacion (archivo protegido).

(Texto original de la propuesta a continuacion.)

Fecha: 19 de setiembre de 2026. Contexto: `Dev/REVISION-PUNTOS.md` (defectos 2, 3, 4, 5) más dos hallazgos de las pruebas de Francesco en su tenant de puntos (bono de registro que no llega y strip que no se ve).

Todo lo que **no** toca archivos protegidos ya está hecho y commiteado (validador de creación, motor de reglas de cumpleaños, confirmación y bloqueo de doble canje en el cajero, refresco del pase tras el canje, catálogo de premios para el admin, helper de strip para puntos). Lo de abajo son los hunks que faltan, uno por archivo de `.claude/PROTECTED.md`. Cada uno es pequeño y se puede aprobar o rechazar por separado.

---

## A. `apps/web/lib/loyalty/register-visit.ts` — pasar el cumpleaños y la zona horaria (defecto 2)

El motor ya sabe comparar el cumpleaños como texto y en hora del comercio (`isBirthdayVisit`, con tests). Solo falta que el despachador le pase los datos que ya tiene en `client` y `tenantTz`.

**Hunk A1** (flujo de puntos, llamada a `registerPointsVisit`):

```diff
       return registerPointsVisit({
         client: {
           id: client.id,
           name: client.name,
           lastName: client.lastName,
           totalVisits: client.totalVisits,
           pointsBalance: client.pointsBalance,
           tier: client.tier ?? null,
+          birthday: client.birthday,
         },
         promotion,
         config: pointsConfig,
         tenantId,
         cashierId,
         locationId: locationId || null,
         amount,
         todayVisitCount: todayVisitCountPts,
+        timezone: tenantTz,
         tx,
       })
```

**Hunk A2** (flujo de sellos, contexto de reglas; hoy dice "no birthday column yet", que ya no es cierto):

```diff
     const rulesContext: RulesEvaluationContext = {
       visitDate: new Date(),
+      visitDateLocal: new Date().toLocaleDateString("en-CA", { timeZone: tenantTz }),
       clientTotalVisits: client.totalVisits,
-      clientBirthday: null, // Phase 1: no birthday column yet
+      clientBirthday: client.birthday ?? null,
       visitAmount: amount ? Number(amount) : null,
       locationId: locationId || null,
       todayVisitCount,
     }
```

Riesgo: nulo si el cliente no tiene cumpleaños (se comporta igual que hoy). Con cumpleaños y multiplicador/bono configurado, empieza a aplicarse.

---

## B. `apps/web/lib/loyalty/redeem-points.ts` — auditoría y bloqueo de doble canje (defectos 5 y 6)

Parche completo en `scratchpad/redeem-points.protected.patch` (65 líneas). Resumen:

```diff
-  const { qrCode, tenantId, catalogItemId } = params
+  const { qrCode, tenantId, catalogItemId, cashierId } = params
...
+    // 4b. Double-click guard: the client row is locked, so this check + insert are atomic.
+    const recent = await tx.select({ id: pointsTransactions.id }).from(pointsTransactions)
+      .where(and(
+        eq(pointsTransactions.clientId, client.id),
+        eq(pointsTransactions.type, "redeem"),
+        eq(pointsTransactions.catalogItemId, catalogItem.id),
+        sql`${pointsTransactions.createdAt} > NOW() - make_interval(secs => 10)`,
+      )).limit(1)
+    if (recent[0]) return { code: "DUPLICATE_REDEEM" as const }
...
     await tx.insert(pointsTransactions).values({
       ...
       description: catalogItem.name,
+      metadata: { cashierId, balanceAfter: newBalance },
     })
```

- `cashierId` ya llega a la función y hoy se descarta. Queda en `points_transactions.metadata` (jsonb existente), sin migración.
- El bloqueo de 10 segundos usa el `FOR UPDATE` que ya existe sobre el cliente, así que dos requests simultáneos no pueden pasar los dos. El cajero ya muestra "Este premio ya se canjeó hace un momento" para ese código (UI y `types.ts` ya commiteados).

Riesgo: un canje legítimo del **mismo ítem por el mismo cliente dentro de 10 segundos** se rechaza. En mostrador no ocurre.

---

## C. `apps/web/app/api/[tenant]/register-client/route.ts` — bono de marketing en puntos (hallazgo de la prueba)

Por qué no llegaron los 10 puntos: la función `applyMarketingBonus` toma **una** promoción activa con `LIMIT 1` sin `ORDER BY`, y decide por su tipo. Si el tenant tiene la promoción de sellos por defecto todavía activa además de la de puntos (la de aprobación de solicitud se crea como sellos y `updatePromotion` no desactiva hermanas), puede tomar la de sellos, ver `stampsBonus = 0` y salir sin hacer nada, sin log. Además el bono de puntos no escribe una visita `bonus`, así que aunque llegue no aparece en el timeline ni en reportes.

**Hunk C1** (elegir la promoción por tipo y hacer visible el bono):

```diff
-  const [promotion] = await db
-    .select({ id: promotions.id, type: promotions.type, maxVisits: promotions.maxVisits })
-    .from(promotions)
-    .where(and(eq(promotions.tenantId, tenantId), eq(promotions.active, true)))
-    .limit(1)
-
-  if (!promotion) return
-
-  if (promotion.type === "stamps" && config.stampsBonus > 0) {
+  const active = await db
+    .select({ id: promotions.id, type: promotions.type, maxVisits: promotions.maxVisits })
+    .from(promotions)
+    .where(and(eq(promotions.tenantId, tenantId), eq(promotions.active, true)))
+    .orderBy(desc(promotions.createdAt))
+  const pointsPromo = active.find((p) => p.type === "points")
+  const stampsPromo = active.find((p) => p.type === "stamps")
+  const promotion = config.pointsBonus > 0 && pointsPromo ? pointsPromo : stampsPromo ?? pointsPromo
+
+  if (!promotion) {
+    console.warn(`[register-client] marketing bonus skipped: no active promotion tenant=${tenantId}`)
+    return
+  }
+
+  if (promotion.type === "stamps" && config.stampsBonus > 0) {
```

```diff
   } else if (promotion.type === "points" && config.pointsBonus > 0) {
-    // Insert points transaction
-    await db.insert(pointsTransactions).values({
+    // A bonus visit row (source 'bonus', points = bonus) so the timeline and reports see it,
+    // plus the points transaction, like a normal points visit does.
+    const [visit] = await db
+      .insert(visits)
+      .values({
+        clientId: client.id,
+        tenantId,
+        visitNum: client.totalVisits + 1,
+        cycleNumber: 1,
+        points: config.pointsBonus,
+        source: "bonus",
+        amount: null,
+        locationId: null,
+      })
+      .returning({ id: visits.id })
+    await db.insert(pointsTransactions).values({
       clientId: client.id,
       tenantId,
       amount: config.pointsBonus,
       type: "earn",
+      visitId: visit?.id ?? null,
       description: "Marketing opt-in bonus",
     })
+  } else {
+    console.warn(
+      `[register-client] marketing bonus skipped: promotion=${promotion.type} stampsBonus=${config.stampsBonus} pointsBonus=${config.pointsBonus}`,
+    )
   }
```

Nota: `visitNum` en puntos no participa del ciclo de sellos; se usa `totalVisits + 1` solo como secuencia. Si preferís no crear la visita `bonus` (solo la transacción), es quitar el bloque de `visits` y queda como hoy pero con el log.

Riesgo: bajo. Cambia qué promoción se elige solo cuando hay más de una activa (situación que hoy da resultados aleatorios).

---

## D. Strip en pases de puntos (hallazgo de la prueba) — 3 rutas Apple

Por qué "el celular no aparece": en las tres rutas que generan el `.pkpass` la condición es `if (stripBgAsset && stampAsset)`. Un diseño de **puntos no tiene sello**, así que el strip que subiste se descarta y se reemplaza por un PNG **transparente** de 750×246. Además el fondo se etiqueta siempre como `data:image/png` aunque sea JPG, y librsvg puede renderizar vacío.

El helper `apps/web/lib/wallet/points-strip.ts` (no protegido, con tests) ya resuelve: puntos → fondo solo, ajustado a 750×246; sellos → como hoy; detecta PNG/JPG por los bytes; transparente solo si no hay fondo. En cada ruta el hunk es reemplazar el bloque `if/else` por una llamada:

**Archivos**: `app/api/[tenant]/wallet/apple/[clientId]/route.ts` (líneas 175-225), `app/api/[tenant]/wallet/apple/[clientId]/[token]/route.ts` (191-241), `app/api/apple-wallet/v1/[...path]/route.ts` (737-787).

```diff
+import { buildStripImages } from "@/lib/wallet/points-strip"
...
-    let stripImage2x: Buffer
-    let stripImage1x: Buffer
-
-    if (stripBgAsset && stampAsset) {
-      const bgDataUri = `data:image/png;base64,${stripBgAsset.toString("base64")}`
-      const stampDataUri = `data:image/png;base64,${stampAsset.toString("base64")}`
-      const stripResult = await generateStripImage({ ... gridLayout ... })
-      stripImage2x = stripResult.strip2x
-      stripImage1x = stripResult.strip1x
-    } else {
-      stripImage2x = await sharp({ create: { width: 750, height: 246, ... } }).png().toBuffer()
-      stripImage1x = await sharp({ create: { width: 375, height: 123, ... } }).png().toBuffer()
-    }
+    const { strip2x: stripImage2x, strip1x: stripImage1x } = await buildStripImages({
+      programType: activePromotionType === "points" ? "points" : "stamps",
+      background: stripBgAsset,
+      stamp: stampAsset,
+      stampsInCycle,
+      maxVisits,
+      gridLayout: stampsConfig ? { ...los mismos 11 campos que hoy... } : undefined,
+    })
```

`activePromotionType` sale de una consulta a `promotions` (tipo de la promoción activa), que dos de las tres rutas ya hacen para otros fines; en `[...path]` hay que agregarla (una `select` de una columna).

Riesgo: para sellos el resultado es idéntico (misma función, mismos parámetros); cambia solo la etiqueta MIME del data URI, que pasa a ser la real. Para puntos, el strip deja de ser transparente.

**Mientras tanto**: subí el strip como **PNG de 750×246 exactos** y **publicá** el diseño (no solo "Guardar": la vista Mi Pase y el `.pkpass` leen `pass_assets`, que solo se actualiza al publicar). Con eso la vista previa del editor y Google lo muestran; el `.pkpass` de Apple seguirá sin strip hasta aplicar este hunk.

---

## E. Saldo de puntos en Google Wallet (defecto 4)

Hoy Google recibe "N de 8 visitas | Te faltan M para el premio" con etiqueta "Puntos". Cambio en 4 lugares:

**E1 `packages/wallet/src/shared/types.ts`** — `WalletUpdateParams` y `UpsertLoyaltyObjectParams`: agregar `pointsBalance?: number`.

**E2 `packages/wallet/src/google/loyalty-object.ts`**:

```diff
-  const balanceText = buildBalanceText(stampsInCycle, maxVisits, hasReward, rewardRedeemed)
-  const statusText = buildStatusText(stampsInCycle, maxVisits, hasReward, rewardRedeemed)
+  const isPoints = promotionType === "points"
+  const balanceText = isPoints
+    ? `${params.pointsBalance ?? 0} puntos`
+    : buildBalanceText(stampsInCycle, maxVisits, hasReward, rewardRedeemed)
+  const statusText = isPoints
+    ? "Sumá puntos en cada compra y canjealos por premios."
+    : buildStatusText(stampsInCycle, maxVisits, hasReward, rewardRedeemed)
```

**E3 `packages/wallet/src/shared/update-after-visit.ts`** (no protegido, se incluye por completitud): pasar `pointsBalance: params.pointsBalance` a `upsertLoyaltyObject`.

**E4 rutas que llaman a Google** — pasar `pointsBalance: client.pointsBalance`: `app/api/[tenant]/wallet/google/[clientId]/route.ts`, `app/api/[tenant]/register-client/route.ts` (bloque `upsertLoyaltyObject`), `app/api/[tenant]/visits/route.ts` (`updateWalletAfterVisit`; el helper extraído `lib/wallet/trigger-wallet-update.ts` ya lo recibe y solo hay que reenviarlo).

Riesgo: nulo para sellos (rama sin cambios). Para puntos el pase de Google pasa a decir el saldo real.

---

## Orden sugerido de aplicación

1. **A + B** (2 archivos, defectos 2, 5, 6): 10 minutos, verificables en local con el seed convertido a puntos.
2. **C** (bono de registro): verificable registrando un cliente de prueba con opt-in.
3. **D** (strip): verificable descargando el `.pkpass` del tenant de puntos y mirándolo en el iPhone.
4. **E** (Google): requiere un Android o el visor de Google Wallet.

Con "aprobado A, B, C, D, E" (o los que quieras) los aplico, corro los tests y te dejo el commit listo para push.
