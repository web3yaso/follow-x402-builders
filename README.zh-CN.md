[English](README.md) | **中文**

# x402 日报

一个 AI 驱动的日报工具，追踪 x402 协议生态——协议进展、builder 动态、整合新闻、行情评论和播客——并以结构化格式推送到你的语言环境中。

Fork 自 [Zara Zhang](https://github.com/zarazhangrui/follow-builders) 的 follow-builders。

## 日报内容

每日日报按板块组织：

- **重点速览** — 当日最重要的 3-5 条进展
- **项目进展** — 产品发布、协议整合、新工具
- **观点** — Builder 判断、预测、反向思考
- **行情与生态** — 代币价格、市场评论
- **资讯** — x402 Report 文章摘要
- **播客** — x402 相关播客集数摘要

**语言自动检测：** 用中文提问 → 纯中文日报；用英文提问 → 纯英文日报；明确要求双语 → 英中逐段交替。

## 信息源

### X/Twitter（24个账户）
核心协议：[x402](https://x.com/x402)、[x402Foundation](https://x.com/x402Foundation)、[Erik Reppel](https://x.com/programmer)、[Carson Roscoe](https://x.com/carsonroscoe7)

生态 Builder：[agentcashdev](https://x.com/agentcashdev)、[ampersend_ai](https://x.com/ampersend_ai)、[daydreamsagents](https://x.com/daydreamsagents)、[bankrbot](https://x.com/bankrbot)、[x402pulse_com](https://x.com/x402pulse_com)、[merit_systems](https://x.com/merit_systems)、[virtuals_io](https://x.com/virtuals_io)、[ethermage](https://x.com/ethermage)、[samrags](https://x.com/samrags)、[shafu0x](https://x.com/shafu0x)、[primer_systems](https://x.com/primer_systems)、[james_bachini](https://x.com/james_bachini)、[kleffew94](https://x.com/kleffew94)、[PayAINetwork](https://x.com/PayAINetwork)、[dexteraiagent](https://x.com/dexteraiagent)、[elijahintek](https://x.com/elijahintek)、[dwr](https://x.com/dwr)

基础设施：[CoinbaseDev](https://x.com/CoinbaseDev)、[Cloudflare](https://x.com/Cloudflare)、[Solana](https://x.com/Solana)

### 播客（3个）
- [Bankless](https://www.youtube.com/@Bankless) — 回溯 180 天，优先选 x402 相关集数
- [Tokenized](https://www.youtube.com/@TokenizedPodcast)
- [Tech Snippets Today with Joseph Raczynski](https://www.youtube.com/@JosephRaczynski)

### 资讯
- [x402 Report](https://x402.report) — WordPress 站点，通过 REST API 抓取

## 快速开始

```bash
git clone https://github.com/web3yaso/follow-x402-builders.git ~/.claude/skills/follow-x402-builders
cd ~/.claude/skills/follow-x402-builders/scripts && npm install
```

然后在 Claude Code 中说：**"生成今天的 x402 日报"**

## 环境要求

- Claude Code（或兼容的 AI agent）
- `XPOZ_API_KEY` — 用于抓取 X/Twitter 内容（[在 xpoz.ai 获取](https://xpoz.ai/get-token)）

无需其他 API key。播客和资讯内容直接通过 RSS / REST API 抓取。

## 工作原理

```
generate-feed.js          ← 每日运行（GitHub Actions 或本地）
  ├── X/Twitter via xpoz SDK（需要 XPOZ_API_KEY）
  ├── 播客 via RSS（无需 key）
  └── 资讯 via WordPress REST API（无需 key）
        ↓
feed-x.json / feed-podcasts.json / feed-blogs.json  ← 提交到本仓库
        ↓
prepare-digest.js         ← 从本仓库 GitHub 拉取 feed
        ↓
Claude 重混内容 → 结构化日报
```

### 本地运行 feed 生成器

```bash
cd scripts
# 在 .env 文件中填入 XPOZ_API_KEY
source ../.env && node generate-feed.js              # 全部
source ../.env && node generate-feed.js --tweets-only
source ../.env && node generate-feed.js --podcasts-only
source ../.env && node generate-feed.js --blogs-only
```

### 自动每日更新（GitHub Actions）

`.github/workflows/generate-feed.yml` 每天 UTC 6:00 自动运行。

在仓库 **Settings → Secrets and variables → Actions** 中添加 `XPOZ_API_KEY`。

## 自定义

编辑 `prompts/` 目录中的 prompt 文件：
- `digest-intro.md` — 日报结构、板块定义、语言规则
- `summarize-tweets.md` — 推文摘要方式和分类规则
- `summarize-podcast.md` — 播客集数摘要方式
- `summarize-blogs.md` — 资讯文章摘要方式

或在 `config/default-sources.json` 中增减信息源：
- `x_accounts` — 追踪的 X/Twitter 账户
- `podcasts` — RSS feed URL + YouTube URL + 可选 `lookbackDays`
- `blogs` — WordPress REST API 地址 + 可选 `lookbackDays`

## 许可证

MIT
