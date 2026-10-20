"use client"

import { Loader2, Plus } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  DataTable,
  Notice,
  PageHeader,
  Panel,
  PanelHeader,
  PanelMessage,
  StatusChip,
  Td,
  Th,
  Tr,
} from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  STAFF_PERMISSION_DESCRIPTIONS,
  STAFF_PERMISSION_LABELS,
  STAFF_PERMISSIONS,
  type StaffPermission,
} from "@/lib/staff-permissions"
import {
  inviteStaff,
  listStaff,
  resendStaffInvite,
  revokeStaff,
  type StaffMember,
  updateStaffPermissions,
} from "./actions"

function fmtDate(value: Date | string) {
  return new Date(value).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function PermissionChecks({
  value,
  onChange,
  idPrefix,
}: {
  value: StaffPermission[]
  onChange: (next: StaffPermission[]) => void
  idPrefix: string
}) {
  return (
    <div className="space-y-2.5">
      {STAFF_PERMISSIONS.map((p) => {
        const id = `${idPrefix}-${p}`
        const checked = value.includes(p)
        return (
          <div key={p} className="flex items-start gap-2.5">
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={(c) =>
                onChange(
                  c === true
                    ? STAFF_PERMISSIONS.filter((x) => x === p || value.includes(x))
                    : value.filter((x) => x !== p),
                )
              }
              className="mt-0.5"
            />
            <Label
              htmlFor={id}
              className="flex flex-col items-start gap-0.5 font-normal cursor-pointer"
            >
              <span className="text-[12.5px] font-medium text-ent-fg">
                {STAFF_PERMISSION_LABELS[p]}
              </span>
              <span className="text-[11.5px] text-ent-fg-3">
                {STAFF_PERMISSION_DESCRIPTIONS[p]}
              </span>
            </Label>
          </div>
        )
      })}
    </div>
  )
}

/** Sistema › Equipo Cuik: people who help with the super-admin, each with their areas. */
export function EquipoClient() {
  const [members, setMembers] = useState<StaffMember[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [perms, setPerms] = useState<StaffPermission[]>(["designs"])
  const [inviting, setInviting] = useState(false)

  const [editing, setEditing] = useState<StaffMember | null>(null)
  const [editPerms, setEditPerms] = useState<StaffPermission[]>([])
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const r = await listStaff().catch(() => null)
    if (!r) setError("Error de conexión")
    else if (!r.success) setError(r.error)
    else setMembers(r.data)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleInvite() {
    setInviting(true)
    try {
      const r = await inviteStaff({ name, email, permissions: perms })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      if (r.data.emailSent) {
        toast.success(
          r.data.reactivated
            ? "Acceso reactivado: le enviamos el correo para configurar su contraseña"
            : "Invitación enviada: recibirá un correo para configurar su contraseña",
        )
      } else {
        toast.warning("Cuenta creada, pero el correo no salió. Usa “Reenviar enlace”.")
      }
      setInviteOpen(false)
      setName("")
      setEmail("")
      setPerms(["designs"])
      load()
    } finally {
      setInviting(false)
    }
  }

  async function handleSavePerms() {
    if (!editing) return
    setSaving(true)
    try {
      const r = await updateStaffPermissions({ userId: editing.id, permissions: editPerms })
      if (!r.success) {
        toast.error(r.error)
        return
      }
      toast.success("Permisos actualizados")
      setEditing(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function handleRevoke(m: StaffMember) {
    if (
      !window.confirm(
        `¿Quitar el acceso de ${m.name}? Se cierran sus sesiones y ya no podrá entrar.`,
      )
    ) {
      return
    }
    setBusyId(m.id)
    try {
      const r = await revokeStaff({ userId: m.id })
      if (!r.success) toast.error(r.error)
      else {
        toast.success(`Acceso de ${m.name} revocado`)
        load()
      }
    } finally {
      setBusyId(null)
    }
  }

  async function handleResend(m: StaffMember) {
    setBusyId(m.id)
    try {
      const r = await resendStaffInvite({ userId: m.id })
      if (!r.success) toast.error(r.error)
      else toast.success(`Enlace enviado a ${m.email}`)
    } finally {
      setBusyId(null)
    }
  }

  const active = members?.filter((m) => !m.revoked) ?? []
  const revoked = members?.filter((m) => m.revoked) ?? []
  const canInvite = name.trim().length > 0 && email.trim().length > 3 && perms.length > 0

  return (
    <div className="space-y-3">
      <PageHeader
        crumbs={[{ label: "Inicio", href: "/admin/tenants" }, { label: "Equipo Cuik" }]}
        title="Equipo Cuik"
        subtitle="Personas que te ayudan en el super-admin, cada una solo con las secciones que le des."
        actions={
          <Button size="sm" className="h-7 text-[12px] gap-1" onClick={() => setInviteOpen(true)}>
            <Plus className="w-3.5 h-3.5" />
            Invitar
          </Button>
        }
      />

      <Notice tone="info">
        Por defecto no ven nada: solo las secciones marcadas. Nunca acceden a Finanzas, Solicitudes,
        Exportar, Reclamaciones, Planes, Configuración ni a los datos personales de los clientes.
        Los diseños que guardan quedan “listos para publicar” y los publicas tú.
      </Notice>

      <Panel>
        <PanelHeader title={`Miembros${members ? ` (${active.length})` : ""}`} />
        {error ? (
          <PanelMessage>
            <span className="text-ent-bad">{error}</span>
            <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={load}>
              Reintentar
            </Button>
          </PanelMessage>
        ) : !members ? (
          <PanelMessage>
            <Loader2 className="w-5 h-5 animate-spin" />
          </PanelMessage>
        ) : active.length === 0 ? (
          <PanelMessage>Todavía no invitaste a nadie.</PanelMessage>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Nombre</Th>
                <Th>Email</Th>
                <Th>Permisos</Th>
                <Th>Alta</Th>
                <Th align="right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {active.map((m) => (
                <Tr key={m.id}>
                  <Td className="font-medium text-ent-fg">{m.name}</Td>
                  <Td className="text-ent-fg-2">{m.email}</Td>
                  <Td className="whitespace-normal text-ent-fg-2">
                    {m.permissions.length > 0
                      ? m.permissions.map((p) => STAFF_PERMISSION_LABELS[p]).join(" · ")
                      : "Sin permisos"}
                  </Td>
                  <Td className="text-ent-fg-2">{fmtDate(m.createdAt)}</Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[11.5px]"
                        onClick={() => {
                          setEditing(m)
                          setEditPerms(m.permissions)
                        }}
                      >
                        Permisos
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[11.5px]"
                        disabled={busyId === m.id}
                        onClick={() => handleResend(m)}
                        title="Correo para configurar o cambiar la contraseña (el enlace vence en 1 hora)"
                      >
                        Reenviar enlace
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[11.5px] text-ent-bad"
                        disabled={busyId === m.id}
                        onClick={() => handleRevoke(m)}
                      >
                        Revocar
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>

      {revoked.length > 0 && (
        <Panel>
          <PanelHeader title={`Acceso revocado (${revoked.length})`} />
          <DataTable>
            <tbody>
              {revoked.map((m) => (
                <Tr key={m.id}>
                  <Td className="text-ent-fg-2">{m.name}</Td>
                  <Td className="text-ent-fg-3">{m.email}</Td>
                  <Td align="right">
                    <StatusChip tone="mute">
                      Sin acceso · invítalo de nuevo para reactivarlo
                    </StatusChip>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </Panel>
      )}

      <Dialog open={inviteOpen} onOpenChange={(o) => !inviting && setInviteOpen(o)}>
        <DialogContent className="ent sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Invitar a Equipo Cuik</DialogTitle>
            <DialogDescription className="text-[12px]">
              Le llega un correo para configurar su contraseña y entrar al super-admin con estas
              secciones.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="staff-name" className="text-[12px]">
                Nombre
              </Label>
              <Input
                id="staff-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Diego"
                maxLength={100}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="staff-email" className="text-[12px]">
                Email
              </Label>
              <Input
                id="staff-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@cuik.org"
                maxLength={254}
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-[12px] font-medium">Permisos</span>
              <PermissionChecks value={perms} onChange={setPerms} idPrefix="invite" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviting}>
              Cancelar
            </Button>
            <Button onClick={handleInvite} disabled={inviting || !canInvite}>
              {inviting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Enviar invitación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && !saving && setEditing(null)}>
        <DialogContent className="ent sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Permisos de {editing?.name}</DialogTitle>
            <DialogDescription className="text-[12px]">
              El cambio rige desde su próxima acción, sin cerrar su sesión.
            </DialogDescription>
          </DialogHeader>
          <PermissionChecks value={editPerms} onChange={setEditPerms} idPrefix="edit" />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSavePerms} disabled={saving || editPerms.length === 0}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
