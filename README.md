# AI Daily Briefing（每日科技资讯早报）

一套「**Agent 产出 JSON → 程序校验 → 渲染 HTML 邮件 → 定时发送**」的自动化早报系统。

本仓库只负责**后半段确定性流程**（校验 / 渲染 / 发送）。新闻内容由上游的
`collector` Agent 依据 `prompts/collector.md` 与 `config/categories.js` 采集并写成
符合 `config/schema.json` 的 JSON，落到 `data/input/`。

```
ai-daily-briefing/
├── config/                         # 配置
│   ├── categories.js               # 栏目定义、信息源（ESM，供脚本与 Agent 共用）
│   ├── settings.js                 # 全局配置（排序、阈值、发送参数）
│   └── schema.json                 # Agent 输出的 JSON Schema
├── prompts/                        # 给 Agent 的提示词
│   ├── collector.md                # 新闻搜集 / 整理 Agent（分片模式）
│   ├── reviewer.md                 # 审核查重 / 合并 Agent
│   ├── publisher.md                # 渲染分发 Agent
│   └── formatter.md                # JSON 格式化要求
├── templates/
│   └── email.html                  # 邮件 HTML 模板（含 {{TOKEN}} 占位符）
├── data/
│   ├── input/                      # 正式输入 news_{date}.json
│   │   └── partials/               # 采集 Bot 的分片输出
│   ├── processed/                  # 程序处理后（合并/排序/补齐）的 JSON + 查重报告
│   └── archive/                    # 历史原始数据副本
├── output/
│   ├── html/                       # 邮件版 HTML（内联 CSS）
│   └── preview/                    # 网页版 HTML（可双击打开）
├── scripts/
│   ├── lib.mjs                     # 共享工具库
│   ├── dedupe.js                   # 分片合并 + 查重去重
│   ├── validate.js                 # JSON Schema + 语义校验
│   ├── generate.js                 # JSON → HTML
│   └── send.js                     # 邮件发送（nodemailer）
├── logs/                           # last_run.json 等运行日志
├── .env.example                    # 私密配置样例（复制为 .env 填写）
├── .gitignore
├── package.json
└── README.md
```

## 多 Bot 分工架构（推荐）

整条流水线由多个 Hermes Bot（每个 Bot = 一个独立 profile，可 pin 不同模型）协作完成：

```
collector-1           collector-2            collector-3
模型A（视角甲）        模型B（视角乙）         模型C（视角丙）
  ↓ 独立全量采集        ↓                     ↓
  data/input/partials/collector-1_{date}.json   …各写各的分片…
  （每个采集 Bot 都覆盖全部栏目，只是信源侧重不同——多模型独立工作，内容互补）
                                  ↓ 全部就绪
reviewer（审核查重，最强模型）
  ├─ node scripts/dedupe.js --date {date}    ← 确定性查重（URL/标题相似度/跨栏目）
  ├─ 语义级复核（同事件不同报道、误合并恢复、rumor 补标）
  ├─ 补全 meta / summary
  └─ 写入 data/input/news_{date}.json + validate.js 校验
                                  ↓
publisher（分发，轻模型）
  ├─ node scripts/generate.js     ← JSON → HTML（邮件版 + 网页版）
  └─ node scripts/send.js         ← SMTP 发送（dry-run 先行）
```

- **独立采集**：采集 Bot **不做栏目分工**，各自覆盖全部栏目；不同模型的信源偏好与检索策略不同，合起来覆盖面更全。每个 Bot 的**视角侧重**写在它自己的 SOUL.md / 任务指令里（偏英文官方源、偏中文社区源、偏开发者生态等）。
- **隔离**：采集 Bot 各写各的分片（`data/input/partials/`），并发无冲突；合并去重是 reviewer 的职责。
- **查重两级**：`dedupe.js` 处理确定性重复（URL 规范化一致、标题 bigram 相似度 ≥ 0.85、跨栏目同 URL、id 重排）；reviewer Bot 处理语义级重复。多模型全量采集会产生大量重叠，去重是 reviewer 的核心工作。
- **编排**：给每个 Bot 在桌面 app 的 **Bots** 标签页（或 CLI `hermes profile create`）创建，各自挂 Routine（cron）；先手动触发跑通，再上定时。
- **提示词**：`prompts/collector.md`（采集）、`prompts/reviewer.md`（审核查重）、`prompts/publisher.md`（渲染分发）。

