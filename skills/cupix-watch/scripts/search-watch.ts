#!/usr/bin/env bun
/**
 * Cupix Watch (Kibana/Elasticsearch) Log Search
 *
 * Usage:
 *   npx -y bun search-watch.ts --service skat --lucene "level:error" --time-from now-1h
 *   npx -y bun search-watch.ts -i logstash-processing* --lucene "capture.id:69697"
 *   npx -y bun search-watch.ts --service api --filter "level:error" -s 50
 *   npx -y bun search-watch.ts --resolve skat
 *   npx -y bun search-watch.ts --list-services
 *   npx -y bun search-watch.ts --list-indices
 */

import { parseArgs } from "util";

const BASE_URL = "https://watch.cupix.com";
const CHARACTER_LIMIT = 25000;
const DEFAULT_SIZE = 20;
const MAX_SIZE = 200;

const DEFAULT_EXCLUDE_FIELDS = [
  "agent", "ecs", "input", "tags", "host", "log", "@version",
  "ddsource", "ddtags", "session",
];

// ── Service Registry ──

interface ServiceEntry {
  keywords: string[];
  index: string;
  service: string;
  product: "cupixworks" | "cupixvista";
  description: string;
}

const SERVICE_REGISTRY: ServiceEntry[] = [
  // processing (logstash-processing*)
  { keywords: ["3d", "3d-recon", "reconstruction", "3dreconstruction", "densemapper"], index: "logstash-processing*", service: "cupixworks-capture-3dreconstruction-instance", product: "cupixworks", description: "CupixWorks 3D reconstruction" },
  { keywords: ["pano", "pano-postprocessor", "pano-post"], index: "logstash-processing*", service: "cupixworks-pano-postprocessor-instance", product: "cupixworks", description: "CupixWorks panorama post-processor" },
  { keywords: ["skat", "skat-master", "skatmaster", "scenemapper"], index: "logstash-processing*", service: "cupixworks-captue-skatmaster-arm-instance", product: "cupixworks", description: "CupixWorks SKAT master" },
  { keywords: ["refinement", "capture-refinement"], index: "logstash-processing*", service: "cupixworks-capture-refinement-arm-instance", product: "cupixworks", description: "CupixWorks capture refinement" },
  { keywords: ["vista 3d", "vista reconstruction", "vista 3dreconstruction"], index: "logstash-processing*", service: "cupixvista-capture-3dreconstruction-instance", product: "cupixvista", description: "CupixVista 3D reconstruction" },
  { keywords: ["pix-genie", "pixgenie", "genie"], index: "logstash-processing*", service: "cupixworks-pix-genie-preprocessor-instance", product: "cupixworks", description: "CupixWorks Pix Genie preprocessor" },
  { keywords: ["vista skat", "vista skatmaster", "vista scenemapper"], index: "logstash-processing*", service: "cupixvista-captue-skatmaster-arm-instance", product: "cupixvista", description: "CupixVista SKAT master" },
  { keywords: ["vista pano", "vista pano-postprocessor"], index: "logstash-processing*", service: "cupixvista-pano-postprocessor-instance", product: "cupixvista", description: "CupixVista panorama post-processor" },
  { keywords: ["sitetrack-instance", "sitetrack-processing"], index: "logstash-processing*", service: "cupixworks-sitetrack-instance", product: "cupixworks", description: "CupixWorks SiteTrack processing" },
  { keywords: ["deviation-bimvalidation", "bimvalidation"], index: "logstash-processing*", service: "cupixworks-deviation-bimvalidation-instance", product: "cupixworks", description: "CupixWorks deviation BIM validation" },
  // agents (logstash-agents*)
  { keywords: ["sitetrack-postprocessor", "sitetrack-post"], index: "logstash-agents*", service: "cupixworks-sitetrack-postprocessor-agent", product: "cupixworks", description: "SiteTrack post-processor agent" },
  { keywords: ["capture-postprocessor", "capture-post"], index: "logstash-agents*", service: "cupixworks-capture-postprocessor-agent", product: "cupixworks", description: "Capture post-processor agent" },
  { keywords: ["floorplan"], index: "logstash-agents*", service: "cupixworks-any-floorplan-agent", product: "cupixworks", description: "Floorplan agent" },
  { keywords: ["complete"], index: "logstash-agents*", service: "cupixworks-any-complete-agent", product: "cupixworks", description: "Complete agent" },
  { keywords: ["compute"], index: "logstash-agents*", service: "cupixworks-any-compute-agent", product: "cupixworks", description: "Compute agent" },
  { keywords: ["voxel"], index: "logstash-agents*", service: "cupixworks-any-voxel-agent", product: "cupixworks", description: "Voxel agent" },
  { keywords: ["vista complete"], index: "logstash-agents*", service: "cupixvista-any-complete-agent", product: "cupixvista", description: "CupixVista complete agent" },
  { keywords: ["capture-preprocessor", "capture-pre"], index: "logstash-agents*", service: "cupixworks-capture-preprocessor-agent", product: "cupixworks", description: "Capture preprocessor agent" },
  { keywords: ["potree"], index: "logstash-agents*", service: "cupixworks-any-potree-agent", product: "cupixworks", description: "Potree agent" },
  { keywords: ["vista capture-postprocessor", "vista capture-post"], index: "logstash-agents*", service: "cupixvista-capture-postprocessor-agent", product: "cupixvista", description: "CupixVista capture post-processor agent" },
  { keywords: ["sitetrack-preprocessor", "sitetrack-pre"], index: "logstash-agents*", service: "cupixworks-sitetrack-preprocessor-agent", product: "cupixworks", description: "SiteTrack preprocessor agent" },
  { keywords: ["vista voxel"], index: "logstash-agents*", service: "cupixvista-any-voxel-agent", product: "cupixvista", description: "CupixVista voxel agent" },
  { keywords: ["thumbnail"], index: "logstash-agents*", service: "cupixworks-any-thumbnail-agent", product: "cupixworks", description: "Thumbnail agent" },
  { keywords: ["singleshot"], index: "logstash-agents*", service: "cupixworks-capture-singleshot-agent", product: "cupixworks", description: "Capture singleshot agent" },
  { keywords: ["vista compute"], index: "logstash-agents*", service: "cupixvista-any-compute-agent", product: "cupixvista", description: "CupixVista compute agent" },
  { keywords: ["bimrevision", "bim-revision", "bim"], index: "logstash-agents*", service: "cupixworks-any-bimrevision-agent", product: "cupixworks", description: "BIM revision agent" },
  { keywords: ["vista capture-preprocessor", "vista capture-pre"], index: "logstash-agents*", service: "cupixvista-capture-preprocessor-agent", product: "cupixvista", description: "CupixVista capture preprocessor agent" },
  { keywords: ["sitetrack-skipped"], index: "logstash-agents*", service: "cupixworks-sitetrack-skipped-agent", product: "cupixworks", description: "SiteTrack skipped agent" },
  { keywords: ["room"], index: "logstash-agents*", service: "cupixworks-any-room-agent", product: "cupixworks", description: "Room agent" },
  { keywords: ["forge"], index: "logstash-agents*", service: "cupixworks-any-forge-agent", product: "cupixworks", description: "Forge agent" },
  { keywords: ["vista potree"], index: "logstash-agents*", service: "cupixvista-any-potree-agent", product: "cupixvista", description: "CupixVista potree agent" },
  { keywords: ["mesh"], index: "logstash-agents*", service: "cupixworks-any-mesh-agent", product: "cupixworks", description: "Mesh agent" },
  { keywords: ["vista thumbnail"], index: "logstash-agents*", service: "cupixvista-any-thumbnail-agent", product: "cupixvista", description: "CupixVista thumbnail agent" },
  { keywords: ["potree-xlarge", "potree-r1"], index: "logstash-agents*", service: "cupixworks-any-potree-r1-xlarge-agent", product: "cupixworks", description: "Potree R1 xlarge agent" },
  { keywords: ["deviation-preprocessor", "deviation-pre"], index: "logstash-agents*", service: "cupixworks-deviation-preprocessor-agent", product: "cupixworks", description: "Deviation preprocessor agent" },
  { keywords: ["deviation-postprocessor", "deviation-post"], index: "logstash-agents*", service: "cupixworks-deviation-postprocessor-agent", product: "cupixworks", description: "Deviation post-processor agent" },
  { keywords: ["si-lite"], index: "logstash-agents*", service: "cupixworks-si-lite-agent", product: "cupixworks", description: "SI lite agent" },
  // api_log (logstash-api_log*)
  { keywords: ["api", "api-server", "api-log"], index: "logstash-api_log*", service: "cupixworks-api", product: "cupixworks", description: "CupixWorks API server logs" },
  { keywords: ["vista api", "vista api-server"], index: "logstash-api_log*", service: "cupixvista-api", product: "cupixvista", description: "CupixVista API server logs" },
  { keywords: ["vista api-worker"], index: "logstash-api_log*", service: "cupixvista-api-worker", product: "cupixvista", description: "CupixVista API worker logs" },
  // api_request (logstash-api_request*)
  { keywords: ["api-request"], index: "logstash-api_request*", service: "cupixworks-api", product: "cupixworks", description: "CupixWorks API request logs" },
  { keywords: ["vista api-request"], index: "logstash-api_request*", service: "cupixvista-api", product: "cupixvista", description: "CupixVista API request logs" },
  // unknown (logstash-unknown*)
  { keywords: ["worker"], index: "logstash-unknown*", service: "cupixworks-worker", product: "cupixworks", description: "CupixWorks worker" },
  { keywords: ["aerial-map", "aerial"], index: "logstash-unknown*", service: "aerial-map-service", product: "cupixworks", description: "Aerial map service" },
];

