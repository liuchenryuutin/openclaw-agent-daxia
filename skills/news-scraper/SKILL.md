---
name: news-scraper
description: |
  Crawl Chinese news websites, extract headlines with links by section, create a Feishu cloud document, and push to user. Two modes: (1) Pipeline mode via orchestrator.js — parallel scraping with child processes, consolidate results, create Feishu doc, send via Feishu IM; (2) Single-site mode via scraper.js — output to stdout or file. Uses Playwright for JS-rendered sites and HTTP fallback for static sites. Supports adding new sites via sites.json config. Triggers on phrases like "爬新闻", "抓取新闻", "新闻爬虫", "scrape news", "新闻汇总", "新闻推送".
---

# News Scraper

Playwright-based Chinese news scraper with extensible site configuration.

## Quick Start

### Pipeline Mode（推荐）

一条命令完成：爬取 → 飞书文档 → 推送消息

```bash
cd scripts
node orchestrator.js
```

### Single-site Mode

爬取单个站点，输出到终端或文件：

```bash
node scraper.js                  # 所有站点，文本输出
node scraper.js --site sina      # 只爬新浪
node scraper.js --output json    # JSON 格式
node scraper.js --list           # 列出所有站点
```

## Two Modes

| Mode | Trigger | Supports | Install |
|------|---------|----------|---------|
| **Playwright** | Auto (default) | Static + Dynamic sites | `sudo npx playwright install-deps chromium` |
| **HTTP fallback** | Auto fallback / `--force-http` | Static sites only | Nothing extra needed |

The scraper auto-detects if Playwright browser can launch. If system deps are missing (common in WSL/containers), it falls back to HTTP mode automatically. Dynamic sites (腾讯、网易、凤凰等) are skipped in HTTP mode.

### Install Playwright System Deps

```bash
# Option 1: Playwright's built-in installer
sudo npx playwright install-deps chromium

# Option 2: Manual install (Debian/Ubuntu)
sudo apt install libnspr4 libnss3 libasound2 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libatspi2.0-0 libxshmfence1
```

## Architecture

```
scripts/
├── orchestrator.js  # 🦐 Main pipeline coordinator
├── scraper.js       # Single-site scraper (Playwright / HTTP)
├── sites.json       # Site configurations (edit to add sites)
├── temp/            # Per-site temp JSON (auto-cleaned)
└── output/          # Consolidated JSON results
```

## Pipeline Mode (推荐)

`orchestrator.js` 是主控脚本，实现完整的 **并行爬取 → 正文提取 → 栏目分析 → 飞书文档 → 推送** 流水线。

### 流程详解

```
┌──────────────────────────────────────────────────────────────┐
│  🦐 orchestrator.js - 新闻爬取流水线                           │
│                                                               │
│  Phase 1: 并行爬取 (child_process.spawn)                      │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  Batch 1 (parallel=4):                               │     │
│  │  ├─ spawn node scraper.js --site sina    → temp/sina.json    │
│  │  ├─ spawn node scraper.js --site guancha → temp/guancha.json │
│  │  ├─ spawn node scraper.js --site tmtpost → temp/tmtpost.json│
│  │  └─ spawn node scraper.js --site qq      → temp/qq.json     │
│  │                                                       │     │
│  │  Batch 2:                                             │     │
│  │  ├─ spawn ... --site 163     → temp/163.json          │     │
│  │  ├─ spawn ... --site ifeng   → temp/ifeng.json        │     │
│  │  ├─ spawn ... --site thepaper→ temp/thepaper.json     │     │
│  │  └─ spawn ... --site huxiu   → temp/huxiu.json        │     │
│  └─────────────────────────────────────────────────────┘     │
│       每个子进程独立运行 scraper.js，结果写入 temp/*.json          │
│       子进程使用 --force-http 模式（无需 Playwright 浏览器）       │
│       每个子进程超时 120 秒                                     │
│                                                               │
│  Phase 2: 汇总数据                                            │
│  ├─ 读取 temp/ 目录下所有 JSON 文件                              │
│  ├─ 合并所有站点的栏目和新闻条目                                   │
│  ├─ 统计成功/失败数和总条目数                                     │
│  └─ 输出合并结果到 output/pipeline-YYYY-MM-DD.json             │
│                                                               │
│  Phase 3: 创建飞书文档 (Feishu Open API)                       │
│  ├─ 获取 tenant_access_token                                  │
│  ├─ 创建文档 (POST /docx/v1/documents)                         │
│  ├─ 授予权限 (POST /drive/v1/permissions/{id}/members)         │
│  │   └─ 尝试 full_access，失败则降级到 manage_collaborator       │
│  └─ 写入内容 (POST /docx/v1/documents/{id}/blocks/{id}/children)│
│      ├─ H1: 📰 国内新闻爬取汇总 - YYYY-MM-DD                   │
│      ├─ Text: 爬取时间 / 来源数 / 总条目                         │
│      ├─ Divider                                              │
│      ├─ H1: 站点名称 (新浪新闻)                                 │
│      │  ├─ H2: 【栏目名】(N条)                                 │
│      │  │  ├─ Bullet: 标题 + 链接 + 来源                       │
│      │  │  └─ ...                                            │
│      │  └─ ...                                                │
│      ├─ Divider                                              │
│      └─ ... (每个站点重复)                                      │
│                                                               │
│  Phase 4: 推送消息 (Feishu IM API)                             │
│  └─ POST /im/v1/messages → 发送文档链接给用户                    │
│      消息内容: 站点数 + 新闻条数 + 用时 + 文档链接                 │
└──────────────────────────────────────────────────────────────┘
```

