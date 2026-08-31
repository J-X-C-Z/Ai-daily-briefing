/**
 * merge.js — 合并 dedupe 产出 + reviewer 审核结果 → 正式输入 news_{date}.json
 *
 * 用法：
 *   node scripts/merge.js --date 2026-08-30
 *
 * 读取：
 *   data/processed/merged_{date}.json           dedupe 合并去重后的候选
 *   data/processed/meta_summary_{date}.json     reviewer 补全的 meta/summary（必需）
 *   data/processed/reviewer_fixes_{date}.json   reviewer 的调整指令（可选，无则跳过）
 *
 * 产出：
 *   data/input/news_{date}.json                 正式输入（供 validate.js / generate.js）
 *
 * reviewer_fixes 结构化格式（reviewer Bot 必须按此输出）：
 *   {
 *     "delete":  ["rs-001", "ai-003"],            // 要删除的条目 id（merged 中的 id）
 *     "move":    { "cn-005": "tech_companies" },  // 栏目移动：{条目id: 目标栏目id}
 *     "restore": [                                 // 从分片恢复的完整条目（含 target_category）
 *       { "...完整 newsItem 字段...", "target_category": "tech_companies" }
 *     ],
 *     "note": "说明文字（可选）"
 *   }
 *
 * 合并后统一：按 importance 降序重排、id 重排为 {prefix}-{序号}、补齐 image:null。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ID_PREFIX = {
  ai: 'ai',
  digital_products: 'dp',
  tech_companies: 'tc',
  china_tech: 'cn',
  open_source: 'os',
  free_deals: 'fd',
  research: 'rs',
  space_robotics: 'sr'
};

function parseArgs(argv) {
  const out = { date: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--date' || a === '-d') out.date = argv[++i];
    else if (a.startsWith('--date=')) out.date = a.slice('--date='.length);
  }
  return out;
}

function readJSON(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date || new Date().toISOString().slice(0, 10);

  const merged = readJSON(`data/processed/merged_${date}.json`);
  const metaSummary = readJSON(`data/processed/meta_summary_${date}.json`);
  if (!merged) {
    console.error(`[merge] 缺少 data/processed/merged_${date}.json，请先运行 dedupe.js。`);
    process.exit(1);
  }
  if (!metaSummary) {
    console.error(`[merge] 缺少 data/processed/meta_summary_${date}.json，请先让 reviewer 补全。`);
    process.exit(1);
  }
  const fixes = readJSON(`data/processed/reviewer_fixes_${date}.json`);
  const catById = new Map(merged.categories.map((c) => [c.id, c]));

  // ---- 1. delete ----
  if (fixes?.delete) {
    for (const cid of merged.categories) {
      cid.items = cid.items.filter((it) => !fixes.delete.includes(it.id));
    }
    console.log(`[merge] delete: ${fixes.delete.length} 条`);
  }

  // ---- 2. move ----
  if (fixes?.move) {
    for (const [itemId, targetCat] of Object.entries(fixes.move)) {
      let moved = null;
      for (const cid of merged.categories) {
        const idx = cid.items.findIndex((it) => it.id === itemId);
        if (idx >= 0) {
          moved = cid.items.splice(idx, 1)[0];
          break;
        }
      }
      if (moved) {
        const target = catById.get(targetCat);
        if (target) {
          target.items.push(moved);
          console.log(`[merge] move: ${itemId} → ${targetCat}`);
        } else {
          console.warn(`[merge] 未知目标栏目 ${targetCat}，${itemId} 未移动`);
        }
      } else {
        console.warn(`[merge] 未找到条目 ${itemId}，跳过移动`);
      }
    }
  }

  // ---- 3. restore ----
  if (fixes?.restore) {
    for (const item of fixes.restore) {
      const target = item.target_category || 'tech_companies';
      const cat = catById.get(target);
      if (!cat) {
        console.warn(`[merge] 未知目标栏目 ${target}，条目 ${item.id} 未恢复`);
        continue;
      }
      const { target_category, ...clean } = item;
      cat.items.push(clean);
      console.log(`[merge] restore: ${clean.id} → ${target}`);
    }
  }

  // ---- 4. 重排 + 补齐 ----
  for (const cat of merged.categories) {
    cat.items.sort((a, b) => {
      const imp = (b.importance || 0) - (a.importance || 0);
      if (imp !== 0) return imp;
      const ta = a.published_at || '';
      const tb = b.published_at || '';
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });
    const prefix = ID_PREFIX[cat.id] || cat.id;
    cat.items.forEach((it, i) => {
      it.id = `${prefix}-${String(i + 1).padStart(3, '0')}`;
      if (it.image === undefined) it.image = null;
      if (it.image !== null && (typeof it.image !== 'object' || it.image === null)) it.image = null;
    });
  }

  // ---- 5. meta/summary ----
  merged.meta = metaSummary.meta;
  merged.summary = metaSummary.summary;

  const outRel = `data/input/news_${date}.json`;
  fs.writeFileSync(path.join(ROOT, outRel), JSON.stringify(merged, null, 2), 'utf8');

  const total = merged.categories.reduce((n, c) => n + c.items.length, 0);
  console.log('──────────────────────────────────────────');
  console.log(` 合并输出 : ${outRel}`);
  console.log(` 栏目数   : ${merged.categories.length}`);
  console.log(` 条目总数 : ${total}`);
  console.log('──────────────────────────────────────────');
  console.log('下一步：node scripts/validate.js --input ' + outRel);
}

main();
