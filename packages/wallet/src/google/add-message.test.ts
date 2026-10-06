import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { addLoyaltyObjectMessage } from "./add-message"

const fetchMock = vi.fn()

const PARAMS = {
  objectId: "3388000000012345678.cuik-dfrios-abc123",
  header: "D'frios",
  body: "Vito, tus 19 puntos vencen el miércoles",
  messageId: "campaign-1",
  accessToken: "token",
}

function response(status: number, body = "") {
  return { ok: status >= 200 && status < 300, status, text: async () => body } as Response
}

describe("addLoyaltyObjectMessage", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it("posts a TEXT_AND_NOTIFY message to the object's addMessage endpoint", async () => {
    fetchMock.mockResolvedValueOnce(response(200, "{}"))

    const result = await addLoyaltyObjectMessage(PARAMS)

    expect(result).toEqual({ ok: true, objectId: PARAMS.objectId, notified: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      "https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/3388000000012345678.cuik-dfrios-abc123/addMessage",
    )
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token")
    expect(JSON.parse(init.body as string)).toEqual({
      message: {
        id: "campaign-1",
        header: "D'frios",
        body: "Vito, tus 19 puntos vencen el miércoles",
        messageType: "TEXT_AND_NOTIFY",
      },
    })
  })

  it("falls back to a TEXT message when the notification quota is exhausted", async () => {
    fetchMock
      .mockResolvedValueOnce(response(429, '{"error":{"message":"QuotaExceededException"}}'))
      .mockResolvedValueOnce(response(200, "{}"))

    const result = await addLoyaltyObjectMessage(PARAMS)

    expect(result).toEqual({ ok: true, objectId: PARAMS.objectId, notified: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [, second] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(JSON.parse(second.body as string).message.messageType).toBe("TEXT")
  })

  it("returns the Google error on any other failure, without retrying", async () => {
    fetchMock.mockResolvedValueOnce(response(404, "object not found"))

    const result = await addLoyaltyObjectMessage(PARAMS)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(404)
      expect(result.error).toContain("404 object not found")
    }
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("sends TEXT only when notify is false", async () => {
    fetchMock.mockResolvedValueOnce(response(200, "{}"))

    const result = await addLoyaltyObjectMessage({ ...PARAMS, notify: false })

    expect(result).toEqual({ ok: true, objectId: PARAMS.objectId, notified: false })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string).message.messageType).toBe("TEXT")
  })
})
