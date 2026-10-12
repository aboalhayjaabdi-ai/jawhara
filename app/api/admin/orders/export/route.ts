import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { supabaseService } from "@/lib/supabase/service-client";
import { parseOrdersListFilters, applyOrdersListFilters, resolveCarrierOrderIds } from "@/lib/admin/orders-filters";

const PROVIDER_LABEL: Record<string, string> = { shopify: "Shopify", stripe: "Stripe", manual: "Manuell" };

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  const sp = req.nextUrl.searchParams;

  const idsParam = sp.get("ids");
  let orderIds: string[] | null = null;

  if (idsParam) {
    orderIds = idsParam.split(",").filter(Boolean);
  } else {
    const filters = parseOrdersListFilters(Object.fromEntries(sp.entries()));
    const carrierOrderIds = filters.carrier ? await resolveCarrierOrderIds(filters.carrier) : undefined;
    let query = supabaseService.from("orders").select("id");
    query = applyOrdersListFilters(query as any, filters, carrierOrderIds);

    const limitParam = sp.get("limit");
    if (limitParam && limitParam !== "all") {
      query = query.limit(Number(limitParam) || 100);
    }
    const { data } = await query;
    orderIds = (data ?? []).map((r: any) => r.id);
  }

  if (orderIds.length === 0) {
    return NextResponse.json({ error: "Inga ordrar matchade." }, { status: 400 });
  }

  const [{ data: orders }, { data: items }, { data: fulfillments }, { data: refunds }] = await Promise.all([
    supabaseService
      .from("orders")
      .select(
        "id, order_number, created_at, email, currency_code, financial_status, fulfillment_status, subtotal_price, total_discounts, total_shipping, total_tax, total_price, source, cancelled_at, customers(first_name, last_name)"
      )
      .in("id", orderIds),
    supabaseService
      .from("order_items")
      .select("order_id, title, sku, quantity, unit_price, discounted_unit_price, variant_id, refunded_quantity, product_variants(title)")
      .in("order_id", orderIds),
    supabaseService.from("fulfillments").select("order_id, tracking_number, tracking_company, created_at").in("order_id", orderIds).order("created_at"),
    supabaseService.from("refunds").select("order_id, amount").in("order_id", orderIds),
  ]);

  const itemsByOrder = new Map<string, typeof items>();
  for (const item of items ?? []) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }
  const fulfillmentByOrder = new Map<string, { trackingNumber: string | null; carrier: string | null }>();
  for (const f of fulfillments ?? []) {
    if (!fulfillmentByOrder.has(f.order_id)) {
      fulfillmentByOrder.set(f.order_id, { trackingNumber: f.tracking_number, carrier: f.tracking_company });
    }
  }
  const refundedByOrder = new Map<string, number>();
  for (const r of refunds ?? []) {
    refundedByOrder.set(r.order_id, (refundedByOrder.get(r.order_id) ?? 0) + Number(r.amount));
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Jawhara Admin";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Ordrar");

  sheet.columns = [
    { header: "Ordernummer", key: "orderNumber", width: 16 },
    { header: "Datum", key: "date", width: 18, style: { numFmt: "yyyy-mm-dd hh:mm" } },
    { header: "Kund", key: "customer", width: 22 },
    { header: "E-post", key: "email", width: 26 },
    { header: "Produkt", key: "product", width: 28 },
    { header: "Variant", key: "variant", width: 16 },
    { header: "SKU", key: "sku", width: 16 },
    { header: "Antal", key: "qty", width: 8 },
    { header: "Ordinarie pris", key: "unitPrice", width: 14 },
    { header: "Pris efter rabatt", key: "discountedUnitPrice", width: 16 },
    { header: "Radsumma", key: "lineTotal", width: 14 },
    { header: "Återbetalat antal", key: "refundedQty", width: 14 },
    { header: "Rabatt (order)", key: "orderDiscount", width: 14, style: { numFmt: "#,##0.00" } },
    { header: "Frakt", key: "shipping", width: 12, style: { numFmt: "#,##0.00" } },
    { header: "Moms", key: "vat", width: 12, style: { numFmt: "#,##0.00" } },
    { header: "Betalstatus", key: "financialStatus", width: 16 },
    { header: "Leveransstatus", key: "fulfillmentStatus", width: 18 },
    { header: "Transportör", key: "carrier", width: 16 },
    { header: "Spårningsnummer", key: "trackingNumber", width: 20 },
    { header: "Återbetalat belopp (order)", key: "refundedAmount", width: 20, style: { numFmt: "#,##0.00" } },
    { header: "Order totalt", key: "orderTotal", width: 14, style: { numFmt: "#,##0.00" } },
    { header: "Valuta", key: "currency", width: 10 },
    { header: "Källa", key: "source", width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };

  // Per-item columns (product/variant/SKU/qty/prices) hold one value per order line item,
  // newline-separated within the single cell -- keeps every order to exactly one row, per the
  // explicit requirement, while still showing full per-item detail rather than collapsing it away.
  const MULTILINE_COLUMNS = ["product", "variant", "sku", "qty", "unitPrice", "discountedUnitPrice", "lineTotal", "refundedQty"] as const;
  const numberFormat = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  for (const order of orders ?? []) {
    const customer = order.customers as any;
    const customerName = customer ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") : "";
    const lineItems = itemsByOrder.get(order.id) ?? [];
    const fulfillment = fulfillmentByOrder.get(order.id);
    const refundedAmount = refundedByOrder.get(order.id) ?? 0;

    const rowData: Record<string, unknown> = {
      orderNumber: order.order_number,
      date: new Date(order.created_at),
      customer: customerName,
      email: order.email ?? "",
      orderDiscount: Number(order.total_discounts ?? 0),
      shipping: Number(order.total_shipping ?? 0),
      vat: Number(order.total_tax ?? 0),
      financialStatus: order.cancelled_at ? "Avbruten" : order.financial_status ?? "",
      fulfillmentStatus: order.fulfillment_status ?? "",
      carrier: fulfillment?.carrier ?? "",
      trackingNumber: fulfillment?.trackingNumber ?? "",
      refundedAmount,
      orderTotal: Number(order.total_price ?? 0),
      currency: order.currency_code,
      source: PROVIDER_LABEL[order.source] ?? order.source,
    };

    if (lineItems.length > 0) {
      const products: string[] = [];
      const variants: string[] = [];
      const skus: string[] = [];
      const qtys: string[] = [];
      const unitPrices: string[] = [];
      const discountedUnitPrices: string[] = [];
      const lineTotals: string[] = [];
      const refundedQtys: string[] = [];

      for (const item of lineItems) {
        const unitPrice = Number(item.unit_price);
        const discountedUnitPrice = Number(item.discounted_unit_price ?? item.unit_price);
        products.push(item.title);
        variants.push(
          (item.product_variants as any)?.title && (item.product_variants as any).title !== "Default Title"
            ? (item.product_variants as any).title
            : ""
        );
        skus.push(item.sku ?? "");
        qtys.push(String(item.quantity));
        unitPrices.push(numberFormat.format(unitPrice));
        discountedUnitPrices.push(numberFormat.format(discountedUnitPrice));
        lineTotals.push(numberFormat.format(discountedUnitPrice * item.quantity));
        refundedQtys.push(String(item.refunded_quantity ?? 0));
      }

      rowData.product = products.join("\n");
      rowData.variant = variants.join("\n");
      rowData.sku = skus.join("\n");
      rowData.qty = qtys.join("\n");
      rowData.unitPrice = unitPrices.join("\n");
      rowData.discountedUnitPrice = discountedUnitPrices.join("\n");
      rowData.lineTotal = lineTotals.join("\n");
      rowData.refundedQty = refundedQtys.join("\n");
    }

    const row = sheet.addRow(rowData);
    for (const key of MULTILINE_COLUMNS) {
      row.getCell(key).alignment = { wrapText: true, vertical: "top" };
    }
    row.height = Math.max(15, lineItems.length * 14);
  }

  const buffer = await workbook.xlsx.writeBuffer();

  await logAdminAction(admin.adminId, "orders.export_xlsx", undefined, undefined, { orderCount: orders?.length ?? 0 });

  return new NextResponse(buffer as any, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="jawhara-ordrar-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
