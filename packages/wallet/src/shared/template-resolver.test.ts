import { describe, expect, it } from "vitest"
import { resolvePassFields, resolveTemplate } from "./template-resolver"

describe("resolvePassFields", () => {
  it("takes fixed text and text with variables on the front of the pass", () => {
    // The editor lets a front field be typed, not only picked: the reward's name is fixed text.
    const fields = resolvePassFields(
      {
        headerFields: [
          { key: "sellos", label: "SELLOS", value: "{{stamps.current}} de {{stamps.max}}" },
        ],
        secondaryFields: [
          { key: "premio", label: "PREMIO", value: "Lomo Saltado clásico" },
          { key: "faltan", label: "TE FALTAN", value: "{{stamps.remaining}} sellos" },
          { key: "canje", label: "POR CANJEAR", value: "{{rewards.pending}}" },
        ],
        backFields: [],
      },
      {
        client: { name: "Ana" },
        stamps: { current: 2, max: 5, remaining: 3, total: 7 },
        rewards: { pending: 0 },
      },
    )
    expect(fields.headerFields.map((f) => f.value)).toEqual(["2 de 5"])
    expect(fields.secondaryFields.map((f) => f.value)).toEqual([
      "Lomo Saltado clásico",
      "3 sellos",
      "0",
    ])
  })
})

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

describe("resolveTemplate prototype safety", () => {
  it("resolves own data only", () => {
    const ctx = { client: { name: "Ana" }, tenant: { name: "Demo" } } as never
    expect(
      resolveTemplate("{{constructor}}|{{client.constructor}}|{{client.__proto__}}", ctx),
    ).toBe("||")
    expect(resolveTemplate("{{client.name}}", ctx)).toBe("Ana")
  })
})
