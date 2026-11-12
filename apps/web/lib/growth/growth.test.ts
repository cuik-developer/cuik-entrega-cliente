import { describe, expect, it } from "vitest"
import { attributeSales, measuringDayOf, sendImpact } from "./attribution"
import { evaluateAudiences, mainAudience, suggestion } from "./audiences"
import { brandOf, categoryKey, classifyLine, classifyOdooCategory } from "./categories"
import { addDays, daysBetween, previousWeekday, weekdayOf } from "./dates"
import { DEFAULT_RULES, variableFee } from "./rules"
import {
  categoryIntervals,
  computeClientStats,
  habitualWeekday,
  ownInterval,
  type Purchase,
  suggestedDay,
} from "./stats"
import { petNameOf, petWord, renderTemplate, whatsappLink } from "./templates"

const CAT_WET = "All / Vendibles / Gatos / Alimento / Alimento humedo"
const CAT_DRY = "All / Vendibles / Gatos / Alimento / Alimento seco"
const CAT_LITTER = "All / Vendibles / Gatos / Arenas y mas / Arenas"
const DOG_DRY = "All / Vendibles / Perros / Alimento / Alimento seco"
const DOG_FLEAS = "All / Vendibles / Perros / Cuidado e higiene / Antipulgas"

function buy(
  soldOn: string,
  cat: string,
  name = "Producto X (MARCA)",
  total = 100,
  store = "Pezet",
): Purchase {
  return {
    soldOn,
    store,
    amount: total,
    lines: [{ sku: name, productName: name, odooCategory: cat, total }],
  }
}

describe("categories", () => {
  it("keeps the master species and takes the leaf from Odoo when the master says only the species", () => {
    const c = classifyLine({
      odooCategory: "All / Vendibles / Gatos / Alimento / Alimento humedo",
      masterCategory: "Perro",
    })
    expect(c).toEqual({ species: "perro", group: "alimento", sub: "alimento_humedo" })
  })

  it("classifies the Odoo path into species, group and leaf", () => {
    expect(classifyOdooCategory(CAT_WET)).toEqual({
      species: "gato",
      group: "alimento",
      sub: "alimento_humedo",
    })
    expect(categoryKey(classifyOdooCategory(CAT_LITTER))).toBe("gato:arenas")
    expect(categoryKey(classifyOdooCategory("All / Vendibles / PoS"))).toBe(":pos")
    expect(categoryKey(classifyOdooCategory(null))).toBeNull()
  })

  it("prefers the product master over the Odoo path", () => {
    const c = classifyLine({
      odooCategory: "All / Vendibles / PoS",
      masterCategory: "Perros",
      masterClass: "Alimento",
      masterSubclass: "Alimento seco",
    })
    expect(categoryKey(c)).toBe("perro:alimento_seco")
  })

  it("reads the brand from the trailing parentheses, ignoring sizes", () => {
    expect(brandOf("Monge Fresh Lata 100 g (MONGE)")).toBe("Monge")
    expect(brandOf("Hill's Science Diet Adult 7 kg (HILL'S SCIENCE DIET)")).toBe(
      "Hill's Science Diet",
    )
    expect(brandOf("Vanness Autobebedero - 3 LT (10 LT)")).toBeNull()
    expect(brandOf("Sin marca")).toBeNull()
  })
})

describe("dates", () => {
  it("does day math on local days", () => {
    expect(addDays("2026-11-30", 2)).toBe("2026-12-02")
    expect(daysBetween("2026-11-01", "2026-11-13")).toBe(12)
    expect(weekdayOf("2026-11-14")).toBe(6) // Saturday
    expect(previousWeekday("2026-11-14", 6)).toBe("2026-11-07")
  })
})

