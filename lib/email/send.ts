import { Resend } from "resend";

if (typeof window !== "undefined") {
  throw new Error("lib/email/send.ts must never be imported into client code");
}

export async function sendEmail(params: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error(`RESEND_API_KEY missing — skipping email "${params.subject}" to ${params.to}`);
    return;
  }
  const resend = new Resend(apiKey);
  await resend.emails.send({ from: "Jawhara <bestallning@jawhara.se>", ...params });
}
