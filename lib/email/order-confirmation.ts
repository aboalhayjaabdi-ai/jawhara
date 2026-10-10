import { Resend } from "resend";

// Server-only. Never import from a "use client" component.
if (typeof window !== "undefined") {
  throw new Error("lib/email/order-confirmation.ts must never be imported into client code");
}

function formatSek(amount: number) {
  return `${Math.round(amount)} kr`;
}

export async function sendOrderConfirmationEmail({
  to,
  orderNumber,
  total,
}: {
  to: string;
  orderNumber: string;
  total: number;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY missing — skipping order confirmation email for", orderNumber);
    return;
  }

  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: "Jawhara <bestallning@jawhara.se>",
    to,
    subject: `Orderbekräftelse ${orderNumber} — Jawhara`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h1 style="font-size: 20px;">Tack för din beställning!</h1>
        <p>Vi har tagit emot din betalning och din order behandlas nu.</p>
        <p><strong>Ordernummer:</strong> ${orderNumber}<br/>
        <strong>Totalt:</strong> ${formatSek(total)}</p>
        <p>Du får ett nytt mejl när din order har skickats.</p>
        <p>Med vänliga hälsningar,<br/>Jawhara</p>
      </div>
    `,
  });
}
