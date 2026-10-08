import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { addLoyaltyObjectMessage } from "./add-message"

const fetchMock = vi.fn()

const PARAMS = {
  objectId: "3388000000012345678.cuik-dfrios-abc123",
  header: "D'frios",
  body: "Vito, tus 19 puntos vencen el miércoles",
  messageId: "campaign-1",
  accessToken: "token",
  replacePrevious: false,
}
const OBJECT_URL =
  "https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/3388000000012345678.cuik-dfrios-abc123"

function response(status: number, body = "") {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  } as Response
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

  it("retries once on a per-minute rate limit and keeps the notification", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response(
          429,
          '{"error":{"message":"Rate Limit Exceeded","errors":[{"reason":"rateLimitExceeded"}]}}',
        ),
      )
      .mockResolvedValueOnce(response(200, "{}"))

    const result = await addLoyaltyObjectMessage(PARAMS)

    expect(result).toEqual({ ok: true, objectId: PARAMS.objectId, notified: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [, second] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(JSON.parse(second.body as string).message.messageType).toBe("TEXT_AND_NOTIFY")
  })

  it("fails (no silent fallback) when the rate limit persists after the retry", async () => {
    fetchMock
      .mockResolvedValueOnce(response(429, '{"error":{"errors":[{"reason":"rateLimitExceeded"}]}}'))
      .mockResolvedValueOnce(response(429, '{"error":{"errors":[{"reason":"rateLimitExceeded"}]}}'))

    const result = await addLoyaltyObjectMessage(PARAMS)

    expect(result.ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
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

  describe("replacePrevious (default)", () => {
    it("adds directly when the pass has no messages (GET + addMessage only)", async () => {
      fetchMock
        .mockResolvedValueOnce(
          response(200, JSON.stringify({ id: PARAMS.objectId, state: "ACTIVE" })),
        )
        .mockResolvedValueOnce(response(200, "{}"))

      const result = await addLoyaltyObjectMessage({ ...PARAMS, replacePrevious: true })

      expect(result).toEqual({ ok: true, objectId: PARAMS.objectId, notified: true })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock.mock.calls[0]?.[0]).toBe(OBJECT_URL)
      expect(fetchMock.mock.calls[1]?.[0]).toBe(`${OBJECT_URL}/addMessage`)
    })

    it("wipes previous messages with a full PUT before adding the new one", async () => {
      const stored = {
        id: PARAMS.objectId,
        classId: "3388000000012345678.Dfrios-Loyalty",
        state: "ACTIVE",
        accountName: "Vito",
        kind: "walletobjects#loyaltyObject",
        hasUsers: true,
        classReference: { id: "3388000000012345678.Dfrios-Loyalty" },
        messages: [
          { id: "campaign-0", header: "D'frios", body: "Promo vieja", messageType: "TEXT" },
        ],
      }
      fetchMock
        .mockResolvedValueOnce(response(200, JSON.stringify(stored)))
        .mockResolvedValueOnce(response(200, "{}"))
        .mockResolvedValueOnce(response(200, "{}"))

      const result = await addLoyaltyObjectMessage({ ...PARAMS, replacePrevious: true })

      expect(result).toEqual({ ok: true, objectId: PARAMS.objectId, notified: true })
      expect(fetchMock).toHaveBeenCalledTimes(3)
      const [putUrl, putInit] = fetchMock.mock.calls[1] as [string, RequestInit]
      expect(putUrl).toBe(OBJECT_URL)
      expect(putInit.method).toBe("PUT")
      const putBody = JSON.parse(putInit.body as string)
      expect(putBody.messages).toBeUndefined()
      expect(putBody.classReference).toBeUndefined()
      expect(putBody.hasUsers).toBeUndefined()
      expect(putBody.kind).toBeUndefined()
      expect(putBody.accountName).toBe("Vito")
      expect(putBody.classId).toBe("3388000000012345678.Dfrios-Loyalty")
      expect(fetchMock.mock.calls[2]?.[0]).toBe(`${OBJECT_URL}/addMessage`)
    })

    it("does not add the message when clearing fails", async () => {
      fetchMock.mockResolvedValueOnce(response(404, "object not found"))

      const result = await addLoyaltyObjectMessage({ ...PARAMS, replacePrevious: true })

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain("GET loyalty object failed: 404")
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  it("sends TEXT only when notify is false", async () => {
    fetchMock.mockResolvedValueOnce(response(200, "{}"))

    const result = await addLoyaltyObjectMessage({ ...PARAMS, notify: false })

    expect(result).toEqual({ ok: true, objectId: PARAMS.objectId, notified: false })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string).message.messageType).toBe("TEXT")
  })
})
