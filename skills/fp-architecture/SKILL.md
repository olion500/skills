---
name: fp-architecture
description: "Design system architecture using functional programming principles. Pure core with impure shell, state machines as data, memoization of pure functions, type-driven development with branded types, and event sourcing patterns. Activate when: designing system architecture, separating business logic from I/O, modeling state transitions, implementing caching/memoization, creating domain models, preventing invalid states through types, or when the user mentions architecture, pure core, impure shell, state machine, memoization, branded types, event sourcing, or domain modeling. Works in any language (TypeScript, Python, Go, Rust, Java)."
---

# FP Architecture

Structure systems around FP principles. Business logic is pure. I/O lives at boundaries. State is data.

## Pure Core / Impure Shell

The most important FP architecture pattern.

```
┌─────────────────────────────────┐
│  Impure Shell (thin)            │  ← HTTP handlers, DB, file I/O, logging
│  ┌───────────────────────────┐  │
│  │  Pure Core (thick)        │  │  ← Business logic, validation, transforms
│  │  No I/O, no state, no DB  │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

```typescript
// PURE CORE — testable with plain values, zero mocks
const calculateDiscount = (order: Order): number =>
  order.total > 100 ? order.total * 0.1 : 0;

const applyDiscount = (order: Order, discount: number): Order => ({
  ...order, total: order.total - discount, discount,
});

const validateOrder = (order: Order): Result<Order, string> =>
  order.items.length === 0 ? err("Empty order")
  : order.total < 0 ? err("Negative total")
  : ok(order);

// IMPURE SHELL — thin, just wiring
async function processOrder(orderId: string) {
  const order = await db.getOrder(orderId);           // I/O
  const validated = validateOrder(order);              // pure
  if (!validated.ok) return log.error(validated.error);
  const discount = calculateDiscount(validated.value); // pure
  const final = applyDiscount(validated.value, discount); // pure
  await db.saveOrder(final);                           // I/O
}
```

**Testing**: Pure core needs zero mocks. `expect(calculateDiscount({total: 150})).toBe(15)`. Done.

### Migrating Gradually

1. **New features**: write pure core from the start
2. **Existing code**: extract one pure function at a time from impure code
3. **Don't rewrite** — wrap. Move logic out of the handler, leave I/O calls in place
4. **Test the extracted pure functions** — this alone justifies the refactoring

## State Machines as Data

Model state transitions as a pure function: `(State, Event) → State`.

```typescript
// States — invalid combinations are unrepresentable
type OrderState =
  | { status: "draft"; items: Item[] }
  | { status: "submitted"; items: Item[]; submittedAt: Date }
  | { status: "paid"; items: Item[]; paidAt: Date; txId: string }
  | { status: "cancelled"; reason: string };

type OrderEvent =
  | { type: "submit" }
  | { type: "pay"; txId: string }
  | { type: "cancel"; reason: string };

// Pure transition — every valid path is explicit
const transition = (state: OrderState, event: OrderEvent): Result<OrderState, string> => {
  switch (event.type) {
    case "submit":
      return state.status === "draft"
        ? ok({ status: "submitted", items: state.items, submittedAt: new Date() })
        : err(`Cannot submit from ${state.status}`);
    case "pay":
      return state.status === "submitted"
        ? ok({ status: "paid", items: state.items, paidAt: new Date(), txId: event.txId })
        : err(`Cannot pay from ${state.status}`);
    case "cancel":
      return state.status === "draft" || state.status === "submitted"
        ? ok({ status: "cancelled", reason: event.reason })
        : err(`Cannot cancel from ${state.status}`);
  }
};
```

**Testing**: `expect(transition(draftOrder, {type:"submit"})).toEqual(ok({status:"submitted",...}))`. No DB, no mocks.

## Memoization

Cache pure function results. Safe because same input always → same output.

```typescript
const memoize = <A extends string | number, R>(fn: (arg: A) => R) => {
  const cache = new Map<A, R>();
  return (arg: A) => cache.get(arg) ?? (cache.set(arg, fn(arg)), cache.get(arg)!);
};
```

Python: `@functools.lru_cache(maxsize=128)`. **Only memoize pure functions.** Memoizing impure functions caches stale data.

## Type-Driven Development

Use the type system to make invalid states unrepresentable.

### Branded Types — Prevent ID Mixups
```typescript
type UserId = string & { readonly __brand: "UserId" };
type OrderId = string & { readonly __brand: "OrderId" };

const getOrder = (id: OrderId): Order => ...;
getOrder(userId("123"));  // TYPE ERROR — can't pass UserId as OrderId
```

### Smart Constructors — Validated Types
```typescript
type Email = string & { readonly __brand: "Email" };

const parseEmail = (s: string): Result<Email, string> =>
  s.includes("@") ? ok(s as Email) : err("Invalid email");

// Downstream functions know email is already validated
const sendTo = (email: Email, body: string): void => ...;
```

### Making Invalid States Unrepresentable
```typescript
// BAD: allows emailVerified=true with email=undefined
type User = { name: string; email?: string; emailVerified: boolean };

// GOOD: invalid combination is impossible
type User =
  | { name: string; email: null }
  | { name: string; email: string; emailVerified: false }
  | { name: string; email: string; emailVerified: true; verifiedAt: Date };
```

## Event Sourcing (Lightweight)

Store events, not current state. Derive state by replaying. Natural fit for FP: `reduce(events) → state`.

```typescript
type CartEvent =
  | { type: "item_added"; item: Item; at: Date }
  | { type: "item_removed"; itemId: string; at: Date }
  | { type: "discount_applied"; percent: number; at: Date };

// Pure: derive state from event log
const buildCart = (events: readonly CartEvent[]): Cart =>
  events.reduce((cart, event) => {
    switch (event.type) {
      case "item_added": return { ...cart, items: [...cart.items, event.item] };
      case "item_removed": return { ...cart, items: cart.items.filter(i => i.id !== event.itemId) };
      case "discount_applied": return { ...cart, discount: event.percent };
    }
  }, emptyCart);

// Time-travel debugging
const cartAtStep5 = buildCart(events.slice(0, 5));
```

**Benefits**: Full audit trail. Reproduce any bug by replaying events. Undo = remove last event.

## NEVER

- NEVER put business logic in the impure shell — not even "just one if-statement." Extract it as a pure function
- NEVER let branded types leak their constructor — always use smart constructors (`parseEmail`, not type assertion)
- NEVER mix event sourcing with direct state mutation in the same aggregate — pick one source of truth
- NEVER memoize impure functions — `memoize(fetchUser)` returns stale data silently
- NEVER model state machines with boolean flags (`isSubmitted && !isPaid && !isCancelled`) — use discriminated unions
- NEVER skip the error case in state transitions — return Result, don't silently ignore invalid transitions
- NEVER make the impure shell "smart" — it should only wire I/O to pure core. If you're adding logic to the handler, extract it

## When NOT to Use

- **Pure core/impure shell**: When the logic IS the I/O (simple CRUD proxy with no business rules)
- **State machines**: For simple boolean flags or two-state toggles
- **Memoization**: For cheap computations where cache overhead exceeds savings
- **Branded types**: When the language doesn't support them, or internal-only code with no mixup risk
- **Event sourcing**: When current state is all you need and audit trail adds complexity without value
