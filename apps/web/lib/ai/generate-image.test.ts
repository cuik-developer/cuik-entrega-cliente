import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock child_process.execFile
const mockExecFile = vi.fn()
vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}))

// Mock fs/promises
const mockMkdir = vi.fn().mockResolvedValue(undefined)
const mockReadFile = vi.fn()
const mockReaddir = vi.fn()
const mockRm = vi.fn().mockResolvedValue(undefined)

vi.mock("node:fs/promises", () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
  rm: (...args: unknown[]) => mockRm(...args),
}))

// Mock crypto.randomUUID
vi.mock("node:crypto", () => ({
  randomUUID: () => "test-uuid-1234",
}))

// Mock sharp — implementation uses it for resize and green screen removal
const mockSharpInstance = {
  resize: vi.fn().mockReturnThis(),
  png: vi.fn().mockReturnThis(),
  toBuffer: vi.fn(),
  ensureAlpha: vi.fn().mockReturnThis(),
  raw: vi.fn().mockReturnThis(),
}
vi.mock("sharp", () => ({
  default: vi.fn(() => mockSharpInstance),
}))

import { generateImage } from "./generate-image"

describe("generateImage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-establish default return values after clearAllMocks
    mockMkdir.mockResolvedValue(undefined)
    mockRm.mockResolvedValue(undefined)
    // Re-establish sharp mock chain after clearAllMocks
    mockSharpInstance.resize.mockReturnThis()
    mockSharpInstance.png.mockReturnThis()
    mockSharpInstance.ensureAlpha.mockReturnThis()
    mockSharpInstance.raw.mockReturnThis()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function setupSuccessfulExec() {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: Record<string, unknown>,
        callback: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(null, "Generated successfully", "")
      },
    )

    const fakeBuffer = Buffer.from("fake-png-data")
    const resizedBuffer = Buffer.from("fake-resized-data")
    mockReaddir.mockResolvedValue(["gen-test-uui.png"])
    mockReadFile.mockResolvedValue(fakeBuffer)
    // sharp().resize().png().toBuffer() returns the resized buffer
    mockSharpInstance.toBuffer.mockResolvedValue(resizedBuffer)

    return resizedBuffer
  }

  it("calls nano-banana with correct arguments", async () => {
    const fakeBuffer = setupSuccessfulExec()

    const result = await generateImage("a beautiful sunset", {
      width: 750,
      height: 246,
    })

    // Verify execFile was called
    expect(mockExecFile).toHaveBeenCalledTimes(1)
    const [cmd, args, opts] = mockExecFile.mock.calls[0]

    expect(cmd).toBe("nano-banana")
    expect(args).toContain("a beautiful sunset")
    expect(args).toContain("-o")
    expect(args).toContain("-s")
    expect(args).toContain("-a")
    expect(opts.timeout).toBe(60_000)
    expect(opts.cwd).toEqual(expect.stringContaining("cuik-gen-"))

    expect(result).toEqual(fakeBuffer)
  })

  it("passes -s 1K for large dimensions (max > 512)", async () => {
    setupSuccessfulExec()

    await generateImage("test prompt", { width: 750, height: 246 })

    const [, args] = mockExecFile.mock.calls[0]
    const sizeIdx = args.indexOf("-s")
    expect(args[sizeIdx + 1]).toBe("1K")
  })

  it("passes -s 512 for small dimensions (max <= 512)", async () => {
    setupSuccessfulExec()

    await generateImage("test prompt", { width: 256, height: 256 })

    const [, args] = mockExecFile.mock.calls[0]
    const sizeIdx = args.indexOf("-s")
    expect(args[sizeIdx + 1]).toBe("512")
  })

  it("passes -a aspect ratio flag with closest valid ratio", async () => {
    setupSuccessfulExec()

    await generateImage("test prompt", { width: 750, height: 246 })

    const [, args] = mockExecFile.mock.calls[0]
    expect(args).toContain("-a")
    // 750/246 ≈ 3.05, closest valid nano-banana ratio is "21:9" (2.33)
    expect(args).toContain("21:9")
  })

  it("passes -t flag when transparent is true", async () => {
    setupSuccessfulExec()
    // removeGreenScreen calls sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    // which returns { data, info }
    const fakePixelData = Buffer.alloc(256 * 256 * 4, 255) // all white opaque pixels
    mockSharpInstance.toBuffer
      .mockResolvedValueOnce({
        data: fakePixelData,
        info: { width: 256, height: 256, channels: 4 },
      })
      // second sharp() call in removeGreenScreen for final PNG output
      .mockResolvedValueOnce(Buffer.from("fake-transparent-data"))
      // third call is resizeToExact
      .mockResolvedValueOnce(Buffer.from("fake-resized-transparent"))

    await generateImage("test prompt", {
      width: 256,
      height: 256,
      transparent: true,
    })

    const [, args] = mockExecFile.mock.calls[0]
    expect(args).toContain("-t")
  })

  it("does not pass -t flag when transparent is false/omitted", async () => {
    setupSuccessfulExec()

    await generateImage("test prompt", { width: 256, height: 256 })

    const [, args] = mockExecFile.mock.calls[0]
    expect(args).not.toContain("-t")
  })

  it("reads the output file and returns buffer", async () => {
    const fakeBuffer = setupSuccessfulExec()

    const result = await generateImage("test prompt", {
      width: 256,
      height: 256,
    })

    expect(mockReaddir).toHaveBeenCalledTimes(1)
    expect(mockReadFile).toHaveBeenCalledTimes(1)
    expect(result).toEqual(fakeBuffer)
  })

  it("cleans up temp directory on success", async () => {
    setupSuccessfulExec()

    await generateImage("test prompt", { width: 256, height: 256 })

    expect(mockRm).toHaveBeenCalledWith(expect.stringContaining("cuik-gen-"), {
      recursive: true,
      force: true,
    })
  })

  it("cleans up temp directory on error", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: Record<string, unknown>,
        callback: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        const error = new Error("CLI failed") as Error & { code?: string }
        callback(error, "", "some error")
      },
    )

    await expect(generateImage("test prompt", { width: 256, height: 256 })).rejects.toThrow()

    expect(mockRm).toHaveBeenCalledWith(expect.stringContaining("cuik-gen-"), {
      recursive: true,
      force: true,
    })
  })

  it("throws clear error when CLI is not found (ENOENT)", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: Record<string, unknown>,
        callback: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        const error = new Error("spawn ENOENT") as Error & { code?: string }
        error.code = "ENOENT"
        callback(error, "", "")
      },
    )

    await expect(generateImage("test prompt", { width: 256, height: 256 })).rejects.toThrow(
      /not installed|not found/,
    )
  })

  it("throws timeout error when CLI takes too long", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: Record<string, unknown>,
        callback: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        const error = new Error("timed out") as Error & {
          killed?: boolean
          signal?: string
        }
        error.killed = true
        error.signal = "SIGTERM"
        callback(error, "", "")
      },
    )

    await expect(generateImage("test prompt", { width: 256, height: 256 })).rejects.toThrow(
      /timed out/,
    )
  })

  it("throws error when no output file is produced", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: Record<string, unknown>,
        callback: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        callback(null, "ok", "")
      },
    )
    mockReaddir.mockResolvedValue([])

    await expect(generateImage("test prompt", { width: 256, height: 256 })).rejects.toThrow(
      /did not produce an output file/,
    )
  })

  it("throws content filtered error when safety keywords in output", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: Record<string, unknown>,
        callback: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        const error = new Error("failed")
        callback(error, "Content was blocked by safety filter", "")
      },
    )

    await expect(generateImage("test prompt", { width: 256, height: 256 })).rejects.toThrow(
      /Content filtered/,
    )
  })
})
