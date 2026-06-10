// custom/switcher.js — 核心：helpers + 注册表 + message 监听 + runMode。
// 各站点适配器在 custom/adapters.js 注册到 window.__SCH.adapters（content_scripts 顺序保证其后加载）。
(function () {
  "use strict";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 轮询等待：fn 返回真值则返回之，超时返回 null
  async function waitFor(fn, timeout = 3500, step = 120) {
    const t0 = Date.now();
    for (;;) {
      let v = null;
      try { v = fn(); } catch (e) { v = null; }
      if (v) return v;
      if (Date.now() - t0 > timeout) return null;
      await sleep(step);
    }
  }

  // 在节点集合里按正则找命中文本的元素
  function findByText(selector, re, root) {
    const nodes = [...(root || document).querySelectorAll(selector)];
    return nodes.find((n) => re.test((n.textContent || "").trim())) || null;
  }

  // Radix / Angular-Material 菜单靠 pointer 事件开，单纯 click 可能不开
  function openMenu(el) {
    if (!el) return;
    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((t) =>
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }))
    );
  }

  function clickEl(el) {
    if (!el) return false;
    // 菜单项也用完整 pointer 序列，单纯 click 在 Radix/Material 上可能不提交
    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((t) =>
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }))
    );
    return true;
  }

  function escMenus() {
    for (let i = 0; i < 2; i++) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }
  }

  function toast(msg, ok) {
    try {
      const d = document.createElement("div");
      d.textContent = msg;
      d.style.cssText =
        "position:fixed;z-index:2147483647;right:12px;bottom:12px;padding:8px 12px;" +
        "border-radius:8px;font:13px/1.4 sans-serif;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25);" +
        "background:" + (ok ? "#16a34a" : "#dc2626");
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 2500);
    } catch (e) {}
  }

  // 注册表：适配器由 adapters.js 填充
  const adapters = {};

  function pickAdapter() {
    const h = location.hostname;
    const key = Object.keys(adapters).find((k) => h.includes(k));
    return key ? adapters[key] : null;
  }

  async function runMode(mode) {
    const a = pickAdapter();
    if (!a || !a[mode]) return;
    try {
      escMenus(); // 清掉可能残留的菜单，保证从干净态开始
      await sleep(150);
      await a[mode]();
      toast(mode === "think" ? "已切到：深度思考" : "已切到：快速模型", true);
    } catch (e) {
      toast("切换失败：" + (e && e.message ? e.message : e), false);
    }
  }

  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (!d || d.source !== "SCH_TOGGLE") return;
    if (d.mode === "think" || d.mode === "fast") runMode(d.mode);
  });

  // 暴露给 adapters.js 注册与行为测试（注入主世界后直接调用）
  window.__SCH = { runMode, adapters, waitFor, findByText, openMenu, clickEl, sleep, escMenus };
})();
