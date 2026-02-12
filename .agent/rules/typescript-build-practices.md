# TypeScript & Build Practices

Prevent TypeScript/build errors. **All practices aligned with official TS/Next.js/React docs.**

---

## MANDATORY: When Writing Code

1. **Optional properties:** If property might be `undefined` (e.g., `part.filename`) and target expects concrete type (`string`), **narrow first**. Don't assign `part.filename` directly into `{ filename: part.filename }` if type expects `string`.
2. **Check target type:** If target is `string`/`number`/non-optional, source must be narrowed (no `string | undefined` unless allowed).
3. **Run typecheck:** `npm run typecheck` from `crm-platform/` before commits.

---

## Official Docs

| Source | URL | Use for |
|--------|-----|---------|
| **TS TSConfig** | https://www.typescriptlang.org/tsconfig | `strict`, `target`, `strictNullChecks` |
| **TS Everyday Types** | https://www.typescriptlang.org/docs/handbook/2/everyday-types.html | Optional properties, narrowing |
| **Next.js TypeScript** | https://nextjs.org/docs/app/building-your-application/configuring/typescript | Type checking, `tsc --noEmit` |
| **React Hooks** | https://react.dev/reference/rules/rules-of-hooks | Hook order rules |

---

## 1. Run Typecheck Before Build

**Problem:** `next build` fails on TS errors at deploy time.

**Practice:**
- Locally: `npm run typecheck` (runs `tsc --noEmit`) before pushing
- CI: Run typecheck in pipeline
- **Don't** use `ignoreBuildErrors: true`

---

## 2. Keep `target` Aligned

**Problem:** "Regex flag only available in ES2018+"

**Practice:** Set `tsconfig.json` `target` to `ES2018+` for regex `s` flag and modern features.

---

## 3. Prefer `undefined` for "No Value"

**Problem:** `null` vs `undefined` type mismatch.

**Practice:**
- Use `undefined` for optional fields (not `null`)
- Narrow before use: `if (x != null)` or `x?.`
- **Pattern for building objects:**

```ts
// BAD
if (part.filename && part.body?.attachmentId) {
  attachments.push({ filename: part.filename, attachmentId: part.body.attachmentId! });
}

// GOOD - narrow first
const filename = part.filename;
const attachmentId = part.body?.attachmentId;
if (filename && attachmentId) {
  attachments.push({ filename, attachmentId });
}
```

---

## 4. Don't Conditionally Call Hooks

**Problem:** "Rendered more/fewer hooks than previous render"

**Practice (React Rules of Hooks):**
- Call hooks at **top level only**, never in conditionals/loops
- Hook call order must be identical every render
- Use conditional logic **inside** hooks

```ts
// BAD
if (someCondition) {
  const data = useQuery(...);
}

// GOOD
const { data } = useQuery(..., { enabled: someCondition });
```

---

## 5. Recognize `string | undefined` Assignment Errors

**Problem:** "Type 'string | undefined' not assignable to 'string'"

**Fix:** Narrow before assignment:

```ts
// BAD
const name = contact.firstName; // string | undefined
setFormData({ firstName: name }); // Error if form expects string

// GOOD
const name = contact.firstName ?? '';
setFormData({ firstName: name });
```

---

## 6. Watch Circular Dependencies

**Problem:** Import errors, runtime crashes.

**Fix:**
- Keep utility/lib files dependency-free
- Don't import from barrel files that re-export the current module
- Use `import type` for type-only imports

---

## 7. Ensure JSON Validity

**Problem:** Unexpected tokens in JSON files.

**Fix:**
- No trailing commas in arrays/objects
- Validate with `npx prettier --check "**/*.json"`
- Use strict JSON parsers

---

## 8. Next.js Client Hooks: Null Safety

**Problem:** `searchParams` is possibly `null`

**Why:** Next.js `useSearchParams()` can return `null` during SSR/navigation.

**Practice:**
- **Always** use optional chaining (`?.`) with `useSearchParams()`:

```typescript
const searchParams = useSearchParams()
const taskId = searchParams?.get('taskId') ?? null
const query = searchParams?.toString() || ''
```

**Vercel Strictness:** Vercel enforces `tsc --noEmit` during builds. Cloud Run may have skipped checks. **Match Vercel locally:** Run `npm run typecheck` before commits.

---

## 9. Use Built-in Type Checking

**Practice:**
- Next.js runs TS during `next build`, fails on errors
- Include `next-env.d.ts` and `.next/types/**/*.ts` in `tsconfig.json`
- Enable incremental type checking for large apps

---

## 10. Literal Arrays vs Tuples

**Problem:** "Type 'number[]' not assignable to type 'Easing'"

**Fix:** Use `as const` for tuple literals:

```ts
// BAD
const ease = [0.32, 0.72, 0, 1]; // inferred as number[]

// GOOD
const ease = [0.32, 0.72, 0, 1] as const; // readonly tuple
```

---

## 11. Pre-commit Typecheck

**Practice:**
- Add `npm run typecheck` to pre-commit hooks
- Run in CI before deploy
- Prevents broken types from reaching production

---

## Summary Checklist

Before every commit:
- [ ] `npm run typecheck` passes
- [ ] Optional properties narrowed before use
- [ ] Hooks called at top level
- [ ] No `null` for optional fields (use `undefined`)
- [ ] `useSearchParams()` uses optional chaining
- [ ] Target types match source types
