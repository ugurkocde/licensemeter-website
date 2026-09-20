<div align="center">

# LicenseMeter

**Find unused software licenses, review SaaS access, and track AI API costs in one workspace.**

[Hosted app](https://www.licensemeter.com) · [Documentation](https://docs.licensemeter.com/) · [Self-host](https://docs.licensemeter.com/self-hosting) · [Report a bug](https://github.com/ugurkocde/licensemeter-website/issues)

[![License: MIT](https://img.shields.io/badge/License-MIT-0d9488.svg)](LICENSE)
[![Self-host with Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.licensemeter.com/self-hosting)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)

<img src="public/videos/feature-overview.webp" alt="LicenseMeter overview with estimated monthly waste, price accuracy, and next best actions" width="860">

<sub>Sample workspace. Names, costs, and findings are demonstration data.</sub>

</div>

LicenseMeter is free to use, with no subscriptions, paid tiers, or trial limits. Optional hosted plans (Pro and MSP) add support, a signed data processing agreement, a read-only MCP endpoint, and white-label PDF reports; self-hosted installations include every feature.

## Features

- Microsoft 365 findings for disabled or inactive licensed accounts, unassigned paid seats, and unused Copilot licenses.
- Estimated monthly waste from an editable price book, so estimates reflect your contract prices.
- Connectors for Microsoft 365, Adobe, Zoom, Atlassian, Salesforce, OpenAI, and Anthropic, plus CSV import for ChatGPT and Claude.
- OpenAI and Anthropic daily API spend, kept separate from per-seat costs.
- Findings workflows, renewal tracking, CSV and PDF exports, and multiple workspaces.

LicenseMeter reads provider data and never removes licenses or changes your tenant. Exported remediation scripts require separate review and execution.

## Quick start

**Self-host with Docker** (Docker Engine with Compose v2 or newer):

```bash
git clone https://github.com/ugurkocde/licensemeter-website.git
cd licensemeter-website
node scripts/setup-docker.mjs
docker compose --env-file .env.docker up --build -d
```

Open **http://localhost:3000** and choose **Open the sample tenant**. Real tenants, backups, upgrades, and optional services are covered in the [self-hosting guide](https://docs.licensemeter.com/self-hosting).

**Local development** needs Node.js 24: `npm ci`, copy `.env.example` to `.env`, then `npm run db:push && npm run dev`. See [CONTRIBUTING.md](CONTRIBUTING.md) for checks and schema changes.

## Documentation

- [Getting started](https://docs.licensemeter.com/getting-started) and the [sample workspace](https://docs.licensemeter.com/getting-started/sample-workspace)
- [Connectors](https://docs.licensemeter.com/connectors), [Findings](https://docs.licensemeter.com/findings), and [Licenses and prices](https://docs.licensemeter.com/licenses-and-prices)
- [AI API costs](https://docs.licensemeter.com/ai-costs), [renewals](https://docs.licensemeter.com/renewals), and [exports and reports](https://docs.licensemeter.com/exports)
- [Self-hosting with Docker](https://docs.licensemeter.com/self-hosting) and [Microsoft application setup](https://docs.licensemeter.com/self-hosting/microsoft-setup)

## Project

- Next.js 15 App Router, React 19, TypeScript, and Tailwind CSS, on PostgreSQL through Drizzle.
- Sign-in uses Microsoft Entra ID work and school accounts. [SETUP.md](SETUP.md) covers the sign-in and connector app registrations.
- [SECURITY.md](SECURITY.md) covers vulnerability reporting, deployment boundaries, and encrypted connector credentials.

Marketing, legal, trust, and status pages describe licensemeter.com and are not legal or infrastructure guarantees for a self-hosted instance.

## License

Released under the [MIT License](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md) for bundled assets.
