# Frontend coding standards (React/TS)

Rules the React/TypeScript toolchain, ESLint, Prettier, and `tsc --noEmit` do not enforce. Formatting,
import order, and the rules the configured linters already enforce are intentionally omitted. Every
rule cites its primary source or the decision ticket that fixed it.

## Toolchain note

TypeScript 7 is the native compiler. `tsc --noEmit` is the type authority. ESLint parses TypeScript
and TSX through Babel (`@babel/eslint-parser`) because TypeScript 7 does not expose the stable
compiler API that typescript-eslint needs; type-aware lint rules stay out of scope until that parser
supports TypeScript 7. Keep types accurate through `tsc --noEmit` and the strict settings in
`tsconfig.base.json`.

## Components and files

- **PascalCase for component files and component names**; one component per file; function
  components only. Source: [React: Your First Component](https://react.dev/learn/your-first-component).
- **Folder structure**: `src/{app,components,features,styles,lib,test}`. Feature code lives under
  `features/<feature>`, shared UI under `components`, and shared utilities under `lib`. Source:
  [React stack decision](https://github.com/luiznaac/calc/issues/4).

## Hooks and state

- **Follow the Rules of Hooks**; custom hooks start with `use`; keep dependency arrays exhaustive.
  Source: [Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks).
- **Use `useReducer` for multi-field or transition-heavy state**; reducers are pure; actions are
  discriminated unions; state updates are immutable. Source:
  [useReducer](https://react.dev/reference/react/useReducer);
  [Interaction contract](https://github.com/luiznaac/calc/issues/15).
- **Strict Mode double-invokes reducers and effects in development**; keep both side-effect-free.
  Source: [React Strict Mode](https://react.dev/reference/react/StrictMode).

## TypeScript strict mode

- **Enable `strict: true`**, `noUncheckedIndexedAccess`, `noImplicitOverride`, and the rest of the
  strict settings in `tsconfig.base.json`. Source: [TypeScript:
  strict](https://www.typescriptlang.org/docs/handbook/2/basic-types.html).
- **No `any`**; use `unknown` at boundaries and narrow with type guards. Prefer discriminated unions
  for API results and error states. Source: [React stack
  decision](https://github.com/luiznaac/calc/issues/4).
- **Use type-only imports** (`import type`) for types; keep runtime imports separate. Source:
  [typescript-eslint: consistent-type-imports](https://typescript-eslint.io/rules/consistent-type-imports/).

## CSS Modules

- **Use camelCase class names** (`styles.className`); local scope by default; use `composes` for
  shared styles. Source: [CSS Modules
  naming](https://github.com/css-modules/css-modules/blob/master/docs/naming.md), [CSS Modules
  composition](https://github.com/css-modules/css-modules/blob/master/docs/composition.md).
- **The visual language is locked**: paper-ledger tokens, the two-line display, and the keypad
  geometry. Do not restyle them ad hoc. Source: [GUI
  prototype](https://github.com/luiznaac/calc/issues/16).

## Accessibility

- **Semantic HTML first; ARIA only when semantics are insufficient**; keyboard navigation and visible
  focus are mandatory. Source: [eslint-plugin-jsx-a11y](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y);
  [Interaction contract](https://github.com/luiznaac/calc/issues/15).
- **Single-character shortcuts are container-scoped**, never a `window` listener, so they are active
  only while the calculator has focus; `Tab` stays native. Source: [APG: keyboard
  interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/), [WCAG 2.1.4 character
  key shortcuts](https://www.w3.org/WAI/WCAG21/Understanding/character-key-shortcuts.html).

## Testing

- **Vitest test files use `.test.` naming**; React Testing Library with `user-event`; MSW 2.x for
  API mocking; query by role or label. Source: [Vitest guide](https://vitest.dev/guide/), [RTL
  intro](https://testing-library.com/docs/react-testing-library/intro/).
- **Coverage is hard-gated at 80% lines and branches on `src/`.** Source: [Testing
  strategy](https://github.com/luiznaac/calc/issues/7).
- **Playwright covers the transition rows and smoke journeys**; keep the tests thin and
  end-to-end. Source: [Interaction contract](https://github.com/luiznaac/calc/issues/15); [Testing
  strategy](https://github.com/luiznaac/calc/issues/7).

## Lint and format

- **ESLint flat config** with `@eslint/js`, `eslint-plugin-jsx-a11y`, and
  `eslint-plugin-react-hooks`; Prettier for formatting. Source: [React stack
  decision](https://github.com/luiznaac/calc/issues/4); [CI pipeline](https://github.com/luiznaac/calc/issues/10).
- **No suppressions without a reason.** A disabled rule carries a one-line justification and the
  narrowest possible scope. Source: workspace agent conventions (global `AGENTS.md`).

## References

- [React stack decision](https://github.com/luiznaac/calc/issues/4)
- [Testing strategy](https://github.com/luiznaac/calc/issues/7)
- [Interaction contract](https://github.com/luiznaac/calc/issues/15)
- [GUI prototype](https://github.com/luiznaac/calc/issues/16)
- [Foundation ticket](https://github.com/luiznaac/calc/issues/19)
- Primary sources: [React](https://react.dev), [TypeScript](https://www.typescriptlang.org/docs/),
  [Vitest](https://vitest.dev), [Testing Library](https://testing-library.com), [Playwright](https://playwright.dev).
