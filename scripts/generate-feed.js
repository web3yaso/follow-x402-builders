#!/usr/bin/env node

// ============================================================================
// Follow Builders — Central Feed Generator
// ============================================================================
// Runs on GitHub Actions (daily at 6am UTC) to fetch content and publish
// feed-x.json, feed-podcasts.json, and feed-blogs.json.
//
// Deduplication: tracks previously seen tweet IDs, episode GUIDs, and article
// URLs in state-feed.json so content is never repeated across runs.
//
// Usage: node generate-feed.js [--tweets-only | --podcasts-only | --blogs-only]
// Env vars needed: XPOZ_API_KEY, POD2TXT_API_KEY
// ============================================================================

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { XpozClient } from '@xpoz/xpoz';

// -- Constants ---------------------------------------------------------------

const POD2TXT_BASE = 'https://pod2txt.vercel.app/api';
const X_API_BASE = 'https://api.x.com/2';
// Some RSS hosts (notably Substack) block non-browser user agents from cloud IPs.
// Using a real Chrome UA avoids 403 errors in GitHub Actions.
const RSS_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TWEET_LOOKBACK_HOURS = 24;
const PODCAST_LOOKBACK_HOURS = 336; // 14 days — podcasts publish weekly/biweekly, not daily
const BLOG_LOOKBACK_HOURS = 72;
const MAX_TWEETS_PER_USER = 3;
const MAX_ARTICLES_PER_BLOG = 3;

// State file lives in the repo root so it gets committed by GitHub Actions
const SCRIPT_DIR = decodeURIComponent(new URL('.', import.meta.url).pathname);
const STATE_PATH = join(SCRIPT_DIR, '..', 'state-feed.json');

// -- State Management --------------------------------------------------------

// Tracks which tweet IDs and video IDs we've already included in feeds
// so we never send the same content twice across runs.

async function loadState() {
  if (!existsSync(STATE_PATH)) {
    return { seenTweets: {}, seenVideos: {}, seenArticles: {} };
  }
  try {
    const state = JSON.parse(await readFile(STATE_PATH, 'utf-8'));
    // Ensure seenArticles exists for older state files
    if (!state.seenArticles) state.seenArticles = {};
    return state;
  } catch {
    return { seenTweets: {}, seenVideos: {}, seenArticles: {} };
  }
}

async function saveState(state) {
  // Prune entries older than 7 days to prevent the file from growing forever
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [id, ts] of Object.entries(state.seenTweets)) {
    if (ts < cutoff) delete state.seenTweets[id];
  }
  for (const [id, ts] of Object.entries(state.seenVideos)) {
    if (ts < cutoff) delete state.seenVideos[id];
  }
  for (const [id, ts] of Object.entries(state.seenArticles || {})) {
    if (ts < cutoff) delete state.seenArticles[id];
  }
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

// -- Load Sources ------------------------------------------------------------

async function loadSources() {
  const sourcesPath = join(SCRIPT_DIR, '..', 'config', 'default-sources.json');
  return JSON.parse(await readFile(sourcesPath, 'utf-8'));
}

// -- Podcast Fetching (RSS metadata only) ------------------------------------

// Parses an RSS feed XML string and returns episode objects with
// title, description, publishedAt, guid, and link.
function parseRssFeed(xml) {
  const episodes = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let itemMatch;
  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const block = itemMatch[1];

    const titleMatch = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)
      || block.match(/<title>([\s\S]*?)<\/title>/);
    const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

    const guidMatch = block.match(/<guid[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/guid>/)
      || block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/);
    const guid = guidMatch ? guidMatch[1].trim() : null;

    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const publishedAt = pubDateMatch ? new Date(pubDateMatch[1].trim()).toISOString() : null;

    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    const link = linkMatch ? linkMatch[1].trim() : null;

    // Extract description (episode summary from RSS)
    const descMatch = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)
      || block.match(/<description>([\s\S]*?)<\/description>/);
    const description = descMatch
      ? descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : '';

    if (guid) {
      episodes.push({ title, guid, publishedAt, link, description });
    }
  }
  return episodes;
}

// Keywords used to score episode relevance to x402 / agentic payments
const RELEVANCE_KEYWORDS = [
  'x402', 'agent', 'agentic', 'micropayment', 'stablecoin', 'usdc',
  'ai payment', 'machine payment', 'autonomous payment', 'pay per', 'paywall',
  'onchain payment', 'crypto payment', 'defi', 'web3 payment'
];

function relevanceScore(title, description) {
  const text = (title + ' ' + description).toLowerCase();
  return RELEVANCE_KEYWORDS.reduce((score, kw) => score + (text.includes(kw) ? 1 : 0), 0);
}

