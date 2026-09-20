# Cambios en archivos protegidos — mejoras del panel super-admin

> **Estado: H, I y J APLICADOS (20 set. 2026).** Migraciones 0019 y 0020 aplicadas en prod el 20 set. (via `docker exec` en el contenedor `cuik-loyalty-backend-*` con `psql -U $POSTGRES_USER -d $POSTGRES_DB`; el sufijo del contenedor cambia al recrearse). Los puntos 5 (checklist), 4 (salud) y 12 (actividad) ya estan en master sin tocar archivos protegidos. Los tres de abajo necesitan esquema de BD o autenticacion (`.claude/PROTECTED.md`), asi que van con diff previo. Las migraciones en prod se aplican a mano (ALTERs idempotentes), como siempre.

Aprobar con "apruebo H", "apruebo I", "apruebo J" (o varias).

---

## H. Solicitudes rechazadas se archivan a los 30 dias (punto 1) — APROBADO Y APLICADO (20 set.)

Hoy `solicitudes` no guarda cuando ni quien la rechazo (solo `notes` con el motivo), asi que no hay forma de contar los 30 dias.

### H1. `packages/db/schema/public.ts`

```diff
 export const solicitudes = pgTable("solicitudes", {
   ...
   status: solicitudStatusEnum("status").default("pending").notNull(),
   tenantId: uuid("tenant_id").references(() => tenants.id),
   notes: text("notes"),
+  // Quien y cuando aprobo/rechazo (auditoria + archivado de rechazadas).
+  reviewedAt: timestamp("reviewed_at"),
+  reviewedBy: text("reviewed_by").references(() => user.id),
   createdAt: timestamp("created_at").defaultNow().notNull(),
 })
```

### H2. `packages/db/migrations/0019_solicitudes_reviewed.sql` (nuevo)

```sql
ALTER TABLE "solicitudes" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp;
ALTER TABLE "solicitudes" ADD COLUMN IF NOT EXISTS "reviewed_by" text REFERENCES "user"("id");
-- Rechazadas/aprobadas historicas: sin fecha de revision se asume la de creacion,
-- para que el archivado de 30 dias arranque desde algo razonable.
UPDATE "solicitudes" SET "reviewed_at" = "created_at" WHERE "status" <> 'pending' AND "reviewed_at" IS NULL;
```

(Mismo SQL para aplicar a mano en prod.)

### H3. Codigo no protegido que acompana (se aplica junto con la aprobacion)

- `app/api/admin/solicitudes/[id]/route.ts`: al aprobar o rechazar, setear `reviewedAt = now()` y `reviewedBy = session.user.id`.
- `app/api/admin/solicitudes/route.ts`: la pestana **Rechazadas** muestra solo las de los ultimos 30 dias (`reviewed_at >= now() - 30 days`); nuevo parametro `archived=1` lista las mas antiguas. Las aprobadas no se archivan.
- `admin/solicitudes/page.tsx`: en Rechazadas, tarjeta con "rechazada hace N dias por <nombre>" y el motivo; enlace **"Ver archivadas (N)"** al pie; boton **Reabrir** (vuelve a `pending`, limpia `reviewedAt`) para no obligar al comercio a llenar el formulario otra vez.

---

## I. Notas internas por tenant (punto 8) — APROBADO Y APLICADO (20 set.)

Bitacora del equipo Cuik (llamadas, acuerdos, incidencias), separada de las notas de clientes y de las solicitudes. Necesita una tabla nueva.

### I1. `packages/db/schema/public.ts`

```diff
+export const tenantNotes = pgTable(
+  "tenant_notes",
+  {
+    id: uuid("id").primaryKey().defaultRandom(),
+    tenantId: uuid("tenant_id")
+      .notNull()
+      .references(() => tenants.id, { onDelete: "cascade" }),
+    authorId: text("author_id").references(() => user.id),
+    content: text("content").notNull(),
+    // Para marcar seguimiento: "llamar el lunes", etc. Opcional.
+    followUpAt: timestamp("follow_up_at"),
+    createdAt: timestamp("created_at").defaultNow().notNull(),
+  },
+  (table) => [index("tenant_notes_tenant_created_idx").on(table.tenantId, table.createdAt)],
+)
```

### I2. `packages/db/migrations/0020_tenant_notes.sql` (nuevo)

