# Deployment and Version Control Rules

This rule governs how Git operations (commit, push) and deployment tasks are handled in this workspace.

## Scoping Git Operations

When the user requests a **commit**, **push**, or **deployment**, you MUST scope all git actions strictly to the `crm-platform` directory.

### Mandatory Workflow:
1. **Target Directory**: Only include changes located within `crm-platform/`.
2. **Explicit Staging**: Never use `git add .` or `git commit -a`. Instead, use explicit path addition:
   ```bash
   git add crm-platform/
   ```
3. **Exclude External Files**: Do NOT commit or push anything outside of the `crm-platform` directory (e.g., files in the root, `backups/`, or other top-level folders) unless specifically and individually requested for those files.
4. **Validation**: Before pushing, verify that only files under `crm-platform/` are staged using `git status`.

## Contextual Rationale
The root directory may contain legacy backups, environment documentation, or temporary files from other chats/agents that are not intended for the production repository. By scoping to `crm-platform/`, we ensure a clean and predictable deployment to Vercel/GitHub.
