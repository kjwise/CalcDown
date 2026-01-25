# ==============================================================================
# make/calcdown.mk — CalcDown tooling targets (validate/diff/conformance)
# ==============================================================================

.PHONY: validate validate-strict diff lock export export-strict examples-check versions-check conformance

ENTRY ?= docs/examples/mortgage.calc.md
LOCK ?=
A ?=
B ?=
OUT ?= calcdown.lock.json
EXPORT_OUT ?= build/export.json

validate: build ## Validate a CalcDown project (ENTRY=path)
	@$(NODE) tools/calcdown.js validate "$(ENTRY)" $(if $(LOCK),--lock "$(LOCK)",)

validate-strict: build ## Validate strictly (fail on warnings)
	@$(NODE) tools/calcdown.js validate "$(ENTRY)" --strict $(if $(LOCK),--lock "$(LOCK)",)

diff: build ## Semantic diff two CalcDown projects (A=path B=path)
	@test -n "$(A)" || { echo "ERROR: set A=..."; exit 1; }
	@test -n "$(B)" || { echo "ERROR: set B=..."; exit 1; }
	@$(NODE) tools/calcdown.js diff "$(A)" "$(B)"

lock: build ## Write a deterministic lock file (ENTRY=path OUT=path)
	@$(NODE) tools/calcdown.js lock "$(ENTRY)" "$(OUT)"

export: build ## Export evaluated values/views (ENTRY=path EXPORT_OUT=path)
	@$(NODE) tools/calcdown.js export "$(ENTRY)" --out "$(EXPORT_OUT)" $(if $(LOCK),--lock "$(LOCK)",)

export-strict: build ## Export strictly (fail on warnings)
	@$(NODE) tools/calcdown.js export "$(ENTRY)" --strict --out "$(EXPORT_OUT)" $(if $(LOCK),--lock "$(LOCK)",)

examples-check: build ## Check docs/examples compatibility checklist
	@$(NODE) tools/check_examples.js --check

versions-check: build ## Check repo uses current CalcDown version
	@$(NODE) tools/check_current_version.js

conformance: build ## Run deterministic spec conformance suite
	@$(NODE) tools/check_current_version.js
	@$(NODE) tools/fmt_calcdown.js --check
	@$(NODE) tools/check_examples.js --check
	@$(NODE) tools/conformance.js
