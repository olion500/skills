#!/usr/bin/env bun
/**
 * Kibana/Elasticsearch Search Script
 *
 * Usage:
 *   npx -y bun scripts/search-kibana.ts -e dev -i captures --id 69496
 *   npx -y bun scripts/search-kibana.ts -e production-us -i videos -q '{"term": {"capture.id": 69496}}'
 *   npx -y bun scripts/search-kibana.ts -e dev -i captures --match "name:project_name"
 */

import { parseArgs } from "util";

const ENVIRONMENTS: Record<string, string> = {
  dev: "https://kibana.dev.cupix.works",
  qa: "https://kibana.qa.cupix.works",
  stage: "https://kibana.stage.cupix.works",
  "production-us": "https://kibana.cupix.works",
  "production-au": "https://kibana.cupix-au.works",
  "production-eu": "https://kibana.cupix-eu.works",
  // Shortcuts
  prod: "https://kibana.cupix.works",
  "prod-us": "https://kibana.cupix.works",
  "prod-au": "https://kibana.cupix-au.works",
  "prod-eu": "https://kibana.cupix-eu.works",
};

interface SearchOptions {
  env: string;
  index: string;
  query: object;
  size: number;
  from?: number;
  sort?: object[];
  fields?: string[];
}

interface SearchHit {
  _index: string;
  _id: string;
  _score: number;
  _source: Record<string, unknown>;
}

interface SearchResponse {
  rawResponse: {
    hits: {
      total: { value: number; relation: string };
      hits: SearchHit[];
    };
  };
}

function getCredentials(): { username: string; password: string } {
  const username = process.env.CLAUDE_PLUGIN_OPTION_KIBANA_USERNAME || process.env.KIBANA_USERNAME;
  const password = process.env.CLAUDE_PLUGIN_OPTION_KIBANA_PASSWORD || process.env.KIBANA_PASSWORD;

  if (!username || !password) {
    console.error("Error: Missing Kibana credentials. Configure via plugin settings or set KIBANA_USERNAME and KIBANA_PASSWORD env vars.");
    process.exit(1);
  }

  return { username, password };
}

function getBaseUrl(env: string): string {
  const url = ENVIRONMENTS[env.toLowerCase()];
  if (!url) {
    console.error(`Error: Unknown environment '${env}'`);
    console.error("");
    console.error("Available environments:");
    console.error("  dev, qa, stage");
    console.error("  production-us (or prod, prod-us)");
    console.error("  production-au (or prod-au)");
    console.error("  production-eu (or prod-eu)");
    process.exit(1);
  }
  return url;
}

function buildQuery(options: {
  id?: number;
  match?: string;
  term?: string;
  queryJson?: string;
  bool?: string;
  range?: string;
}): object {
  // Raw query JSON takes precedence
  if (options.queryJson) {
    try {
      return JSON.parse(options.queryJson);
    } catch (e) {
      console.error("Error: Invalid JSON in --query");
      process.exit(1);
    }
  }

  // Simple ID lookup
  if (options.id !== undefined) {
    return { term: { id: options.id } };
  }

  // Term query (field:value)
  if (options.term) {
    const [field, ...valueParts] = options.term.split(":");
    const value = valueParts.join(":");
    const parsedValue = /^\d+$/.test(value) ? parseInt(value) : value;
    return { term: { [field]: parsedValue } };
  }

  // Match query (field:value for text search)
  if (options.match) {
    const [field, ...valueParts] = options.match.split(":");
    const value = valueParts.join(":");
    return { match: { [field]: value } };
  }

  // Bool query JSON
  if (options.bool) {
    try {
      return { bool: JSON.parse(options.bool) };
    } catch (e) {
      console.error("Error: Invalid JSON in --bool");
      process.exit(1);
    }
  }

  // Range query (field:gte:lte)
  if (options.range) {
    const parts = options.range.split(":");
    if (parts.length < 2) {
      console.error("Error: Range format should be field:gte or field:gte:lte");
      process.exit(1);
    }
    const [field, gte, lte] = parts;
    const rangeQuery: Record<string, string> = {};
    if (gte) rangeQuery.gte = gte;
    if (lte) rangeQuery.lte = lte;
    return { range: { [field]: rangeQuery } };
  }

  // Default: match all
  return { match_all: {} };
}

async function searchKibana(options: SearchOptions): Promise<SearchResponse> {
  const { username, password } = getCredentials();
  const baseUrl = getBaseUrl(options.env);

  const body = {
    params: {
      index: options.index,
      body: {
        query: options.query,
        size: options.size,
        ...(options.from !== undefined && { from: options.from }),
        ...(options.sort && { sort: options.sort }),
        ...(options.fields && { _source: options.fields }),
      },
    },
  };

  const response = await fetch(`${baseUrl}/internal/search/es`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "kbn-xsrf": "true",
      Authorization: `Basic ${btoa(`${username}:${password}`)}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Error: Kibana API returned ${response.status}`);
    if (response.status === 401) {
      console.error("Authentication failed. Check KIBANA_USERNAME and KIBANA_PASSWORD.");
    } else if (response.status === 403) {
      console.error("Access forbidden. Check your permissions.");
    } else {
      console.error(errorText);
    }
    process.exit(1);
  }

  return response.json();
}

