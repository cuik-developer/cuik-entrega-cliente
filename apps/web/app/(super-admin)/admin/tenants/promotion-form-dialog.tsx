"use client"

import type {
  CreatePromotionInput,
  ExpirationPolicy,
  PointsCalcMode,
} from "@cuik/shared/validators"
import {
  DEFAULT_MILESTONE_MESSAGES,
  describePointsRate,
  expirationPolicySchema,
  pointsForAmount,
} from "@cuik/shared/validators"
import { zodResolver } from "@hookform/resolvers/zod"
import { Plus, Trash2 } from "lucide-react"
import { useTransition } from "react"
import { Controller, useFieldArray, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { Button } from "@/components/ui/button"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

import { createPromotion, updatePromotion } from "./promotion-actions"

// ── Form schema ─────────────────────────────────────────────────────

type MilestoneFormData = {
  maxVisits: number | null
  milestones: { at: number; label: string }[]
  milestoneNext: string
  milestoneReached: string
}

/** Hitos are optional; once there is one, the row and both messages must be complete. */
function validateMilestones(data: MilestoneFormData, ctx: z.RefinementCtx) {
  if (data.milestones.length === 0) return
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path })
  // Either notice can be switched off by leaving it empty, not both.
  const next = data.milestoneNext.trim()
  const reached = data.milestoneReached.trim()
  if (next.length > 200) issue(["milestoneNext"], "Maximo 200 caracteres")
  if (reached.length > 200) issue(["milestoneReached"], "Maximo 200 caracteres")
  else if (next && reached && next.toLowerCase() === reached.toLowerCase())
    issue(["milestoneReached"], "Debe ser distinto al aviso previo (si no, el telefono no avisa)")
  if (!next && !reached) issue(["milestoneReached"], "Deja al menos un aviso, o quita los hitos")
  const seen = new Set<number>()
  data.milestones.forEach((m, i) => {
    const atError = milestoneAtError(m.at, data.maxVisits, seen)
    if (atError) issue(["milestones", i, "at"], atError)
    seen.add(m.at)
    const label = m.label.trim()
    if (!label) issue(["milestones", i, "label"], "Indica el premio")
    else if (label.length > 80) issue(["milestones", i, "label"], "Maximo 80 caracteres")
  })
}

function milestoneAtError(at: number, maxVisits: number | null, seen: Set<number>): string | null {
  if (Number.isNaN(at)) return "Ingresa la visita"
  if (!Number.isInteger(at) || at < 1) return "Minimo 1"
  if (maxVisits && at >= maxVisits) return `Menor que ${maxVisits}`
  if (seen.has(at)) return "Visita repetida"
  return null
}

const formSchema = z
  .object({
    type: z.enum(["stamps", "points"]).default("stamps"),
    // Stamps fields
    maxVisits: z
      .number({ invalid_type_error: "Ingresa un numero valido" })
      .int()
      .min(2, "Minimo 2 visitas")
      .max(50, "Maximo 50 visitas")
      .nullable(),
    rewardValue: z.string().trim().max(200).nullable(),
    active: z.boolean(),
    maxVisitsPerDay: z
      .number({ invalid_type_error: "Ingresa un numero valido" })
      .int()
      .min(1, "Minimo 1")
      .max(10, "Maximo 10"),
    hasExpiration: z.boolean(),
    rewardExpirationDays: z
      .number({ invalid_type_error: "Ingresa un numero valido" })
      .int()
      .min(1, "Minimo 1 dia")
      .nullable(),
    hasMinimumPurchase: z.boolean(),
    minimumPurchaseAmount: z
      .number({ invalid_type_error: "Ingresa un numero valido" })
      .positive("Debe ser mayor a 0")
      .nullable(),
    // Intermediate gifts ("escalera"), stamps only
    // Lenient here (inputs may be unmounted while the values linger); the real
    // checks run in superRefine only for stamps promotions with hitos.
    milestones: z
      .array(z.object({ at: z.number().or(z.nan()), label: z.string() }))
      .max(10, "Maximo 10 hitos"),
    milestoneNext: z.string(),
    milestoneReached: z.string(),
    // Points fields
    calcMode: z.enum(["per_currency", "currency_per_point"]).default("per_currency"),
    pointsPerCurrency: z
      .number({ invalid_type_error: "Ingresa un numero valido" })
      .positive("Debe ser mayor a 0")
      .nullable(),
    solesPerPoint: z
      .number({ invalid_type_error: "Ingresa un numero valido" })
      .positive("Debe ser mayor a 0")
      .nullable(),
    roundingMethod: z.enum(["floor", "round", "ceil"]).default("floor"),
    minimumPurchaseForPoints: z
      .number({ invalid_type_error: "Ingresa un numero valido" })
      .positive("Debe ser mayor a 0")
      .nullable(),
    hasMinimumPurchaseForPoints: z.boolean(),
    birthdayMultiplier: z
      .number({ invalid_type_error: "Ingresa un numero valido" })
      .min(1, "Minimo 1 (sin bono)")
      .max(10, "Maximo 10"),
    // Expiration of points / stamps (shared by both types)
    expMode: z.enum(["never", "rolling", "weekly", "monthly", "interval"]).default("never"),
    expDays: z
      .number({ invalid_type_error: "Ingresa un numero valido" })
      .int()
      .min(1, "Minimo 1 dia")
      .max(730, "Maximo 730 dias")
      .nullable(),
    expWeekday: z.number().int().min(0).max(6),
    expOrdinal: z.enum(["1", "2", "3", "4", "last"]).default("1"),
    expAnchor: z.string().nullable(),
  })
  .superRefine((data, ctx) => {
    if ((data.expMode === "rolling" || data.expMode === "interval") && !data.expDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Indica cada cuantos dias",
        path: ["expDays"],
      })
    }
    if (data.expMode === "interval" && !/^\d{4}-\d{2}-\d{2}$/.test(data.expAnchor ?? "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Indica la fecha de inicio del ciclo",
        path: ["expAnchor"],
      })
    }

    if (data.type === "stamps") {
      if (data.maxVisits === null || data.maxVisits === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Las visitas son obligatorias para sellos",
          path: ["maxVisits"],
        })
      }
      if (!data.rewardValue) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "El premio es obligatorio",
          path: ["rewardValue"],
        })
      }
      validateMilestones(data, ctx)
    }
    if (data.type === "points") {
      if (data.calcMode === "currency_per_point") {
        if (data.solesPerPoint === null || data.solesPerPoint === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Indica cuantos soles hacen 1 punto",
            path: ["solesPerPoint"],
          })
        }
      } else if (data.pointsPerCurrency === null || data.pointsPerCurrency === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Los puntos por sol son obligatorios",
          path: ["pointsPerCurrency"],
        })
      }
    }
  })

