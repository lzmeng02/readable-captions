# 开发与验证

本文给出当前仓库真实可用的开发循环。架构和运行时边界见 [`architecture.md`](architecture.md)。

## 环境与安装

仓库使用 npm，并提交 `package-lock.json`（lockfile v3）。不要混用 pnpm、Yarn 或生成第二份 lockfile。

仓库尚未通过 `engines` 或 `.nvmrc` 固定 Node；当前锁定的 Vite 7.3.1 要求 Node `^20.19.0 || >=22.12.0`。在干净 checkout 中安装：

```bash
npm ci
```

只有在有意更新依赖或 lockfile 时才使用 `npm install`，并在交付说明中明确依赖变化。

## 可用命令

| 命令 | 做什么 | 能证明什么 |
|---|---|---|
| `npm run build` | strict `tsc` → content build → background build → options build → copy manifest | `src/` 类型检查通过，三个 bundle 与完整 `dist/` 能生成 |
| `npm run dev` | 执行默认 `vite build --watch` | 只持续重建 `dist/content.js` |

当前没有 tracked `test`、`lint`、`format`、独立 `typecheck` 脚本或 CI workflow。不要在交付时写“tests passed”或“lint passed”，除非同一改动实际加入并运行了对应工具。

### `npm run dev` 的限制

默认 Vite config 的 `emptyOutDir: true` 会在 watcher 启动时清空 `dist/`，而 background、options 和 manifest 不在该 watcher 的产物中。因此 `npm run dev` 不能独立生成可加载的完整扩展，也不能验证 background/options 改动。

把它只当作 content bundle 的局部 watch。完整扩展开发和最终验收使用：

```bash
npm run build
```

如果后续要增加完整 watch 命令，应同时覆盖三个 Vite context 和 manifest copy，并更新本文、`package.json` 与 `AGENTS.md`。

## 推荐开发循环

1. 运行 `git status --short`，识别并保护已有用户改动。
2. 阅读与任务对应的产品约束、架构章节和调用方；不要仅根据文件名猜边界。
3. 修改源文件，不直接编辑 `dist/` 或 `node_modules/`。
4. 运行 `npm run build`。
5. 在 `chrome://extensions/` 重新加载扩展，再刷新目标 Bilibili 页面或 options page。
6. 按“手工 smoke matrix”验证所有受影响的运行上下文。
7. 检查 `git diff --check`、最终 diff 和 `git status --short`，确认没有格式化噪声、生成物或用户文件混入。
8. 同一改动中更新受影响的 canonical docs，并列出没有执行的外部/API 验证。

## Chrome 加载与调试

首次加载：

1. 执行 `npm run build`。
2. 打开 `chrome://extensions/`，启用开发者模式。
3. 选择“加载已解压的扩展程序”，加载仓库的 `dist/`。
4. 打开扩展详情或 options page，配置 provider、API key 和模型。
5. 访问受支持的 Bilibili 视频页并刷新页面。

重新构建后，通常需要先在扩展页点击“重新加载”，再刷新已打开的视频页。旧 content script 不会自动被新 bundle 替换。

| 要调试的代码 | DevTools 位置 | 常见信号 |
|---|---|---|
| `src/content/`、`src/panel/`、content-side provider | Bilibili 页面 DevTools | `[RC]` 日志、panel DOM、runtime-port 错误 |
| `src/background.ts`、`src/generation/llm-api.ts` | `chrome://extensions/` 中 service worker 的 Inspect | LLM network、SSE、API error、worker disconnect |
| `src/options/index.ts`、`src/settings/` | Options page DevTools | storage 读写、表单状态、保存错误 |

面板 host 是页面中的 `#readable-captions-root`，实际 UI 在它的 open Shadow Root 内。检查样式时不要误把 Bilibili page CSS 当作 Shadow DOM 内样式。

## 改动影响表

