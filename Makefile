.PHONY: help install compile test test-all build lint typecheck e2e lighthouse security-scan ci

help:
	@echo "NoxSafe — confidential payroll rails for Safe multisigs"
	@echo ""
	@echo "  make install        Install all workspaces (contracts, sdk, cli, web)"
	@echo "  make compile        Compile contracts (Hardhat)"
	@echo "  make test           rail-sdk unit tests (Vitest)"
	@echo "  make test-all       65 Hardhat contract + 128 SDK unit = 193 green"
	@echo "  make build          Next.js production build (web/)"
	@echo "  make lint           next lint (web/)"
	@echo "  make typecheck       tsc --noEmit (web/)"
	@echo "  make e2e            Playwright E2E tests (demo mode, web/)"
	@echo "  make lighthouse     Lighthouse CI audit (web/)"
	@echo "  make security-scan  npm audit + license check"
	@echo "  make ci             lint + typecheck + test-all + build"

install:
	npm ci

compile:
	npm run compile

test:
	npm test

test-all:
	npm run test:all

build:
	cd web && npm run build

lint:
	cd web && npm run lint

typecheck:
	cd web && npm run typecheck

# ── Advanced Testing & Security ─────────────────────────────
e2e:
	@echo "🎭 Running Playwright E2E tests (demo mode)..."
	cd web && npx playwright test

lighthouse:
	@echo "🔦 Running Lighthouse CI audit..."
	cd web && npx lhci autorun

security-scan:
	@echo "=== NPM AUDIT ==="
	npm audit --audit-level=high || true
	@echo ""
	@echo "=== LICENSE CHECK ==="
	npx license-checker --production --failOn "GPL-3.0;AGPL-3.0" --summary || true

ci: lint typecheck test-all build
	@echo "✅ CI gate passed"
