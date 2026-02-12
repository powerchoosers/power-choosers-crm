# TypeScript & Build Practices — Avoid “Every Other Build” Failures

Coding and workflow practices to prevent TypeScript/build errors during development and deploy (see `build.md` for past examples). **All practices below are aligned with official TypeScript, Next.js, and React documentation.**

---

## MANDATORY: When writing new code

**Apply these at the time you write code, not only when fixing a build error.**

1. **Optional properties / `string | undefined`:** If you read a property that might be undefined (e.g. `part.filename`, `item.name`) and use it where a **concrete type** is required (e.g. `string` in an object literal or function argument), **narrow first**. Do not assign `part.filename` directly into `{ filename: part.filename }` if the type expects `filename: string` — TypeScript will error. Instead: assign to a variable, guard (e.g. `if (x !== undefined && x !== '')`), then use the variable inside the block.
2. **Check the type you're assigning into:** If the target type is `string`, `number`, or a non-optional field, the source must be narrowed to that type (no `string | undefined` unless the target allows it).
3. **Run typecheck:** After writing or changing TypeScript, run `npm run typecheck` from `crm-platform/` before committing.

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

**Problem:** “Type 'null' is not assignable to type 'string | undefined'” in mock data or props. **Also:** "Type 'string | undefined' is not assignable to type 'string'" when you pass an optional property into a place that expects a concrete type.

**Practice (from TypeScript strictNullChecks and handbook):**

- **strictNullChecks:** When `strict` is true, `strictNullChecks` is on. Then `null` and `undefined` are distinct types; you cannot use them where a concrete type is expected unless the type explicitly includes them. ([TSConfig strict](https://www.typescriptlang.org/tsconfig/strict), strictNullChecks)
- **Optional properties:** “In JavaScript, if you access a property that doesn’t exist, you’ll get the value `undefined`.” When *reading* an optional property, you have to check for `undefined` before using it. ([Handbook – Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html))
- **Optional parameters:** In strict null checking mode, optional parameters automatically get `undefined` in their type (e.g. `x?: number` ⇒ `number | undefined`). You must handle `undefined` before using the value.
- **Conventions:** Prefer `undefined` (and `string | undefined`) for “no value” and optional fields. Use `null` only when the type or API explicitly expects `null` (e.g. `string | null`).
- **Mock data/fixtures:** Match the real type: if the type is `entity?: string` or `entity: string | undefined`, use `entity: undefined`, not `entity: null`.
- **Narrowing (required when assigning into `string` or other concrete types):** Use `if (x != null)` or `if (x !== undefined)` (or optional chaining `x?.`) to narrow before use. **Do not** write `{ filename: part.filename }` when `part.filename` is `string | undefined` and the target type expects `filename: string`. Instead: assign to a variable, guard, then use the variable in the object (see example below).

**Correct pattern when building an object from optional properties:**

```ts
// BAD — causes "Type 'string | undefined' is not assignable to type 'string'"
if (part.filename && part.body?.attachmentId) {
  attachments.push({ filename: part.filename, attachmentId: part.body.attachmentId!, ... });
}

// GOOD — narrow first, then use (TypeScript narrows the variable inside the block)
const filename = part.filename;
const attachmentId = part.body?.attachmentId;
if (filename !== undefined && filename !== '' && attachmentId) {
  attachments.push({ filename, attachmentId, ... });
}
```

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
- **Right object, not just right type:** If the error is "Property 'X' does not exist on type 'Y'", check whether the property lives on a *different* object. Example: Firebase `User` has `email` but not `firstName`; in this project `firstName` is on AuthContext's `profile` (`UserProfile`). Use `profile?.firstName`, not `user?.firstName`.
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

## 9. Literal arrays vs tuples: use `as const` when the API expects a tuple

**Problem:** “Type 'number[]' is not assignable to type 'Easing'” (or similar) when you pass an array literal like `[0.32, 0.72, 0, 1]` into a third-party API that expects a **tuple** (e.g. a cubic-bezier easing). TypeScript infers the literal as `number[]`, which is not assignable to a tuple type like `[number, number, number, number]`.

**Practice (from TypeScript literal types and inference):**

- **Inference:** An array literal `[a, b, c, d]` is inferred as `number[]` unless you widen or narrow it. Many libraries (e.g. Framer Motion’s `transition.ease`) expect a cubic-bezier **tuple** of exactly four numbers, typed as `[number, number, number, number]` or `Easing`.
- **Fix:** Use **`as const`** on the array literal so TypeScript infers a **readonly tuple** (e.g. `readonly [0.32, 0.72, 0, 1]`), which is assignable to tuple/Easing types.
- **Where this shows up:** Framer Motion `transition: { duration: 0.4, ease: [0.32, 0.72, 0, 1] }` → use `ease: [0.32, 0.72, 0, 1] as const`. Same for any config object passed to animation or chart libraries that expect fixed-length number arrays.

**Example:**

```ts
// BAD — inferred as number[]; "Type 'number[]' is not assignable to type 'Easing'"
const exitTransition = { duration: 0.4, ease: [0.32, 0.72, 0, 1] };

// GOOD — inferred as readonly tuple; matches Framer Motion Easing
const exitTransition = { duration: 0.4, ease: [0.32, 0.72, 0, 1] as const };
```

---

## 10. Optional: pre-commit or CI typecheck

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
| Optional → concrete   | When assigning optional props (e.g. `part.filename`) into `string` or required fields: narrow first (assign to variable, guard, then use). | §3, MANDATORY |
| Third-party callbacks | Match library callback signatures exactly (params and return). | TypeScript parameter/return type checking |
| Hook order            | Declare callbacks/hooks before any hook that lists them in deps. | [Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks) |
| New fields            | Update TypeScript types and mapping schemas when adding/using new fields. | Structural typing, project BulkImport rules |
| Strict mode           | Keep `strict: true`; fix types instead of relaxing options. | [TSConfig strict](https://www.typescriptlang.org/tsconfig/strict) |
| Literal array → tuple | Use `as const` on array literals when the API expects a tuple (e.g. Framer Motion `ease`). | §9 |
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
| Protocol builder: `firstName` on Firebase `User` | Use AuthContext `profile?.firstName`; Firebase `User` has no `firstName` | §6 |
| useGmailSync: `part.filename` / `part.body.attachmentId` in object literal | Assign to variables, then guard (`if (x !== undefined && attachmentId)`), then use variables in the object; do not use optional props directly where `string` is required | §3 |
| Framer Motion `ease: [0.32, 0.72, 0, 1]` → “Type 'number[]' is not assignable to type 'Easing'” | Use `ease: [0.32, 0.72, 0, 1] as const` so the literal is inferred as a tuple | §9 |

---

*Use this file in Cursor rules (e.g. in `.cursor/rules/` or project instructions) so the AI and developers follow these practices and avoid recurring build failures. All practices are traceable to TypeScript, Next.js, or React official documentation.*
