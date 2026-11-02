# Backend coding standards (Go & API/Data)

Rules the Go toolchain, `gofmt`, `go vet`, `golangci-lint`, and CI do not enforce. Formatting,
import grouping, and the configured linters are intentionally omitted. Every rule cites its primary
source or the decision ticket that fixed it.

## Go idioms

### Naming and packages

- **Lower-case single-word package names; `MixedCaps` (no underscores).** Unexported names read
  `maxLength`, exported names `MaxLength`; interfaces are named method+`-er` (`Reader`). Source:
  [Effective Go: names](https://go.dev/doc/effective_go#names), [Code Review Comments:
  MixedCaps](https://go.dev/wiki/CodeReviewComments#mixed-caps).
- **The module path is dotless and local-only (`agner/dev/calc`).** Never use a remote-resolvable
  path. Source: [Foundation ticket](https://github.com/luiznaac/calc/issues/19); [Go layout
  decision](https://github.com/luiznaac/calc/issues/3).

### Flat hexagonal architecture

- **Layout**: `cmd/calculator/main.go`, `internal/calculator/domain.go`, `service.go`, and
  `adapters/{http,memory}.go`. Graduate to feature-scoped packages only when a second bounded
  context appears. Source: [Go layout decision](https://github.com/luiznaac/calc/issues/3).
- **Interfaces belong to the consumer package**; producers return concrete types. Source: [Code
  Review Comments: interfaces](https://go.dev/wiki/CodeReviewComments#interfaces).
- **Dependency direction**: adapters depend inward on the service/domain; domain and service import
  no I/O, HTTP, or framework packages. Source: [Go layout
  decision](https://github.com/luiznaac/calc/issues/3).

### Errors

- **Errors are values**; handle them with `if err != nil { return err }`. Source: [Go blog: errors
  are values](https://go.dev/blog/errors-are-values).
- **Error strings are lowercase and punctuation-free**; wrap with `%w` when adding context; never
  panic for normal errors. Source: [Code Review Comments: error
  strings](https://go.dev/wiki/CodeReviewComments#error-strings), [indent error
  flow](https://go.dev/wiki/CodeReviewComments#indent-error-flow).
- **Domain errors are typed values** (`DIVISION_BY_ZERO`, `SQRT_OF_NEGATIVE`, `COMPLEX_RESULT`,
  `INDETERMINATE`, `OVERFLOW`, `INVALID_NUMBER`), not strings matched at the edge. Source:
  [Domain semantics](https://github.com/luiznaac/calc/issues/5); [API
  contract](https://github.com/luiznaac/calc/issues/6).

### Context

- **`context.Context` is the first parameter** (`func F(ctx context.Context, ...)`); never a struct
  member; no custom Context types. Source: [Code Review Comments:
  contexts](https://go.dev/wiki/CodeReviewComments#contexts).

### Testing

- **Table-driven tests** with `[]struct{...}` and `t.Run`; failure messages put the actual value
  first (`t.Errorf("got %q, want %q")`); use `httptest` for in-process HTTP tests and `go-cmp` for
  deep comparisons. Source: [Go wiki: table-driven
  tests](https://go.dev/wiki/TableDrivenTests), [Code Review Comments: useful test
  failures](https://go.dev/wiki/CodeReviewComments#useful-test-failures).
- **Native fuzzing for the parser and `pgregory.net/rapid` for arithmetic invariants.** Source:
  [Testing strategy](https://github.com/luiznaac/calc/issues/7).

### Documentation

- **Full sentences; start with the exported name; end with a period.** Package comments sit before
  `package` with no blank line and a capitalized first word. Source: [Code Review Comments: comment
  sentences](https://go.dev/wiki/CodeReviewComments#comment-sentences), [package
  comments](https://go.dev/wiki/CodeReviewComments#package-comments).

## API and data

### Endpoint

- **One endpoint: `POST /api/v1/calculate`** with `{operation, operands}`; JSON numbers, a 1 MiB
  cap, lenient unknown fields, and no CORS (same-origin). Source: [API
  contract](https://github.com/luiznaac/calc/issues/6).
- **Routing**: unknown paths return 404; non-POST returns 405 with `Allow: POST`; no trailing-slash
  redirects; `GET /healthz` returns `ok\n`. Source: [API
  contract](https://github.com/luiznaac/calc/issues/6).

### Error model

- **RFC 9457 `application/problem+json`** with required `code` and optional `field`; 400 is a
  syntax/request-shape error and 422 is a semantic math error. Source: [API
  contract](https://github.com/luiznaac/calc/issues/6); [Domain
  semantics](https://github.com/luiznaac/calc/issues/5).
- **No `NaN`/`Inf` in success responses**; every error class in the contract maps to its documented
  status. Source: [Domain semantics](https://github.com/luiznaac/calc/issues/5).

### Math semantics

- **IEEE 754 `float64`**; shortest round-trip JSON numbers; binary `add`/`subtract`/`multiply`/
  `divide`/`power`; unary `sqrt`/`negate`/`percent`; `percent(x) = x / 100`. Source: [Domain
  semantics](https://github.com/luiznaac/calc/issues/5).
- **Underflow follows IEEE 754** (it may become `0`) and is not an error; overflow is a typed
  `OVERFLOW` error. Source: [Domain semantics](https://github.com/luiznaac/calc/issues/5).

## References

- [Go layout decision](https://github.com/luiznaac/calc/issues/3)
- [Domain semantics](https://github.com/luiznaac/calc/issues/5)
- [API contract](https://github.com/luiznaac/calc/issues/6)
- [Testing strategy](https://github.com/luiznaac/calc/issues/7)
- [Foundation ticket](https://github.com/luiznaac/calc/issues/19)
- Primary sources: [Effective Go](https://go.dev/doc/effective_go), [Go Code Review
  Comments](https://go.dev/wiki/CodeReviewComments), [Go Modules
  Reference](https://go.dev/ref/mod).
