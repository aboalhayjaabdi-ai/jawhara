import { NextRequest, NextResponse } from "next/server";
import { lookupOrderTracking, lookupOrderTrackingByToken, lookupTrackingNumber } from "@/lib/tracking/lookup";

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token: string | undefined = body?.token;
  const orderNumber: string | undefined = body?.orderNumber;
  const email: string | undefined = body?.email;
  const trackingNumber: string | undefined = typeof body?.trackingNumber === "string" ? body.trackingNumber : undefined;

  const result = token
    ? await lookupOrderTrackingByToken(token)
    : trackingNumber
      ? await lookupTrackingNumber(trackingNumber, clientIp(req))
      : orderNumber && email
        ? await lookupOrderTracking(orderNumber, email, clientIp(req))
        : null;

  if (!result) {
    return NextResponse.json({ error: "Ange ordernummer och e-postadress, eller ditt spårningsnummer." }, { status: 400 });
  }

  if (!result.ok) {
    if (result.reason === "rate_limited") {
      return NextResponse.json({ error: "För många försök. Försök igen om en stund." }, { status: 429 });
    }
    if (result.reason === "invalid_token") {
      return NextResponse.json({ error: "Länken har gått ut eller är ogiltig. Sök upp din order nedan istället.", reason: "invalid_token" }, { status: 410 });
    }
    if (trackingNumber) {
      return NextResponse.json({ error: "Spårningsnumret hittades inte. Kontrollera numret, eller sök med ordernummer och e-postadress." }, { status: 404 });
    }
    // Deliberately the same generic message for "no such order" and "wrong email" -- never
    // discloses which, to prevent order-number enumeration.
    return NextResponse.json({ error: "Ordern hittades inte. Kontrollera ordernummer och e-postadress." }, { status: 404 });
  }

  return NextResponse.json(result);
}
