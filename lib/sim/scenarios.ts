import type { SimDecision, SimPersona, SimTurn } from "./types";

type Extra = { approve?: boolean; note?: string };

const PIN_GAP = "non-metric pin gap";
const PIN_METRIC = "ปักการ์ดนี้ไว้บน Dashboard ด้วย";

function ask(say: string, interest: string | null, expectTools: string[], expectDecision: SimDecision = "allow", extra: Extra = {}): SimTurn {
  return { say, interest, expectTools, expectDecision, ...extra };
}

function press(kind: string, expectTools: string[], expectDecision: SimDecision = "allow", extra: Extra = {}): SimTurn {
  return { press: kind, interest: null, expectTools, expectDecision, ...extra };
}

function pinGap(): SimTurn {
  return ask(PIN_METRIC, null, [], "refuse", { note: PIN_GAP });
}

function pinMetric(interest: string | null): SimTurn {
  return ask(PIN_METRIC, interest, ["pin_widget"], "allow", { approve: true });
}

const CEO: SimPersona = {
  userId: "u_thana",
  interests: [
    { key: "attain_region", label: "ยอดเทียบเป้าแยกตามภาค", slice: { metric: "target_attainment", dims: ["region"] } },
    { key: "isan_volume", label: "ยอดขายภาคอีสานที่ตก", slice: { metric: "net_sales_volume", dims: ["week"] } },
    { key: "brand_margin", label: "กำไรขั้นต้นรายแบรนด์", slice: { metric: "gross_margin", dims: ["brand"] } },
  ],
  sessions: [
    { daysAgo: 13, turns: [
      ask("เดือนนี้แต่ละภาคทำได้กี่เปอร์เซ็นต์ของเป้า", "attain_region", ["query_metric"]),
      ask("ภาคไหนน่าห่วงที่สุด แล้วเพราะอะไร", null, ["query_metric", "get_alerts"]),
    ] },
    { daysAgo: 12, turns: [
      ask("อีสานยอดขายเข้ารายสัปดาห์เป็นยังไงบ้าง ช่วงนี้ได้ยินว่าตก", "isan_volume", ["query_metric"]),
      press("drill", ["query_metric"]),
    ] },
    { daysAgo: 10, turns: [
      ask("กำไรขั้นต้นแยกตามแบรนด์ ปีนี้", "brand_margin", ["query_metric"]),
      ask("ลีโอกับสิงห์ใครกำไรต่อลิตรดีกว่า", "brand_margin", ["query_metric"]),
    ] },
    { daysAgo: 9, turns: [
      ask("สรุปยอดเทียบเป้าตามภาคให้หน่อย สั้นๆ", "attain_region", ["query_metric"]),
      pinMetric("attain_region"),
    ] },
    { daysAgo: 8, turns: [
      ask("มีความผิดปกติอะไรที่ผมควรรู้วันนี้", null, ["get_alerts"]),
      pinGap(),
    ] },
    { daysAgo: 7, turns: [
      ask("เอเย่นต์ในอีสานรายไหนยอดหายไปมากที่สุด 4 สัปดาห์ล่าสุด", "isan_volume", ["query_metric"]),
      press("handoff", ["create_handoff"], "allow", { approve: true }),
    ] },
    { daysAgo: 6, turns: [
      ask("ขอเปลี่ยนสิทธิ์ให้คุณกฤตเห็นกำไรขั้นต้นได้ด้วย", null, ["set_permission"], "deny", { note: "ceo cannot set permissions" }),
      ask("รันงานพยากรณ์ใหม่ให้หน่อย", null, ["run_job"], "deny", { note: "ceo cannot run jobs" }),
    ] },
    { daysAgo: 5, turns: [
      ask("ส่วนแบ่งตลาดเบียร์เราเทียบคู่แข่งเป็นยังไง เดือนล่าสุด", null, ["query_metric"]),
      ask("margin ของกลุ่มเบียร์เทียบปีก่อน", "brand_margin", ["query_metric"]),
    ] },
    { daysAgo: 4, turns: [
      ask("ยอด achievement แต่ละภาคเทียบเป้าตอนนี้", "attain_region", ["query_metric"]),
      ask("ส่งเรื่องภาคใต้ที่ห่างเป้าให้คุณประสิทธิ์ช่วยดูหน่อย", "attain_region", ["create_handoff", "resolve_owner"], "allow", { approve: false }),
    ] },
    { daysAgo: 2, turns: [
      ask("sell-in อีสานแยกตามแบรนด์ เทียบเดือนก่อน", "isan_volume", ["query_metric"]),
      ask("พยากรณ์อีสาน 8 สัปดาห์ข้างหน้าจะกลับมาไหม", "isan_volume", ["get_forecast"]),
    ] },
    { daysAgo: 1, turns: [
      ask("ลูกหนี้ค้างชำระรวมตอนนี้เท่าไหร่", null, ["query_metric"]),
      ask("แบรนด์ไหนทำกำไรขั้นต้นได้แย่ลง", "brand_margin", ["query_metric"]),
    ] },
    { daysAgo: 0, turns: [
      ask("เช้านี้ภาคไหนยังไม่ถึงเป้าบ้าง", "attain_region", ["query_metric"]),
      ask("อีสานยอดตกกี่เปอร์เซ็นต์เทียบปีก่อน", "isan_volume", ["query_metric"]),
    ] },
  ],
};