// Pre-built keyword index
const KEYWORD_INDEX = new Map<string, ServiceEntry[]>();
for (const entry of SERVICE_REGISTRY) {
  for (const kw of entry.keywords) {
    const existing = KEYWORD_INDEX.get(kw);
    if (existing) existing.push(entry);
    else KEYWORD_INDEX.set(kw, [entry]);
  }
}

function resolveService(keyword: string): { matched: boolean; results: ServiceEntry[] } {
  const input = keyword.toLowerCase().trim();
  if (!input) return { matched: false, results: [] };

  const exact = KEYWORD_INDEX.get(input);
  if (exact) return { matched: true, results: exact };

  const hasVista = input.includes("vista");
  const pool = SERVICE_REGISTRY.filter((e) =>
    hasVista ? e.product === "cupixvista" : e.product === "cupixworks"
  );
  const matches = pool.filter((e) =>
    e.keywords.some((kw) => input.includes(kw) || kw.includes(input))
  );
  return { matched: matches.length > 0, results: matches };
}

// ── Search ──

function getCredentials(): { username: string; password: string } {
  const username = process.env.CLAUDE_PLUGIN_OPTION_KIBANA_USERNAME || process.env.KIBANA_USERNAME;
  const password = process.env.CLAUDE_PLUGIN_OPTION_KIBANA_PASSWORD || process.env.KIBANA_PASSWORD;
  if (!username || !password) {
    console.error("Error: Missing Kibana credentials. Configure via plugin settings or set KIBANA_USERNAME and KIBANA_PASSWORD env vars.");
    process.exit(1);
  }
  return { username, password };
}

