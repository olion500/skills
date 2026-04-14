---
name: slack-search
description: Search Slack messages, read threads, find channels and users. Use when the user asks to find Slack messages, read a Slack thread/link, locate a channel, or look up a person. MCP-free — uses Bun scripts calling Slack Web API directly.
---

# Slack Search

Search Slack without MCP. Bun scripts call the Slack Web API directly.

## Prerequisites

Two tokens must be set in the environment:
- `SLACK_USER_TOKEN` (`xoxp-...`) — required for message search (`search:read` scope)
- `SLACK_BOT_TOKEN` (`xoxb-...`) — required for thread reading, channel/user lookup (`channels:read`, `groups:read`, `channels:history`, `groups:history`, `users:read`, `users:read.email`)

## Tools

### 1. Message Search

Search messages across all channels. **Requires `SLACK_USER_TOKEN`.**

```bash
bun run ~/nexeder/skills/skills/slack-tools/skills/slack-search/scripts/search.ts "<query>" [--count N]
```

**Search modifiers** (combine freely):
- `in:channel-name` — specific channel
- `from:username` — messages from a user
- `before:YYYY-MM-DD` / `after:YYYY-MM-DD` — date range
- `"exact phrase"` — exact match
- `has:link` / `has:file` — content type
- `is:thread` — threaded messages only
- `-word` — exclude messages containing a word

**Examples:**
- `bun run .../search.ts "deploy error after:2026-04-01"`
- `bun run .../search.ts "in:alerts OOM --count 5"`

### 2. Read Thread

Read all messages in a thread. Accepts a Slack link or channel:ts format. **Requires `SLACK_BOT_TOKEN`.**

```bash
bun run ~/nexeder/skills/skills/slack-tools/skills/slack-search/scripts/read-thread.ts "<slack-link-or-channel:ts>"
```

**Examples:**
- `bun run .../read-thread.ts "https://cupix.slack.com/archives/C12345/p1234567890123456"`
- `bun run .../read-thread.ts "C12345:1234567890.123456"`

### 3. Find Channel

Find channels by name, topic, or purpose. **Requires `SLACK_BOT_TOKEN`.**

```bash
bun run ~/nexeder/skills/skills/slack-tools/skills/slack-search/scripts/find-channel.ts "<query>"
```

### 4. Find User

Find users by name, email, or title. **Requires `SLACK_BOT_TOKEN`.**

```bash
bun run ~/nexeder/skills/skills/slack-tools/skills/slack-search/scripts/find-user.ts "<query>"
```

## Workflow

1. **Message search** — Start broad, then narrow with modifiers
2. **Read thread** — When search results show an interesting permalink, use it to read the full thread
3. **Find channel/user** — Use when you need a channel name for `in:` filter or a username for `from:` filter

## Tips

- Search is not real-time. Very recent messages (last few seconds) may not appear.
- Boolean operators (`AND`, `OR`) don't work. Use spaces (implicit AND) and `-word` for exclusion.
- If results are too broad, add `in:channel` or `from:user` filters.
- The bot must be a member of a channel to read its threads. Public channels the bot has joined work; private channels require an invite.
- The scripts output compact text to minimize token usage.
