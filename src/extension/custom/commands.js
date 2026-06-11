// custom/commands.js — iframe 侧：批量指令（SCH_CMD）。stop=停止生成(通用启发式)，clear=清空输入框(留底，再点恢复)。
// 通用实现优先；适配器可提供同名 async 方法 stop()/clear() 覆盖（抛错即静默放弃）。
(function () {
  "use strict";

  const S = window.__SCH;
  if (!S) return; // content_scripts 顺序保证 switcher.js 先加载；极端注入失败时不抛错

  // —— 停止生成：可见按钮按 aria/title/文案 启发式匹配（长词在前，降低短模式误中概率）——
  const STOP_RE = /停止生成|停止回答|stop generating|stop response|停止|^stop$/i;

  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 &&
      r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  }

  function label(el) {
    return ((el.getAttribute("aria-label") || "") + " " +
      (el.getAttribute("title") || "") + " " + (el.textContent || "")).trim();
  }

  function genericStop() {
    const hit = [...document.querySelectorAll("button, [role=button]")]
      .filter(visible)
      .find((b) => STOP_RE.test(label(b)));
    if (!hit) return false; // 未在生成：静默无操作，不刷 toast
    S.clickEl(hit);
    return true;
  }

  // —— 清空输入框：原文留底在内存，输入框为空时再点恢复 ——
  let lastCleared = null;

  function readComposer(el) {
    return el.tagName === "TEXTAREA" ? el.value : el.innerText;
  }

  function setComposer(el, text) {
    if (el.tagName === "TEXTAREA") {
      // 原生 setter 绕过 React 受控组件的值劫持，再派发 input 让框架感知
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      set.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      // contenteditable：execCommand 产生真实 input 事件序列，ProseMirror/Lexical 类编辑器认
      el.focus();
      document.execCommand("selectAll", false, null);
      if (text) document.execCommand("insertText", false, text);
      else document.execCommand("delete", false, null);
    }
  }

  function runClear() {
    const el = S.findComposer();
    if (!el) return;
    const cur = (readComposer(el) || "").trim();
    if (cur) {
      lastCleared = readComposer(el);
      setComposer(el, "");
      S.toast("已清空（再点恢复）", true);
    } else if (lastCleared) {
      setComposer(el, lastCleared);
      lastCleared = null;
      S.toast("已恢复", true);
      el.focus();
    }
  }

  async function runCmd(cmd) {
    try {
      const key = Object.keys(S.adapters).find((k) => location.hostname.includes(k));
      const adapter = key ? S.adapters[key] : null;
      if (adapter && typeof adapter[cmd] === "function") { await adapter[cmd](); return; }
      if (cmd === "stop") { if (genericStop()) S.toast("已停止", true); return; }
      if (cmd === "clear") runClear();
    } catch (e) {}
  }

  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (!d || d.source !== "SCH_CMD") return;
    if (!S.isTrustedOrigin(ev.origin)) return;
    if (d.cmd === "stop" || d.cmd === "clear") runCmd(d.cmd);
  });
})();
