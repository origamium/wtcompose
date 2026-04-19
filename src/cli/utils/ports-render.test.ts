import { describe, expect, it } from "vitest"
import type { WorktreePorts } from "../../types/index.js"
import { renderPortsJson, renderPortsPretty } from "./ports-render.js"

const makeRow = (overrides: Partial<WorktreePorts> = {}): WorktreePorts => ({
  path: "/tmp/wt/feature-auth",
  branch: "feature/auth",
  env: { APP_PORT: "3001", DB_PORT: "5433" },
  compose: {
    file: "docker-compose.yml",
    services: {
      web: { host_ports: [3001], container_ports: [80] },
      db: { host_ports: [5433], container_ports: [5432] },
    },
  },
  endpoints: ["http://localhost:3001", "http://localhost:5433"],
  ...overrides,
})

describe("renderPortsJson", () => {
  it("serializes a single worktree as an object", () => {
    const json = renderPortsJson(makeRow())
    const parsed = JSON.parse(json)
    expect(Array.isArray(parsed)).toBe(false)
    expect(parsed.branch).toBe("feature/auth")
    expect(parsed.env.APP_PORT).toBe("3001")
    expect(parsed.compose.services.web.host_ports).toEqual([3001])
    expect(parsed.endpoints).toContain("http://localhost:3001")
  })

  it("serializes an array of worktrees", () => {
    const rows = [makeRow(), makeRow({ branch: "feature/ui", path: "/tmp/wt/feature-ui" })]
    const json = renderPortsJson(rows)
    const parsed = JSON.parse(json)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(2)
  })

  it("pretty-prints with 2-space indent", () => {
    const json = renderPortsJson(makeRow())
    expect(json).toContain('\n  "path"')
  })
})

describe("renderPortsPretty", () => {
  it("returns placeholder on empty input", () => {
    expect(renderPortsPretty([])).toBe("No worktrees found\n")
  })

  it("renders branch, env, compose services, and endpoints", () => {
    const out = renderPortsPretty([makeRow()])
    expect(out).toContain("feature/auth")
    expect(out).toContain("path: /tmp/wt/feature-auth")
    expect(out).toContain("env:")
    expect(out).toContain("APP_PORT=3001")
    expect(out).toContain("DB_PORT=5433")
    expect(out).toContain("compose: docker-compose.yml")
    expect(out).toContain("web: 3001→80")
    expect(out).toContain("db: 5433→5432")
    expect(out).toContain("endpoints:")
    expect(out).toContain("http://localhost:3001")
  })

  it("separates multiple worktrees with a blank line", () => {
    const out = renderPortsPretty([
      makeRow(),
      makeRow({ branch: "feature/ui", path: "/tmp/wt/feature-ui" }),
    ])
    expect(out.split("\n\n").length).toBeGreaterThanOrEqual(2)
  })

  it("omits env/compose/endpoints blocks when empty", () => {
    const out = renderPortsPretty([
      makeRow({
        env: {},
        compose: { file: null, services: {} },
        endpoints: [],
      }),
    ])
    expect(out).not.toContain("env:")
    expect(out).not.toContain("compose:")
    expect(out).not.toContain("endpoints:")
    expect(out).toContain("feature/auth")
  })

  it("shows a placeholder for services without ports", () => {
    const out = renderPortsPretty([
      makeRow({
        compose: {
          file: "docker-compose.yml",
          services: { worker: { host_ports: [], container_ports: [] } },
        },
      }),
    ])
    expect(out).toContain("worker: (no ports)")
  })
})
