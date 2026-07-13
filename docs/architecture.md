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
- Panel 的 `reset(next)` 会取消待渲染 frame、字幕请求和三类生成工作，替换 per-video data，恢复 `original` mode、清除用户选 tab 标记并关闭 Note，然后重新渲染；panel 实例仍存活，因此保留 long-lived public-settings watcher 和 document pointer listener。`dispose()` 才会在取消这些 pending work 之外标记实例结束、停止 watcher 并移除 document listener；同一 host 再次 mount 时会先调用保存的 disposer。

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

`src/panel/mount.ts` 负责异步生成、settings watcher、实例状态与 cleanup。`src/panel/panel-view.ts` 主要包含 Lit template/CSS，但当前仍持有 module-level collapse 状态、直接执行时间戳跳转，并负责 Markdown 解析与净化；它不是纯视图函数：

- 三个 view 为 `original`、`intensive`、`overview`，默认值来自 settings，仓库默认是 `original`。
- `overview` 和 `intensive` 在首次进入对应 tab 时懒生成；已有文本、进行中或错误态都不会自动重复请求。
- Markdown Note 在 drawer 打开时懒生成，是导出动作而非第四个 tab。
- 原文和生成 Markdown 中可识别的时间戳会设置页面 `<video>.currentTime` 并尝试播放。
- 生成 Markdown 先经 `marked` 转换，再由 DOMPurify 清洗，最后才传给 Lit 的 `unsafeHTML`。
- 原文可复制为纯文本或带时间戳文本，可下载 TXT 或 SRT；Note 可复制或下载 `.md`。
- 只有 `isCollapsed` 是 `panel-view.ts` 的 module-level 状态；`isMenuOpen`、`mode`、`uiLanguage`、生成状态和 Note drawer 状态都属于每次 `mountPanel()` 实例。More menu 不依赖隐式重绘关闭：reset、外部 pointer 以及设置、Note、语言动作都会先把该实例的 `isMenuOpen` 显式转为 `false`，再按各自动作需要重绘；menu 关闭时 document pointer handler 会直接返回。
- 流式 token 只为当前可见 task 调度 `requestAnimationFrame`；同一 frame 内的多个 token 合并成一次 Lit render。完成/错误立即 flush，tab 切换、reset、dispose 和其他同步 render 会取消旧 frame，隐藏 task 不因 token 重绘。
- 标题提取只删除文档标题末尾的 `_哔哩哔哩_bilibili` 或 ` - 哔哩哔哩` suffix；`GPT-5`、`A-B-C` 等合法内部连字符保留。下载时仅用 `/[\\/:*?"<>|]/g` 把非法文件名字符替换为 `_`，生成文件再追加 `_overview`、`_intensive` 或 `_note`。

Public settings 有独立的 `pending | ready | error` readiness，不与字幕的 loading/ready/error 混用：

- Panel 创建时先显示 `original`，并把 `generationEnabled` 设为 `false`、copy/download format 设为 `null`。原文和“设置”入口仍可用，但生成 tab、Note、复制和下载都以原生 `disabled` 或 handler guard fail closed。
- 只有 `watchPublicSettings()` 送达第一个通过校验的真实值后，Panel 才应用配置的默认 tab，并开放该值允许的动作。
- settings port 缺失、连接抛错，或在第一个值前/已经 `ready` 后断开，都会报告一次当前 transport outage，并进入有界退避的重连路径。background 发来的 `type: "error"` read 结果同样报告 outage，但不会断开仍 current 的 port，也不会自行安排 reconnect timer。两条路径都会让 Panel 进入 `error`：显示 `role="alert"`，取消并清空生成工作，继续关闭 settings-dependent actions，不保留旧 `ready` 权限，也不用硬编码默认值兜底。
- 对 transport failure，`watchPublicSettings()` 会为同一 outage 只保留一个 reconnect timer，以 100 ms 起步做指数退避，并把单次等待限制在最多 5000 ms。connection generation 与 active-port identity 使旧 port 的迟到 message/disconnect 失效；unsubscribe 会清 timer、使 generation 失效并安全断开 active port。
- 当前 port 送达通过消息校验、connection-generation 与 active-port identity 检查的有效 settings snapshot 时，才结束 outage、把退避重置为 100 ms 并再次调用 `onSettings`。这个 port 可以是 read error 后保留的同一个 active port（由后续 `watchSettings()` broadcast 恢复），也可以是 transport failure 后新连接的 active port；Panel 随后从 `error` 恢复为 `ready`，按这份 authoritative snapshot 恢复允许的动作。outage/reconnect 期间从不发布 defaults。
- Background 为每个 public-settings port 保存 revision；live `watchSettings()` broadcast 会推进 revision，使该 port 尚未完成的初始 read success/error 失效，disconnect 则删除 port。这样较新的 live value 不会被旧 snapshot 或迟到的 read error 覆盖。
- 后续 `generationEnabled` 关闭或 `generationSettingsKey` 改变都会清空已有生成状态；设置读取失败时同样清空。`dispose()` 才停止 long-lived settings watcher。

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
                                        → generationEnabled ?
                                            → withKeepAlive(
                                                streamGenerationFromApi()
                                                  → getGenerationProvider(selected id)
                                                  → selected provider profile
                                                  → provider.buildRequest()
                                                  → fetch(chat-completions, SSE)
                                              )
                                          : { type: "error" }
  ← { type: "token", text } ───────── one raw content delta
  ← { type: "done", text }  ───────── completed Markdown
  ← { type: "error", code } ───────── validated code → safe retry message
  → { type: "cancel" } ────────────── AbortController.abort()
