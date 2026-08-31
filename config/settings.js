/**
 * AI Daily Briefing - Global Settings
 *
 * 全局配置：栏目顺序、新闻取舍规则、生成与发送参数。
 * 私密信息（SMTP 密码、收件人列表等）一律放在 .env，不要写进本文件。
 */

export const settings = {
  // 系统级元信息
  system: {
    brand: "AI早报",
    // 简报标题模板，{date} 会被替换为 YYYY-MM-DD
    titleTemplate: "每日科技资讯 · {date}",
    // 简报底部署名
    footer: "AI早报 · 自动生成",
    // 时区，用于显示本地日期/星期
    timezone: "Asia/Shanghai"
  },

  // 栏目渲染顺序（必须是 categories.js 中的 id）；未列出的栏目会被忽略
  categoryOrder: [
    "ai",
    "digital_products",
    "tech_companies",
    "china_tech",
    "open_source",
    "free_deals",
    "research",
    "space_robotics"
  ],

  // 新闻取舍与展示规则
  rules: {
    // 每条栏目最多展示的条目数（null = 不限）
    maxItemsPerCategory: null,
    // importance >= 此值的条目进入「重点新闻」区块
    highlightThreshold: 4,
    // 「重点新闻」最多展示条数
    maxHighlights: 6,
    // 未确认/爆料类条目标签（与 newsItem.type === 'rumor' 一致）
    rumorType: "rumor",
    // 在标题/卡片上展示「未证实」徽标
    showRumorBadge: true
  },

  // 生成参数
  generation: {
    // 默认输入文件（相对项目根目录）；generate.js 也可通过 --input 覆盖
    defaultInput: "data/input/news_{date}.json",
    // 处理后 JSON 输出目录
    processedDir: "data/processed",
    // 最终 HTML 输出目录
    htmlDir: "output/html",
    // 本地预览目录（用于生成可双击打开的网页版）
    previewDir: "output/preview"
  },

  // 发送参数
  email: {
    // 发件人显示名
    fromName: "AI早报",
    // 邮件主题模板，{date} 替换为日期，{count} 替换为当日条目总数
    subjectTemplate: "AI早报 · {date}（共 {count} 条）",
    // 收件人/抄送从 .env 读取（RECIPIENTS / CC），不在代码里硬编码
    // 发送开关：true 时 send.js 真的发信；false 时只做 dry-run 打印
    enabled: true
  },

  // 校验参数
  validation: {
    // 校验失败是否视为致命错误（validate.js 非零退出）
    failOnError: true
  }
};

export default settings;
