import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchWithRetry,
  HttpRequestError,
} from "../../../src/shared/utils/httpClient.js";

type FetchImpl = (url: string | URL, init?: RequestInit) => Promise<Response> | Response;

function mockFetch(impl: FetchImpl) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchWithRetry", () => {
  it("resuelve con la respuesta en el primer intento", async () => {
    const fetchMock = mockFetch(async () => new Response("ok", { status: 200 }));

    const res = await fetchWithRetry(
      "https://api.example.com",
      { method: "GET" },
      { timeoutMs: 1000 },
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reintenta ante un 5xx y usa la respuesta exitosa posterior", async () => {
    const fetchMock = mockFetch(async () => new Response("ok", { status: 200 }));
    fetchMock
      .mockResolvedValueOnce(new Response("err", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const res = await fetchWithRetry(
      "https://api.example.com",
      {},
      { timeoutMs: 1000, retries: 2, baseDelayMs: 5 },
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("devuelve el 5xx final tras agotar los reintentos", async () => {
    const fetchMock = mockFetch(async () => new Response("err", { status: 500 }));

    const res = await fetchWithRetry(
      "https://api.example.com",
      {},
      { timeoutMs: 1000, retries: 1, baseDelayMs: 5 },
    );

    expect(res.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("no reintenta códigos 4xx", async () => {
    const fetchMock = mockFetch(async () => new Response("bad", { status: 400 }));

    const res = await fetchWithRetry(
      "https://api.example.com",
      {},
      { timeoutMs: 1000, retries: 2, baseDelayMs: 5 },
    );

    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reintenta errores de red y luego triunfa", async () => {
    const fetchMock = mockFetch(async () => new Response("ok", { status: 200 }));
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    const res = await fetchWithRetry(
      "https://api.example.com",
      {},
      { timeoutMs: 1000, retries: 2, baseDelayMs: 5 },
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lanza HttpRequestError al agotar los reintentos por error de red", async () => {
    const fetchMock = mockFetch(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(
      fetchWithRetry(
        "https://api.example.com",
        {},
        { timeoutMs: 1000, retries: 1, baseDelayMs: 5 },
      ),
    ).rejects.toThrow(HttpRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("aborta la petición al cumplirse el timeout", async () => {
    const fetchMock = mockFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const start = Date.now();
    await expect(
      fetchWithRetry(
        "https://api.example.com",
        {},
        { timeoutMs: 50, retries: 0 },
      ),
    ).rejects.toThrow(HttpRequestError);
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
