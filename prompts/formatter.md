# JSON 格式化要求（formatter）

本提示词规定 Agent 输出的 JSON **格式与风格约束**，确保 `scripts/validate.js` 与 `scripts/generate.js` 能稳定解析。它是对 `prompts/collector.md` 与 `config/schema.json` 的补充，不替代它们。

---

## 1. 文件级约束

- **编码**：UTF-8，无 BOM。
- **格式**：标准 JSON（不是 JSONC / 不是 JS 对象字面量）。不出现尾随逗号、不出现注释、不出现未引号键。
- **缩进**：2 个空格，键顺序建议与 schema `$defs` 定义一致（便于 diff）。
- **扩展名**：`.json`，文件名 `news_{YYYY-MM-DD}.json`，落在 `data/input/`。
- **单行文本**：`summary` / `analysis` / `details` 条目内的字符串不要包含未转义换行；如需换行请用数组元素拆分，而非字符串内 `\n`。

## 2. 字段命名与类型

- 所有键使用 **snake_case**（与 schema 一致）：`published_at`、`generated_at`、`key_points` 等。
- 类型必须严格匹配：
  - `importance` → 数字（不是字符串 `"5"`）。
  - `tags` / `details` / `related` / `key_points` → 数组，即使只有一项也用 `[]`。
  - `image` → 对象或 JSON `null`，**不要**写字符串 `"null"` 或空字符串。
  - `source` / `image` 的 `url` → 字符串且为合法 URI（含 `https://`）。

## 3. 字符串内容约束

- 正文使用**简体中文**（与栏目定义一致）。
- 不写入控制字符、不写入零宽空格等不可见字符。
- 引号、反斜杠必须正确转义。
- 不写入 Markdown 代码块包裹（直接输出纯 JSON，不要 ```json … ```）。

## 4. 数值与日期

- 日期：`YYYY-MM-DD`（meta.date）。
- 时间戳：ISO 8601 含时区，如 `2026-08-29T22:55:42+08:00` 或 `2026-08-29T00:00:00Z`。
- 不在数字字段混入单位（如写 `5` 而不是 `5分`）；单位写进相邻文本。

## 5. 与生成端的契约

`scripts/generate.js` 会读取以下路径渲染：

- `meta.title` / `meta.date` / `meta.description` / `meta.generated_at` → 页头与页脚。
- `summary.overview` / `summary.key_points` → 摘要区。
- `categories[].id` / `name` / `items[]` → 各栏目区块；`items` 按 `importance` 降序、`published_at` 升序（生成端排序，无需 Agent 预排）。
- `item.type === 'rumor'` → 自动显示「未证实」徽标。
- `item.importance >= settings.rules.highlightThreshold` → 自动进入「重点新闻」。

> 因此 Agent **不必**手动维护重点区块或栏目排序，只需保证每条 `newsItem` 字段完整、准确。

## 6. 提交前最小校验

```bash
# 1) 语法检查
node -e "JSON.parse(require('fs').readFileSync('data/input/news_2026-08-29.json','utf8'))"

# 2) schema 校验（详见 scripts/validate.js）
node scripts/validate.js --input data/input/news_2026-08-29.json
```

两条都必须通过，方可进入 `generate.js` 渲染阶段。
