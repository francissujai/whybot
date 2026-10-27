# Setup: running WhyBot on your machine

WhyBot runs entirely on your own computer:
- **Zetaris** in Docker
- **Meterless Nightshift** as a desktop app
- **WhyBot** in Node

The hackathon rules require Zetaris and Meterless to run locally. Budget about 1.5 hours the first time, most of it downloads.

**Machine:** Windows 11 with 32 GB RAM recommended, 25 GB+ free disk, and an NVIDIA GPU (optional, for local Nemotron). macOS also works: skip the WSL parts and run the Zetaris steps in Terminal.

## Accounts you need (each person their own, all free)

| Account | Why | Where |
|---|---|---|
| GitHub | clone the repo | github.com/francissujai/whybot |
| Zetaris Cloud | download the local Zetaris bundle and registry login | cloud.enterprise.zetaris.com/register |
| Meterless | download Nightshift | bottom of meterless.ai (email verification) |
| NVIDIA Build | Nemotron cloud API key (only needed for cloud lanes) | build.nvidia.com |

Please create your own NVIDIA key rather than sharing one. It's free, keys are personal, and shared keys hit rate limits faster.

## Steps

| # | Step | Command / where | Done when |
|---|---|---|---|
| 1 | Clone the repo | `git clone https://github.com/francissujai/whybot.git` | folder exists |
| 2 | Install tools: Git, Python, Node LTS, Docker Desktop, WSL 2 + Ubuntu, and `npm install` | **Admin** PowerShell: `Set-ExecutionPolicy -Scope Process Bypass -Force; cd <repo>\setup; .\01-install-windows.ps1` | versions print (reboot if WSL was new) |
| 3 | Docker Desktop → Settings → Resources → **WSL integration: Ubuntu ON** | Docker Desktop | `docker info` works in Ubuntu |
| 4 | Download `zetaris-platform.zip` to Downloads, from the Zetaris Cloud **Run locally** page | browser | zip in Downloads |
| 5 | Registry login: on the Run locally page, step 1 **Get the platform** shows a `docker login zetarishackathon.azurecr.io …` command. Run it in Ubuntu. | Ubuntu | `Login Succeeded` |
| 6 | Install and start Zetaris (30–45 min) | Ubuntu: `bash /mnt/c/<path to repo>/setup/02-zetaris-wsl.sh` | `verify.sh` shows all PASS |
| 7 | Sign in at http://localhost:3000 as `admin@zetaris.com`. The password is in `~/zetaris-platform/.env` (`ZETARIS_ADMIN_PASSWORD`); copy and paste it. | browser | logged in |
| 8 | Create an API key: **Management → API Tokens → +**, copy it once | browser | key copied |
| 9 | Start the demo databases | `npm run data:up` | `docker ps` shows `whybot-pg` |
| 10 | Register WhyBot's sources in Zetaris: put the key in `zetaris-getting-started\.env.local` (`ZETARIS_API_KEY=`, `ZETARIS_ORG_ID=1`), then dry-run and run | `cd zetaris-getting-started` → `python scripts/run_sql.py ../data/zetaris/whybot_create.sql --dry-run` → same command without `--dry-run` | `8/8 statements ok` |
| 11 | Install **Meterless Nightshift** and run its setup wizard. If you use cloud lanes, paste your NVIDIA key **only** in Nightshift → Setup → Providers. | meterless.ai | Nightshift shows endpoint `127.0.0.1:8088` |
| 12 | Add a Nemotron lane in Nightshift → NIGHT → LANES: **local** "Nemotron 3.5 Lightning 30B-A3B (Runtime GGUF)" (recommended), or cloud Nemotron lanes | Nightshift | lane shows **ready** |
| 13 | Configure WhyBot: `copy .env.example .env`, then set `ZETARIS_API_KEY` and `MODEL_API_KEY` (the Runtime token from Nightshift → Console) | repo root | — |
| 14 | Check everything | `npm run check` | every line PASS |
| 15 | Run an investigation | `npm run why -- "Why did trial signups drop 18% last week?"` | `runs/<timestamp>/report.html` |
| 16 | Or use the web UI | `npm run serve`, then open http://127.0.0.1:4173 | question box, live steps, report |

## Where secrets go (never commit them)

| Secret | Lives in | Never in |
|---|---|---|
| Zetaris admin password | `~/zetaris-platform/.env` (inside WSL) | the repo, chat |
| Zetaris API key | `.env` and `zetaris-getting-started/.env.local` (both gitignored) | git, chat, code |
| Nightshift Runtime token | `.env` | git, chat |
| NVIDIA API key | Nightshift → Providers **only** | `.env`, code, git |

Before every push, `git status` must not list `.env`. The repo's `.gitignore` covers `.env`, `.env.*` (except `.env.example`), `runs/`, `.whybot/` and `zetaris-getting-started/`.

## Hackathon rules to keep in mind

- Zetaris **and** Meterless must run on the builder's machine.
- At least one Meterless engine must power a **working** feature. We use Markovian and H-MEM, both passing the official conformance suites (`npm run conformance`).
- Nightshift must be the app's **primary model provider**. Nemotron must visibly power a real feature; the compute receipts in every report show which Nemotron lane served each call.
- Zetaris can't read laptop files. Data must live in a database or URL it can reach (we use the `whybot-pg` container).

## Troubleshooting

- **Zetaris login says "Not Allowed":** wrong password. Copy it from `~/zetaris-platform/.env` instead of typing it.
- **`npm run check` Power lines fail:** Nightshift isn't running, or `MODEL_API_KEY` doesn't match its Console token.
- **Model calls take 45 seconds or fail with `502 provider_deadline`:** cloud Nemotron through Nightshift is slow. Use the local Nemotron lane and set `NEMOTRON_MODEL=meterless/local`.
- **Zetaris comparisons come back identical:** see `docs/ZETARIS_FINDINGS.md`. Read each table once per query.
- **Stop or start Zetaris:** `cd ~/zetaris-platform && docker compose stop` / `docker compose start`. Never run `docker compose down -v`, which wipes its data.