async function searchLogs(opts: {
  index: string;
  query?: string;
  size: number;
  sortField: string;
  sortOrder: string;
  timeFrom?: string;
  timeTo?: string;
  filters?: Record<string, string>;
  fields?: string[];
  includeAllFields?: boolean;
}): Promise<void> {
  const { username, password } = getCredentials();

  const mustClauses: object[] = [];

  if (opts.query && opts.query !== "*") {
    mustClauses.push({ query_string: { query: opts.query } });
  }
  if (opts.timeFrom || opts.timeTo) {
    const range: Record<string, string> = {};
    if (opts.timeFrom) range.gte = opts.timeFrom;
    if (opts.timeTo) range.lte = opts.timeTo;
    mustClauses.push({ range: { "@timestamp": range } });
  }
  if (opts.filters) {
    for (const [field, value] of Object.entries(opts.filters)) {
      mustClauses.push({ term: { [field]: value } });
    }
  }

  let _source: object | boolean;
  if (opts.includeAllFields) {
    _source = true;
  } else if (opts.fields?.length) {
    _source = { includes: opts.fields };
  } else {
    _source = { excludes: DEFAULT_EXCLUDE_FIELDS };
  }

  const body = {
    params: {
      index: opts.index,
      body: {
        query: mustClauses.length > 0 ? { bool: { must: mustClauses } } : { match_all: {} },
        size: opts.size,
        sort: [{ [opts.sortField]: { order: opts.sortOrder } }],
        _source,
      },
    },
  };

  const response = await fetch(`${BASE_URL}/internal/search/es`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "kbn-xsrf": "true",
      Authorization: `Basic ${btoa(`${username}:${password}`)}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 401) console.error("Error: Authentication failed (401). Check credentials.");
    else if (status === 403) console.error("Error: Access forbidden (403).");
    else console.error(`Error: Kibana API returned ${status}`);
    process.exit(1);
  }

  const data: any = await response.json();
  const hits = data.rawResponse.hits;
  const total = typeof hits.total === "object" ? hits.total.value : hits.total;

  const output = {
    total,
    returned: hits.hits.length,
    index: opts.index,
    entries: hits.hits.map((h: any) => ({ _id: h._id, _index: h._index, ...h._source })),
  };

  let text = JSON.stringify(output, null, 2);
  if (text.length > CHARACTER_LIMIT) {
    const halfCount = Math.max(1, Math.floor(hits.hits.length / 2));
    const truncated = {
      total,
      returned: halfCount,
      truncated: true,
      truncation_message: `Truncated from ${hits.hits.length} to ${halfCount}. Use smaller --size, add --fields, or add filters.`,
      index: opts.index,
      entries: hits.hits.slice(0, halfCount).map((h: any) => ({ _id: h._id, _index: h._index, ...h._source })),
    };
    text = JSON.stringify(truncated, null, 2);
  }

  console.log(text);
}

async function listIndexPatterns(): Promise<void> {
  const { username, password } = getCredentials();
  const response = await fetch(
    `${BASE_URL}/api/saved_objects/_find?type=index-pattern&per_page=100`,
    {
      headers: {
        "kbn-xsrf": "true",
        Authorization: `Basic ${btoa(`${username}:${password}`)}`,
      },
    }
  );
  if (!response.ok) {
    console.error(`Error: Failed to fetch index patterns (${response.status})`);
    process.exit(1);
  }
  const data: any = await response.json();
  const patterns = data.saved_objects.map((o: any) => o.attributes.title);
  console.log(`Found ${patterns.length} index patterns:\n`);
  for (const p of patterns) console.log(`  ${p}`);
}

async function testConnection(): Promise<void> {
  const { username, password } = getCredentials();
  try {
    const response = await fetch(`${BASE_URL}/api/status`, {
      headers: {
        "kbn-xsrf": "true",
        Authorization: `Basic ${btoa(`${username}:${password}`)}`,
      },
    });
    if (!response.ok) {
      console.error(`Error: Kibana returned ${response.status}`);
      process.exit(1);
    }
    const data: any = await response.json();
    const version = data?.version?.number ?? "unknown";
    const status = data?.status?.overall?.state ?? "unknown";
    console.log(`Connected to Kibana (version: ${version}, status: ${status}, url: ${BASE_URL})`);
  } catch (e: any) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

// ── CLI ──

function parseFilters(filterArgs: string[]): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const f of filterArgs) {
    const idx = f.indexOf(":");
    if (idx === -1) {
      console.error(`Error: Invalid filter format '${f}'. Use field:value`);
      process.exit(1);
    }
    filters[f.slice(0, idx)] = f.slice(idx + 1);
  }
  return filters;
}

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      service: { type: "string" },
      index: { type: "string", short: "i" },
      lucene: { type: "string", short: "q" },
      filter: { type: "string", short: "F", multiple: true },
      "time-from": { type: "string" },
      "time-to": { type: "string" },
      size: { type: "string", short: "s", default: String(DEFAULT_SIZE) },
      "sort-field": { type: "string", default: "@timestamp" },
      "sort-order": { type: "string", default: "desc" },
      fields: { type: "string", short: "f" },
      "all-fields": { type: "boolean", default: false },
      resolve: { type: "string" },
      "list-services": { type: "boolean", default: false },
      "list-indices": { type: "boolean", default: false },
      "test-connection": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
Cupix Watch Log Search

USAGE:
  npx -y bun search-watch.ts [OPTIONS]

SEARCH OPTIONS:
  --service <keyword>     Resolve service keyword and auto-set index + service filter
                          Examples: skat, pano, api, worker, vista skat
  -i, --index <pattern>   Index pattern (required if no --service)
  -q, --lucene <query>    Lucene query string (e.g., "level:error", "capture.id:69697")
  -F, --filter <f:v>      Term filter (repeatable). e.g., -F "level:error" -F "service.keyword:..."
  --time-from <time>      Start time (ISO 8601 or date math: now-1h, now-24h)
  --time-to <time>        End time (ISO 8601 or date math: now)
  -s, --size <n>          Max results (1-${MAX_SIZE}, default: ${DEFAULT_SIZE})
  --sort-field <field>    Sort field (default: @timestamp)
  --sort-order <dir>      Sort order: desc or asc (default: desc)
  -f, --fields <list>     Comma-separated fields to return
  --all-fields            Return all fields (default excludes infra noise)

UTILITY:
  --resolve <keyword>     Resolve service keyword without searching
  --list-services         List all available service keywords
  --list-indices          List available index patterns from Kibana
  --test-connection       Test Kibana connectivity
  -h, --help              Show this help

EXAMPLES:
  # Search SKAT error logs in last hour
  npx -y bun search-watch.ts --service skat -q "level:error" --time-from now-1h

  # Search API logs for specific capture
  npx -y bun search-watch.ts --service api -q "capture.id:69697"

  # Search with explicit index and filters
  npx -y bun search-watch.ts -i logstash-processing* -F "service.keyword:cupixworks-captue-skatmaster-arm-instance" -F "level:error"

  # Resolve service keyword
  npx -y bun search-watch.ts --resolve skat

  # List services
  npx -y bun search-watch.ts --list-services
`);
    process.exit(0);
  }

  // Utility modes
  if (values["test-connection"]) {
    await testConnection();
    process.exit(0);
  }
  if (values["list-indices"]) {
    await listIndexPatterns();
    process.exit(0);
  }
  if (values["list-services"]) {
    const grouped = new Map<string, ServiceEntry[]>();
    for (const e of SERVICE_REGISTRY) {
      const list = grouped.get(e.index) ?? [];
      list.push(e);
      grouped.set(e.index, list);
    }
    for (const [index, entries] of grouped) {
      console.log(`\n${index}:`);
      for (const e of entries) {
        console.log(`  [${e.keywords.join(", ")}] → ${e.service} (${e.product})`);
      }
    }
    process.exit(0);
  }
  if (values.resolve) {
    const { matched, results } = resolveService(values.resolve);
    if (matched) {
      console.log(JSON.stringify({ matched: true, keyword: values.resolve, services: results.map((r) => ({ index: r.index, service: r.service, product: r.product, description: r.description })) }, null, 2));
    } else {
      console.log(`No match for "${values.resolve}". Use --list-services to see all.`);
    }
    process.exit(0);
  }

  // Search mode
  let index = values.index;
  const filters = parseFilters(values.filter ?? []);

  if (values.service) {
    const { matched, results } = resolveService(values.service);
    if (!matched) {
      console.error(`Error: No service matched "${values.service}". Use --list-services to see all.`);
      process.exit(1);
    }
    if (results.length === 1) {
      index = results[0].index;
      filters["service.keyword"] = results[0].service;
      console.error(`Resolved: ${values.service} → ${results[0].index} / ${results[0].service}`);
    } else {
      console.error(`Multiple matches for "${values.service}":`);
      for (const r of results) {
        console.error(`  ${r.service} (${r.index}) - ${r.description}`);
      }
      console.error(`\nUsing first match. Add -F "service.keyword:..." to override.`);
      index = results[0].index;
      filters["service.keyword"] = results[0].service;
    }
  }

  if (!index) {
    console.error("Error: --service or --index is required");
    console.error("Use --help for usage information");
    process.exit(1);
  }

  const size = Math.min(Math.max(1, parseInt(values.size!)), MAX_SIZE);

  console.error(`Index: ${index}`);
  if (values.lucene) console.error(`Query: ${values.lucene}`);
  if (Object.keys(filters).length) console.error(`Filters: ${JSON.stringify(filters)}`);
  console.error("");

  await searchLogs({
    index,
    query: values.lucene,
    size,
    sortField: values["sort-field"]!,
    sortOrder: values["sort-order"]!,
    timeFrom: values["time-from"],
    timeTo: values["time-to"],
    filters: Object.keys(filters).length > 0 ? filters : undefined,
    fields: values.fields?.split(",").map((f) => f.trim()),
    includeAllFields: values["all-fields"],
  });
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
