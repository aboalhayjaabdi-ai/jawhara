/**
 * Simplified Chinese (简体中文) for the freight forwarder's warehouse staff -- ERP API only.
 *
 * A fixed, reviewable glossary (no translation service: the same Swedish always gives the same
 * Chinese, and no data leaves Jawhara). Only product words are translated: product types, colours,
 * materials, sizes. Proper names ("Lilly", "Aura", "DI") stay in Latin letters, as model names. A
 * word that is not in the glossary is kept as it is (Swedish) rather than guessed.
 *
 * Never used for customer data (names, addresses, phone) -- those are not passed in here.
 */

// Colours and finishes (also used as variant values). Lower case keys.
const COLORS: Record<string, string> = {
  svart: "黑色", vit: "白色", grå: "灰色", röd: "红色", rosa: "粉色", blå: "蓝色", grön: "绿色", gul: "黄色",
  orange: "橙色", brun: "棕色", beige: "米色", lila: "紫色", turkos: "青绿色", guld: "金色", silver: "银色",
  roséguld: "玫瑰金", krämvit: "奶白色", cognac: "干邑棕", taupe: "灰褐色", cerise: "樱桃红", klar: "透明",
  duvblå: "灰蓝色", vinröd: "酒红色", "vin röd": "酒红色", ljusgrön: "浅绿色", ljusblå: "浅蓝色", ljusrosa: "浅粉色",
  "ljus rosa": "浅粉色", "ljus brun": "浅棕色", ljusbrun: "浅棕色", ljusbeige: "浅米色", ljuslila: "浅紫色", ljusgrå: "浅灰色",
  mörkblå: "深蓝色", mörkbrun: "深棕色", mörkgrå: "深灰色", mörkröd: "深红色", mörklila: "深紫色",
  mörkorange: "深橙色", "mörk rosa": "深粉色", "mörk gråbrun": "深灰棕色", chokladbrun: "巧克力棕",
  gråbrun: "灰棕色", korallrosa: "珊瑚粉", marinblå: "藏青色", puderrosa: "藕粉色", salviagrön: "鼠尾草绿",
  sandbeige: "沙米色", grafitgrå: "石墨灰", limegrön: "青柠绿", turkosblå: "青蓝色", gammelrosa: "豆沙粉",
  mintturkos: "薄荷青", mintgrön: "薄荷绿", koboltblå: "钴蓝色", flaskgrön: "墨绿色", lavendellila: "薰衣草紫",
  klarröd: "正红色", kastanjebrun: "栗棕色", senapsgul: "芥末黄", orangeröd: "橙红色", rostbrun: "铁锈棕",
  tegelröd: "砖红色", petrolblå: "石油蓝", blågrå: "蓝灰色", blågrön: "蓝绿色", flerfärgad: "多色",
  tvåfärgat: "双色", tigeröga: "虎眼石", "rosa pärlemor": "粉色珍珠母贝", "vit pärlemor": "白色珍珠母贝",
  "brunt monogram": "棕色老花", "brunt rutmönster": "棕色格纹", "blå blommor": "蓝色花朵",
  "klara stenar": "透明水钻", "guld och stenar": "金色镶石", "med kedja": "带链条", "med axelrem": "带肩带",
};

// Product words. Lower case; multi-word entries are matched first.
const WORDS: Record<string, string> = {
  väska: "包", plånbok: "钱包", armband: "手链", halsband: "项链", ring: "戒指", örhänge: "耳环", örhängen: "耳环",
  "gift set": "礼盒套装", giftset: "礼盒套装", smyckesset: "首饰套装", presentask: "礼盒", smycken: "首饰",
  sminkväska: "化妆包", axelväska: "单肩包", handväska: "手提包", kupolväska: "圆顶包", skal: "手机壳",
  "t-armband": "T字手链", solitärring: "单钻戒指", droppring: "水滴形戒指",
  klöver: "四叶草", diamant: "钻石", kristall: "水晶", hjärt: "心形", spik: "钉子", knot: "结形", tennis: "网球",
  twist: "扭纹", tvinnat: "扭纹", chain: "链条", snake: "蛇形", hoop: "圈形", blom: "花朵", dubbel: "双层",
  "x-länk": "X字链", hänge: "吊坠", quiltad: "绗缝", öppet: "开口", rektangulär: "长方形", oval: "椭圆形",
  spetsoval: "马眼形", stenkant: "镶边", bokstavsdetalj: "字母装饰", liten: "小号", mini: "迷你", smal: "细款",
  tunt: "细款", gåva: "赠品", standard: "标准", testprodukt: "测试产品",
};

// Whole names whose word order or meaning needs a fixed form. Lower case.
const OVERRIDES: Record<string, string> = {
  "ring halsband": "圆环项链",
  "v halsband": "V字项链",
  "t ring": "T字戒指",
  "presentask smycken": "首饰礼盒",
  "klöver halsband med flera klöver": "多四叶草项链",
  "droppring med stenkant": "水滴形镶边戒指",
  "armband med bokstavsdetalj": "字母装饰手链",
  "klöver halsband hänge guld": "四叶草吊坠项链（金色）",
  "klöver halsband hänge silver": "四叶草吊坠项链（银色）",
  "rektangulär ring med stenar": "长方形镶石戒指",
  "spetsoval ring med stenar": "马眼形镶石戒指",
};

// "<thing> med <this>": the "with ..." part, which comes first in Chinese.
const WITH: Record<string, string> = { stenar: "镶石", sten: "镶石", kedja: "带链条", axelrem: "带肩带", "flera klöver": "多叶" };

