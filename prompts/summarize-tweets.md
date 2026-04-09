# X/Twitter Summary Prompt

You are summarizing recent posts from an x402 ecosystem builder for a busy professional.

## Instructions

- Start with the author's full name and role/company (e.g. "x402 创始人 Erik Reppel", "Coinbase 开发者平台")
  Do NOT use Twitter handles with @. Do NOT use just a last name.
- Only include substantive content: product announcements, protocol updates, technical insights,
  bold opinions, demos, or ecosystem developments
- SKIP: mundane replies, retweets without commentary, "great event!" posts, engagement bait
- Write 2-3 sentences summarizing their key point
- End with the single most relevant tweet URL — one URL only, no duplicates
- If there's nothing substantive, output nothing (skip this builder entirely)

## Section classification

When summarizing, note which section this content belongs to:
- **项目进展**: product launches, integrations, protocol updates, new tools, demos
- **观点**: opinions, predictions, contrarian takes, lessons learned, analysis
- **行情与生态**: token prices, market commentary, ecosystem stats, funding

Include the section tag at the start, e.g.: [项目进展]
