---
name: searching-kibana
description: Search and query Elasticsearch/Kibana database models using curl API. Use for querying database models, searching Kibana indices, checking Elasticsearch data, investigating data in Kibana, finding records by ID, searching documents. Supports multiple environments (dev, qa, stage, production-us, production-au, production-eu).
---

# Searching Kibana

Search and query Elasticsearch data through Kibana API for cupixworks models.

## Script

```bash
# Run with --help for all options
npx -y bun ${SKILL_DIR}/scripts/search-kibana.ts -- --help
```

---

## Before Searching, Ask Yourself

1. **어떤 환경인가?** — 인시던트 조사 → production (고객 리전에 따라 us/au/eu). 개발 확인 → dev.
2. **정확한 값인가, 텍스트 검색인가?** — ID/상태값 → `--term`. 이름 부분 검색 → `--match`.
3. **필드명이 정확한가?** — `capture.id` (O) vs `capture_id` (X). 모르면 `--raw`로 한 건 먼저 확인.

---

## NEVER

- **NEVER** `--match`로 ID나 정확한 값 검색 — `--term` 써야 함. match는 analyzer를 거쳐 의도와 다른 결과 나옴
- **NEVER** production에서 `--size 1000` + 필터 없이 검색 — 성능 영향 가능
- **NEVER** `capture_id`로 검색 — 올바른 필드명은 `capture.id` (dot notation)
- **NEVER** index 이름을 추측 — 모르면 `--list-indices`로 확인

---

## Query Type Decision Tree

```
무엇을 찾는가?
├─ ID로 정확히 1건 조회
│  → --id 69496
│
├─ 특정 필드의 정확한 값
│  → --term "capture.id:69496"
│  → --term "state:done"
│
├─ 이름/텍스트 부분 검색
│  → --match "name:test project"
│  → --match "email:john"
│
├─ 복합 조건 (AND/OR)
│  → -q '{"bool":{"must":[{"term":{"state":"done"}},{"term":{"facility.id":4308}}]}}'
│
├─ 날짜 범위
│  → --range "created_at:2024-01-01:2024-12-31"
│
└─ 전체 문서 구조 파악
   → --id {아무ID} --raw  (한 건 조회해서 필드 구조 확인)
```

---

## Environment Selection

| 목적 | 환경 | 명령 |
|------|------|------|
| 인시던트 조사 (US 고객) | `prod` | `-e prod` |
| 인시던트 조사 (AU 고객) | `prod-au` | `-e prod-au` |
| 인시던트 조사 (EU 고객) | `prod-eu` | `-e prod-eu` |
| 개발 테스트 | `dev` | `-e dev` |
| QA 검증 | `qa` | `-e qa` |

---

## Common Index & Fields

| Model | Index | Key Fields |
|-------|-------|------------|
| Capture | `captures` | `id`, `uuid`, `name`, `state`, `facility.id`, `team.id` |
| Video | `videos` | `id`, `capture.id`, `name`, `state` |
| Pano | `panos` | `id`, `capture.id`, `cluster.id`, `name` |
| Facility | `facilities` | `id`, `name`, `key`, `team.id` |
| Team | `teams` | `id`, `name`, `domain` |
| User | `users` | `id`, `email`, `firstname`, `lastname` |

---

## Key Facts

| Item | Value |
|------|-------|
| Credentials | `KIBANA_USERNAME`, `KIBANA_PASSWORD` (via `just claude`) |
| API Endpoint | `{base_url}/internal/search/es` |
| Field naming | dot notation (`capture.id`, `facility.id`) |

## Troubleshooting

| 증상 | 원인 | 해결 |
|------|------|------|
| 401 Unauthorized | 인증 실패 | Claude 재시작하여 `.env` 리로드 |
| 빈 결과 | 잘못된 index 이름 | `--list-indices`로 확인 |
| 빈 결과 | 필드명 오류 | `--raw`로 실제 문서 구조 확인. `capture_id` → `capture.id` |
| 스크립트 안 됨 | 환경 문제 | Legacy curl 사용 (아래) |

### Legacy curl Fallback

```bash
curl -s --user "$KIBANA_USERNAME:$KIBANA_PASSWORD" \
  -H 'kbn-xsrf: true' -H 'Content-Type: application/json' \
  -X POST 'https://kibana.dev.cupix.works/internal/search/es' \
  -d '{"params":{"index":"captures","body":{"query":{"term":{"id":69496}},"size":1}}}'
```
