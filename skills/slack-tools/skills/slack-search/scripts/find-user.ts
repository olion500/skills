#!/usr/bin/env bun
/**
 * Find Slack users by name or email
 * Usage: bun run find-user.ts <query>
 */

const token = process.env.SLACK_BOT_TOKEN;
if (!token) {
  console.error("SLACK_BOT_TOKEN not set");
  process.exit(1);
}

const query = process.argv.slice(2).join(" ").toLowerCase();
if (!query) {
  console.error("Usage: bun run find-user.ts <query>");
  process.exit(1);
}

let users: Array<{ id: string; name: string; real_name: string; email: string; title: string }> = [];
let cursor = "";

do {
  const params = new URLSearchParams({ limit: "200" });
  if (cursor) params.set("cursor", cursor);

  const res = await fetch(`https://slack.com/api/users.list?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();

  if (!data.ok) {
    console.error(`Slack API error: ${data.error}`);
    process.exit(1);
  }

  for (const u of data.members ?? []) {
    if (u.deleted || u.is_bot) continue;
    const name = (u.name ?? "").toLowerCase();
    const realName = (u.real_name ?? "").toLowerCase();
    const email = (u.profile?.email ?? "").toLowerCase();
    const title = (u.profile?.title ?? "").toLowerCase();

    if (name.includes(query) || realName.includes(query) || email.includes(query) || title.includes(query)) {
      users.push({
        id: u.id,
        name: u.name,
        real_name: u.real_name ?? "",
        email: u.profile?.email ?? "",
        title: u.profile?.title ?? "",
      });
    }
  }

  cursor = data.response_metadata?.next_cursor ?? "";
} while (cursor);

if (users.length === 0) {
  console.log("No users found.");
  process.exit(0);
}

console.log(`Found ${users.length} users:\n`);
for (const u of users) {
  console.log(`@${u.name} (${u.id}) — ${u.real_name}`);
  if (u.email) console.log(`  Email: ${u.email}`);
  if (u.title) console.log(`  Title: ${u.title}`);
  console.log();
}
