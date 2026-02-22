---
name: fp-composition
description: "Build complex behavior by composing small, reusable functions. Covers currying, partial application, pipe/flow, data-last design, and building utility libraries from tiny pieces. Activate when: creating utility functions, building data processing pipelines, chaining transformations, refactoring large functions into smaller ones, or when the user mentions pipe, compose, curry, partial application, point-free, data-last, or function composition. Works in any language (TypeScript, Python, Go, Rust, Java)."
---

# FP Composition

Build complex behavior from small functions. Each does one thing. Combine into pipelines.

## Before Composing, Ask Yourself

1. **Will this pipeline be reused?** → `flow` (create named reusable function). If one-off → `pipe` or inline.
2. **Does this have branching logic?** → Composition is wrong tool. Use if/match instead.
3. **Are the steps all `T → T` (same type)?** → Simple pipe. Mixed types → name intermediate steps for readability.
4. **Will the team understand this?** → If >3 steps in point-free, add names.

## Pipe vs Flow

**pipe**: transform a value now. **flow**: create a reusable function for later.

```typescript
// pipe — immediate
const slug = pipe("  Hello World  ", trim, toLowerCase, replaceSpaces);

// flow — reusable
const slugify = flow(trim, toLowerCase, replaceSpaces);
slugify("  Hello World  ");  // reuse many times
```

Implementation (no library needed):
```typescript
const pipe = (value, ...fns) => fns.reduce((acc, fn) => fn(acc), value);
const flow = (...fns) => (value) => fns.reduce((acc, fn) => fn(acc), value);
```

Python: `reduce(lambda acc, fn: fn(acc), fns, value)`. Rust: method chaining IS composition. Go: explicit function calls.

## Currying: Specialize General Functions

Convert `f(a, b)` into `f(a)(b)` to create specialized versions.

```typescript
const withPrefix = (prefix: string) => (s: string) => `${prefix}${s}`;
const apiUrl = withPrefix("https://api.example.com");

apiUrl("/users");    // "https://api.example.com/users"
apiUrl("/products"); // "https://api.example.com/products"

// Practical: config-level currying
const fetchWithAuth = (token: string) => (method: string) => (url: string) =>
  fetch(url, { method, headers: { Authorization: `Bearer ${token}` } });

const authedGet = fetchWithAuth(myToken)("GET");
authedGet("/api/users");
```

Python: `functools.partial(fn, fixed_arg)`.

## Data-Last Design

Put the data argument last. This makes functions composable with `pipe`/`map`.

```typescript
// BAD: data-first — can't compose
const filterByAge = (users: User[], min: number) => users.filter(u => u.age >= min);

// GOOD: data-last — composes naturally
const filterByAge = (min: number) => (users: User[]) => users.filter(u => u.age >= min);

const getActiveAdults = flow(filterByAge(18), filterByActive(true), sortBy("name"));
```

## Building Reusable Utilities

Small curried functions compose into powerful domain logic:

```typescript
const prop = (key) => (obj) => obj[key];
const gt = (min) => (n) => n > min;
const not = (fn) => (x) => !fn(x);

// Compose into domain logic
const isAdult = flow(prop("age"), gt(17));
const isGmail = flow(prop("email"), (s) => s.includes("@gmail"));

users.filter(isAdult);
users.filter(not(isGmail));
```

## Debugging Pipelines

Insert `tap` to inspect intermediate values without breaking the chain:

```typescript
const tap = (label) => (value) => { console.log(`[${label}]`, value); return value; };

const result = pipe(rawData, parseInput, tap("parsed"), validate, tap("validated"), transform);
```

## When Composition Breaks Down

Composition is NOT the right tool when:
- **Branching logic**: if step 2 depends on which path step 1 took, use explicit if/match
- **Error recovery mid-pipeline**: if you need to catch and retry at step 3, break the pipeline
- **Context from multiple earlier steps**: if step 4 needs results from both step 1 and step 3, use named variables
- **TypeScript type inference**: pipe loses inference after ~5 steps — break into named intermediate functions

## NEVER

- NEVER curry more than 3 levels deep — becomes unreadable. Use an options object: `fetchWith({ token, method, url })`
- NEVER use point-free when the reader has to mentally reconstruct the types — `flow(prop("age"), gt(17))` is fine, `flow(map(prop("x")), filter(gt(0)), reduce(add, 0))` is too much
- NEVER compose functions with different error-handling strategies in one pipeline — if some return Result and some throw, normalize first
- NEVER create a utility function used exactly once — inline it. Composition is for reuse
- NEVER force data-last when the language convention is data-first — Go and Python are data-first; don't fight the ecosystem
- NEVER pipe into a function that has side effects in the middle — side effects go at the end or outside the pipeline
