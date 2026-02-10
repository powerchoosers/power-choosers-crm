# TypeScript & Build Practices — Avoid “Every Other Build” Failures

Coding and workflow practices to prevent TypeScript/build errors during development and deploy (see `build.md` for past examples). **All practices below are aligned with official TypeScript, Next.js, and React documentation.**

---

## Official documentation (reference)

| Source | URL | Use for |
|--------|-----|--------|
| **TypeScript TSConfig** | https://www.typescriptlang.org/tsconfig | `strict`, `target`, `strictNullChecks`, `noImplicitAny`, etc. |
| **TypeScript Handbook – Everyday Types** | https://www.typescriptlang.org/docs/handbook/2/everyday-types.html | Optional properties, `undefined`, type annotations, narrowing |
| **TypeScript – strict** | https://www.typescriptlang.org/tsconfig/strict | What `strict` enables; future TS versions may add stricter checks |
| **TypeScript – target** | https://www.typescriptlang.org/tsconfig/target | Which JS features are valid for your target (e.g. ES2018 for regex `s` flag) |
| **Next.js – TypeScript** | https://nextjs.org/docs/app/building-your-application/configuring/typescript | Type checking during build, `tsc --noEmit`, `ignoreBuildErrors`, incremental type checking |
| **React – Rules of Hooks** | https://react.dev/reference/rules/rules-of-hooks | Top-level hook order; only call Hooks at the top level |

---

## 1. Run typecheck before build (and in CI)

**Problem:** `next build` runs TypeScript and fails the build when errors exist. If you only run `next build` at deploy time, you discover type errors too late.

**Practice (aligned with Next.js and TypeScript):**

