import { describe, expect, it } from "vitest"
import { buildRegistrationSchema } from "./client-schema"
import { registrationConfigSchema } from "./registration-config-schema"

const base = { name: "Ana", phone: "999", email: "ana@x.com", marketingOptIn: false }

describe("registration config → birthday toggle", () => {
  it("defaults to disabled and is not asked for", () => {
    const cfg = registrationConfigSchema.parse({})
    expect(cfg.birthday).toEqual({ enabled: false, required: false })
    const schema = buildRegistrationSchema(cfg)
    expect(schema.safeParse({ ...base, birthday: "1990-05-06" }).success).toBe(true) // ignored, not rejected
    expect("birthday" in schema.shape).toBe(false)
  })

  it("optional when enabled, validated as YYYY-MM-DD", () => {
    const cfg = registrationConfigSchema.parse({ birthday: { enabled: true } })
    const schema = buildRegistrationSchema(cfg)
    expect(schema.safeParse(base).success).toBe(true)
    expect(schema.safeParse({ ...base, birthday: "1990-05-06" }).success).toBe(true)
    expect(schema.safeParse({ ...base, birthday: "06/05/1990" }).success).toBe(false)
  })

  it("required when enabled + required, even with no strategic fields", () => {
    const cfg = registrationConfigSchema.parse({ birthday: { enabled: true, required: true } })
    const schema = buildRegistrationSchema(cfg)
    expect(schema.safeParse(base).success).toBe(false)
    expect(schema.safeParse({ ...base, birthday: "1990-05-06" }).success).toBe(true)
  })

  it("still refuses 'birthday' as a strategic field key (it is a first-class field)", () => {
    expect(
      registrationConfigSchema.safeParse({
        strategicFields: [{ key: "birthday", label: "Cumple", type: "date" }],
      }).success,
    ).toBe(false)
  })
})
