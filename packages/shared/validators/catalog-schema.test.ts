import { describe, expect, it } from "vitest"
import { catalogImageUrlSchema } from "./catalog-schema"

describe("catalogImageUrlSchema", () => {
  it("accepts only photos uploaded to Cuik", () => {
    expect(catalogImageUrlSchema.safeParse("/api/assets/tenants/abc/assets/x.png").success).toBe(
      true,
    )
    expect(catalogImageUrlSchema.safeParse("https://otro-sitio.com/foto.png").success).toBe(false)
    expect(catalogImageUrlSchema.safeParse("/api/assets/../../etc/passwd").success).toBe(false)
  })
})
