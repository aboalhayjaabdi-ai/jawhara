import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase/service-client";
import { verifyReviewToken } from "@/lib/reviews/token";

const RATE_LIMIT_WINDOW_MINUTES = 60;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

async function checkRateLimit(ipAddress: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await supabaseService
    .from("review_submission_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_address", ipAddress)
    .gte("attempted_at", since);
  return (count ?? 0) < RATE_LIMIT_MAX_ATTEMPTS;
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const allowed = await checkRateLimit(ip);
  await supabaseService.from("review_submission_attempts").insert({ ip_address: ip });
  if (!allowed) {
    return NextResponse.json({ error: "För många recensioner skickade. Försök igen om en stund." }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Ogiltig förfrågan." }, { status: 400 });

  const productId = String(form.get("productId") ?? "");
  const rating = Number(form.get("rating"));
  const body = String(form.get("body") ?? "").trim().slice(0, 5000);
  const authorName = String(form.get("authorName") ?? "").trim().slice(0, 100) || null;
  const token = form.get("token") ? String(form.get("token")) : null;

  if (!productId) return NextResponse.json({ error: "Produkt saknas." }, { status: 400 });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Betyg måste vara mellan 1 och 5 stjärnor." }, { status: 400 });
  }

  const { data: product } = await supabaseService.from("products").select("id").eq("id", productId).maybeSingle();
  if (!product) return NextResponse.json({ error: "Produkten hittades inte." }, { status: 404 });

  // A signed token proves a genuine purchase of this exact product on this exact order --
  // never trusted blindly: the order_id/product_id pair is independently re-checked against
  // real order_items below before verified_buyer is ever set true.
  let orderId: string | null = null;
  let verifiedBuyer = false;
  let customerEmail: string | null = null;

  if (token) {
    const verified = verifyReviewToken(token);
    if (!verified) {
      return NextResponse.json({ error: "Länken har gått ut eller är ogiltig." }, { status: 410 });
    }
    if (verified.productId !== productId) {
      return NextResponse.json({ error: "Länken matchar inte denna produkt." }, { status: 400 });
    }
    const { count } = await supabaseService
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("order_id", verified.orderId)
      .eq("product_id", productId);
    if ((count ?? 0) > 0) {
      orderId = verified.orderId;
      verifiedBuyer = true;
      const { data: order } = await supabaseService.from("orders").select("email").eq("id", verified.orderId).maybeSingle();
      customerEmail = order?.email ?? null;
    }
  }

  if (orderId) {
    const { data: existing } = await supabaseService
      .from("reviews")
      .select("id")
      .eq("order_id", orderId)
      .eq("product_id", productId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "Du har redan recenserat denna produkt för den här ordern." }, { status: 409 });
    }
  }

  // Photos are optional and uploaded server-side (never a client-supplied URL) -- same public
  // "product-media" bucket as everything else, under its own prefix.
  const photoUrls: string[] = [];
  const photoFiles = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0).slice(0, MAX_PHOTOS);
  for (const file of photoFiles) {
    if (!ALLOWED_PHOTO_TYPES.includes(file.type) || file.size > MAX_PHOTO_BYTES) continue;
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `reviews/${productId}/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabaseService.storage
      .from("product-media")
      .upload(path, buffer, { contentType: file.type, upsert: false });
    if (!uploadError) {
      photoUrls.push(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-media/${path}`);
    }
  }

  const { error } = await supabaseService.from("reviews").insert({
    product_id: productId,
    order_id: orderId,
    rating,
    author_name: authorName,
    body: body || null,
    verified_buyer: verifiedBuyer,
    status: "pending",
    source: "storefront",
    customer_email: customerEmail,
    photo_urls: photoUrls,
  });
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Du har redan recenserat denna produkt för den här ordern." }, { status: 409 });
    }
    return NextResponse.json({ error: "Kunde inte spara recensionen." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
