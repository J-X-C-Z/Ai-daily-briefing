/**
 * generate.js — 把校验过的 JSON 渲染成自包含 HTML 早报
 *
 * 用法：
 *   node scripts/generate.js --input data/input/news_2026-08-29.json
 *   node scripts/generate.js                       # 默认：今天日期的数据
 *
 * 产物：
 *   output/html/news_{date}.html          (邮件版，内联 CSS)
 *   output/preview/news_{date}.html        (网页版，可双击打开，含交互展开)
 *   data/processed/news_{date}.json        (程序处理后的 JSON，已排序/清洗)
 *   data/archive/news_{date}.json          (归档原始输入副本)
 */

import path from 'node:path';
import {
  resolvePath, readFile, readJSON, writeFileSafe, copyFileSafe,
  escapeHtml, formatDateLine, loadSettings, loadCategories
} from './lib.mjs';

const TYPE_LABELS = {
  news: '新闻',
  product: '新品',
  update: '更新',
  deal: '福利',
  rumor: '爆料',
  analysis: '分析'
};

function parseArgs(argv) {
  const out = { input: null, date: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input' || a === '-i') out.input = argv[++i];
    else if (a.startsWith('--input=')) out.input = a.slice('--input='.length);
    else if (a === '--date' || a === '-d') out.date = argv[++i];
    else if (a.startsWith('--date=')) out.date = a.slice('--date='.length);
  }
  return out;
}

const isHttp = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);