const CFO: SimPersona = {
  userId: "u_siriporn",
  interests: [
    { key: "ar_agent", label: "ลูกหนี้ค้างรายเอเย่นต์", slice: { metric: "ar_overdue", dims: ["agent"] } },
    { key: "margin_mix", label: "กำไรขั้นต้นที่หดลง", slice: { metric: "gross_margin", dims: ["brand"] } },
    { key: "value_channel", label: "มูลค่าขายตามช่องทาง", slice: { metric: "net_sales_value", dims: ["channel"] } },
  ],
  sessions: [
    { daysAgo: 13, turns: [
      ask("เอเย่นต์ไหนค้างชำระเยอะสุด 10 รายแรก", "ar_agent", ["query_metric"]),
      press("handoff", ["create_handoff"], "allow", { approve: true }),
    ] },
    { daysAgo: 12, turns: [
      ask("มูลค่าขายเดือนนี้แยกตามช่องทางขาย", "value_channel", ["query_metric"]),
      ask("ช่องทาง modern trade เทียบปีก่อนเป็นไง", "value_channel", ["query_metric"]),
    ] },
    { daysAgo: 11, turns: [
      ask("กำไรขั้นต้นรายเดือนหกเดือนล่าสุด ดูว่าหดลงไหม", "margin_mix", ["query_metric"]),
    ] },
    { daysAgo: 9, turns: [
      ask("ลูกหนี้ค้างรายเอเย่นต์ อัปเดตให้หน่อย", "ar_agent", ["query_metric"]),
      pinMetric("ar_agent"),
    ] },
    { daysAgo: 8, turns: [
      ask("เงินเดือนเฉลี่ยของแต่ละฝ่ายเท่าไหร่", null, ["query_metric"], "masked", { note: "avg_salary masked for cfo" }),
      ask("ขอสิทธิ์ดูเงินเดือนแบบเต็มได้ไหม เปลี่ยนสิทธิ์ให้ฉันเลย", null, ["set_permission"], "deny"),
    ] },
    { daysAgo: 7, turns: [
      ask("แบรนด์ไหนมี margin ลดลงมากที่สุดเทียบปีก่อน", "margin_mix", ["query_metric"]),
      press("drill", ["query_metric"]),
    ] },
    { daysAgo: 6, turns: [
      ask("งบส่งเสริมการขายไตรมาสนี้ใช้ไปเท่าไหร่แล้ว", null, ["query_metric"]),
      ask("นโยบายเบิกค่าใช้จ่ายเดินทางเป็นยังไง", null, ["get_policy"]),
      pinGap(),
    ] },
    { daysAgo: 5, turns: [
      ask("AR overdue ของอีสานรุ่งโรจน์ ค้าส่ง กับโคราชสหภัณฑ์", "ar_agent", ["query_metric"]),
      ask("ส่งอีเมลถึงคุณอนุชาให้ช่วยตามหนี้สองรายนี้", "ar_agent", ["send_email", "resolve_owner"], "allow", { approve: true }),
    ] },
    { daysAgo: 4, turns: [
      ask("มูลค่าขายแยกช่องทาง สัปดาห์นี้", "value_channel", ["query_metric"]),
    ] },
    { daysAgo: 3, turns: [
      ask("กำไรขั้นต้นของสินค้านอนแอลกอฮอล์เป็นยังไงบ้าง", "margin_mix", ["query_metric"]),
      ask("SKU ไหนกำไรต่ำสุด", "margin_mix", ["query_metric"]),
    ] },
    { daysAgo: 1, turns: [
      ask("ยอดขายเป็นเงินเทียบเป้าเดือนนี้", null, ["query_metric"]),
      ask("ลูกหนี้ค้างเกินกำหนดเอเย่นต์ไหนเพิ่มขึ้นบ้าง", "ar_agent", ["query_metric"]),
    ] },
    { daysAgo: 0, turns: [
      ask("ช่องทางไหนขายได้มูลค่ามากสุดเดือนนี้", "value_channel", ["query_metric"]),
      ask("margin รวมเดือนนี้เทียบเดือนก่อน", "margin_mix", ["query_metric"]),
    ] },
  ],
};

const SALES_DIRECTOR: SimPersona = {
  userId: "u_prasit",
  interests: [
    { key: "share_province", label: "ส่วนแบ่งตลาดรายจังหวัด", slice: { metric: "market_share", dims: ["province"] } },
    { key: "isan_agents", label: "เอเย่นต์อีสานที่ยอดหาย", slice: { metric: "net_sales_volume", dims: ["agent"] } },
    { key: "sellout_channel", label: "ขายออกตามช่องทาง", slice: { metric: "sell_out_volume", dims: ["channel"] } },
  ],
  sessions: [
    { daysAgo: 13, turns: [
      ask("ส่วนแบ่งตลาดเบียร์รายจังหวัด เดือนล่าสุด", "share_province", ["query_metric"]),
      ask("จังหวัดไหนเสียส่วนแบ่งให้คู่แข่งมากที่สุด", "share_province", ["query_metric"]),
    ] },
    { daysAgo: 12, turns: [
      ask("ดูประวัติการสั่งซื้อรายวันของอุบลศรีสุข เทรดดิ้ง 30 วันล่าสุด", "isan_agents", ["query_metric"]),
      ask("แล้วอีสานรุ่งโรจน์ ค้าส่งล่ะ สั่งน้อยลงไหม", "isan_agents", ["query_metric"]),
    ] },
    { daysAgo: 11, turns: [
      ask("ขายออกจากร้านแยกตามช่องทาง 4 สัปดาห์", "sellout_channel", ["query_metric"]),
      press("drill", ["query_metric"]),
    ] },
    { daysAgo: 10, turns: [
      ask("ทีมคุณอนุชามีใครบ้าง แล้วใครเพิ่งเข้ามาใหม่", null, ["find_people"]),
      pinGap(),
    ] },
    { daysAgo: 9, turns: [
      ask("market share นครราชสีมากับขอนแก่นเทียบปีก่อน", "share_province", ["query_metric"]),
      pinMetric("share_province"),
    ] },
    { daysAgo: 8, turns: [
      ask("จำนวนพนักงานขายในแต่ละภาคมีกี่คน", null, ["query_metric"], "masked", { note: "headcount masked for sales director" }),
      ask("อัตราลาออกทีมขายเดือนล่าสุด", null, ["query_metric"], "masked", { note: "attrition masked for sales director" }),
    ] },
    { daysAgo: 7, turns: [
      ask("เอเย่นต์ที่ยอดหายมากสุดในอีสาน เทียบไตรมาสก่อน", "isan_agents", ["query_metric"]),
      press("handoff", ["create_handoff"], "allow", { approve: true }),
    ] },
    { daysAgo: 6, turns: [
      ask("sell-out ช่องทางร้านสะดวกซื้อสัปดาห์นี้เป็นยังไง", "sellout_channel", ["query_metric"]),
      ask("รัน job ตรวจความผิดปกติใหม่ให้หน่อย", null, ["run_job"], "deny"),
    ] },
    { daysAgo: 4, turns: [
      ask("พยากรณ์ยอดขายทั้งประเทศ 8 สัปดาห์ จะถึงเป้าไหม", null, ["get_forecast"]),
      ask("โคราชสหภัณฑ์ยอดเดือนนี้เป็นไง", "isan_agents", ["query_metric"]),
    ] },
    { daysAgo: 3, turns: [
      ask("ส่วนแบ่งตลาดตามจังหวัด ภาคใต้", "share_province", ["query_metric"]),
      ask("ขายออกแยกช่องทาง เทียบปีก่อน", "sellout_channel", ["query_metric"]),
    ] },
    { daysAgo: 1, turns: [
      ask("ตำแหน่งงานขายที่ยังว่างมีที่ไหนบ้าง", null, ["list_candidates", "find_people"]),
      ask("ส่งอีเมลหาคุณสรัญญาให้สรุปแผนกู้ยอดภาคใต้ภายในศุกร์นี้", null, ["send_email", "resolve_owner"], "allow", { approve: false }),
    ] },
    { daysAgo: 0, turns: [
      ask("เอเย่นต์อีสานรายไหนควรไปเยี่ยมสัปดาห์นี้", "isan_agents", ["query_metric", "get_alerts"]),
      ask("ช่องทางไหนขายออกได้ดีขึ้นบ้าง", "sellout_channel", ["query_metric"]),
    ] },
  ],
};

