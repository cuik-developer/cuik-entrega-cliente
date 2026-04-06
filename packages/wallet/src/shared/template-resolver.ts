import type { PassDesignData } from "./types"

// ─── Template Context ───────────────────────────────────────────────────

export type TemplateContext = {
  client: {
    name: string
    lastName?: string | null
    phone?: string | null
    email?: string | null
    birthday?: string | null
    tier?: string | null
    totalVisits?: number
    pointsBalance?: number
    customData?: Record<string, unknown> | null
  }
  stamps?: {
    current: number
    max: number
    remaining: number
    total: number
  }
  points?: {
    balance: number
  }
  rewards?: {
    pending: number
  }
  tenant?: {
    name: string
  }
}

// ─── Core Resolver ──────────────────────────────────────────────────────

/**
 * Resolve {{path.to.value}} template variables in a string.
 * Pure function, no side effects.
 *
 * - Handles nested paths: {{client.customData.bebidaFavorita}}
 * - Missing values resolve to "" (empty string)
 * - Strings without placeholders pass through unchanged
 * - NO eval, NO user code execution — pure property traversal
 */
export function resolveTemplate(template: string, context: TemplateContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    const value = getNestedValue(context, path.trim())
    if (value === null || value === undefined) return ""
    return String(value)
  })
}

/**
 * Traverse an object by dot-separated path.
 * Returns undefined if any segment is missing.
 */
function getNestedValue(obj: unknown, path: string): unknown {
  return path.split(".").reduce((current, key) => {
    if (current === null || current === undefined) return undefined
    if (typeof current !== "object") return undefined
    return (current as Record<string, unknown>)[key]
  }, obj as unknown)
}

// ─── Pass Fields Resolver ───────────────────────────────────────────────

export type PassField = {
  key: string
  label: string
  value: string
  changeMessage?: string
}

export type ResolvedPassFields = {
  headerFields: PassField[]
  secondaryFields: PassField[]
  backFields: PassField[]
  auxiliaryFields?: PassField[]
}

/**
 * Resolve all template variables in a pass design's fields configuration.
 * Returns fields with {{variable}} placeholders replaced by actual values.
 *
 * Both label and value properties are resolved — labels can contain
 * template variables too (e.g., "Visitas de {{client.name}}").
 */
export function resolvePassFields(
  fields: PassDesignData["fields"],
  context: TemplateContext,
): ResolvedPassFields {
  const resolveFieldArray = (
    arr: Array<{ key: string; label: string; value: string; changeMessage?: string }> | undefined,
  ): PassField[] =>
    (arr ?? []).map((field) => ({
      key: field.key,
      label: resolveTemplate(field.label, context),
      value: resolveTemplate(field.value, context),
      ...(field.changeMessage ? { changeMessage: field.changeMessage } : {}),
    }))

  return {
    headerFields: resolveFieldArray(fields.headerFields),
    secondaryFields: resolveFieldArray(fields.secondaryFields),
    backFields: resolveFieldArray(fields.backFields),
  }
}
