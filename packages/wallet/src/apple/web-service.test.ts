import { describe, expect, it, vi } from "vitest"
import type { WebServiceDeps } from "../shared/types"
import {
  handleGetPass,
  handleGetSerials,
  handleLog,
  handleRegisterDevice,
  handleUnregisterDevice,
} from "./web-service"

// ─── Mock Deps Factory ──────────────────────────────────────────────

function createMockDeps(overrides: Partial<WebServiceDeps> = {}): WebServiceDeps {
  return {
    findDeviceRegistration: vi.fn().mockResolvedValue(null),
    insertDeviceRegistration: vi.fn().mockResolvedValue(undefined),
    deleteDeviceRegistration: vi.fn().mockResolvedValue(undefined),
    getSerialsForDevice: vi.fn().mockResolvedValue({ serialNumbers: [], lastUpdated: "" }),
    getPassInstance: vi.fn().mockResolvedValue(null),
    verifyAuthToken: vi.fn().mockReturnValue(true),
    ...overrides,
  }
}

const VALID_AUTH = "ApplePass abc123"
const SERIAL = "cuik:cafe:a1b2c3d4e5f6"
const DEVICE_LIB_ID = "device-lib-123"
const PASS_TYPE_ID = "pass.app.cuik.test"

// ─── handleRegisterDevice ──────────────────────────────────────────

describe("handleRegisterDevice", () => {
  it("returns 201 for new registration", async () => {
    const deps = createMockDeps()
    const result = await handleRegisterDevice(deps, {
      deviceLibId: DEVICE_LIB_ID,
      passTypeId: PASS_TYPE_ID,
      serialNumber: SERIAL,
      pushToken: "push-token-abc",
      authHeader: VALID_AUTH,
    })
    expect(result.status).toBe(201)
  })

  it("returns 200 for existing registration", async () => {
    const deps = createMockDeps({
      findDeviceRegistration: vi.fn().mockResolvedValue({ pushToken: "old-token" }),
    })
    const result = await handleRegisterDevice(deps, {
      deviceLibId: DEVICE_LIB_ID,
      passTypeId: PASS_TYPE_ID,
      serialNumber: SERIAL,
      pushToken: "push-token-abc",
      authHeader: VALID_AUTH,
    })
    expect(result.status).toBe(200)
  })

  it("returns 401 for invalid auth token", async () => {
    const deps = createMockDeps({
      verifyAuthToken: vi.fn().mockReturnValue(false),
    })
    const result = await handleRegisterDevice(deps, {
      deviceLibId: DEVICE_LIB_ID,
      passTypeId: PASS_TYPE_ID,
      serialNumber: SERIAL,
      pushToken: "push-token-abc",
      authHeader: VALID_AUTH,
    })
    expect(result.status).toBe(401)
  })

  it("returns 401 for missing auth header", async () => {
    const deps = createMockDeps()
    const result = await handleRegisterDevice(deps, {
      deviceLibId: DEVICE_LIB_ID,
      passTypeId: PASS_TYPE_ID,
      serialNumber: SERIAL,
      pushToken: "push-token-abc",
      authHeader: "",
    })
    expect(result.status).toBe(401)
  })

  it("returns 400 for missing pushToken", async () => {
    const deps = createMockDeps()
    const result = await handleRegisterDevice(deps, {
      deviceLibId: DEVICE_LIB_ID,
      passTypeId: PASS_TYPE_ID,
      serialNumber: SERIAL,
      pushToken: "",
      authHeader: VALID_AUTH,
    })
    expect(result.status).toBe(400)
  })
})

// ─── handleUnregisterDevice ─────────────────────────────────────────

describe("handleUnregisterDevice", () => {
  it("returns 200 on success", async () => {
    const deps = createMockDeps()
    const result = await handleUnregisterDevice(deps, {
      deviceLibId: DEVICE_LIB_ID,
      serialNumber: SERIAL,
      authHeader: VALID_AUTH,
    })
    expect(result.status).toBe(200)
    expect(deps.deleteDeviceRegistration).toHaveBeenCalledWith(DEVICE_LIB_ID, SERIAL)
  })

  it("returns 401 for bad auth", async () => {
    const deps = createMockDeps({
      verifyAuthToken: vi.fn().mockReturnValue(false),
    })
    const result = await handleUnregisterDevice(deps, {
      deviceLibId: DEVICE_LIB_ID,
      serialNumber: SERIAL,
      authHeader: VALID_AUTH,
    })
    expect(result.status).toBe(401)
  })
})

// ─── handleGetSerials ────────────────────────────────────────────────

