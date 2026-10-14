import { describe, expect, it } from "vitest"
import { resolveTemplate } from "./template-resolver"

describe("resolveTemplate", () => {
  it("formats the client birthday for the pass and hides the sentinel year", () => {
    const base = { client: { name: "Ana", birthday: "1990-05-12" } }
    expect(resolveTemplate("{{client.birthday}}", base)).toBe("12/05/1990")
    expect(
      resolveTemplate("{{client.birthday}}", { client: { name: "Ana", birthday: "1904-03-28" } }),
    ).toBe("28/03")
    expect(
      resolveTemplate("{{client.birthday}}", { client: { name: "Ana", birthday: null } }),
    ).toBe("")
    // Other values are untouched.
    expect(resolveTemplate("Hola {{client.name}}", base)).toBe("Hola Ana")
  })
})
