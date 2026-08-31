#!/usr/bin/env bash
# =============================================================================
# run_pipeline.sh — 一键跑通「每日科技资讯」多 Bot 流水线（3 采集 Bot 版）
#
#   一句话启动全部 Bot：collector1/collector2/collector3 并行采集
#                       → dedupe → reviewer 审核 → merge → validate → publisher 渲染分发
#
# 用法：
#   bash scripts/run_pipeline.sh                          # 今天+昨天
#   DATE=2026-08-31 bash scripts/run_pipeline.sh         # 指定结束日期
#
# 模型分配：
#   collector1 → mimo-v2.5（Xiaomi 官方 API）
#   collector2 → mimo-v2.5-pro（Xiaomi 官方 API）
#   collector3 → nemotron-3-ultra-free（opencode-free 免费层）
#   reviewer   → deepseek-v4-flash（稳定审核）
#   publisher  → mimo-v2.5（渲染分发）
#
# 注意：真实发送需 .env 配置 SMTP 且 settings.email.enabled=true，否则只 dry-run。
# =============================================================================
set -u

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR" || exit 1

END_DATE="${DATE:-$(date +%F)}"
# 计算昨天的日期（覆盖两天）
START_DATE=$(date -d "$END_DATE - 1 day" +%F 2>/dev/null || date -v-1d +%F 2>/dev/null || echo "$END_DATE")
DATE_RANGE="${START_DATE} 至 ${END_DATE}"
PARTIALS_DIR="data/input/partials"
PROMPTS_DIR="C:/Users/Jxcz2/Agent/ai-daily-briefing/prompts"
POLL_TIMEOUT_SECONDS=1800
POLL_INTERVAL=15

echo "══════════════════════════════════════════════════════"
echo "  每日科技资讯流水线 · ${DATE_RANGE}"
echo "  项目目录: ${PROJECT_DIR}"
echo "  采集: mimo-v2.5 + mimo-v2.5-pro + nemotron-3-ultra-free"
echo "  审核: deepseek-v4-flash | 分发: mimo-v2.5"
echo "══════════════════════════════════════════════════════"

