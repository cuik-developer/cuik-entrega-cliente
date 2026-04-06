import { render } from "@react-email/components"
import React from "react"
import { describe, expect, it } from "vitest"

import { BienvenidaComercio } from "./bienvenida-comercio"
import { Credenciales } from "./credenciales"
import { RewardCanjeado } from "./reward-canjeado"
import { SolicitudRecibida } from "./solicitud-recibida"

describe("email templates", () => {
  describe("SolicitudRecibida", () => {
    const props = {
      businessName: "Café del Centro",
      contactName: "María García",
      contactEmail: "maria@cafedelcentro.com",
      phone: "+54 11 1234-5678",
      message: "Quiero implementar fidelización.",
    }

    it("renders without errors", async () => {
      const html = await render(React.createElement(SolicitudRecibida, props))

      expect(html).toBeTruthy()
      expect(typeof html).toBe("string")
    })

    it("contains business name", async () => {
      const html = await render(React.createElement(SolicitudRecibida, props))

      expect(html).toContain("Café del Centro")
    })

    it("contains contact name", async () => {
      const html = await render(React.createElement(SolicitudRecibida, props))

      expect(html).toContain("María García")
    })

    it("contains Cuik branding", async () => {
      const html = await render(React.createElement(SolicitudRecibida, props))

      expect(html).toContain("Cuik")
      expect(html).toContain("Fidelización Digital")
    })

    it("contains solicitud heading", async () => {
      const html = await render(React.createElement(SolicitudRecibida, props))

      expect(html).toContain("Nueva solicitud recibida")
    })
  })

  describe("BienvenidaComercio", () => {
    const props = {
      businessName: "Café del Centro",
      adminName: "María",
      email: "maria@cafedelcentro.com",
      password: "tmp-Kx9mPq2r",
      loginUrl: "https://app.cuik.org/login",
      trialDays: 7,
    }

    it("renders without errors", async () => {
      const html = await render(React.createElement(BienvenidaComercio, props))

      expect(html).toBeTruthy()
      expect(typeof html).toBe("string")
    })

    it("contains business name", async () => {
      const html = await render(React.createElement(BienvenidaComercio, props))

      expect(html).toContain("Café del Centro")
    })

    it("contains credentials", async () => {
      const html = await render(React.createElement(BienvenidaComercio, props))

      expect(html).toContain("maria@cafedelcentro.com")
      expect(html).toContain("tmp-Kx9mPq2r")
    })

    it("contains login URL", async () => {
      const html = await render(React.createElement(BienvenidaComercio, props))

      expect(html).toContain("https://app.cuik.org/login")
    })

    it("contains Cuik branding", async () => {
      const html = await render(React.createElement(BienvenidaComercio, props))

      expect(html).toContain("Cuik")
      expect(html).toContain("Bienvenido")
    })
  })

  describe("Credenciales", () => {
    const props = {
      businessName: "Café del Centro",
      adminName: "María",
      email: "maria@cafedelcentro.com",
      password: "tmp-Kx9mPq2r",
      loginUrl: "https://app.cuik.org/login",
    }

    it("renders without errors", async () => {
      const html = await render(React.createElement(Credenciales, props))

      expect(html).toBeTruthy()
      expect(typeof html).toBe("string")
    })

    it("contains business name", async () => {
      const html = await render(React.createElement(Credenciales, props))

      expect(html).toContain("Café del Centro")
    })

    it("contains credentials", async () => {
      const html = await render(React.createElement(Credenciales, props))

      expect(html).toContain("maria@cafedelcentro.com")
      expect(html).toContain("tmp-Kx9mPq2r")
    })

    it("contains login URL", async () => {
      const html = await render(React.createElement(Credenciales, props))

      expect(html).toContain("https://app.cuik.org/login")
    })

    it("contains Cuik branding", async () => {
      const html = await render(React.createElement(Credenciales, props))

      expect(html).toContain("Cuik")
    })
  })

  describe("RewardCanjeado", () => {
    const props = {
      clientName: "Juan",
      businessName: "Café del Centro",
      rewardDescription: "Café con leche gratis",
      redeemDate: "13 de marzo de 2026",
    }

    it("renders without errors", async () => {
      const html = await render(React.createElement(RewardCanjeado, props))

      expect(html).toBeTruthy()
      expect(typeof html).toBe("string")
    })

    it("contains client name", async () => {
      const html = await render(React.createElement(RewardCanjeado, props))

      expect(html).toContain("Juan")
    })

    it("contains business name", async () => {
      const html = await render(React.createElement(RewardCanjeado, props))

      expect(html).toContain("Café del Centro")
    })

    it("contains reward description", async () => {
      const html = await render(React.createElement(RewardCanjeado, props))

      expect(html).toContain("Café con leche gratis")
    })

    it("contains Cuik branding", async () => {
      const html = await render(React.createElement(RewardCanjeado, props))

      expect(html).toContain("Cuik")
      expect(html).toContain("Fidelización Digital")
    })
  })
})