// Fetches RSS feed metadata for each podcast — no audio transcription.
// Scans up to 30 recent episodes and picks the most x402-relevant unseen one
// within the lookback window. Falls back to the most recent if none match.
async function fetchPodcastContent(podcasts, state, errors) {
  const cutoff = new Date(Date.now() - PODCAST_LOOKBACK_HOURS * 60 * 60 * 1000);
  const results = [];

  for (const podcast of podcasts) {
    if (!podcast.rssUrl) {
      errors.push(`Podcast: No rssUrl configured for ${podcast.name}`);
      continue;
    }

    try {
      console.error(`  Fetching RSS for ${podcast.name}...`);
      const rssRes = await fetch(podcast.rssUrl, {
        headers: {
          'User-Agent': RSS_USER_AGENT,
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          'Cache-Control': 'no-cache'
        },
        signal: AbortSignal.timeout(30000)
      });

      if (!rssRes.ok) {
        errors.push(`Podcast: Failed to fetch RSS for ${podcast.name}: HTTP ${rssRes.status}`);
        continue;
      }

      const episodes = parseRssFeed(await rssRes.text());
      console.error(`  ${podcast.name}: ${episodes.length} episodes found`);

      // Per-podcast lookback override (e.g. Bankless publishes x402 content infrequently)
      const podcastCutoff = podcast.lookbackDays
        ? new Date(Date.now() - podcast.lookbackDays * 24 * 60 * 60 * 1000)
        : cutoff;

      // Scan up to 100 recent episodes, filter unseen + within lookback window
      const candidates = episodes.slice(0, 100).filter(ep => {
        if (state.seenVideos[ep.guid]) return false;
        if (ep.publishedAt && new Date(ep.publishedAt) < podcastCutoff) return false;
        return true;
      });

      if (candidates.length === 0) {
        console.error(`  No new episodes for ${podcast.name}`);
        continue;
      }

      // Pick highest relevance score; tie-break by most recent
      candidates.sort((a, b) => {
        const scoreDiff = relevanceScore(b.title, b.description) - relevanceScore(a.title, a.description);
        if (scoreDiff !== 0) return scoreDiff;
        return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
      });

      const selected = candidates[0];
      const score = relevanceScore(selected.title, selected.description);
      state.seenVideos[selected.guid] = Date.now();
      console.error(`  Selected (score=${score}): "${selected.title}"`);

      results.push({
        source: 'podcast',
        name: podcast.name,
        title: selected.title,
        guid: selected.guid,
        url: selected.link || podcast.url,
        podcastUrl: podcast.url,
        publishedAt: selected.publishedAt,
        description: selected.description
      });
    } catch (err) {
      errors.push(`Podcast: Error processing ${podcast.name}: ${err.message}`);
    }
  }

  return results;
}

// -- X/Twitter Fetching (via xpoz SDK) --------------------------------------

async function fetchXContent(xAccounts, xpozApiKey, state, errors) {
  const results = [];
  const cutoff = new Date(Date.now() - TWEET_LOOKBACK_HOURS * 60 * 60 * 1000);
  const startDate = cutoff.toISOString().split('T')[0]; // YYYY-MM-DD

  const client = new XpozClient({ apiKey: xpozApiKey });
  await client.connect();

  try {
    for (const account of xAccounts) {
      try {
        console.error(`  Fetching tweets for @${account.handle}...`);
        const res = await client.twitter.getPostsByAuthor(account.handle, {
          startDate,
          limit: 10
        });

        const allTweets = res.data || [];

        // Filter out retweets, replies, and already-seen; cap at MAX_TWEETS_PER_USER
        const newTweets = [];
        for (const t of allTweets) {
          if (state.seenTweets[t.id]) continue;
          if (t.retweetedPost) continue;   // skip retweets
          if (t.inReplyToPostId) continue; // skip replies
          if (newTweets.length >= MAX_TWEETS_PER_USER) break;

          newTweets.push({
            id: t.id,
            text: t.text,
            createdAt: t.createdAt,
            url: t.url || `https://x.com/${account.handle}/status/${t.id}`,
            likes: t.likeCount || 0,
            retweets: t.retweetCount || 0,
            replies: t.replyCount || 0,
            isQuote: !!t.quotedPost
          });

          state.seenTweets[t.id] = Date.now();
        }

        if (newTweets.length === 0) {
          console.error(`    No new tweets for @${account.handle}`);
          continue;
        }

        console.error(`    ${newTweets.length} new tweet(s) for @${account.handle}`);
        results.push({
          source: 'x',
          name: account.name,
          handle: account.handle,
          bio: '',
          tweets: newTweets
        });

        // Sequential to respect rate limits
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        errors.push(`X (xpoz): Error fetching @${account.handle}: ${err.message}`);
        console.error(`    Error for @${account.handle}: ${err.message}`);
      }
    }
  } finally {
    await client.close();
  }

  return results;
}

// -- Blog Fetching (WordPress REST API) -------------------------------------