describe("client stats", () => {
  it("uses the median of the latest intervals as the own interval", () => {
    expect(ownInterval(["2026-01-01", "2026-01-13", "2026-01-25", "2026-02-06"], 3)).toBe(12)
    expect(ownInterval(["2026-01-01", "2026-01-13"], 3)).toBeNull()
  })

  it("finds the habitual weekday only when one dominates", () => {
    // Four Saturdays and one Monday.
    expect(
      habitualWeekday(["2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24", "2026-10-26"]),
    ).toBe(6)
    expect(habitualWeekday(["2026-10-03", "2026-10-05", "2026-10-07"])).toBeNull()
  })

  it("suggests the habitual weekday just before the expected day, never too early", () => {
    // Interval 34 from Sat 10 Oct → expected Fri 13 Nov; habitual Saturday → Sat 7 Nov (day 28 ≤ 7 early days).
    expect(suggestedDay("2026-11-13", "2026-10-10", 6, 7)).toBe("2026-11-07")
    // Expected on a Saturday: the previous Saturday is 7 days before → allowed exactly at the limit.
    expect(suggestedDay("2026-11-14", "2026-10-11", 6, 7)).toBe("2026-11-07")
    // Allowed only 3 days early: the Saturday is too far, fall back to two days before.
    expect(suggestedDay("2026-11-14", "2026-10-11", 6, 3)).toBe("2026-11-12")
    // No habitual weekday: two days before.
    expect(suggestedDay("2026-11-13", "2026-10-10", null, 7)).toBe("2026-11-11")
    // Never before the day after the last purchase.
    expect(suggestedDay("2026-11-02", "2026-11-01", null, 7)).toBe("2026-11-02")
  })

  it("computes rhythm, species, main product and brand from the purchases", () => {
    const purchases = [
      buy("2026-09-05", CAT_WET, "Monge Fresh Lata 100 g (MONGE)", 60),
      buy("2026-09-19", CAT_WET, "Monge Fresh Lata 100 g (MONGE)", 60),
      buy("2026-10-03", CAT_WET, "Monge Fresh Lata 100 g (MONGE)", 60),
      buy("2026-10-17", CAT_DRY, "Monge Cat Adult 1.5 kg (MONGE)", 90, "Santa Cruz"),
    ]
    const s = computeClientStats(purchases, { today: "2026-11-12", rules: DEFAULT_RULES })
    expect(s.purchases).toBe(4)
    expect(s.intervalDays).toBe(14)
    expect(s.intervalSource).toBe("own")
    expect(s.habitualWeekday).toBe(6)
    expect(s.expectedOn).toBe("2026-10-31")
    expect(s.suggestedOn).toBe("2026-10-24")
    expect(s.species).toBe("gato")
    expect(s.mainCategory).toBe("gato:alimento_humedo")
    expect(s.mainProductName).toBe("Monge Fresh Lata 100 g (MONGE)")
    expect(s.mainBrand).toBe("Monge")
    expect(s.stores12m).toBe(2)
    expect(s.categories["gato:alimento_humedo"].orders).toBe(3)
  })

  it("falls back to the category interval with fewer than 3 purchases, then the tenant's", () => {
    const purchases = [buy("2026-11-01", CAT_DRY), buy("2026-11-05", CAT_DRY)]
    const byCategory = computeClientStats(purchases, {
      today: "2026-11-12",
      rules: DEFAULT_RULES,
      categoryIntervals: new Map([["gato:alimento_seco", 30]]),
      tenantInterval: 20,
    })
    expect(byCategory.intervalDays).toBe(30)
    expect(byCategory.intervalSource).toBe("category")
    expect(byCategory.expectedOn).toBe("2026-12-05")
    const byTenant = computeClientStats(purchases, {
      today: "2026-11-12",
      rules: DEFAULT_RULES,
      tenantInterval: 20,
    })
    expect(byTenant.intervalSource).toBe("tenant")
    const none = computeClientStats(purchases, { today: "2026-11-12", rules: DEFAULT_RULES })
    expect(none.intervalDays).toBeNull()
    expect(none.suggestedOn).toBeNull()
  })

  it("builds the category intervals from clients with their own rhythm", () => {
    const rows = [
      { mainCategory: "gato:alimento_seco", intervalDays: 28, intervalSource: "own" },
      { mainCategory: "gato:alimento_seco", intervalDays: 30, intervalSource: "own" },
      { mainCategory: "gato:alimento_seco", intervalDays: 35, intervalSource: "own" },
      { mainCategory: "gato:alimento_seco", intervalDays: 99, intervalSource: "category" },
      { mainCategory: "perro:snacks", intervalDays: 10, intervalSource: "own" },
    ]
    const m = categoryIntervals(rows)
    expect(m.get("gato:alimento_seco")).toBe(30)
    expect(m.has("perro:snacks")).toBe(false)
  })
})

