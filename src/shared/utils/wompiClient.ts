import { fetchWithRetry } from "./httpClient.js";

const WOMPI_API_BASE_URL = process.env.WOMPI_API_BASE_URL || "https://sandbox.wompi.co/v1";

export async function voidWompiTransaction(
  transactionId: string,
  privateKey: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const response = await fetchWithRetry(
      `${WOMPI_API_BASE_URL}/transactions/${transactionId}/void`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${privateKey}`,
          "Content-Type": "application/json",
        },
      },
      { timeoutMs: 10_000, retries: 2 },
    );

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: JSON.stringify(data) };
    }

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