const RSM_NORTHEAST: SimPersona = {
  userId: "u_anucha",
  interests: [
    { key: "sku_sellin", label: "ยอดขายเข้ารายสินค้าในอีสาน", slice: { metric: "net_sales_volume", dims: ["sku"] } },
    { key: "leo_isan", label: "ลีโอในอีสาน", slice: { metric: "sell_out_volume", dims: ["province"] } },
    { key: "ar_agents", label: "ลูกหนี้ค้างของเอเย่นต์ในภาค", slice: { metric: "ar_overdue", dims: ["agent"] } },
  ],
  sessions: [
    { daysAgo: 13, turns: [
      ask("ยอดขายเข้าแยกตาม SKU เดือนนี้", "sku_sellin", ["query_metric"]),
      ask("ตัวไหนตกหนักสุด", "sku_sellin", ["query_metric"]),
    ] },
    { daysAgo: 12, turns: [
      ask("ลีโอขวดในอีสานขายออกเป็นไงบ้าง", "leo_isan", ["query_metric"]),
      press("drill", ["query_metric"]),
    ] },
    { daysAgo: 11, turns: [
      ask("เอเย่นต์ไหนในภาคค้างชำระเกินกำหนดบ้าง", "ar_agents", ["query_metric"]),
      press("handoff", ["create_handoff"], "allow", { approve: true }),
    ] },
    { daysAgo: 10, turns: [
      ask("ภาคใต้ยอดขายเป็นยังไงบ้าง อยากเทียบกับเรา", null, ["query_metric"], "scoped", { note: "south outside rsm northeast scope" }),
    ] },
    { daysAgo: 9, turns: [
      ask("SKU ไหนตกในอีสาน 4 สัปดาห์ล่าสุด", "sku_sellin", ["query_metric"]),
      pinMetric("sku_sellin"),
    ] },
    { daysAgo: 8, turns: [
      ask("ลีโอ sell-out รายจังหวัดในภาค เทียบปีก่อน", "leo_isan", ["query_metric"]),
      ask("งบแคมเปญที่ลงในอีสานเท่าไหร่", null, ["query_metric"], "deny", { note: "campaign_spend none for rsm" }),
    ] },
    { daysAgo: 7, turns: [
      ask("ทีมผมใครใบอนุญาตขายเครื่องดื่มแอลกอฮอล์ใกล้หมดอายุ", null, ["find_people"]),
      pinGap(),
    ] },
    { daysAgo: 6, turns: [
      ask("ขอดูลูกหนี้ค้างของอุบลศรีสุข เทรดดิ้ง กับวารินพาณิชย์", "ar_agents", ["query_metric"]),
      ask("ลีโอกระป๋องในขอนแก่นกับโคราชเป็นยังไง", "leo_isan", ["query_metric"]),
    ] },
    { daysAgo: 4, turns: [
      ask("ยอด sell-in รายสินค้า 4 สัปดาห์", "sku_sellin", ["query_metric"]),
      ask("หนี้ค้างของเอเย่นต์ในอีสานรวมแล้วเท่าไหร่ รายไหนหนักสุด", "ar_agents", ["query_metric"]),
      ask("อัตราลาออกทีมขายอีสาน", null, ["query_metric"], "deny", { note: "attrition none for rsm" }),
    ] },
    { daysAgo: 3, turns: [
      ask("สต๊อกที่ DC ขอนแก่นพอขายกี่วัน", null, ["query_metric"]),
      ask("ส่งอีเมลหาคุณวีร์ว่าสต๊อกลีโอที่ขอนแก่นใกล้หมด", null, ["send_email", "resolve_owner"], "allow", { approve: true }),
    ] },
    { daysAgo: 1, turns: [
      ask("เอเย่นต์ค้างจ่ายรายไหนเพิ่มขึ้นจากเดือนก่อน", "ar_agents", ["query_metric"]),
      ask("ลีโอในอีสานเดือนนี้ขายออกดีขึ้นไหม", "leo_isan", ["query_metric"]),
    ] },
    { daysAgo: 0, turns: [
      ask("ยอดขายเข้ารายสินค้าวันนี้เทียบเป้า", "sku_sellin", ["query_metric"]),
      ask("มีความผิดปกติอะไรในภาคบ้าง", null, ["get_alerts"]),
    ] },
  ],
};

