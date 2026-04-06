import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock minio before importing storage
vi.mock("minio", () => {
  const mockClient = {
    bucketExists: vi.fn(),
    makeBucket: vi.fn(),
    putObject: vi.fn(),
    getObject: vi.fn(),
    statObject: vi.fn(),
    removeObject: vi.fn(),
  }
  return {
    Client: vi.fn(() => mockClient),
    __mockClient: mockClient,
  }
})

// Mock crypto.randomUUID to control UUID output
const mockUUIDs: string[] = []
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>()
  return {
    ...actual,
    randomUUID: () => {
      if (mockUUIDs.length > 0) {
        return mockUUIDs.shift() as string
      }
      return "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    },
  }
})

// Mock node:fs/promises to avoid real filesystem writes in local fallback tests
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>()
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  }
})

describe("storage", () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = {
      ...originalEnv,
      MINIO_ENDPOINT: "localhost:9000",
      MINIO_ACCESS_KEY: "test-access-key",
      MINIO_SECRET_KEY: "test-secret-key",
      MINIO_BUCKET: "test-bucket",
      BETTER_AUTH_URL: "https://app.cuik.org",
    }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
    mockUUIDs.length = 0
  })

  describe("generateAssetKey", () => {
    it("produces correct format: tenants/{id}/assets/{uuid}.{ext}", async () => {
      const { generateAssetKey } = await import("./storage")

      const key = generateAssetKey("tenant-123", "png")

      expect(key).toMatch(/^tenants\/tenant-123\/assets\/[a-f0-9-]+\.png$/)
    })

    it("uses the provided extension", async () => {
      const { generateAssetKey } = await import("./storage")

      const key = generateAssetKey("tenant-123", "jpg")

      expect(key.endsWith(".jpg")).toBe(true)
    })

    it("generates unique keys on successive calls", async () => {
      mockUUIDs.push("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222")
      const { generateAssetKey } = await import("./storage")

      const key1 = generateAssetKey("tenant-123", "png")
      const key2 = generateAssetKey("tenant-123", "png")

      expect(key1).not.toBe(key2)
    })

    it("scopes key under tenant ID", async () => {
      const { generateAssetKey } = await import("./storage")

      const key = generateAssetKey("abc-def-456", "webp")

      expect(key.startsWith("tenants/abc-def-456/assets/")).toBe(true)
    })
  })

  describe("getPublicUrl", () => {
    it("returns correct proxy URL format", async () => {
      const { getPublicUrl } = await import("./storage")

      const url = getPublicUrl("tenants/t1/assets/img.png")

      expect(url).toBe("/api/assets/tenants/t1/assets/img.png")
    })

    it("returns relative path regardless of BETTER_AUTH_URL", async () => {
      process.env.BETTER_AUTH_URL = "https://custom.domain.com"
      const { getPublicUrl } = await import("./storage")

      const url = getPublicUrl("some/key.png")

      expect(url).toBe("/api/assets/some/key.png")
    })

    it("returns relative path when BETTER_AUTH_URL is not set", async () => {
      delete process.env.BETTER_AUTH_URL
      const { getPublicUrl } = await import("./storage")

      const url = getPublicUrl("some/key.png")

      expect(url).toBe("/api/assets/some/key.png")
    })
  })

  describe("env validation", () => {
    it("warns and falls back to local storage when MINIO vars are missing", async () => {
      delete process.env.MINIO_ENDPOINT
      delete process.env.MINIO_ACCESS_KEY
      delete process.env.MINIO_SECRET_KEY

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      vi.spyOn(console, "log").mockImplementation(() => {})

      const { uploadAsset } = await import("./storage")

      const url = await uploadAsset("key", Buffer.from("test"), "image/png")

      expect(url).toBe("/api/assets/key")
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[Storage] Disabled"))
    })

    it("works when all required env vars are present", async () => {
      // Should not throw during module import
      const { getPublicUrl } = await import("./storage")
      expect(getPublicUrl("test")).toBeTruthy()
    })
  })
})
