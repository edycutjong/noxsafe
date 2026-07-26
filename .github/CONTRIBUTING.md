# Contributing

Thanks for your interest in improving NoxSafe! 🎉

NoxSafe is an npm-workspaces monorepo: Hardhat contracts + the `@noxsafe/rail-sdk`
and `@noxsafe/payroll-kit` packages live at the root, and the Next.js Safe App /
recipient / auditor / verify portals live in `web/`.

## Getting Started
1. Fork the repo and branch from `main`: `git checkout -b feat/your-feature`
2. Install dependencies (installs every workspace): `npm install`
3. Copy the env template: `cp .env.example .env` (throwaway Sepolia keys only — never mainnet)
4. Compile + test everything: `npm run compile && npm run test:all`
5. Run the Safe App locally: `cd web && npm run dev`

## Before You Open a PR
- Contracts + SDK: `npm run test:all` passes (65 Hardhat + 128 Vitest = 193 green).
- Frontend: `cd web && npm run lint && npm run typecheck && npm run build` all pass.
- E2E: `cd web && npm run e2e` passes (Playwright, demo mode — no wallet, no env).
- Add or update tests for any behavior change.
- Keep commits conventional (`feat:`, `fix:`, `docs:`, `chore:`).

## Security & Keys
Never commit `.env` or any real private key. Use only throwaway Sepolia keys.
See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## Reporting Bugs / Requesting Features
Open an issue using the provided templates. Include repro steps, expected vs.
actual behavior, and environment details.