describe("audiences", () => {
  const rules = DEFAULT_RULES

  it("puts a client in Recompra until they turn En riesgo", () => {
    const stats = computeClientStats(
      [buy("2026-09-20", DOG_DRY), buy("2026-10-10", DOG_DRY), buy("2026-10-30", DOG_DRY)],
      { today: "2026-11-12", rules },
    )
    // Interval 20 → expected 19 Nov, suggested 17 Nov (no habitual weekday: Sun, Sat, Fri).
    const m = evaluateAudiences(stats, { today: "2026-11-12", rules })
    const recompra = m.find((x) => x.audience === "recompra")
    expect(recompra?.readyOn).toBe("2026-11-17")
    expect(m.some((x) => x.audience === "en_riesgo")).toBe(false)
    if (!recompra) throw new Error("recompra expected")
    expect(
      suggestion(
        recompra,
        { lastSentOn: null, inOpenSend: false, noContact: false },
        "2026-11-12",
        rules,
      ),
    ).toEqual({
      ready: false,
      reason: "not_yet",
      availableOn: "2026-11-17",
    })
    // Day 31 of 20 → more than 1.5× → en riesgo, recompra gone.
    const later = evaluateAudiences(stats, { today: "2026-11-30", rules })
    expect(later.some((x) => x.audience === "en_riesgo")).toBe(true)
    expect(later.some((x) => x.audience === "recompra")).toBe(false)
  })

  it("never marks En riesgo on a borrowed interval", () => {
    const stats = computeClientStats([buy("2026-08-01", DOG_DRY)], {
      today: "2026-11-12",
      rules,
      tenantInterval: 20,
    })
    const m = evaluateAudiences(stats, { today: "2026-11-12", rules })
    expect(m.some((x) => x.audience === "en_riesgo")).toBe(false)
  })

  it("drops Recompra once a borrowed interval is overdue, and never chases a lost client", () => {
    // One purchase 103 days ago with a tenant interval of 20: past 1.5× → not "about to buy".
    const borrowed = computeClientStats([buy("2026-08-01", DOG_DRY)], {
      today: "2026-11-12",
      rules,
      tenantInterval: 20,
    })
    const m = evaluateAudiences(borrowed, { today: "2026-11-12", rules })
    expect(m.some((x) => x.audience === "recompra")).toBe(false)
    expect(m.some((x) => x.audience === "en_riesgo")).toBe(false)
    // Own interval but more than a year silent: lost, not "en riesgo".
    const lost = computeClientStats(
      [buy("2025-08-01", DOG_DRY), buy("2025-08-21", DOG_DRY), buy("2025-09-10", DOG_DRY)],
      { today: "2026-11-12", rules },
    )
    const l = evaluateAudiences(lost, { today: "2026-11-12", rules })
    expect(l.some((x) => x.audience === "en_riesgo")).toBe(false)
    expect(l.some((x) => x.audience === "recompra")).toBe(false)
  })

  it("keeps a control client untouched while the send is measured", () => {
    const member = { readyOn: null }
    const inControl = {
      lastSentOn: null,
      inOpenSend: false,
      noContact: false,
      controlUntil: "2026-11-20",
    }
    expect(suggestion(member, inControl, "2026-11-12", rules)).toEqual({
      ready: false,
      reason: "control",
      availableOn: "2026-11-21",
    })
    expect(suggestion(member, inControl, "2026-11-21", rules).ready).toBe(true)
  })

  it("counts the measuring window from the first check to the end of the last one", () => {
    const tz = "America/Lima"
    const counts = { firstSentAt: "2026-11-05T14:00:00Z", lastSentAt: "2026-11-08T14:00:00Z" }
    expect(measuringDayOf(counts, 10, "2026-11-05", tz)).toBe(1)
    expect(measuringDayOf(counts, 10, "2026-11-16", tz)).toBe(12)
    expect(measuringDayOf(counts, 10, "2026-11-19", tz)).toBe(null)
    expect(measuringDayOf({ firstSentAt: null, lastSentAt: null }, 10, "2026-11-05", tz)).toBe(null)
  })

  it("detects the cross-sell gaps and the flea reminder", () => {
    const stats = computeClientStats(
      [
        buy("2026-09-01", CAT_WET),
        buy("2026-09-15", CAT_WET),
        buy("2026-10-01", DOG_DRY),
        buy("2026-10-15", DOG_DRY),
        buy("2026-10-20", DOG_FLEAS, "Bravecto 10-20 kg (MSD)"),
      ],
      { today: "2026-11-12", rules },
    )
    const slugs = evaluateAudiences(stats, { today: "2026-11-12", rules }).map((x) => x.audience)
    expect(slugs).toContain("gato_sin_arena")
    expect(slugs).toContain("perro_sin_snacks")
    expect(slugs).toContain("antipulgas")
    expect(slugs).toContain("activos")
    const fleas = evaluateAudiences(stats, { today: "2026-11-12", rules }).find(
      (x) => x.audience === "antipulgas",
    )
    expect(fleas?.readyOn).toBe("2026-12-04")
  })

  it("drops the gap once the missing category is bought", () => {
    const stats = computeClientStats(
      [buy("2026-09-01", CAT_WET), buy("2026-09-15", CAT_WET), buy("2026-10-01", CAT_LITTER)],
      { today: "2026-11-12", rules },
    )
    expect(
      evaluateAudiences(stats, { today: "2026-11-12", rules }).map((x) => x.audience),
    ).not.toContain("gato_sin_arena")
  })

  it("blocks before timing: no contactar, open send, cooldown", () => {
    const member = { readyOn: null }
    expect(
      suggestion(
        member,
        { lastSentOn: null, inOpenSend: false, noContact: true },
        "2026-11-12",
        rules,
      ).reason,
    ).toBe("no_contact")
    expect(
      suggestion(
        member,
        { lastSentOn: null, inOpenSend: true, noContact: false },
        "2026-11-12",
        rules,
      ).reason,
    ).toBe("open_send")
    expect(
      suggestion(
        member,
        { lastSentOn: "2026-11-01", inOpenSend: false, noContact: false },
        "2026-11-12",
        rules,
      ),
    ).toEqual({ ready: false, reason: "cooldown", availableOn: "2026-11-15" })
    expect(
      suggestion(
        member,
        { lastSentOn: "2026-10-29", inOpenSend: false, noContact: false },
        "2026-11-12",
        rules,
      ).ready,
    ).toBe(true)
  })

  it("picks the main intent by priority", () => {
    expect(mainAudience(["gato_sin_arena", "recompra", "activos"])).toBe("recompra")
    expect(mainAudience(["activos"])).toBeNull()
  })
})