```

API parser 和 background 的 `token.text` 都是 raw delta；content-side provider 线性累加 delta，再把 snapshot 交给 panel。`done.text` 是 background 严格校验后的 canonical final output，content 以它覆盖最终状态。每个 port 只维护一个 active request；同一 port 上的新 start、cancel 或 disconnect 会中止旧请求，late output 被 signal/request guard 丢弃。Panel 的 request version、reset 和 cleanup 提供第二层 stale-callback 防护。

Background 对每个 start 先读取 canonical settings，并在任何 keepalive/provider side effect 前检查 `generationEnabled`。关闭时返回稳定的 `generation-disabled` code，不会启动 keepalive，也不会调用 provider。generation runtime error 只传 `GenerationErrorCode`，content 通过有限 code/message registry 构造用户可见错误；已知 settings/config/disabled/runtime 类别保留稳定提示，未知 dependency error 统一为 `generation-failed`。HTTP error body/status text、streamed provider `error.message` 和任意 dependency `Error.message` 不进入 runtime message、Panel DOM 或日志。开启时 `withKeepAlive()` 只包住这一次完整 API stream，并每 25 秒调用一次 `chrome.runtime.getPlatformInfo()`；timer 在 success、error 或 abort 时立即且幂等清理。它不是全局常驻 timer，也不跨 replacement 复用。

### Provider 行为

- Options 的 API-key control 刻意避开 password-manager/login semantics：它始终是 `type="text"`，使用 provider-specific `name="generationApiKey-<provider>"`，并设置 `autocomplete="off"`、`autocapitalize="off"`、`spellcheck="false"`；隐藏效果由 `.masked` 的 Chrome `-webkit-text-security` 提供，而不是 `type="password"`。
- API key 与 Overview/Intensive model control 包在 `keyed(generationProvider, ...)` 中；切换 provider 会重建整组 credential/model DOM，而不是复用可能已被 Chrome Autofill 污染的节点。三个 value binding 都通过 Lit `live()` 比较 live DOM property 与 authoritative draft，因此即使模板值未变，也会纠正浏览器在渲染后写入的值。
- reveal state 只属于当前 Options 状态，并在 provider 切换及 authoritative transition 后恢复隐藏：初始/重试 load、Reset、clean external refresh、“载入外部设置”和“保留当前编辑”都会设置 `showApiKey = false`。这些 browser-safety transition 不会仅因不同 provider 的 credential 相同就自动删除或合并 persisted key；Reset 仍只替换 draft，只有随后 Save 才持久化该 reset。
- `src/generation/provider-catalog.ts` 是 provider id、Options label/help/placeholder/default model 和 request builder 的单一 catalog；`GenerationProvider` 由 catalog id 推导，Options 直接遍历同一 catalog，不维护第二份 provider 列表。
- `streamGenerationFromApi()` 先按 `generationProvider` 取得 catalog entry，再只读取 `generationProviderSettings[generationProvider]`。selected profile 的 key 为空会在 `fetch` 前报错；模型使用对应 task 的配置，`note` 复用 `intensive`，仅在 catalog entry 声明 `defaultModel` 时才做 request-time fallback。
- endpoint、Authorization header 和 provider-specific body 由 selected entry 的 `buildRequest()` 产生。`ProviderRequest.streamDecoder` 必须经过 `satisfies Record<GenerationStreamDecoderId, ProviderStreamDecoder>` 的 exhaustive registry dispatch；当前唯一 adapter 是 `chat-completions-sse`，OpenAI 与 DeepSeek 共用它。扩展 decoder union 会在 adapter 未实现时产生 type error，不能只写一个 catalog 字段。
- OpenAI endpoint 固定为 `https://api.openai.com/v1/chat/completions`。
- DeepSeek endpoint 固定为 `https://api.deepseek.com/chat/completions`。
- 当前没有自定义 base URL 或任意 OpenAI-compatible endpoint 设置。
- DeepSeek 模型留空时使用 catalog 的 `deepseek-v4-flash`；无 catalog default 的 provider 模型留空时，由 catalog-owned resolver 使用 selected entry label 产生缺模型错误，不在 transport 中硬编码 OpenAI。
- `note` 复用 intensive 的模型和自定义 prompt 配置，但使用独立的 Note base prompt。
- OpenAI body 只包含 common fields：`model`、`messages`、`stream: true`。
- DeepSeek body 在 common fields 之外增加顶层 `thinking: { type: "enabled" }` 和 `reasoning_effort: "high"`。不要给 OpenAI 发送这两个字段，也不要重新引入 `extra_body`。