/** 对单个栏目内的条目排序：importance 降序，published_at 升序 */
function sortItems(items) {
  return [...(items || [])].sort((a, b) => {
    const imp = (b.importance || 0) - (a.importance || 0);
    if (imp !== 0) return imp;
    const ta = a.published_at || '';
    const tb = b.published_at || '';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
}

function keyPointsHtml(points) {
  if (!Array.isArray(points) || !points.length) return '';
  return points.map((p) => `              <li>${escapeHtml(p)}</li>`).join('\n');
}

function tagsHtml(tags) {
  if (!Array.isArray(tags) || !tags.length) return '';
  return tags.map((t) => `<span>${escapeHtml(t)}</span>`).join(' ');
}

function chipsHtml(item, rules) {
  const chips = [];
  const lbl = TYPE_LABELS[item.type] || item.type;
  chips.push(`<span class="chip chip-imp">${escapeHtml(lbl)}</span>`);
  chips.push(`<span class="chip chip-imp">★ ${item.importance ?? '?'}</span>`);
  if (rules.showRumorBadge && item.type === rules.rumorType) {
    chips.push(`<span class="chip chip-rumor">未证实</span>`);
  }
  return chips.join(' ');
}

function metaLineHtml(item, tz) {
  const src = item.source?.name ? escapeHtml(item.source.name) : '未知来源';
  const t = item.published_at ? formatDateTimeLocal(item.published_at, tz) : '';
  return `${src}${t ? ' · ' + t : ''}`;
}

function formatDateTimeLocal(iso, tz) {
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return String(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ` +
         `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function highlightCardHtml(item, rules, tz) {
  const img = (item.image && isHttp(item.image.url))
    ? `<img class="hl-image" src="${escapeHtml(item.image.url)}" alt="${escapeHtml(item.image.alt || '')}">`
    : '';
  const link = (item.source && isHttp(item.source.url))
    ? `<a class="hl-link" href="${escapeHtml(item.source.url)}" target="_blank" rel="noopener">阅读原文 →</a>`
    : '';
  return `
                <div class="hl-card">
${img ? '                    ' + img + '\n' : ''}                    <div class="hl-body">
                        <h3 class="hl-title">${escapeHtml(item.title)}</h3>
                        <div class="hl-meta">
                            ${chipsHtml(item, rules)}
                            <span>${metaLineHtml(item, tz)}</span>
                        </div>
                        <p class="hl-summary">${escapeHtml(item.summary)}</p>
                        <div class="hl-tags">${tagsHtml(item.tags)}</div>
                        ${link}
                    </div>
                </div>`;
}

function categoryItemHtml(item, rules, tz) {
  const link = (item.source && isHttp(item.source.url))
    ? `<a class="cat-item-link" href="${escapeHtml(item.source.url)}" target="_blank" rel="noopener">阅读原文 →</a>`
    : '';
  return `
                <div class="cat-item">
                    <h3 class="cat-item-title">${escapeHtml(item.title)}</h3>
                    <div class="cat-item-meta">
                        ${chipsHtml(item, rules)}
                        <span>${metaLineHtml(item, tz)}</span>
                    </div>
                    <p class="cat-item-summary">${escapeHtml(item.summary)}</p>
                    ${link}
                </div>`;
}

function categorySectionHtml(cat, items, rules, tz) {
  const body = items.map((it) => categoryItemHtml(it, rules, tz)).join('');
  return `
                <!-- ${escapeHtml(cat.name)} -->
                <tr>
                    <td class="category-section">
                        <div class="category-head">
                            <h2 class="category-name">${escapeHtml(cat.name)}</h2>
                            <p class="category-desc">${escapeHtml(cat.description || '')}</p>
                        </div>
${body}
                    </td>
                </tr>`;
}

function renderEmailHtml(tpl, data, settings, processed) {
  const meta = data.meta || {};
  const summary = data.summary || {};
  const rules = settings.rules || {};
  const tz = settings.system?.timezone || 'Asia/Shanghai';

  // 收集重点新闻
  const highlights = [];
  for (const cat of processed.categories) {
    for (const it of cat.items) {
      if ((it.importance || 0) >= (rules.highlightThreshold ?? 4)) {
        highlights.push(it);
      }
    }
  }
  highlights.sort((a, b) => (b.importance || 0) - (a.importance || 0));
  const maxHl = rules.maxHighlights ?? 6;
  const highlightsHtml = highlights.slice(0, maxHl).map((it) => highlightCardHtml(it, rules, tz)).join('');

  // 栏目区块（按 settings.categoryOrder 排序）
  const order = settings.categoryOrder || processed.categories.map((c) => c.id);
  const byId = new Map(processed.categories.map((c) => [c.id, c]));
  const categoriesHtml = order
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((cat) => {
      let items = sortItems(cat.items);
      const cap = rules.maxItemsPerCategory;
      if (cap && items.length > cap) items = items.slice(0, cap);
      return categorySectionHtml(cat, items, rules, tz);
    })
    .join('\n');

  const dateLine = meta.date ? formatDateLine(meta.date, tz) : '';
  const webLink = settings.web?.baseUrl
    ? `${settings.web.baseUrl.replace(/\/$/, '')}/output/preview/news_${meta.date}.html`
    : '#';

  const map = {
    '{{TITLE}}': escapeHtml(meta.title || settings.system?.brand || 'AI早报'),
    '{{BRAND}}': escapeHtml(settings.system?.brand || 'AI早报'),
    '{{DATE_LINE}}': escapeHtml(dateLine),
    '{{META_DESCRIPTION}}': escapeHtml(meta.description || ''),
    '{{SUMMARY_OVERVIEW}}': escapeHtml(summary.overview || ''),
    '{{KEY_POINTS_HTML}}': keyPointsHtml(summary.key_points),
    '{{HIGHLIGHTS_HTML}}': highlightsHtml,
    '{{CATEGORIES_HTML}}': categoriesHtml,
    '{{WEB_LINK}}': escapeHtml(webLink),
    '{{FOOTER}}': escapeHtml(settings.system?.footer || '')
  };

  let html = tpl;
  for (const [k, v] of Object.entries(map)) {
    html = html.split(k).join(v);
  }
  return html;
}

/* ============================================================
 * 网页版渲染（宽屏 + 右侧悬浮导航）—— 供 generate.js 使用
 * 与邮件版（table 结构、600px、邮件安全 CSS）分离，便于 GPT 优化 UI。
 * ============================================================ */

/** 网页版：单条新闻（div / article 结构） */
function webNewsItemHtml(item, rules, tz) {
  const link = (item.source && isHttp(item.source.url))
    ? `<a class="news-link" href="${escapeHtml(item.source.url)}" target="_blank" rel="noopener">阅读原文 →</a>`
    : '';
  return `
                <article class="news-item">
                    <h3 class="news-title">${escapeHtml(item.title)}</h3>
                    <div class="news-meta">
                        ${chipsHtml(item, rules)}
                        <span class="news-meta-line">${metaLineHtml(item, tz)}</span>
                    </div>
                    <p class="news-summary">${escapeHtml(item.summary)}</p>
                    <div class="news-tags">${tagsHtml(item.tags)}</div>
                    ${link}
                </article>`;
}

/** 网页版：单个栏目区块（带锚点 id，供右侧导航跳转） */
function webCategorySectionHtml(cat, items, rules, tz) {
  const body = items.map((it) => webNewsItemHtml(it, rules, tz)).join('');
  return `
                <section class="category" id="cat-${escapeHtml(cat.id)}" data-cat="${escapeHtml(cat.id)}">
                    <div class="category-head">
                        <h2 class="category-name">${escapeHtml(cat.name)}</h2>
                        <p class="category-desc">${escapeHtml(cat.description || '')}</p>
                    </div>
${body}
                </section>`;
}

/** 网页版：右侧悬浮导航项（锚点链接） */
function navHtml(highlightsCount, orderCategories, catById) {
  const items = [];
  if (highlightsCount > 0) {
    items.push(`<a class="nav-item nav-item-top" href="#cat-highlights" data-target="#cat-highlights">⭐ 重点新闻</a>`);
  }
  for (const cat of orderCategories) {
    items.push(`<a class="nav-item" href="#cat-${escapeHtml(cat.id)}" data-target="#cat-${escapeHtml(cat.id)}">${escapeHtml(cat.name)}</a>`);
  }
  return items.join('');
}

/** 网页版：重点新闻区（带锚点 id） */
function webHighlightsSectionHtml(highlights, rules, tz) {
  if (!highlights.length) return '';
  const cards = highlights.map((it) => highlightCardHtml(it, rules, tz)).join('');
  return `
                <section class="highlights" id="cat-highlights">
                    <div class="category-head">
                        <h2 class="category-name">⭐ 重点新闻</h2>
                        <p class="category-desc">今日最重要的进展</p>
                    </div>
${cards}
                </section>`;
}

/** 网页版主渲染函数 */
function renderWebHtml(tpl, data, settings, processed) {
  const meta = data.meta || {};
  const summary = data.summary || {};
  const rules = settings.rules || {};
  const tz = settings.system?.timezone || 'Asia/Shanghai';

  // 收集重点新闻
  let highlights = [];
  for (const cat of processed.categories) {
    for (const it of cat.items) {
      if ((it.importance || 0) >= (rules.highlightThreshold ?? 4)) {
        highlights.push(it);
      }
    }
  }
  highlights.sort((a, b) => (b.importance || 0) - (a.importance || 0));
  const maxHl = rules.maxHighlights ?? 6;
  highlights = highlights.slice(0, maxHl);

  // 栏目（按 settings.categoryOrder 排序）
  const order = settings.categoryOrder || processed.categories.map((c) => c.id);
  const byId = new Map(processed.categories.map((c) => [c.id, c]));
  const orderCategories = order.map((id) => byId.get(id)).filter(Boolean);
  const categoriesHtml = orderCategories
    .map((cat) => {
      let items = sortItems(cat.items);
      const cap = rules.maxItemsPerCategory;
      if (cap && items.length > cap) items = items.slice(0, cap);
      return webCategorySectionHtml(cat, items, rules, tz);
    })
    .join('\n');

  const highlightsHtml = webHighlightsSectionHtml(highlights, rules, tz);
  const nav = navHtml(highlights.length, orderCategories, byId);
  const dateLine = meta.date ? formatDateLine(meta.date, tz) : '';

  const map = {
    '{{TITLE}}': escapeHtml(meta.title || settings.system?.brand || 'AI早报'),
    '{{DATE_LINE}}': escapeHtml(dateLine),
    '{{META_DESCRIPTION}}': escapeHtml(meta.description || ''),
    '{{SUMMARY_OVERVIEW}}': escapeHtml(summary.overview || ''),
    '{{KEY_POINTS_HTML}}': keyPointsHtml(summary.key_points),
    '{{HIGHLIGHTS_HTML}}': highlightsHtml,
    '{{CATEGORIES_HTML}}': categoriesHtml,
    '{{NAV_HTML}}': nav,
    '{{FOOTER}}': escapeHtml(settings.system?.footer || '')
  };

  let html = tpl;
  for (const [k, v] of Object.entries(map)) {
    html = html.split(k).join(v);
  }
  return html;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const settings = await loadSettings();
  const categoriesDef = await loadCategories();

  let inputRel = args.input;
  if (!inputRel) {
    const today = args.date || new Date().toISOString().slice(0, 10);
    let tpl = settings.generation?.defaultInput || 'data/input/news_{date}.json';
    inputRel = tpl.replace('{date}', today);
  }

  let data;
  try {
    data = JSON.parse(readFile(inputRel));
  } catch (e) {
    console.error(`[generate] 无法读取输入 JSON：${resolvePath(inputRel)}\n${e.message}`);
    process.exit(1);
  }

  const meta = data.meta || {};
  const date = meta.date || args.date || new Date().toISOString().slice(0, 10);

  // 程序处理：排序 + 按栏目定义补齐名称（若 JSON 缺 name/description）
  const nameById = new Map(categoriesDef.map((c) => [c.id, c]));
  const processed = {
    meta,
    summary: data.summary || {},
    categories: (data.categories || []).map((cat) => {
      const def = nameById.get(cat.id) || {};
      return {
        id: cat.id,
        name: cat.name || def.name || cat.id,
        description: cat.description || def.description || '',
        items: sortItems(cat.items)
      };
    })
  };

  // 写处理后 JSON
  writeFileSafe(`data/processed/news_${date}.json`, JSON.stringify(processed, null, 2));
  // 归档原始输入
  copyFileSafe(inputRel, `data/archive/news_${date}.json`);

  // 渲染邮件版 HTML（600px，邮件安全 CSS，无 JS）
  const emailTpl = readFile('templates/email.html');
  const html = renderEmailHtml(emailTpl, data, settings, processed);
  writeFileSafe(`output/html/news_${date}.html`, html);

  // 渲染网页版（宽屏 + 右侧悬浮导航，供浏览器/预览）
  const webTpl = readFile('templates/web.html');
  const webHtml = renderWebHtml(webTpl, data, settings, processed);
  writeFileSafe(`output/preview/news_${date}.html`, webHtml);

  console.log('──────────────────────────────────────────');
  console.log(` 输入     : ${resolvePath(inputRel)}`);
  console.log(` 期号     : ${date}`);
  console.log(` 邮件版   : output/html/news_${date}.html`);
  console.log(` 网页版   : output/preview/news_${date}.html`);
  console.log(` 处理后   : data/processed/news_${date}.json`);
  console.log(` 归档     : data/archive/news_${date}.json`);
  console.log('──────────────────────────────────────────');
  console.log('✓ 生成完成。可运行 `node scripts/send.js` 发送邮件。');
}

main().catch((e) => { console.error(e); process.exit(1); });
