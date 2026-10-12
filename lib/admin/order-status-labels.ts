/**
 * Swedish display labels + pill tone for the two real order status fields (financial_status,
 * fulfillment_status). financial_status values are inconsistently cased in the data (Shopify sync
 * writes lowercase e.g. "paid", the refund action writes uppercase e.g. "REFUNDED") -- normalized
 * via toLowerCase() here rather than "fixed" at the source, which is out of scope. Reuses the exact
 * Swedish vocabulary already used elsewhere in the admin (order export's "Avbruten", the hide
 * button's "Borttagen", the fulfillment i18n dictionary's "Levererad"/"Delvis levererad"/
 * "Ej levererad") instead of inventing new terms.
 */

export type StatusTone = "success" | "warning" | "neutral" | "danger";

export function financialStatusLabel(status: string | null, cancelledAt?: string | null): { label: string; tone: StatusTone } {
  if (cancelledAt) return { label: "Avbruten", tone: "danger" };
  switch ((status ?? "").toLowerCase()) {
    case "paid":
      return { label: "Betald", tone: "success" };
    case "partially_paid":
      return { label: "Delvis betald", tone: "warning" };
    case "pending":
      return { label: "Väntar på betalning", tone: "warning" };
    case "authorized":
      return { label: "Reserverad", tone: "warning" };
    case "refunded":
      return { label: "Återbetald", tone: "neutral" };
    case "partially_refunded":
      return { label: "Delvis återbetald", tone: "neutral" };
    case "voided":
      return { label: "Makulerad", tone: "neutral" };
    case "expired":
      return { label: "Utgången", tone: "neutral" };
    default:
      return { label: status || "—", tone: "neutral" };
  }
}

export function fulfillmentStatusLabel(status: string | null): { label: string; tone: StatusTone } {
  switch ((status ?? "").toUpperCase()) {
    case "FULFILLED":
      return { label: "Levererad", tone: "success" };
    case "PARTIALLY_FULFILLED":
    case "IN_PROGRESS":
      return { label: "Pågående", tone: "warning" };
    case "UNFULFILLED":
    case "":
      return { label: "Ej levererad", tone: "warning" };
    default:
      return { label: status || "—", tone: "neutral" };
  }
}

export const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  neutral: "bg-gray-100 text-gray-600",
  danger: "bg-rose-100 text-rose-700",
};
