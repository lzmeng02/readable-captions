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
| `npm test` | 运行完整 Vitest suite | unit、DOM/jsdom 和 build integration 回归通过 |
| `npm test -- <path...>` | 运行一个或多个测试文件/目录 | 快速验证受影响契约；不能代替最终完整 suite |
| `npm run test:watch` | 启动 Vitest watch | 本地迭代；交付时仍运行一次非 watch suite |
| `npm exec tsc -- --noEmit --pretty false` | 独立 strict typecheck | TypeScript 无诊断，不生成文件 |
| `npm run build` | strict `tsc` → content build → background build → options build → copy manifest | `src/` 类型检查通过，三个 bundle 与完整 `dist/` 能生成 |
| `npm run dev` | 完整 build 一次，再以 development mode watch content | 初始五个 artifact 完整；后续 content rebuild 保留 sibling artifact |
| `git diff --check` | 检查 patch whitespace | 没有 whitespace error |

仓库有 tracked Vitest tests，但没有 lint、formatter 或 CI workflow；不要用 typecheck/test 结果冒充不存在的 lint/CI 结果。

### 测试布局与 focused commands

| 路径 | 覆盖范围 |
|---|---|
| `tests/unit/content/` | canonical session、SPA replacement/disposal、terminal data、host recovery、route/cancellation |
| `tests/unit/platforms/bilibili/` | URL/part、selected `cid`、business envelope、credentials、fallback、normalization |
| `tests/unit/generation/` | provider payload、strict SSE、delta reconstruction、port protocol |
| `tests/unit/background/` | settings boundary、request replacement/cancel/disconnect、request-scoped keepalive |
| `tests/unit/panel/` | frame scheduler 与 suffix-only title extraction |
| `tests/unit/settings/` | canonical provider profiles、legacy migration/storage、public projection/validation 与 public-client error contract |
| `tests/dom/panel/` | panel lifecycle、settings readiness、语言 transaction、导出、可见 task frame coalescing |
| `tests/dom/options/` | provider profile 隔离、load/save/conflict 状态机、reset/save 后 live `.value`/`.checked` |
| `tests/integration/` | development/production Vite output 清理语义与 dev script 顺序 |

常用 focused 示例：

```bash
npm test -- tests/unit/content/controller.test.ts tests/unit/platforms/bilibili
npm test -- tests/unit/generation tests/unit/background
npm test -- tests/dom/panel tests/dom/options
npm test -- tests/integration/dev-output.test.ts
```

### Build 与 dev watch

Production content build 使用 `emptyOutDir: true`；background/options 追加，最后复制 manifest。`npm run dev` 先执行同一套完整 production build，再运行 `vite build --watch --mode development`。development content rebuild 使用 `emptyOutDir: false`，不会删除 `background.js`、`options.html`、`options.js` 或 `manifest.json`。

Watcher 仍只观察/rebuild content：改动 background、options、manifest 或对应 config 后，停止并重新运行 `npm run dev`，或单独运行 `npm run build`。不要在自动化中留下常驻 watcher。

## 推荐开发循环

1. 运行 `git status --short`，识别并保护已有用户改动。
2. 阅读与任务对应的产品约束、架构章节和调用方；不要仅根据文件名猜边界。
3. 修改源文件，不直接编辑 `dist/` 或 `node_modules/`。
4. 先运行 focused tests，再执行最终自动化矩阵：

   ```bash
   npm test
   npm exec tsc -- --noEmit --pretty false
   npm run build
   git diff --check
   ```

5. 验证五个 loadable artifact（PowerShell）：

   ```powershell
   @('dist/manifest.json','dist/content.js','dist/background.js','dist/options.html','dist/options.js') |
       ForEach-Object { if (-not (Test-Path -LiteralPath $_)) { throw "Missing $_" } }
   ```

   同时核对 `dist/manifest.json` 的 content script、background service worker 和 options page 分别指向 `content.js`、`background.js` 和 `options.html`（后者再加载 `options.js`）。

