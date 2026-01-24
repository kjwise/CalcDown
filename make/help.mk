# ==============================================================================
# make/help.mk — Consolidated help across included makefiles
# ==============================================================================

.PHONY: help

help: ## Show available make targets
	@echo "Usage: make [target]"
	@echo ""
	@echo "CalcDown targets:"
	@grep -h -E '^[a-zA-Z0-9._-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}' | \
		sort
	@echo ""
	@echo "Common:"
	@echo "  make install"
	@echo "  make build"
	@echo "  make demo"
	@echo "  make dump"
	@echo ""
	@echo "Environment:"
	@echo "  PORT   Dev server port (default: 5173)"
