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
2. `vite.config.ts` 以 production mode 构建 content script，并清空 `dist/`。
3. `vite.background.config.ts` 以 `emptyOutDir: false` 追加 background bundle。
4. `vite.options.config.ts` 以 `emptyOutDir: false` 追加 options page。
5. `copy-manifest.mjs` 复制 `manifest.json` 到 `dist/manifest.json`。

三个 Vite build 和 manifest copy 都不能省略；会清空目录的 production content build 必须先于其余追加/复制步骤。`npm run dev` 先执行这套完整 build，再以 development mode 启动 content-only watcher。development content rebuild 设置 `emptyOutDir: false`，因此保留已有的 background、options 和 manifest；watcher 不会自动重建这些 sibling artifact。

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

入口 `startContentScript()` 创建一个 `ContentController`，首次 URL 和后续每 800 ms 检测到的 URL 都进入同一个 `navigate()` 边界：

```text
src/content.ts
  → startContentScript()
  → controller.navigate(location.href)
  → getPlatformRouteKey(url)
      → unsupported: dispose current session
      → same route key: keep current session
      → replacement: dispose old session, create loading session
  → waitForElm("div.bpx-player-auxiliary", signal)
  → mountPanel(host, loading, callbacks)
  → getTranscriptForUrl(url, signal)
  → panel.updateData(ready | error)
```

- Route key 是已验证的视频 ID 加 `p`；hash 和跟踪 query 不会重建同一 session，不支持的初始 URL 不等待 anchor。
- 每个 session 持有自己的 `AbortController`、host、panel handle、canonical `PanelData` 和 observer disposer。替换/离开时先把它从 active slot 移除，再 abort、停止 observer、dispose panel 并移除 host；旧加载结果和旧 panel callback 只有在 session 仍 active 时才可写入。
- 加载成功或失败都会写入 canonical terminal data；Bilibili/API 异常显示 error，而不是永久 loading。
- `#readable-captions-root` 插入 `div.bpx-player-auxiliary` 顶部，UI 位于 open Shadow Root。MutationObserver 发现 host 被页面移除时，会把**同一个 host 和 panel handle**重新 prepend，并用 canonical data 调用 `updateData()`；不会 remount/reset，也不会丢失已提交的语言。
- Panel 自身的 `reset()`/`dispose()` 会取消字幕、生成、待渲染 frame、settings watcher 和 document listener；同一 host 再次 mount 时先调用保存的 disposer。

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
      → 读取 aid、bvid、pages[p-1] 的 selected cid
      → 仅 p=1 暴露 view subtitle.list
  → view subtitle URL 存在且 body 非空、有效
      → 使用该字幕
      → source = "human_view"
  → view URL 不存在或 body 空/无效
      → GET https://api.bilibili.com/x/player/wbi/v2?cid=<selected cid>
      → 优先选择 AI 字幕域名项，否则选择第一项
      → 要求最终字幕 body 非空、有效
      → source = "ai_wbi"
  → WBI 成功返回空字幕列表
      → transcript = null, source = "none"
```

这里的 `human_view` 是历史命名：代码只知道字幕来自 view API 的 `subtitle.list` 第一项，并未验证它一定由人工创建。不要基于这个枚举推导更强的作者属性。

分 P 必须以 selected page 的 `cid` 请求 WBI。`p>1` 不复用 view response 顶层的第 1 P 字幕列表，即使两个 page 恰好共享 `cid`；越界 `p` 直接报错，不回退到第 1 P。

View/WBI envelope 必须是对象且 `code === 0`。缺失/非零 business code、HTTP/JSON 错误、缺失 aid/cid 或越界 part 都抛出带 endpoint（以及可用时的 code）的 `BilibiliApiError`，由 active content session 转成 terminal error。只有“view 字幕 body 空/无效”会进入 WBI；网络或 business error 不伪装成无字幕。最终 WBI body 空/无效也报错。

`api.bilibili.com` 请求使用 `credentials: "include"`；字幕文件请求使用 `credentials: "omit"`，两者都转发 session/request signal。字幕 URL 的 `//` 和 `http:` 会统一规范为 HTTPS，使 committed URL 与 `<option>` 值可比较。

语言选择是 latest-wins transaction：新选择先递增 request id、abort 旧 controller，并把 controlled `<select>` 显示为 pending URL；只有仍 current 且 panel live 的非空有效结果才能以新对象提交 transcript/URL、清空错误、三份生成状态和 Note drawer，并发出完整 `PlatformTranscriptResult`。当前请求失败时保留 committed transcript/URL、回滚 select 并显示经过 Lit 文本转义的错误；stale success/failure、reset 后或 dispose 后的 continuation 都不能写 UI、data 或 callback。Content callback 只更新同一个 active session 的 canonical data，因此 host 恢复使用最后提交的语言。

## Panel 状态与渲染

`src/panel/mount.ts` 负责异步生成、settings watcher、实例状态与 cleanup。`src/panel/panel-view.ts` 主要包含 Lit template/CSS，但当前也持有少量 module-level UI 状态、直接执行时间戳跳转，并负责 Markdown 解析与净化；它不是纯视图函数：

