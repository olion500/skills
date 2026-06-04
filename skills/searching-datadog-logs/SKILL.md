---
name: searching-datadog-logs
description: Search and analyze Datadog logs and metrics using API for cupixworks-api and cupixworks-worker services. Use when debugging errors, investigating issues, searching logs, analyzing worker jobs, checking Sidekiq logs, querying metrics, or finding specific log entries by class/function names. Supports error/warn/info log levels with 14-day retention for logs.
---

# Datadog Logs & Metrics

Search and analyze logs/metrics from Datadog for cupixworks services.

## Scripts

```bash
# Logs — run with --help for all options
npx -y bun ${SKILL_DIR}/scripts/search-logs.ts -- --help

# Metrics — run with --help for all options
npx -y bun ${SKILL_DIR}/scripts/query-metrics.ts -- --help
```

---

## Before Searching, Ask Yourself

1. **14일 이내인가?** — Datadog 로그 retention은 14일. 그 이전은 검색 불가.
2. **debug 레벨이 필요한가?** — error, warn, info만 저장됨. debug 로그는 Datadog에 없음.
3. **service 이름을 알고 있는가?** — Datadog의 service 이름(`cupixworks-api`, `cupixworks-worker`)은 실제 repo 이름(`tesla`)과 다름. `finding-repositories` 스킬을 반드시 참고.
4. **로그 vs 메트릭?** — 특정 에러/요청 추적 → 로그. 트렌드/성능 패턴 → 메트릭.

---

## NEVER

- **NEVER** `now-14d` 이상 시간 범위 요청 — 빈 결과만 나옴
- **NEVER** debug 레벨 로그를 기대 — 저장 안 됨
- **NEVER** service 이름으로 repo를 추측 — `cupixworks-api` → `tesla` repo임. `finding-repositories` 참고
- **NEVER** service 필터 없이 검색 — 결과 폭발, 느림
- **NEVER** 구 코드에서 `@class`/`@function` 태그를 기대 — 최근 코드에만 있음. 키워드 검색으로 대체

---

## Query Decision Tree

```
무엇을 찾는가?
├─ 특정 에러 조사
│  → -q "service:cupixworks-api status:error" -f "now-1h"
│  → 에러 메시지가 있으면: -q 'service:cupixworks-api "ErrorMessage"'
│
├─ 특정 클래스/워커 추적
│  → -q "service:cupixworks-worker @class:WorkerClassName" -f "now-24h"
│  → @class 태그 없으면: -q 'service:cupixworks-worker "WorkerClassName"'
│
├─ 특정 ID 관련 로그
│  → -q "service:cupixworks-worker (613263 OR 613260)" -f "now-24h"
│
├─ Datadog URL에서 같은 검색 재현
│  → --url "https://app.datadoghq.com/logs?query=..."
│
└─ 성능/트렌드 확인
   → query-metrics.ts 사용
   → -q "avg:system.cpu.user{service:cupixworks-api}" -f "1h"
```

---

## Query Patterns

```bash
# 에러 검색
-q "service:cupixworks-api status:error"
-q "service:cupixworks-worker status:error"

# 클래스/함수별 (최근 코드만)
-q "service:cupixworks-api @class:ClassName @function:method_name"

# 키워드 (구 코드 포함, 더 넓은 범위)
-q 'service:cupixworks-api "ActiveRecord::RecordNotFound"'

# 복수 ID
-q "service:cupixworks-worker (613263 OR 613260)"

# warn 레벨
-q "service:cupixworks-api status:warn"
```

## Common Metric Queries

```
avg:system.cpu.user{service:cupixworks-api}
avg:system.mem.used{service:cupixworks-api}
sum:rails.request.count{service:cupixworks-api}.as_rate()
sum:rails.request.errors{service:cupixworks-api}.as_rate()
avg:postgresql.query.time{service:cupixworks-api}
```

---

## Key Facts

| Item | Value |
|------|-------|
| Services | `cupixworks-api` (Rails API), `cupixworks-worker` (Sidekiq) |
| Repository | 둘 다 `tesla` repo |
| Retention | 14일 |
| Log Levels | error, warn, info (debug 없음) |
| Tags | `@class`, `@function` (최근 코드만) |
| Credentials | `DATADOG_API_KEY`, `DATADOG_APP_KEY` (via `just claude`) |

## Troubleshooting

| 증상 | 원인 | 해결 |
|------|------|------|
| 빈 결과 | 14일 초과 or 잘못된 service 이름 | 시간 범위 확인, service 필터 확인 |
| 빈 결과 | `@class` 태그 없는 구 코드 | 키워드 검색(`"ClassName"`)으로 대체 |
| 너무 많은 결과 | 필터 부족 | `@class`, `status:error`, 시간 좁히기 |
| pagination 필요 | limit 초과 | `--cursor` 사용 (스크립트가 cursor 출력함) |