| 修改范围 | 至少检查 |
|---|---|
| `src/content/**` | 首次挂载、非视频/视频路由切换、SPA 视频间跳转、DOM 重建后恢复 |
| `src/platforms/**` | BV、av、分 P、watch-later URL；view 字幕、WBI fallback、无字幕、请求异常、语言切换 |
| `src/panel/**` | 三 tab、折叠/menu、时间戳跳转、生成状态、Note drawer、复制/下载、Shadow DOM 样式隔离 |
| `src/generation/**` 或 `src/background.ts` | start/cancel/token/done/error、OpenAI 与 DeepSeek payload、SSE 分块、断连与重试、Markdown 净化 |
| `src/settings/**` 或 options | 默认值、保存/重载、storage watcher、旧字段迁移、各消费者的缓存失效 |
| Vite config、入口或 manifest | 完整 `dist/` 文件、扩展加载、service worker、options、权限与 host access |

## 手工 smoke matrix

只执行与改动有关的部分，但跨 context 的改动不能只看其中一侧。当前没有稳定的自动化 harness，因此先按可复现性判断：

| 类别 | 当前做法 |
|---|---|
| 本地可重复 | build、扩展加载、Options 保存/重载、已有字幕页的基本 Panel/导出行为；记录实际操作和结果 |
| 依赖外部状态 | view/WBI/无字幕/特殊 URL 依赖具体 Bilibili 页面；交付时记录测试 URL、日期和观察结果，不把单个页面当永久 fixture |
| 依赖真实凭据 | OpenAI/DeepSeek 生成只能在获授权的本地凭据下验证；绝不记录 key，只记录 provider/model 与结果 |
| 当前缺稳定故障注入 | 网络异常、SSE 跨 chunk、port disconnect、host 被替换后的资源释放；任务未新增 targeted harness 时明确标为“未验证”，不能按通过报告 |

### 安装与基本挂载

- [ ] `npm run build` 成功，`dist/` 至少包含 `content.js`、`background.js`、`options.html`、`options.js`、`manifest.json`。
- [ ] Chrome 能加载 `dist/`，manifest 和 service worker 没有启动错误。
- [ ] 支持的视频页出现面板；默认设置下打开 `original`。
- [ ] 首次打开非视频页并记录是否出现等待态/面板；当前代码会先无条件调度 render，不能把“必定不出现”当成保证。从非视频页 SPA 导航到视频页后应能挂载。
- [ ] 视频间 SPA 跳转不会显示上一视频字幕；播放器区域重建后可见面板能恢复。
- [ ] 若改动路由/生命周期，单独观察视频 → 非视频和 host 被替换；当前没有显式 panel teardown，也不能保证 detached panel cleanup，按已知限制报告。

### 字幕

- [ ] view API 有字幕时显示原文、来源和可用语言。
- [ ] view API 没有字幕列表时可尝试 WBI fallback。
- [ ] 无字幕时显示空态，不生成 Overview/Intensive/Note。
- [ ] 切换字幕语言后原文更新，旧生成结果被清空。
- [ ] 点击时间戳会设置视频时间并尝试播放。
- [ ] 至少覆盖一个分 P 或特殊 URL（`av`、query、watch-later）若改动了 URL/API 逻辑。

### AI 生成

- [ ] 首次进入 Overview 或 Intensive 才开始对应任务；Original 不自动生成。
- [ ] SSE partial text 持续更新，完成后保留完整 Markdown。
- [ ] API key 缺失、OpenAI 模型缺失、HTTP error 和 port disconnect 有可理解的错误态与重试入口。
- [ ] 切换 tab 时各任务状态不串写；重挂载或取消后，旧请求不再写入当前 panel。
- [ ] 生成 HTML 中的危险 markup 被 DOMPurify 移除；不要只检查 Markdown 源文本。
- [ ] Note drawer 使用独立 Note prompt，复制和 `.md` 下载工作；模型/补充 prompt 与 Intensive 配置一致。
- [ ] 改 provider 兼容性时分别验证 OpenAI 与 DeepSeek；当前 endpoint 不可自定义。

### 设置与导出