SSE parser 支持 LF/CRLF boundary、跨 byte chunk 的 UTF-8、多行 `data:` 和 reasoning-only progress；它只把非空 `choices[0].delta.content` 加入文本。Malformed JSON 和 streamed provider error 立即映射到稳定 safe category，不保留/抛出 provider-owned message。EOF 只有同时满足已收到 `[DONE]`、最终 `finish_reason === "stop"`、且累计 content 非空才成功；缺 `[DONE]`、非 stop、reasoning-only 或空输出都进入 `provider-response-invalid`/retry，不能把 partial text 当 success。content-bearing stop event 的 delta 会先纳入 final text。

## Settings 与迁移

唯一 storage key 是 `extensionSettings`。新写入使用 private `{ storageVersion: 1, revision, settings }` envelope；旧版本留下的 raw settings object 仍可直接读取/监听。envelope 只提供写入 provenance，解包后不会进入 canonical/public settings。业务代码通过以下封装访问：

- `getSettings()`：background/options 解包 envelope 或 legacy raw object，再经 `mergeSettings()` 返回纯 `ExtensionSettings`。
- `createSettingsWriteRevision()` / `saveSettings(settings, revision)`：Options 在每次写前生成 caller-known UUID；即使 settings 值相同，envelope revision 也不同，从而产生可关联的写入 provenance。
- `watchSettings()`：background/options 监听 `chrome.storage.local` 中该 key 的变化，返回 canonical settings 与独立 `{ revision | null }` metadata，并提供 unsubscribe；legacy raw change 的 revision 是 `null`。
- `toPublicSettings()` / `watchPublicSettings()`：通过 `readable-captions-public-settings` port 向 content panel 提供不含 provider profile、API key、provider id 或 prompt 的 `PublicExtensionSettings`。runtime connect 缺失/返回空 port/抛错以及任意阶段的 disconnect 会报告 outage，并触发有上限的指数退避重连；background read error 只报告 outage 并保留 current port。两条路径都只在通过消息校验与 connection-generation/active-port identity 检查的 settings snapshot 后恢复 readiness，或在 caller unsubscribe 时终止。

Background 启动时调用 `chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })`，content script 不直接访问完整 storage。不要绕过这些封装直接调用 `chrome.storage.local`。

生成设置的 canonical shape 是每个 catalog provider 各自持有一个独立 profile；prompt 仍是跨 provider 共享的 task intent：

```ts
type GenerationProviderProfile = {
    apiKey: string;
    models: { overview: string; intensive: string };
};

type ExtensionSettings = {
    defaultTab: "original" | "intensive" | "overview";
    generationEnabled: boolean;
    generationProvider: GenerationProvider;
    generationProviderSettings: Record<GenerationProvider, GenerationProviderProfile>;
    generationPromptTemplates: { overview: string; intensive: string };
    copyFormat: "readable_text" | "timestamped_text";
    downloadFormat: "txt" | "srt";
};
```

当前默认 provider 是 `deepseek`；defaults/normalizer 遍历 `GENERATION_PROVIDER_VALUES`，为 OpenAI 与 DeepSeek（以及未来 catalog id）创建空 key、空 Overview/Intensive model 的独立 nested object。DeepSeek 的 `deepseek-v4-flash` 是 request-time catalog default，不写入 profile。`generationEnabled` 默认 `true`，其余顶层默认仍为 `original`、空 prompt、`readable_text` 和 `txt`。`generationAccessMode` 已从 canonical type、默认值、保存结果、public cache 与 UI 中移除。

`mergeSettings()` 的迁移 precedence 必须保持：