describe("attribution", () => {
  const d = (s: string) => new Date(s)
  it("attributes a sale to the latest confirmed send inside its window, once", () => {
    const sent = [
      {
        recipientId: "r1",
        sendId: "s1",
        clientId: "c1",
        sentAt: d("2026-11-01T14:00:00Z"),
        attributionDays: 10,
      },
      {
        recipientId: "r2",
        sendId: "s2",
        clientId: "c1",
        sentAt: d("2026-11-05T14:00:00Z"),
        attributionDays: 10,
      },
      {
        recipientId: "r3",
        sendId: "s1",
        clientId: "c2",
        sentAt: d("2026-11-01T14:00:00Z"),
        attributionDays: 10,
      },
    ]
    const sales = [
      {
        saleId: "v1",
        clientId: "c1",
        soldAt: d("2026-11-06T20:00:00Z"),
        soldOn: "2026-11-06",
        amount: 120,
      },
      {
        saleId: "v2",
        clientId: "c1",
        soldAt: d("2026-11-01T10:00:00Z"),
        soldOn: "2026-11-01",
        amount: 50,
      }, // before the send
      {
        saleId: "v3",
        clientId: "c2",
        soldAt: d("2026-11-12T10:00:00Z"),
        soldOn: "2026-11-12",
        amount: 80,
      }, // day 11: outside
      {
        saleId: "v4",
        clientId: "c3",
        soldAt: d("2026-11-02T10:00:00Z"),
        soldOn: "2026-11-02",
        amount: 80,
      }, // never sent
    ]
    const out = attributeSales(sent, sales)
    expect(out).toEqual([
      {
        recipientId: "r2",
        sendId: "s2",
        clientId: "c1",
        saleId: "v1",
        amount: 120,
        soldOn: "2026-11-06",
        daysAfter: 1,
      },
    ])
  })

  it("measures the sent group against the control", () => {
    const r = sendImpact({
      sent: 100,
      sentBuyers: 35,
      sentSales: 5000,
      control: 10,
      controlBuyers: 2,
      controlSales: 260,
      minControl: 30,
    })
    expect(r.sentRate).toBe(0.35)
    expect(r.controlRate).toBe(0.2)
    expect(r.incremental).toBe(2400)
    expect(r.orientative).toBe(true)
  })
})