6. 在 `chrome://extensions/` 重新加载扩展，再刷新目标 Bilibili 页面或 Options page。
7. 按“Chrome smoke matrix”逐行记录实际执行或未验证原因；自动化测试不能冒充真实页面/provider/auth smoke。
8. 检查最终 diff/status，确认没有 `dist/`、secret、用户改动或无关文件混入；同一改动更新 canonical docs。

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

### 常见故障定位

| 症状 | 先检查 | 对应回归 |
|---|---|---|
| unsupported 页面仍有 panel、SPA 后旧字幕或永久 loading | content session 的 route key、abort/dispose、terminal `PanelData` | `tests/unit/content/controller.test.ts` |
| 分 P 字幕错误或 API error 被当成无字幕 | `pages[p-1].cid`、view/WBI envelope 与 selected-cid WBI request | `tests/unit/platforms/bilibili/` |
| 语言快速切换被旧响应覆盖、失败不回滚 | subtitle request id/controller、controlled select、active-session callback | `tests/dom/panel/mount.test.ts` |
| partial SSE 被当成功、文本重复或 worker 长请求断开 | strict SSE finalizer、delta contract、request-scoped keepalive | `tests/unit/generation/`、`tests/unit/background/` |
| token 导致过量 Lit render 或隐藏 tab 重绘 | `render-scheduler.ts` 与 visible-task guard | `tests/unit/panel/render-scheduler.test.ts`、`tests/dom/panel/mount-generation-render.test.ts` |
| Options reset 后显示值与 save 不同 | Lit `.value`/`.checked` property binding | `tests/dom/options/options-live-controls.test.ts` |
| 导出标题在连字符处截断 | suffix-only `extractVideoTitle()` 与 filename sanitizer | `tests/unit/panel/title-utils.test.ts`、`tests/dom/panel/mount.test.ts` |
| dev content rebuild 后缺 background/options/manifest | development mode `emptyOutDir` 与完整-build-first script | `tests/integration/dev-output.test.ts`；重启 `npm run dev` |

## 改动影响表

| 修改范围 | 至少检查 |
|---|---|
| `src/content/**` | 首次挂载、非视频/视频路由切换、SPA 视频间跳转、DOM 重建后恢复 |
| `src/platforms/**` | BV、av、分 P、watch-later URL；view 字幕、WBI fallback、无字幕、请求异常、语言切换 |
| `src/panel/**` | 三 tab、折叠/menu、时间戳跳转、生成状态、Note drawer、复制/下载、Shadow DOM 样式隔离 |
| `src/generation/**`、`src/background.ts` 或 `src/background-app.ts` | start/cancel/token/done/error code、public snapshot/live ordering、OpenAI 与 DeepSeek payload、decoder dispatch、SSE 分块、断连与重试、Markdown 净化 |
| `src/settings/**` 或 options | 默认值、保存/重载、lossless storage watcher handoff、delayed own-save acknowledgement、旧字段迁移、各消费者的缓存失效 |
| Vite config、入口或 manifest | 完整 `dist/` 文件、扩展加载、service worker、options、权限与 host access |

## Chrome smoke matrix

自动化 suite 覆盖契约和故障注入，但不等于真实 Chrome、Bilibili 页面或 provider/auth 验证。交付说明必须逐行写“已执行”并附日期/URL/provider（不含 secret），或写“未验证”与原因；不能省略未执行行。

