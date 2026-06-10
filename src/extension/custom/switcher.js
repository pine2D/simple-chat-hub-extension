// custom/switcher.js — 运行于各 AI 站 iframe (all_frames)。收指令切模型/思考档。
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

  // 适配器：后续任务填充 think/fast
  const adapters = {
    "claude.ai": {
      // 打开模型下拉。click 会 toggle，故先探测是否已开，必要时重试一次。
      _open: async function () {
        const { waitFor, openMenu } = window.__SCH;
        const trig = document.querySelector('[data-testid="model-selector-dropdown"]');
        if (!trig) throw new Error("Claude: 模型按钮未找到");
        if (!document.querySelector('[role="menuitemradio"]')) openMenu(trig);
        let ok = await waitFor(() => document.querySelector('[role="menuitemradio"]'), 1500);
        if (!ok) { openMenu(trig); ok = await waitFor(() => document.querySelector('[role="menuitemradio"]')); }
        if (!ok) throw new Error("Claude: 模型菜单未展开");
      },
      _selectModel: async function (re) {
        const { waitFor, findByText, clickEl, sleep, escMenus } = window.__SCH;
        await this._open();
        const item = await waitFor(() => findByText('[role="menuitemradio"]', re));
        if (!item) { escMenus(); throw new Error("Claude: 未找到模型 " + re); }
        clickEl(item);
        await sleep(700); // 切模型后界面会重建，留足时间
      },
      // 设思考强度，兼容两种布局（切模型会重置思考态，故必须选完模型后再设）：
      //  - 宽屏(独立标签)：模型下拉里有 effort 子菜单 Low/Medium/High/Extra/Max
      //  - 窄屏(chatHub 内嵌)：只有一个 "Adaptive thinking" 开关([role=switch] aria-checked)
      // on=true → 最高思考(Max / 开关打开)；on=false → 最低(Low / 开关关闭)
      _setThinking: async function (on) {
        const { waitFor, findByText, openMenu, clickEl, sleep, escMenus } = window.__SCH;
        await this._open();
        // 窄屏：思考开关
        const sw = [...document.querySelectorAll('[role="switch"]')]
          .find((s) => /thinking/i.test((s.getAttribute("aria-label") || "") +
            (s.closest('[role="menuitem"]') ? s.closest('[role="menuitem"]').textContent : "")));
        if (sw) {
          const isOn = sw.getAttribute("aria-checked") === "true";
          if (isOn !== on) clickEl(sw);
          await sleep(300); escMenus(); return;
        }
        // 宽屏：effort 子菜单
        const trig = document.querySelector('[data-testid="effort-menu-trigger"]');
        if (trig) {
          openMenu(trig);
          const lvl = await waitFor(() => findByText('[role="menuitemradio"]', on ? /max/i : /^low/i));
          if (lvl) clickEl(lvl);
          await sleep(300); escMenus(); return;
        }
        // 两者都没有：模型已切，思考档不可用，静默跳过
        escMenus();
      },
      think: async function () {
        await this._selectModel(/opus\s*4\.8/i);
        await this._setThinking(true);
      },
      fast: async function () {
        // 均衡快速档 = Sonnet + 关闭深度思考
        await this._selectModel(/sonnet/i);
        await this._setThinking(false);
      },
    },
    "chatgpt.com": {
      // composer 上的 Intelligence 按钮，文案=当前档(Instant/Medium/High)
      _anchor: function () {
        return [...document.querySelectorAll('button[aria-haspopup="menu"]')]
          .find((x) => /^(Instant|Medium|High)$/i.test((x.textContent || "").trim()));
      },
      _select: async function (re) {
        const { waitFor, findByText, openMenu, clickEl, sleep, escMenus } = window.__SCH;
        const anchor = this._anchor();
        if (!anchor) throw new Error("ChatGPT: Intelligence 按钮未找到");
        const probe = () => {
          const wrap = document.querySelector("[data-radix-popper-content-wrapper]") || document;
          return findByText('[role="menuitemradio"]', re, wrap);
        };
        if (!probe()) openMenu(anchor);
        let item = await waitFor(probe, 1500);
        if (!item) { openMenu(anchor); item = await waitFor(probe); }
        if (!item) { escMenus(); throw new Error("ChatGPT: 未找到档位 " + re); }
        clickEl(item);
        await sleep(400);
      },
      think: async function () { await this._select(/^high$/i); },
      fast: async function () { await this._select(/^medium$/i); },
    },
    "gemini.google.com": {
      _MI: "button.mat-mdc-menu-item, [role=menuitem]",
      // 用稳定的 aria-label 定位（"Open mode picker, currently …"）。窄屏布局下该按钮没有
      // aria-haspopup，故不能按 [aria-haspopup] 过滤，直接全量 button 里匹配 aria-label。
      _modelBtn: function () {
        const byAria = [...document.querySelectorAll("button")]
          .find((b) => /mode picker/i.test(b.getAttribute("aria-label") || ""));
        return byAria || document.querySelector('button[class*="input-area-swi"]');
      },
      _openModelMenu: async function () {
        const { waitFor, openMenu } = window.__SCH;
        const btn = this._modelBtn();
        if (!btn) throw new Error("Gemini: 模型按钮未找到");
        if (!document.querySelector(this._MI)) openMenu(btn);
        let ok = await waitFor(() => document.querySelector(this._MI), 1500);
        if (!ok) { openMenu(btn); ok = await waitFor(() => document.querySelector(this._MI)); }
        if (!ok) throw new Error("Gemini: 模型菜单未展开");
      },
      _selectModel: async function (re) {
        const { waitFor, findByText, clickEl, sleep, escMenus } = window.__SCH;
        await this._openModelMenu();
        const item = await waitFor(() => findByText(this._MI, re));
        if (!item) { escMenus(); throw new Error("Gemini: 未找到模型 " + re); }
        clickEl(item);
        await sleep(700);
      },
      // Material 嵌套子菜单(Thinking level → Standard/Extended)用合成事件打开不稳定：
      // 仅在子菜单项尚未出现时才点 trigger(避免 toggle 关掉)，轮询重试，命中后 Enter+click 双保险提交。
      // re 须能区分子菜单项与 trigger(如 /^extended/i 只匹配项 "Extended …"，不匹配 "Thinking level Extended")。
      _setThinking: async function (re) {
        const { waitFor, findByText, openMenu, clickEl, sleep, escMenus } = window.__SCH;
        await this._openModelMenu();
        const trig = await waitFor(() => findByText(this._MI, /thinking level/i));
        if (!trig) { escMenus(); return; } // 无思考档控件，跳过
        let lvl = null;
        for (let i = 0; i < 6 && !lvl; i++) {
          if (!findByText(this._MI, re)) openMenu(trig);
          lvl = await waitFor(() => findByText(this._MI, re), 600);
        }
        if (!lvl) { escMenus(); return; } // 子菜单始终打不开：模型已切，思考档放弃(不报错)
        if (lvl.focus) lvl.focus();
        lvl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        clickEl(lvl);
        await sleep(400);
        escMenus();
      },
      think: async function () {
        await this._selectModel(/3\.1\s*pro\b/i);
        await this._setThinking(/^extended/i);
      },
      fast: async function () {
        await this._selectModel(/3\.5\s*flash\b/i);
      },
    },
  };

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

  // 暴露给行为测试（注入主世界后直接调用）
  window.__SCH = { runMode, adapters, waitFor, findByText, openMenu, clickEl, sleep, escMenus };
})();
