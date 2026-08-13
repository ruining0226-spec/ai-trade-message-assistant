export const CONFIG_CHECK_TIMEOUT_MS = 7_000;

export type VisionConfigMode = "volcengine" | "mock";
export type VisionConfigStatus = { configured: boolean; mode: VisionConfigMode };
export type VisionConfigCheckOutcome =
  | { kind: "success"; status: VisionConfigStatus }
  | { kind: "error"; reason: "request_failed" | "timeout" | "invalid_response" }
  | { kind: "stale" };

type ConfigFetch = (input: string, init: RequestInit) => Promise<Response>;

function parseConfigStatus(value: unknown): VisionConfigStatus | null {
  if (!value || typeof value !== "object") return null;
  const configured = "configured" in value ? value.configured : undefined;
  const mode = "mode" in value ? value.mode : undefined;
  if (typeof configured !== "boolean" || mode !== "volcengine" && mode !== "mock") return null;
  if (configured !== (mode === "volcengine")) return null;
  return { configured, mode };
}

export class VisionConfigCheckController {
  private runId = 0;
  private controller: AbortController | null = null;

  constructor(private readonly fetchConfig: ConfigFetch = (input, init) => fetch(input, init)) {}

  async check(timeoutMs = CONFIG_CHECK_TIMEOUT_MS): Promise<VisionConfigCheckOutcome> {
    const runId = ++this.runId;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await this.fetchConfig("/api/analyze-customer", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("CONFIG_STATUS_HTTP_ERROR");
      const status = parseConfigStatus(await response.json());
      if (this.runId !== runId) return { kind: "stale" };
      return status ? { kind: "success", status } : { kind: "error", reason: "invalid_response" };
    } catch {
      if (this.runId !== runId) return { kind: "stale" };
      return { kind: "error", reason: timedOut ? "timeout" : "request_failed" };
    } finally {
      clearTimeout(timeout);
      if (this.runId === runId) this.controller = null;
    }
  }

  cancel() {
    this.runId += 1;
    this.controller?.abort();
    this.controller = null;
  }
}