| Area | Action | Expected |
|---|---|---|
| Subtitle URLs | Open BV, av, query-id, and watchlater videos | Correct recognition and captions |
| Multipart | Open one video at `p=1` and `p=2` | Each part shows its own cid/transcript |
| Errors | Simulate offline/API business error | Terminal error, never permanent loading |
| SPA | Video → unsupported → video | One panel; old work/listeners disposed |
| Host recovery | Remove `#readable-captions-root` | Same host/state returns once |
| Languages | Switch B→C rapidly, then force failure | C wins; failure rolls back |
| Provider profiles | DeepSeek → OpenAI → DeepSeek，再反向切换 | 两边 key/Overview/Intensive model 各自保留，不串用 |
| Options persistence | 同时配置两边 profile，保存并重开 Options | OpenAI 与 DeepSeek profile 都保持 canonical 值 |
| Options lifecycle | 注入 load failure/Retry；用两个 Options tab 测 clean 与 dirty update | 失败态不能保存 defaults；Retry 恢复；clean 自动更新，dirty 显式 conflict |
| Panel settings | 延迟/破坏 public-settings 首次读取 | pending/error 明示；生成 tab、Note、copy/download fail closed，原文/设置仍可用 |
| Generation disabled | 关闭生成后从 Panel/port 尝试 start | 无 keepalive、无外部 provider request，返回 disabled error |
| Providers | 分别用获授权的 OpenAI 与 DeepSeek 凭据生成 | 每边只用自己的 profile/endpoint，payload 兼容并完成 streaming |
| Streaming | Cancel/retry a long generation | No partial success; worker stays active |
| Options | Change/reset/save General and Export controls | Displayed values equal saved values |
| Dev | Start dev and trigger content rebuild | All five artifacts remain |
| Titles | Export `GPT-5` and `A-B-C` videos | Hyphens preserved; invalid chars sanitized |
| Security | Inspect generation/public messages、service-worker console 和 Panel DOM | No API key/full settings/provider error body exposure；generation error 只有 validated code/safe message |

“Providers”需要获授权的真实凭据；“Subtitle URLs/Multipart”等依赖当日 Bilibili 页面状态。没有可用浏览器 session、测试 URL、故障注入或凭据时，相关行一律明确记录为未验证，绝不从 Vitest/build 推断为通过。

## 常见修改路径

### 增加生成 Provider

下面每一项都是必做项；catalog entry 只是接入起点：

1. 在 `src/generation/provider-catalog.ts` 增加唯一 entry：stable `id`、label、API-key help URL、model placeholder/help、可选的 request-time `defaultModel`，以及构造 endpoint、Authorization、body 和 `streamDecoder` 的 `buildRequest()`。不要在 Options 或 `llm-api.ts` 再加一套 provider switch；新 decoder id 必须同时加入 exhaustive `Record<GenerationStreamDecoderId, ProviderStreamDecoder>` registry 并实现真实 adapter。显式 model/default 的判定继续走 catalog-owned `resolveGenerationProviderModel()`，错误使用 selected entry identity，不添加 provider-specific transport 分支。
2. 在 `manifest.json` 为实际 API endpoint 加最小 `host_permissions`，运行完整 build，并核对 `dist/manifest.json` 与 service-worker Network。不要用宽泛 wildcard 代替已知 host。
3. 当外部数据接收方变化时，更新 Chrome Web Store/发布流程中的 privacy disclosure 和任何面向用户的外发说明，明确 provider 会收到完整字幕、标题、URL、字幕来源及可用的 `aid`/`cid`。仓库当前没有独立 privacy-policy 文件，不能因此跳过这项；在交付记录中写明披露更新位置。
4. 验证 canonical `generationProviderSettings[newId]` 是独立 profile，初始 key/model 不从其他 provider 复制；默认模型优先放在 catalog 作 request-time fallback。同步 `mergeSettings()` 的 normalize/migration 测试：新 schema 存在时绝不复活 globals；仅在缺失时迁移到 precedence 选中的单个 provider；`saveSettings()` 只保存 canonical profiles。
5. 在 Options 中确认新按钮/label/help/placeholder 来自 catalog，key 与 Overview/Intensive model 只绑定 selected profile。实际填充并往返切换 **OpenAI、DeepSeek 和新 provider**，确认现有两份 profile 与新 profile 都不丢失；再 Save/reopen、Reset/save，确认每个 profile 都存在且无 legacy globals。
6. 增加 focused tests：catalog adapter 的 URL/header/body/default model，selected-profile key/model 与 missing-key-before-fetch，decoder registry dispatch/exhaustiveness，settings defaults/normalization/migration/canonical save/secret-free 64-bit public digest，以及 `tests/dom/options/options-provider-profiles.test.ts` 的切换与持久化。fixture 只用明显的 fake key；provider HTTP/SSE/dependency leak tests 必须断言 fake marker 不进入 runtime message、DOM 或 log；如新增 decoder，再覆盖 chunk boundary、provider error 和 strict completion。
7. 用真实 Chrome 加载新 build 做 smoke：处理新增 host permission，完成 profile 切换与 Options 重开，使用获授权的该 provider 测试账号完成一次 streaming，并在 service-worker Network 确认正确 endpoint、认证方式和 payload；再关闭 generation，确认没有外部请求。没有凭据或浏览器 session 时逐项写“未验证”和原因，不能用 Vitest/build 代替。
8. 更新 [`architecture.md`](architecture.md) 的 provider 行为/外发数据与上面的 Chrome smoke 记录；不得把 API key、key-derived value 或真实账号信息写进 docs、fixture、日志或 commit。

