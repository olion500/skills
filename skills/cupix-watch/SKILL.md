---
name: cupix-watch
description: Search Cupix Watch (Kibana/Elasticsearch) application logs at watch.cupix.com. Use when the user asks to search logs, find errors, debug processing issues, or investigate service behavior. Triggers on keywords like "log", "watch", "kibana", "error log", service names (skat, pano, api, worker, vista), or mentions of cupix processing pipelines.
---

# Cupix Watch Log Search

Search application logs from `watch.cupix.com` via script.

**Script:** `${SKILL_DIR}/scripts/search-watch.ts`

```bash
npx -y bun ${SKILL_DIR}/scripts/search-watch.ts -- [OPTIONS]
```

## Approach

Before searching, determine:

1. **Which service?** → Use `--service` keyword. If unsure, `--resolve` or `--list-services` first.
2. **What signal?** → Error? Specific ID? Pattern? This decides your `--lucene` query.
3. **What time window?** → Always set `--time-from`. No time range = millions of hits = useless.

When results are too many → narrow time > add filters > limit fields.
When results are zero → verify keyword with `--resolve` > widen time range > check Lucene syntax.

## Scenario Guide

| Situation | Command pattern |
|-----------|----------------|
| Specific capture errors | `--service X -q "capture.id:NNN" -F "level:error" --time-from now-24h` |
| Service outage investigation | `--service X -F "level:error" --time-from now-1h -s 50` |
| Search by log message | `--service X -q 'message:"out of memory"' --time-from now-24h` |
| Unknown service name | `--resolve keyword` first, then search |
| Pipeline trace (full capture flow) | Search each stage in order: `capture-pre` → `skat` → `pano` → `capture-post` |
| CupixVista (not CupixWorks) | Prefix keyword with `vista`: `--service "vista skat"` |

## NEVER

- NEVER omit `--time-from` — without time range, query hits entire log history, response is slow and results meaningless
- NEVER filter with `service` — use `service.keyword` (the `.keyword` suffix is the exact-match variant; without it, Elasticsearch tokenizes the value and partial matches)
- NEVER use `--all-fields` by default — infra noise (agent, ecs, host, log, tags) buries actual log content. Only use when explicitly investigating infrastructure
- NEVER search broad index with just `-q "*"` — always include service filter or specific query. A bare wildcard on `logstash-processing*` returns random logs from all services
- NEVER guess the `service.keyword` value — always use `--resolve` or `--service`. The actual values are non-obvious (e.g., `cupixworks-captue-skatmaster-arm-instance` — note the typo `captue`, it's in the real data)

## Quick Start

```bash
# Search by service keyword (auto-resolves index + service filter)
npx -y bun ${SKILL_DIR}/scripts/search-watch.ts -- --service skat -q "level:error" --time-from now-1h

# Search API logs for specific capture
npx -y bun ${SKILL_DIR}/scripts/search-watch.ts -- --service api -q "capture.id:69697" --time-from now-7d

# Search with explicit index and filters
npx -y bun ${SKILL_DIR}/scripts/search-watch.ts -- -i logstash-processing* -F "service.keyword:cupixworks-captue-skatmaster-arm-instance" -F "level:error" --time-from now-1h

# Resolve a service keyword
npx -y bun ${SKILL_DIR}/scripts/search-watch.ts -- --resolve skat

# List available services
npx -y bun ${SKILL_DIR}/scripts/search-watch.ts -- --list-services
```

## Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--service` | | Service keyword (auto-resolves index + filter) | - |
| `--index` | `-i` | Index pattern (required if no --service) | - |
| `--lucene` | `-q` | Lucene query string | `*` |
| `--filter` | `-F` | Term filter `field:value` (repeatable) | - |
| `--time-from` | | Start time (`now-1h`, ISO 8601) | - |
| `--time-to` | | End time (`now`, ISO 8601) | - |
| `--size` | `-s` | Max results (1-200) | `20` |
| `--sort-field` | | Sort field | `@timestamp` |
| `--sort-order` | | `desc` or `asc` | `desc` |
| `--fields` | `-f` | Comma-separated fields to return | - |
| `--all-fields` | | Return all fields (no infra noise filter) | `false` |
| `--resolve` | | Resolve keyword without searching | - |
| `--list-services` | | List all service keywords | - |
| `--list-indices` | | List index patterns from Kibana | - |
| `--test-connection` | | Test Kibana connectivity | - |

## Common Service Keywords

| Keyword | Service | Index |
|---------|---------|-------|
| `skat` | SKAT master processing | `logstash-processing*` |
| `pano` | Panorama post-processor | `logstash-processing*` |
| `3d` | 3D reconstruction | `logstash-processing*` |
| `api` | API server logs | `logstash-api_log*` |
| `worker` | Worker service | `logstash-unknown*` |
| `vista skat` | CupixVista SKAT | `logstash-processing*` |

Use `--list-services` for the full list. Prefix with `vista` for CupixVista services.

## Index Patterns

| Pattern | Content |
|---------|---------|
| `logstash-processing*` | Processing (skat, pano, 3d-recon, refinement) |
| `logstash-agents*` | Agents (preprocessor, postprocessor, complete) |
| `logstash-api_log*` | API server logs |
| `logstash-api_request*` | API request logs |
| `logstash-unknown*` | Uncategorized (worker, aerial-map) |

## Troubleshooting

- **401 Unauthorized** → Check `KIBANA_USERNAME` / `KIBANA_PASSWORD` env vars. Restart Claude to reload `.env`
- **Empty results** → Verify service keyword with `--resolve`. Check field names: `capture.id` not `capture_id` (nested vs flat). Widen `--time-from`
- **Truncated output** → Add `--fields "@timestamp,message,level"` or reduce `--size`

## Credentials

Requires `KIBANA_USERNAME` and `KIBANA_PASSWORD` environment variables.
