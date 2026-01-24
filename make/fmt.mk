# ==============================================================================
# make/fmt.mk — Formatting helpers
# ==============================================================================

.PHONY: fmt fmt-check

fmt: check-deps ## Format docs/examples/*.calc.md (inputs/data/view blocks)
	@$(NODE) tools/fmt_calcdown.js

fmt-check: check-deps ## Check formatting (no changes)
	@$(NODE) tools/fmt_calcdown.js --check
