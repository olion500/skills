#!/usr/bin/env bun
/**
 * Find Slack channels by name pattern
 * Usage: bun run find-channel.ts <query>
 */

const token = process.env.SLACK_BOT_TOKEN;
if (!token) {
  console.error("SLACK_BOT_TOKEN not set");
  process.exit(1);
}

const query = process.argv.slice(2).join(" ").toLowerCase();
if (!query) {
  console.error("Usage: bun run find-channel.ts <query>");
  process.exit(1);
}

let channels: Array<{ id: string; name: string; topic: string; purpose: string; num_members: number }> = [];
let cursor = "";

// Paginate — channels can be many
do {
  const params = new URLSearchParams({
    types: "public_channel,private_channel",
    limit: "200",
    exclude_archived: "true",
  });
  if (cursor) params.set("cursor", cursor);

  const res = await fetch(`https://slack.com/api/conversations.list?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();

  if (!data.ok) {
    console.error(`Slack API error: ${data.error}`);
    process.exit(1);
  }

  for (const ch of data.channels ?? []) {
    const name = (ch.name ?? "").toLowerCase();
    const topic = (ch.topic?.value ?? "").toLowerCase();
    const purpose = (ch.purpose?.value ?? "").toLowerCase();
    if (name.includes(query) || topic.includes(query) || purpose.includes(query)) {
      channels.push({
        id: ch.id,
        name: ch.name,
        topic: ch.topic?.value ?? "",
        purpose: ch.purpose?.value ?? "",
        num_members: ch.num_members ?? 0,
      });
    }
  }

  cursor = data.response_metadata?.next_cursor ?? "";
} while (cursor);

if (channels.length === 0) {
  console.log("No channels found.");
  process.exit(0);
}

console.log(`Found ${channels.length} channels:\n`);
for (const ch of channels) {
  console.log(`#${ch.name} (${ch.id}) — ${ch.num_members} members`);
  if (ch.topic) console.log(`  Topic: ${ch.topic}`);
  if (ch.purpose) console.log(`  Purpose: ${ch.purpose}`);
  console.log();
}
