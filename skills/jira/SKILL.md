---
name: jira
description: "Create, update, search, transition, link, and read comments on Jira issues via CLI. MUST use this skill whenever the user pastes or mentions any atlassian.net URL (Jira issues, Confluence pages, focusedCommentId links, board links — anything from *.atlassian.net). Also use for: TSLA-* ticket references, JQL searches, issue status changes, reading comments, creating bugs, updating descriptions. This is the ONLY way to interact with Jira/Atlassian — there is no MCP Atlassian available."
---

# Jira CLI Skill

Lightweight Python CLI wrapper around Jira REST API v3. Handles markdown ↔ ADF conversion natively — no broken `h1.` headers or `_text*` bold issues.

## Setup

Credentials are configured via **plugin settings** (stored in OS Keychain) when you enable the `olion500-skills` plugin. Alternatively, set environment variables directly:

```
JIRA_URL=https://yourteam.atlassian.net
JIRA_USERNAME=user@example.com
JIRA_API_TOKEN=<atlassian-api-token>
```

Optional env vars:
```
JIRA_ASSIGN_SELF=true        # Auto-assign to current user
JIRA_PARENT_EPIC=TSLA-12345  # Default parent epic
```

## Commands

All commands output JSON. The CLI path is relative to this skill:

```
python3 "$CLAUDE_PLUGIN_ROOT/skills/jira/jira-cli.py" <command> [args]
```

### Get Issue

```bash
python3 "$CLAUDE_PLUGIN_ROOT/skills/jira/jira-cli.py" get-issue TSLA-12508
```

Returns: key, summary, status, issue_type, priority, assignee, reporter, labels, description (ADF converted to markdown), issue links (with IDs), url.

### Search (JQL)

```bash
python3 "$CLAUDE_PLUGIN_ROOT/skills/jira/jira-cli.py" search "project = TSLA AND status = 'To Do' ORDER BY created DESC" --limit 20
```

Options:
- `--fields` — Comma-separated fields (default: summary,status,assignee,priority,issuetype)
- `--limit` — Max results (default: 10)
- `--next-page-token` — Token from previous response for pagination

JQL examples:
- `"assignee = currentUser() AND status != Done"`
- `"project = TSLA AND labels = error-sweeper"`
- `"parent = TSLA-11689 ORDER BY created DESC"`
- `"updated >= -7d AND project = TSLA"`

### Create Issue

```bash
python3 "$CLAUDE_PLUGIN_ROOT/skills/jira/jira-cli.py" create-issue \
  --project TSLA \
  --summary "fix: error title" \
  --issue-type Bug \
  --description "## Background\n\nmarkdown description here"
```

Options:
- `--description-file` — Read markdown from file (supports headings, code blocks, lists, bold, inline code, tables → ADF)
- `--assignee-self` — Assign to current user
- `--parent` — Parent epic key (overrides JIRA_PARENT_EPIC env)

### Update Issue

```bash
python3 "$CLAUDE_PLUGIN_ROOT/skills/jira/jira-cli.py" update-issue TSLA-12345 \
  --description-file report.md
```

Options:
- `--summary` — Update summary
- `--description` — Update description (markdown → ADF)
- `--description-file` — Update description from markdown file

### Transition (Change Status)

```bash
# List available transitions
python3 "$CLAUDE_PLUGIN_ROOT/skills/jira/jira-cli.py" get-transitions TSLA-12345

# Execute transition
python3 "$CLAUDE_PLUGIN_ROOT/skills/jira/jira-cli.py" transition TSLA-12345 --to "In Progress"
```

Transition name is case-insensitive. Use `get-transitions` first to see available options.

### Issue Links

```bash
# List available link types
python3 "$CLAUDE_PLUGIN_ROOT/skills/jira/jira-cli.py" get-link-types

# Create link (inward "is blocked by" outward)
python3 "$CLAUDE_PLUGIN_ROOT/skills/jira/jira-cli.py" link-issue \
  --inward TSLA-100 --outward TSLA-200 --type "Blocks"

# Remove link by ID (get ID from get-issue output)
python3 "$CLAUDE_PLUGIN_ROOT/skills/jira/jira-cli.py" remove-link 12345
```

Link direction: `--inward` is the issue that receives the inward label (e.g. "is blocked by"), `--outward` gets the outward label (e.g. "blocks").

### Comments

```bash
# Get all comments on an issue (newest first)
python3 "$CLAUDE_PLUGIN_ROOT/skills/jira/jira-cli.py" get-comments TSLA-12345

# Get all comments with pagination
python3 "$CLAUDE_PLUGIN_ROOT/skills/jira/jira-cli.py" get-comments TSLA-12345 --limit 50 --start-at 0

# Get a specific comment by ID (e.g. from focusedCommentId URL param)
python3 "$CLAUDE_PLUGIN_ROOT/skills/jira/jira-cli.py" get-comment TSLA-12345 94811
```

Returns: id, author, created, updated, body (ADF converted to markdown).

When the user pastes a Jira URL with `?focusedCommentId=XXXXX`, extract the issue key and comment ID, then use `get-comment` to fetch that specific comment.

### Add Remote Link (Web Link)

```bash
python3 "$CLAUDE_PLUGIN_ROOT/skills/jira/jira-cli.py" add-remote-link TSLA-12345 \
  --url "https://example.com/report" \
  --title "RCA Report"
```

## Markdown ↔ ADF

**Writing** (create/update): Markdown is converted to Atlassian Document Format. Supported: headings (#-####), fenced code blocks, bullet lists, tables, bold, inline code, links.

**Reading** (get-issue): ADF description is converted back to markdown. Handles headings, paragraphs, code blocks, lists, tables, blockquotes, inline marks (bold, italic, code, links, strikethrough), mentions, emoji.
