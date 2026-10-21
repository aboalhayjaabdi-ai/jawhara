import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseService } from "@/lib/supabase/service-client";
import { getStoreSettings } from "@/lib/admin/store-settings";

// Public contact form on /pages/contact. Each submission is emailed to the store's support inbox
// (store_settings.support_email, falling back to support@jawhara.se) with Reply-To set to the
// customer, so a plain "Svara" in the inbox goes straight back to them. The row in
// contact_submissions is kept as a backup record.

const FALLBACK_TO = "support@jawhara.se";
const FROM = "Jawhara Kontaktformulär <kontakt@jawhara.se>";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: "Ogiltig förfrågan." }, { status: 400 });

  // Honeypot: real visitors never see or fill this field. Pretend success so bots move on.
  if (clean(payload.website, 200)) return NextResponse.json({ ok: true });

  const name = clean(payload.name, 200);
  const email = clean(payload.email, 320);
  const phone = clean(payload.phone, 50);
  const body = clean(payload.body, 5000);

  if (!EMAIL_RE.test(email) || !body) {
    return NextResponse.json({ error: "Fyll i en giltig e-postadress och ett meddelande." }, { status: 400 });
  }

  // Simple flood guard without a schema change: max 3 messages per address per 10 minutes.
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await supabaseService
    .from("contact_submissions")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", since);
  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: "För många meddelanden. Försök igen om en stund." }, { status: 429 });
  }

  const { error: insertError } = await supabaseService
    .from("contact_submissions")
    .insert({ name: name || null, email, phone: phone || null, body });
  if (insertError) console.error("contact_submissions insert failed:", insertError.message);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY missing — contact form email not sent");
    return NextResponse.json({ error: "Kunde inte skicka meddelandet." }, { status: 500 });
  }

  const settings = await getStoreSettings().catch(() => null);
  const to = settings?.supportEmail?.trim() || FALLBACK_TO;

  const rows = [
    ["Namn", name || "–"],
    ["E-post", email],
    ["Telefon", phone || "–"],
  ]
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#666;">${label}</td><td style="padding:4px 0;">${escapeHtml(value)}</td></tr>`
    )
    .join("");

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;line-height:1.5;">
  <h2 style="font-size:16px;margin:0 0 12px;">Nytt meddelande från kontaktformuläret</h2>
  <table style="border-collapse:collapse;margin-bottom:16px;">${rows}</table>
  <div style="white-space:pre-wrap;border-top:1px solid #ddd;padding-top:12px;">${escapeHtml(body)}</div>
</div>`;

  const text = `Nytt meddelande från kontaktformuläret\n\nNamn: ${name || "–"}\nE-post: ${email}\nTelefon: ${phone || "–"}\n\n${body}`;

  const { error: sendError } = await new Resend(apiKey).emails.send({
    from: FROM,
    to,
    replyTo: email,
    subject: `Kontaktformulär: ${name || email}`,
    html,
    text,
  });

  if (sendError) {
    console.error("Contact form email failed:", sendError.message);
    return NextResponse.json({ error: "Kunde inte skicka meddelandet." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
