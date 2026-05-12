# Product Direction

## Core Goal

帮助用户在观看 Bilibili 长信息视频时**节省时间**。很多视频 UP 主讲话啰嗦、结构松散、迟迟讲不到重点，用户真正需要的是快速获取信息，而不是完整看完视频。

产品应该帮助用户回答：
- 这个视频能不能不看，直接读整理结果？
- 如果不能不看，应该看哪几段？
- 这个视频最重要的 takeaway 是什么？
- 如何把有用信息导出成可复用的 Markdown note？

主要目标视频：工程经验分享、产品测评、网课、教程、research/market research 视频、科普/知识类视频、行业分析和长观点视频。娱乐向视频不是主要目标。

**产品原则：能不看就不看，必须看就只看重点。**

## Panel: Three Tabs

Panel 收敛到三个主要 tab。不要添加用户可见的模式选择（如 review mode、study mode、research mode、lecture mode）。系统可在内部判断视频类型，但不暴露给用户。

| Key | Label | Responsibility |
|-----|-------|----------------|
| `original` | 原文 | 默认 tab。带时间戳原字幕，查证、搜索、跳转。证据层和导航层 |
| `intensive` | 精读 | 高信息密度阅读稿，目标是"不看视频也能理解内容" |
| `overview` | 总览 | 决策、takeaway、关键片段。帮助判断要不要看视频 |

旧版摘要 tab 已合并进 `overview`。旧 `read` tab 是早期段落化实验，不继续扩展。

### Overview

Overview 不是固定模板，而是 adaptive information-distillation page。用 dynamic cards，内容自适应视频类型：

- **测评视频** → takeaway、适合/不适合人群、优缺点、竞品对比
- **工程经验** → 可复用经验、踩坑提醒、关键例子、判断标准
- **网课** → 知识点地图、必须观看片段、公式/定义/例题
- **市场调研** → 用户痛点、产品卖点、竞品差异、槽点

应帮助用户快速理解：最短有用结论、原视频是否可跳过、哪些片段值得看/可跳过、最值得带走的信息。

UI 固定，内容自适应。

### Intensive

"Read instead of watch" tab。把 transcript 重写成高信息密度阅读稿，保留视频大致展开顺序，去掉：口头禅、重复表达、无意义寒暄、跑题内容、自我纠正、不清楚的口语表达。

Intensive 不是普通摘要。目标是视频适合文字替代时，不看视频也能理解内容。

### Original

证据层和导航层：带时间戳 transcript lines、点击跳转视频、当前播放位置高亮、搜索、核对 AI 输出是否符合原字幕。很重要，但不是主要价值主张。

## Markdown Note Export

Markdown note 是 **export action**，不是第四个 tab。由 transcript + video metadata 经 LLM 生成，是可复用 artifact。

推荐 UI 位置：overview tab 里的按钮，或 panel menu 里的 Export Markdown Note。

Note 不应只是复制 overview 或 intensive。适合保存到 Obsidian、Notion、project docs、research notes、后续 AI processing。

## LLM Output Strategy

对于复杂 AI-generated views，优先使用两步流程：

1. **Planner** — 输入 video metadata + transcript，输出 structured JSON。判断：likely video type、visual dependency、whether video can be replaced by text、watch recommendation、useful overview card types、note style。不暴露给用户。
2. **Generator** — 根据 planner result 生成 overview、intensive 或 Markdown note。

主 prompt 原则：帮用户节省观看时间。优先输出：用户最想立刻知道的结论、是否需要看原视频、有价值的时间戳、可复用 takeaway/经验/判断/知识点、具体例子和依据。

避免："本视频介绍了……" 泛泛摘要、overview 机械跟随 transcript 顺序、空泛抽象。

## UI Philosophy

**优先：** one-click defaults、adaptive generated content、clickable timestamps、concise cards、progressive disclosure、Markdown export as action。

**避免：** 让用户选择模式、增加很多 tabs、在主流程加 template selector、暴露内部 AI classification、把 panel 做成 generic chatbot、为"功能完整"牺牲第一眼可用性。
