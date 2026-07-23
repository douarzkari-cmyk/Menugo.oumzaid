/**
 * MenuGo Smart Assistant
 * ------------------------------------------------------------
 * مساعد ذكي خفيف كيجاوب على أسئلة الزباين بالدارجة
 * ما كيحتاجش API ولا سيرفر - كيخدم غير بجافاسكريبت
 *
 * طريقة الاستعمال:
 * 1) زيد هاد السطر قبل </body> فالصفحة العمومية ديال الشوب:
 *    <script src="menugo-assistant.js"></script>
 *
 * 2) من بعد ما تكمل تحميل بيانات الشوب من Firestore (shopData)، دير:
 *    initMenuGoAssistant(shopData);
 *
 *    مثال:
 *    db.collection('shops').doc(SHOP_ID).get().then(doc => {
 *      const shopData = doc.data();
 *      // ... الكود ديالك لعرض المنيو ...
 *      initMenuGoAssistant(shopData);
 *    });
 * ------------------------------------------------------------
 */

function initMenuGoAssistant(shopData) {
  if (!shopData) {
    console.warn("MenuGo Assistant: shopData ماشي موجودة");
    return;
  }

  const primary = (shopData.colors && shopData.colors.primary) || "#d4af37";
  const accent = (shopData.colors && shopData.colors.accent) || "#1a1a1a";

  // ---------- 1) نبنيو الواجهة (الزر + نافذة الشات) ----------
  const style = document.createElement("style");
  style.textContent = `
    #mga-btn {
      position: fixed; bottom: 20px; right: 20px; z-index: 9999;
      width: 58px; height: 58px; border-radius: 50%;
      background: ${primary}; color: #fff; border: none;
      box-shadow: 0 4px 14px rgba(0,0,0,.3);
      font-size: 26px; cursor: pointer; display: flex;
      align-items: center; justify-content: center;
    }
    #mga-box {
      position: fixed; bottom: 90px; right: 20px; z-index: 9999;
      width: 320px; max-width: 90vw; height: 420px; max-height: 70vh;
      background: #fff; border-radius: 14px; box-shadow: 0 8px 30px rgba(0,0,0,.25);
      display: none; flex-direction: column; overflow: hidden;
      font-family: -apple-system, Arial, sans-serif;
    }
    #mga-box.open { display: flex; }
    #mga-head {
      background: ${accent}; color: #fff; padding: 12px 14px;
      font-weight: bold; display: flex; justify-content: space-between; align-items: center;
    }
    #mga-msgs {
      flex: 1; overflow-y: auto; padding: 10px; background: #f7f7f7;
    }
    .mga-msg { margin: 6px 0; padding: 8px 12px; border-radius: 12px; max-width: 80%; font-size: 14px; line-height: 1.4; }
    .mga-bot { background: #eee; color: #222; align-self: flex-start; }
    .mga-user { background: ${primary}; color: #fff; margin-left: auto; text-align: right; }
    #mga-msgs { display: flex; flex-direction: column; }
    #mga-input-row { display: flex; border-top: 1px solid #ddd; }
    #mga-input {
      flex: 1; border: none; padding: 12px; font-size: 14px; outline: none; direction: rtl;
    }
    #mga-send {
      background: ${primary}; color: #fff; border: none; padding: 0 16px; cursor: pointer; font-size: 14px;
    }
  `;
  document.head.appendChild(style);

  const btn = document.createElement("button");
  btn.id = "mga-btn";
  btn.innerHTML = "💬";
  document.body.appendChild(btn);

  const box = document.createElement("div");
  box.id = "mga-box";
  box.innerHTML = `
    <div id="mga-head">
      <span>مساعد ${shopData.name || "المحل"}</span>
      <span id="mga-close" style="cursor:pointer;">✕</span>
    </div>
    <div id="mga-msgs"></div>
    <div id="mga-input-row">
      <input id="mga-input" placeholder="كتب سؤالك..." />
      <button id="mga-send">إرسال</button>
    </div>
  `;
  document.body.appendChild(box);

  const msgsEl = box.querySelector("#mga-msgs");
  const inputEl = box.querySelector("#mga-input");

  function addMsg(text, who) {
    const d = document.createElement("div");
    d.className = "mga-msg " + (who === "user" ? "mga-user" : "mga-bot");
    d.textContent = text;
    msgsEl.appendChild(d);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  btn.onclick = () => {
    box.classList.toggle("open");
    if (msgsEl.children.length === 0) {
      addMsg(`أهلا بيك! 👋 نقدر نجاوبك على: الأسعار، الأوقات، العنوان، أو أي سؤال على المنتجات.`, "bot");
    }
  };
  box.querySelector("#mga-close").onclick = () => box.classList.remove("open");

  box.querySelector("#mga-send").onclick = handleSend;
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSend();
  });

  function handleSend() {
    const q = inputEl.value.trim();
    if (!q) return;
    addMsg(q, "user");
    inputEl.value = "";
    setTimeout(() => addMsg(answerQuestion(q), "bot"), 300);
  }

  // ---------- 2) منطق الجواب (مطابقة كلمات مفتاحية) ----------
  function normalize(txt) {
    return (txt || "")
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .trim();
  }

  function findProduct(q) {
    const nq = normalize(q);
    const cats = shopData.categories || [];
    for (const cat of cats) {
      for (const item of cat.items || []) {
        if (nq.includes(normalize(item.name))) return item;
      }
    }
    return null;
  }

  function listCategories() {
    const cats = shopData.categories || [];
    if (!cats.length) return "ما عندناش أقسام مسجلة دابا.";
    return "الأقسام ديالنا: " + cats.map(c => c.name).join("، ");
  }

  function answerQuestion(q) {
    const nq = normalize(q);

    // 1) سؤال على منتج معين (سعر أو توفر)
    const product = findProduct(q);
    if (product) {
      if (nq.includes("تمن") || nq.includes("شحال") || nq.includes("ثمن") || nq.includes("سعر")) {
        return `${product.name} بـ ${product.price} درهم.` + (product.desc ? ` (${product.desc})` : "");
      }
      return `${product.name} كاين عندنا${product.price ? " بـ " + product.price + " درهم" : ""}.${product.desc ? " " + product.desc : ""}`;
    }

    // 2) الأوقات
    if (nq.includes("وقت") || nq.includes("ساعة") || nq.includes("حل") || nq.includes("سد") || nq.includes("خدامين")) {
      const hours = shopData.hours;
      if (hours && hours.length) {
        return "أوقات الخدمة: " + hours.map(h => (typeof h === "string" ? h : `${h.day || ""} ${h.open || ""}-${h.close || ""}`)).join(" | ");
      }
      return "معلومات الأوقات ماشي محددة حاليا، عيط لينا للتأكد.";
    }

    // 3) العنوان / الموقع
    if (nq.includes("فين") || nq.includes("عنوان") || nq.includes("موقع") || nq.includes("لوكاسيون")) {
      return shopData.address ? `العنوان ديالنا: ${shopData.address}` : "العنوان غير متوفر دابا، عيط لينا باش نوضحو ليك.";
    }

    // 4) التيليفون / التواصل
    if (nq.includes("تيليفون") || nq.includes("رقم") || nq.includes("هاتف") || nq.includes("اتصال") || nq.includes("عيط")) {
      return shopData.phone ? `تقدر تتصل بينا على: ${shopData.phone}` : "الرقم غير متوفر دابا.";
    }

    // 5) الطلب / التوصيل
    if (nq.includes("طلب") || nq.includes("توصيل") || nq.includes("كوموند") || nq.includes("ديليفري")) {
      return shopData.whatsapp
        ? `باش تطلب، صيفط لينا رسالة على واتساب: ${shopData.whatsapp}`
        : "تقدر تختار المنتجات من المنيو وتصيفط الطلب مباشرة.";
    }

    // 6) العروض
    if (nq.includes("عرض") || nq.includes("تخفيض") || nq.includes("بروموسيون") || nq.includes("solde")) {
      const offers = shopData.offers || [];
      if (offers.length) return "العروض الحالية: " + offers.map(o => o.title || o.name || "").join("، ");
      return "ماكاينش عروض حاليا، تابعنا باش توصلك آخر التخفيضات.";
    }

    // 7) قائمة الأقسام
    if (nq.includes("منيو") || nq.includes("قائمة") || nq.includes("منتوجات") || nq.includes("شنو عندكم")) {
      return listCategories();
    }

    // 8) جواب افتراضي
    return "معذرة ما فهمتش السؤال مزيان 🙏 تقدر تسولني على: الأسعار، الأوقات، العنوان، الطلب، أو العروض.";
  }
}
