---
name: fp-error-handling
description: "Handle errors as values instead of throwing exceptions. Result/Either pattern, railway-oriented programming, and validation with error accumulation. Activate when: writing error handling, try/catch blocks, validation logic, operations that can fail, chaining fallible operations, form validation, API input validation, or when the user mentions Result, Either, error handling, or validation patterns. Works in any language (TypeScript, Python, Go, Rust, Java)."
---

# FP Error Handling

Treat errors as data, not control flow. Functions that can fail return `Result<Success, Error>` instead of throwing.

## Before Choosing an Error Strategy, Ask Yourself

1. **Is the caller expected to handle this?** → Return Result
2. **Is this a programmer bug?** (null deref, out of bounds) → throw/panic is correct
3. **Can recovery happen locally?** → Result with fallback
4. **Should it propagate to a global handler?** → throw/let it crash
5. **Can multiple things fail independently?** → Validation (collect all errors)

## The Three Patterns

### Pattern 1: Result — Single Operation That Can Fail

Return success or error as a value. Type signature makes failure explicit.

```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

Other languages: Python `Ok|Err` dataclass union, Go `val, err` (already idiomatic), Rust `Result<T,E>` (built-in), Java `sealed interface`.

### Pattern 2: Railway — Chain Operations That Can Each Fail

If any step fails, skip the rest. Errors flow along the "error rail."

```
Input → [validate] → [normalize] → [save] → Output
              ↓            ↓           ↓
           Error ─────────────────────────→ Error
```

```typescript
const andThen = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> =>
  result.ok ? fn(result.value) : result;

// Chain: stops at first failure
const processUser = (input: RawInput): Result<User, string> =>
  andThen(andThen(validateEmail(input), normalizeUser), saveUser);
```

### Pattern 3: Validation — Collect ALL Errors

Don't stop at the first error. Show the user everything wrong at once.

```typescript
const validateUser = (input: RawUser): Result<User, string[]> => {
  const errors: string[] = [];
  if (!input.email?.includes("@")) errors.push("Invalid email");
  if (!input.name?.trim()) errors.push("Name required");
  if (!input.age || input.age < 0) errors.push("Invalid age");

  return errors.length === 0
    ? ok({ email: input.email, name: input.name.trim(), age: input.age })
    : err(errors);
};
```

## Decision Tree: Which Pattern When

| What you're doing | Pattern | Why |
|---|---|---|
| Parse/validate a single value | Result | One thing can go wrong |
| Chain dependent async operations (fetch → process → save) | Railway | Each step depends on previous |
| Form/API input validation | Validation | User needs all errors at once |
| Mixed: validate input then process | Validation first → Railway after | Validate all fields, then chain processing |

## Boundary Conversion

### Wrapping throw-based code into Result
```typescript
const tryCatch = <T>(fn: () => T): Result<T, Error> => {
  try { return ok(fn()); }
  catch (e) { return err(e instanceof Error ? e : new Error(String(e))); }
};
```

### Unwrapping Result at API/HTTP boundary
```typescript
app.post("/users", (req, res) => {
  const result = processUser(req.body);
  if (result.ok) res.json(result.value);
  else res.status(400).json({ errors: result.error });
});
```

**Principle**: Result lives inside your domain. Convert at boundaries (HTTP handlers, CLI output, third-party libraries).

## NEVER

- NEVER return `Result<T, string>` in production — use typed error unions: `Result<User, "not_found" | "inactive" | "rate_limited">`
- NEVER nest Results (`Result<Result<T, E1>, E2>`) — use `andThen`/`flatMap` to flatten
- NEVER catch-and-rewrap errors that should propagate — if you can't handle it, let it bubble
- NEVER wrap every function in Result — only functions where failure is expected and the caller must decide
- NEVER mix Result and throw in the same module — pick one strategy per layer
- NEVER use Result for truly exceptional situations (OOM, corrupted state) — those should crash
- NEVER forget to handle the error case — the whole point is making it impossible to ignore; if you write `result.value` without checking `result.ok`, you've defeated the purpose

## When NOT to Use

- Simple null checks where `?.` or `if` suffices
- Languages where errors-as-values is already idiomatic (Go's `val, err`, Rust's `Result`)
- When the team hasn't adopted Result types — introduce gradually, starting at one boundary