### 增加或修改设置

1. 在 `src/settings/types.ts` 更新类型和允许值。
2. 在 `src/settings/defaults.ts` 设置默认值，并为旧数据补迁移/校验。
3. 通过 `getSettings()`、`saveSettings()`、`watchSettings()` 消费；不要直接读写 storage key。
4. 更新 `src/options/index.ts` 和所有 runtime 消费者。
5. 检查生成缓存 key 是否也应包含新字段；只把 secret-free effective settings 放进 canonical digest input，保持固定 13 字符 64-bit public value，并覆盖 collision/API-key-independence regression。
6. 更新架构中的 settings 表并执行设置 smoke tests。

### 修改字幕获取

1. 保持 `PlatformTranscriptResult` 边界明确；不要把 Bilibili 原始响应泄漏到 panel。
2. 分开 URL 解析、API fetch、adapter fallback 和 transcript normalize 的职责。
3. 保持 `api.bilibili.com` 与字幕文件不同的 credentials 策略。
4. 如新增 host，更新 `manifest.json` 并验证权限。
5. 明确空字幕、无效响应和网络失败是否应产生不同结果。

### 修改生成流程

1. 先更新 `src/generation/types.ts` 的任务/请求边界。
2. 同步 `protocol.ts`、content-side `llm-provider.ts`、`background-stream.ts` 和 `background-app.ts` 的消息验证、per-port ordering 与取消语义；generation error 只传 `GenerationErrorCode`，不要恢复任意 message string。
3. 把 LLM fetch 和 `Authorization` header 留在 background；generation port 不传 API key、HTTP/SSE body 或 dependency `Error.message`，content 的 public-settings port 只接收去私密字段后的设置。
4. 保持 raw-delta transport、strict SSE completion、request-scoped keepalive 和 Markdown 净化；验证 SSE 事件/UTF-8 可能跨 chunk 分割。
5. 新设置必须同步 Options、默认值/迁移与 cache identity；新增 provider 按上面的完整 checklist，不把“两个 provider smoke”当作可扩展接入方案。

### 修改 Panel UI

1. 异步生成、settings watcher、实例生命周期和 cleanup 放在 `mount.ts`。
2. `panel-view.ts` 当前包含 template/CSS、少量 module-level 状态、时间戳跳转和 Markdown 渲染；做聚焦修改时遵循这个真实边界，不假定它是纯函数。
3. 保持 Shadow DOM 隔离和三视图产品边界。
4. 新增长生命周期的 document/storage/runtime listener 时，在 session/panel cleanup 中成对注销，并为 replacement、unsupported route、host recovery 和 dispose 增加测试。
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
- [ ] focused tests 通过，然后 `npm test`、独立 typecheck、`npm run build` 和 `git diff --check` 全部通过。
- [ ] 五个 `dist` artifact 存在且 manifest/options wiring 正确；不提交 `dist/`。
- [ ] 受影响 context 的 smoke test 已执行，或明确列出无法执行的原因。
- [ ] 最终 diff 没有生成物、secret、用户改动或无关格式噪声。
- [ ] 架构、设置、协议、构建或产品约束变化已同步 canonical docs。
- [ ] 交付说明列出实际验证结果、剩余风险和未验证项。