- 三个 view 为 `original`、`intensive`、`overview`，默认值来自 settings，仓库默认是 `original`。
- `overview` 和 `intensive` 在首次进入对应 tab 时懒生成；已有文本、进行中或错误态都不会自动重复请求。
- Markdown Note 在 drawer 打开时懒生成，是导出动作而非第四个 tab。
- 原文和生成 Markdown 中可识别的时间戳会设置页面 `<video>.currentTime` 并尝试播放。
- 生成 Markdown 先经 `marked` 转换，再由 DOMPurify 清洗，最后才传给 Lit 的 `unsafeHTML`。
- 原文可复制为纯文本或带时间戳文本，可下载 TXT 或 SRT；Note 可复制或下载 `.md`。
- `isCollapsed`、`isMenuOpen` 是 `panel-view.ts` 的 module-level 状态；`mode`、`uiLanguage`、生成状态和 Note drawer 状态属于每次 `mountPanel()` 实例。
- 流式 token 只为当前可见 task 调度 `requestAnimationFrame`；同一 frame 内的多个 token 合并成一次 Lit render。完成/错误立即 flush，tab 切换、reset、dispose 和其他同步 render 会取消旧 frame，隐藏 task 不因 token 重绘。
- 标题提取只删除文档标题末尾的 `_哔哩哔哩_bilibili` 或 ` - 哔哩哔哩` suffix；`GPT-5`、`A-B-C` 等合法内部连字符保留。下载时仅用 `/[\\/:*?"<>|]/g` 把非法文件名字符替换为 `_`，生成文件再追加 `_overview`、`_intensive` 或 `_note`。

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
  ← { type: "token", text } ───────── one raw content delta
  ← { type: "done", text }  ───────── completed Markdown
  ← { type: "error", message } ────── user-visible retry state
  → { type: "cancel" } ────────────── AbortController.abort()
```

API parser 和 background 的 `token.text` 都是 raw delta；content-side provider 线性累加 delta，再把 snapshot 交给 panel。`done.text` 是 background 严格校验后的 canonical final output，content 以它覆盖最终状态。每个 port 只维护一个 active request；同一 port 上的新 start、cancel 或 disconnect 会中止旧请求，late output 被 signal/request guard 丢弃。Panel 的 request version、reset 和 cleanup 提供第二层 stale-callback 防护。

Background 用 `withKeepAlive()` 包住**一次**请求的 settings read 与完整 API stream，并每 25 秒调用一次 `chrome.runtime.getPlatformInfo()`。timer 在 success、error 或 abort 时立即且幂等清理；pulse 失败不会改变生成结果。它不是全局常驻 timer，也不跨 replacement 复用。

### Provider 行为

- OpenAI endpoint 固定为 `https://api.openai.com/v1/chat/completions`。
- DeepSeek endpoint 固定为 `https://api.deepseek.com/chat/completions`。
- 当前没有自定义 base URL 或任意 OpenAI-compatible endpoint 设置。
- DeepSeek 模型留空时使用 `deepseek-v4-flash`；OpenAI 模型留空会报错。
- `note` 复用 intensive 的模型和自定义 prompt 配置，但使用独立的 Note base prompt。
- OpenAI body 只包含 common fields：`model`、`messages`、`stream: true`。
- DeepSeek body 在 common fields 之外增加顶层 `thinking: { type: "enabled" }` 和 `reasoning_effort: "high"`。不要给 OpenAI 发送这两个字段，也不要重新引入 `extra_body`。

SSE parser 支持 LF/CRLF boundary、跨 byte chunk 的 UTF-8、多行 `data:` 和 reasoning-only progress；它只把非空 `choices[0].delta.content` 加入文本。Malformed JSON 和 streamed provider error 立即失败。EOF 只有同时满足已收到 `[DONE]`、最终 `finish_reason === "stop"`、且累计 content 非空才成功；缺 `[DONE]`、非 stop、reasoning-only 或空输出都进入 error/retry，不能把 partial text 当 success。content-bearing stop event 的 delta 会先纳入 final text。

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

Options form 是 Lit-controlled UI：select/input/textarea 使用 `.value`，checkbox 使用 `.checked`。加载、切换 provider、编辑、恢复默认都会从 `this.settings` 回写 live DOM property；“恢复默认”只改变当前表单状态，用户点击“保存设置”后才写入 storage，save 接收的值必须与屏幕显示一致。

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
| `npm run dev` 的 watcher 只重建 content | 命令启动时五个 artifact 完整且 content rebuild 会保留 sibling；background/options/manifest 改动仍需重启 dev 或运行 build |
| 有 Vitest，但没有 lint、formatter 或 CI workflow | focused test 后仍运行完整 suite、typecheck、build、diff check，并报告 Chrome/auth smoke |
| 路由检测是 800 ms polling | SPA 生命周期测试不要假定同步导航回调 |
| `human_view` 不等于已验证的人工字幕 | 不要把来源枚举当作者分类 |
| `generationAccessMode = webapp` 未实现 | 不要在 UI 或文档中宣称支持 webapp 登录态 |
| 原文搜索、播放行高亮、Planner、dynamic cards 未实现 | 只能作为产品方向或新需求，不能当作回归行为 |
