import { NextRequest, NextResponse } from "next/server";
import { lookupOrderTracking } from "@/lib/tracking/lookup";

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const orderNumber: string | undefined = body?.orderNumber;
  const email: string | undefined = body?.email;

  if (!orderNumber || !email) {
    return NextResponse.json({ error: "Ordernummer och e-postadress krävs." }, { status: 400 });
  }

  const result = await lookupOrderTracking(orderNumber, email, clientIp(req));

  if (!result.ok) {
    if (result.reason === "rate_limited") {
      return NextResponse.json({ error: "För många försök. Försök igen om en stund." }, { status: 429 });
    }
    // Deliberately the same generic message for "no such order" and "wrong email" -- never
    // discloses which, to prevent order-number enumeration.
    return NextResponse.json({ error: "Ordern hittades inte. Kontrollera ordernummer och e-postadress." }, { status: 404 });
  }

  return NextResponse.json(result);
}
