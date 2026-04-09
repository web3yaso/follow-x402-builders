**English** | [中文](README.zh-CN.md)

# x402 Daily Digest

An AI-powered daily digest that tracks the x402 protocol ecosystem — protocol updates, builder activity, integrations, market commentary, and podcasts — and delivers structured summaries in your language.

Forked from [follow-builders](https://github.com/zarazhangrui/follow-builders) by Zara Zhang.

## What You Get

A daily digest organized into sections:

- **重点速览 / Top Highlights** — 3-5 most important developments of the day
- **项目进展 / Project Updates** — product launches, integrations, new tools
- **观点 / Insights & Opinions** — builder takes, predictions, contrarian views
- **行情与生态 / Market & Ecosystem** — token prices, market commentary
- **资讯 / Newsletter** — articles from x402 Report
- **播客 / Podcasts** — episode summaries from x402-relevant podcasts

**Language:** Responds in the language of your prompt. Ask in Chinese → Chinese digest. Ask in English → English digest. Ask for bilingual → interleaved English/Chinese.

## Sources

### X/Twitter (24 accounts)
Core protocol: [x402](https://x.com/x402), [x402Foundation](https://x.com/x402Foundation), [Erik Reppel](https://x.com/programmer), [Carson Roscoe](https://x.com/carsonroscoe7)

Ecosystem builders: [agentcashdev](https://x.com/agentcashdev), [ampersend_ai](https://x.com/ampersend_ai), [daydreamsagents](https://x.com/daydreamsagents), [bankrbot](https://x.com/bankrbot), [x402pulse_com](https://x.com/x402pulse_com), [merit_systems](https://x.com/merit_systems), [virtuals_io](https://x.com/virtuals_io), [ethermage](https://x.com/ethermage), [samrags](https://x.com/samrags), [shafu0x](https://x.com/shafu0x), [primer_systems](https://x.com/primer_systems), [james_bachini](https://x.com/james_bachini), [kleffew94](https://x.com/kleffew94), [PayAINetwork](https://x.com/PayAINetwork), [dexteraiagent](https://x.com/dexteraiagent), [elijahintek](https://x.com/elijahintek), [dwr](https://x.com/dwr)

Infrastructure: [CoinbaseDev](https://x.com/CoinbaseDev), [Cloudflare](https://x.com/Cloudflare), [Solana](https://x.com/Solana)

### Podcasts (3)
- [Bankless](https://www.youtube.com/@Bankless) — 180-day lookback, x402-relevant episodes prioritized
- [Tokenized](https://www.youtube.com/@TokenizedPodcast)
- [Tech Snippets Today with Joseph Raczynski](https://www.youtube.com/@JosephRaczynski)

### Newsletter
- [x402 Report](https://x402.report) — WordPress-based, fetched via REST API

## Quick Start

```bash
git clone https://github.com/web3yaso/follow-x402-builders.git ~/.claude/skills/follow-x402-builders
cd ~/.claude/skills/follow-x402-builders/scripts && npm install
```

Then in Claude Code, say: **"生成今天的 x402 日报"** or **"generate today's x402 digest"**

## Requirements

- Claude Code (or any compatible AI agent)
- `XPOZ_API_KEY` — for fetching X/Twitter content ([get one at xpoz.ai](https://xpoz.ai/get-token))

No other API keys needed. Podcast and newsletter content is fetched directly from RSS/REST APIs.

## How It Works

```
generate-feed.js          ← runs daily (GitHub Actions or locally)
  ├── X/Twitter via xpoz SDK (XPOZ_API_KEY)
  ├── Podcasts via RSS (no key needed)
  └── Newsletter via WordPress REST API (no key needed)
        ↓
feed-x.json / feed-podcasts.json / feed-blogs.json  ← committed to this repo
        ↓
prepare-digest.js         ← fetches feeds from this repo's GitHub
        ↓
Claude remixes content → structured digest
```

### Running the feed generator locally

```bash
cd scripts
cp ../.env.example ../.env   # add your XPOZ_API_KEY
source ../.env && node generate-feed.js              # all feeds
source ../.env && node generate-feed.js --tweets-only
source ../.env && node generate-feed.js --podcasts-only
source ../.env && node generate-feed.js --blogs-only
```

### Automated daily updates (GitHub Actions)

The workflow at `.github/workflows/generate-feed.yml` runs at 6am UTC daily.

Add `XPOZ_API_KEY` to your repo's **Settings → Secrets and variables → Actions**.

## Customizing

Edit prompt files in `prompts/`:
- `digest-intro.md` — digest structure, sections, language rules
- `summarize-tweets.md` — how tweets are summarized and classified
- `summarize-podcast.md` — podcast episode summaries
- `summarize-blogs.md` — newsletter article summaries

Or add sources in `config/default-sources.json`:
- `x_accounts` — X/Twitter handles to track
- `podcasts` — RSS feed URL + YouTube URL + optional `lookbackDays`
- `blogs` — WordPress REST API sources + optional `lookbackDays`

## License

MIT