type FormValues = z.infer<typeof formSchema>

// ── Types ───────────────────────────────────────────────────────────

type PromotionData = {
  id: string
  type: string
  maxVisits: number | null
  rewardValue: string | null
  active: boolean
  config: unknown
}

type PromotionFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  promotion?: PromotionData | null
}

// ── Helpers ─────────────────────────────────────────────────────────

function extractStampsConfigValues(config: unknown): {
  maxVisitsPerDay: number
  rewardExpirationDays: number | null
  minimumPurchaseAmount: number | null
  milestones: { at: number; label: string }[]
  milestoneNext: string
  milestoneReached: string
} {
  const defaults = {
    maxVisitsPerDay: 1,
    rewardExpirationDays: null as number | null,
    minimumPurchaseAmount: null as number | null,
    milestones: [] as { at: number; label: string }[],
    milestoneNext: DEFAULT_MILESTONE_MESSAGES.next as string,
    milestoneReached: DEFAULT_MILESTONE_MESSAGES.reached as string,
  }

  if (!config || typeof config !== "object") return defaults

  const c = config as Record<string, unknown>
  const stamps = c.stamps as Record<string, unknown> | undefined
  const accumulation = c.accumulation as Record<string, unknown> | undefined

  if (stamps) {
    if (typeof stamps.maxVisitsPerDay === "number") {
      defaults.maxVisitsPerDay = stamps.maxVisitsPerDay
    }
    if (typeof stamps.rewardExpirationDays === "number") {
      defaults.rewardExpirationDays = stamps.rewardExpirationDays
    }
    if (Array.isArray(stamps.milestones)) {
      defaults.milestones = (stamps.milestones as unknown[])
        .filter(
          (m): m is { at: number; label: string } =>
            !!m &&
            typeof m === "object" &&
            typeof (m as { at?: unknown }).at === "number" &&
            typeof (m as { label?: unknown }).label === "string",
        )
        .map((m) => ({ at: m.at, label: m.label }))
        .sort((a, b) => a.at - b.at)
    }
    const msgs = stamps.milestoneMessages as Record<string, unknown> | undefined
    if (msgs) {
      if (typeof msgs.next === "string" && msgs.next.trim()) defaults.milestoneNext = msgs.next
      if (typeof msgs.reached === "string" && msgs.reached.trim())
        defaults.milestoneReached = msgs.reached
    }
  }

  if (accumulation) {
    if (typeof accumulation.minimumPurchaseAmount === "number") {
      defaults.minimumPurchaseAmount = accumulation.minimumPurchaseAmount
    }
  }

  return defaults
}