async function listIndexPatterns(env: string): Promise<void> {
  const { username, password } = getCredentials();
  const baseUrl = getBaseUrl(env);

  const response = await fetch(
    `${baseUrl}/api/saved_objects/_find?type=index-pattern&per_page=100`,
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

  const data = await response.json();
  console.log("Available index patterns:\n");
  for (const obj of data.saved_objects) {
    console.log(`  ${obj.attributes.title}`);
  }
}

function formatHit(hit: SearchHit, fields?: string[]): object {
  if (fields && fields.length > 0) {
    const result: Record<string, unknown> = { _id: hit._id };
    for (const field of fields) {
      const value = field.split(".").reduce((obj: any, key) => obj?.[key], hit._source);
      if (value !== undefined) {
        result[field] = value;
      }
    }
    return result;
  }
  return {
    _id: hit._id,
    ...hit._source,
  };
}

function printHelp() {
  console.log(`
Kibana/Elasticsearch Search

USAGE:
  npx -y bun search-kibana.ts [OPTIONS]

OPTIONS:
  --env, -e       Environment (required)
                  Values: dev, qa, stage, production-us, production-au, production-eu
                  Shortcuts: prod (=production-us), prod-au, prod-eu

  --index, -i     Index name (required unless --list-indices)
                  Examples: captures, videos, panos, facilities, teams, users

  --id            Search by ID (simple term query on 'id' field)
                  Example: --id 69496

  --term          Term query (exact match)
                  Format: field:value
                  Example: --term "capture.id:69496"

  --match         Match query (text search)
                  Format: field:value
                  Example: --match "name:project_name"

  --query, -q     Raw Elasticsearch query JSON
                  Example: -q '{"bool":{"must":[{"term":{"state":"done"}}]}}'

  --bool          Bool query shorthand (JSON for bool clause)
                  Example: --bool '{"must":[{"term":{"state":"done"}}]}'

  --range         Range query
                  Format: field:gte or field:gte:lte
                  Example: --range "created_at:2024-01-01:2024-12-31"

  --size, -s      Max results (default: 10, max: 1000)

  --from          Offset for pagination (default: 0)

  --fields, -f    Comma-separated fields to return
                  Example: -f "id,name,state"

  --sort          Sort field and order
                  Format: field:asc or field:desc
                  Example: --sort "created_at:desc"

  --raw           Output raw JSON response

  --list-indices  List available index patterns

  --help, -h      Show this help

EXAMPLES:
  # Search capture by ID
  npx -y bun search-kibana.ts -e dev -i captures --id 69496

  # Search videos by capture ID
  npx -y bun search-kibana.ts -e dev -i videos --term "capture.id:69496"

  # Text search on name field
  npx -y bun search-kibana.ts -e dev -i facilities --match "name:test project"

  # Complex bool query
  npx -y bun search-kibana.ts -e dev -i captures -q '{"bool":{"must":[{"term":{"state":"done"}},{"term":{"facility.id":4308}}]}}'

  # Select specific fields
  npx -y bun search-kibana.ts -e dev -i videos --term "capture.id:69496" -f "id,name,state"

  # Production US search with pagination
  npx -y bun search-kibana.ts -e prod -i captures --term "team.id:123" -s 50 --from 0

  # List available indices
  npx -y bun search-kibana.ts -e dev --list-indices
`);
}

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      env: { type: "string", short: "e" },
      index: { type: "string", short: "i" },
      id: { type: "string" },
      term: { type: "string" },
      match: { type: "string" },
      query: { type: "string", short: "q" },
      bool: { type: "string" },
      range: { type: "string" },
      size: { type: "string", short: "s", default: "10" },
      from: { type: "string" },
      fields: { type: "string", short: "f" },
      sort: { type: "string" },
      raw: { type: "boolean", default: false },
      "list-indices": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  if (!values.env) {
    console.error("Error: --env is required");
    console.error("Use --help for usage information");
    process.exit(1);
  }

  // List indices mode
  if (values["list-indices"]) {
    await listIndexPatterns(values.env);
    process.exit(0);
  }

  if (!values.index) {
    console.error("Error: --index is required");
    console.error("Use --help for usage information");
    process.exit(1);
  }

  // Parse fields
  const fields = values.fields?.split(",").map((f) => f.trim());

  // Parse sort
  let sort: object[] | undefined;
  if (values.sort) {
    const [field, order = "asc"] = values.sort.split(":");
    sort = [{ [field]: order }];
  }

  // Build query
  const query = buildQuery({
    id: values.id ? parseInt(values.id) : undefined,
    term: values.term,
    match: values.match,
    queryJson: values.query,
    bool: values.bool,
    range: values.range,
  });

  const options: SearchOptions = {
    env: values.env,
    index: values.index,
    query,
    size: Math.min(parseInt(values.size!), 1000),
    from: values.from ? parseInt(values.from) : undefined,
    sort,
    fields,
  };

  console.error(`Environment: ${values.env}`);
  console.error(`Index: ${values.index}`);
  console.error(`Query: ${JSON.stringify(query)}`);
  console.error(`Size: ${options.size}`);
  console.error("");

  const result = await searchKibana(options);

  if (values.raw) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const hits = result.rawResponse.hits;
    const totalValue = typeof hits.total === "object" ? hits.total.value : hits.total;
    console.log(`Found ${totalValue} results (showing ${hits.hits.length}):\n`);

    for (const hit of hits.hits) {
      console.log(JSON.stringify(formatHit(hit, fields), null, 2));
      console.log("---");
    }

    if (hits.total.value > options.size + (options.from || 0)) {
      const nextFrom = (options.from || 0) + options.size;
      console.error(`\nMore results available. Use --from ${nextFrom} to see next page`);
    }
  }
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
