# 当前架构

本文只描述仓库当前实现。产品设想和尚未实现的能力见 [`product-direction.md`](product-direction.md)，本地开发与验收见 [`development.md`](development.md)。

## 系统边界

Readable Captions 是 Chrome Manifest V3 扩展，目前只适配 Bilibili。它在视频页中注入 Shadow DOM 面板，从 Bilibili 接口获取字幕，并可通过 background service worker 调用 OpenAI 或 DeepSeek 的固定 API endpoint 生成 Markdown 内容。

扩展有三个彼此隔离的运行上下文：

| Context | 源入口 | 构建产物 | 主要职责 |
|---|---|---|---|
| Content script | `src/content.ts` | `dist/content.js`，IIFE | 识别路由、获取字幕、挂载面板、发起生成任务 |
| Background service worker | `src/background.ts` | `dist/background.js`，ES module | 读取设置、携带 API key 请求 LLM、代理 SSE 流 |
| Options page | `options.html` → `src/options/index.ts` | `dist/options.html`、`dist/options.js` | 编辑并保存扩展设置 |

`manifest.json` 把 content script 注入所有 `https://www.bilibili.com/*` 页面；是否为支持的视频路由由 Bilibili adapter 再判断。

## 构建边界

`npm run build` 严格按下列顺序执行：

1. `tsc` 对 `src/` 做严格类型检查，不输出文件。
2. `vite.config.ts` 构建 content script，并以 `emptyOutDir: true` 清空 `dist/`。
3. `vite.background.config.ts` 以 `emptyOutDir: false` 追加 background bundle。
4. `vite.options.config.ts` 以 `emptyOutDir: false` 追加 options page。
5. `copy-manifest.mjs` 复制 `manifest.json` 到 `dist/manifest.json`。

三个 Vite build 和 manifest copy 都不能省略；其中会清空目录的 content build 必须先于其余追加/复制步骤。`package.json` 中的现有顺序是 canonical build。`npm run dev` 只运行默认的 content build；它不是完整扩展构建，详见开发文档。

## 模块职责

```text
src/
├── content.ts                  # Content script 入口
├── background.ts               # Background service worker 入口
├── content/                    # 路由轮询、DOM host、挂载调度与 SPA 恢复
├── panel/                      # Shadow DOM 内的 Lit 视图、状态编排、导出
├── platforms/                  # 平台 registry 和 Bilibili 字幕实现
├── transcript/                 # TranscriptLine / Transcript 数据模型
├── generation/                 # 生成任务类型、port 协议、SSE client 与 API 调用
├── settings/                   # 设置类型、默认值/迁移、chrome.storage 封装
└── options/                    # Lit options page
```

依赖方向保持简单：`content/` 编排 `platforms/` 和 `panel/`；`panel/` 调用 `generation/` 与 `settings/`；content-side 的 `generation/llm-provider.ts` 只负责 runtime port，真正的 HTTP 请求由 background 调用 `generation/llm-api.ts` 完成。

## Content script 与 SPA 生命周期

入口 `startContentScript()` 的当前流程：

```text
src/content.ts
  → startContentScript()
  → scheduleRender(location.href)
  → waitForElm("div.bpx-player-auxiliary")
  → mountPanel(loading)
  → getTranscriptForUrl(url)
  → mountPanel(transcript result)
```

- `watchRouteChange()` 每 800 ms 比较一次 `location.href`，用于捕获 Bilibili SPA 跳转。
- `activeRenderId` 与 URL 二次校验阻止旧异步请求覆盖新页面。
- `#readable-captions-root` 被插入 `div.bpx-player-auxiliary` 顶部；`mountPanel()` 在其中创建 open Shadow Root。
- 全页面 `MutationObserver` 检测 Bilibili 重建播放器区域造成的 host 丢失，并用缓存的字幕结果重新挂载。
- `mountPanel()` 在**复用同一个 host** 时会先执行该 host 上保存的 cleanup：取消未完成的生成、注销 settings watcher，并移除 document pointer listener。

当 Bilibili 已把旧 host 从 DOM 删除、`ensureHostInside()` 创建新 host 时，新 host 取不到旧 host 上的 cleanup symbol；旧生成、watcher 或 document listener 可能继续存活。当前 persistence observer 能恢复可见面板，但不能保证已释放 detached panel 的资源。

当前首次启动会无条件调度渲染，然后等待播放器 anchor；只有后续路由变化才先检查 adapter。因而在非视频页首次加载时，等待可能长期不结束。路由从视频变为不支持的页面时，代码会使旧 render 失效、清空缓存并停止 persistence observer，但不会显式移除 panel host 或调用 panel cleanup；最终是否消失依赖 Bilibili 是否重建对应 DOM。这些都是已知行为，不应在文档中描述为已处理。

## 字幕获取链路

平台 registry 位于 `src/platforms/index.ts`，当前只注册 `bilibiliAdapter`。公共返回类型是：

