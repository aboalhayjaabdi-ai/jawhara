import { NextRequest, NextResponse } from "next/server";
import { shopifyGraphQL } from "@/lib/shopify/client";
import { orderStores } from "@/lib/shopify/stores";

/**
 * Temporary, read-only maintenance endpoint (to be removed once used): for every order of the last
 * `days` days in each Shopify store, whether the order's Shopify timeline shows its order
 * confirmation email as sent. Authenticated with EMAIL_HEALTH_SECRET.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.EMAIL_HEALTH_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const days = Number(body?.days) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const result: Record<string, unknown> = {};

  for (const store of orderStores()) {
    try {
      const orders: any[] = [];
      let after: string | null = null;
      for (let page = 0; page < 10; page++) {
        const d: any = await shopifyGraphQL<any>(
          `query($q: String!, $after: String) { orders(first: 50, after: $after, query: $q, sortKey: CREATED_AT) {
             pageInfo { hasNextPage endCursor }
             nodes { name createdAt test cancelledAt displayFinancialStatus email
               events(first: 50) { nodes { message } } } } }`,
          { q: `created_at:>='${since}'`, after },
          store
        );
        orders.push(...d.orders.nodes);
        if (!d.orders.pageInfo.hasNextPage) break;
        after = d.orders.pageInfo.endCursor;
      }
      const confirm = /(order confirmation|orderbekräftelse|bekräftelse.*(skickades|skickat)|confirmation email)/i;
      const messages = new Map<string, number>();
      const rows = orders.map((o) => {
        const msgs: string[] = (o.events?.nodes ?? []).map((e: any) => String(e.message ?? "").replace(/<[^>]*>/g, ""));
        for (const m of msgs) {
          const key = m.replace(/\S+@\S+/g, "<email>").replace(/#?\d{3,}/g, "<n>").slice(0, 140);
          messages.set(key, (messages.get(key) ?? 0) + 1);
        }
        return {
          name: o.name,
          createdAt: o.createdAt,
          test: o.test,
          cancelled: !!o.cancelledAt,
          financial: o.displayFinancialStatus,
          hasEmail: !!o.email,
          confirmationSent: msgs.some((m) => confirm.test(m)),
        };
      });
      result[store] = {
        orders: rows.length,
        confirmed: rows.filter((r) => r.confirmationSent).length,
        missing: rows.filter((r) => !r.confirmationSent),
        eventMessages: [...messages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25),
      };
    } catch (err) {
      result[store] = { error: (err as Error).message };
    }
  }
  return NextResponse.json({ since, ...result });
}