- [ ] Options page 能读取、保存和重新加载设置。
- [ ] 用户尚未手动选 tab 时，更新 `defaultTab` 会切换 panel；用户已手动选 tab 时，当前实例保留其选择，重新挂载后才采用新默认值。
- [ ] 关闭 `generationEnabled` 会清空三类生成状态；重新开启时，当前 Overview/Intensive 可按需生成。
- [ ] provider、model 或 prompt 改变会清空生成缓存，并可能为当前生成 tab 重新请求；只更换 API key 当前不会清缓存。
- [ ] “恢复默认”后的表单值只有保存后才成为持久设置。
- [ ] 旧 `summary`/`read` 及旧 `summary*` 字段仍能经 `mergeSettings()` 迁移。
- [ ] 原文复制的两种文本格式、TXT/SRT 下载及 Note 的复制/Markdown 下载符合设置。
- [ ] 除 Options 的凭据输入框外，API key 没有进入 runtime-port payload、Bilibili 页面/panel DOM、console、导出文件或 git diff。

## 常见修改路径

### 增加或修改设置

1. 在 `src/settings/types.ts` 更新类型和允许值。
2. 在 `src/settings/defaults.ts` 设置默认值，并为旧数据补迁移/校验。
3. 通过 `getSettings()`、`saveSettings()`、`watchSettings()` 消费；不要直接读写 storage key。
4. 更新 `src/options/index.ts` 和所有 runtime 消费者。
5. 检查生成缓存 key 是否也应包含新字段。
6. 更新架构中的 settings 表并执行设置 smoke tests。

### 修改字幕获取

1. 保持 `PlatformTranscriptResult` 边界明确；不要把 Bilibili 原始响应泄漏到 panel。
2. 分开 URL 解析、API fetch、adapter fallback 和 transcript normalize 的职责。
3. 保持 `api.bilibili.com` 与字幕文件不同的 credentials 策略。
4. 如新增 host，更新 `manifest.json` 并验证权限。
5. 明确空字幕、无效响应和网络失败是否应产生不同结果。

### 修改生成流程

1. 先更新 `src/generation/types.ts` 的任务/请求边界。
2. 同步 `protocol.ts`、content-side `llm-provider.ts` 和 `background.ts` 的消息验证与取消语义。
3. 把 LLM fetch 和 `Authorization` header 留在 background；API key 不经 port 传输。Content 当前仍会收到完整 settings，但不得用 key 发请求或展示它。
4. 保持 Markdown 净化，验证 SSE 事件可能跨 chunk 分割。
5. 新设置或 provider 行为必须同步 Options、默认值/迁移、manifest 权限和两个 provider 的 smoke test。

### 修改 Panel UI

1. 异步生成、settings watcher、实例生命周期和 cleanup 放在 `mount.ts`。
2. `panel-view.ts` 当前包含 template/CSS、少量 module-level 状态、时间戳跳转和 Markdown 渲染；做聚焦修改时遵循这个真实边界，不假定它是纯函数。
3. 保持 Shadow DOM 隔离和三视图产品边界。
4. 新增长生命周期的 document/storage/runtime listener 时，在 `mount.ts` 的 cleanup 中成对注销，并考虑 host 被替换时 disposer 是否真的可达。
5. 不把动态、不可信 Markdown 直接交给 `unsafeHTML`；保持 `marked` → DOMPurify → `unsafeHTML`。

## 代码与补丁约定

- TypeScript 源码通常使用 4 空格、分号、双引号、多行尾逗号和 `import type`；配置文件通常使用 2 空格。匹配邻近文件即可。
- 仓库没有 formatter，且历史文件可能有不同换行符。避免整文件格式化、无关 import 重排和行尾转换。
- 保持改动小而聚焦，不因某个功能顺手拆分大型 UI 文件；如果确需结构调整，应说明它如何降低当前改动风险。
- 不编辑或提交 `dist/`、`node_modules/`、本地 secret、`.env` 或与任务无关的未跟踪文件。
- 不宣称存在稳定 commit-message 规范；历史提交格式并不统一。

## 完成标准

一个改动只有在以下条件满足时才可交付：

- [ ] 需求和产品边界得到满足，没有把未来方向误写成现有能力。
- [ ] `npm run build` 通过。
- [ ] 受影响 context 的 smoke test 已执行，或明确列出无法执行的原因。
- [ ] 最终 diff 没有生成物、secret、用户改动或无关格式噪声。
- [ ] 架构、设置、协议、构建或产品约束变化已同步 canonical docs。
- [ ] 交付说明列出实际验证结果、剩余风险和未验证项。
