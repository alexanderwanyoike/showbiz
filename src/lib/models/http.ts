import { invoke } from "@tauri-apps/api/core";

interface TauriHttpResponse {
  status: number;
  body_b64: string;
}

class TauriResponse {
  readonly ok: boolean;
  readonly status: number;
  private readonly _b64: string;
  private _bytes: Uint8Array | null = null;

  constructor(status: number, b64: string) {
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this._b64 = b64;
  }

  private getBytes(): Uint8Array {
    if (!this._bytes) {
      const binary = atob(this._b64);
      this._bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        this._bytes[i] = binary.charCodeAt(i);
      }
    }
    return this._bytes;
  }

  async text(): Promise<string> {
    return new TextDecoder().decode(this.getBytes());
  }

  async json(): Promise<unknown> {
    return JSON.parse(await this.text());
  }

  async blob(): Promise<Blob> {
    return new Blob([this.getBytes()]);
  }
}

export async function fetch(
  input: string | URL,
  init?: RequestInit
): Promise<TauriResponse> {
  const url = typeof input === "string" ? input : input.toString();
  const method = (init?.method ?? "GET").toUpperCase();

  const headers: [string, string][] = [];
  if (init?.headers) {
    const h = init.headers;
    if (h instanceof Headers) {
      h.forEach((value, key) => headers.push([key, value]));
    } else if (Array.isArray(h)) {
      for (const [k, v] of h as [string, string][]) headers.push([k, v]);
    } else {
      for (const [k, v] of Object.entries(h as Record<string, string>)) {
        headers.push([k, v]);
      }
    }
  }

  const body =
    init?.body !== undefined && init?.body !== null
      ? String(init.body)
      : null;

  const result = await invoke<TauriHttpResponse>("http_request", {
    url,
    method,
    headers,
    body,
  });

  return new TauriResponse(result.status, result.body_b64);
}