function extractPointsConfigValues(config: unknown): {
  calcMode: PointsCalcMode
  pointsPerCurrency: number
  solesPerPoint: number | null
  roundingMethod: "floor" | "round" | "ceil"
  minimumPurchaseForPoints: number | null
  maxVisitsPerDay: number
  birthdayMultiplier: number
} {
  const defaults: {
    calcMode: PointsCalcMode
    pointsPerCurrency: number
    solesPerPoint: number | null
    roundingMethod: "floor" | "round" | "ceil"
    minimumPurchaseForPoints: number | null
    maxVisitsPerDay: number
    birthdayMultiplier: number
  } = {
    calcMode: "per_currency",
    pointsPerCurrency: 1,
    solesPerPoint: null,
    roundingMethod: "floor",
    minimumPurchaseForPoints: null,
    maxVisitsPerDay: 1,
    birthdayMultiplier: 1,
  }

  if (!config || typeof config !== "object") return defaults

  const c = config as Record<string, unknown>
  const points = c.points as Record<string, unknown> | undefined
  const accumulation = c.accumulation as Record<string, unknown> | undefined
  if (accumulation && typeof accumulation.birthdayMultiplier === "number") {
    defaults.birthdayMultiplier = accumulation.birthdayMultiplier
  }

  if (points) {
    if (points.calcMode === "currency_per_point" || points.calcMode === "per_currency") {
      defaults.calcMode = points.calcMode
    }
    if (typeof points.pointsPerCurrency === "number") {
      defaults.pointsPerCurrency = points.pointsPerCurrency
    }
    if (typeof points.solesPerPoint === "number") {
      defaults.solesPerPoint = points.solesPerPoint
    }
    if (
      points.roundingMethod === "floor" ||
      points.roundingMethod === "round" ||
      points.roundingMethod === "ceil"
    ) {
      defaults.roundingMethod = points.roundingMethod as "floor" | "round" | "ceil"
    }
    if (typeof points.minimumPurchaseForPoints === "number") {
      defaults.minimumPurchaseForPoints = points.minimumPurchaseForPoints
    }
    if (typeof points.maxVisitsPerDay === "number") {
      defaults.maxVisitsPerDay = points.maxVisitsPerDay
    }
  }

  return defaults
}

type ExpirationFormValues = {
  expMode: "never" | "rolling" | "weekly" | "monthly" | "interval"
  expDays: number | null
  expWeekday: number
  expOrdinal: "1" | "2" | "3" | "4" | "last"
  expAnchor: string | null
}

const DEFAULT_EXPIRATION_FORM: ExpirationFormValues = {
  expMode: "never",
  expDays: null,
  expWeekday: 4,
  expOrdinal: "1",
  expAnchor: null,
}

/** Read `points.pointsExpiration` / `stamps.stampsExpiration` into form values. */
function extractExpirationValues(config: unknown, type: "stamps" | "points"): ExpirationFormValues {
  const out = { ...DEFAULT_EXPIRATION_FORM }
  if (!config || typeof config !== "object") return out
  const c = config as Record<string, unknown>
  const block = c[type] as Record<string, unknown> | undefined
  if (!block) return out
  const policy = expirationPolicySchema.safeParse(
    block[type === "points" ? "pointsExpiration" : "stampsExpiration"] ?? { mode: "never" },
  )
  if (policy.success) {
    const p = policy.data
    out.expMode = p.mode
    if (p.mode === "rolling" || p.mode === "interval") out.expDays = p.days
    if (p.mode === "weekly" || p.mode === "monthly") out.expWeekday = p.weekday
    if (p.mode === "monthly")
      out.expOrdinal = String(p.ordinal) as ExpirationFormValues["expOrdinal"]
    if (p.mode === "interval") out.expAnchor = p.anchor
  }
  return out
}

function buildExpirationPolicy(v: ExpirationFormValues): ExpirationPolicy {
  switch (v.expMode) {
    case "rolling":
      return { mode: "rolling", days: v.expDays ?? 7 }
    case "weekly":
      return { mode: "weekly", weekday: v.expWeekday }
    case "monthly":
      return {
        mode: "monthly",
        weekday: v.expWeekday,
        ordinal: v.expOrdinal === "last" ? "last" : (Number(v.expOrdinal) as 1 | 2 | 3 | 4),
      }
    case "interval":
      return { mode: "interval", days: v.expDays ?? 7, anchor: v.expAnchor ?? "" }
    default:
      return { mode: "never" }
  }
}

const WEEKDAY_LABELS = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"]
const ORDINAL_LABELS: Record<string, string> = {
  "1": "Primer",
  "2": "Segundo",
  "3": "Tercer",
  "4": "Cuarto",
  last: "Ultimo",
}

const ROUNDING_LABELS: Record<string, string> = {
  floor: "Piso (redondeo abajo)",
  round: "Redondeo normal",
  ceil: "Techo (redondeo arriba)",
}

