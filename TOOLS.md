# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

## GitHub Repos

### Workspace Backup
- **Repo:** `liuchenryuutin/openclaw-agent-daxia.git`
- **Remote:** `git@github.com:liuchenryuutin/openclaw-agent-daxia.git`
- **Branch:** master
- **Local Path:** `~/.openclaw/workspace`
- **Status:** Connected, auto-commit and push enabled

### GitHub CLI
- **Account:** liuchenryutin
- **Protocol:** SSH
- **Token Scopes:** repo, gist, read:org, admin:public_key
- **Status:** Configured and working

### Dedicated GitHub Repos Directory
- **Path:** `~/github`
- **Purpose:** 
  - 创建子文件夹，写代码，提交
  - 从 GitHub clone 仓库，分析代码
- **Usage:** 所有 GitHub 相关的代码工作都在这个目录下进行

---

Add whatever helps you do your job. This is your cheat sheet.