describe("templates", () => {
  it("drops the sentences whose variables are missing", () => {
    const text =
      "Hola {nombre}, soy {cajero} de {comercio} {tienda}. A {mascota} se le acaba su {producto}. ¿Te lo separo?"
    expect(
      renderTemplate(text, {
        nombre: "Richard",
        cajero: "Rosa",
        comercio: "Mascota Veloz",
        tienda: "Pezet",
        mascota: "Sparky",
        producto: "Hill's 7 kg",
      }),
    ).toBe(
      "Hola Richard, soy Rosa de Mascota Veloz Pezet. A Sparky se le acaba su Hill's 7 kg. ¿Te lo separo?",
    )
    expect(
      renderTemplate(text, {
        nombre: "Richard",
        cajero: "Rosa",
        comercio: "Mascota Veloz",
        tienda: "Pezet",
        mascota: "tu perro",
      }),
    ).toBe("Hola Richard, soy Rosa de Mascota Veloz Pezet. ¿Te lo separo?")
  })

  it("names the pet when registered, else the species", () => {
    expect(petWord("Sparky", "perro")).toBe("Sparky")
    expect(petWord("  ", "gato")).toBe("tu gato")
    expect(petWord(null, null)).toBe("tu mascota")
    expect(
      petNameOf({ nombreMascota: "Luna" }, [
        { key: "nombreMascota", label: "Nombre de tu mascota" },
      ]),
    ).toBe("Luna")
    expect(petNameOf({ raza: "Beagle" }, [{ key: "raza", label: "Raza" }])).toBeNull()
    expect(petNameOf({ pet: "Max" }, null)).toBe("Max")
  })

  it("builds the WhatsApp link for Peruvian numbers", () => {
    expect(whatsappLink("998 170 096", "Hola Richard")).toBe(
      "https://wa.me/51998170096?text=Hola%20Richard",
    )
    expect(whatsappLink("+51 998170096", "x")).toBe("https://wa.me/51998170096?text=x")
    expect(whatsappLink("12345", "x")).toBeNull()
  })

  it("computes the variable fee", () => {
    expect(variableFee(7412.27, 5)).toBe(370.61)
    expect(variableFee(7412.27, null)).toBe(0)
  })
})
