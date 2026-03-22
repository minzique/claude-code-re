.PHONY: check fetch extract diff pipeline analyze archive site cron-install cron-remove update-tools

check:
	bun run check-version.ts --update

check-json:
	bun run check-version.ts --json

fetch:
	@test -n "$(VERSION)" || (echo "Usage: make fetch VERSION=2.1.80" && exit 1)
	bun run fetch-binary.ts $(VERSION)

fetch-all:
	@test -n "$(VERSION)" || (echo "Usage: make fetch-all VERSION=2.1.80" && exit 1)
	bun run fetch-binary.ts $(VERSION) --all

extract:
	@test -n "$(VERSION)" || (echo "Usage: make extract VERSION=2.1.80" && exit 1)
	bun run run-pipeline.ts --extract-only --version $(VERSION)

diff:
	@test -n "$(OLD)" -a -n "$(NEW)" || (echo "Usage: make diff OLD=signatures/v2.1.80.json NEW=signatures/v2.1.81.json" && exit 1)
	bun run diff-signatures.ts $(OLD) $(NEW) --markdown

analyze:
	@test -n "$(VERSION)" || (echo "Usage: make analyze VERSION=2.1.81" && exit 1)
	bun run analyze.ts $(VERSION) $(if $(DIFF),--diff $(DIFF),)

archive:
	@if [ -n "$(VERSION)" ]; then \
		bun run archive.ts $(VERSION); \
	else \
		bun run archive.ts; \
	fi

site:
	bun run build-site.ts
	@echo "Open docs/index.html to preview"

pipeline:
	bun run run-pipeline.ts

pipeline-fast:
	bun run run-pipeline.ts --no-analysis

pipeline-version:
	@test -n "$(VERSION)" || (echo "Usage: make pipeline-version VERSION=2.1.81" && exit 1)
	bun run run-pipeline.ts --version $(VERSION)

notify-test:
	bun run notify.ts "🧪 Test notification from claude-code-re monitor"

update-tools:
	@echo "Updating bun..."
	curl -fsSL https://bun.sh/install | bash 2>&1 | tail -1
	@echo "Updating bun-demincer..."
	git -C ../pocs/bun-demincer pull --ff-only 2>&1 | tail -1
	@echo "Updating claude CLI..."
	claude update 2>&1 | tail -1
	@echo "Done. Versions:"
	@bun --version
	@claude --version 2>&1 | head -1

cron-install:
	@echo "Installing cron job (checks every 6 hours)..."
	@(crontab -l 2>/dev/null | grep -v 'claude-code-re/monitor'; echo "0 */6 * * * cd $(CURDIR)/.. && bun run monitor/run-pipeline.ts --no-analysis >> monitor/state/cron.log 2>&1") | crontab -
	@echo "Done. Check with: crontab -l"
	@echo "Note: cron uses --no-analysis (saves API costs). Run 'make analyze' manually for deep dives."

cron-remove:
	@echo "Removing claude-code-re cron job..."
	@(crontab -l 2>/dev/null | grep -v 'claude-code-re/monitor') | crontab -
	@echo "Done."