// Fetches recent posts from WordPress sites via the REST API.
// Supports dedup and lookback window. No HTML scraping needed.
async function fetchBlogContent(blogs, state, errors) {
  const cutoff = new Date(Date.now() - BLOG_LOOKBACK_HOURS * 60 * 60 * 1000);
  const results = [];

  for (const blog of blogs) {
    if (blog.type !== 'wordpress' || !blog.apiUrl) {
      errors.push(`Blog: Unsupported type or missing apiUrl for ${blog.name}`);
      continue;
    }

    try {
      console.error(`  Fetching posts from ${blog.name}...`);
      const res = await fetch(
        `${blog.apiUrl}?per_page=10&_fields=id,title,link,date,excerpt`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );

      if (!res.ok) {
        errors.push(`Blog: Failed to fetch ${blog.name}: HTTP ${res.status}`);
        continue;
      }

      const posts = await res.json();
      let newCount = 0;
      const blogCutoff = blog.lookbackDays
        ? new Date(Date.now() - blog.lookbackDays * 24 * 60 * 60 * 1000)
        : cutoff;

      for (const post of posts) {
        if (state.seenArticles[post.link]) continue;
        if (post.date && new Date(post.date) < blogCutoff) continue;

        const description = (post.excerpt?.rendered || '')
          .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

        results.push({
          source: 'blog',
          name: blog.name,
          title: post.title?.rendered || 'Untitled',
          url: post.link,
          publishedAt: post.date ? new Date(post.date).toISOString() : null,
          description
        });

        state.seenArticles[post.link] = Date.now();
        newCount++;
        if (newCount >= MAX_ARTICLES_PER_BLOG) break;
      }

      console.error(`  ${blog.name}: ${newCount} new post(s)`);
    } catch (err) {
      errors.push(`Blog: Error fetching ${blog.name}: ${err.message}`);
    }
  }

  return results;
}

// -- Main --------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const tweetsOnly = args.includes('--tweets-only');
  const podcastsOnly = args.includes('--podcasts-only');
  const blogsOnly = args.includes('--blogs-only');

  // If a specific --*-only flag is set, only that feed type runs.
  // If no flag is set, all three run.
  const runTweets = tweetsOnly || (!podcastsOnly && !blogsOnly);
  const runPodcasts = podcastsOnly || (!tweetsOnly && !blogsOnly);
  const runBlogs = blogsOnly || (!tweetsOnly && !podcastsOnly);

  const xpozApiKey = process.env.XPOZ_API_KEY;

  if (runTweets && !xpozApiKey) {
    console.error('XPOZ_API_KEY not set');
    process.exit(1);
  }

  const sources = await loadSources();
  const state = await loadState();
  const errors = [];

  // Fetch tweets
  if (runTweets) {
    console.error('Fetching X/Twitter content...');
    const xContent = await fetchXContent(sources.x_accounts, xpozApiKey, state, errors);
    console.error(`  Found ${xContent.length} builders with new tweets`);

    const totalTweets = xContent.reduce((sum, a) => sum + a.tweets.length, 0);
    const xFeed = {
      generatedAt: new Date().toISOString(),
      lookbackHours: TWEET_LOOKBACK_HOURS,
      x: xContent,
      stats: { xBuilders: xContent.length, totalTweets },
      errors: errors.filter(e => e.startsWith('X API')).length > 0
        ? errors.filter(e => e.startsWith('X API')) : undefined
    };
    await writeFile(join(SCRIPT_DIR, '..', 'feed-x.json'), JSON.stringify(xFeed, null, 2));
    console.error(`  feed-x.json: ${xContent.length} builders, ${totalTweets} tweets`);
  }

  // Fetch podcasts
  if (runPodcasts) {
    console.error('Fetching podcast content (RSS metadata)...');
    const podcasts = await fetchPodcastContent(sources.podcasts, state, errors);
    console.error(`  Found ${podcasts.length} new episodes`);

    const podcastFeed = {
      generatedAt: new Date().toISOString(),
      lookbackHours: PODCAST_LOOKBACK_HOURS,
      podcasts,
      stats: { podcastEpisodes: podcasts.length },
      errors: errors.filter(e => e.startsWith('Podcast')).length > 0
        ? errors.filter(e => e.startsWith('Podcast')) : undefined
    };
    await writeFile(join(SCRIPT_DIR, '..', 'feed-podcasts.json'), JSON.stringify(podcastFeed, null, 2));
    console.error(`  feed-podcasts.json: ${podcasts.length} episodes`);
  }

  // Fetch blog posts
  if (runBlogs && sources.blogs && sources.blogs.length > 0) {
    console.error('Fetching blog content...');
    const blogContent = await fetchBlogContent(sources.blogs, state, errors);
    console.error(`  Found ${blogContent.length} new blog post(s)`);

    const blogFeed = {
      generatedAt: new Date().toISOString(),
      lookbackHours: BLOG_LOOKBACK_HOURS,
      blogs: blogContent,
      stats: { blogPosts: blogContent.length },
      errors: errors.filter(e => e.startsWith('Blog')).length > 0
        ? errors.filter(e => e.startsWith('Blog')) : undefined
    };
    await writeFile(join(SCRIPT_DIR, '..', 'feed-blogs.json'), JSON.stringify(blogFeed, null, 2));
    console.error(`  feed-blogs.json: ${blogContent.length} posts`);
  }

  // Save dedup state
  await saveState(state);

  if (errors.length > 0) {
    console.error(`  ${errors.length} non-fatal errors`);
  }
}

main().catch(err => {
  console.error('Feed generation failed:', err.message);
  process.exit(1);
});
