---
name: azure-devops
description: "Access Azure DevOps resources (PRs, builds, pipelines, releases, variable groups) for the Cupix organization.\nTRIGGER when: user pastes a dev.azure.com URL; user mentions Azure DevOps, ADO, az pr, az pipeline, build status, release status, or deploy status for Cupix projects; user asks about PR reviews, build logs, pipeline runs, or release progress.\nSKIP: general git questions not about Azure DevOps; GitHub-only workflows."
---

# Azure DevOps Skill

Query and manage Azure DevOps resources across Cupix projects (`tesla`, `tesla-compute`, etc.) using the `az` CLI and REST API.

## Organization

- **Org**: `https://dev.azure.com/cupix`
- **Projects**: tesla, tesla-compute, tesla-services, cupixworks, backend, cupix-infrastructure, cupix-api, skat, capture-maker, platform, cupix-warden, cupixworks-dw, aws-management

## URL Parsing

When the user pastes an Azure DevOps URL, extract the resource type and IDs:

| URL pattern | Resource | How to extract |
|---|---|---|
| `dev.azure.com/cupix/{project}/_releaseProgress?...&releaseId={id}` | Release | project + releaseId from query param |
| `dev.azure.com/cupix/{project}/_build/results?buildId={id}` | Build | project + buildId from query param. Also extract `j` (job ID) and `t` (task/step ID) if present — these map to timeline record IDs for fetching specific logs. |
| `dev.azure.com/cupix/{project}/_git/{repo}/pullrequest/{id}` | Pull Request | project + repo + PR id from path |
| `dev.azure.com/cupix/{project}/_build?definitionId={id}` | Pipeline | project + definitionId from query param |
| `dev.azure.com/cupix/{project}/_release?definitionId={id}` | Release Def | project + definitionId from query param |

## Commands by Resource

### Pull Requests

Use `az repos pr` commands directly — they work without issues.

```bash
# Show PR details
az repos pr show --id {pr_id} --org https://dev.azure.com/cupix

# List PRs for a repo
az repos pr list --repository {repo} --project {project} --org https://dev.azure.com/cupix --status active

# PR reviewers
az repos pr reviewer list --id {pr_id} --org https://dev.azure.com/cupix

# PR work items
az repos pr work-item list --id {pr_id} --org https://dev.azure.com/cupix

# Create PR
az repos pr create --repository {repo} --source-branch {branch} --target-branch {target} \
  --title "{title}" --description "{desc}" --project {project} --org https://dev.azure.com/cupix
```

**Useful fields from PR show**: `status`, `title`, `sourceRefName`, `targetRefName`, `createdBy.displayName`, `creationDate`, `closedDate`, `mergeStatus`, `isDraft`, `reviewers`.

### Builds / Pipeline Runs

Use `az pipelines build` for basic info. For logs, use REST API.

```bash
# Show build details
az pipelines build show --id {build_id} --project {project} --org https://dev.azure.com/cupix

# List recent builds for a pipeline definition
az pipelines build list --definition-ids {def_id} --project {project} --org https://dev.azure.com/cupix --top 5

# List pipeline definitions
az pipelines list --project {project} --org https://dev.azure.com/cupix
```

**Build logs** — use REST API because `az` doesn't expose individual log content:

```bash
# Get log list
TOKEN=$(az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://dev.azure.com/cupix/{project}/_apis/build/builds/{build_id}/logs?api-version=7.1"

# Get specific log content (use logId from the list above)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://dev.azure.com/cupix/{project}/_apis/build/builds/{build_id}/logs/{log_id}?api-version=7.1"
```

**Fetching logs for a specific job/task from URL** — when the URL contains `j={jobId}&t={taskId}`, use the timeline to find the matching log:

```bash
# 1. Get the build timeline
TOKEN=$(az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv)
TIMELINE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "https://dev.azure.com/cupix/{project}/_apis/build/builds/{build_id}/timeline?api-version=7.1")

# 2. Find the timeline record matching the task ID (t= param) — it has the logId
echo "$TIMELINE" | jq -r '.records[] | select(.id=="{task_id}") | .log.id'

# 3. Fetch that log
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://dev.azure.com/cupix/{project}/_apis/build/builds/{build_id}/logs/{log_id}?api-version=7.1"
```

If `t=` is not in the URL but `j=` is, find all child tasks of that job and show their statuses:
```bash
echo "$TIMELINE" | jq '[.records[] | select(.parentId=="{job_id}") | {name, state, result, logId: .log.id}]'
```

**Build timeline** (shows stages/jobs/tasks with status):

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://dev.azure.com/cupix/{project}/_apis/build/builds/{build_id}/timeline?api-version=7.1"
```

### Releases (Classic)

Classic releases require REST API — `az pipelines release` commands fail with auth errors in the current setup.

Always get a fresh token before calling the `vsrm` endpoint:

```bash
TOKEN=$(az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv)
```

```bash
# Get release details
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://vsrm.dev.azure.com/cupix/{project}/_apis/release/releases/{release_id}?api-version=7.1"

# List recent releases for a definition
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://vsrm.dev.azure.com/cupix/{project}/_apis/release/releases?definitionId={def_id}&\$top=5&api-version=7.1"

# List release definitions
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://vsrm.dev.azure.com/cupix/{project}/_apis/release/definitions?api-version=7.1"

# Get release environment (stage) details
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://vsrm.dev.azure.com/cupix/{project}/_apis/release/releases/{release_id}/environments/{env_id}?api-version=7.1"
```

**Key release fields**: `name`, `status`, `createdOn`, `createdBy.displayName`, `releaseDefinition.name`, `environments[].name`, `environments[].status`.

Environment status values: `notStarted`, `inProgress`, `succeeded`, `rejected`, `canceled`, `partiallySucceeded`.

### Variable Groups

Variable groups also require REST API.

```bash
TOKEN=$(az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv)

# List variable groups
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://dev.azure.com/cupix/{project}/_apis/distributedtask/variablegroups?api-version=7.1"

# Get specific variable group
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://dev.azure.com/cupix/{project}/_apis/distributedtask/variablegroups/{group_id}?api-version=7.1"
```

**Listing variables** — parse `variables` object from the response. Each key is a variable name, value has `value` and `isSecret` fields.

### Pipelines (YAML)

```bash
# List pipelines
az pipelines list --project {project} --org https://dev.azure.com/cupix

# Show pipeline
az pipelines show --id {pipeline_id} --project {project} --org https://dev.azure.com/cupix

# Run a pipeline
az pipelines run --id {pipeline_id} --project {project} --org https://dev.azure.com/cupix --branch {branch}
```

## Output Guidelines

- When showing build/release status, format as a concise summary table
- For failed builds, proactively fetch the error logs (last log entry in timeline with `result: failed`)
- For releases, show environment-by-environment status in a table
- For PRs, highlight: status, reviewers, merge conflicts, and key dates
- Variable groups: show as key-value table, mask secrets

## Token Caching

The Azure access token expires after ~1 hour. Get a fresh token at the start of each skill invocation — don't reuse tokens across conversations. The token command is fast (~200ms) so there's no performance concern.

## Error Handling

If `az` commands fail with "The requested resource requires user authentication", fall back to the REST API pattern with a fresh Bearer token. This commonly happens with:
- Release APIs (always use `vsrm.dev.azure.com` endpoint)
- Variable Groups
- Some project-level APIs

If both fail, the user may need to re-authenticate: `az login`.
