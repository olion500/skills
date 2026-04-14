#!/usr/bin/env bun
/**
 * Read a Slack thread via conversations.replies API
 * Usage: bun run read-thread.ts <slack-link-or-channel:ts>
 *
 * Accepts:
 *   - Full Slack link: https://cupix.slack.com/archives/C12345/p1234567890123456
 *   - Channel + ts:    C12345:1234567890.123456
 */

const token = process.env.SLACK_BOT_TOKEN;
if (!token) {
  console.error("SLACK_BOT_TOKEN not set");
  process.exit(1);
}

const input = process.argv[2];
if (!input) {
  console.error("Usage: bun run read-thread.ts <slack-link | channel:ts>");
  process.exit(1);
}

let channel: string;
let ts: string;

const linkMatch = input.match(/archives\/([A-Z0-9]+)\/p(\d+)/);
if (linkMatch) {
  channel = linkMatch[1];
  // Slack permalink encodes ts without dot: p1234567890123456 → 1234567890.123456
  const raw = linkMatch[2];
  ts = raw.slice(0, 10) + "." + raw.slice(10);
} else if (input.includes(":")) {
  [channel, ts] = input.split(":");
} else {
  console.error("Invalid input. Use a Slack link or channel:ts format.");
  process.exit(1);
}

const params = new URLSearchParams({
  channel,
  ts,
  limit: "100",
  inclusive: "true",
});

const res = await fetch(`https://slack.com/api/conversations.replies?${params}`, {
  headers: { Authorization: `Bearer ${token}` },
});

const data = await res.json();

if (!data.ok) {
  console.error(`Slack API error: ${data.error}`);
  process.exit(1);
}

const messages = data.messages ?? [];
if (messages.length === 0) {
  console.log("No messages in thread.");
  process.exit(0);
}

console.log(`Thread (${messages.length} messages):\n`);

for (const m of messages) {
  const date = new Date(parseFloat(m.ts) * 1000).toISOString().slice(0, 16);
  const user = m.user ?? "bot";
  const text = m.text ?? "";

  console.log(`[${date}] <${user}>`);
  console.log(`  ${text}`);
  console.log();
}
