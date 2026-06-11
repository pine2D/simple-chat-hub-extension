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
        "position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);" +
        "max-width:90%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:8px 12px;" +
        "border-radius:8px;font:13px/1.4 sans-serif;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25);" +
        "background:" + (ok ? "#16a34a" : "#dc2626");
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 2500);
    } catch (e) {}
  }

  // 切换成功后把光标放回输入框：取视口内可见、面积最大的编辑区
  function focusComposer() {
    try {
      const cands = [...document.querySelectorAll('textarea, [contenteditable="true"]')]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 80 && r.height > 20 &&
          r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth);
      if (!cands.length) return;
      cands.sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
      cands[0].el.focus();
    } catch (e) {}
  }

  // 注册表：适配器由 adapters-intl.js / adapters-cn.js 填充
  const adapters = {};

  function pickAdapter() {
    const h = location.hostname;
    const key = Object.keys(adapters).find((k) => h.includes(k));
    return key ? adapters[key] : null;
  }

  async function runMode(mode) {
    const a = pickAdapter();
    if (!a || !a[mode]) return;
    // 站点偶发渲染抖动会导致首次失败：静默重试一次，仍失败才报错
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        escMenus(); // 清掉可能残留的菜单，保证从干净态开始
        await sleep(attempt ? 600 : 150);
        await a[mode]();
        toast(mode === "think" ? "已切到：深度思考" : "已切到：快速模型", true);
        focusComposer();
        try { document.dispatchEvent(new CustomEvent("sch:switched")); } catch (e) {}
        pushState();
        return;
      } catch (e) {
        if (attempt) {
          toast("切换失败：" + (e && e.message ? e.message : e), false);
          pushState({ failed: true });
        }
      }
    }
  }

  // 当前档位（同步快速读）；经 pushState 供父页 HUD 消费
  function getState() {
    const a = pickAdapter();
    try { return a && a.state ? a.state() : null; } catch (e) { return null; }
  }

  // 只读健康自检；经 pushState(withDiag) 供父页 HUD 消费
  function diagnose() {
    const a = pickAdapter();
    if (!a) return [{ name: "站点适配器", ok: false }];
    if (a.diagnose) { try { return a.diagnose(); } catch (e) { return [{ name: "diagnose 异常", ok: false }]; } }
    return [{ name: "档位可读", ok: getState() != null }];
  }

  // 只接受来自本扩展页面(chatHub)的指令：发送方 origin 必须是本扩展的 chrome-extension:// 源，
  // 避免任意网页/子帧 postMessage 触发模型切换。
  function isTrustedOrigin(origin) {
    if (!origin || !/^chrome-extension:\/\//.test(origin)) return false;
    try {
      const id = chrome && chrome.runtime && chrome.runtime.id;
      return !!id && origin === "chrome-extension://" + id; // fail-closed：拿不到 id 即拒绝
    } catch (e) {
      return false;
    }
  }

  // —— 状态推送：仅 iframe 场景（chatHub 内）启用 ——
  function extOrigin() {
    try {
      const id = chrome && chrome.runtime && chrome.runtime.id;
      return id ? "chrome-extension://" + id : null; // fail-closed：拿不到 id 不推送
    } catch (e) {
      return null;
    }
  }

  // 向父页(chatHub)推送当前档位；withDiag 附带只读体检结果，failed 标记切换失败
  function pushState(opts) {
    opts = opts || {};
    if (window.top === window) return; // 顶层帧（单独访问站点）不推送
    const target = extOrigin();
    if (!target) return;
    let checks = null;
    if (opts.withDiag) {
      try { checks = diagnose(); } catch (e) { checks = null; }
    }
    try {
      window.parent.postMessage(
        { source: "SCH_STATE", host: location.hostname, state: getState(), checks, failed: opts.failed || undefined },
        target
      );
    } catch (e) {}
  }

  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (!d || !isTrustedOrigin(ev.origin)) return;
    if (d.source === "SCH_STATE_REQ") { pushState({ withDiag: true }); return; }
    if (d.source !== "SCH_TOGGLE") return;
    if (d.mode === "think" || d.mode === "fast") runMode(d.mode);
  });

  // 注入后延迟一次只读体检推送（等站点渲染完）——打开 chatHub 即可见适配器健康度
  if (window.top !== window) {
    setTimeout(() => pushState({ withDiag: true }), 5000);
  }

  // 暴露给 adapters.js 注册与行为测试（注入主世界后直接调用）
  window.__SCH = { runMode, adapters, waitFor, findByText, openMenu, clickEl, sleep, escMenus, getState, diagnose, pushState };
})();
