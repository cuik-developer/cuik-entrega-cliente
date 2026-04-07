# Solicitar cambios al pase (Fase 1)

Funcionalidad para que los administradores de un comercio (tenant) puedan
pedir cambios al diseño / reglas de su tarjeta de fidelización, y que el
super-admin (SA) reciba un correo en cuanto se envía la solicitud.

> Estado: **Fase 1 implementada**. La Fase 2 (panel de bandeja de entrada
> en el admin SA y transiciones de estado) aún no está construida — el
> esquema de DB y los enums ya están listos para soportarla.

---

## TL;DR del flujo

1. Admin del comercio entra a `Panel → Mi Pase`.
2. En la sección de detalles del pase ve el botón **"Solicitar cambios"**.
3. Click → se abre un modal con:
   - Select de tipo (`Colores`, `Textos`, `Imágenes / logo`, `Reglas`, `Otro`)
   - Textarea de mensaje (mínimo 10 caracteres, máximo 2000)
4. Click en **Enviar solicitud**:
   - El frontend hace `POST /api/{tenant}/design-change-requests`
   - El endpoint valida sesión + membresía y guarda en
     `public.design_change_requests` con `status='pending'`.
   - **Fire-and-forget**: se envía un correo a `process.env.SA_EMAIL` con
     el template `CambioPaseSolicitado`.
   - Responde 201 con la fila creada.
5. El usuario ve un toast de éxito real (ya no es fake como antes).
6. El SA recibe el correo en su inbox con el detalle del pedido y un link
   al panel `/admin/cambios-de-pase` (Fase 2).

---

## Por qué existe esta funcionalidad

El botón "Solicitar cambios" en `Panel → Mi Pase` existía desde antes,
pero **era 100% fake**: solo mostraba `toast.success(...)` en `onClick`
sin pegarle a ningún backend ni notificar al SA.

Resultado: clientes pensaban haber enviado pedidos que el equipo de Cuik
nunca recibió.

Esta es la corrección mínima — Fase 1 — que cierra el bug:
- ya hay registro persistente en DB
- ya hay notificación por correo al SA
- el toast del frontend ahora refleja el estado real del request

---

## Archivos nuevos / modificados

### Nuevos

| Archivo | Propósito |
|---|---|
| `packages/db/migrations/0015_design_change_requests.sql` | Migración SQL idempotente para tabla y enums |
| `packages/shared/validators/design-change-request-schema.ts` | Validador Zod del body del POST |
| `packages/email/src/templates/cambio-pase-solicitado.tsx` | Template React Email para notificación al SA |
| `apps/web/app/api/[tenant]/design-change-requests/route.ts` | Endpoint POST |
| `docs/SOLICITAR_CAMBIOS.md` | Este documento |

### Modificados

| Archivo | Cambio |
|---|---|
| `packages/db/schema/public.ts` | Añade tabla `designChangeRequests` y enums `designChangeRequestTypeEnum` / `designChangeRequestStatusEnum` |
| `packages/db/migrations/meta/_journal.json` | Entrada para la migración 0015 |
| `packages/shared/validators/index.ts` | Re-exporta el nuevo schema |
| `packages/email/src/index.ts` | Re-exporta el nuevo template |
| `apps/web/app/(dashboard)/panel/mi-pase/components/solicitar-cambios-button.tsx` | Reemplaza el botón fake por un Dialog real con form + fetch |
| `apps/web/app/(dashboard)/panel/mi-pase/page.tsx` | Pasa `tenantSlug` al `SolicitarCambiosButton` |

---

## Esquema de DB

Tabla `public.design_change_requests`:

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `tenant_id` | `uuid` NOT NULL | FK → `tenants(id)` ON DELETE CASCADE |
| `requested_by_user_id` | `text` NOT NULL | FK → `user(id)` (Better Auth) |
| `type` | `design_change_request_type` | enum, default `otro` |
| `message` | `text` NOT NULL | el mensaje del usuario (10-2000 chars) |
| `status` | `design_change_request_status` | enum, default `pending` |
| `resolved_by_user_id` | `text` NULL | FK → `user(id)`; lo setea el SA al cerrar |
| `resolved_at` | `timestamp` NULL | cuándo se cerró |
| `internal_notes` | `text` NULL | notas internas del SA, no visibles al cliente |
| `created_at` | `timestamp` | `now()` |
| `updated_at` | `timestamp` | `now()` |

Enums:

```sql
design_change_request_type   = ('color' | 'texto' | 'imagen' | 'reglas' | 'otro')
design_change_request_status = ('pending' | 'in_progress' | 'done' | 'rejected')
```

Índices:

- `design_change_requests_tenant_id_idx` — para listar pedidos de un tenant
- `design_change_requests_status_idx` — para que el panel SA filtre por estado

