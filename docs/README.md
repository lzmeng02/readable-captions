# 开发文档导航

这组文档面向维护者和 coding agent。它描述仓库当前可以验证的行为、稳定的产品约束，以及修改后应如何验证。

## 阅读顺序

1. [`product-direction.md`](product-direction.md)：先确认产品目标、非目标和交互边界。
2. [`architecture.md`](architecture.md)：理解当前代码、运行上下文、数据流和稳定契约。
3. [`development.md`](development.md)：按仓库实际支持的命令开发、调试和验收。

## 按任务定位

| 任务 | 先读代码 | 回归位置 |
|---|---|---|
| Panel 布局、状态、生成渲染、字幕切换 | `src/panel/panel-view.ts`、`src/panel/mount.ts`、`src/panel/render-scheduler.ts` | `tests/dom/panel/`、`tests/unit/panel/` |
| Bilibili URL、分 P、API 或字幕 | `src/platforms/bilibili/`、`src/platforms/types.ts` | `tests/unit/platforms/bilibili/`、`tests/unit/content/controller.test.ts` |
| Content session、SPA 或 host 恢复 | `src/content/`、`src/content.ts` | `tests/unit/content/controller.test.ts` |
| LLM payload、SSE、port、keepalive | `src/generation/`、`src/background*.ts` | `tests/unit/generation/`、`tests/unit/background/`、`tests/dom/panel/mount-generation-render.test.ts` |
| 设置、Options 或公开设置边界 | `src/settings/`、`src/options/index.ts` | `tests/unit/settings/`、`tests/dom/options/` |
| 标题或导出文件名 | `src/panel/title-utils.ts`、`src/panel/export-utils.ts` | `tests/unit/panel/title-utils.test.ts`、`tests/dom/panel/mount.test.ts` |
| 构建、入口或权限 | `package.json`、三个 Vite config、`manifest.json`、`copy-manifest.mjs` | `tests/integration/dev-output.test.ts`，再运行完整 build/artifact 检查 |

## 文档约定

- **当前实现以代码和配置为准。** `architecture.md` 只描述已经存在的行为；发现不一致时，先核对代码，再同步文档。
- **未来方向必须显式标注。** `product-direction.md` 中的 `已实现`、`近期方向` 和 `暂不做` 不可混写，避免 agent 把设想当成现有能力。
- **避免复制低层实现细节。** 产品文档可以保留最小回归基线；协议、数据流和限制以架构文档为唯一详细来源，`AGENTS.md` 只保留必须随时可见的约束。
- 路径均相对仓库根目录。若改动跨越 extension context、运行时协议、设置结构、构建步骤或产品边界，同一改动中更新对应文档。
- 先按上表定位 focused test；完整交付命令、Chrome smoke matrix 和常见故障定位统一见 [`development.md`](development.md)。