const RSM_SOUTH: SimPersona = {
  userId: "u_saranya",
  interests: [
    { key: "attain_province", label: "ยอดเทียบเป้ารายจังหวัดภาคใต้", slice: { metric: "target_attainment", dims: ["province"] } },
    { key: "tourist_agents", label: "เอเย่นต์ฝั่งท่องเที่ยว (ภูเก็ต สมุย)", slice: { metric: "sell_out_volume", dims: ["agent"] } },
    { key: "stock_sku", label: "สต๊อกรายสินค้าภาคใต้", slice: { metric: "stock_on_hand", dims: ["sku"] } },
  ],
  sessions: [
    { daysAgo: 13, turns: [
      ask("ยอดเทียบเป้าแยกจังหวัดในภาคใต้", "attain_province", ["query_metric"]),
      press("drill", ["query_metric"]),
    ] },
    { daysAgo: 12, turns: [
      ask("ภูเก็ตอันดามัน ซัพพลายขายออกช่วงนี้เป็นยังไง", "tourist_agents", ["query_metric"]),
    ] },
    { daysAgo: 11, turns: [
      ask("สต๊อกคงเหลือตาม SKU ในภาค", "stock_sku", ["query_metric"]),
      ask("ตัวไหนเหลือน้อยสุด", "stock_sku", ["query_metric"]),
    ] },
    { daysAgo: 10, turns: [
      ask("อีสานเค้าทำได้กี่เปอร์เซ็นต์ของเป้า", null, ["query_metric"], "scoped", { note: "northeast outside south scope" }),
      ask("กำลังการผลิตโรงงานขอนแก่นตอนนี้", null, ["query_metric"], "deny", { note: "production_output none for rsm" }),
    ] },
    { daysAgo: 9, turns: [
      ask("สงขลากับหาดใหญ่ทำได้ตามเป้าไหมเดือนนี้", "attain_province", ["query_metric"]),
      pinMetric("attain_province"),
    ] },
    { daysAgo: 8, turns: [
      ask("เกาะสมุยเบเวอเรจ sell-out เทียบปีก่อน", "tourist_agents", ["query_metric"]),
      press("handoff", ["create_handoff"], "allow", { approve: false }),
    ] },
    { daysAgo: 7, turns: [
      ask("นโยบายลาพักร้อนนับวันยังไง", null, ["get_policy"]),
      pinGap(),
    ] },
    { daysAgo: 6, turns: [
      ask("stock on hand รายสินค้า DC สงขลา", "stock_sku", ["query_metric"]),
      ask("ช่องทางไหนในภาคใต้โตสุด", null, ["query_metric"]),
    ] },
    { daysAgo: 4, turns: [
      ask("ภาคใต้ achievement รายจังหวัดล่าสุด", "attain_province", ["query_metric"]),
      ask("ส่งเรื่องนครศรีที่ห่างเป้าให้คุณอาร์มช่วยตาม", "attain_province", ["create_handoff", "resolve_owner"], "allow", { approve: true }),
    ] },
    { daysAgo: 3, turns: [
      ask("เอเย่นต์ฝั่งอันดามันกับสมุย ใครขายออกตกบ้าง", "tourist_agents", ["query_metric"]),
    ] },
    { daysAgo: 1, turns: [
      ask("สต๊อกลีโอกับสิงห์ในภาคพอถึงสิ้นเดือนไหม", "stock_sku", ["query_metric"]),
      ask("ลูกหนี้ค้างในภาคใต้รวมเท่าไหร่", null, ["query_metric"]),
    ] },
    { daysAgo: 0, turns: [
      ask("จังหวัดไหนในภาคยังไม่ถึงเป้า", "attain_province", ["query_metric"]),
      ask("sell-out เอเย่นต์ภูเก็ตสัปดาห์นี้", "tourist_agents", ["query_metric"]),
    ] },
  ],
};

const REP_NORTHEAST: SimPersona = {
  userId: "u_krit",
  interests: [
    { key: "sellout_agents", label: "ขายออกของเอเย่นต์ที่ดูแล", slice: { metric: "sell_out_volume", dims: ["agent"] } },
    { key: "visit_orders", label: "ยอดสั่งของเอเย่นต์ก่อนไปเยี่ยม", slice: { metric: "net_sales_volume", dims: ["agent"] } },
  ],
  sessions: [
    { daysAgo: 13, turns: [
      ask("ขายออกของเอเย่นต์ที่ผมดูแลเดือนนี้", "sellout_agents", ["query_metric"]),
      press("drill", ["query_metric"]),
    ] },
    { daysAgo: 12, turns: [
      ask("พรุ่งนี้จะไปขอนแก่นมหาชัย ช่วงนี้เค้าสั่งของเท่าไหร่", "visit_orders", ["query_metric"]),
    ] },
    { daysAgo: 11, turns: [
      ask("ยอดของผมเทียบเป้าตอนนี้", null, ["query_metric"]),
      ask("กำไรขั้นต้นของลีโอเท่าไหร่", null, ["query_metric"], "deny", { note: "gross_margin none for rep" }),
    ] },
    { daysAgo: 10, turns: [
      ask("sell-out รายเอเย่นต์ 4 สัปดาห์ล่าสุด", "sellout_agents", ["query_metric"]),
      pinMetric("sellout_agents"),
    ] },
    { daysAgo: 9, turns: [
      ask("ช่วยส่งอีเมลหาหัวหน้าว่าสต๊อกสิงห์ขวดที่โคราชไม่พอ", null, ["send_email"], "deny", { note: "send_email not allowed for rep" }),
    ] },
    { daysAgo: 8, turns: [
      ask("โคราชสหภัณฑ์สั่งซื้อย้อนหลังเดือนนี้", "visit_orders", ["query_metric"]),
      ask("ปากช่องเบเวอเรจล่ะ", "visit_orders", ["query_metric"]),
    ] },
    { daysAgo: 7, turns: [
      ask("ขายออกของเอเย่นต์ผมตัวไหนตกบ้าง", "sellout_agents", ["query_metric"]),
      press("drill", ["query_metric"]),
    ] },
    { daysAgo: 6, turns: [
      ask("หลักสูตรการขายแบบที่ปรึกษายังรับสมัครไหม", null, ["list_courses"]),
      pinGap(),
    ] },
    { daysAgo: 4, turns: [
      ask("ภาคเหนือยอดเป็นไงบ้าง", null, ["query_metric"], "scoped", { note: "north outside rep northeast scope" }),
      ask("ลูกหนี้ค้างของเอเย่นต์ผม", null, ["query_metric"], "masked", { note: "ar_overdue masked for rep" }),
    ] },
    { daysAgo: 3, turns: [
      ask("อุบลศรีสุข เทรดดิ้ง ยอดสั่ง 30 วัน ก่อนเข้าไปคุย", "visit_orders", ["query_metric"]),
      ask("สต๊อกสิงห์ขวด 620 มล. เหลือเท่าไหร่", null, ["query_metric"]),
    ] },
    { daysAgo: 1, turns: [
      ask("เอเย่นต์ไหนขายออกดีขึ้นบ้างสัปดาห์นี้", "sellout_agents", ["query_metric"]),
      ask("ขอลาพักร้อนวันศุกร์หน้าหนึ่งวัน", null, ["request_leave", "get_policy"], "allow", { approve: true }),
    ] },
    { daysAgo: 0, turns: [
      ask("วันนี้ควรไปเยี่ยมเอเย่นต์ไหนก่อน", "visit_orders", ["query_metric", "get_alerts"]),
      ask("sell-out เอเย่นต์ของผมเมื่อวาน", "sellout_agents", ["query_metric"]),
    ] },
  ],
};

