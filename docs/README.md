# 开发文档导航

这组文档面向维护者和 coding agent。它描述仓库当前可以验证的行为、稳定的产品约束，以及修改后应如何验证。

## 阅读顺序

1. [`product-direction.md`](product-direction.md)：先确认产品目标、非目标和交互边界。
2. [`architecture.md`](architecture.md)：理解当前代码、运行上下文、数据流和已知限制。
3. [`development.md`](development.md)：按仓库实际支持的命令开发、调试和验收。

## 按任务定位

| 任务 | 先读代码 | 同时检查 |
|---|---|---|
| 面板布局、交互或样式 | `src/panel/panel-view.ts` | `src/panel/mount.ts`、[`product-direction.md`](product-direction.md) 的三视图边界 |
| 面板状态、生成触发、字幕切换 | `src/panel/mount.ts` | `src/generation/types.ts`、`src/settings/`、[`architecture.md`](architecture.md) 的 Panel 章节 |
| Bilibili URL 或字幕获取 | `src/platforms/bilibili/api.ts`、`src/platforms/bilibili/adapter.ts`、`src/platforms/bilibili/normalize.ts` | `src/content/index.ts`、`src/panel/mount.ts`（语言切换）、`src/platforms/types.ts`、`manifest.json` |
| LLM 请求、SSE 或 prompt | `src/generation/llm-api.ts`、`src/generation/protocol.ts`、`src/generation/llm-provider.ts`、`src/background.ts` | `src/panel/mount.ts`（状态消费）、`src/panel/panel-view.ts`（净化/渲染）、`src/settings/types.ts` |
| 设置字段或默认值 | `src/settings/types.ts`、`src/settings/defaults.ts`、`src/settings/storage.ts` | `src/options/index.ts`、`src/panel/mount.ts`、旧字段迁移 |
| Content script 启动或 SPA 跳转 | `src/content/` | `src/content.ts`、`src/panel/mount.ts` |
| 构建、入口或权限 | `package.json`、`vite.config.ts`、`vite.background.config.ts`、`vite.options.config.ts` | `manifest.json`、`copy-manifest.mjs` |

## 文档约定

- **当前实现以代码和配置为准。** `architecture.md` 只描述已经存在的行为；发现不一致时，先核对代码，再同步文档。
- **未来方向必须显式标注。** `product-direction.md` 中的 `已实现`、`近期方向` 和 `暂不做` 不可混写，避免 agent 把设想当成现有能力。
- **避免复制低层实现细节。** 产品文档可以保留最小回归基线；协议、数据流和限制以架构文档为唯一详细来源，`AGENTS.md` 只保留必须随时可见的约束。
- 路径均相对仓库根目录。若改动跨越 extension context、运行时协议、设置结构、构建步骤或产品边界，同一改动中更新对应文档。
