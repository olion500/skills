# FP Idioms by Language — Quick Reference

Use the language's native FP tools. Don't force one language's idiom into another.

| Pattern | TypeScript | Python | Go | Rust | Java |
|---------|-----------|--------|-----|------|------|
| Pure fn | `const f = (x) =>` | `def f(x):` | `func f(x)` | `fn f(x) ->` | `static` method |
| Immutable | `Readonly<T>`, `as const` | `@dataclass(frozen=True)` | value copy | ownership (default) | `record` |
| Absent value | `T \| undefined` | `Optional[T]` | `val, ok` | `Option<T>` | `Optional<T>` |
| Error as value | `{ok,value}\|{ok,error}` | `Ok\|Err` union | `val, err` | `Result<T,E>` | `Result<T>` |
| Compose | `pipe()` / chain | `reduce`, comprehension | func chaining | `.iter().map().collect()` | `Stream` API |
| Pattern match | discriminated union + switch | `match` (3.10+) | type switch | `match` | `sealed` + `switch` |
| Higher-order | `Array.map/filter` | `map`, `filter`, lambda | func type args | closures, `Fn` | `Stream.map/filter` |
| Sum types | tagged union | `Union` / `Enum` | interface + struct | `enum` | `sealed interface` |

**Key insight**: Go's `val, err` IS FP's Either. Rust's ownership IS FP's immutability. Python's comprehensions ARE FP's map/filter. Use native tools, not imported abstractions.