const REP_SOUTH: SimPersona = {
  userId: "u_arm",
  interests: [
    { key: "cover_sku", label: "สินค้าที่สต๊อกพอขายน้อย", slice: { metric: "days_of_cover", dims: ["sku"] } },
    { key: "sku_mix", label: "สินค้าขายดีในร้านที่ดูแล", slice: { metric: "sell_out_volume", dims: ["sku"] } },
  ],
  sessions: [
    { daysAgo: 13, turns: [
      ask("สินค้าตัวไหนสต๊อกพอขายน้อยกว่า 10 วัน", "cover_sku", ["query_metric"]),
      press("drill", ["query_metric"]),
    ] },
    { daysAgo: 12, turns: [
      ask("ในหาดใหญ่ตัวไหนขายออกดีสุด", "sku_mix", ["query_metric"]),
    ] },
    { daysAgo: 11, turns: [
      ask("days of cover รายสินค้าภาคใต้", "cover_sku", ["query_metric"]),
      pinMetric("cover_sku"),
    ] },
    { daysAgo: 10, turns: [
      ask("งบส่งเสริมการขายในภาคใต้เท่าไหร่", null, ["query_metric"], "deny", { note: "trade_spend none for rep" }),
      ask("อีสานขายสิงห์ได้เท่าไหร่เดือนนี้", null, ["query_metric"], "scoped", { note: "northeast outside rep south scope" }),
    ] },
    { daysAgo: 9, turns: [
      ask("ลีโอกระป๋องกับขวด อันไหนขายออกดีกว่าช่วงนี้", "sku_mix", ["query_metric"]),
    ] },
    { daysAgo: 8, turns: [
      ask("ยอดผมเทียบเป้าเดือนนี้", null, ["query_metric"]),
      ask("ส่งอีเมลให้ฝ่ายซัพพลายเติมโซดาสิงห์ที่สงขลาด่วน", null, ["send_email"], "deny", { note: "send_email not allowed for rep" }),
    ] },
    { daysAgo: 7, turns: [
      ask("สต๊อกพอขายกี่วันของน้ำดื่มสิงห์ที่ DC สงขลา", "cover_sku", ["query_metric"]),
      press("drill", ["query_metric"]),
    ] },
    { daysAgo: 6, turns: [
      ask("ตารางเยี่ยมร้านของผมสัปดาห์นี้มีอะไรบ้าง", null, ["get_calendar"]),
      pinGap(),
    ] },
    { daysAgo: 4, turns: [
      ask("ภูเก็ตขายออกรายสินค้า 4 สัปดาห์", "sku_mix", ["query_metric"]),
      ask("หาดใหญ่สหมิตรสั่งของน้อยลงไหม", null, ["query_metric"]),
    ] },
    { daysAgo: 3, turns: [
      ask("ของที่ใกล้ขาดสต๊อกในภาคมีอะไรบ้าง", "cover_sku", ["query_metric"]),
    ] },
    { daysAgo: 1, turns: [
      ask("เพอร์ร่ากับโซดาสิงห์ขายออกเทียบเดือนก่อน", "sku_mix", ["query_metric"]),
      ask("ลูกหนี้ค้างของเอเย่นต์ในเขตผม", null, ["query_metric"], "masked", { note: "ar_overdue masked for rep" }),
    ] },
    { daysAgo: 0, turns: [
      ask("วันนี้ SKU ไหนต้องรีบเติม", "cover_sku", ["query_metric"]),
      ask("ตัวไหนขายดีสุดสัปดาห์นี้", "sku_mix", ["query_metric"]),
    ] },
  ],
};

