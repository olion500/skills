# olion500/skills

A collection of coding agent skills. Compatible with [Claude Code plugins](https://code.claude.com/docs/en/plugins) and the [open agent skills ecosystem](https://github.com/vercel-labs/skills).

## Install

### Claude Code (Plugin)

```bash
/plugin marketplace add olion500/skills
/plugin install fp-skills@olion500-skills
```

### Vercel Skills

```bash
npx skills add olion500/skills
```

### Install a specific skill (Vercel)

```bash
npx skills add olion500/skills --skill <skill-name>
```

## Available Skills

### Utility

| Skill | Description |
|-------|-------------|
| `web-to-markdown` | Convert web pages to clean Markdown via local `web2md` CLI (Puppeteer + Readability). Handles JS-rendered pages. |

### Functional Programming

Inspired by [fp-ts-skills](https://github.com/whatiskadudoing/fp-ts-skills) but **not tied to any library or language**. Teaches FP patterns that work in TypeScript, Python, Go, Rust, Java, and more.

#### Tier 1 — Foundation (always active, minimal tokens)

| Skill | Description |
|-------|-------------|
| `functional-coding` | Core FP defaults: pure functions, immutability, composition. Sets the baseline for all code generation. |

#### Tier 2 — Core Patterns (load on demand)

| Skill | Description |
|-------|-------------|
| `fp-error-handling` | Errors as values (Result/Either), railway-oriented programming, validation with error accumulation. |
| `fp-composition` | Currying, partial application, pipe/flow, data-last design, building reusable utilities. |
| `fp-immutability` | Immutable update patterns, nested updates, lens patterns, readonly enforcement. |

#### Tier 3 — Advanced (opt-in)

| Skill | Description |
|-------|-------------|
| `fp-async-patterns` | Lazy evaluation, async pipelines, parallel vs sequential, retry with backoff, stream composition. |
| `fp-architecture` | Pure core/impure shell, state machines as data, memoization, branded types, event sourcing. |

## Recommended Bundles

| Bundle | Skills | Use Case |
|--------|--------|----------|
| **Essentials** | `functional-coding` | Minimal FP defaults |
| **Full Core** | All Tier 1 + Tier 2 | Everyday FP development |
| **Complete** | All skills | Deep FP adoption |

## Structure

```
skills/
├── .claude-plugin/               Claude Code plugin
│   ├── plugin.json
│   └── marketplace.json
├── README.md
└── skills/
    ├── web-to-markdown/           Utility
    │   └── SKILL.md
    ├── functional-coding/         T1 — Foundation
    │   ├── SKILL.md
    │   └── references/
    ├── fp-error-handling/         T2 — Core
    │   └── SKILL.md
    ├── fp-composition/            T2 — Core
    │   └── SKILL.md
    ├── fp-immutability/           T2 — Core
    │   └── SKILL.md
    ├── fp-async-patterns/         T3 — Advanced
    │   └── SKILL.md
    └── fp-architecture/           T3 — Advanced
        └── SKILL.md
```

## License

MIT
