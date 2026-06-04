#!/usr/bin/env python3
"""Jira CLI — lightweight REST API wrapper for Claude skills.

Replaces MCP Atlassian tools with direct API calls + proper ADF conversion.
Markdown → ADF (write) and ADF → Markdown (read) are handled natively.

Commands:
  create-issue     Create a new issue
  update-issue     Update an existing issue
  get-issue        Get issue details (ADF description → markdown)
  search           JQL search
  transition       Change issue status
  get-transitions  List available transitions
  link-issue       Create issue link
  remove-link      Remove issue link
  get-link-types   List available link types
  add-remote-link  Add web link to issue

Environment (.env): JIRA_URL, JIRA_USERNAME, JIRA_API_TOKEN
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request
import urllib.error
import base64
from pathlib import Path


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

def _env(key: str, default: str = "") -> str:
    """Read config: CLAUDE_PLUGIN_OPTION_* > env var > .env file fallback."""
    plugin_key = f"CLAUDE_PLUGIN_OPTION_{key}"
    return os.environ.get(plugin_key) or os.environ.get(key, default)


def _load_env():
    """Load .env file if present (simple key=value parser).

    Search order: skill directory (.env next to this script), then CWD.
    Both are loaded — skill .env provides defaults, CWD .env can override.
    Plugin userConfig (CLAUDE_PLUGIN_OPTION_*) always takes priority via _env().
    """
    candidates = [
        Path(__file__).resolve().parent / ".env",
        Path.cwd() / ".env",
    ]
    for candidate in candidates:
        if candidate.exists():
            for line in candidate.read_text().splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                key, _, value = line.partition("=")
                key, value = key.strip(), value.strip()
                if key and key not in os.environ:
                    os.environ[key] = value


def _auth_header() -> str:
    user = _env("JIRA_USERNAME")
    token = _env("JIRA_API_TOKEN")
    if not user or not token:
        print("Error: JIRA_USERNAME and JIRA_API_TOKEN must be set. "
              "Configure via plugin settings or set env vars.", file=sys.stderr)
        sys.exit(1)
    return f"Basic {base64.b64encode(f'{user}:{token}'.encode()).decode()}"


def _jira_url() -> str:
    url = _env("JIRA_URL")
    if not url:
        print("Error: JIRA_URL must be set. "
              "Configure via plugin settings or set JIRA_URL env var.", file=sys.stderr)
        sys.exit(1)
    return url.rstrip("/")


def _request(method: str, path: str, data: dict | None = None, params: dict | None = None) -> dict:
    url = f"{_jira_url()}/rest/api/3{path}"
    if params:
        qs = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items() if v is not None)
        url = f"{url}?{qs}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", _auth_header())
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        print(f"Jira API error {e.code}: {err_body}", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Markdown → ADF (for writing to Jira)
# ---------------------------------------------------------------------------

_INLINE_RE = re.compile(
    r"(\[[^\]]+\]\([^)]+\)"  # [text](url)
    r"|`[^`]+`"               # `inline code`
    r"|\*\*[^*]+\*\*)"        # **bold**
)


def _inline_md(text: str) -> list[dict]:
    """Parse inline markdown into ADF inline nodes."""
    nodes: list[dict] = []
    for part in _INLINE_RE.split(text):
        if not part:
            continue
        link_m = re.match(r"^\[([^\]]+)\]\(([^)]+)\)$", part)
        if link_m:
            nodes.append({"type": "text", "text": link_m.group(1),
                          "marks": [{"type": "link", "attrs": {"href": link_m.group(2)}}]})
        elif part.startswith("`") and part.endswith("`"):
            nodes.append({"type": "text", "text": part[1:-1], "marks": [{"type": "code"}]})
        elif part.startswith("**") and part.endswith("**"):
            nodes.append({"type": "text", "text": part[2:-2], "marks": [{"type": "strong"}]})
        else:
            nodes.append({"type": "text", "text": part})
    return nodes or [{"type": "text", "text": text}]


def _md_to_adf(md: str) -> dict:
    """Convert markdown to Atlassian Document Format (ADF)."""
    stripped = md.strip()
    if stripped.startswith("---"):
        end = stripped.find("---", 3)
        if end != -1:
            md = stripped[end + 3:].strip()

    lines = md.split("\n")
    content: list[dict] = []
    i = 0

    while i < len(lines):
        line = lines[i]

        # Fenced code block
        if line.strip().startswith("```"):
            lang = line.strip()[3:].strip() or None
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            if i < len(lines):
                i += 1
            node: dict = {"type": "codeBlock",
                          "content": [{"type": "text", "text": "\n".join(code_lines)}]}
            if lang:
                node["attrs"] = {"language": lang}
            content.append(node)
            continue

        # Heading
        m = re.match(r"^(#{1,4})\s+(.*)", line)
        if m:
            content.append({"type": "heading", "attrs": {"level": len(m.group(1))},
                            "content": _inline_md(m.group(2))})
            i += 1
            continue

        # Bullet list
        if re.match(r"^\s*[-*]\s+", line):
            items = []
            while i < len(lines) and re.match(r"^\s*[-*]\s+", lines[i]):
                text = re.sub(r"^\s*[-*]\s+", "", lines[i])
                items.append({"type": "listItem",
                              "content": [{"type": "paragraph", "content": _inline_md(text)}]})
                i += 1
            content.append({"type": "bulletList", "content": items})
            continue

        # Table
        if line.strip().startswith("|") and line.strip().endswith("|"):
            table_rows = []
            while i < len(lines) and lines[i].strip().startswith("|") and lines[i].strip().endswith("|"):
                table_rows.append(lines[i])
                i += 1
            data_rows = [r for r in table_rows if not re.match(r"^\s*\|[\s\-:|]+\|\s*$", r)]
            if data_rows:
                def parse_row(row):
                    return [c.strip() for c in row.strip().strip("|").split("|")]
                header_cells = parse_row(data_rows[0])
                header_row = {"type": "tableRow", "content": [
                    {"type": "tableHeader", "content": [{"type": "paragraph", "content": _inline_md(c)}]}
                    for c in header_cells]}
                body_rows = [{"type": "tableRow", "content": [
                    {"type": "tableCell", "content": [{"type": "paragraph", "content": _inline_md(c)}]}
                    for c in parse_row(dr)]} for dr in data_rows[1:]]
                content.append({"type": "table", "content": [header_row] + body_rows})
            continue

        # Blank line
        if not line.strip():
            i += 1
            continue

        # Paragraph
        content.append({"type": "paragraph", "content": _inline_md(line)})
        i += 1

    return {"type": "doc", "version": 1, "content": content}


# ---------------------------------------------------------------------------
# ADF → Markdown (for reading from Jira)
# ---------------------------------------------------------------------------

def _adf_to_md(adf) -> str:
    """Convert ADF document to markdown. Returns raw string if not ADF."""
    if isinstance(adf, str):
        return adf
    if not isinstance(adf, dict) or adf.get("type") != "doc":
        return str(adf) if adf else ""
    try:
        parts = [_render_block(node) for node in adf.get("content", [])]
        return "\n\n".join(p for p in parts if p)
    except Exception:
        return json.dumps(adf, ensure_ascii=False)


def _render_block(node: dict) -> str:
    t = node.get("type", "")

    if t == "heading":
        level = node.get("attrs", {}).get("level", 1)
        return f"{'#' * level} {_render_inline(node.get('content', []))}"

    if t == "paragraph":
        return _render_inline(node.get("content", []))

    if t == "codeBlock":
        lang = node.get("attrs", {}).get("language", "")
        code = _render_inline(node.get("content", []))
        return f"```{lang}\n{code}\n```"

    if t == "bulletList":
        items = []
        for item in node.get("content", []):
            text = "\n".join(_render_block(c) for c in item.get("content", []))
            items.append(f"- {text}")
        return "\n".join(items)

    if t == "orderedList":
        items = []
        for i, item in enumerate(node.get("content", []), 1):
            text = "\n".join(_render_block(c) for c in item.get("content", []))
            items.append(f"{i}. {text}")
        return "\n".join(items)

    if t == "blockquote":
        inner = "\n".join(_render_block(c) for c in node.get("content", []))
        return "\n".join(f"> {line}" for line in inner.split("\n"))

    if t == "rule":
        return "---"

    if t == "table":
        return _render_table(node)

    if t in ("mediaSingle", "media"):
        return "[media]"

    # Unknown block — try to render children
    if "content" in node:
        return "\n".join(_render_block(c) for c in node["content"])
    return ""


def _render_inline(nodes: list) -> str:
    parts = []
    for node in nodes:
        t = node.get("type", "")
        if t == "text":
            text = node.get("text", "")
            for mark in node.get("marks", []):
                mt = mark.get("type", "")
                if mt == "strong":
                    text = f"**{text}**"
                elif mt == "em":
                    text = f"*{text}*"
                elif mt == "code":
                    text = f"`{text}`"
                elif mt == "link":
                    href = mark.get("attrs", {}).get("href", "")
                    text = f"[{text}]({href})"
                elif mt == "strike":
                    text = f"~~{text}~~"
        elif t == "hardBreak":
            text = "\n"
        elif t == "inlineCard":
            text = node.get("attrs", {}).get("url", "")
        elif t == "mention":
            text = f"@{node.get('attrs', {}).get('text', '')}"
        elif t == "emoji":
            text = node.get("attrs", {}).get("text", node.get("attrs", {}).get("shortName", ""))
        elif "content" in node:
            text = _render_inline(node["content"])
        else:
            text = ""
        parts.append(text)
    return "".join(parts)


def _render_table(node: dict) -> str:
    rows = node.get("content", [])
    if not rows:
        return ""
    result = []
    for i, row in enumerate(rows):
        cells = row.get("content", [])
        cell_texts = [" ".join(_render_block(c) for c in cell.get("content", [])) for cell in cells]
        result.append("| " + " | ".join(cell_texts) + " |")
        if i == 0:
            result.append("| " + " | ".join("---" for _ in cell_texts) + " |")
    return "\n".join(result)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def _get_myself_account_id() -> str:
    result = _request("GET", "/myself")
    account_id = result.get("accountId", "")
    if not account_id:
        print("Error: could not resolve current user accountId", file=sys.stderr)
        sys.exit(1)
    return account_id


def cmd_create_issue(args):
    description = None
    if args.description_file:
        description = _md_to_adf(Path(args.description_file).read_text())
    elif args.description:
        description = _md_to_adf(args.description)

    payload: dict = {"fields": {
        "project": {"key": args.project},
        "summary": args.summary,
        "issuetype": {"name": args.issue_type},
    }}
    if description:
        payload["fields"]["description"] = description

    if args.assignee_self or _env("JIRA_ASSIGN_SELF").lower() == "true":
        payload["fields"]["assignee"] = {"id": _get_myself_account_id()}

    parent = args.parent or _env("JIRA_PARENT_EPIC")
    if parent:
        payload["fields"]["parent"] = {"key": parent}

    result = _request("POST", "/issue", payload)
    key = result.get("key", "")
    print(json.dumps({"key": key, "url": f"{_jira_url()}/browse/{key}"}))


def cmd_update_issue(args):
    payload: dict = {"fields": {}}

    if args.summary:
        payload["fields"]["summary"] = args.summary

    desc_text = None
    if args.description_file:
        desc_text = Path(args.description_file).read_text()
    elif args.description:
        desc_text = args.description
    if desc_text is not None:
        new_adf = _md_to_adf(desc_text)
        if args.append:
            current = _request("GET", f"/issue/{args.issue_key}",
                               params={"fields": "description"})
            existing = (current.get("fields") or {}).get("description")
            existing_content = existing.get("content", []) if existing else []
            combined = list(existing_content)
            if existing_content:
                combined.append({"type": "rule"})
            combined.extend(new_adf.get("content", []))
            new_adf = {"type": "doc", "version": 1, "content": combined}
        payload["fields"]["description"] = new_adf

    if not payload["fields"]:
        print("Error: nothing to update", file=sys.stderr)
        sys.exit(1)

    _request("PUT", f"/issue/{args.issue_key}", payload)
    print(json.dumps({"key": args.issue_key, "url": f"{_jira_url()}/browse/{args.issue_key}", "updated": True}))


def cmd_get_issue(args):
    fields = "summary,status,assignee,priority,labels,description,issuetype,issuelinks,created,updated,reporter"
    result = _request("GET", f"/issue/{args.issue_key}", params={"fields": fields})
    f = result.get("fields", {})

    # Convert ADF description to markdown
    desc_raw = f.get("description")
    description = _adf_to_md(desc_raw) if desc_raw else ""

    # Format issue links
    links = []
    for link in f.get("issuelinks") or []:
        link_type = link.get("type", {})
        if "outwardIssue" in link:
            target = link["outwardIssue"]
            direction = link_type.get("outward", "")
        elif "inwardIssue" in link:
            target = link["inwardIssue"]
            direction = link_type.get("inward", "")
        else:
            continue
        links.append({
            "id": link.get("id"),
            "type": link_type.get("name"),
            "direction": direction,
            "issue": target.get("key"),
            "summary": target.get("fields", {}).get("summary"),
        })

    assignee = f.get("assignee")
    reporter = f.get("reporter")

    output = {
        "key": result.get("key"),
        "summary": f.get("summary"),
        "status": f.get("status", {}).get("name"),
        "issue_type": f.get("issuetype", {}).get("name"),
        "priority": (f.get("priority") or {}).get("name"),
        "assignee": assignee.get("displayName") if assignee else None,
        "reporter": reporter.get("displayName") if reporter else None,
        "labels": f.get("labels", []),
        "created": f.get("created"),
        "updated": f.get("updated"),
        "description": description,
        "links": links,
        "url": f"{_jira_url()}/browse/{result.get('key')}",
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


def cmd_search(args):
    fields_list = [f.strip() for f in (args.fields or "summary,status,assignee,priority,issuetype").split(",")]
    payload: dict = {
        "jql": args.jql,
        "fields": fields_list,
        "maxResults": args.limit,
    }
    if args.next_page_token:
        payload["nextPageToken"] = args.next_page_token
    result = _request("POST", "/search/jql", payload)

    issues = []
    for issue in result.get("issues", []):
        f = issue.get("fields", {})
        assignee = f.get("assignee")
        issues.append({
            "key": issue.get("key"),
            "summary": f.get("summary"),
            "status": (f.get("status") or {}).get("name"),
            "issue_type": (f.get("issuetype") or {}).get("name"),
            "priority": (f.get("priority") or {}).get("name"),
            "assignee": assignee.get("displayName") if assignee else None,
            "url": f"{_jira_url()}/browse/{issue.get('key')}",
        })

    output: dict = {"issues": issues}
    next_token = result.get("nextPageToken")
    if next_token:
        output["next_page_token"] = next_token
    print(json.dumps(output, ensure_ascii=False, indent=2))


def cmd_get_transitions(args):
    result = _request("GET", f"/issue/{args.issue_key}/transitions")
    transitions = [{"id": t["id"], "name": t["name"]} for t in result.get("transitions", [])]
    print(json.dumps({"issue_key": args.issue_key, "transitions": transitions}, indent=2))


def cmd_transition(args):
    # Resolve transition by name
    result = _request("GET", f"/issue/{args.issue_key}/transitions")
    target = None
    for t in result.get("transitions", []):
        if t["name"].lower() == args.to.lower():
            target = t
            break
    if not target:
        names = [t["name"] for t in result.get("transitions", [])]
        print(f"Error: transition '{args.to}' not found. Available: {names}", file=sys.stderr)
        sys.exit(1)

    _request("POST", f"/issue/{args.issue_key}/transitions", {"transition": {"id": target["id"]}})
    print(json.dumps({"key": args.issue_key, "transitioned_to": target["name"]}))


def cmd_get_link_types(args):
    result = _request("GET", "/issueLinkType")
    types = [{"name": t["name"], "inward": t["inward"], "outward": t["outward"]}
             for t in result.get("issueLinkTypes", [])]
    print(json.dumps({"link_types": types}, indent=2))


def cmd_link_issue(args):
    payload = {
        "type": {"name": args.type},
        "inwardIssue": {"key": args.inward},
        "outwardIssue": {"key": args.outward},
    }
    _request("POST", "/issueLink", payload)
    print(json.dumps({"linked": True, "type": args.type,
                       "inward": args.inward, "outward": args.outward}))


def cmd_remove_link(args):
    _request("DELETE", f"/issueLink/{args.link_id}")
    print(json.dumps({"removed": True, "link_id": args.link_id}))


def cmd_get_comments(args):
    params: dict = {"maxResults": args.limit, "orderBy": "-created"}
    if args.start_at:
        params["startAt"] = args.start_at
    result = _request("GET", f"/issue/{args.issue_key}/comment", params=params)

    comments = []
    for c in result.get("comments", []):
        body_adf = c.get("body")
        comments.append({
            "id": c.get("id"),
            "author": (c.get("author") or {}).get("displayName"),
            "created": c.get("created"),
            "updated": c.get("updated"),
            "body": _adf_to_md(body_adf) if body_adf else "",
        })

    output: dict = {
        "issue_key": args.issue_key,
        "total": result.get("total", 0),
        "comments": comments,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


def cmd_get_comment(args):
    result = _request("GET", f"/issue/{args.issue_key}/comment/{args.comment_id}")
    body_adf = result.get("body")
    output = {
        "id": result.get("id"),
        "issue_key": args.issue_key,
        "author": (result.get("author") or {}).get("displayName"),
        "created": result.get("created"),
        "updated": result.get("updated"),
        "body": _adf_to_md(body_adf) if body_adf else "",
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


def cmd_add_remote_link(args):
    payload: dict = {"object": {"url": args.url, "title": args.title}}
    if args.icon_url:
        payload["object"]["icon"] = {"url16x16": args.icon_url}
    result = _request("POST", f"/issue/{args.issue_key}/remotelink", payload)
    print(json.dumps({"id": result.get("id"), "issue_key": args.issue_key, "url": args.url}))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    _load_env()
    parser = argparse.ArgumentParser(description="Jira CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    # create-issue
    p = sub.add_parser("create-issue")
    p.add_argument("--project", required=True)
    p.add_argument("--summary", required=True)
    p.add_argument("--issue-type", default="Bug")
    p.add_argument("--description", default="")
    p.add_argument("--description-file", default="")
    p.add_argument("--assignee-self", action="store_true", default=False)
    p.add_argument("--parent", default="")
    p.set_defaults(func=cmd_create_issue)

    # update-issue
    p = sub.add_parser("update-issue")
    p.add_argument("issue_key")
    p.add_argument("--summary", default="")
    p.add_argument("--description", default="")
    p.add_argument("--description-file", default="")
    p.add_argument("--append", action="store_true", default=False,
                   help="Append description below existing content (separated by a rule) instead of replacing")
    p.set_defaults(func=cmd_update_issue)

    # get-issue
    p = sub.add_parser("get-issue")
    p.add_argument("issue_key")
    p.set_defaults(func=cmd_get_issue)

    # search
    p = sub.add_parser("search")
    p.add_argument("jql")
    p.add_argument("--fields", default="")
    p.add_argument("--limit", type=int, default=10)
    p.add_argument("--next-page-token", default="")
    p.set_defaults(func=cmd_search)

    # get-transitions
    p = sub.add_parser("get-transitions")
    p.add_argument("issue_key")
    p.set_defaults(func=cmd_get_transitions)

    # transition
    p = sub.add_parser("transition")
    p.add_argument("issue_key")
    p.add_argument("--to", required=True)
    p.set_defaults(func=cmd_transition)

    # get-link-types
    p = sub.add_parser("get-link-types")
    p.set_defaults(func=cmd_get_link_types)

    # link-issue
    p = sub.add_parser("link-issue")
    p.add_argument("--inward", required=True, help="Inward issue key (e.g. TSLA-100)")
    p.add_argument("--outward", required=True, help="Outward issue key (e.g. TSLA-200)")
    p.add_argument("--type", required=True, help="Link type name (e.g. Blocks)")
    p.set_defaults(func=cmd_link_issue)

    # remove-link
    p = sub.add_parser("remove-link")
    p.add_argument("link_id")
    p.set_defaults(func=cmd_remove_link)

    # get-comments
    p = sub.add_parser("get-comments")
    p.add_argument("issue_key")
    p.add_argument("--limit", type=int, default=20)
    p.add_argument("--start-at", type=int, default=0)
    p.set_defaults(func=cmd_get_comments)

    # get-comment (single, by ID)
    p = sub.add_parser("get-comment")
    p.add_argument("issue_key")
    p.add_argument("comment_id")
    p.set_defaults(func=cmd_get_comment)

    # add-remote-link
    p = sub.add_parser("add-remote-link")
    p.add_argument("issue_key")
    p.add_argument("--url", required=True)
    p.add_argument("--title", required=True)
    p.add_argument("--icon-url", default="")
    p.set_defaults(func=cmd_add_remote_link)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
