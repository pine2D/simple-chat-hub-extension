// custom/hosts.js — chatHub 父页共享站点清单（panel.js / status.js 共用，先于两者加载）。
// 加新站点时与 manifest.json content_scripts.matches、adapters-*.js 保持同步。
window.__SCH_HOSTS = [
  { host: "claude.ai", abbr: "Cl" },
  { host: "chatgpt.com", abbr: "GPT" },
  { host: "gemini.google.com", abbr: "Gem" },
  { host: "doubao.com", abbr: "豆" },
  { host: "deepseek.com", abbr: "DS" },
  { host: "qianwen.com", abbr: "千" },
  { host: "kimi.com", abbr: "Ki" },
  { host: "yuanbao.tencent.com", abbr: "元" },
  { host: "chatglm.cn", abbr: "智" },
];