```sql
CREATE TABLE IF NOT EXISTS "tenant_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "author_id" text REFERENCES "user"("id"),
  "content" text NOT NULL,
  "follow_up_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "tenant_notes_tenant_created_idx" ON "tenant_notes" ("tenant_id", "created_at");
```

### I3. Codigo no protegido que acompana

- `GET/POST /api/admin/tenants/[id]/notes`, `DELETE /api/admin/tenants/[id]/notes/[noteId]` (solo super_admin; borrar solo la propia nota).
- Pestana **Notas** en el modal del tenant: lista con autor y fecha, textarea para agregar, fecha de seguimiento opcional; las notas con seguimiento vencido se destacan. Contador en la pestana.
- Metricas: bloque "Seguimientos pendientes" (notas con `follow_up_at` <= hoy), opcional.

---

## J. Entrar al panel del comercio como super-admin (punto 7) — APROBADO (solo lectura) Y APLICADO (20 set.)

> Implementado: cookie `sa_view_tenant` (AES-GCM con `ENCRYPTION_KEY`, 1 hora) via `POST/DELETE /api/admin/sa-view`; `requireAuth` adjunta `saViewTenantId` a la sesion solo si el rol es `super_admin`, `requireRole("admin")` y `requireTenantMembership` lo aceptan para lecturas; el **middleware** rechaza con 403 cualquier llamada no-GET a `/api/{tenant}/*` y cualquier Server Action del panel mientras la cookie exista (no toca `/api/admin`, `/api/auth`, `/api/me`). `getTenantForUser` resuelve el tenant visto y devuelve `readOnly: true`; el panel muestra un banner ambar con **Salir**. No hizo falta tocar la regla de `/panel` del middleware: ya admitia `super_admin`. Cada entrada deja una nota interna en el tenant.

Objetivo: ver exactamente lo que ve el admin del tenant cuando reporta un problema, sin pedirle la contrasena ni resetearla.

Propuesta de menor riesgo, **sin impersonar sesiones de Better Auth**: el super-admin ya esta autenticado; lo que falta es que `getTenantForUser` sepa "que tenant mirar". Se agrega una cookie firmada `sa_view_tenant=<tenantId>` (httpOnly, 1 hora, solo se honra si la sesion es `super_admin`) y un banner fijo arriba del panel: "Estas viendo <tenant> como super-admin · Salir".

### J1. `apps/web/lib/tenant-context.ts` (no protegido)

`getTenantForUser(userId)`: si el usuario es `super_admin` y existe la cookie, devolver ese tenant con `role: "admin"` de solo lectura (flag `readOnly: true`). Si no hay cookie, comportamiento actual.

### J2. `apps/web/lib/api-utils.ts` — **protegido** (`requireTenantMembership`)

```diff
 export async function requireTenantMembership(session, tenantId) {
+  // Super-admin viewing a tenant (cookie set by /api/admin/tenants/[id]/view):
+  // read access only. Every mutating route already calls requireRole("admin")
+  // or checks the method, so writes stay blocked below.
+  if (session.user.role === "super_admin") {
+    const viewing = await getSuperAdminViewTenant() // lee y verifica la cookie firmada
+    if (viewing === tenantId) return null
+  }
   ... (logica actual)
 }
```

Y en el mismo archivo, `requireRole("admin")` sigue rechazando `super_admin` para escrituras del tenant salvo que la ruta sea GET. Si preferis un corte mas simple: honrar la cookie **solo** en peticiones `GET` (lectura pura) y devolver 403 en el resto. Es lo que recomiendo.

### J3. `apps/web/middleware.ts` — **protegido**

Permitir que un `super_admin` con la cookie entre a `/panel/*` (hoy redirige a `/admin`). Sin cookie, igual que ahora.

### J4. Codigo no protegido

- `POST /api/admin/tenants/[id]/view` (setea la cookie firmada con `ENCRYPTION_KEY`, registra en consola quien entro a que tenant) y `DELETE` (la borra).
- Boton **"Ver como el comercio"** en el modal del tenant → abre `/panel` en una pestana nueva. Banner en `(dashboard)/layout.tsx` con **Salir**.
- Auditoria: por ahora `console.info`; si aprobas I, tambien una nota automatica "Super-admin entro al panel (fecha)".

Riesgo: bajo si se limita a GET. Sin esta limitacion, el super-admin podria operar como el comercio (crear campanas, etc.), que quizas tambien quieras; decime cual de las dos.
