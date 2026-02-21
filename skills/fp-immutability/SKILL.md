---
name: fp-immutability
description: "Never mutate data — create new values instead. Covers immutable update patterns (spread, copy, freeze), nested updates without mutation, readonly enforcement, and performance trade-offs. Activate when: updating objects or arrays, working with state management (React, Redux), fixing bugs caused by unintended mutation, deeply nested data updates, or when the user mentions immutability, spread, readonly, frozen, copy-on-write, or structural sharing. Works in any language (TypeScript, Python, Go, Rust, Java)."
---

# FP Immutability

Never mutate. Always create new values. Eliminates shared state corruption, action-at-a-distance, and order-dependent bugs.

## Before Choosing Immutable vs Mutable, Ask Yourself

1. **Does this data cross a module boundary?** → Must be immutable
2. **Is this shared between components/threads?** → Must be immutable
3. **Is this local to a single function and never exposed?** → Mutation is fine
4. **Is this a hot loop processing >10K items?** → Profile first, mutation may be necessary

## Immutable Operations Cheatsheet

| Mutable (avoid) | Immutable (prefer) | Note |
|---|---|---|
| `obj.x = y` | `{ ...obj, x: y }` | Shallow O(n) copy |
| `arr.push(x)` | `[...arr, x]` | Creates new array |
| `arr.splice(i,1)` | `arr.filter((_,idx) => idx !== i)` | Or `arr.toSpliced(i,1)` (ES2023) |
| `arr.sort()` | `arr.toSorted()` | ES2023; or `[...arr].sort()` |
| `arr[i] = x` | `arr.with(i, x)` | ES2023; or `.map()` |
| `map.set(k,v)` | `new Map([...map, [k,v]])` | Clone first |
| `dict[k] = v` (Python) | `{**dict, k: v}` | Creates new dict |

Language-specific: Python `@dataclass(frozen=True)` + `replace()`. Go: value types are copied by default. Rust: immutable by default, `mut` opts in. Java: `record` types.

## Nested Updates — The Hard Part

Deeply nested immutable updates are the #1 pain point. Three approaches:

### 1. Manual Spread (simple nesting)
```typescript
const updated = {
  ...state,
  user: { ...state.user, address: { ...state.user.address, city: "Seoul" } },
};
```

### 2. Helper Functions (repeated access patterns)
```typescript
const setCity = (state: State, city: string): State => ({
  ...state,
  user: { ...state.user, address: { ...state.user.address, city } },
});
```

### 3. Immer (deep nesting, complex updates)
```typescript
import { produce } from "immer";
const updated = produce(state, draft => { draft.user.address.city = "Seoul"; });
```

**Decision**: 1-2 levels → manual spread. 3+ levels or many fields → Immer or helper functions.

## Enforcing Immutability

```typescript
// TypeScript: type-level enforcement
type Config = Readonly<{ api: string; scores: readonly number[] }>;
type DeepReadonly<T> = { readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K] };
const config = { api: "https://..." } as const;
```

Python: `@dataclass(frozen=True)`. Java: `record`. Rust: default behavior.

## Performance Reality

| Operation | Cost | When it matters |
|---|---|---|
| `{ ...obj }` shallow | O(keys) — fast for <100 keys | Almost never a bottleneck |
| `[...arr]` shallow | O(n) — fine for <10K items | Large arrays in tight loops |
| `structuredClone` deep | ~10x slower than spread | Avoid in hot paths |
| Immer `produce` | ~2-5x slower than manual spread | Fine for state management, not hot loops |

**Rule of thumb**: Immutability is free until profiling proves otherwise. Don't optimize prematurely.

## NEVER

- NEVER use `Object.freeze()` as a safety mechanism — it's shallow, has runtime cost, and silently fails in non-strict mode
- NEVER spread large arrays (>10K items) in tight loops — use mutable local accumulator, return immutable result
- NEVER assume spread is deep — `{ ...obj }` only copies one level. Nested objects are still shared references
- NEVER use `structuredClone` for simple shallow copies — it's overkill and slow
- NEVER enforce immutability on data that stays local to a single function — it adds ceremony without safety
- NEVER mutate function arguments even if "it works" — the caller doesn't expect their data to change. This is the #1 source of FP-related bugs
- NEVER mix mutable and immutable patterns in the same data flow — pick one and be consistent

## When NOT to Enforce

- Performance-critical hot loops where profiling shows spread/copy is the bottleneck
- Builder patterns where the intermediate object is never shared
- Framework APIs that expect mutation (some ORMs, game engines, Canvas APIs)
- Simple local variables that never escape the function scope
