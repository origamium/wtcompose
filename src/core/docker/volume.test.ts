import { describe, expect, it } from "vitest"
import { formatBytes, formatEta } from "./volume"

describe("Volume Utilities", () => {
  describe("formatBytes", () => {
    it("should format 0 bytes", () => {
      expect(formatBytes(0)).toBe("0 B")
    })

    it("should format bytes", () => {
      expect(formatBytes(500)).toBe("500.00 B")
    })

    it("should format kilobytes", () => {
      expect(formatBytes(1024)).toBe("1.00 KB")
      expect(formatBytes(2048)).toBe("2.00 KB")
    })

    it("should format megabytes", () => {
      expect(formatBytes(1024 * 1024)).toBe("1.00 MB")
      expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.50 MB")
    })

    it("should format gigabytes", () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB")
    })
  })

  describe("formatEta", () => {
    it("should return placeholder for 0 or negative", () => {
      expect(formatEta(0)).toBe("--:--")
      expect(formatEta(-1)).toBe("--:--")
    })

    it("should format seconds only", () => {
      expect(formatEta(45)).toBe("0:45")
    })

    it("should format minutes and seconds", () => {
      expect(formatEta(90)).toBe("1:30")
      expect(formatEta(125)).toBe("2:05")
    })

    it("should format hours, minutes and seconds", () => {
      expect(formatEta(3661)).toBe("1:01:01")
      expect(formatEta(7325)).toBe("2:02:05")
    })
  })
})