```ts
type PlatformTranscriptResult = {
    transcript: Transcript | null;
    source: "human_view" | "ai_wbi" | "none";
    subtitleUrl?: string;
    aid?: number;
    cid?: number;
    availableSubtitles?: { lan_doc: string; subtitle_url: string }[];
};
```

### URL 识别

`getBiliVideoId()` 当前识别：

- `/video/BV...` 与 `/video/av...`
- query 中的 `bvid`、`aid` 或 `avid`
- `/list/watchlater?oid=...`
- `?p=N` 用于选择多 P 视频的第 N 个 page；无效值回退到第 1 P

### API 顺序

```text
getBilibiliTranscript(videoUrl)
  → getBiliVideoId(videoUrl)
  → GET https://api.bilibili.com/x/web-interface/view
      → 读取 aid、bvid、目标分 P 的 cid、subtitle.list
  → subtitle.list 有 URL
      → 下载列表第一条字幕 JSON
      → source = "human_view"
  → 否则 GET https://api.bilibili.com/x/player/wbi/v2
      → 优先选择 AI 字幕域名项，否则选择第一项
      → 下载字幕 JSON
      → source = "ai_wbi"
  → 都没有
      → transcript = null, source = "none"
```

这里的 `human_view` 是历史命名：代码只知道字幕来自 view API 的 `subtitle.list` 第一项，并未验证它一定由人工创建。不要基于这个枚举推导更强的作者属性。

`api.bilibili.com` 请求使用 `credentials: "include"`；字幕文件请求使用 `credentials: "omit"`。字幕 URL 的 `//` 和 `http:` 会统一规范为 HTTPS。`normalizeBilibiliTranscript()` 期望得到带 `from`、`to`、`content` 的数组。

WBI 分支只在 view API 没有字幕 URL 时进入。前序网络或解析异常目前不会被捕获后继续 fallback；异常会向 content orchestration 传播，而 `renderCurrentPage()` 也没有错误态处理，面板可能停留在 loading。

切换字幕语言时，panel 会重新下载所选 URL、替换 transcript、清空 `overview`、`intensive`、`note` 三份生成状态，并按当前 tab 决定是否重新生成。

## Panel 状态与渲染

`src/panel/mount.ts` 负责异步生成、settings watcher、实例状态与 cleanup。`src/panel/panel-view.ts` 主要包含 Lit template/CSS，但当前也持有少量 module-level UI 状态、直接执行时间戳跳转，并负责 Markdown 解析与净化；它不是纯视图函数：

- 三个 view 为 `original`、`intensive`、`overview`，默认值来自 settings，仓库默认是 `original`。
- `overview` 和 `intensive` 在首次进入对应 tab 时懒生成；已有文本、进行中或错误态都不会自动重复请求。
- Markdown Note 在 drawer 打开时懒生成，是导出动作而非第四个 tab。
- 原文和生成 Markdown 中可识别的时间戳会设置页面 `<video>.currentTime` 并尝试播放。
- 生成 Markdown 先经 `marked` 转换，再由 DOMPurify 清洗，最后才传给 Lit 的 `unsafeHTML`。
- 原文可复制为纯文本或带时间戳文本，可下载 TXT 或 SRT；Note 可复制或下载 `.md`。
- `isCollapsed`、`isMenuOpen` 是 `panel-view.ts` 的 module-level 状态；`mode`、`uiLanguage`、生成状态和 Note drawer 状态属于每次 `mountPanel()` 实例。

当前原文视图没有搜索和当前播放行高亮；这些能力如果进入计划，必须作为未实现功能处理。

## 生成协议与数据流

任务类型为 `overview | intensive | note`。每个任务发送完整 transcript，并附带标题、URL、字幕来源、可用时的 `aid`/`cid`。

```text
Content script                         Background service worker
──────────────────────────────────     ──────────────────────────────
streamGeneration(request)
  → chrome.runtime.connect({
      name: "readable-captions-generation-stream"
    })
  → { type: "start", request } ─────→ validate message
                                        → getSettings()
                                        → streamGenerationFromApi()
                                        → fetch(chat-completions, SSE)
  ← { type: "token", text } ───────── accumulated partial Markdown
  ← { type: "done", text }  ───────── completed Markdown
  ← { type: "error", message } ────── user-visible retry state
  → { type: "cancel" } ────────────── AbortController.abort()
```

`token.text` 是截至当前的累计文本，不保证对应单个 token。每个 port 只维护一个 active request；同一 port 上的新 start、cancel 或 disconnect 会中止旧请求。Panel cleanup 也会取消 active request。

### Provider 行为

- OpenAI endpoint 固定为 `https://api.openai.com/v1/chat/completions`。
- DeepSeek endpoint 固定为 `https://api.deepseek.com/chat/completions`。
- 当前没有自定义 base URL 或任意 OpenAI-compatible endpoint 设置。
- DeepSeek 模型留空时使用 `deepseek-v4-flash`；OpenAI 模型留空会报错。
- `note` 复用 intensive 的模型和自定义 prompt 配置，但使用独立的 Note base prompt。
- 请求体当前对两个 provider 都发送 `reasoning_effort`、`extra_body` 和 `stream: true`；修改 provider 兼容性时必须回归两个 endpoint。

