#!/usr/bin/env bun
/**
 * Slack message search via search.messages API
 * Usage: bun run search.ts <query> [--count N]
 *
 * Supports Slack search modifiers:
 *   in:channel, from:user, before/after:YYYY-MM-DD, "exact phrase", has:link, is:thread
 */

const token = process.env.SLACK_USER_TOKEN;
if (!token) {
  console.error("SLACK_USER_TOKEN not set");
  process.exit(1);
}

const args = process.argv.slice(2);
let count = 20;
const queryParts: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--count" && args[i + 1]) {
    count = parseInt(args[i + 1], 10);
    i++;
  } else {
    queryParts.push(args[i]);
  }
}

const query = queryParts.join(" ");
if (!query) {
  console.error("Usage: bun run search.ts <query> [--count N]");
  process.exit(1);
}

const params = new URLSearchParams({
  query,
  count: String(count),
  sort: "timestamp",
  sort_dir: "desc",
});

const res = await fetch(`https://slack.com/api/search.messages?${params}`, {
  headers: { Authorization: `Bearer ${token}` },
});

const data = await res.json();

if (!data.ok) {
  console.error(`Slack API error: ${data.error}`);
  process.exit(1);
}

const matches = data.messages?.matches ?? [];
if (matches.length === 0) {
  console.log("No results found.");
  process.exit(0);
}

console.log(`Found ${data.messages.total} results (showing ${matches.length}):\n`);

for (const m of matches) {
  const date = new Date(parseFloat(m.ts) * 1000).toISOString().slice(0, 16);
  const channel = m.channel?.name ?? "unknown";
  const user = m.username ?? m.user ?? "unknown";
  const thread = m.permalink ?? "";
  const text = (m.text ?? "").slice(0, 300);

  console.log(`[${date}] #${channel} @${user}`);
  console.log(`  ${text}`);
  if (thread) console.log(`  ${thread}`);
  console.log();
}
