"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  Ban,
  Check,
  Clock,
  Copy,
  KeyRound,
  Loader2,
  Mail,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useTenant } from "@/hooks/use-tenant"
import { authClient, useSession } from "@/lib/auth-client"
import type { CajeroStatsMap } from "./actions"
import { getCajeroStats, resetCajeroPassword, toggleCajeroBan, updateCajeroName } from "./actions"

// ── Types ───────────────────────────────────────────────────────────

interface OrgMember {
  id: string
  userId: string
  role: string
  createdAt: Date
  user: {
    id: string
    name: string
    email: string
    image?: string | null
    banned?: boolean | null
  }
}

interface OrgInvitation {
  id: string
  email: string
  role: string | null
  status: string
  expiresAt: Date
}

// ── Zod schema ──────────────────────────────────────────────────────

const inviteFormSchema = z.object({
  email: z.string().min(1, "El email es requerido").email("Email inválido"),
})

type InviteFormValues = z.infer<typeof inviteFormSchema>

// ── Helpers ─────────────────────────────────────────────────────────

function formatLastAccess(date: Date | null | undefined, tz = "America/Lima"): string {
  if (!date) return "\u2014"
  return new Date(date).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  })
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase()
}

function roleLabel(role: string): string {
  if (role === "owner") return "Propietario"
  return "Cajero"
}

// ── Components ──────────────────────────────────────────────────────

