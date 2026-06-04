#!/usr/bin/env bun
/**
 * Datadog Metrics Query Script
 *
 * Usage:
 *   npx -y bun scripts/query-metrics.ts --query "avg:system.cpu.user{service:cupixworks-api}" --from "1h"
 *   npx -y bun scripts/query-metrics.ts --search "cpu"
 *   npx -y bun scripts/query-metrics.ts --list
 */

import { parseArgs } from "util";

const BASE_URL = "https://api.datadoghq.com";
const KST_OFFSET = 9 * 60 * 60 * 1000; // UTC+9

function formatTimestamp(ms: number, useUtc: boolean): string {
  if (useUtc) {
    return new Date(ms).toISOString();
  }
  const kstDate = new Date(ms + KST_OFFSET);
  const year = kstDate.getUTCFullYear();
  const month = String(kstDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kstDate.getUTCDate()).padStart(2, "0");
  const hours = String(kstDate.getUTCHours()).padStart(2, "0");
  const minutes = String(kstDate.getUTCMinutes()).padStart(2, "0");
  const seconds = String(kstDate.getUTCSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} KST`;
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

function parseTimeRange(range: string): { from: number; to: number } {
  const now = Date.now();
  const to = now;

  // Parse relative time like "1h", "24h", "7d"
  const match = range.match(/^(\d+)(m|h|d)$/);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2];
    const multiplier = unit === "m" ? 60 * 1000
      : unit === "h" ? 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;
    return { from: now - value * multiplier, to };
  }

  // Try parsing as absolute timestamp
  const timestamp = parseInt(range);
  if (!isNaN(timestamp)) {
    return { from: timestamp, to };
  }

  console.error(`Invalid time range: ${range}. Use format like "1h", "24h", "7d"`);
  process.exit(1);
}

async function queryTimeseries(
  query: string,
  from: number,
  to: number,
  interval?: number
): Promise<unknown> {
  const { apiKey, appKey } = getCredentials();

  const body = {
    data: {
      type: "timeseries_request",
      attributes: {
        formulas: [{ formula: "query1" }],
        queries: [
          {
            data_source: "metrics",
            query,
            name: "query1",
          },
        ],
        from,
        to,
        ...(interval && { interval }),
      },
    },
  };

  const response = await fetch(`${BASE_URL}/api/v2/query/timeseries`, {
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

async function searchMetrics(searchQuery: string): Promise<unknown> {
  const { apiKey, appKey } = getCredentials();

  const response = await fetch(
    `${BASE_URL}/api/v1/search?q=${encodeURIComponent(searchQuery)}`,
    {
      method: "GET",
      headers: {
        "DD-API-KEY": apiKey,
        "DD-APPLICATION-KEY": appKey,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Error: Datadog API returned ${response.status}`);
    console.error(errorText);
    process.exit(1);
  }

  return response.json();
}

async function listActiveMetrics(): Promise<unknown> {
  const { apiKey, appKey } = getCredentials();
  const oneHourAgo = Math.floor((Date.now() - 60 * 60 * 1000) / 1000);

  const response = await fetch(`${BASE_URL}/api/v1/metrics?from=${oneHourAgo}`, {
    method: "GET",
    headers: {
      "DD-API-KEY": apiKey,
      "DD-APPLICATION-KEY": appKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Error: Datadog API returned ${response.status}`);
    console.error(errorText);
    process.exit(1);
  }

  return response.json();
}

async function getMetricMetadata(metricName: string): Promise<unknown> {
  const { apiKey, appKey } = getCredentials();

  const response = await fetch(`${BASE_URL}/api/v1/metrics/${metricName}`, {
    method: "GET",
    headers: {
      "DD-API-KEY": apiKey,
      "DD-APPLICATION-KEY": appKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Error: Datadog API returned ${response.status}`);
    console.error(errorText);
    process.exit(1);
  }

  return response.json();
}

function printHelp() {
  console.log(`
Datadog Metrics Query

USAGE:
  npx -y bun query-metrics.ts [OPTIONS]

MODES:
  --query, -q     Query timeseries data (requires --from)
  --search        Search for metrics by keyword
  --list          List active metrics
  --metadata      Get metadata for a specific metric

OPTIONS:
  --from, -f      Time range for queries (default: "1h")
                  Examples: 1h, 24h, 7d

  --interval, -i  Data point interval in seconds (optional)

  --utc           Output timestamps in UTC (default: KST)

EXAMPLES:
  # Query CPU usage for last hour
  npx -y bun query-metrics.ts -q "avg:system.cpu.user{service:cupixworks-api}" -f "1h"

  # Query with custom interval
  npx -y bun query-metrics.ts -q "sum:rails.request.count{service:cupixworks-api}.as_rate()" -f "24h" -i 300

  # Search for metrics
  npx -y bun query-metrics.ts --search "cpu"
  npx -y bun query-metrics.ts --search "service:cupixworks-api"

  # List active metrics
  npx -y bun query-metrics.ts --list

  # Get metric metadata
  npx -y bun query-metrics.ts --metadata "system.cpu.user"

COMMON METRIC QUERIES:
  avg:system.cpu.user{service:cupixworks-api}
  avg:system.mem.used{service:cupixworks-api}
  sum:rails.request.count{service:cupixworks-api}.as_rate()
  sum:rails.request.errors{service:cupixworks-api}.as_rate()
  avg:postgresql.query.time{service:cupixworks-api}
`);
}

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      query: { type: "string", short: "q" },
      search: { type: "string" },
      list: { type: "boolean", default: false },
      metadata: { type: "string" },
      from: { type: "string", short: "f", default: "1h" },
      interval: { type: "string", short: "i" },
      utc: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  // Query timeseries
  if (values.query) {
    const { from, to } = parseTimeRange(values.from!);
    const interval = values.interval ? parseInt(values.interval) : undefined;
    const useUtc = values.utc ?? false;

    console.error(`Query: ${values.query}`);
    console.error(`Time range: ${formatTimestamp(from, useUtc)} to ${formatTimestamp(to, useUtc)}`);
    console.error("");

    const result = await queryTimeseries(values.query, from, to, interval);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Search metrics
  if (values.search) {
    console.error(`Searching metrics: ${values.search}`);
    console.error("");
    const result = await searchMetrics(values.search);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // List active metrics
  if (values.list) {
    console.error("Listing active metrics...");
    console.error("");
    const result = await listActiveMetrics();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Get metric metadata
  if (values.metadata) {
    console.error(`Getting metadata for: ${values.metadata}`);
    console.error("");
    const result = await getMetricMetadata(values.metadata);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.error("Error: No operation specified");
  console.error("Use --help for usage information");
  process.exit(1);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
