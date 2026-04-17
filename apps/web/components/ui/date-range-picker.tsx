"use client"

import { CalendarDays } from "lucide-react"
import * as React from "react"
import type { DateRange } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

function formatShort(d: Date): string {
  return d.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })
}

type Props = {
  /** Selected range, or undefined for none. */
  value?: DateRange
  /** Called when the user picks a new complete range. */
  onChange: (range: DateRange | undefined) => void
  /** Minimum selectable date (e.g. tenant's first visit). */
  minDate?: Date
  /** Maximum selectable date (default: today). */
  maxDate?: Date
  /** Max allowed span in days between from and to (default: 365). */
  maxSpanDays?: number
  /** Active / highlighted appearance. */
  active?: boolean
  /** Disabled. */
  disabled?: boolean
  /** Custom label when nothing is selected. */
  placeholder?: string
}

export function DateRangePicker({
  value,
  onChange,
  minDate,
  maxDate,
  maxSpanDays = 365,
  active = false,
  disabled = false,
  placeholder = "Rango personalizado",
}: Props) {
  const [open, setOpen] = React.useState(false)
  const today = React.useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])
  const effectiveMax = maxDate ?? today

  const label = React.useMemo(() => {
    if (value?.from && value.to) {
      return `${formatShort(value.from)} – ${formatShort(value.to)}`
    }
    return placeholder
  }, [value, placeholder])

  function handleSelect(range: DateRange | undefined) {
    if (range?.from && range.to) {
      // Enforce maxSpanDays
      const span = (range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24)
      if (span > maxSpanDays) {
        return
      }
      onChange(range)
      setOpen(false)
      return
    }
    onChange(range)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={active ? "default" : "outline"}
          size="sm"
          disabled={disabled}
          className={active ? "bg-primary text-white" : ""}
        >
          <CalendarDays className="mr-2 h-4 w-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="range"
          selected={value}
          onSelect={handleSelect}
          numberOfMonths={2}
          disabled={(date) => {
            if (minDate && date < minDate) return true
            if (date > effectiveMax) return true
            return false
          }}
          defaultMonth={value?.from ?? effectiveMax}
        />
      </PopoverContent>
    </Popover>
  )
}
