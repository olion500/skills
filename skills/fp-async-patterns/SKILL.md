---
name: fp-async-patterns
description: "Apply functional programming to asynchronous operations. Lazy evaluation with generators/iterators, async pipelines, parallel vs sequential execution, retry with backoff, fallback chains, and stream composition. Activate when: building async workflows, processing data streams, implementing retry logic, handling concurrent operations, working with generators/iterators, or when the user mentions lazy evaluation, async pipeline, parallel execution, retry, backoff, stream processing, or iterator patterns. Works in any language (TypeScript, Python, Go, Rust, Java)."
---

# FP Async Patterns

Apply FP principles to async code. Keep async operations composable, testable, and recoverable.

## Before Designing Async Flow, Ask Yourself

1. **Are these operations independent?** → Parallel (`Promise.all`, `asyncio.gather`, goroutines)
2. **Does each step depend on the previous?** → Sequential railway (andThen chain)
3. **Can this fail transiently?** (network, rate limit) → Retry with backoff
4. **Is the data too large for memory?** → Lazy evaluation / streaming
5. **Is the operation idempotent?** → If no, NEVER retry

## Lazy Evaluation — Process Only What You Need

Defer computation until consumed. Critical for large datasets and infinite sequences.

### When Lazy Wins

| Scenario | Eager (wasteful) | Lazy (efficient) |
|----------|-----------------|-----------------|
| First match in large dataset | Process all, then find | Stop at first match |
| Paginated API results | Fetch all pages upfront | Fetch pages on demand |
| Log file processing | Load entire file | Stream line by line |
| Data pipeline with early filter | Transform all, then filter | Filter first, transform survivors |

### Implementation

```typescript
// TypeScript: generator composition
function* filterGen<T>(pred: (x: T) => boolean, gen: Iterable<T>) {
  for (const x of gen) if (pred(x)) yield x;
}
function* mapGen<T, U>(fn: (x: T) => U, gen: Iterable<T>) {
  for (const x of gen) yield fn(x);
}
// Compose — nothing executes until iterated
const pipeline = filterGen(isActive, mapGen(parse, readLines(path)));
for (const item of pipeline) { /* process one at a time */ }
```

Python: generator expressions + `itertools` (native lazy). Rust: `.iter().map().filter().collect()` (lazy until `.collect()`).

## Async Railway — Chain Fallible Async Operations

Combine Result pattern with async. If any step fails, skip the rest.

```typescript
const asyncAndThen = async <T, U, E>(
  result: Promise<Result<T, E>>,
  fn: (value: T) => Promise<Result<U, E>>
): Promise<Result<U, E>> => {
  const r = await result;
  return r.ok ? fn(r.value) : r;
};

const processOrder = (id: string) =>
  asyncAndThen(asyncAndThen(fetchOrder(id), validateOrder), chargePayment);
```

## Parallel vs Sequential Decision

| Situation | Use | Pattern |
|---|---|---|
| Independent fetches | Parallel | `Promise.all([a(), b(), c()])` |
| Dependent chain | Sequential | `a().then(b).then(c)` |
| Independent but want all results even if some fail | Parallel + collect | `Promise.allSettled(...)` |
| Fan-out then aggregate | Parallel + reduce | `Promise.all(items.map(fn)).then(merge)` |

## Retry with Exponential Backoff

Separate pure configuration from impure execution.

```typescript
// Pure: configuration as data
type RetryConfig = Readonly<{ maxAttempts: number; baseDelay: number; maxDelay: number }>;
const defaultRetry: RetryConfig = { maxAttempts: 3, baseDelay: 1000, maxDelay: 10000 };

// Pure: compute delay
const retryDelay = (config: RetryConfig, attempt: number): number =>
  Math.min(config.baseDelay * 2 ** attempt, config.maxDelay);

// Impure: execute with retry (boundary)
const withRetry = async <T>(config: RetryConfig, fn: () => Promise<T>): Promise<Result<T, Error>> => {
  for (let i = 0; i < config.maxAttempts; i++) {
    try { return ok(await fn()); }
    catch (e) {
      if (i === config.maxAttempts - 1) return err(e instanceof Error ? e : new Error(String(e)));
      await sleep(retryDelay(config, i));
    }
  }
  return err(new Error("Unreachable"));
};
```

**Key insight**: RetryConfig is pure data. `retryDelay` is a pure function. Only `withRetry` is impure. The pure parts are independently testable.

## Fallback Chains

Try alternatives in order until one succeeds. Collect all errors if all fail.

```typescript
const withFallback = async <T>(...fns: Array<() => Promise<T>>): Promise<Result<T, Error[]>> => {
  const errors: Error[] = [];
  for (const fn of fns) {
    try { return ok(await fn()); }
    catch (e) { errors.push(e instanceof Error ? e : new Error(String(e))); }
  }
  return err(errors);
};

// Try primary → replica → cache
const data = await withFallback(
  () => fetchFromPrimary(id),
  () => fetchFromReplica(id),
  () => fetchFromCache(id),
);
```

## Stream Composition — Process Without Loading All Into Memory

```typescript
// Node.js
createReadStream(path).pipe(split2()).pipe(filterTransform(isActive)).pipe(outputStream);
```

```python
# Python: generators are native streams
def process_file(path):
    with open(path) as f:
        yield from (json.loads(line) for line in f if '"active"' in line)
```

```rust
BufReader::new(File::open(path)?)
    .lines()
    .filter_map(|l| l.ok())
    .filter_map(|l| serde_json::from_str(&l).ok())
    .filter(|r: &Record| r.status == "active")
```

## NEVER

- NEVER retry non-idempotent operations (POST that creates a resource, payment charges) — you'll create duplicates
- NEVER use generators/lazy evaluation for small collections (<100 items) — eager is simpler and equally fast
- NEVER mix lazy and eager in the same pipeline without understanding when evaluation happens — `[...generator]` forces eager evaluation, defeating the purpose
- NEVER retry without a maximum — always set `maxAttempts` and `maxDelay`
- NEVER use `Promise.all` when any single failure should NOT cancel the others — use `Promise.allSettled` instead
- NEVER add retry to mask a real bug — if it fails deterministically, retry just delays the failure
- NEVER use backoff without jitter in distributed systems — all clients retry at the same time, causing thundering herd
