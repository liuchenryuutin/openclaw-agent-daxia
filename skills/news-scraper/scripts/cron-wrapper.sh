#!/bin/bash
# News Pipeline Cron Wrapper
# Runs daily at 8:00 AM via system crontab
# Scrapes all sites, generates LLM analysis, creates Feishu doc, pushes to user + 龙虾群

export PATH="/home/liuchen/.nvm/versions/node/v24.14.0/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin:$PATH"
export HOME="/home/liuchen"

SCRIPTS_DIR="/home/liuchen/.openclaw/workspace/skills/news-scraper/scripts"
LOG_DIR="$SCRIPTS_DIR/output/logs"
DATE=$(date +%Y-%m-%d)
LOG_FILE="$LOG_DIR/cron-$DATE.log"

mkdir -p "$LOG_DIR"

echo "========================================" >> "$LOG_FILE"
echo "News Pipeline Cron - $DATE $(date +%H:%M:%S)" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"

cd "$SCRIPTS_DIR" || exit 1

node orchestrator.js \
  --content \
  --chat-id oc_ca0d4c0c80e4c7ac9822b2a7fc8b9a1d \
  >> "$LOG_FILE" 2>&1

EXIT_CODE=$?

echo "" >> "$LOG_FILE"
echo "Exit code: $EXIT_CODE" >> "$LOG_FILE"
echo "Done at $(date +%H:%M:%S)" >> "$LOG_FILE"

# Keep only last 30 days of logs
find "$LOG_DIR" -name "cron-*.log" -mtime +30 -delete 2>/dev/null

exit $EXIT_CODE