function MemberRow({
  member,
  stats,
  isSelf,
  timezone = "America/Lima",
  onRemove,
  onResetPassword,
  onEdit,
  onToggleBan,
}: {
  member: OrgMember
  stats: CajeroStatsMap[string] | undefined
  isSelf: boolean
  timezone?: string
  onRemove: (member: OrgMember) => void
  onResetPassword: (member: OrgMember) => void
  onEdit: (member: OrgMember) => void
  onToggleBan: (member: OrgMember) => void
}) {
  const isOwner = member.role === "owner"
  const isBanned = member.user.banned === true

  return (
    <div
      className={`group flex items-center gap-4 rounded-lg border bg-white px-4 py-3 transition-colors ${isBanned ? "border-red-200 bg-red-50/30 opacity-60" : "border-slate-200 hover:border-slate-300"}`}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
        style={{ backgroundColor: isOwner ? "#0e70db" : isBanned ? "#94a3b8" : "#64748b" }}
      >
        {getInitial(member.user.name)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`truncate text-sm font-medium ${isBanned ? "text-slate-500 line-through" : "text-slate-900"}`}
          >
            {member.user.name}
          </span>
          {isSelf && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              Vos
            </span>
          )}
        </div>
        <p className="truncate text-xs text-slate-500">{member.user.email}</p>
      </div>

      <div className="hidden items-center gap-6 sm:flex">
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums text-slate-900">
            {stats?.visitCount ?? 0}
          </p>
          <p className="text-[11px] text-slate-400">visitas</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-600">{formatLastAccess(stats?.lastAccess, timezone)}</p>
          <p className="text-[11px] text-slate-400">último acceso</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isBanned ? (
          <Badge variant="outline" className="border-red-200 bg-red-50 text-red-600">
            Inactivo
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className={
              isOwner
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }
          >
            {roleLabel(member.role)}
          </Badge>
        )}

        {!isSelf && !isOwner && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-slate-400 opacity-0 transition-opacity hover:text-slate-600 group-hover:opacity-100"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onEdit(member)} className="gap-2 text-xs">
                <Pencil className="h-3.5 w-3.5" />
                Editar nombre
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onResetPassword(member)} className="gap-2 text-xs">
                <KeyRound className="h-3.5 w-3.5" />
                Resetear contraseña
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleBan(member)} className="gap-2 text-xs">
                {isBanned ? (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-600">Activar</span>
                  </>
                ) : (
                  <>
                    <Ban className="h-3.5 w-3.5 text-amber-600" />
                    <span className="text-amber-600">Desactivar</span>
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onRemove(member)}
                className="gap-2 text-xs text-red-600 focus:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar miembro
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

function InvitationRow({
  invitation,
  onCancel,
  onResend,
  isResending,
}: {
  invitation: OrgInvitation
  onCancel: (invitation: OrgInvitation) => void
  onResend: (invitation: OrgInvitation) => void
  isResending: boolean
}) {
  return (
    <div className="group flex items-center gap-4 rounded-lg border border-dashed border-amber-200 bg-amber-50/50 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm text-amber-600">
        <Mail className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-700">{invitation.email}</p>
        <p className="text-xs text-slate-400">
          Expira{" "}
          {new Date(invitation.expiresAt).toLocaleDateString("es-PE", {
            day: "numeric",
            month: "short",
            timeZone: "America/Lima",
          })}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
          Pendiente
        </Badge>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-slate-400 opacity-0 transition-opacity hover:text-blue-600 group-hover:opacity-100"
          onClick={() => onResend(invitation)}
          disabled={isResending}
          title="Reenviar invitación"
        >
          {isResending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-slate-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
          onClick={() => onCancel(invitation)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {["skeleton-1", "skeleton-2", "skeleton-3"].map((id) => (
        <div
          key={id}
          className="flex items-center gap-4 rounded-lg border border-slate-200 px-4 py-3"
        >
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="hidden h-8 w-16 sm:block" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ onInvite }: { onInvite: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
        <Users className="h-6 w-6 text-slate-400" />
      </div>
      <h3 className="text-sm font-semibold text-slate-700">No tienes cajeros todavía</h3>
      <p className="mt-1 max-w-xs text-sm text-slate-500">
        Invita a tu primer cajero para que pueda registrar visitas y canjear premios.
      </p>
      <Button className="mt-5 gap-2 bg-[#0e70db] text-white hover:bg-[#0c5fb8]" onClick={onInvite}>
        <UserPlus className="h-4 w-4" />
        Invitar cajero
      </Button>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────

export default function CajerosPage() {
  const { tenantId, organizationId, timezone, isLoading: tenantLoading } = useTenant()
  const { data: sessionData } = useSession()

  const [members, setMembers] = useState<OrgMember[]>([])
  const [invitations, setInvitations] = useState<OrgInvitation[]>([])
  const [stats, setStats] = useState<CajeroStatsMap>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [isInviting, setIsInviting] = useState(false)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [tempPassword, setTempPassword] = useState<{ password: string; memberName: string } | null>(
    null,
  )
  const [copiedPassword, setCopiedPassword] = useState(false)
  const [editingMember, setEditingMember] = useState<OrgMember | null>(null)
  const [editName, setEditName] = useState("")
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Confirm dialog state
  const [confirmAction, setConfirmAction] = useState<{
    type: "remove" | "cancel" | "reset-password"
    label: string
    description: string
    onConfirm: () => Promise<void>
  } | null>(null)

  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: { email: "" },
  })

  const fetchData = useCallback(async () => {
    if (!organizationId || !tenantId) return

    setIsLoading(true)
    setError(null)

    try {
      // Fetch members + invitations from Better Auth
      const orgResult = await authClient.organization.getFullOrganization()

      if (orgResult.error) {
        setError(orgResult.error.message || "Error al cargar miembros")
        setIsLoading(false)
        return
      }

      const orgData = orgResult.data
      setMembers((orgData?.members as OrgMember[]) ?? [])
      setInvitations((orgData?.invitations as OrgInvitation[]) ?? [])

      // Fetch visit stats from server action
      const statsResult = await getCajeroStats({ tenantId, organizationId })
      if (statsResult.success) {
        setStats(statsResult.data)
      }
    } catch (err) {
      console.error("[CajerosPage] fetch error:", err)
      setError("Error al cargar datos de cajeros")
    } finally {
      setIsLoading(false)
    }
  }, [organizationId, tenantId])

  useEffect(() => {
    if (!tenantLoading && organizationId && tenantId) {
      fetchData()
    }
  }, [tenantLoading, organizationId, tenantId, fetchData])

  // ── Handlers ────────────────────────────────────────────────────

  async function handleInvite(values: InviteFormValues) {
    setIsInviting(true)
    try {
      const result = await authClient.organization.inviteMember({
        email: values.email,
        role: "member",
      })

      if (result.error) {
        toast.error(result.error.message || "Error al enviar invitación")
        setIsInviting(false)
        return
      }

      toast.success(`Invitación enviada a ${values.email}`)
      form.reset()
      setShowInviteForm(false)
      await fetchData()
    } catch {
      toast.error("Error al enviar invitación")
    } finally {
      setIsInviting(false)
    }
  }

  function handleRemoveMember(member: OrgMember) {
    setConfirmAction({
      type: "remove",
      label: "Eliminar miembro",
      description: `${member.user.name} perderá acceso al sistema. Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          const result = await authClient.organization.removeMember({
            memberIdOrEmail: member.userId,
          })

          if (result.error) {
            toast.error(result.error.message || "Error al eliminar miembro")
            return
          }

          toast.success("Miembro eliminado")
          await fetchData()
        } catch {
          toast.error("Error al eliminar miembro")
        }
      },
    })
  }

  function handleCancelInvitation(invitation: OrgInvitation) {
    setConfirmAction({
      type: "cancel",
      label: "Cancelar invitación",
      description: `Se cancelará la invitación enviada a ${invitation.email}.`,
      onConfirm: async () => {
        try {
          const result = await authClient.organization.cancelInvitation({
            invitationId: invitation.id,
          })

          if (result.error) {
            toast.error(result.error.message || "Error al cancelar invitación")
            return
          }

          toast.success("Invitación cancelada")
          await fetchData()
        } catch {
          toast.error("Error al cancelar invitación")
        }
      },
    })
  }

  async function handleResendInvitation(invitation: OrgInvitation) {
    setResendingId(invitation.id)
    try {
      const result = await authClient.organization.inviteMember({
        email: invitation.email,
        role: "member",
        resend: true,
      })

      if (result.error) {
        toast.error(result.error.message || "Error al reenviar invitación")
        return
      }

      toast.success(`Invitación reenviada a ${invitation.email}`)
      await fetchData()
    } catch {
      toast.error("Error al reenviar invitación")
    } finally {
      setResendingId(null)
    }
  }

  function handleEditMember(member: OrgMember) {
    setEditingMember(member)
    setEditName(member.user.name)
  }

  async function handleSaveEdit() {
    if (!editingMember || !organizationId) return
    setIsSavingEdit(true)
    try {
      const result = await updateCajeroName({
        userId: editingMember.userId,
        organizationId,
        name: editName,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success("Nombre actualizado")
      setEditingMember(null)
      await fetchData()
    } catch {
      toast.error("Error al actualizar nombre")
    } finally {
      setIsSavingEdit(false)
    }
  }

  async function handleToggleBan(member: OrgMember) {
    if (!organizationId) return
    const isBanned = member.user.banned === true
    const _action = isBanned ? "activar" : "desactivar"

    setConfirmAction({
      type: isBanned ? "reset-password" : "remove",
      label: isBanned ? "Activar cajero" : "Desactivar cajero",
      description: isBanned
        ? `${member.user.name} podrá volver a iniciar sesión y registrar visitas.`
        : `${member.user.name} no podrá iniciar sesión ni registrar visitas hasta que lo reactives.`,
      onConfirm: async () => {
        const result = await toggleCajeroBan({
          userId: member.userId,
          organizationId,
          ban: !isBanned,
        })
        if (!result.success) {
          toast.error(result.error)
          return
        }
        toast.success(`Cajero ${isBanned ? "activado" : "desactivado"}`)
        await fetchData()
      },
    })
  }

  function handleResetPassword(member: OrgMember) {
    setConfirmAction({
      type: "reset-password",
      label: "Resetear contraseña",
      description: `Se generará una contraseña temporal para ${member.user.name}. Deberás compartírsela de forma segura.`,
      onConfirm: async () => {
        if (!organizationId) return
        const result = await resetCajeroPassword({
          userId: member.userId,
          organizationId,
        })
        if (!result.success) {
          toast.error(result.error)
          return
        }
        setTempPassword({
          password: result.data.tempPassword,
          memberName: member.user.name,
        })
        setCopiedPassword(false)
      },
    })
  }

  // ── Derived state ───────────────────────────────────────────────

  const currentUserId = sessionData?.user?.id
  const nonOwnerMembers = members.filter((m) => m.role !== "owner")
  const pendingInvitations = invitations.filter((inv) => inv.status === "pending")
  const isEmpty = nonOwnerMembers.length === 0 && pendingInvitations.length === 0
  const ownerMember = members.find((m) => m.role === "owner")
  const loading = tenantLoading || isLoading

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Cajeros</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Gestioná el acceso de tu equipo al sistema.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!loading && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-slate-400 hover:text-slate-600"
              onClick={fetchData}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
          <Button
            className="gap-2 bg-[#0e70db] text-white hover:bg-[#0c5fb8]"
            onClick={() => setShowInviteForm(true)}
            disabled={loading}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Invitar cajero</span>
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && !loading && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
          <Button
            size="sm"
            variant="outline"
            className="ml-3 border-red-200 text-red-700 hover:bg-red-100"
            onClick={fetchData}
          >
            Reintentar
          </Button>
        </div>
      )}

      {/* Invite form */}
      {showInviteForm && (
        <form
          onSubmit={form.handleSubmit(handleInvite)}
          className="rounded-lg border border-blue-200 bg-blue-50/40 p-4"
        >
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-700">Invitar cajero</h2>
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="invite-email" className="text-xs text-slate-600">
                Email del cajero
              </Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="cajero@email.com"
                className="mt-1"
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="mt-1 text-xs text-red-600">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                className="gap-2 bg-[#0e70db] text-white hover:bg-[#0c5fb8]"
                disabled={isInviting}
              >
                {isInviting && <Loader2 className="h-4 w-4 animate-spin" />}
                Enviar
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowInviteForm(false)
                  form.reset()
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* Loading state */}
      {loading && <LoadingSkeleton />}

      {/* Empty state */}
      {!loading && !error && isEmpty && <EmptyState onInvite={() => setShowInviteForm(true)} />}

      {/* Member list */}
      {!loading && !error && !isEmpty && (
        <div className="space-y-2">
          {/* Owner always first */}
          {ownerMember && (
            <MemberRow
              member={ownerMember}
              stats={stats[ownerMember.userId]}
              isSelf={currentUserId === ownerMember.userId}
              timezone={timezone}
              onRemove={handleRemoveMember}
              onResetPassword={handleResetPassword}
              onEdit={handleEditMember}
              onToggleBan={handleToggleBan}
            />
          )}

          {/* Other members */}
          {nonOwnerMembers.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              stats={stats[m.userId]}
              isSelf={currentUserId === m.userId}
              timezone={timezone}
              onRemove={handleRemoveMember}
              onResetPassword={handleResetPassword}
              onEdit={handleEditMember}
              onToggleBan={handleToggleBan}
            />
          ))}

          {/* Pending invitations */}
          {pendingInvitations.length > 0 && (
            <>
              <div className="flex items-center gap-2 pt-3">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Invitaciones pendientes
                </span>
              </div>
              {pendingInvitations.map((inv) => (
                <InvitationRow
                  key={inv.id}
                  invitation={inv}
                  onCancel={handleCancelInvitation}
                  onResend={handleResendInvitation}
                  isResending={resendingId === inv.id}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* Confirm dialog */}
      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction?.label}</AlertDialogTitle>
            <AlertDialogDescription>{confirmAction?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirmAction?.type === "reset-password"
                  ? "bg-[#0e70db] text-white hover:bg-[#0c5fb8]"
                  : "bg-red-600 text-white hover:bg-red-700"
              }
              onClick={async () => {
                await confirmAction?.onConfirm()
                setConfirmAction(null)
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit member dialog */}
      <AlertDialog
        open={editingMember !== null}
        onOpenChange={(open) => {
          if (!open) setEditingMember(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Editar cajero</AlertDialogTitle>
            <AlertDialogDescription>
              Modificá el nombre de {editingMember?.user.name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-name" className="text-xs text-slate-600">
              Nombre
            </Label>
            <Input
              id="edit-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Nombre del cajero"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleSaveEdit()
                }
              }}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#0e70db] text-white hover:bg-[#0c5fb8]"
              onClick={handleSaveEdit}
              disabled={isSavingEdit || editName.trim().length < 2}
            >
              {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Temp password dialog */}
      <AlertDialog
        open={tempPassword !== null}
        onOpenChange={(open) => {
          if (!open) setTempPassword(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Contraseña temporal generada</AlertDialogTitle>
            <AlertDialogDescription>
              Nueva contraseña para <strong>{tempPassword?.memberName}</strong>. Copiala y
              compartila de forma segura. No se puede ver de nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <code className="flex-1 font-mono text-sm font-semibold text-slate-900">
              {tempPassword?.password}
            </code>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={() => {
                if (tempPassword) {
                  navigator.clipboard.writeText(tempPassword.password)
                  setCopiedPassword(true)
                  toast.success("Contraseña copiada")
                }
              }}
            >
              {copiedPassword ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setTempPassword(null)}>Entendido</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