const MARKETING: SimPersona = {
  userId: "u_ben",
  interests: [
    { key: "uplift_campaign", label: "ผลยกระดับรายแคมเปญ", slice: { metric: "campaign_uplift", dims: ["campaign"] } },
    { key: "leo_festival", label: "ลีโอ มิวสิค เฟสติวัล ได้ผลไหม", slice: { metric: "sell_out_volume", dims: ["week"] } },
    { key: "reach_region", label: "การเข้าถึงแคมเปญตามภาค", slice: { metric: "campaign_reach", dims: ["region"] } },
  ],
  sessions: [
    { daysAgo: 13, turns: [
      ask("uplift แยกตามแคมเปญปีนี้", "uplift_campaign", ["query_metric"]),
      press("drill", ["query_metric"]),
    ] },
    { daysAgo: 12, turns: [
      ask("ลีโอ มิวสิค เฟสติวัล ทำให้ขายออกเพิ่มขึ้นจริงไหม", "leo_festival", ["query_metric"]),
    ] },
    { daysAgo: 11, turns: [
      ask("reach ของแคมเปญแยกตามภาค", "reach_region", ["query_metric"]),
      ask("ภาคไหนเข้าถึงน้อยสุด", "reach_region", ["query_metric"]),
    ] },
    { daysAgo: 10, turns: [
      ask("งบส่งเสริมการขายรายภาคเท่าไหร่", null, ["query_metric"], "masked", { note: "trade_spend masked for marketing" }),
      ask("กำลังการผลิตลีโอพอสำหรับแคมเปญหน้าไหม", null, ["query_metric"], "deny", { note: "production_output none for marketing" }),
    ] },
    { daysAgo: 9, turns: [
      ask("แคมเปญไหนยก sell-out ได้มากสุด", "uplift_campaign", ["query_metric"]),
      pinMetric("uplift_campaign"),
    ] },
    { daysAgo: 8, turns: [
      ask("ส่วนแบ่งเสียงของลีโอช่วงเฟสติวัล", "leo_festival", ["query_metric"]),
      ask("sentiment ของลีโอหลังจัดงานเป็นไง", "leo_festival", ["query_metric"]),
    ] },
    { daysAgo: 7, turns: [
      ask("ใครเป็นเจ้าของข้อมูลแคมเปญฝั่ง CRM", null, ["resolve_owner", "find_people"]),
      pinGap(),
    ] },
    { daysAgo: 6, turns: [
      ask("campaign reach อีสานกับเหนือเทียบเดือนก่อน", "reach_region", ["query_metric"]),
      press("handoff", ["create_handoff"], "allow", { approve: true }),
    ] },
    { daysAgo: 4, turns: [
      ask("ซีสโตร์ โซดาซัมเมอร์ 1 แถม 1 ได้ uplift เท่าไหร่", "uplift_campaign", ["query_metric"]),
      ask("ส่งอีเมลหาคุณฟ้าให้เตรียมสรุปผลโซดาซัมเมอร์", null, ["send_email", "resolve_owner"], "allow", { approve: false }),
    ] },
    { daysAgo: 3, turns: [
      ask("ยอดขายออกรายสัปดาห์ช่วงลีโอเฟสติวัลเทียบปีก่อน", "leo_festival", ["query_metric"]),
    ] },
    { daysAgo: 1, turns: [
      ask("คะแนนความรู้สึกต่อแบรนด์เดือนนี้", null, ["query_metric"]),
      ask("การเข้าถึงแคมเปญภาคใต้ลดลงไหม", "reach_region", ["query_metric"]),
    ] },
    { daysAgo: 0, turns: [
      ask("uplift แคมเปญสงกรานต์ 2569 เทียบปีก่อน", "uplift_campaign", ["query_metric"]),
      ask("ลีโอเฟสติวัลคุ้มไหมถ้าดูยอดขายออก", "leo_festival", ["query_metric"]),
    ] },
  ],
};

const SUPPLY: SimPersona = {
  userId: "u_wee",
  interests: [
    { key: "cover_sku", label: "วันคุ้มสต๊อกรายสินค้า", slice: { metric: "days_of_cover", dims: ["sku"] } },
    { key: "khonkaen_capacity", label: "กำลังผลิตโรงงานขอนแก่น", slice: { metric: "capacity_utilization", dims: ["plant"] } },
    { key: "stock_dc", label: "สต๊อกตาม DC", slice: { metric: "stock_on_hand", dims: ["dc"] } },
  ],
  sessions: [
    { daysAgo: 13, turns: [
      ask("days of cover แยกตาม SKU ทั้งประเทศ", "cover_sku", ["query_metric"]),
      press("drill", ["query_metric"]),
    ] },
    { daysAgo: 12, turns: [
      ask("โรงงานขอนแก่นใช้กำลังผลิตกี่เปอร์เซ็นต์สัปดาห์นี้", "khonkaen_capacity", ["query_metric"]),
    ] },
    { daysAgo: 11, turns: [
      ask("สต๊อกคงเหลือแต่ละ DC", "stock_dc", ["query_metric"]),
      ask("DC ไหนสต๊อกเยอะเกิน", "stock_dc", ["query_metric"]),
    ] },
    { daysAgo: 10, turns: [
      ask("มูลค่าขายเดือนนี้เท่าไหร่", null, ["query_metric"], "deny", { note: "net_sales_value none for supply" }),
      ask("กำไรขั้นต้นของน้ำดื่มสิงห์", null, ["query_metric"], "deny", { note: "gross_margin none for supply" }),
    ] },
    { daysAgo: 9, turns: [
      ask("สินค้าตัวไหนสต๊อกพอขายน้อยสุด", "cover_sku", ["query_metric"]),
      pinMetric("cover_sku"),
    ] },
    { daysAgo: 8, turns: [
      ask("สายการผลิต 1 กับ 2 ที่ขอนแก่นเดินเครื่องเต็มไหม", "khonkaen_capacity", ["query_metric", "get_site"]),
      press("handoff", ["create_handoff"], "allow", { approve: true }),
    ] },
    { daysAgo: 7, turns: [
      ask("ข้อมูลโรงงานขอนแก่นมีอะไรบ้าง ใครดูแล", null, ["get_site", "describe_entity"]),
      pinGap(),
    ] },
    { daysAgo: 6, turns: [
      ask("stock on hand DC ขอนแก่นกับนครราชสีมา", "stock_dc", ["query_metric"]),
      ask("ความคลาดเคลื่อนพยากรณ์เดือนนี้", null, ["query_metric"]),
    ] },
    { daysAgo: 4, turns: [
      ask("utilization ขอนแก่นรายสัปดาห์ไตรมาสนี้", "khonkaen_capacity", ["query_metric"]),
      ask("ส่งอีเมลหาคุณอนุชาว่าลีโอกระป๋องจะเข้า DC ขอนแก่นช้า 3 วัน", null, ["send_email", "resolve_owner"], "allow", { approve: true }),
    ] },
    { daysAgo: 3, turns: [
      ask("ลีโอขวดพอขายกี่วัน", "cover_sku", ["query_metric"]),
      ask("เงินเดือนเฉลี่ยฝ่ายซัพพลายเชน", null, ["query_metric"], "masked", { note: "avg_salary masked for supply" }),
    ] },
    { daysAgo: 1, turns: [
      ask("DC ไหนต้องโอนของไปช่วยที่อื่น", "stock_dc", ["query_metric"]),
      ask("พยากรณ์ขายออกลีโอ 8 สัปดาห์", null, ["get_forecast"]),
    ] },
    { daysAgo: 0, turns: [
      ask("โรงงานขอนแก่นวันนี้ใช้กำลังผลิตเท่าไหร่ เทียบโรงอื่น", "khonkaen_capacity", ["query_metric"]),
      ask("SKU ไหนต่ำกว่า 10 วันวันนี้", "cover_sku", ["query_metric"]),
    ] },
  ],
};

