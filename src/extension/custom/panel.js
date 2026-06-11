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

  function baseBtn(label, cls) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (cls) {
      b.className = cls; // 复用 New Chat 的 Ant 按钮样式，外观完全一致(含 hover/暗色)
      b.style.marginLeft = "4px";
      b.style.padding = "4px 8px"; // 纯图标按钮压缩 Ant 默认 15px 内边距，给统一输入框让位
    } else {
      // 兜底：找不到锚点(floating 模式)时的独立样式
      b.style.cssText =
        "margin-left:4px;padding:4px 8px;border-radius:9px;border:1px solid rgba(127,127,127,.35);" +
        "background:rgba(127,127,127,.06);color:inherit;cursor:pointer;font-size:13px;white-space:nowrap;line-height:1.5";
    }
    return b;
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
    group.appendChild(makeCmdBtn("⏹", "stop", "停止所有平台生成", cls));
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
})();
