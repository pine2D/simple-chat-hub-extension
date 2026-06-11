# simple-chat-hub-extension（fork 定制）

上游 `jackyr/simple-chat-hub-extension` 的 fork：chatHub 把多个 AI 站点放进**同屏 iframe** 聚合聊天。
本 fork 的定制全部在 `src/extension/custom/`：顶栏「🧠 深度思考 / ⚡ 快速模型」按钮，一键切换所有已打开平台的模型档位。
姊妹仓库：`~/projects/ai-model-switcher`（独立 MV3 扩展，覆盖**单独访问**站点场景 + 快捷键）。

## 双仓同步规约（重要）

两仓的站点适配器**同源**，修任何一边的适配器后必须同步另一边：

| 本仓 | 姊妹仓 |
|---|---|
| `src/extension/custom/adapters-intl.js` / `adapters-cn.js` | `content/adapters-intl.js` / `adapters-cn.js` |
| 注册表前缀 `window.__SCH` | `window.__AMS` |

同步脚本：
```bash
scripts/sync-adapters.sh check   # 检查漂移（normalize 后 diff，给出方向建议）
scripts/sync-adapters.sh pull    # 姊妹仓 → 本仓
scripts/sync-adapters.sh push    # 本仓 → 姊妹仓
```

**加新站点时本仓要改三处**（漏一处=该站静默不工作）：
1. `src/extension/manifest.json` 的 `content_scripts.matches`
2. 适配器（adapters-intl/cn）
3. **`custom/hosts.js` 的 `__SCH_HOSTS` 数组**（panel.js 广播与 status.js HUD 共用），与 manifest 是两份独立清单（实战教训）

**不要给本仓加 chrome.commands**：Alt+T/Alt+Y 已属于姊妹仓，同一组合键 Chrome 只能绑给一个扩展。

## 架构

```
src/extension/            上游 2.4.0 解包产物(unpacked)，bundle 已压缩 → 当黑盒
├── custom/panel.js       chatHub 页注入按钮(复用 New Chat 的 className) + 按 iframe.src 广播
├── custom/switcher.js    核心：helpers + toast(顶部居中) + __SCH 注册表 + runMode(重试+聚焦)
│                         + postMessage 监听(origin 校验 fail-closed，只认本扩展)
├── custom/adapters-*.js  9 站适配器(与姊妹仓同源)
└── assets/chunk-*.js     上游 bundle —— 除两处外不要改
```
- 通信契约：父页 `postMessage({source:"SCH_TOGGLE", mode:"think"|"fast"})` → iframe content script。
- chatHub 的 iframe 宽约 **625-639px**，触发各站**紧凑布局**（与独立标签页 DOM 不同）——适配器必须双布局兼容；新适配先用 `Emulation.setDeviceMetricsOverride {width:639}` 仿真验证。
- 元宝/智谱清言要进 chatHub，需在扩展设置里加自定义平台（Name+URL，见 CUSTOM_CONFIG_EXAMPLE.md）。

## 上游 bundle 的既有补丁（同步上游新版本时需重打）

1. `chunk-7dbf4e81.js`：iframe `allow` 串删除 5 个无效 token（document-domain/web-share/allow-modals/top-navigation/forms）——消除 Unrecognized feature 警告。
2. `chunk-299a0bd1.js` + `chunk-a682ba63.js`：`async fireEvent(t,n={}){` 后插 `return;`——停用 GA 遥测（GA 在本网络环境不可达，错误刷屏）。

已知上游遗留（未处理，知悉即可）：远程配置驱动 `registerContentScripts` 与 `executeAction`（信任 chathub.aipilot.cc 下发配置，供应链层面的信任问题）。

## 适配器编写原则 / 测试调试

与姊妹仓一致，详见 `~/projects/ai-model-switcher/CLAUDE.md` 对应章节（适配器编写原则、测试与调试）。本仓特有：
- 重载本扩展后 **chatHub 页和全部 iframe 都要刷新**才能重注入。
- chatHub 的 iframe 是独立 CDP target（OOPIF），`Target.getTargets` 按 type=iframe + url 过滤后可直接 attach 验证。
- 验证扩展自身错误：`chrome.developerPrivate.getExtensionInfo(id).runtimeErrors`。

## Git

- 提交用 git-commit skill（Conventional Commits、无 AI 署名）；仓库无 user 配置，用内联身份提交。
- `docs/superpowers/`、`.codegraph/`、`src/*.crx` 已 gitignore。
- 单文件 ≤300 行（JS）；不要手改上游压缩 bundle（上述两处外科补丁除外）。