- **Next.js:** “You can run `tsc --noEmit` to check for TypeScript errors yourself before building. This is useful for CI/CD pipelines where you’d like to check for TypeScript errors before deploying.” ([Next.js TypeScript](https://nextjs.org/docs/app/building-your-application/configuring/typescript))
- **Locally:** Before pushing or deploying, run from `crm-platform/`: `npm run typecheck` (which runs `tsc --noEmit`). Fix any errors before `npm run build`.
- **Script:** Use `build:safe` (e.g. `npm run typecheck && next build`) when you want the build to only run if typecheck passes.
- **CI:** Run `npm run typecheck` or `build:safe` in your pipeline so broken types never reach production. Do **not** rely on `typescript.ignoreBuildErrors: true` to “fix” builds; Next.js warns this is dangerous unless you run type checks elsewhere.

---

## 2. Keep `target` (and `lib`) aligned with features you use

**Problem:** “This regular expression flag is only available when targeting 'es2018' or later” when using the regex `s` (dotall) flag.

**Practice (from TypeScript TSConfig):**

- **TypeScript – target:** “The `target` setting changes which JS features are downleveled and which are left intact.” “You might choose to set a lower target if your code is deployed to older environments, or a higher target if your code is guaranteed to run in newer environments.” ([TSConfig target](https://www.typescriptlang.org/tsconfig/target))
- In `crm-platform/tsconfig.json`, set `compilerOptions.target` to **`ES2018`** (or higher) if you use:
  - Regex `s` (dotall) flag: `/foo/s`
  - Other ES2018+ language features
- Avoid using syntax or APIs that require a higher language level than your `target`. When in doubt, check the [TypeScript TSConfig reference](https://www.typescriptlang.org/tsconfig#target) for `target` and `lib`.

---

## 3. Prefer `undefined` for “no value”; be explicit with `null` (strictNullChecks)

**Problem:** “Type 'null' is not assignable to type 'string | undefined'” in mock data or props.

**Practice (from TypeScript strictNullChecks and handbook):**

- **strictNullChecks:** When `strict` is true, `strictNullChecks` is on. Then `null` and `undefined` are distinct types; you cannot use them where a concrete type is expected unless the type explicitly includes them. ([TSConfig strict](https://www.typescriptlang.org/tsconfig/strict), strictNullChecks)
- **Optional properties:** “In JavaScript, if you access a property that doesn’t exist, you’ll get the value `undefined`.” When *reading* an optional property, you have to check for `undefined` before using it. ([Handbook – Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html))
- **Optional parameters:** In strict null checking mode, optional parameters automatically get `undefined` in their type (e.g. `x?: number` ⇒ `number | undefined`). You must handle `undefined` before using the value.
- **Conventions:** Prefer `undefined` (and `string | undefined`) for “no value” and optional fields. Use `null` only when the type or API explicitly expects `null` (e.g. `string | null`).
- **Mock data/fixtures:** Match the real type: if the type is `entity?: string` or `entity: string | undefined`, use `entity: undefined`, not `entity: null`.
- **Narrowing:** Use `if (x != null)` or `if (x !== undefined)` (or optional chaining `x?.`) to narrow before use.

---

## 4. Third-party API types: match callback signatures exactly

**Problem:** “Type 'X' is not assignable to type 'Y'” for TanStack Table `onPaginationChange`, Recharts `formatter`, etc., when our callback doesn’t match the library’s types (e.g. `Updater<T>` vs direct value, or `string | undefined` vs `string`).

**Practice (from TypeScript handbook and type checking):**

- **TypeScript:** “When a parameter has a type annotation, arguments to that function will be checked.” ([Handbook – Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)) When you pass a callback into a library, your function’s parameter and return types must match what the library’s types declare.
- **Callbacks:** Use the **exact** parameter and return types the library expects. If the type is `(value: number, name: string) => ...`, do not use `(value: number | undefined, name: string | undefined)` unless the library’s type allows it.
- **Optional parameters:** If the library marks a parameter as optional (`name?: string`), you can still use `name: string` inside the callback if you guard (e.g. `if (name === undefined) return ...`).
- **Updater vs value:** For APIs that accept `Updater<T>` (e.g. `(prev: T) => T` or `T`), pass a function that matches that signature; don’t pass a different setState-style signature unless the types allow it.
- **Inference:** Use the IDE (hover on the prop/parameter) or the library’s `.d.ts` to see the exact expected type and align your callback to it.

---

## 5. Hook declaration order: declare before use (Rules of Hooks + TDZ)

**Problem:** “Block-scoped variable 'sendWithMessage' used before its declaration” when a `useEffect` (or similar) lists a callback in its dependency array that is declared later in the same component.

**Practice (from React and TypeScript):**

- **React – Rules of Hooks:** “Only call Hooks at the top level.” “Don’t call Hooks inside loops, conditions, nested functions, or try/catch/finally blocks. Instead, always use Hooks at the top level of your React function, before any early returns.” ([Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks)) Declaring a callback (e.g. with `useCallback`) and then using it in another Hook’s dependency array is fine only if the callback is declared **above** that Hook.
- **Declaration order:** Declare every hook and callback that appears in another hook’s dependency array **above** the hook that uses it. Example: declare `sendWithMessage` (e.g. via `useCallback`) **before** any `useEffect` that has `sendWithMessage` in its dependency array.
- **Rule of thumb:** Order hooks and callbacks in “dependency order”: no hook should reference a name that is declared later in the same component. This avoids Temporal Dead Zone (TDZ) errors and respects the Rules of Hooks.
- Use **eslint-plugin-react-hooks** to catch hook misuse; it does not replace correct declaration order for dependencies.

---

## 6. Types and runtime shape: keep types in sync with data

**Problem:** “Property 'companyPhone' does not exist on type 'ContactRow'” when the code or API uses a field that isn’t on the TypeScript type.

**Practice (from TypeScript structural typing and project rules):**

- **TypeScript:** TypeScript is structurally typed; it checks that values have the expected properties. If you use a property at runtime, the type must declare it (or you must narrow/assert appropriately). ([Handbook – Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html))
- When adding or using a new field (Supabase, API, form data), **update the corresponding TypeScript type/interface** in the same change (e.g. in `types/`, or next to the hook that maps the row).
- When mapping API/DB rows to UI types, only include properties that exist on the source type, or extend the source type first.
- **BulkImportModal / ingestion:** When you add fields to Accounts or Contacts for editing, add them to the mapping schemas per project rules so types and ingestion stay in parity.

---

## 7. Keep `strict` on; fix types instead of relaxing options

**Practice (from TypeScript TSConfig):**

- **strict:** “The `strict` flag enables a wide range of type checking behavior that results in stronger guarantees of program correctness.” “Future versions of TypeScript may introduce additional stricter checking under this flag, so upgrades of TypeScript might result in new type errors in your program.” ([TSConfig strict](https://www.typescriptlang.org/tsconfig/strict))
- Keep **`strict: true`** in `tsconfig.json`. Avoid turning off strict options (e.g. `strictNullChecks`, `noImplicitAny`) to “fix” build errors; prefer correcting types or adding narrowings/guards.
- **noImplicitAny:** With `strict`, parameters and variables that would be inferred as `any` are flagged. Use explicit types or fix inference instead of disabling this. ([TSConfig noImplicitAny](https://www.typescriptlang.org/tsconfig#noImplicitAny))
- Run **`npm run typecheck`** regularly during development and fix editor diagnostics (red squiggles) early rather than deferring to build time.

---

## 8. Next.js: use built-in type checking; optional incremental

**Practice (from Next.js TypeScript docs):**

- **Build:** Next.js runs TypeScript during `next build` and fails the build when type errors are present. Rely on this; don’t disable it with `ignoreBuildErrors: true` unless you run type checks elsewhere (e.g. CI with `tsc --noEmit`). ([Next.js TypeScript](https://nextjs.org/docs/app/building-your-application/configuring/typescript))
- **Include:** Ensure `next-env.d.ts` and `.next/types/**/*.ts` are in your `tsconfig.json` `include` so generated types are type-checked. ([Next.js TypeScript](https://nextjs.org/docs/app/building-your-application/configuring/typescript))
- **Incremental:** Next.js supports [incremental type checking](https://www.typescriptlang.org/tsconfig#incremental) when enabled in `tsconfig.json`; use it in larger apps to speed up type checking. ([Next.js TypeScript](https://nextjs.org/docs/app/building-your-application/configuring/typescript))

---

## 9. Optional: pre-commit or CI typecheck

**Practice:**

- **Pre-commit:** Run `npm run typecheck` (e.g. via Husky + lint-staged, or a pre-commit script) so commits that don’t typecheck are rejected.
- **CI:** Run `npm run typecheck` or `build:safe` in CI so broken types never get merged or deployed. This matches the Next.js recommendation to use `tsc --noEmit` in CI.

---

## Summary table

| Category              | Practice | Official reference |
|-----------------------|----------|--------------------|
| When to typecheck     | Before every build/deploy; in CI; optionally pre-commit. | Next.js: run `tsc --noEmit` before deploy |
| Target / lib          | Use `ES2018`+ if using regex `s` flag or other ES2018+ features. | TSConfig [target](https://www.typescriptlang.org/tsconfig/target) |
| null vs undefined     | Prefer `undefined` for optional; use `null` only when type allows. | [strictNullChecks](https://www.typescriptlang.org/tsconfig/strictNullChecks), [Handbook](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html) |
| Third-party callbacks | Match library callback signatures exactly (params and return). | TypeScript parameter/return type checking |
| Hook order            | Declare callbacks/hooks before any hook that lists them in deps. | [Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks) |
| New fields            | Update TypeScript types and mapping schemas when adding/using new fields. | Structural typing, project BulkImport rules |
| Strict mode           | Keep `strict: true`; fix types instead of relaxing options. | [TSConfig strict](https://www.typescriptlang.org/tsconfig/strict) |
| Next.js               | Don’t use `ignoreBuildErrors` without another type-check step. | [Next.js TypeScript](https://nextjs.org/docs/app/building-your-application/configuring/typescript) |

---

## Reference: past error patterns (from `build.md`)

| Error pattern | Fix | Section |
|---------------|-----|---------|
| TanStack Table `onPaginationChange` (Updater vs OnChangeFn) | Match exact `Updater`/library signature | §4 |
| Regex `/something/s` (ES2018+) | Set `target` to `ES2018` or avoid `s` flag | §2 |
| Mock data `entity: null` where type was optional string | Use `undefined` or type that allows `null` | §3 |
| Recharts formatter `name` optional vs required | Match library formatter type; guard if needed | §4 |
| GeminiChat: `sendWithMessage` used before declaration | Move `sendWithMessage` (e.g. `useCallback`) above `useEffect` | §5 |
| useContacts: `companyPhone` on `ContactRow` | Add `companyPhone` to `ContactRow` type and mapping | §6 |

---

*Use this file in Cursor rules (e.g. in `.cursor/rules/` or project instructions) so the AI and developers follow these practices and avoid recurring build failures. All practices are traceable to TypeScript, Next.js, or React official documentation.*
