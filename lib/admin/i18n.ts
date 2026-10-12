import type { AdminLocale } from "./auth";

/**
 * Scoped to exactly what the restricted "fulfillment_staff" role sees: the Orders and Products
 * sections' own simplified read/fulfillment-only views (see the role-aware branches in
 * app/admin/(authenticated)/orders/page.tsx, orders/[id]/page.tsx, products/page.tsx,
 * products/[id]/page.tsx) plus the shared admin shell (sidebar/topbar/sign-out). The rest of the
 * admin (customers, discounts, settings, etc.) is unreachable for this role -- see
 * lib/admin/permissions.ts -- and stays Swedish-only; nothing there needs an entry here.
 *
 * Deliberately never translates real business data (product titles, customer names/addresses,
 * order notes, SKUs) -- only this file's own fixed interface strings.
 */
const DICTIONARY = {
  "nav.orders": { sv: "Ordrar", zh: "订单" },
  "nav.products": { sv: "Produkter", zh: "产品" },
  "nav.signOut": { sv: "Logga ut", zh: "退出登录" },
  "nav.openMenu": { sv: "Öppna meny", zh: "打开菜单" },

  "orders.title": { sv: "Ordrar", zh: "订单" },
  "orders.searchPlaceholder": { sv: "Sök ordernummer eller e-post…", zh: "搜索订单号或电子邮件…" },
  "orders.filter.all": { sv: "Alla", zh: "全部" },
  "orders.filter.unfulfilled": { sv: "Ej levererade", zh: "待处理" },
  "orders.filter.partiallyFulfilled": { sv: "Delvis levererade", zh: "部分处理" },
  "orders.filter.fulfilled": { sv: "Levererade", zh: "已处理" },
  "orders.col.order": { sv: "Order", zh: "订单" },
  "orders.col.date": { sv: "Datum", zh: "日期" },
  "orders.col.customer": { sv: "Kund", zh: "客户" },
  "orders.col.items": { sv: "Antal artiklar", zh: "商品数量" },
  "orders.col.status": { sv: "Leveransstatus", zh: "处理状态" },
  "orders.empty": { sv: "Inga ordrar hittades.", zh: "未找到订单。" },
  "orders.bulkFulfill": { sv: "Markera som levererade", zh: "标记为已处理" },
  "orders.selected": { sv: "valda", zh: "已选择" },
  "orders.status.FULFILLED": { sv: "Levererad", zh: "已处理" },
  "orders.status.PARTIALLY_FULFILLED": { sv: "Delvis levererad", zh: "部分处理" },
  "orders.status.UNFULFILLED": { sv: "Ej levererad", zh: "待处理" },

  "order.back": { sv: "← Ordrar", zh: "← 返回订单" },
  "order.items": { sv: "Artiklar", zh: "商品" },
  "order.noItems": { sv: "Inga artiklar hittades.", zh: "未找到商品。" },
  "order.qty": { sv: "Antal", zh: "数量" },
  "order.sku": { sv: "SKU", zh: "货号" },
  "order.productDeleted": { sv: "Produkten har tagits bort", zh: "该商品已删除" },
  "order.noImage": { sv: "Ingen bild", zh: "无图片" },
  "order.shippingAddress": { sv: "Leveransadress", zh: "收货地址" },
  "order.phone": { sv: "Telefon", zh: "电话" },
  "order.customer": { sv: "Kund", zh: "客户" },
  "order.guest": { sv: "Gäst", zh: "访客" },
  "order.fulfillmentStatus": { sv: "Leveransstatus", zh: "处理状态" },
  "order.shipments": { sv: "Leveranser", zh: "已发货包裹" },
  "order.carrier": { sv: "Transportör", zh: "承运商" },
  "order.trackingNumber": { sv: "Spårningsnummer", zh: "追踪号" },
  "order.alreadyCancelled": { sv: "Den här ordern är avbruten.", zh: "此订单已取消。" },

  "fulfillment.title": { sv: "Skapa leverans", zh: "创建发货单" },
  "fulfillment.remaining": { sv: "av", zh: "/" },
  "fulfillment.trackingNumber": { sv: "Spårningsnummer", zh: "追踪号" },
  "fulfillment.carrier": { sv: "Transportör (valfritt)", zh: "承运商（选填）" },
  "fulfillment.notify": { sv: "Meddela kund via e-post", zh: "通过电子邮件通知客户" },
  "fulfillment.notifyHint": {
    sv: "Kunden får en spårningslänk till Jawhara direkt -- ingen transportör krävs för att spara.",
    zh: "客户将直接收到 Jawhara 的追踪链接——保存时无需填写承运商。",
  },
  "fulfillment.submit": { sv: "Markera som levererad", zh: "标记为已发货" },
  "fulfillment.submitting": { sv: "Skapar leverans…", zh: "创建发货中…" },
  "fulfillment.selectAtLeastOne": { sv: "Välj minst en artikel.", zh: "请至少选择一件商品。" },

  "products.title": { sv: "Produkter", zh: "产品" },
  "products.searchPlaceholder": { sv: "Sök titel eller SKU…", zh: "搜索标题或货号…" },
  "products.col.image": { sv: "Bild", zh: "图片" },
  "products.col.title": { sv: "Titel", zh: "标题" },
  "products.col.status": { sv: "Status", zh: "状态" },
  "products.col.price": { sv: "Pris", zh: "价格" },
  "products.empty": { sv: "Inga produkter hittades.", zh: "未找到产品。" },
  "products.status.active": { sv: "Aktiv", zh: "上架中" },
  "products.status.draft": { sv: "Utkast", zh: "草稿" },
  "products.status.archived": { sv: "Arkiverad", zh: "已归档" },

  "product.back": { sv: "← Produkter", zh: "← 返回产品" },
  "product.images": { sv: "Bilder", zh: "图片" },
  "product.noImages": { sv: "Inga bilder", zh: "暂无图片" },
  "product.description": { sv: "Beskrivning", zh: "描述" },
  "product.variants": { sv: "Varianter", zh: "款式/规格" },
  "product.col.option": { sv: "Alternativ", zh: "选项" },
  "product.col.sku": { sv: "SKU", zh: "货号" },
  "product.col.price": { sv: "Pris", zh: "价格" },
  "product.col.stock": { sv: "Lager", zh: "库存" },
  "product.stock.inStock": { sv: "I lager", zh: "有库存" },
  "product.stock.outOfStock": { sv: "Slut i lager", zh: "缺货" },
  "product.stock.untracked": { sv: "Spåras inte", zh: "不追踪库存" },
  "product.notFound": { sv: "Produkten hittades inte.", zh: "未找到该产品。" },

  "common.search": { sv: "Sök", zh: "搜索" },
  "common.viewOnlyNotice": {
    sv: "Visningsläge: du kan se produktinformation men inte redigera den.",
    zh: "只读模式：您可以查看产品信息，但无法编辑。",
  },
} as const;

export type I18nKey = keyof typeof DICTIONARY;

export function t(locale: AdminLocale, key: I18nKey): string {
  return DICTIONARY[key][locale] ?? DICTIONARY[key].sv;
}
