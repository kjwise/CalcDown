# ==============================================================================
# make/fmt.mk — Formatting helpers
# ==============================================================================

.PHONY: fmt

fmt: check-deps ## Format docs/examples/*.calc.md (inputs/data/view blocks)
	@$(NODE) tools/fmt_calcdown.js