# ---------- 0. 清理当天旧分片 ----------
echo ""
echo "[0/7] 清理旧分片..."
rm -f "${PARTIALS_DIR}"/*_*.json
echo "      ✓ 已清理所有旧分片"

# ---------- 1. 并行启动 3 个采集 Bot ----------
echo ""
echo "[1/7] 启动 3 个采集 Bot..."

BATCH_NOTE="注意：必须分批写文件，每批 2-3 个栏目写一个 part 文件（partials/{bot}_${END_DATE}_p1.json、_p2.json、_p3.json、_p4.json），每批控制在 60 行内。"
DATE_NOTE="日期范围：${START_DATE} 至 ${END_DATE}（两天）。每个栏目至少采集 3 条新闻。"
PROMPT_EXTRA="严格按你的 SOUL.md 和提示词文件 ${PROMPTS_DIR}/collector.md 的规范，独立采集全部栏目。${DATE_NOTE}${BATCH_NOTE}完成后只回复：COLLECTOR{N}_DONE"

# collector1 — mimo-v2.5
hermes -p collector1 chat -q "执行今天的采集任务。${PROMPT_EXTRA//\{N\}/1}" >/tmp/collector1.log 2>&1 &
P1=$!
echo "      collector1 (mimo-v2.5, pid $P1) 已启动"

# 错峰 30 秒启动 collector2
sleep 30
hermes -p collector2 chat -q "执行今天的采集任务。${PROMPT_EXTRA//\{N\}/2}" >/tmp/collector2.log 2>&1 &
P2=$!
echo "      collector2 (mimo-v2.5-pro, pid $P2) 已启动"

# 错峰 30 秒启动 collector3
sleep 30
hermes -p collector3 chat -q "执行今天的采集任务。${PROMPT_EXTRA//\{N\}/3}" >/tmp/collector3.log 2>&1 &
P3=$!
echo "      collector3 (nemotron-3-ultra-free, pid $P3) 已启动"

# ---------- 2. 轮询等待分片 + 跑 dedupe ----------
echo ""
echo "[2/7] 等待采集完成（最多 $((POLL_TIMEOUT_SECONDS / 60)) 分钟）..."
SECONDS=0
while [ $SECONDS -lt "$POLL_TIMEOUT_SECONDS" ]; do
  C1="no"; C2="no"; C3="no"
  [ -n "$(ls ${PARTIALS_DIR}/collector1_${END_DATE}_p*.json 2>/dev/null)" ] && C1="yes"
  [ -n "$(ls ${PARTIALS_DIR}/collector2_${END_DATE}_p*.json 2>/dev/null)" ] && C2="yes"
  [ -n "$(ls ${PARTIALS_DIR}/collector3_${END_DATE}_p*.json 2>/dev/null)" ] && C3="yes"
  echo "      [${SECONDS}s] collector1=${C1} collector2=${C2} collector3=${C3}"
  [ "$C1" = "yes" ] && [ "$C2" = "yes" ] && [ "$C3" = "yes" ] && break
  sleep "$POLL_INTERVAL"
done

# 检查是否有至少 2 个 collector 完成（容忍 1 个失败）
DONE_COUNT=0
[ "$C1" = "yes" ] && DONE_COUNT=$((DONE_COUNT + 1))
[ "$C2" = "yes" ] && DONE_COUNT=$((DONE_COUNT + 1))
[ "$C3" = "yes" ] && DONE_COUNT=$((DONE_COUNT + 1))
echo ""
echo "      采集完成: ${DONE_COUNT}/3 个 Bot 已产出分片"
if [ "$DONE_COUNT" -lt 2 ]; then
  echo "✗ 只有 ${DONE_COUNT} 个 Bot 完成，不足 2 个，中止。"
  exit 1
fi

echo ""
echo "[3/7] 运行 dedupe.js（确定性查重合并）..."
node scripts/dedupe.js --date "$END_DATE"
if [ $? -ne 0 ]; then echo "✗ dedupe 失败，中止。"; exit 1; fi

# ---------- 3. reviewer 审核（写小文件） ----------
echo ""
echo "[4/7] 触发 reviewer（deepseek-v4-flash）审核..."
hermes -p reviewer chat -q "执行今天的审核任务。日期范围：${DATE_RANGE}（结束日期 ${END_DATE}）。工作目录 ${PROJECT_DIR}。按你的 SOUL.md 和提示词文件 ${PROMPTS_DIR}/reviewer.md 执行，注意分工：1) dedupe 已运行完成，阅读 data/processed/dedupe_report_${END_DATE}.json 和 data/processed/merged_${END_DATE}.json；2) 语义复核后把调整写为结构化 reviewer_fixes_${END_DATE}.json（delete/move/restore，见提示词 4.2 节）；3) 补全 meta/summary 写入 meta_summary_${END_DATE}.json；4) 不要写 data/input/news_${END_DATE}.json（merge.js 会合并）。完成后只回复：REVIEWER_DONE" 2>&1 | tail -2
if [ ! -f "data/processed/meta_summary_${END_DATE}.json" ]; then
  echo "✗ reviewer 未产出 meta_summary_${END_DATE}.json，中止。"
  exit 1
fi

# ---------- 4. merge 合并 ----------
echo ""
echo "[5/7] 运行 merge.js 合并..."
node scripts/merge.js --date "$END_DATE"
if [ ! -f "data/input/news_${END_DATE}.json" ]; then echo "✗ merge 失败，中止。"; exit 1; fi

# ---------- 5. validate ----------
echo ""
echo "[6/7] 校验正式输入..."
node scripts/validate.js --input "data/input/news_${END_DATE}.json"
if [ $? -ne 0 ]; then echo "✗ 校验未通过，中止。"; exit 1; fi

# ---------- 6. publisher 渲染 + 分发 ----------
echo ""
echo "[7/7] 触发 publisher（mimo-v2.5）渲染并分发..."
hermes -p publisher chat -q "执行今天的分发任务。日期：${END_DATE}。工作目录 ${PROJECT_DIR}。按你的 SOUL.md 和提示词文件 ${PROMPTS_DIR}/publisher.md 执行：data/input/news_${END_DATE}.json 已通过校验 → 运行 node scripts/generate.js --input data/input/news_${END_DATE}.json → 检查产物 → 运行 node scripts/send.js --date ${END_DATE} --dry-run 预览。若 settings.email.enabled 已开启则真实发送。完成后只回复：PUBLISHER_DONE" 2>&1 | tail -3

echo ""
echo "══════════════════════════════════════════════════════"
echo "  流水线结束。产物："
echo "    邮件版   : output/html/news_${END_DATE}.html"
echo "    网页版   : output/preview/news_${END_DATE}.html"
echo "    正式JSON : data/input/news_${END_DATE}.json"
echo "    采集日志 : /tmp/collector{1,2,3}.log"
echo "══════════════════════════════════════════════════════"
