# Supabase CLI: What We Were Doing Wrong & Correct Workflow

Based on **SUPABASE DOCS/Supabase CLI.md**, here’s what was going wrong and how to do it right.

---

## 1. Migration File Naming (Required Pattern)

**Doc (line ~458):**  
*"All schema migration files must be created in this directory following the pattern **`<timestamp>_<name>.sql`**."*

**What was wrong:**  
We have migration files that **don’t** match that pattern, so `supabase db push` skips them:

- `add_contact_location.sql`
- `add_contact_notes.sql`
- `add_contact_website.sql`
- `add_name_to_users.sql`
- `create_ai_cache.sql`
- `migrate_calls_schema.sql`

**Dry-run output:**  
`Skipping migration add_contact_location.sql... (file name must match pattern "<timestamp>_name.sql")`

**Fix:**  
Rename to the pattern, e.g. `20250101000000_add_contact_location.sql`, or leave them out of the migrations folder if they’re legacy. Only files matching `<timestamp>_<name>.sql` are applied by `db push`.

---

## 2. Local vs Remote Migration History Sync

**Doc (lines 328–332, 337–339):**  
- *"Requires your local project to be linked to a remote database by running **supabase link**."*  
- *"After successfully applying a migration, a new row is inserted into the migration history table with **timestamp** as its unique id. Subsequent pushes will **skip** migrations that have already been applied."*  
- *"Only the **timestamps** are compared to identify any differences."*

**What was wrong:**  
The **remote** database has migration versions (e.g. `20260124160055`, `20260124160528`, …) that **do not exist** in our local `supabase/migrations` folder. So when we run `supabase db push`, the CLI sees “remote migration versions not found in local migrations directory” and fails.

**Doc (migration repair, lines 494–535):**  
When local and remote history are out of sync, use **migration repair** and **db pull**:

1. **List current state:**  
   `supabase migration list`  
   (shows LOCAL vs REMOTE columns)

2. **Mark remote-only migrations as reverted** (so remote history matches what we have locally):  
   `supabase migration repair <version> --status reverted`  
   (run for each remote-only version, or the set the CLI suggests)

3. **Pull remote schema into a new local migration:**  
   `supabase db pull`  
   - Creates a new file under `supabase/migrations`  
   - Optionally inserts a row into the remote migration history so remote matches the new local state

4. **Then push any remaining local-only migrations:**  
   `supabase db push`

So we were **not** following this repair + pull workflow before pushing.

---

## 3. Commands That Require Link / Environment

**Doc:**  
- **db push** (line 328): *"Requires your local project to be **linked** to a remote database by running **supabase link**."*  
- **db pull** (line 316): Same — requires **supabase link**.  
- **migration list** (line 468): *"Requires your local project to be **linked** to a remote database."*

So we must:

- Run these from a **linked** project (`supabase link --project-ref <ref>`).
- Run from a terminal/environment where the CLI can access the network and your credentials (no EPERM / sandbox blocking).

---

## 4. Optional: Push Only New Local Migrations

**Doc (line 356–357):**  
*"**--include-all**: Include all migrations not found on remote history table."*

So:

- `supabase db push` = push migrations that are in local but not in remote history (normal case).
- `supabase db push --include-all` = include all local migrations not on remote (useful when we’ve fixed history and want to push everything we have locally).

We weren’t necessarily wrong here; the blocker was the **history mismatch**, not the lack of `--include-all`.

---

## 5. Correct Workflow to Get Our Migration Live

Per the Supabase CLI docs, a safe sequence is:

### Step A: Run from project root with linked project

```bash
cd "c:\Users\Lap3p\OneDrive\Documents\Power Choosers CRM"
npx supabase link --project-ref gfitvnkaevozbcyostez   # if not already linked
```

### Step B: Inspect current state

```bash
npx supabase migration list
```

- LOCAL = files in `supabase/migrations` (only those matching `<timestamp>_<name>.sql`).
- REMOTE = rows in `supabase_migrations.schema_migrations`.

### Step C: If remote has versions not in local (our case)

Repair remote history so it only contains migrations we have locally (or that we’re about to add via pull):

```bash
npx supabase migration repair 20260124160055 --status reverted
npx supabase migration repair 20260124160528 --status reverted
# ... (all the remote-only versions from migration list)
```

Or in one go (all versions the CLI reported):

```bash
npx supabase migration repair --status reverted 20260124160055 20260124160528 20260124160936 20260124162219 20260124163008 20260124164548 20260124172151 20260125052257 20260125071800 20260125071856 20260125100314 20260125100347 20260125104339 20260125173702 20260125200316 20260125200516 20260125201048 20260125201250 20260126030637 20260126034046 20260127194437 20260129053427 20260129220025 20260129220618 20260129235427 20260131231037 20260201003023 20260201021941 20260201050253 20260201140910 20260201225133 20260202010151 20260202032417 20260202034628 20260202143237 20260202152650
```

(Check `supabase migration repair --help` for exact syntax for multiple versions.)

### Step D: (Optional) Pull current remote schema into local

If we want one migration file that matches current remote schema:

```bash
npx supabase db pull
```

Confirm when prompted to update the remote migration history table. That keeps remote and local in sync.

### Step E: Push our new migration

Our file `20250203_add_list_members_unique_constraint.sql` **does** match `<timestamp>_<name>.sql`. After history is repaired (and optionally pull is done), run:

```bash
npx supabase db push --dry-run   # preview
npx supabase db push             # apply
```

If we only want to push migrations not on remote (including our list_members constraint), plain `supabase db push` is enough; use `--include-all` only if the docs or your workflow say to include all local migrations.

---

## 6. Summary: What We Were Doing Wrong

| Issue | What we did wrong | What the docs say |
|--------|-------------------|-------------------|
| **File naming** | Some files don’t match `<timestamp>_<name>.sql` | Only that pattern is applied; others are skipped. |
| **History sync** | Ran `db push` without fixing remote-only migrations | Use `migration repair --status reverted` for remote-only versions, then optionally `db pull`, then `db push`. |
| **Environment** | MCP/terminal hit EPERM on Windows | Run `supabase` from a normal terminal (or install CLI globally) so link/push/pull can run without sandbox restrictions. |

Following the **repair → (optional) pull → push** workflow and ensuring all migration files use **`<timestamp>_<name>.sql`** will align us with the Supabase CLI docs and get the list_members unique constraint migration applied correctly.