## 环境要求

- Node.js ≥ 18（本地为 v26，已验证）
- 无需构建步骤；脚本为原生 ESM（`.js` 走 `package.json` 的 `"type": "module"`）

## 安装依赖

```bash
cd ai-daily-briefing
npm install        # 安装 ajv / ajv-formats / nodemailer
```

## 三步工作流

### 1) 采集（由 Agent 完成，非本仓库脚本）

`collector` Agent 读取 `config/categories.js` 与 `prompts/collector.md`，
把当日资讯写成 `data/input/news_2026-08-29.json`（结构见 `config/schema.json`）。

### 2) 校验

```bash
node scripts/validate.js --input data/input/news_2026-08-29.json
# 或（默认用今天日期）
node scripts/validate.js
```

校验两项内容：

- **结构**：用 `config/schema.json`（ajv + ajv-formats）。
- **语义**：id 唯一性、来源/图片/相关链接 URL 合法性、`importance` 1–5 范围、
  未知栏目 id 等 schema 管不到的部分。

通过才允许进入渲染；`settings.validation.failOnError=false` 时仅告警不中断。

### 3) 渲染

```bash
node scripts/generate.js --input data/input/news_2026-08-29.json
```

产出：

- `output/html/news_{date}.html` —— 邮件版（内联 CSS，主流客户端兼容）
- `output/preview/news_{date}.html` —— 网页版（同模板，可本地打开）
- `data/processed/news_{date}.json` —— 排序/补齐后的 JSON
- `data/archive/news_{date}.json` —— 原始输入归档

重点新闻（`importance ≥ settings.rules.highlightThreshold`，默认 4）会自动
抽进「重点新闻」区块；`type === 'rumor'` 的条目自动显示「未证实」徽标。

### 4) 发送（可选）

```bash
# 先复制并填写私密配置
cp .env.example .env      # 编辑 .env：RECIPIENTS / SMTP_*

# dry-run 预览（不发信）
node scripts/send.js --date 2026-08-29 --dry-run

# 真实发送（需 settings.email.enabled=true 且 .env 配置齐全）
node scripts/send.js --date 2026-08-29
```

`settings.email.enabled=false` 时，无论是否加 `--dry-run` 都只做 dry-run，
避免误发。`send.js` 同时附带纯文本备选（plaintext）以提升送达率。

## 一键命令

```bash
npm run validate     # 校验今天的数据
npm run generate     # 渲染今天的数据
npm run build        # validate + generate
npm run pipeline     # validate + generate + send
```

## 配置说明（config/settings.js）

| 项 | 含义 |
|----|------|
| `categoryOrder` | 栏目渲染顺序（必须是 `categories.js` 中的 id） |
| `rules.highlightThreshold` | 进入「重点新闻」的 importance 阈值（默认 4） |
| `rules.maxHighlights` | 重点新闻最大条数（默认 6） |
| `rules.maxItemsPerCategory` | 每栏最大条数（`null` = 不限） |
| `rules.showRumorBadge` | 是否为爆料显示「未证实」徽标 |
| `email.subjectTemplate` | 邮件主题，`{date}`/`{count}` 会被替换 |
| `email.enabled` | 总开关；`false` 时 send.js 永远只 dry-run |

## 数据契约（Agent 必须遵守）

- 顶层：`meta` / `summary` / `categories` 齐全。
- 每条 `newsItem` 含 12 个必填字段（见 `config/schema.json` 与 `prompts/formatter.md`）。
- 爆料/未证实：`type='rumor'`，且标题/摘要须含「据报/传/或将/疑似」等不确定性措辞。
- 所有 `url`、图片链接必须真实可访问，禁止占位与编造。
- 输出为合法 JSON（非 JSONC、非 JS 字面量），可被 `validate.js` 通过。

## 与上游 Agent 的衔接

- `prompts/collector.md` 是给采集 Agent 的系统提示词，包含覆盖时间窗、
  信息源优先级、字段规范与质量红线。
- `prompts/formatter.md` 规定 JSON 的格式与风格约束，保证脚本稳定解析。
- 如需把生成接入定时任务，可在 `cron` / GitHub Actions 中调用
  `npm run pipeline`（需提前配好 `.env` 与 SMTP）。