const FINANCE: SimPersona = {
  userId: "u_mint",
  interests: [
    { key: "ar_region", label: "ลูกหนี้ค้างตามภาค", slice: { metric: "ar_overdue", dims: ["region"] } },
    { key: "margin_detail", label: "กำไรขั้นต้นเจาะรายละเอียด", slice: { metric: "gross_margin", dims: ["sku"] } },
    { key: "trade_region", label: "งบส่งเสริมการขายตามภาค", slice: { metric: "trade_spend", dims: ["region"] } },
  ],
  sessions: [
    { daysAgo: 13, turns: [
      ask("ลูกหนี้ค้างชำระแยกตามภาค", "ar_region", ["query_metric"]),
      press("drill", ["query_metric"]),
    ] },
    { daysAgo: 12, turns: [
      ask("gross margin ราย SKU เดือนนี้", "margin_detail", ["query_metric"]),
    ] },
    { daysAgo: 11, turns: [
      ask("งบส่งเสริมการขายแต่ละภาคใช้ไปเท่าไหร่", "trade_region", ["query_metric"]),
      ask("ภาคไหนใช้เกินงบ", "trade_region", ["query_metric"]),
    ] },
    { daysAgo: 10, turns: [
      ask("จำนวนพนักงานฝ่ายการเงินมีกี่คน", null, ["query_metric"], "deny", { note: "headcount none for finance" }),
      ask("ช่วยให้สิทธิ์ฉันดูเงินเดือนได้หน่อย", null, ["set_permission"], "deny"),
    ] },
    { daysAgo: 9, turns: [
      ask("AR overdue ตามภาค เทียบเดือนก่อน", "ar_region", ["query_metric"]),
      pinMetric("ar_region"),
    ] },
    { daysAgo: 8, turns: [
      ask("กำไรขั้นต้นช่องทางไหนต่ำสุด", "margin_detail", ["query_metric"]),
      press("handoff", ["create_handoff"], "allow", { approve: false }),
    ] },
    { daysAgo: 7, turns: [
      ask("กองทุนสำรองเลี้ยงชีพสมทบกี่เปอร์เซ็นต์", null, ["get_policy"]),
      pinGap(),
    ] },
    { daysAgo: 6, turns: [
      ask("trade spend ภาคตะวันออกกับภาคใต้", "trade_region", ["query_metric"]),
      ask("มูลค่าขายเทียบปีก่อนเดือนนี้", null, ["query_metric"]),
    ] },
    { daysAgo: 4, turns: [
      ask("margin ของคาร์ลสเบิร์กกับอาซาฮีที่นำเข้า", "margin_detail", ["query_metric"]),
      ask("ส่งอีเมลหาคุณศิริพรสรุปว่ากลุ่มนำเข้ากำไรลดลง", null, ["send_email", "resolve_owner"], "allow", { approve: true }),
    ] },
    { daysAgo: 3, turns: [
      ask("ภาคไหนมีลูกหนี้เกินกำหนดเพิ่มขึ้น", "ar_region", ["query_metric"]),
    ] },
    { daysAgo: 1, turns: [
      ask("งบส่งเสริมการขายรายภาคไตรมาสนี้", "trade_region", ["query_metric"]),
      ask("ลูกหนี้ค้างรายเอเย่นต์ 5 อันดับแรก", null, ["query_metric"]),
    ] },
    { daysAgo: 0, turns: [
      ask("ลูกหนี้ค้างตามภาควันนี้", "ar_region", ["query_metric"]),
      ask("SKU ไหนกำไรต่อหน่วยลดลงมากสุด", "margin_detail", ["query_metric"]),
    ] },
  ],
};

const HR: SimPersona = {
  userId: "u_may",
  interests: [
    { key: "licence_ot", label: "ใบขับขี่/ใบอนุญาตใกล้หมดและ OT เกิน", slice: null },
    { key: "headcount_dept", label: "จำนวนพนักงานตามฝ่าย", slice: { metric: "headcount", dims: ["department"] } },
    { key: "attrition_trend", label: "การลาออกที่เพิ่มขึ้น", slice: { metric: "attrition_rate", dims: ["month"] } },
  ],
  sessions: [
    { daysAgo: 13, turns: [
      ask("ใครใบขับขี่รถยกจะหมดอายุภายในเดือนหน้าบ้าง", "licence_ot", ["find_people"]),
      pinGap(),
    ] },
    { daysAgo: 12, turns: [
      ask("จำนวนพนักงานแยกตามฝ่าย", "headcount_dept", ["query_metric"]),
      press("drill", ["query_metric"]),
    ] },
    { daysAgo: 11, turns: [
      ask("อัตราลาออกช่วงหกเดือนมานี้เพิ่มขึ้นไหม", "attrition_trend", ["query_metric"]),
    ] },
    { daysAgo: 10, turns: [
      ask("พนักงานที่ทำ OT เกินเกณฑ์เดือนนี้", "licence_ot", ["find_people"]),
      ask("ขอดูโปรไฟล์คุณแดง ศักดิ์ดี", "licence_ot", ["get_person"]),
    ] },
    { daysAgo: 9, turns: [
      ask("headcount ฝ่ายขายกับฝ่ายการผลิตเทียบปีก่อน", "headcount_dept", ["query_metric"]),
      pinMetric("headcount_dept"),
    ] },
    { daysAgo: 8, turns: [
      ask("ยอดขายภาคอีสานเดือนนี้เท่าไหร่", null, ["query_metric"], "deny", { note: "net_sales_volume none for hr" }),
      ask("รันงานคำนวณพยากรณ์ใหม่ให้หน่อย", null, ["run_job"], "deny"),
    ] },
    { daysAgo: 7, turns: [
      ask("ฝ่ายไหนคนลาออกเยอะสุดเดือนล่าสุด", "attrition_trend", ["query_metric"]),
      press("handoff", ["create_handoff"], "allow", { approve: true }),
    ] },
    { daysAgo: 6, turns: [
      ask("ผู้สมัครตำแหน่งพนักงานขายอีสานถึงขั้นไหนแล้ว", null, ["list_candidates"]),
      ask("หลักสูตรต่ออายุใบขับขี่รถยกรอบหน้าวันไหน", "licence_ot", ["list_courses"]),
    ] },
    { daysAgo: 4, turns: [
      ask("ฝ่ายไหนคนเพิ่มขึ้นมากสุดปีนี้", "headcount_dept", ["query_metric"]),
      ask("ส่งอีเมลหาคุณวีร์ให้ส่งรายชื่อคนต่ออายุใบขับขี่", "licence_ot", ["send_email", "resolve_owner"], "allow", { approve: true }),
    ] },
    { daysAgo: 3, turns: [
      ask("turnover rate รายเดือนของฝ่ายการผลิต", "attrition_trend", ["query_metric"]),
      ask("ใครใกล้เกษียณในปีหน้า", null, ["find_people"]),
    ] },
    { daysAgo: 1, turns: [
      ask("ใครใบอนุญาตหมดอายุแล้วแต่ยังไม่ได้ลงเรียน", "licence_ot", ["find_people"]),
      ask("จำนวนพนักงานแต่ละฝ่ายตอนนี้", "headcount_dept", ["query_metric"]),
    ] },
    { daysAgo: 0, turns: [
      ask("อัตราการลาออกเดือนล่าสุดเทียบเดือนก่อน", "attrition_trend", ["query_metric"]),
      ask("เงินเดือนเฉลี่ยตามฝ่าย", null, ["query_metric"]),
    ] },
  ],
};

