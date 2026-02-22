---
name: functional-coding
description: Write and refactor code using functional programming principles for fewer bugs and less code. Language-agnostic (TypeScript, Python, Go, Rust, Java, etc.). Activate when writing new functions, refactoring existing code, reviewing code quality, fixing bugs caused by state mutation, building data pipelines, or when the user mentions functional programming, pure functions, immutability, composition, or side effects. Also activate when generating any non-trivial business logic to default to FP patterns.
---

# Functional Coding

FP is a thinking style, not a language choice. Pure functions, immutable data, composition.

## Default Behavior

When writing or modifying code, always prefer:

| Instead of | Use |
|---|---|
| `for` loop with accumulator | `map` / `filter` / `reduce` |
| Mutating function arguments | Return new data (`...spread`, `replace()`, copy) |
| Class with internal state | Pure functions with explicit arguments |
| `try/catch` for control flow | Result/Either type (errors as values) |
| `null`/`undefined` checks | `Option`/`Optional` type or explicit union |
| Nested `if/else` chains | Pattern matching or rule tables |
| Callbacks mixed with logic | Pure core + thin I/O shell at boundary |

## Workflow

### Before Writing Any Function, Ask Yourself

1. **What are the inputs and outputs?** Define the signature first: `input type → output type`
2. **Is this pure?** No `this`/`self`, no external state reads, no I/O inside
3. **Can this mutate anything?** If yes, return new data instead
4. **Where does I/O belong?** Push all side effects (DB, API, logging) to the outermost boundary
5. **Is this one function or a pipeline?** If >15 lines, decompose into smaller composable functions

### Refactoring Decision Table

| What you see | Transform to | Prompt pattern |
|---|---|---|
| `for` loop with accumulator | `reduce` / comprehension | "Convert to `reduce`. Initial: X, accumulator: Y" |
| Object mutation in function | Spread/copy returning new object | "Convert to `frozen dataclass` / `readonly`" |
| Stateful class | Extract methods as pure functions | "Extract as pure function. Replace `self` with explicit args" |
| Boolean condition explosion | Rule table + `any()` / pattern match | "Convert to rule list + `any()`" |
| `try/catch` error handling | `Result<T,E>` return type | "Replace exceptions with `Result`: `Ok(value)` / `Err(msg)`" |
| `.push()` array building | `map` / `filter` pipeline | "Convert to `map`/`filter` chain" |
| Mixed I/O + logic | Separate pure core from I/O shell | "Extract pure logic, push I/O to boundary" |

Specificity raises AI success rate from 15.6% to 86.7% (ICSE 2025). Always name the target pattern.

## NEVER

- NEVER convert simple `if (x != null)` / `x?.` to Option — adds ceremony without safety gain
- NEVER use `reduce` when `sum()`, `filter()`, or `map()` alone is clearer
- NEVER refactor to FP in a PR that fixes a bug — separate concerns, one change per PR
- NEVER curry more than 3 levels deep — becomes unreadable, use an options object instead
- NEVER wrap every function in Result — only at boundaries where errors cross domains
- NEVER introduce FP patterns in isolation on a team that hasn't agreed to adopt them
- NEVER sacrifice readability for point-free style — named functions beat clever composition
- NEVER use FP abstractions (pipe, Either, Option) when the language has idiomatic equivalents (Go's `val, err`, Rust's `?`, Python's comprehensions)

## Review Checklist

When reviewing code (own or AI-generated):

- [ ] Each function is pure (same input → same output, always)
- [ ] No argument mutation (uses spread/copy instead)
- [ ] No hidden external state dependency
- [ ] Side effects are explicit and at the boundary
- [ ] Functions are small enough to compose (single responsibility)
- [ ] Errors are values, not thrown exceptions (where language supports it)

## Language-Specific Patterns

For compact idiom reference per language, read [references/patterns.md](references/patterns.md).

## Related Skills (Tiered)

This skill sets FP defaults. For deeper patterns:

| Tier | Skill | Focus |
|------|-------|-------|
| T2 Core | `fp-error-handling` | Result/Either, railway-oriented, validation |
| T2 Core | `fp-composition` | Currying, pipe/flow, building utilities |
| T2 Core | `fp-immutability` | Immutable updates, lens patterns, readonly |
| T3 Advanced | `fp-async-patterns` | Lazy eval, async pipelines, retry/fallback |
| T3 Advanced | `fp-architecture` | Pure core/impure shell, state machines, memoization |

## When NOT to Apply

- Trivial scripts or one-off utilities where clarity matters more
- Performance-critical hot loops where mutation is measurably faster
- Framework-imposed patterns that expect mutation (e.g., some ORMs)
- When the team/codebase has an established imperative style and the user hasn't asked for FP
