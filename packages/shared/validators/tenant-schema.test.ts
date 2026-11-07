import { describe, expect, it } from "vitest"
import { updateTenantSchema } from "./tenant-schema"

describe("updateTenantSchema timezone", () => {
  it("accepts real IANA zones and rejects typos", () => {
    expect(updateTenantSchema.safeParse({ timezone: "America/Lima" }).success).toBe(true)
    expect(updateTenantSchema.safeParse({ timezone: "America/Lmia" }).success).toBe(false)
    expect(updateTenantSchema.safeParse({ timezone: "'; DROP TABLE x; --" }).success).toBe(false)
  })
})
