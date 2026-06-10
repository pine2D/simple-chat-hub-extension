// custom/panel.js — 运行于 chatHub.html(扩展页, 顶层帧)。注入两个按钮并广播指令。
(function () {
  "use strict";

  const HOSTS = ["claude.ai", "chatgpt.com", "gemini.google.com",
    "doubao.com", "deepseek.com", "qianwen.com", "kimi.com",
    "yuanbao.tencent.com", "chatglm.cn"];

  function broadcast(mode) {
    let sent = 0;
    document.querySelectorAll("iframe").forEach((f) => {
      let url;
      try { url = new URL(f.src); } catch (e) { return; }
      if (!HOSTS.some((h) => url.hostname.includes(h))) return;
      try {
        f.contentWindow.postMessage({ source: "SCH_TOGGLE", mode }, url.origin);
        sent++;
      } catch (e) {}
    });
    return sent;
  }

  function makeBtn(label, mode, cls) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.dataset.schBtn = mode;
    if (cls) {
      b.className = cls; // 复用 New Chat 的 Ant 按钮样式，外观完全一致(含 hover/暗色)
      b.style.marginLeft = "8px";
    } else {
      // 兜底：找不到锚点(floating 模式)时的独立样式
      b.style.cssText =
        "margin-left:8px;padding:4px 12px;border-radius:9px;border:1px solid rgba(127,127,127,.35);" +
        "background:rgba(127,127,127,.06);color:inherit;cursor:pointer;font-size:13px;white-space:nowrap;line-height:1.5";
    }
    b.addEventListener("click", () => broadcast(mode));
    return b;
  }

  // 多策略定位顶部「新对话」锚点（i18n 文案会变，故多管齐下）
  function findAnchor() {
    const re = /新对话|新建对话|新對話|New chat|New Chat|新規/i;
    const cand = [...document.querySelectorAll("button,a,[role=button]")].find((el) => {
      const t = (el.textContent || "") + " " + (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("title") || "");
      return re.test(t);
    });
    if (cand) return cand;
    return document.querySelector("#app button, header button, [class*=header] button");
  }

  function inject() {
    if (document.querySelector("[data-sch-group]")) return true;
    const anchor = findAnchor();
    const cls = anchor ? anchor.className : "";
    const group = document.createElement("span");
    group.dataset.schGroup = "1";
    group.style.cssText = "display:inline-flex;align-items:center;vertical-align:middle";
    group.appendChild(makeBtn("🧠 深度思考", "think", cls));
    group.appendChild(makeBtn("⚡ 快速模型", "fast", cls));
    if (anchor && anchor.parentElement) {
      anchor.insertAdjacentElement("afterend", group);
    } else {
      group.style.cssText += ";position:fixed;top:8px;right:12px;z-index:2147483647;background:rgba(127,127,127,.12);padding:4px 8px;border-radius:10px";
      document.body.appendChild(group);
    }
    return true;
  }

  let tries = 0;
  const iv = setInterval(() => {
    if (document.querySelector("[data-sch-group]")) { clearInterval(iv); return; }
    try { inject(); } catch (e) {}
    if (++tries > 50) clearInterval(iv);
  }, 200);
})();
