First steps
Getting Started
Goal: go from zero to a first working chat with minimal setup.
Fastest chat: open the Control UI (no channel setup needed). Run openclaw dashboard and chat in the browser, or open http://127.0.0.1:18789/ on the gateway host. Docs: Dashboard and Control UI.
​
Prereqs
Node 22 or newer
Check your Node version with node --version if you are unsure.
​
Quick setup (CLI)
1
Install OpenClaw (recommended)

macOS/Linux
Windows (PowerShell)
curl -fsSL https://openclaw.ai/install.sh | bash
Install Script Process
Other install methods and requirements: Install.
2
Run the onboarding wizard

openclaw onboard --install-daemon
The wizard configures auth, gateway settings, and optional channels. See Onboarding Wizard for details.
3
Check the Gateway

If you installed the service, it should already be running:
openclaw gateway status
4
Open the Control UI

openclaw dashboard
If the Control UI loads, your Gateway is ready for use.
​
Optional checks and extras
Run the Gateway in the foreground

Send a test message

​
Useful environment variables
If you run OpenClaw as a service account or want custom config/state locations:
OPENCLAW_HOME sets the home directory used for internal path resolution.
OPENCLAW_STATE_DIR overrides the state directory.
OPENCLAW_CONFIG_PATH overrides the config file path.
Full environment variable reference: Environment vars.
​
Go deeper
Onboarding Wizard (details)
Full CLI wizard reference and advanced options.
macOS app onboarding
First run flow for the macOS app.
​
What you will have
A running Gateway
Auth configured
Control UI access or a connected channel
​
Next steps
DM safety and approvals: Pairing
Connect more channels: Channels
Advanced workflows and from source: Setup
Features
Onboarding Overview

First steps
Onboarding Wizard (CLI)
The onboarding wizard is the recommended way to set up OpenClaw on macOS, Linux, or Windows (via WSL2; strongly recommended). It configures a local Gateway or a remote Gateway connection, plus channels, skills, and workspace defaults in one guided flow.
openclaw onboard
Fastest first chat: open the Control UI (no channel setup needed). Run openclaw dashboard and chat in the browser. Docs: Dashboard.
To reconfigure later:
openclaw configure
openclaw agents add <name>
--json does not imply non-interactive mode. For scripts, use --non-interactive.
Recommended: set up a Brave Search API key so the agent can use web_search (web_fetch works without a key). Easiest path: openclaw configure --section web which stores tools.web.search.apiKey. Docs: Web tools.
​
QuickStart vs Advanced
The wizard starts with QuickStart (defaults) vs Advanced (full control).
QuickStart (defaults)
Advanced (full control)
Local gateway (loopback)
Workspace default (or existing workspace)
Gateway port 18789
Gateway auth Token (auto‑generated, even on loopback)
DM isolation default: local onboarding writes session.dmScope: "per-channel-peer" when unset. Details: CLI Onboarding Reference
Tailscale exposure Off
Telegram + WhatsApp DMs default to allowlist (you’ll be prompted for your phone number)
​
What the wizard configures
Local mode (default) walks you through these steps:
Model/Auth — Anthropic API key (recommended), OpenAI, or Custom Provider (OpenAI-compatible, Anthropic-compatible, or Unknown auto-detect). Pick a default model. For non-interactive runs, --secret-input-mode ref stores env-backed refs in auth profiles instead of plaintext API key values. In non-interactive ref mode, the provider env var must be set; passing inline key flags without that env var fails fast. In interactive runs, choosing secret reference mode lets you point at either an environment variable or a configured provider ref (file or exec), with a fast preflight validation before saving.
Workspace — Location for agent files (default ~/.openclaw/workspace). Seeds bootstrap files.
Gateway — Port, bind address, auth mode, Tailscale exposure.
Channels — WhatsApp, Telegram, Discord, Google Chat, Mattermost, Signal, BlueBubbles, or iMessage.
Daemon — Installs a LaunchAgent (macOS) or systemd user unit (Linux/WSL2).
Health check — Starts the Gateway and verifies it’s running.
Skills — Installs recommended skills and optional dependencies.
Re-running the wizard does not wipe anything unless you explicitly choose Reset (or pass --reset). CLI --reset defaults to config, credentials, and sessions; use --reset-scope full to include workspace. If the config is invalid or contains legacy keys, the wizard asks you to run openclaw doctor first.
Remote mode only configures the local client to connect to a Gateway elsewhere. It does not install or change anything on the remote host.
​
Add another agent
Use openclaw agents add <name> to create a separate agent with its own workspace, sessions, and auth profiles. Running without --workspace launches the wizard.
What it sets:
agents.list[].name
agents.list[].workspace
agents.list[].agentDir
Notes:
Default workspaces follow ~/.openclaw/workspace-<agentId>.
Add bindings to route inbound messages (the wizard can do this).
Non-interactive flags: --model, --agent-dir, --bind, --non-interactive.
​
Full reference
For detailed step-by-step breakdowns, non-interactive scripting, Signal setup, RPC API, and a full list of config fields the wizard writes, see the Wizard Reference.
​
Related docs
CLI command reference: openclaw onboard
Onboarding overview: Onboarding Overview
macOS app onboarding: Onboarding
Agent first-run ritual: Agent Bootstrapping
Onboarding Overview
Onboarding: macOS App