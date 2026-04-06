import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock resend
const mockSend = vi.fn()
vi.mock("resend", () => ({
  Resend: vi.fn(() => ({
    emails: {
      send: mockSend,
    },
  })),
}))

describe("sendEmail", () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    mockSend.mockReset()
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  const sampleTemplate = React.createElement("div", null, "Hello")

  it("calls Resend.emails.send with correct params", async () => {
    process.env.RESEND_API_KEY = "re_test_123"
    mockSend.mockResolvedValue({
      data: { id: "msg-123" },
      error: null,
    })

    const { sendEmail } = await import("./transport")

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test Subject",
      template: sampleTemplate,
    })

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.stringContaining("Cuik"),
        to: ["user@example.com"],
        subject: "Test Subject",
        react: sampleTemplate,
      }),
    )
    expect(result).toEqual({ id: "msg-123" })
  })

  it("returns { id } on success", async () => {
    process.env.RESEND_API_KEY = "re_test_123"
    mockSend.mockResolvedValue({
      data: { id: "msg-456" },
      error: null,
    })

    const { sendEmail } = await import("./transport")

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test",
      template: sampleTemplate,
    })

    expect(result).toEqual({ id: "msg-456" })
  })

  it("returns { error } when Resend returns an error", async () => {
    process.env.RESEND_API_KEY = "re_test_123"
    mockSend.mockResolvedValue({
      data: null,
      error: { message: "Invalid recipient" },
    })

    const { sendEmail } = await import("./transport")

    const result = await sendEmail({
      to: "invalid@",
      subject: "Test",
      template: sampleTemplate,
    })

    expect(result).toEqual({ error: "Invalid recipient" })
  })

  it("returns { error } when Resend throws", async () => {
    process.env.RESEND_API_KEY = "re_test_123"
    mockSend.mockRejectedValue(new Error("Network error"))

    const { sendEmail } = await import("./transport")

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test",
      template: sampleTemplate,
    })

    expect(result).toEqual({ error: "Network error" })
  })

  it("dev mode: logs to console and does not call Resend when no API key", async () => {
    delete process.env.RESEND_API_KEY

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const { sendEmail } = await import("./transport")

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test",
      template: sampleTemplate,
    })

    expect(mockSend).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[Email Dev Mode]"))
    expect(result).toHaveProperty("id")
    expect((result as { id: string }).id).toMatch(/^dev-/)
  })

  it("handles array of recipients", async () => {
    process.env.RESEND_API_KEY = "re_test_123"
    mockSend.mockResolvedValue({
      data: { id: "msg-789" },
      error: null,
    })

    const { sendEmail } = await import("./transport")

    await sendEmail({
      to: ["a@example.com", "b@example.com"],
      subject: "Test",
      template: sampleTemplate,
    })

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["a@example.com", "b@example.com"],
      }),
    )
  })

  it("uses custom from address when provided", async () => {
    process.env.RESEND_API_KEY = "re_test_123"
    mockSend.mockResolvedValue({
      data: { id: "msg-custom" },
      error: null,
    })

    const { sendEmail } = await import("./transport")

    await sendEmail({
      to: "user@example.com",
      subject: "Test",
      template: sampleTemplate,
      from: "Custom <custom@cuik.org>",
    })

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Custom <custom@cuik.org>",
      }),
    )
  })
})
