/**
 * validate.js — 用 config/schema.json 校验 Agent 产出的 JSON
 *
 * 用法：
 *   node scripts/validate.js --input data/input/news_2026-08-29.json
 *   node scripts/validate.js                       # 用默认路径（今天日期）
 *
 * 退出码：校验通过 0；有错误且 failOnError 为 true 时 1。
 */

import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  resolvePath, readFile, readJSON, loadSettings, loadCategories, formatDateLine
} from './lib.mjs';

function parseArgs(argv) {
  const out = { input: null, schema: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input' || a === '-i') out.input = argv[++i];
    else if (a.startsWith('--input=')) out.input = a.slice('--input='.length);
    else if (a === '--schema' || a === '-s') out.schema = argv[++i];
    else if (a.startsWith('--schema=')) out.schema = a.slice('--schema='.length);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const settings = await loadSettings();
  const categoriesDef = await loadCategories();

  // 默认输入路径：data/input/news_{今天}.json 或 settings 模板
  let inputRel = args.input;
  if (!inputRel) {
    const today = new Date().toISOString().slice(0, 10);
    let tpl = settings.generation?.defaultInput || 'data/input/news_{date}.json';
    inputRel = tpl.replace('{date}', today);
  }
  const schemaRel = args.schema || 'config/schema.json';

  let raw;
  try {
    raw = readFile(inputRel);
  } catch (e) {
    console.error(`[validate] 找不到输入文件：${resolvePath(inputRel)}`);
    console.error(`           请先由 collector Agent 生成 JSON，或显式传入 --input。`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error(`[validate] JSON 语法错误：${e.message}`);
    process.exit(1);
  }

  const schema = readJSON(schemaRel);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const ok = validate(data);

  const errors = [];
  if (!ok && validate.errors) {
    for (const err of validate.errors) {
      errors.push(`${err.instancePath || '/'} ${err.message}` +
        (err.params && err.params.allowedValues ? ` (允许: ${err.params.allowedValues.join(', ')})` : ''));
    }
  }

  // ---- 语义层校验（schema 管不到的部分） ----
  const semErrors = [];
  const idSet = new Set();
  const categories = Array.isArray(data.categories) ? data.categories : [];
  let totalItems = 0;
  const validCategoryIds = new Set(categoriesDef.map((c) => c.id));

  for (const cat of categories) {
    if (cat && cat.id && !validCategoryIds.has(cat.id)) {
      semErrors.push(`未知栏目 id：${cat.id}（不在 config/categories.js 中）`);
    }
    const items = Array.isArray(cat.items) ? cat.items : [];
    totalItems += items.length;
    for (const it of items) {
      if (!it || !it.id) { semErrors.push(`某条目缺少 id`); continue; }
      if (idSet.has(it.id)) semErrors.push(`id 重复：${it.id}`);
      idSet.add(it.id);

      if (it.source && it.source.url && !/^https?:\/\//i.test(it.source.url)) {
        semErrors.push(`[${it.id}] source.url 非法：${it.source.url}`);
      }
      if (it.image && it.image.url && !/^https?:\/\//i.test(it.image.url)) {
        semErrors.push(`[${it.id}] image.url 非法：${it.image.url}`);
      }
      for (const r of (it.related || [])) {
        if (r && r.url && !/^https?:\/\//i.test(r.url)) {
          semErrors.push(`[${it.id}] related.url 非法：${r.url}`);
        }
      }
      if (it.importance != null && (it.importance < 1 || it.importance > 5)) {
        semErrors.push(`[${it.id}] importance 超出 1-5：${it.importance}`);
      }
    }
  }

  const allErrors = [...errors, ...semErrors];
  const hasError = allErrors.length > 0;

  // ---- 输出报告 ----
  const meta = data.meta || {};
  const dateLine = meta.date ? formatDateLine(meta.date) : '(未知日期)';
  console.log('──────────────────────────────────────────');
  console.log(` 校验对象 : ${resolvePath(inputRel)}`);
  console.log(` 期号     : ${meta.date || '?'}  ${dateLine}`);
  console.log(` 栏目数   : ${categories.length}`);
  console.log(` 条目总数 : ${totalItems}`);
  console.log(` Schema   : ${errors.length} 个结构错误`);
  console.log(` 语义     : ${semErrors.length} 个语义错误`);
  console.log('──────────────────────────────────────────');

  if (hasError) {
    console.error('\n发现以下问题：');
    for (const e of allErrors) console.error('  ✗ ' + e);
    if (settings.validation?.failOnError) process.exit(1);
    console.error('\n（failOnError=false，已忽略错误继续。）');
  } else {
    console.log('\n✓ 校验通过，数据可进入 generate.js 渲染。');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
