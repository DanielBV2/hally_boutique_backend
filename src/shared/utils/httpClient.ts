export class HttpRequestError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "HttpRequestError";
  }
}

export interface FetchWithRetryOptions {
  timeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string | URL,
  init: Parameters<typeof fetch>[1],
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * fetch con timeout + reintentos. Reintenta únicamente errores transitorios:
 * fallos de red/timeout y respuestas 5xx. Los 4xx son deterministas y se
 * devuelven tal cual, sin reintentar. Agota los intentos y lanza
 * HttpRequestError solo si nunca logra una respuesta.
 */
export async function fetchWithRetry(
  url: string | URL,
  init: Parameters<typeof fetch>[1] = {},
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES, baseDelayMs = DEFAULT_BASE_DELAY_MS } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);

      if (res.status < 500) {
        return res;
      }

      if (attempt < retries) {
        await sleep(baseDelayMs * 2 ** attempt);
        continue;
      }

      return res;
    } catch (err) {
      lastError = err;
      if (attempt >= retries) {
        break;
      }
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }

  throw new HttpRequestError(
    `Request failed after ${retries + 1} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
    { cause: lastError },
  );
}
