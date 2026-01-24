# ==============================================================================
# make/calcdown.mk — CalcDown tooling targets (validate/diff)
# ==============================================================================

.PHONY: validate diff

ENTRY ?= docs/examples/mortgage.calc.md
A ?=
B ?=

validate: build ## Validate a CalcDown project (ENTRY=path)
	@$(NODE) tools/calcdown.js validate "$(ENTRY)"

diff: build ## Semantic diff two CalcDown projects (A=path B=path)
	@test -n "$(A)" || { echo "ERROR: set A=..."; exit 1; }
	@test -n "$(B)" || { echo "ERROR: set B=..."; exit 1; }
	@$(NODE) tools/calcdown.js diff "$(A)" "$(B)"

