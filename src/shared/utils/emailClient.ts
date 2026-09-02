import { Resend } from "resend";
import { env } from "../../config/env.js";
import { logger } from "./logger.js";

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  resendClient ??= new Resend(env.RESEND_API_KEY);
  return resendClient;
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<{ success: boolean; error?: string }> {
  const client = getResendClient();
  if (!client) {
    logger.warn(
      { to },
      "[Email] RESEND_API_KEY no configurada — email de restablecimiento no enviado",
    );
    return { success: false, error: "RESEND_API_KEY no configurada" };
  }

  try {
    const { error } = await client.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject: "Restablece tu contraseña — Hally Boutique",
      html: `<p>Haz clic en el siguiente enlace para restablecer tu contraseña (válido por 1 hora):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Si no solicitaste esto, ignora este correo.</p>`,
    });
    if (error) return { success: false, error: JSON.stringify(error) };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
