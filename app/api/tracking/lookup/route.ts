import { NextRequest, NextResponse } from "next/server";
import { lookupOrderTracking, lookupOrderTrackingByToken } from "@/lib/tracking/lookup";

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token: string | undefined = body?.token;
  const orderNumber: string | undefined = body?.orderNumber;
  const email: string | undefined = body?.email;

  const result = token
    ? await lookupOrderTrackingByToken(token)
    : orderNumber && email
      ? await lookupOrderTracking(orderNumber, email, clientIp(req))
      : null;

  if (!result) {
    return NextResponse.json({ error: "Ordernummer och e-postadress krävs." }, { status: 400 });
  }

  if (!result.ok) {
    if (result.reason === "rate_limited") {
      return NextResponse.json({ error: "För många försök. Försök igen om en stund." }, { status: 429 });
    }
    if (result.reason === "invalid_token") {
      return NextResponse.json({ error: "Länken har gått ut eller är ogiltig. Sök upp din order nedan istället.", reason: "invalid_token" }, { status: 410 });
    }
    // Deliberately the same generic message for "no such order" and "wrong email" -- never
    // discloses which, to prevent order-number enumeration.
    return NextResponse.json({ error: "Ordern hittades inte. Kontrollera ordernummer och e-postadress." }, { status: 404 });
  }

  return NextResponse.json(result);
}