describe("handleGetSerials", () => {
  it("returns 200 with serial numbers when found", async () => {
    const deps = createMockDeps({
      getSerialsForDevice: vi.fn().mockResolvedValue({
        serialNumbers: [SERIAL],
        lastUpdated: "2026-03-01T00:00:00Z",
      }),
    })
    const result = await handleGetSerials(deps, {
      deviceLibId: DEVICE_LIB_ID,
      passTypeId: PASS_TYPE_ID,
    })
    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      serialNumbers: [SERIAL],
      lastUpdated: "2026-03-01T00:00:00Z",
    })
  })

  it("returns 204 when no serials found", async () => {
    const deps = createMockDeps()
    const result = await handleGetSerials(deps, {
      deviceLibId: DEVICE_LIB_ID,
      passTypeId: PASS_TYPE_ID,
    })
    expect(result.status).toBe(204)
  })

  it("passes updatedSince to deps", async () => {
    const deps = createMockDeps()
    await handleGetSerials(deps, {
      deviceLibId: DEVICE_LIB_ID,
      passTypeId: PASS_TYPE_ID,
      updatedSince: "2026-01-01T00:00:00Z",
    })
    expect(deps.getSerialsForDevice).toHaveBeenCalledWith(
      DEVICE_LIB_ID,
      PASS_TYPE_ID,
      "2026-01-01T00:00:00Z",
    )
  })
})

// ─── handleGetPass ───────────────────────────────────────────────────

describe("handleGetPass", () => {
  it("returns 401 for bad auth", async () => {
    const deps = createMockDeps({
      verifyAuthToken: vi.fn().mockReturnValue(false),
    })
    const result = await handleGetPass(deps, {
      passTypeId: PASS_TYPE_ID,
      serialNumber: SERIAL,
      authHeader: VALID_AUTH,
    })
    expect(result.status).toBe(401)
  })

  it("returns 404 when pass instance not found", async () => {
    const deps = createMockDeps()
    const result = await handleGetPass(deps, {
      passTypeId: PASS_TYPE_ID,
      serialNumber: SERIAL,
      authHeader: VALID_AUTH,
    })
    expect(result.status).toBe(404)
  })

  it("returns 304 when If-None-Match matches stored ETag", async () => {
    const lastUpdated = new Date("2026-03-01T10:00:00Z")
    const deps = createMockDeps({
      getPassInstance: vi.fn().mockResolvedValue({
        authToken: "token",
        lastUpdatedAt: lastUpdated,
        etag: '"some-etag"',
        clientId: "c1",
        designId: "d1",
        campaignMessage: null,
      }),
    })
    const result = await handleGetPass(deps, {
      passTypeId: PASS_TYPE_ID,
      serialNumber: SERIAL,
      authHeader: VALID_AUTH,
      ifNoneMatch: '"some-etag"',
    })
    expect(result.status).toBe(304)
    expect(result.headers?.ETag).toBe('"some-etag"')
  })

  it("returns 200 with passInstance data when pass needs update", async () => {
    const lastUpdated = new Date("2026-03-01T10:00:00Z")
    const deps = createMockDeps({
      getPassInstance: vi.fn().mockResolvedValue({
        authToken: "token",
        lastUpdatedAt: lastUpdated,
        etag: null,
        clientId: "client-1",
        designId: "design-1",
        campaignMessage: null,
      }),
    })
    const result = await handleGetPass(deps, {
      passTypeId: PASS_TYPE_ID,
      serialNumber: SERIAL,
      authHeader: VALID_AUTH,
    })
    expect(result.status).toBe(200)
    const body = result.body as { passInstance: { clientId: string; designId: string } }
    expect(body.passInstance.clientId).toBe("client-1")
    expect(body.passInstance.designId).toBe("design-1")
  })

  it("returns 200 when If-None-Match does not match stored ETag", async () => {
    const lastUpdated = new Date("2026-03-01T12:00:00Z")
    const deps = createMockDeps({
      getPassInstance: vi.fn().mockResolvedValue({
        authToken: "token",
        lastUpdatedAt: lastUpdated,
        etag: '"current-etag"',
        clientId: "c1",
        designId: "d1",
        campaignMessage: null,
      }),
    })
    const result = await handleGetPass(deps, {
      passTypeId: PASS_TYPE_ID,
      serialNumber: SERIAL,
      authHeader: VALID_AUTH,
      ifNoneMatch: '"old-etag"',
    })
    expect(result.status).toBe(200)
  })

  it("returns 200 when no ETag stored (etag is null)", async () => {
    const deps = createMockDeps({
      getPassInstance: vi.fn().mockResolvedValue({
        authToken: "token",
        lastUpdatedAt: new Date(),
        etag: null,
        clientId: "c1",
        designId: "d1",
        campaignMessage: null,
      }),
    })
    const result = await handleGetPass(deps, {
      passTypeId: PASS_TYPE_ID,
      serialNumber: SERIAL,
      authHeader: VALID_AUTH,
      ifNoneMatch: '"some-etag"',
    })
    expect(result.status).toBe(200)
  })
})

// ─── handleLog ───────────────────────────────────────────────────────

describe("handleLog", () => {
  it("returns 200 always", () => {
    const result = handleLog({ logs: ["error 1", "error 2"] })
    expect(result.status).toBe(200)
  })

  it("handles empty body", () => {
    const result = handleLog({})
    expect(result.status).toBe(200)
  })

  it("handles null body", () => {
    const result = handleLog(null)
    expect(result.status).toBe(200)
  })
})
