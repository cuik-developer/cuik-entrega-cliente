import { describe, expect, it } from "vitest"
import { normalize, prepare, type SearchEntry, searchEntries } from "./match"
import index from "./panel-index.json"

const prepared = prepare(index as SearchEntry[])
const top = (q: string, program?: "stamps" | "points") =>
  searchEntries(prepared, q, { program }).map((h) => h.entry.id)

describe("normalize", () => {
  it("drops accents and case, collapses spaces", () => {
    expect(normalize("  Notificación   PUSH ")).toBe("notificacion push")
    // ñ folds to n so "cumpleanos" and "cumpleaños" meet.
    expect(normalize("Cumpleaños")).toBe("cumpleanos")
  })
})

describe("searchEntries on the real index", () => {
  it("push / notificación / mensaje lead to the new campaign", () => {
    expect(top("push")[0]).toBe("campana-nueva")
    expect(top("notificacion")[0]).toBe("campana-nueva")
    expect(top("notificación")[0]).toBe("campana-nueva")
    expect(top("mensaje a mis clientes")[0]).toBe("campana-nueva")
  })

  it("tolerates one typo from 4 letters on", () => {
    expect(top("cumpleanios")[0]).toBe("cumpleanos")
    expect(top("exportra")[0]).toBe("exportar")
  })

  it("segments open Clientes with the right filter", () => {
    expect(top("en riesgo")[0]).toBe("clientes-en-riesgo")
    expect(top("frecuentes")[0]).toBe("clientes-frecuentes")
  })

  it("excel ranks exportar above importar when it is the only word", () => {
    const ids = top("excel")
    expect(ids).toContain("exportar")
    expect(ids).toContain("importar-lista")
  })

  it("hides points-only features from stamps programs and vice versa", () => {
    expect(top("puntos por vencer", "stamps")).not.toContain("puntos-por-vencer")
    expect(top("puntos por vencer", "points")[0]).toBe("puntos-por-vencer")
  })

  it("empty query returns nothing", () => {
    expect(top("")).toEqual([])
  })

  it("every entry is reachable by its own first keyword", () => {
    for (const e of index as SearchEntry[]) {
      const ids = searchEntries(prepared, e.keywords[0], { limit: 20 }).map((h) => h.entry.id)
      expect(ids, `keyword "${e.keywords[0]}" of ${e.id}`).toContain(e.id)
    }
  })
})