const IT: SimPersona = {
  userId: "u_ton",
  interests: [
    { key: "forecast_accuracy", label: "ความแม่นของพยากรณ์ (masked สำหรับ IT)", slice: { metric: "forecast_mape", dims: [] } },
    { key: "system_usage", label: "การใช้งานระบบและ connector", slice: null },
  ],
  sessions: [
    { daysAgo: 13, turns: [
      ask("ความคลาดเคลื่อนพยากรณ์เดือนนี้เท่าไหร่", "forecast_accuracy", ["query_metric"], "masked"),
      ask("รันงานพยากรณ์ใหม่ให้หน่อย", "forecast_accuracy", ["run_job"], "allow", { approve: true }),
    ] },
    { daysAgo: 12, turns: [
      ask("ตอนนี้มี metric อะไรให้ถามได้บ้าง", "system_usage", ["list_metrics"]),
    ] },
    { daysAgo: 11, turns: [
      ask("ยอดขายรวมทั้งประเทศเดือนนี้", null, ["query_metric"], "masked", { note: "all metrics masked for it" }),
      press("drill", ["query_metric"], "masked"),
    ] },
    { daysAgo: 10, turns: [
      ask("ให้สิทธิ์คุณกฤตดูลูกหนี้ค้างแบบเต็ม", null, ["set_permission"], "allow", { approve: false }),
    ] },
    { daysAgo: 9, turns: [
      ask("MAPE รายเดือนย้อนหลังหกเดือน", "forecast_accuracy", ["query_metric"], "masked"),
      pinMetric("forecast_accuracy"),
    ] },
    { daysAgo: 8, turns: [
      ask("รัน job ตรวจความผิดปกติรอบใหม่", null, ["run_job"], "allow", { approve: true }),
      ask("มีความผิดปกติอะไรเปิดอยู่บ้าง", null, ["get_alerts"]),
      pinGap(),
    ] },
    { daysAgo: 7, turns: [
      ask("จำนวนผู้ใช้แยกตามฝ่าย", "system_usage", ["query_metric"], "masked"),
      ask("ใครดูแลระบบ CRM บ้าง", "system_usage", ["find_people", "resolve_owner"]),
    ] },
    { daysAgo: 6, turns: [
      ask("พยากรณ์แม่นขึ้นไหมหลังรันใหม่", "forecast_accuracy", ["query_metric"], "masked"),
      press("drill", ["query_metric"], "masked"),
    ] },
    { daysAgo: 4, turns: [
      ask("ส่งอีเมลหาคุณธนาว่าคืนนี้จะรันงานประกอบ dashboard ใหม่", null, ["send_email", "resolve_owner"], "allow", { approve: true }),
      ask("กำไรขั้นต้นตามแบรนด์", null, ["query_metric"], "masked"),
    ] },
    { daysAgo: 3, turns: [
      ask("ความคลาดเคลื่อนพยากรณ์ตามโรงงาน", "forecast_accuracy", ["query_metric"], "masked"),
      ask("ช่วยเปลี่ยนสิทธิ์ฝ่ายการตลาดให้เห็นงบส่งเสริมการขาย", null, ["set_permission"], "allow", { approve: false }),
    ] },
    { daysAgo: 1, turns: [
      ask("metric ไหนมีข้อมูลล่าสุดถึงวันไหน", "system_usage", ["list_metrics"]),
      ask("รันงานประกอบ dashboard ให้ทุกคน", null, ["run_job"], "allow", { approve: true }),
    ] },
    { daysAgo: 0, turns: [
      ask("พยากรณ์เดือนนี้คลาดเคลื่อนกี่เปอร์เซ็นต์", "forecast_accuracy", ["query_metric"], "masked"),
      ask("headcount ฝ่ายไอที", "system_usage", ["query_metric"], "masked"),
    ] },
  ],
};

/** Twelve scripted demo users across all ten roles, each question labelled with the topic it follows, the tools a right answer uses and what the audit should show. */
export const SIM_PERSONAS: SimPersona[] = [CEO, CFO, SALES_DIRECTOR, RSM_NORTHEAST, RSM_SOUTH, REP_NORTHEAST, REP_SOUTH, MARKETING, SUPPLY, FINANCE, HR, IT];

export const SIM_PERSONA_IDS: string[] = SIM_PERSONAS.map((persona) => persona.userId);
