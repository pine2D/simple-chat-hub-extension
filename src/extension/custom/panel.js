// custom/panel.js — 运行于 chatHub.html(扩展页, 顶层帧)。注入两个按钮并广播指令。
(function () {
  "use strict";

  // 站点清单在 custom/hosts.js（chatHub.html 中先加载）
  const HOSTS = (window.__SCH_HOSTS || []).map((h) => h.host);

  function broadcast(msg) {
    let sent = 0;
    document.querySelectorAll("iframe").forEach((f) => {
      let url;
      try { url = new URL(f.src); } catch (e) { return; }
      if (!HOSTS.some((h) => url.hostname === h || url.hostname.endsWith("." + h))) return;
      // 未导航到平台的 iframe（同源空文档，contentDocument 可读）跳过：
      // content script 未注入，postMessage 只会产生 targetOrigin 不匹配的异步噪音错误
      try { if (f.contentDocument) return; } catch (e) {}
      try {
        f.contentWindow.postMessage(msg, url.origin);
        sent++;
      } catch (e) {}
    });
    return sent;
  }

  // 统一 32×32 方形几何（六枚按钮一致的关键）
  function squareBtn(b) {
    b.style.width = "32px";
    b.style.minWidth = "32px";
    b.style.height = "32px";
    b.style.padding = "0";
    b.style.display = "inline-flex";
    b.style.alignItems = "center";
    b.style.justifyContent = "center";
  }

  function baseBtn(label, cls) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (cls) {
      b.className = cls; // 复用 New Chat 的 Ant 按钮样式，外观完全一致(含 hover/暗色)
    } else {
      // 兜底：找不到锚点(floating 模式)时的独立样式
      b.style.cssText =
        "border-radius:9px;border:1px solid rgba(127,127,127,.35);" +
        "background:rgba(127,127,127,.06);color:inherit;cursor:pointer;font-size:14px;line-height:1";
    }
    squareBtn(b);
    b.style.marginLeft = "4px";
    return b;
  }

  // 上游 Send / New Chat 图标化：隐藏文字 span、title 保留原文、统一方形几何。
  // 纯 DOM 整形不碰 bundle；React 重渲染会还原，故由外部定时幂等重应用。
  function iconifyUpstream() {
    const scope = document.querySelector('[class*="input-wrapper"]') || document;
    ["send", "edit"].forEach((name) => {
      const icon = scope.querySelector("button .anticon-" + name);
      const btn = icon && icon.closest("button");
      if (!btn || btn.dataset.schIconified) return;
      const label = (btn.textContent || "").trim();
      const texts = [...btn.querySelectorAll(":scope > span:not(.ant-btn-icon)")];
      if (!texts.length) return;
      texts.forEach((s) => { s.style.display = "none"; });
      if (label && !btn.title) btn.title = label;
      squareBtn(btn);
      btn.dataset.schIconified = "1";
    });
  }

  function makeBtn(label, mode, title, cls) {
    const b = baseBtn(label, cls);
    b.dataset.schBtn = mode;
    b.title = title;
    b.addEventListener("click", () => broadcast({ source: "SCH_TOGGLE", mode }));
    return b;
  }

  // 批量指令按钮：属性必须用 data-sch-cmd——status.js 靠 [data-sch-btn] 点击触发徽标 pending，不能误触
  function makeCmdBtn(label, cmd, title, cls) {
    const b = baseBtn(label, cls);
    b.dataset.schCmd = cmd;
    b.title = title;
    b.addEventListener("click", () => broadcast({ source: "SCH_CMD", cmd }));
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

  // emoji 字形基线偏移会让按钮组比锚点低几 px：实测与锚点的 top 差值并补偿（字体晚加载，延迟再校一次）
  function alignTo(anchor, group) {
    const fix = () => {
      try {
        const d = anchor.getBoundingClientRect().top - group.getBoundingClientRect().top;
        if (Math.abs(d) < 0.5) return;
        const cur = parseFloat(group.style.top) || 0;
        group.style.position = "relative";
        group.style.top = (cur + d).toFixed(1) + "px";
      } catch (e) {}
    };
    fix();
    setTimeout(fix, 800);
  }

  function inject() {
    if (document.querySelector("[data-sch-group]")) return true;
    const anchor = findAnchor();
    const cls = anchor ? anchor.className : "";
    const group = document.createElement("span");
    group.dataset.schGroup = "1";
    group.style.cssText = "display:inline-flex;align-items:center;vertical-align:middle";
    group.appendChild(makeBtn("🧠", "think", "深度思考", cls));
    group.appendChild(makeBtn("⚡", "fast", "快速模型", cls));
    // U+FE0E 强制文本呈现：emoji 呈现的 U+23F9 是蓝色方块，与黑白操作图标(✕/✎/➤)割裂
    group.appendChild(makeCmdBtn("\u23F9\uFE0E", "stop", "停止所有平台生成", cls));
    group.appendChild(makeCmdBtn("✕", "clear", "清空所有输入框（再点恢复）", cls));
    if (anchor && anchor.parentElement) {
      anchor.insertAdjacentElement("afterend", group);
      alignTo(anchor, group);
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

  // 上游按钮整形：注入后开始，低频幂等重应用（React 重渲染会还原文字 span）
  setInterval(() => { try { iconifyUpstream(); } catch (e) {} }, 1500);
})();
