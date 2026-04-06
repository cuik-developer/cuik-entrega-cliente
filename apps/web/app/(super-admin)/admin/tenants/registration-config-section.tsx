"use client"

import type { RegistrationConfig } from "@cuik/shared/validators"
import { ClipboardList, Loader2, Settings2, Sparkles } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { getRegistrationConfig } from "./registration-config-actions"
import { RegistrationConfigDialog } from "./registration-config-dialog"

// ── Types ───────────────────────────────────────────────────────────

interface RegistrationConfigSectionProps {
  tenantId: string
  initialConfig?: RegistrationConfig | null
  loading?: boolean
  onRefresh?: () => void
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Texto",
  select: "Selector",
  date: "Fecha",
  location_select: "Ubicacion",
}

// ── Component ───────────────────────────────────────────────────────

export function RegistrationConfigSection({
  tenantId,
  initialConfig,
  loading: externalLoading,
  onRefresh,
}: RegistrationConfigSectionProps) {
  const [config, setConfig] = useState<RegistrationConfig | null>(initialConfig ?? null)
  const [loading, setLoading] = useState(externalLoading ?? false)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Sync with parent-provided config
  useEffect(() => {
    setConfig(initialConfig ?? null)
  }, [initialConfig])

  useEffect(() => {
    if (externalLoading !== undefined) setLoading(externalLoading)
  }, [externalLoading])

  const fetchConfig = useCallback(() => {
    if (onRefresh) {
      onRefresh()
      return
    }
    setLoading(true)
    getRegistrationConfig(tenantId)
      .then((result) => {
        if (result.success) {
          setConfig(result.data)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tenantId, onRefresh])

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open)
    if (!open) {
      fetchConfig()
    }
  }

  const hasFields = config && config.strategicFields.length > 0
  const hasBonus = config?.marketingBonus?.enabled

  return (
    <div className="px-6 pt-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Configuracion de registro
        </p>
        <Button
          size="sm"
          className="h-7 px-3 text-xs gap-1 bg-[#0e70db] text-white"
          onClick={() => setDialogOpen(true)}
        >
          <Settings2 className="w-3 h-3" /> {config ? "Editar" : "Configurar"}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3">
          <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
          <span className="text-xs text-slate-500">Cargando configuracion...</span>
        </div>
      ) : !config || (!hasFields && !hasBonus) ? (
        <div className="bg-slate-50 rounded-xl p-4 text-center">
          <ClipboardList className="w-5 h-5 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Sin configuracion de registro personalizada</p>
          <p className="text-xs text-slate-400 mt-1">
            Agrega campos estrategicos y bonos de marketing para el formulario de registro.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Strategic Fields */}
          {hasFields && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600">Campos estrategicos</p>
              {config.strategicFields.map((field) => (
                <div
                  key={field.key}
                  className="bg-slate-50 rounded-xl p-3 flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900 truncate">
                        {field.label}
                      </span>
                      <Badge variant="outline" className="text-[10px] text-slate-500">
                        {FIELD_TYPE_LABELS[field.type] ?? field.type}
                      </Badge>
                      {field.required && (
                        <Badge className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200">
                          Obligatorio
                        </Badge>
                      )}
                    </div>
                    {field.type === "select" && field.options && (
                      <p className="text-xs text-slate-400 mt-1 truncate">
                        Opciones: {field.options.join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Marketing Bonus */}
          {hasBonus && (
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-medium text-slate-600">Bono de marketing</span>
                <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border border-emerald-200">
                  Activo
                </Badge>
              </div>
              <div className="flex gap-3 text-xs text-slate-500">
                {(config.marketingBonus.stampsBonus ?? 0) > 0 && (
                  <span>
                    <span className="font-semibold text-[#0e70db]">
                      +{config.marketingBonus.stampsBonus}
                    </span>{" "}
                    sellos
                  </span>
                )}
                {(config.marketingBonus.pointsBonus ?? 0) > 0 && (
                  <span>
                    <span className="font-semibold text-[#0e70db]">
                      +{config.marketingBonus.pointsBonus}
                    </span>{" "}
                    puntos
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Template Variables Reference */}
          <div className="bg-blue-50 rounded-xl p-3">
            <p className="text-xs font-medium text-blue-700 mb-1">
              Variables de plantilla disponibles
            </p>
            <div className="flex flex-wrap gap-1">
              {[
                "{{client.name}}",
                "{{client.lastName}}",
                "{{stamps.current}}",
                "{{points.balance}}",
                "{{client.tier}}",
              ].map((v) => (
                <code
                  key={v}
                  className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-mono"
                >
                  {v}
                </code>
              ))}
              {config.strategicFields.map((f) => (
                <code
                  key={f.key}
                  className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded font-mono"
                >
                  {`{{client.strategic.${f.key}}}`}
                </code>
              ))}
            </div>
            <p className="text-[10px] text-blue-500 mt-1">
              Usa estas variables en el diseno del pase para personalizar contenido.
            </p>
          </div>
        </div>
      )}

      <RegistrationConfigDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        tenantId={tenantId}
        config={config}
      />
    </div>
  )
}
