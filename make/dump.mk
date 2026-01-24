# ==============================================================================
# make/dump.mk — Repo dump target (LLM context)
# ==============================================================================

.PHONY: dump

BUILD_DIR ?= build
DUMP_FILE ?= $(BUILD_DIR)/dump_repo.md

dump: ## Dump repo into $(DUMP_FILE) (single-file context for LLM review)
	@mkdir -p "$(BUILD_DIR)"
	@bash tools/dump_repo.sh "$(DUMP_FILE)"
	@echo "Wrote: $(DUMP_FILE)"