---

## API

### `POST /api/{tenant}/design-change-requests`

**Auth:** sesión válida + miembro del tenant (vía `requireTenantMembership`).

**Request body:**

```json
{
  "type": "color" | "texto" | "imagen" | "reglas" | "otro",
  "message": "string (10-2000 chars)"
}
```

**Respuestas:**

| Status | Cuándo |
|---|---|
| `201` | Creado OK; devuelve la fila completa |
| `400` | `Validation failed` (zod flatten en `details`) |
| `401` | Sin sesión |
| `403` | Usuario no es miembro del tenant |
| `404` | Tenant no encontrado / no activo |
| `500` | Error interno |

**Side effects:**

1. Insert en `public.design_change_requests`.
2. `sendEmail` fire-and-forget al SA. Cualquier error de envío se loggea
   pero **no afecta la respuesta HTTP** — el cliente siempre ve éxito si
   el insert pasó.

---

## Notificación por correo

- **Template:** `CambioPaseSolicitado` (`packages/email/src/templates/cambio-pase-solicitado.tsx`)
- **Destinatario:** `process.env.SA_EMAIL` (fallback: `sa@cuik.app`)
- **Subject:** `Solicitud de cambios — {tenantName}`
- **Contenido:** nombre + slug del comercio, nombre/email del solicitante,
  tipo de cambio, mensaje completo (con `whiteSpace: pre-wrap`), ID del
  request, y un botón CTA al panel SA `/admin/cambios-de-pase`.

El correo nunca bloquea la respuesta. Si Resend falla o `SA_EMAIL` no está
configurado, el request queda en DB y el operador puede consultarlo
manualmente.

---

## UX del botón

Antes (fake):

```tsx
<Button onClick={() => toast.success("Tu solicitud fue enviada al equipo de Cuik")}>
  Solicitar cambios
</Button>
```

Ahora:

- Click en el botón → abre `Dialog` modal de Radix.
- Form con `Select` de tipo + `Textarea` de mensaje.
- Validación client-side (mínimo 10 chars) + bloqueo del submit mientras
  el mensaje sea corto.
- Counter `0/2000` debajo de la textarea.
- Mientras está en curso (`submitting`):
  - El botón "Enviar" muestra spinner + label "Enviando…".
  - El modal **no se puede cerrar** (el `onOpenChange` ignora cierres
    durante submit) para evitar dobles envíos.
- Toast de éxito o error según `res.ok`. El error usa el `error` que
  devuelve la API si existe.
- Tras éxito, se resetea el form y se cierra el modal.

---

## Cómo correr la migración

```bash
# desde packages/db
pnpm drizzle-kit migrate
# o, con script del repo
pnpm db:migrate
```

La migración es **idempotente** (`DO $$ BEGIN ... EXCEPTION WHEN
duplicate_object THEN null; END $$;`) — se puede correr sobre una DB
donde los enums o la tabla ya existan sin romperse.

---

## Variables de entorno

| Var | Para qué | Default |
|---|---|---|
| `SA_EMAIL` | Inbox del super-admin que recibe la notificación | `sa@cuik.app` |
| `BETTER_AUTH_URL` | Base URL del panel para construir el link del CTA del email | `https://app.cuik.org` |
| `RESEND_API_KEY` | (heredada) Necesaria para que `sendEmail` funcione | — |

---

## Fase 2 — pendiente (no incluido en este cambio)

Para cuando se quiera cerrar el loop completo:

1. **Inbox SA en `/admin/cambios-de-pase`**
   - Tabla con filtros por `status` y por `tenant`.
   - Click en una fila abre detalle con `internalNotes`, historial, etc.

2. **Transiciones de estado**
   - `pending → in_progress` cuando el SA toma el ticket.
   - `pending|in_progress → done` cuando se aplica el cambio.
   - `pending → rejected` con motivo en `internal_notes`.
   - Endpoint `PATCH /api/admin/design-change-requests/{id}` solo para
     rol `super_admin`.

3. **Email de cierre al cliente**
   - Nuevo template `CambioPaseResuelto` que se dispara al pasar a `done`
     o `rejected`. Va al `contactEmail` del tenant + al solicitante
     original (lookup por `requested_by_user_id`).

4. **Visibilidad para el comercio**
   - Lista de "Mis solicitudes anteriores" en `Panel → Mi Pase` para que
     el cliente vea el estado de sus pedidos sin tener que escribir al
     soporte.

5. **Métricas**
   - Counter de pedidos abiertos en el sidebar del admin SA.
   - Tiempo medio de resolución, breakdown por `type`.

El esquema (`status`, `resolved_*`, `internal_notes`) ya está preparado
para todos estos pasos — Fase 2 es puro frontend + un endpoint PATCH.