1. selected provider 依次取有效 `generationProvider`、有效 `summaryProvider`、仓库默认 `deepseek`。
2. 如果 raw object **拥有** `generationProviderSettings` 属性（即使值 malformed），只规范化新 schema，为 catalog 中每个 provider 生成 profile，并忽略旧 global credential/model 字段；这防止用户清空的新 profile 被旧 key 复活。
3. 只有新属性完全缺失时，才把 legacy globals 迁入 selected provider：API key 优先使用 string 类型的 `generationApiKey`，否则取 `summaryApiKey`；每个 task model 优先使用 string 类型的 `generationModels[task]`，否则取 `summaryModel`。空或全空白的 current string 仍算已提供，会 trim 成空而不会继续 fallback；其他 provider 保持空 profile。prompt 内容保持原样，并按相同的 current/legacy string-type fallback 读取。
4. `summary` tab 仍迁为 `overview`，`read` 仍迁为 `intensive`；`generationAccessMode`/`summaryAccessMode` 被忽略。`saveSettings()` 的 envelope payload 只含 canonical schema，普通 read 不会自动回写 migration。

`PublicExtensionSettings` 只含 `defaultTab`、`generationEnabled`、copy/download format 和 `generationSettingsKey`，且 port validator 会校验三个 enum。`generationSettingsKey` 的输入只有 selected provider id、selected profile 的 Overview/Intensive models 和共享 prompt templates；它明确排除 API key、任何 key-derived material 和 inactive profiles。输入经 64-bit FNV-1a 生成固定 13 字符 base36 digest，public payload 保持 opaque/bounded；切换 provider、修改 selected model 或 prompt 会使生成结果失效，只改 key 或 inactive profile 不会。

Options 使用 `loading | ready | saving | error` 状态机，而不是先放一份可编辑默认值：

- load 时 `draft = null`，form/save/reset 不可用，但 About 仍可导航；先订阅 `watchSettings()` 再启动 read，read pending 期间只保留最新 watcher value，并在 read resolve 时优先采用它，消除 read→subscribe handoff 丢写窗口。失败则显示 Retry，不能保存 defaults；reload/disconnect 会让 stale promise 失效、清空 retained write revisions 并注销 watcher/timer。
- dirty 由 `JSON.stringify(mergeSettings(draft))` 与 baseline 比较得出。save 只允许在 `ready` 且无 conflict 时开始；保存期间整个 fieldset（含 save/reset）禁用，save 返回的 canonical value 成为新 baseline。save 失败则保留 draft、回到 `ready` 并显示错误。
- clean form 收到外部 storage 更新会立即采用；dirty 或 saving form 保存最新 external value 为 conflict 并阻止 save。“载入外部设置”用 external value 同时替换 draft/baseline；“保留当前编辑”只把 baseline 移到 external value，因此 local draft 仍 dirty，下一次 save 是明确覆盖。
- Options 在 `saveSettings()` 前创建 unique revision；只有 watcher metadata 中相同 revision 才是 own-save acknowledgement，canonical value equality 从不作为 provenance。save 已 resolve 但 watcher event 未到时，revision 保留在最多 8 项的 bounded set 中直到消费；迟到 acknowledgement 不会清除或替换已持有的较新 conflict。未来同值 external write 使用不同/null revision，因此 X/no-ack → Z → X 不会被吞掉；retained set 在 reload/disconnect 重置。
- API key 和两个 model input 只更新 selected profile；切换 provider 只改 selected id，切回来会恢复该 provider 的 draft，同时通过 keyed DOM replacement、`live()` property binding 和 reveal reset 阻断浏览器残留值/显示状态跨 profile 延续。prompt 仍共享；Reset 只改 draft，直到用户 Save 才写 storage。

## 信任边界与外发数据

- LLM HTTP 请求和 `Authorization` header 只在 background service worker 中创建。除 Options 的凭据输入框外，不要把 key 放进 runtime-port message、Bilibili 页面/panel DOM、console 或导出内容。
- Provider/dependency 原始 error text 也属于 background trust boundary：HTTP error body/status、SSE error payload 和任意 dependency `Error.message` 只能映射成有限 `GenerationErrorCode`，不得进入 message/DOM/log；Panel 对非 typed generation error 再 fail-safe 为 generic message。
- Content script 只通过 public-settings port 接收 `PublicExtensionSettings`；该对象不含 provider id、profiles、API keys 或 prompts。Background/options 才能读取完整 `ExtensionSettings`。
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
| 自定义 base URL / 任意 OpenAI-compatible endpoint 未实现 | 新 provider 必须通过 catalog adapter、manifest permission 与完整验证接入，不要让用户输入任意 endpoint |
| 原文搜索、播放行高亮、Planner、dynamic cards 未实现 | 只能作为产品方向或新需求，不能当作回归行为 |