SSE parser 按空行分隔事件、读取 `data:` 行、忽略 `[DONE]` 和无法解析的 JSON，只消费 `choices[0].delta.content`。

## Settings 与迁移

唯一 storage key 是 `extensionSettings`。业务代码通过以下封装访问：

- `getSettings()`：background/options 读取并经 `mergeSettings()` 规范化。
- `saveSettings()`：options 规范化后保存。
- `watchSettings()`：background/options 监听 `chrome.storage.local` 中该 key 的变化，并返回 unsubscribe。
- `toPublicSettings()` / `watchPublicSettings()`：通过 `readable-captions-public-settings` port 向 content panel 提供不含 `generationApiKey` 的 `PublicExtensionSettings`。

Background 启动时调用 `chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })`，content script 不直接访问完整 storage。不要绕过这些封装直接调用 `chrome.storage.local`。

| 字段 | 默认值 | 当前用途 |
|---|---|---|
| `defaultTab` | `original` | Panel 初始 view |
| `generationEnabled` | `true` | 是否允许 Overview、Intensive、Note 生成 |
| `generationProvider` | `deepseek` | 选择固定 OpenAI/DeepSeek endpoint |
| `generationAccessMode` | `api_key` | 保留字段；`webapp` 当前未接入 UI 或生成流程 |
| `generationModels` | 两项均为空 | Overview 与 Intensive 模型；Note 复用 Intensive |
| `generationApiKey` | 空字符串 | Background 请求的 Bearer token |
| `generationPromptTemplates` | 两项均为空 | 追加到 Overview/Intensive base prompt；Note 复用 Intensive 补充 prompt |
| `copyFormat` | `readable_text` | 原文复制格式 |
| `downloadFormat` | `txt` | 原文下载格式 |

`mergeSettings()` 还负责旧字段迁移：`summary` tab → `overview`，`read` tab → `intensive`，并读取旧 `summary*` 模型、provider、API key 和 prompt 字段。修改 schema 时必须保留已有用户数据的迁移路径。

Panel 以 provider、models 和 prompt templates 组成生成缓存 key；这些值改变时会清空生成结果。当前 key 不包含 API key，因此只更换 API key 不会使已生成内容自动失效。

## 信任边界与外发数据

- LLM HTTP 请求和 `Authorization` header 只在 background service worker 中创建。除 Options 的凭据输入框外，不要把 key 放进 runtime-port message、Bilibili 页面/panel DOM、console 或导出内容。
- Content script 只通过 public-settings port 接收 `PublicExtensionSettings`；该对象不含 `generationApiKey`。Background/options 才能读取完整 `ExtensionSettings`。
- 发给 LLM 的内容包含完整字幕、视频标题、URL、字幕来源以及可用的 `aid`/`cid`。产品或 UI 增加隐私提示时应以此为准。
- API key 与其他设置保存在限制为 trusted contexts 的 `chrome.storage.local`，仓库不读取 `.env`，也不应把密钥写入源码、fixture 或日志。
- AI 生成的 Markdown 进入 DOM 前必须继续经过 DOMPurify；不得绕过现有净化路径。

## Manifest 权限

- `permissions`: `storage`
- `host_permissions`: Bilibili 页面/API/字幕域名、OpenAI API、DeepSeek API
- `content_scripts.matches`: `https://www.bilibili.com/*`
- `background.type`: `module`
- `options_ui.open_in_tab`: `true`

新增网络目标、运行上下文或产物时，必须同时核对 `manifest.json`、对应 Vite config、build 顺序和手工 smoke matrix。

## 已知限制

| 限制 | 开发影响 |
|---|---|
| `npm run dev` 只构建 content，并会清空 `dist/` | 不能把它当作完整扩展 watch；完整验证使用 `npm run build` |
| 没有 tracked test、lint、format 或 CI | `npm run build` 加受影响上下文的 Chrome smoke test 是当前门禁 |
| 非视频页首次加载会等待播放器 anchor | 修改路由编排时要覆盖非视频 → 视频和视频 → 非视频 |
| 视频 → 非视频没有显式 panel teardown | 不要把 panel 一定消失或 cleanup 一定执行当成现有保证 |
| 被 Bilibili 移除的旧 host 无法由新 host 调用 cleanup | DOM 恢复可能遗留 detached listener、watcher 或生成请求；生命周期改动需专门检查 |
| 字幕 fetch 异常没有 error UI，也不会继续 fallback | 改字幕链路时区分“空结果”和“请求失败” |
| `human_view` 不等于已验证的人工字幕 | 不要把来源枚举当作者分类 |
| `generationAccessMode = webapp` 未实现 | 不要在 UI 或文档中宣称支持 webapp 登录态 |
| 原文搜索、播放行高亮、Planner、dynamic cards 未实现 | 只能作为产品方向或新需求，不能当作回归行为 |