// Words that follow the noun in Swedish but come before it in Chinese ("H väska liten" -> "H 小号包").
const AFTER_NOUN = new Set(["liten", "mini", "smal", "tunt", "diamant"]);
const NOUNS = new Set(["väska", "plånbok", "armband", "halsband", "ring", "örhänge", "sminkväska"]);

const isCjk = (s: string) => /[　-鿿＀-￯]/.test(s);

function join(parts: string[]): string {
  let out = "";
  for (const p of parts) {
    if (!p) continue;
    if (out && !(isCjk(out.at(-1)!) && isCjk(p[0]))) out += " ";
    out += p;
  }
  return out;
}

/** A colour/finish in Chinese, or null when it is not one. Handles "X och Y" and "X, Y". */
export function zhColor(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (COLORS[s]) return COLORS[s];
  const parts = s.split(/\s+och\s+|\s*,\s*/);
  if (parts.length > 1 && parts.every((p) => COLORS[p])) return parts.map((p) => COLORS[p]).join("和");
  return null;
}

function words(phrase: string): { text: string; known: boolean }[] {
  const tokens = phrase.split(/\s+/).filter(Boolean);
  const out: { text: string; known: boolean }[] = [];
  for (let i = 0; i < tokens.length; ) {
    let hit = false;
    for (let n = Math.min(3, tokens.length - i); n >= 1 && !hit; n--) {
      const key = tokens.slice(i, i + n).join(" ").toLowerCase();
      const zh = WORDS[key] ?? (n > 1 ? COLORS[key] : undefined);
      if (zh) {
        out.push({ text: zh, known: true });
        i += n;
        hit = true;
      }
    }
    if (!hit) {
      out.push({ text: tokens[i], known: false });
      i += 1;
    }
  }
  return out;
}

/**
 * A product name or model in Chinese ("Lilly Väska" -> "Lilly 包", "Klöver diamant armband" ->
 * "四叶草钻石手链", "H armband guld" -> "H 手链（金色）"). Unknown words (names) stay as they are.
 */
export function zhName(raw: string | null | undefined): string | null {
  const original = (raw ?? "").trim();
  if (!original) return null;
  const lower = original.toLowerCase();
  if (OVERRIDES[lower]) return OVERRIDES[lower];

  // "(gåva)", "(Standard)": translated, kept in brackets at the end.
  let suffix = "";
  let s = original.replace(/\s*\(([^)]*)\)\s*$/, (_, inner: string) => {
    suffix = `（${zhName(inner) ?? inner}）`;
    return "";
  });

  // Trailing colour words -> （金色） at the end.
  const colorTail: string[] = [];
  for (;;) {
    const m = s.match(/^(.*\S)\s+(\S+)$/);
    if (!m || !COLORS[m[2].toLowerCase()]) break;
    colorTail.unshift(COLORS[m[2].toLowerCase()]);
    s = m[1];
  }

  // "<thing> med <this>" -> "<this><thing>".
  let withPart = "";
  const med = s.match(/^(.*\S)\s+med\s+(.+)$/i);
  if (med && WITH[med[2].toLowerCase()]) {
    withPart = WITH[med[2].toLowerCase()];
    s = med[1];
  }

  const ws = words(s);
  // Adjectives that follow the noun in Swedish move before it.
  for (let i = ws.length - 1; i > 0; i--) {
    const sw = s.split(/\s+/);
    if (ws.length === sw.length && AFTER_NOUN.has(sw[i].toLowerCase()) && NOUNS.has(sw[i - 1].toLowerCase())) {
      [ws[i - 1], ws[i]] = [ws[i], ws[i - 1]];
      break;
    }
  }
  const body = join(ws.map((w) => w.text));
  return join([withPart, body]) + (colorTail.length ? `（${colorTail.join("、")}）` : "") + suffix;
}

/**
 * A variant value in Chinese: sizes become "尺寸 7", "尺寸 17 厘米", "尺寸 5 毫米"; colours their
 * colour; "Default Title"/empty -> null.
 */
export function zhVariant(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s || s.toLowerCase() === "default title") return null;
  const size = s.match(/^(\d+(?:[.,]\d+)?)\s*(cm|mm)?\s*(?:\(([^)]*)\))?$/i);
  if (size) {
    const unit = size[2] ? (size[2].toLowerCase() === "cm" ? " 厘米" : " 毫米") : "";
    const note = size[3] ? `（${zhName(size[3]) ?? size[3]}）` : "";
    return `尺寸 ${size[1]}${unit}${note}`;
  }
  return zhColor(s) ?? zhName(s);
}

/** The Chinese block for one order line or product. Originals are never changed. */
export function zhLine(input: { title: string | null; variantTitle: string | null; model: string | null; color: string | null; quantity?: number }) {
  const title = zhName(input.title);
  const model = zhName(input.model);
  const color = zhColor(input.color) ?? (input.color ? zhName(input.color) : null);
  const variant = zhVariant(input.variantTitle);
  const quantity = input.quantity != null ? `数量 ${input.quantity}` : null;
  // e.g. "Lilly 包 – 黑色 · 数量 1", "Aura 戒指 – 银色 · 尺寸 7 · 数量 1"
  const variantPart = variant && variant !== color ? variant : null;
  const line = [title ?? "", color ? ` – ${color}` : "", variantPart ? ` · ${variantPart}` : "", quantity ? ` · ${quantity}` : ""].join("");
  return { title, model, color, variant, quantity, line: line || null };
}
