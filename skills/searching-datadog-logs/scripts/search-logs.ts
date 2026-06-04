#!/usr/bin/env bun
/**
 * Datadog Logs Search Script
 *
 * Usage:
 *   npx -y bun scripts/search-logs.ts --query "service:cupixworks-api status:error" --from "now-1h"
 *   npx -y bun scripts/search-logs.ts --query "service:cupixworks-worker @class:SomeJob" --from "now-24h" --limit 100
 *   npx -y bun scripts/search-logs.ts --url "https://app.datadoghq.com/logs?query=...&from_ts=123&to_ts=456"
 */

import { parseArgs } from "util";

const BASE_URL = "https://api.datadoghq.com";
const KST_OFFSET = 9 * 60 * 60 * 1000; // UTC+9

interface SearchOptions {
  query: string;
  from: string;
  to: string;
  limit: number;
  cursor?: string;
  sort: "timestamp" | "-timestamp";
}

interface LogEntry {
  id: string;
  attributes: {
    timestamp: string;
    status: string;
    message: string;
    attributes?: Record<string, unknown>;
    tags?: string[];
  };
}

interface SearchResponse {
  data: LogEntry[];
  meta?: {
    page?: {
      after?: string;
    };
  };
}

function getCredentials(): { apiKey: string; appKey: string } {
  const apiKey = process.env.CLAUDE_PLUGIN_OPTION_DATADOG_API_KEY || process.env.DATADOG_API_KEY;
  const appKey = process.env.CLAUDE_PLUGIN_OPTION_DATADOG_APP_KEY || process.env.DATADOG_APP_KEY;

  if (!apiKey || !appKey) {
    console.error("Error: Missing Datadog credentials. Configure via plugin settings or set DATADOG_API_KEY and DATADOG_APP_KEY env vars.");
    process.exit(1);
  }

  return { apiKey, appKey };
}

function parseDatadogUrl(url: string): { query: string; from: string; to: string } | null {
  try {
    const parsed = new URL(url);
    const query = parsed.searchParams.get("query");
    const fromTs = parsed.searchParams.get("from_ts");
    const toTs = parsed.searchParams.get("to_ts");

    if (!query) {
      console.error("Error: URL missing 'query' parameter");
      return null;
    }

    // Convert milliseconds timestamps to ISO 8601
    const from = fromTs
      ? new Date(parseInt(fromTs)).toISOString()
      : "now-1h";
    const to = toTs
      ? new Date(parseInt(toTs)).toISOString()
      : "now";

    return {
      query: decodeURIComponent(query),
      from,
      to,
    };
  } catch (e) {
    console.error("Error: Invalid URL format");
    return null;
  }
}

async function searchLogs(options: SearchOptions): Promise<SearchResponse> {
  const { apiKey, appKey } = getCredentials();

  const body = {
    filter: {
      query: options.query,
      from: options.from,
      to: options.to,
    },
    sort: options.sort,
    page: {
      limit: options.limit,
      ...(options.cursor && { cursor: options.cursor }),
    },
  };

  const response = await fetch(`${BASE_URL}/api/v2/logs/events/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "DD-API-KEY": apiKey,
      "DD-APPLICATION-KEY": appKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Error: Datadog API returned ${response.status}`);
    console.error(errorText);
    process.exit(1);
  }

  return response.json();
}

