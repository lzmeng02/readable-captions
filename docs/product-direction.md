# 产品方向

本文定义稳定的产品目标、当前能力和未来方向。它不是当前架构说明；代码已经实现什么，以 [`architecture.md`](architecture.md) 为准。

状态词含义：

- **已实现**：当前代码存在，修改时需要回归。
- **近期方向**：值得继续设计，但尚不是现有能力；开始实现前需要明确需求与验收标准。
- **暂不做**：除非有新的明确产品决策，否则不要主动扩展。

## 北极星

帮助用户在 Bilibili 长信息视频中节省时间：

> 在保证能够拿走 takeaway 的情况下，能不看视频就不看；必须看视频时，只看重点。

产品首先帮助用户回答：

- 这个视频是否可以用文字替代观看？
- 最重要的结论、方法、风险或行动建议是什么？
- 如果仍需看视频，哪些片段最值得看？
- 如何把有用信息带走，形成可复用的 Markdown note？

目标内容包括工程经验、产品测评、课程/教程、研究与市场分析、科普知识、行业分析和长观点视频。纯娱乐内容不是主要优化对象。

## 稳定交互边界

### 三个 view

Panel 只保留三个用户可见的主 view：

| Key | 用户价值 | 当前状态 |
|---|---|---|
| `original` | 原始证据与视频导航 | **已实现**，也是仓库默认 view |
| `intensive` | 用高信息密度阅读稿替代连续观看 | **已实现** |
| `overview` | 快速获得 takeaway、主路径和关键时间戳 | **已实现** |

用户可以在 Options 中更改默认 view，但不增加新的顶层 tab 来承载生成模式。

### Markdown Note

Markdown Note 是 **export action**，不是第四个 view。它面向 Obsidian、Notion、项目文档、研究笔记和后续 AI processing 等复用场景，不应只是机械复制 Overview 或 Intensive。

### 内部自适应不等于用户配置

系统可以根据字幕内容调整输出侧重，但不向用户暴露 review/study/research/lecture 等模式选择、内部分类、planner 结果或主流程 template selector。用户选择的是目标结果，不是 prompt pipeline。

## 当前产品能力

这一节是 coding agent 的回归基线，不把设想算作已完成。

### Original：已实现

- 展示带时间戳的字幕行。
- 点击时间戳跳转并尝试播放视频。
- view API 返回多个字幕时允许切换语言。
- 支持复制纯文本/带时间戳文本，以及下载 TXT/SRT。
- 作为核对 AI 输出的证据来源。

尚未实现：字幕搜索、当前播放行高亮、结果内引用与原文行的自动关联。

### Intensive：已实现

- 首次进入 tab 时按需调用 LLM。
- 将字幕整理为高信息密度 Markdown 阅读稿。
- Prompt 要求保留大致展开顺序，删除口头禅、重复、寒暄、跑题和自我纠正。
- 支持流式 partial text、错误态和重试。

它不是普通摘要；目标是在适合文字表达的视频中尽量替代连续观看。但当前实现仍是一次直接 LLM 生成，未先构建内容规划或证据结构。

### Overview：已实现

- 首次进入 tab 时按需调用 LLM。
- 当前 prompt 固定要求输出 `TL;DR`、`要点 / 步骤`、`时间戳` 三部分。
- Prompt 会根据测评、教程、工程经验、课程、市场分析等内容调整信息侧重。
- UI 当前把结果渲染为一块经过净化的 Markdown，不是 dynamic cards。

因此，准确表述是“固定大纲内的内容自适应”，不能把当前实现描述为任意结构的动态卡片系统或两阶段 planner。

### Markdown Note：已实现

- 打开 Note drawer 时按需生成。
- 使用独立的 Note base prompt。
- 当前复用 Intensive 的模型和用户补充 prompt 配置。
- 支持复制和下载 Markdown。

## 产品原则

### 1. 结论先于视频复述

优先输出用户最想立即知道的判断、行动路径、关键证据、限制条件、风险和可迁移经验。避免以“本视频介绍了……”开头的元叙述，也避免按字幕顺序机械缩写。

### 2. 节省时间必须可验证

Overview 应给出真正有价值的时间戳；AI 内容不得编造字幕外事实。无法从字幕判断时明确说明不确定性。Original 是重要证据层，即使它不是主要价值主张。

### 3. 默认路径轻量

优先 one-click defaults、progressive disclosure 和少量清晰操作。不要为了功能完整度增加常驻控制、很多 tabs 或模板市场。

### 4. UI 固定，内容适配

保持稳定的三 view 结构，让生成内容针对视频类型调整重点。内部 pipeline 可以演进，但用户不应被迫理解模型、planner 或内容分类才能得到结果。

### 5. Bilibili 优先

当前价值和技术风险都集中在 Bilibili 的页面生命周期、字幕接口和长视频体验。除非需求明确，不为潜在平台提前构建通用框架。

## 近期方向

以下是候选方向，不是当前功能承诺。每项进入实现前都应有单独需求、设计和验收。

### Original 证据体验

目标：让用户更快核对 AI 结论和定位视频片段。

候选能力：

- 字幕全文搜索与命中跳转。
- 根据 `<video>.currentTime` 高亮当前字幕行。
- Overview/Intensive 的时间戳或引用跳回对应原文。

最低验收应覆盖长字幕性能、SPA 导航后的状态重置、语言切换后的索引更新和无 video element 时的降级。

### 更结构化的 Overview

目标：比固定 Markdown 更快回答“结论是什么、是否值得看、看哪里”。

候选能力：

- 清晰的 watch recommendation 与 visual dependency 判断。
- 按内容选择少量 card 类型，例如步骤、优缺点、风险、关键证据或知识地图。
- 每个重要判断保留可追溯时间戳。

在实现 dynamic cards 前，需要先定义稳定 JSON schema、解析失败降级、未知 card 兼容和安全渲染；不能只让 LLM 输出任意 HTML。

### Planner → Generator

目标：对复杂视频先建立内部内容计划，再分别生成 Overview、Intensive 或 Note。

候选 planner 输出包括 likely content type、visual dependency、text-replaceability、watch recommendation、overview sections 和 note style。Planner 结果不直接展示给用户。

进入实现前至少要明确：schema 版本、验证与修复策略、额外请求的成本/延迟、取消行为、缓存边界、失败时回退到单次生成，以及如何用 fixture 评估比现有 prompt 更好。

## 暂不做

- 增加第四个常驻 tab 或大量用户可见的生成模式。
- 把 Panel 做成 generic chatbot。
- 在主流程暴露 prompt template selector、planner 结果或模型内部分类。
- 主动引入 React、Tailwind、Material UI 等第二套 UI 系统。
- 在没有明确平台需求时抽象通用多平台框架。
- 为娱乐视频牺牲长信息视频的第一眼可用性。

## 功能决策检查

提出或实现新功能前，依次回答：

1. 它是否直接减少用户观看或查找信息的时间？
2. 它属于三 view 中哪一个，还是一次 export action？
3. 用户是否必须理解内部 AI 分类或配置才能使用？如果是，能否移到默认策略或 Options？
4. 结果能否回到字幕或时间戳进行核对？
5. 它是当前 Bilibili 需求，还是为未知未来提前抽象？
6. 失败、无字幕、无 API key、SPA 跳转和设置变化时如何降级？

不能清楚回答这些问题时，先完善需求，不要把设想直接写进当前架构或回归基线。
