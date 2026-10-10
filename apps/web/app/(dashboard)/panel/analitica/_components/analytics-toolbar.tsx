"use client"

import { CalendarDays, Loader2 } from "lucide-react"
import { useState } from "react"
import type { DateRange } from "react-day-picker"

import { Toolbar } from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { cn } from "@/lib/utils"

import { type LocationOption, LocationSelect } from "./location-select"
import { formatYMD, PRESETS, type Preset, presetRange, toYMD } from "./period"

export type PeriodState = { preset: Preset; from: string; to: string }

type Props = {
  period: PeriodState
  onChange: (next: PeriodState) => void
  timezone: string
  /** Earliest selectable date in the custom picker (tenant's first visit). */
  minDate?: Date
  locations: LocationOption[]
  locationId: string
  onLocationChange: (id: string) => void
  loading: boolean
}

/** Period presets, free range, branch filter and the resolved range. */
export function AnalyticsToolbar({
  period,
  onChange,
  timezone,
  minDate,
  locations,
  locationId,
  onLocationChange,
  loading,
}: Props) {
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined)

  return (
    <Toolbar className="border-b-0">
      <CalendarDays className="w-3.5 h-3.5 text-ent-fg-3 shrink-0" aria-hidden="true" />
      <div className="flex items-center gap-1 flex-wrap">
        {PRESETS.map((p) => {
          const on = period.preset === p.v
          return (
            <Button
              key={p.v}
              type="button"
              size="sm"
              variant={on ? "default" : "outline"}
              className={cn("h-7 px-2.5 text-[12px] rounded-[4px]", !on && "text-ent-fg-2")}
              onClick={() => onChange({ preset: p.v, ...presetRange(p.v, timezone) })}
            >
              {p.label}
            </Button>
          )
        })}
        <DateRangePicker
          value={customRange}
          onChange={(r) => {
            setCustomRange(r)
            if (r?.from && r.to) {
              onChange({
                preset: "custom",
                from: toYMD(r.from, timezone),
                to: toYMD(r.to, timezone),
              })
            }
          }}
          minDate={minDate}
          active={period.preset === "custom"}
          maxSpanDays={366}
        />
      </div>
      <LocationSelect locations={locations} value={locationId} onChange={onLocationChange} />
      <span className="ml-auto flex items-center gap-2 text-[11.5px] text-ent-fg-3 tabular-nums">
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {formatYMD(period.from, true)} → {formatYMD(period.to, true)}
      </span>
    </Toolbar>
  )
}