function formatTimestamp(isoString: string, useUtc: boolean): string {
  if (useUtc) {
    return isoString;
  }
  // Convert to KST (UTC+9)
  const date = new Date(isoString);
  const kstDate = new Date(date.getTime() + KST_OFFSET);
  const year = kstDate.getUTCFullYear();
  const month = String(kstDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kstDate.getUTCDate()).padStart(2, "0");
  const hours = String(kstDate.getUTCHours()).padStart(2, "0");
  const minutes = String(kstDate.getUTCMinutes()).padStart(2, "0");
  const seconds = String(kstDate.getUTCSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} KST`;
}

function formatLogEntry(entry: LogEntry, useUtc: boolean): object {
  return {
    timestamp: formatTimestamp(entry.attributes.timestamp, useUtc),
    status: entry.attributes.status,
    message: entry.attributes.message,
    ...(entry.attributes.attributes?.class && { class: entry.attributes.attributes.class }),
    ...(entry.attributes.attributes?.function && { function: entry.attributes.attributes.function }),
    ...(entry.attributes.attributes?.error && { error: entry.attributes.attributes.error }),
  };
}

function printHelp() {
  console.log(`
Datadog Logs Search

USAGE:
  npx -y bun search-logs.ts [OPTIONS]

OPTIONS:
  --query, -q     Search query (required unless --url is provided)
                  Examples:
                    "service:cupixworks-api status:error"
                    "service:cupixworks-worker @class:SomeJob"
                    "service:cupixworks-api \\"ActiveRecord::RecordNotFound\\""

  --url           Parse query from Datadog URL (alternative to --query)
                  Extracts query, from_ts, to_ts from URL

  --from, -f      Start time (default: "now-1h")
                  Relative: now-15m, now-1h, now-6h, now-24h, now-7d, now-14d
                  Absolute: 2025-01-15T00:00:00Z

  --to, -t        End time (default: "now")

  --limit, -l     Max results (default: 50, max: 1000)

  --cursor, -c    Pagination cursor from previous response

  --sort, -s      Sort order: "timestamp" (asc) or "-timestamp" (desc, default)

  --utc           Output timestamps in UTC (default: KST)

  --raw           Output raw JSON response

  --help, -h      Show this help

EXAMPLES:
  # Recent API errors
  npx -y bun search-logs.ts -q "service:cupixworks-api status:error"

  # Worker errors in last 24h
  npx -y bun search-logs.ts -q "service:cupixworks-worker status:error" -f "now-24h"

  # Search by class
  npx -y bun search-logs.ts -q "service:cupixworks-api @class:OrdersController"

  # From Datadog URL
  npx -y bun search-logs.ts --url "https://app.datadoghq.com/logs?query=service%3Acupixworks-api&from_ts=123&to_ts=456"

  # Raw JSON output for further processing
  npx -y bun search-logs.ts -q "service:cupixworks-api" --raw
`);
}

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      query: { type: "string", short: "q" },
      url: { type: "string" },
      from: { type: "string", short: "f", default: "now-1h" },
      to: { type: "string", short: "t", default: "now" },
      limit: { type: "string", short: "l", default: "50" },
      cursor: { type: "string", short: "c" },
      sort: { type: "string", short: "s", default: "-timestamp" },
      utc: { type: "boolean", default: false },
      raw: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  let query = values.query;
  let from = values.from!;
  let to = values.to!;

  // Parse from URL if provided
  if (values.url) {
    const parsed = parseDatadogUrl(values.url);
    if (!parsed) {
      process.exit(1);
    }
    query = parsed.query;
    from = parsed.from;
    to = parsed.to;
  }

  if (!query) {
    console.error("Error: --query or --url is required");
    console.error("Use --help for usage information");
    process.exit(1);
  }

  const options: SearchOptions = {
    query,
    from,
    to,
    limit: Math.min(parseInt(values.limit!), 1000),
    cursor: values.cursor,
    sort: values.sort as "timestamp" | "-timestamp",
  };

  console.error(`Searching: ${query}`);
  console.error(`Time range: ${from} to ${to}`);
  console.error(`Limit: ${options.limit}`);
  console.error("");

  const result = await searchLogs(options);

  if (values.raw) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Found ${result.data.length} logs:\n`);

    const useUtc = values.utc ?? false;
    for (const entry of result.data) {
      console.log(JSON.stringify(formatLogEntry(entry, useUtc), null, 2));
      console.log("---");
    }

    if (result.meta?.page?.after) {
      console.error(`\nMore results available. Use --cursor "${result.meta.page.after}" to continue`);
    }
  }
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