### 使用方法

```bash
# 完整流水线（爬取 → 飞书文档 → 推送消息）
node orchestrator.js

# 限制每栏目条目数
node orchestrator.js --limit 20

# 只爬一个站点
node orchestrator.js --site sina

# 测试模式（跳过飞书，只验证爬取+汇总）
node orchestrator.js --skip-feishu

# 带正文提取和栏目分析的完整流水线
node orchestrator.js --content

# 正文提取 + 只爬新浪
node orchestrator.js --content --site sina

# 控制并行数
node orchestrator.js --parallel 3
```

### Pipeline Parameters

| Param | Default | Description |
|-------|---------|-------------|
| `--site` | all | 指定站点 nameEn |
| `--limit` | 20 | 每栏目最多条目数 |
| `--parallel` | 4 | 并行子进程数（分批执行） |
| `--skip-feishu` | false | 跳过飞书文档创建和消息推送 |
| `--content` | false | 同时抓取文章正文，并生成栏目分析（关键词/重要新闻/内容分布） |

### Content Extraction & Analysis（--content 模式）

启用 `--content` 标志后，Pipeline 会额外执行以下步骤：

**Phase 1 增强：正文提取**
- 子进程在抓取标题链接后，对每条新闻（最多 20 篇）发送 HTTP 请求抓取文章页
- 使用正则提取 `<article>` 标签、meta description 和段落 `<p>` 内容
- 每条新闻新增 `content` 字段（最多 2000 字）
- 子进程超时从 120 秒增加到 600 秒

**Phase 3：栏目分析**
- 读取合并后的 JSON 数据（含正文）
- 对每个栏目生成分析：
  - 🔑 **关键词提取**：停用词过滤 + 词频统计，Top 8 关键词
  - ⭐ **重要新闻识别**：按正文长度排序，取 Top 3
  - 📂 **内容类型检测**：财经/科技/政治/国际/社会/体育/汽车/娱乐分类
  - 📈 **数据统计**：有正文篇数、平均字数
  - 📝 **整体摘要**：所有站点的关键词、领域覆盖汇总

**飞书文档增强**
- 文档顶部增加「📊 本次爬取分析」摘要
- 每个栏目标题下增加：关键词、重要新闻摘要、内容分布、数据统计

**用法示例**：
```bash
# 完整流水线（爬取 + 正文 + 分析 + 飞书文档 + 推送）
node orchestrator.js --content

# 带正文但限制条目数
node orchestrator.js --content --limit 10
```

### 子进程机制


每个站点通过 `child_process.spawn` 启动独立的 Node.js 进程：

```javascript
// orchestrator.js 内部实际调用
spawn('node', [
  'scraper.js',
  '--site', 'sina',           // 站点标识
  '--output', 'json',          // JSON 格式输出
  '--output-file', 'temp/sina.json',  // 输出到临时文件
  '--limit', '20',             // 条目限制
  '--force-http',              // 强制 HTTP 模式（子进程不用浏览器）
]);
```

关键设计：
- **`--force-http`**：子进程始终使用 HTTP 模式（不用 Playwright），避免多进程争抢浏览器实例
- **120 秒超时**：单个子进程超过 120 秒会被 SIGTERM 终止
- **分批并行**：`--parallel 4` 表示每批同时跑 4 个站点，下一批等上一批全部完成
- **临时文件**：每个子进程写 `temp/<nameEn>.json`，汇总后自动清理

### 飞书集成

飞书凭证在 `orchestrator.js` 顶部配置：

```javascript
const FEISHU_CONFIG = {
  appId: 'cli_a93fda4918f89bdf',      // 飞书应用 ID
  appSecret: 'kIlF3hAcZkqWsQkGMcj...', // 飞书应用密钥
  userId: 'ou_8462b401def44e3db8a...',  // 接收消息的用户 open_id
};
```

