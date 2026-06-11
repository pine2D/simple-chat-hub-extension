// custom/status.js — chatHub 父页：档位状态 HUD。监听 iframe 推送的 SCH_STATE，
// 在按钮组旁渲染各平台徽标（紫=think 琥珀=fast 灰=未知 红=自检/切换失败），点击看 diagnose 明细。
(function () {
  "use strict";

  const HOSTS = window.__SCH_HOSTS || [];
  const COLORS = { think: "#7c3aed", fast: "#d97706", unknown: "#9ca3af", fail: "#dc2626" };
  const states = new Map(); // hosts.js 的 host 键 -> {state, checks, failed, ts, pending}

  const hostEntry = (hostname) => HOSTS.find((h) => hostname.includes(h.host)) || null;

  // 当前打开的平台 iframe（按 HOSTS 过滤）
  function liveFrames() {
    const out = [];
    document.querySelectorAll("iframe").forEach((f) => {
      let url;
      try { url = new URL(f.src); } catch (e) { return; }
      const entry = hostEntry(url.hostname);
      if (entry) out.push({ frame: f, entry, origin: url.origin });
    });
    return out;
  }

  function isTrustedSiteOrigin(origin) {
    let u;
    try { u = new URL(origin); } catch (e) { return false; }
    return u.protocol === "https:" && !!hostEntry(u.hostname);
  }

  function colorOf(rec) {
    if (!rec || rec.pending) return COLORS.unknown;
    if (rec.failed || (rec.checks || []).some((c) => !c.ok)) return COLORS.fail;
    return COLORS[rec.state] || COLORS.unknown;
  }

  function requestState(lf) {
    try { lf.frame.contentWindow.postMessage({ source: "SCH_STATE_REQ" }, lf.origin); } catch (e) {}
  }

  let pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } }

  function showPop(badge, entry) {
    closePop();
    const rec = states.get(entry.host);
    const lines = [entry.host + " — " + (rec && rec.state ? (rec.state === "think" ? "深度思考" : "快速模型") : "未知")];
    ((rec && rec.checks) || []).forEach((c) => lines.push((c.ok ? "✓ " : "✗ ") + c.name));
    if (rec && rec.failed) lines.push("✗ 上次切换失败");
    lines.push(rec ? "更新于 " + new Date(rec.ts).toLocaleTimeString() : "尚未收到状态");
    const r = badge.getBoundingClientRect();
    pop = document.createElement("div");
    pop.dataset.schPop = "1";
    pop.style.cssText =
      "position:fixed;z-index:2147483647;top:" + (r.bottom + 6) + "px;left:" + r.left + "px;" +
      "background:#1f2937;color:#f9fafb;font:12px/1.6 sans-serif;padding:8px 10px;border-radius:8px;" +
      "box-shadow:0 4px 12px rgba(0,0,0,.35);white-space:pre";
    pop.textContent = lines.join("\n");
    document.body.appendChild(pop);
  }

  function render() {
    const hud = document.querySelector("[data-sch-hud]");
    if (!hud) return;
    hud.textContent = "";
    liveFrames().forEach((lf) => {
      const rec = states.get(lf.entry.host);
      const b = document.createElement("span");
      b.dataset.schBadge = lf.entry.host;
      b.textContent = lf.entry.abbr;
      b.title = lf.entry.host;
      b.style.cssText =
        "display:inline-block;min-width:20px;text-align:center;margin-left:4px;padding:2px 5px;" +
        "border-radius:999px;font:11px/1.4 sans-serif;color:#fff;cursor:pointer;user-select:none;" +
        "background:" + colorOf(rec) + ";opacity:" + (rec && rec.pending ? ".45" : "1");
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        requestState(lf);
        showPop(b, lf.entry);
      });
      hud.appendChild(b);
    });
  }

  // iframe 推送的状态（origin 白名单校验，否则丢弃）
  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (!d || d.source !== "SCH_STATE") return;
    if (!isTrustedSiteOrigin(ev.origin)) return;
    const entry = hostEntry(String(d.host || ""));
    if (!entry) return;
    states.set(entry.host, {
      state: d.state === "think" || d.state === "fast" ? d.state : null,
      checks: Array.isArray(d.checks) ? d.checks : null,
      failed: !!d.failed,
      ts: Date.now(),
      pending: false,
    });
    render();
  });

  // think/fast 按钮点击 → 全徽标 pending，8s 未回报转灰；点击其他区域关闭 popover
  document.addEventListener("click", (ev) => {
    const t = ev.target;
    if (t && t.closest && t.closest("[data-sch-btn]")) {
      liveFrames().forEach((lf) => {
        const rec = states.get(lf.entry.host) || { state: null, checks: null, failed: false, ts: Date.now() };
        states.set(lf.entry.host, Object.assign({}, rec, { pending: true }));
      });
      render();
      setTimeout(() => {
        let stale = false;
        states.forEach((rec, k) => {
          if (rec.pending) { states.set(k, Object.assign({}, rec, { pending: false, state: null })); stale = true; }
        });
        if (stale) render();
      }, 8000);
      return;
    }
    closePop();
  });

  // iframe 增删 → 重渲染（徽标跟随窗口开关；仅在变更涉及 iframe 时触发，防自激）
  new MutationObserver((muts) => {
    const touched = muts.some((m) =>
      [...m.addedNodes, ...m.removedNodes].some(
        (n) => n.nodeType === 1 && (n.tagName === "IFRAME" || (n.querySelector && n.querySelector("iframe")))
      )
    );
    if (touched) render();
  }).observe(document.documentElement, { childList: true, subtree: true });

  // 挂载：等 panel.js 注入按钮组后追加 HUD 容器（floating 兜底时随组固定右上角）
  let tries = 0;
  const iv = setInterval(() => {
    if (document.querySelector("[data-sch-hud]")) { clearInterval(iv); return; }
    const group = document.querySelector("[data-sch-group]");
    if (group) {
      const hud = document.createElement("span");
      hud.dataset.schHud = "1";
      hud.style.cssText = "display:inline-flex;align-items:center;vertical-align:middle;margin-left:6px";
      group.appendChild(hud);
      clearInterval(iv);
      render();
      liveFrames().forEach(requestState); // 启动时主动拉一次（覆盖「HUD 晚于 iframe 首推」的时序）
      return;
    }
    if (++tries > 60) clearInterval(iv);
  }, 250);
})();