// ── Component ───────────────────────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dual-type form (stamps/points) with create/edit modes, each requiring different default values and submission logic
export function PromotionFormDialog({
  open,
  onOpenChange,
  tenantId,
  promotion,
}: PromotionFormDialogProps) {
  const [isPending, startTransition] = useTransition()
  const isEdit = !!promotion
  const promotionType = (promotion?.type === "points" ? "points" : "stamps") as "stamps" | "points"

  const stampsConfig = isEdit ? extractStampsConfigValues(promotion.config) : null
  const pointsConfig = isEdit ? extractPointsConfigValues(promotion.config) : null
  const expirationValues = isEdit
    ? extractExpirationValues(promotion.config, promotionType)
    : DEFAULT_EXPIRATION_FORM

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: isEdit
      ? promotionType === "points"
        ? {
            type: "points",
            maxVisits: null,
            rewardValue: promotion.rewardValue ?? "",
            active: promotion.active,
            maxVisitsPerDay: pointsConfig?.maxVisitsPerDay ?? 1,
            hasExpiration: false,
            rewardExpirationDays: null,
            hasMinimumPurchase: false,
            minimumPurchaseAmount: null,
            milestones: [],
            milestoneNext: DEFAULT_MILESTONE_MESSAGES.next,
            milestoneReached: DEFAULT_MILESTONE_MESSAGES.reached,
            calcMode: pointsConfig?.calcMode ?? "per_currency",
            pointsPerCurrency: pointsConfig?.pointsPerCurrency ?? 1,
            solesPerPoint: pointsConfig?.solesPerPoint ?? null,
            roundingMethod: pointsConfig?.roundingMethod ?? "floor",
            minimumPurchaseForPoints: pointsConfig?.minimumPurchaseForPoints ?? null,
            hasMinimumPurchaseForPoints: pointsConfig?.minimumPurchaseForPoints !== null,
            birthdayMultiplier: pointsConfig?.birthdayMultiplier ?? 1,
            ...expirationValues,
          }
        : {
            type: "stamps",
            maxVisits: promotion.maxVisits ?? 10,
            rewardValue: promotion.rewardValue ?? "",
            active: promotion.active,
            maxVisitsPerDay: stampsConfig?.maxVisitsPerDay ?? 1,
            hasExpiration: stampsConfig?.rewardExpirationDays !== null,
            rewardExpirationDays: stampsConfig?.rewardExpirationDays ?? null,
            hasMinimumPurchase: stampsConfig?.minimumPurchaseAmount !== null,
            minimumPurchaseAmount: stampsConfig?.minimumPurchaseAmount ?? null,
            milestones: stampsConfig?.milestones ?? [],
            milestoneNext: stampsConfig?.milestoneNext ?? DEFAULT_MILESTONE_MESSAGES.next,
            milestoneReached: stampsConfig?.milestoneReached ?? DEFAULT_MILESTONE_MESSAGES.reached,
            calcMode: "per_currency",
            pointsPerCurrency: 1,
            solesPerPoint: null,
            roundingMethod: "floor",
            minimumPurchaseForPoints: null,
            hasMinimumPurchaseForPoints: false,
            birthdayMultiplier: 1,
            ...expirationValues,
          }
      : {
          type: "stamps",
          maxVisits: 10,
          rewardValue: "",
          active: true,
          maxVisitsPerDay: 1,
          hasExpiration: false,
          rewardExpirationDays: null,
          hasMinimumPurchase: false,
          minimumPurchaseAmount: null,
          milestones: [],
          milestoneNext: DEFAULT_MILESTONE_MESSAGES.next,
          milestoneReached: DEFAULT_MILESTONE_MESSAGES.reached,
          calcMode: "per_currency",
          pointsPerCurrency: 1,
          solesPerPoint: null,
          roundingMethod: "floor",
          minimumPurchaseForPoints: null,
          hasMinimumPurchaseForPoints: false,
          birthdayMultiplier: 1,
          ...DEFAULT_EXPIRATION_FORM,
        },
  })

  const milestoneRows = useFieldArray({ control, name: "milestones" })
  const maxVisitsValue = watch("maxVisits")
  const selectedType = watch("type")
  const hasExpiration = watch("hasExpiration")
  const hasMinimumPurchase = watch("hasMinimumPurchase")
  const hasMinimumPurchaseForPoints = watch("hasMinimumPurchaseForPoints")
  const expMode = watch("expMode")
  const calcMode = watch("calcMode")
  const pointsPerCurrency = watch("pointsPerCurrency")
  const solesPerPoint = watch("solesPerPoint")
  const roundingMethod = watch("roundingMethod")

  const rate = { calcMode, pointsPerCurrency, solesPerPoint, roundingMethod }
  const rateReady =
    calcMode === "currency_per_point"
      ? typeof solesPerPoint === "number" && solesPerPoint > 0
      : typeof pointsPerCurrency === "number" && pointsPerCurrency > 0
  const previewPoints = (amount: number) =>
    rateReady ? String(pointsForAmount(amount, rate)) : "-"

  function onSubmit(values: FormValues) {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: handles stamps vs points config building + create vs update branching
    startTransition(async () => {
      if (values.type === "stamps") {
        const stampsConfigPartial = {
          stamps: {
            maxVisitsPerDay: values.maxVisitsPerDay,
            rewardExpirationDays: values.hasExpiration ? values.rewardExpirationDays : null,
            stampsExpiration: buildExpirationPolicy(values),
            milestones: values.milestones
              .filter((m) => Number.isFinite(m.at))
              .map((m) => ({ at: m.at, label: m.label.trim() }))
              .sort((a, b) => a.at - b.at),
            milestoneMessages: {
              next: values.milestoneNext.trim(),
              reached: values.milestoneReached.trim(),
            },
          },
          accumulation: {
            bonusOnRegistration: 0,
            doubleStampsDays: [] as {
              dayOfWeek: number
              startHour: number
              endHour: number
            }[],
            birthdayBonus: 0,
            minimumPurchaseAmount: values.hasMinimumPurchase ? values.minimumPurchaseAmount : null,
          },
        }

        if (isEdit) {
          const result = await updatePromotion(promotion.id, {
            maxVisits: values.maxVisits ?? undefined,
            rewardValue: values.rewardValue ?? undefined,
            active: values.active,
            config: stampsConfigPartial,
          })

          if (result.success) {
            toast.success("Promocion actualizada")
            onOpenChange(false)
          } else {
            toast.error(result.error)
          }
        } else {
          const result = await createPromotion(tenantId, {
            type: "stamps",
            maxVisits: values.maxVisits ?? undefined,
            rewardValue: values.rewardValue ?? "Premio de sellos",
            active: values.active,
            config: stampsConfigPartial as CreatePromotionInput["config"],
          })

          if (result.success) {
            toast.success("Promocion creada")
            reset()
            onOpenChange(false)
          } else {
            toast.error(result.error)
          }
        }
      } else {
        // Points type
        const pointsConfigPartial = {
          points: {
            calcMode: values.calcMode,
            pointsPerCurrency: values.pointsPerCurrency ?? 1,
            solesPerPoint: values.calcMode === "currency_per_point" ? values.solesPerPoint : null,
            roundingMethod: values.roundingMethod,
            minimumPurchaseForPoints: values.hasMinimumPurchaseForPoints
              ? values.minimumPurchaseForPoints
              : null,
            maxVisitsPerDay: values.maxVisitsPerDay,
            pointsExpiration: buildExpirationPolicy(values),
          },
          accumulation: {
            pointsMultipliers: [],
            birthdayMultiplier: values.birthdayMultiplier ?? 1,
            bonusPointsOnRegistration: 0,
          },
        }

        if (isEdit) {
          const result = await updatePromotion(promotion.id, {
            rewardValue: values.rewardValue ?? undefined,
            active: values.active,
            config: pointsConfigPartial,
          })

          if (result.success) {
            toast.success("Promocion actualizada")
            onOpenChange(false)
          } else {
            toast.error(result.error)
          }
        } else {
          const result = await createPromotion(tenantId, {
            type: "points",
            rewardValue: values.rewardValue || "Programa de puntos",
            active: values.active,
            config: pointsConfigPartial as unknown as CreatePromotionInput["config"],
          })

          if (result.success) {
            toast.success("Promocion creada")
            reset()
            onOpenChange(false)
          } else {
            toast.error(result.error)
          }
        }
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar promocion" : "Nueva promocion"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifica los datos de la promocion."
              : "Configura una nueva promocion para este comercio."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Tipo selector */}
          {isEdit ? (
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Input
                value={promotionType === "points" ? "Puntos (points)" : "Sellos (stamps)"}
                disabled
                className="bg-ent-panel-2"
              />
              <p className="text-xs text-ent-fg-3">El tipo no se puede cambiar despues de crear.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Tipo de promocion</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stamps">Sellos (stamps)</SelectItem>
                      <SelectItem value="points">Puntos (points)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}

          {/* ── Stamps-specific fields ── */}
          {selectedType === "stamps" && (
            <>
              {/* Max visits */}
              <div className="space-y-2">
                <Label htmlFor="maxVisits">Visitas para premio</Label>
                <Input
                  id="maxVisits"
                  type="number"
                  min={2}
                  max={50}
                  placeholder="10"
                  {...register("maxVisits", { valueAsNumber: true })}
                />
                {errors.maxVisits && (
                  <p className="text-sm text-red-600">{errors.maxVisits.message}</p>
                )}
              </div>

              {/* Promotion name / Reward value */}
              <div className="space-y-2">
                <Label htmlFor="rewardValue">Nombre de la promocion</Label>
                <Input
                  id="rewardValue"
                  placeholder="Ej: Tarjeta de sellos, Programa premium"
                  {...register("rewardValue")}
                />
                <p className="text-xs text-ent-fg-3">
                  El nombre identifica esta promocion. Para sellos, tambien indica el premio al
                  completar el ciclo.
                </p>
                {errors.rewardValue && (
                  <p className="text-sm text-red-600">{errors.rewardValue.message}</p>
                )}
              </div>

              {/* Intermediate gifts ("escalera") */}
              <div className="space-y-3 rounded-[4px] border border-ent-line p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Label>Premios intermedios (escalera)</Label>
                    <p className="text-xs text-ent-fg-3 mt-1">
                      Obsequios antes de completar la tarjeta, por ejemplo un cafe en la visita 4 y
                      un postre en la 8. El comercio los entrega en caja: el pase avisa al cliente
                      una visita antes y en la visita del premio, y el cajero lo ve al escanear.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[12px] gap-1 shrink-0"
                    disabled={milestoneRows.fields.length >= 10}
                    onClick={() => milestoneRows.append({ at: NaN, label: "" })}
                  >
                    <Plus className="w-3 h-3" /> Agregar hito
                  </Button>
                </div>
                {milestoneRows.fields.length === 0 ? (
                  <p className="text-xs text-ent-fg-3">
                    Sin hitos: solo el premio al completar las {maxVisitsValue || "N"} visitas.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {milestoneRows.fields.map((row, i) => (
                      <div key={row.id} className="flex items-start gap-2">
                        <div className="w-24 shrink-0">
                          <Input
                            type="number"
                            min={1}
                            max={49}
                            placeholder="Visita"
                            aria-label="Visita del hito"
                            {...register(`milestones.${i}.at`, { valueAsNumber: true })}
                          />
                          {errors.milestones?.[i]?.at && (
                            <p className="text-xs text-red-600 mt-1">
                              {errors.milestones[i]?.at?.message}
                            </p>
                          )}
                        </div>
                        <div className="flex-1">
                          <Input
                            placeholder="Premio, ej: Cafe americano"
                            aria-label="Premio del hito"
                            maxLength={80}
                            {...register(`milestones.${i}.label`)}
                          />
                          {errors.milestones?.[i]?.label && (
                            <p className="text-xs text-red-600 mt-1">
                              {errors.milestones[i]?.label?.message}
                            </p>
                          )}
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 shrink-0 text-ent-fg-3 hover:text-red-600"
                          aria-label="Quitar hito"
                          onClick={() => milestoneRows.remove(i)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    {typeof errors.milestones?.message === "string" && (
                      <p className="text-xs text-red-600">{errors.milestones.message}</p>
                    )}
                    <div className="grid gap-2 pt-1">
                      <div className="space-y-1">
                        <Label htmlFor="milestoneNext" className="text-xs">
                          Aviso una visita antes
                        </Label>
                        <Input id="milestoneNext" maxLength={200} {...register("milestoneNext")} />
                        {errors.milestoneNext && (
                          <p className="text-xs text-red-600">{errors.milestoneNext.message}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="milestoneReached" className="text-xs">
                          Aviso en la visita del premio
                        </Label>
                        <Input
                          id="milestoneReached"
                          maxLength={200}
                          {...register("milestoneReached")}
                        />
                        {errors.milestoneReached && (
                          <p className="text-xs text-red-600">{errors.milestoneReached.message}</p>
                        )}
                      </div>
                      <p className="text-xs text-ent-fg-3">
                        Variables: <code>{"{premio}"}</code> y <code>{"{visita}"}</code>. El aviso
                        llega al telefono del cliente como notificacion del pase (Apple y Google).
                        Deja un aviso vacio para no enviarlo; el cajero igual ve el premio al
                        escanear.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Points-specific fields ── */}
          {selectedType === "points" && (
            <>
              {/* Calc mode + rate */}
              <div className="space-y-2">
                <Label>Como se calculan los puntos</Label>
                <Controller
                  control={control}
                  name="calcMode"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="currency_per_point">Cada X soles dan 1 punto</SelectItem>
                        <SelectItem value="per_currency">Cada sol da X puntos</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {calcMode === "currency_per_point" ? (
                <div className="space-y-2">
                  <Label htmlFor="solesPerPoint">Soles por punto (S/)</Label>
                  <Input
                    id="solesPerPoint"
                    type="number"
                    min={0.01}
                    step="any"
                    placeholder="4.50"
                    {...register("solesPerPoint", { valueAsNumber: true })}
                  />
                  <p className="text-xs text-ent-fg-3">
                    Cuantos soles de compra hacen 1 punto. Ej: 4.50 = 1 punto por cada S/ 4.50.
                  </p>
                  {errors.solesPerPoint && (
                    <p className="text-sm text-red-600">{errors.solesPerPoint.message}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="pointsPerCurrency">Puntos por sol (S/)</Label>
                  <Input
                    id="pointsPerCurrency"
                    type="number"
                    min={0.0001}
                    step="any"
                    placeholder="1"
                    {...register("pointsPerCurrency", { valueAsNumber: true })}
                  />
                  <p className="text-xs text-ent-fg-3">
                    Cuantos puntos gana el cliente por cada S/ 1.00 de compra.
                  </p>
                  {errors.pointsPerCurrency && (
                    <p className="text-sm text-red-600">{errors.pointsPerCurrency.message}</p>
                  )}
                </div>
              )}

              {rateReady ? (
                <p className="rounded-md bg-ent-panel-2 px-3 py-2 text-xs text-ent-fg-3">
                  <span className="font-medium text-ent-fg-2">{describePointsRate(rate)}</span>
                  {" · "}S/ 4.50 = {previewPoints(4.5)} pt · S/ 10 = {previewPoints(10)} pt · S/
                  13.50 = {previewPoints(13.5)} pt · S/ 50 = {previewPoints(50)} pt
                </p>
              ) : null}

              {/* Rounding method */}
              <div className="space-y-2">
                <Label>Metodo de redondeo</Label>
                <Controller
                  control={control}
                  name="roundingMethod"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(ROUNDING_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-ent-fg-3">
                  Como se redondean los puntos cuando el monto no es exacto.
                </p>
              </div>

              {/* Birthday multiplier */}
              <div className="space-y-2">
                <Label htmlFor="birthdayMultiplier">Multiplicador de cumpleanos</Label>
                <Input
                  id="birthdayMultiplier"
                  type="number"
                  min={1}
                  max={10}
                  step={0.5}
                  {...register("birthdayMultiplier", { valueAsNumber: true })}
                />
                {errors.birthdayMultiplier && (
                  <p className="text-sm text-red-600">{errors.birthdayMultiplier.message}</p>
                )}
                <p className="text-xs text-ent-fg-3">
                  Cuantas veces se multiplican los puntos el dia del cumpleanos del cliente. 1 = sin
                  bono, 2 = puntos dobles. Requiere que el registro pida la fecha de cumpleanos.
                </p>
              </div>

              {/* Minimum purchase for points */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="hasMinimumPurchaseForPoints">Monto minimo para puntos</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ent-fg-3">Sin minimo</span>
                    <Controller
                      control={control}
                      name="hasMinimumPurchaseForPoints"
                      render={({ field }) => (
                        <Switch
                          id="hasMinimumPurchaseForPoints"
                          checked={!field.value}
                          onCheckedChange={(checked) => field.onChange(!checked)}
                        />
                      )}
                    />
                  </div>
                </div>
                {hasMinimumPurchaseForPoints && (
                  <Input
                    type="number"
                    min={0.01}
                    step={0.01}
                    placeholder="10.00"
                    {...register("minimumPurchaseForPoints", {
                      valueAsNumber: true,
                    })}
                  />
                )}
                {errors.minimumPurchaseForPoints && hasMinimumPurchaseForPoints && (
                  <p className="text-sm text-red-600">{errors.minimumPurchaseForPoints.message}</p>
                )}
              </div>

              {/* Promotion name for points */}
              <div className="space-y-2">
                <Label htmlFor="rewardValuePoints">Nombre de la promocion</Label>
                <Input
                  id="rewardValuePoints"
                  placeholder="Ej: Acumula puntos y canjea premios"
                  {...register("rewardValue")}
                />
              </div>
            </>
          )}

          {/* Active toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="active">Activo</Label>
            <Controller
              control={control}
              name="active"
              render={({ field }) => (
                <Switch id="active" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          {/* Max visits per day — shared field */}
          <div className="space-y-2">
            <Label htmlFor="maxVisitsPerDay">Max visitas por dia</Label>
            <Input
              id="maxVisitsPerDay"
              type="number"
              min={1}
              max={10}
              {...register("maxVisitsPerDay", { valueAsNumber: true })}
            />
            {errors.maxVisitsPerDay && (
              <p className="text-sm text-red-600">{errors.maxVisitsPerDay.message}</p>
            )}
          </div>

          {/* Reward expiration — stamps only */}
          {selectedType === "stamps" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="hasExpiration">Dias de expiracion del premio</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ent-fg-3">Sin expiracion</span>
                  <Controller
                    control={control}
                    name="hasExpiration"
                    render={({ field }) => (
                      <Switch
                        id="hasExpiration"
                        checked={!field.value}
                        onCheckedChange={(checked) => field.onChange(!checked)}
                      />
                    )}
                  />
                </div>
              </div>
              {hasExpiration && (
                <Input
                  type="number"
                  min={1}
                  placeholder="30"
                  {...register("rewardExpirationDays", {
                    valueAsNumber: true,
                  })}
                />
              )}
              {errors.rewardExpirationDays && hasExpiration && (
                <p className="text-sm text-red-600">{errors.rewardExpirationDays.message}</p>
              )}
            </div>
          )}

          {/* Expiration of points / stamps */}
          <div className="space-y-3 rounded-[4px] border border-ent-line p-3">
            <div className="space-y-2">
              <Label>
                {selectedType === "points" ? "Vencimiento de puntos" : "Vencimiento de sellos"}
              </Label>
              <Controller
                control={control}
                name="expMode"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">No vencen</SelectItem>
                      <SelectItem value="rolling">Cada compra vence a los X dias</SelectItem>
                      <SelectItem value="weekly">Se reinician un dia fijo de la semana</SelectItem>
                      <SelectItem value="monthly">Se reinician un dia fijo del mes</SelectItem>
                      <SelectItem value="interval">Se reinician cada X dias</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-ent-fg-3">
                El corte es al final del dia elegido, en la hora local del comercio.
              </p>
            </div>

            {(expMode === "rolling" || expMode === "interval") && (
              <div className="space-y-2">
                <Label htmlFor="expDays">
                  {expMode === "rolling" ? "Dias de vigencia" : "Cada cuantos dias"}
                </Label>
                <Input
                  id="expDays"
                  type="number"
                  min={1}
                  max={730}
                  placeholder="7"
                  {...register("expDays", { valueAsNumber: true })}
                />
                {errors.expDays && <p className="text-sm text-red-600">{errors.expDays.message}</p>}
              </div>
            )}

            {expMode === "interval" && (
              <div className="space-y-2">
                <Label htmlFor="expAnchor">Fecha de inicio del ciclo</Label>
                <Input id="expAnchor" type="date" {...register("expAnchor")} />
                {errors.expAnchor && (
                  <p className="text-sm text-red-600">{errors.expAnchor.message}</p>
                )}
              </div>
            )}

            {(expMode === "weekly" || expMode === "monthly") && (
              <div className="grid grid-cols-2 gap-2">
                {expMode === "monthly" && (
                  <div className="space-y-2">
                    <Label>Semana</Label>
                    <Controller
                      control={control}
                      name="expOrdinal"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(ORDINAL_LABELS).map(([k, label]) => (
                              <SelectItem key={k} value={k}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                )}
                <div className={expMode === "monthly" ? "space-y-2" : "space-y-2 col-span-2"}>
                  <Label>Dia</Label>
                  <Controller
                    control={control}
                    name="expWeekday"
                    render={({ field }) => (
                      <Select
                        value={String(field.value)}
                        onValueChange={(v) => field.onChange(Number(v))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WEEKDAY_LABELS.map((label, i) => (
                            <SelectItem key={label} value={String(i)}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
            )}

            {expMode !== "never" && (
              <p className="text-xs text-ent-fg-3 border-t border-ent-line pt-3">
                El aviso por push antes del vencimiento lo configura el comercio en Panel &gt;
                Campanas.
              </p>
            )}
          </div>

          {/* Minimum purchase amount — stamps only */}
          {selectedType === "stamps" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="hasMinimumPurchase">Monto minimo de compra</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ent-fg-3">Sin minimo</span>
                  <Controller
                    control={control}
                    name="hasMinimumPurchase"
                    render={({ field }) => (
                      <Switch
                        id="hasMinimumPurchase"
                        checked={!field.value}
                        onCheckedChange={(checked) => field.onChange(!checked)}
                      />
                    )}
                  />
                </div>
              </div>
              {hasMinimumPurchase && (
                <Input
                  type="number"
                  min={0.01}
                  step={0.01}
                  placeholder="10.00"
                  {...register("minimumPurchaseAmount", {
                    valueAsNumber: true,
                  })}
                />
              )}
              {errors.minimumPurchaseAmount && hasMinimumPurchase && (
                <p className="text-sm text-red-600">{errors.minimumPurchaseAmount.message}</p>
              )}
            </div>
          )}

          {/* Tiers info */}
          <div className="bg-ent-panel-2 rounded-[4px] p-3 space-y-1">
            <p className="text-xs font-semibold text-ent-fg-2">Niveles de cliente (default)</p>
            <div className="flex gap-2 text-xs text-ent-fg-3">
              <span className="bg-white px-2 py-0.5 rounded border border-ent-line">
                Nuevo (0-4)
              </span>
              <span className="bg-white px-2 py-0.5 rounded border border-ent-line">
                Frecuente (5-19)
              </span>
              <span className="bg-white px-2 py-0.5 rounded border border-ent-line">VIP (20+)</span>
            </div>
            <p className="text-[10px] text-ent-fg-3">Los niveles no son editables en esta fase.</p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear promocion"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