修改这些值可以指向不同的飞书应用和接收人。

## Single-site Mode

`scraper.js` 爬取单个或所有站点，输出到 stdout 或文件：

```bash
# Scrape all sites (text output)
node scraper.js

# Scrape specific site
node scraper.js --site sina

# JSON output to file
node scraper.js --output json --output-file /path/to/output.json

# List configured sites
node scraper.js --list
```

### Scraper Modes

| Mode | Used For | Mechanism |
|------|----------|-----------|
| `static` | SSR sites (新浪、观察者网、钛媒体) | Playwright loads DOM, no JS wait |
| `dynamic` | SPA/JS sites (腾讯、网易、凤凰、澎湃、虎嗅) | Playwright waits for `networkidle` + configurable delay |

### sites.json Format

Each site has this structure:

```json
{
  "name": "显示名称",
  "nameEn": "short-id",
  "enabled": true,
  "type": "static | dynamic",
  "waitMs": 3000,
  "sections": [
    {
      "name": "栏目名称",
      "url": "https://target-url.com",
      "selectors": {
        "container": "body",
        "link": "a[href*='/pattern/']",
        "title": null
      },
      "extract": {
        "title": "text",
        "url": "href",
        "baseUrl": "https://optional-base-url.com"
      },
      "filter": {
        "urlContains": "doc-",
        "minTitleLength": 6,
        "urlExclude": "video"
      }
    }
  ]
}
```

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Display name (e.g., "新浪新闻") |
| `nameEn` | ✅ | Short ID for `--site` filter (e.g., "sina") |
| `enabled` | ✅ | `true` to include in default run |
| `type` | ✅ | `static` (fast) or `dynamic` (JS rendering) |
| `waitMs` | ❌ | Extra wait for dynamic sites (default: 2000) |
| `sections[].name` | ✅ | Section/category name |
| `sections[].url` | ✅ | Target page URL |
| `selectors.link` | ✅ | CSS selector for news links |
| `selectors.title` | ❌ | Sub-selector for title (null = link text) |
| `extract.title` | ✅ | `"text"` to use textContent |
| `extract.url` | ✅ | `"href"` to use link.href |
| `extract.baseUrl` | ❌ | Resolve relative URLs |
| `filter.urlContains` | ❌ | Only keep items with URL containing this |
| `filter.urlExclude` | ❌ | Exclude items with URL containing this |
| `filter.minTitleLength` | ❌ | Minimum title length |

## Adding a New Site

1. Open `sites.json`
2. Add a new object to the `sites` array
3. Find the right CSS selector for news links (use browser DevTools)
4. Set `type: "dynamic"` if the site uses JS rendering
5. Test: `node scraper.js --site newSiteEn --headless false`

### Example: Add Sohu News

```json
{
  "name": "搜狐新闻",
  "nameEn": "sohu",
  "enabled": true,
  "type": "dynamic",
  "waitMs": 3000,
  "sections": [
    {
      "name": "首页",
      "url": "https://news.sohu.com",
      "selectors": {
        "container": "body",
        "link": "a[href*='/a/']",
        "title": null
      },
      "extract": { "title": "text", "url": "href", "baseUrl": "https://news.sohu.com" },
      "filter": { "minTitleLength": 6 }
    }
  ]
}
```

### Finding CSS Selectors

1. Open target site in Chrome
2. Press F12 → Elements tab
3. Hover over a news link, right-click → Copy → Copy selector
4. Generalize it: `a.news-title` instead of `body > div:nth-child(3) > a`
5. Test in console: `document.querySelectorAll('your-selector').length`

## Output

### JSON Format

```json
{
  "timestamp": "2026-03-17T06:00:00.000Z",
  "sites": [
    {
      "name": "新浪新闻",
      "nameEn": "sina",
      "sections": [
        {
          "name": "时政要闻",
          "count": 20,
          "items": [
            { "title": "...", "url": "https://...", "source": "新浪新闻" }
          ]
        }
      ]
    }
  ]
}
```

### Text Format

Human-readable output printed to stdout. JSON also auto-saved to `scripts/output/news-YYYY-MM-DD.json`.

## Tips

- **Rate limiting**: The scraper adds delays between sites. Don't set `--parallel` too high.
- **Anti-scraping**: Some sites block headless browsers. Try `--headless false` or adjust userAgent in scraper.js.
- **Memory**: Each Playwright page uses ~50MB. Close tabs when done (the script handles this).
- **Filtering**: Use `filter.urlContains` to filter by URL patterns (e.g., only articles, not videos).
