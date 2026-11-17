import { Resend } from "resend";
import { logIntegrationError } from "@/lib/monitoring/log-integration-error";

if (typeof window !== "undefined") {
  throw new Error("lib/email/send.ts must never be imported into client code");
}

export type SendEmailResult = { ok: true; id: string | null } | { ok: false; error: string };

/**
 * Sends one email through Resend. Never throws: the Resend SDK reports a rejected send (bad key,
 * unverified domain, invalid address, rate limit) in its return value instead of throwing, so this
 * checks it and returns the outcome. Callers record an email as sent only when `ok` is true, and
 * every failure is written to integration_errors (source "email") so it is visible without Vercel
 * log access.
 */
export async function sendEmail(params: { to: string; subject: string; html: string; replyTo?: string }): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const error = "RESEND_API_KEY saknas";
    console.error(`${error} -- skipping email "${params.subject}" to ${params.to}`);
    await logIntegrationError("email", error, { subject: params.subject });
    return { ok: false, error };
  }
  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({ from: "Jawhara <bestallning@jawhara.se>", ...params });
    if (error) {
      const message = `${error.name ?? "resend_error"}: ${error.message}`;
      console.error(`Resend rejected email "${params.subject}" to ${params.to}: ${message}`);
      await logIntegrationError("email", message, { subject: params.subject });
      return { ok: false, error: message };
    }
    return { ok: true, id: data?.id ?? null };
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    console.error(`Resend send failed for "${params.subject}" to ${params.to}: ${message}`);
    await logIntegrationError("email", message, { subject: params.subject });
    return { ok: false, error: message };
  }
}
