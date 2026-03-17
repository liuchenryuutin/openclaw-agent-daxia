# Site Patterns Reference

Quick reference for common patterns when adding new Chinese news sites.

## Common URL Patterns

| Site | Article URL Pattern | Link Selector |
|------|-------------------|---------------|
| 新浪 | `/doc-YYYY-MM-DD/doc-xxx.shtml` | `a[href*='/doc-']` |
| 腾讯 | `/rain/a/YYYYMMDD/xxx` | `a[href*='/rain/a/']` |
| 网易 | `/article/xxx.html` | `a[href*='article']` |
| 搜狐 | `/a/YYYYMMDD_xxx` | `a[href*='/a/']` |
| 凤凰 | `/c/s/xxx` | `a[href*='/c/']` |
| 澎湃 | `newsDetail_xxx` | `a[href*='newsDetail_']` |
| 观察者网 | `/author/YYYY_MM_DD_xxx.shtml` | `a[href*='.shtml']` |
| 钛媒体 | `/xxxxx.html` | `a[href*='/7']` |
| 虎嗅 | `/article/xxx.html` | `a[href*='/article/']` |
| 界面 | `/article/xxx.html` | `a[href*='/article/']` |
| 36氪 | `/p/xxxxx` | `a[href*='/p/']` |
| 央视 | `/xxxxx/index.shtml` | `a[href*='index.shtml']` |
| 人民网 | `/n2/YYYY/MMDD/cxxx` | `a[href*='/n2/']` |
| 新华网 | `/xxxxx.htm` | `a[href*='.htm']` |

## Site Type Classification

### Static (no JS rendering, fast)
- 新浪新闻 (news.sina.com.cn)
- 观察者网 (www.guancha.cn)
- 钛媒体 (www.tmtpost.com)
- 搜狐 (news.sohu.com) - partially

### Dynamic (JS rendering required, slower)
- 腾讯新闻 (news.qq.com)
- 网易新闻 (news.163.com)
- 凤凰网 (www.ifeng.com)
- 澎湃新闻 (www.thepaper.cn)
- 虎嗅 (www.huxiu.com)
- 36氪 (www.36kr.com)
- 央视网 (www.cctv.com)
- 新华网 (www.xinhuanet.com)
- 人民网 (www.people.com.cn)
- 界面新闻 (www.jiemian.com)
- 财新网 (www.caixin.com)
- 今日头条 (www.toutiao.com)

## Common Filter Patterns

### Only article links (exclude nav/home/video)
```json
{
  "filter": {
    "urlContains": "/doc-",
    "urlExclude": "/video/",
    "minTitleLength": 8
  }
}
```

### Category-based sections (新浪)
新浪 uses URL path prefixes for categories:
- `/c/` = 国内时政
- `/w/` = 国际
- `/s/` = 社会
- `/o/` = 综合/其他

### Multi-section site example
```json
{
  "name": "新浪新闻",
  "nameEn": "sina",
  "type": "static",
  "sections": [
    {
      "name": "时政",
      "url": "https://news.sina.com.cn",
      "selectors": { "link": "a[href*='/c/']" },
      "filter": { "urlContains": "/doc-" }
    },
    {
      "name": "国际",
      "url": "https://news.sina.com.cn",
      "selectors": { "link": "a[href*='/w/']" },
      "filter": { "urlContains": "/doc-" }
    }
  ]
}
```

## Troubleshooting

### No items returned
1. Open site in browser with DevTools
2. Check if links are loaded (they may be lazy-loaded)
3. Try `type: "dynamic"` with `waitMs: 5000`
4. Check if selector matches: `document.querySelectorAll('your-selector')`

### Items have no titles
- Some sites have title in a child element: `"title": ".title-text"`
- Or use title attribute: `"extract": { "title": "attr:title" }`

### Duplicate items
- The scraper auto-deduplicates by URL within each section
- Cross-section dupes may occur (use external dedup in processing)

### Site blocks headless browser
- Try `--headless false` to run visible
- Or set a realistic userAgent in scraper.js
- Some sites need `viewport` set to desktop size
