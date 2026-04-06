"use client"

import type { CreatePromotionInput } from "@cuik/shared/validators"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTransition } from "react"
import { Controller, useForm } from "react-hook-form"
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
    // Points fields
    pointsPerCurrency: z
      .number({ invalid_type_error: "Ingresa un numero valido" })
      .positive("Debe ser mayor a 0")
      .nullable(),
    roundingMethod: z.enum(["floor", "round", "ceil"]).default("floor"),
    minimumPurchaseForPoints: z
      .number({ invalid_type_error: "Ingresa un numero valido" })
      .positive("Debe ser mayor a 0")
      .nullable(),
    hasMinimumPurchaseForPoints: z.boolean(),
  })
  .superRefine((data, ctx) => {
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
    }
    if (data.type === "points") {
      if (data.pointsPerCurrency === null || data.pointsPerCurrency === undefined) {
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
} {
  const defaults = {
    maxVisitsPerDay: 1,
    rewardExpirationDays: null as number | null,
    minimumPurchaseAmount: null as number | null,
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
  }

  if (accumulation) {
    if (typeof accumulation.minimumPurchaseAmount === "number") {
      defaults.minimumPurchaseAmount = accumulation.minimumPurchaseAmount
    }
  }

  return defaults
}

function extractPointsConfigValues(config: unknown): {
  pointsPerCurrency: number
  roundingMethod: "floor" | "round" | "ceil"
  minimumPurchaseForPoints: number | null
  maxVisitsPerDay: number
} {
  const defaults: {
    pointsPerCurrency: number
    roundingMethod: "floor" | "round" | "ceil"
    minimumPurchaseForPoints: number | null
    maxVisitsPerDay: number
  } = {
    pointsPerCurrency: 1,
    roundingMethod: "floor",
    minimumPurchaseForPoints: null,
    maxVisitsPerDay: 1,
  }

  if (!config || typeof config !== "object") return defaults

  const c = config as Record<string, unknown>
  const points = c.points as Record<string, unknown> | undefined

  if (points) {
    if (typeof points.pointsPerCurrency === "number") {
      defaults.pointsPerCurrency = points.pointsPerCurrency
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
            pointsPerCurrency: pointsConfig?.pointsPerCurrency ?? 1,
            roundingMethod: pointsConfig?.roundingMethod ?? "floor",
            minimumPurchaseForPoints: pointsConfig?.minimumPurchaseForPoints ?? null,
            hasMinimumPurchaseForPoints: pointsConfig?.minimumPurchaseForPoints !== null,
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
            pointsPerCurrency: 1,
            roundingMethod: "floor",
            minimumPurchaseForPoints: null,
            hasMinimumPurchaseForPoints: false,
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
          pointsPerCurrency: 1,
          roundingMethod: "floor",
          minimumPurchaseForPoints: null,
          hasMinimumPurchaseForPoints: false,
        },
  })

  const selectedType = watch("type")
  const hasExpiration = watch("hasExpiration")
  const hasMinimumPurchase = watch("hasMinimumPurchase")
  const hasMinimumPurchaseForPoints = watch("hasMinimumPurchaseForPoints")

  function onSubmit(values: FormValues) {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: handles stamps vs points config building + create vs update branching
    startTransition(async () => {
      if (values.type === "stamps") {
        const stampsConfigPartial = {
          stamps: {
            maxVisitsPerDay: values.maxVisitsPerDay,
            rewardExpirationDays: values.hasExpiration ? values.rewardExpirationDays : null,
            stampsExpiration: { type: "never" as const, value: 0 },
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
            pointsPerCurrency: values.pointsPerCurrency ?? 1,
            roundingMethod: values.roundingMethod,
            minimumPurchaseForPoints: values.hasMinimumPurchaseForPoints
              ? values.minimumPurchaseForPoints
              : null,
            maxVisitsPerDay: values.maxVisitsPerDay,
            pointsExpiration: { type: "never" as const, value: 0 },
          },
          accumulation: {
            pointsMultipliers: [],
            birthdayMultiplier: 1,
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
                className="bg-slate-50"
              />
              <p className="text-xs text-slate-400">
                El tipo no se puede cambiar despues de crear.
              </p>
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
                <p className="text-xs text-slate-400">
                  El nombre identifica esta promocion. Para sellos, tambien indica el premio al
                  completar el ciclo.
                </p>
                {errors.rewardValue && (
                  <p className="text-sm text-red-600">{errors.rewardValue.message}</p>
                )}
              </div>
            </>
          )}

          {/* ── Points-specific fields ── */}
          {selectedType === "points" && (
            <>
              {/* Points per currency */}
              <div className="space-y-2">
                <Label htmlFor="pointsPerCurrency">Puntos por sol (S/)</Label>
                <Input
                  id="pointsPerCurrency"
                  type="number"
                  min={0.01}
                  step={0.01}
                  placeholder="1"
                  {...register("pointsPerCurrency", {
                    valueAsNumber: true,
                  })}
                />
                <p className="text-xs text-slate-400">
                  Cuantos puntos gana el cliente por cada S/ 1.00 de compra.
                </p>
                {errors.pointsPerCurrency && (
                  <p className="text-sm text-red-600">{errors.pointsPerCurrency.message}</p>
                )}
              </div>

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
                <p className="text-xs text-slate-400">
                  Como se redondean los puntos cuando el monto no es exacto.
                </p>
              </div>

              {/* Minimum purchase for points */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="hasMinimumPurchaseForPoints">Monto minimo para puntos</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Sin minimo</span>
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
                  <span className="text-xs text-slate-500">Sin expiracion</span>
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

          {/* Minimum purchase amount — stamps only */}
          {selectedType === "stamps" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="hasMinimumPurchase">Monto minimo de compra</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Sin minimo</span>
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
          <div className="bg-slate-50 rounded-lg p-3 space-y-1">
            <p className="text-xs font-semibold text-slate-600">Niveles de cliente (default)</p>
            <div className="flex gap-2 text-xs text-slate-500">
              <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                Nuevo (0-4)
              </span>
              <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                Frecuente (5-19)
              </span>
              <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                VIP (20+)
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Los niveles no son editables en esta fase.</p>
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
