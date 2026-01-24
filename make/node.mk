# ==============================================================================
# make/node.mk — Node/TypeScript build and demo targets
# ==============================================================================

.PHONY: install build typecheck analyze lint test watch serve demo check check-node check-deps

check-node: ## Check that node and npm are available
	@command -v $(NODE) >/dev/null 2>&1 || { echo "ERROR: node not found on PATH."; exit 1; }
	@command -v $(NPM) >/dev/null 2>&1 || { echo "ERROR: npm not found on PATH."; exit 1; }

check-deps: check-node ## Check that npm deps are installed
	@test -x node_modules/.bin/tsc || { \
		echo "ERROR: npm deps not installed (missing node_modules/.bin/tsc)."; \
		echo "Run: make install"; \
		exit 1; \
	}

install: check-node ## Install npm dependencies
	$(NPM) install

build: check-deps ## Build TypeScript into dist/
	$(NPM) run build

typecheck: check-deps ## Typecheck without emitting files
	$(NPM) run typecheck

analyze: check-deps ## Run static analysis (tsc unused checks)
	$(NPM) run analyze

lint: analyze ## Alias for analyze

test: check-deps ## Run tests (with coverage thresholds)
	$(NPM) test

watch: check-deps ## Watch-build TypeScript
	$(NPM) run watch

serve: ## Serve repo at http://localhost:$(PORT)
	@command -v $(PYTHON) >/dev/null 2>&1 || { echo "ERROR: $(PYTHON) not found on PATH."; exit 1; }
	@echo "Serving http://localhost:$(PORT)/demo/"
	$(PYTHON) -m http.server $(PORT)

demo: build ## Build then serve demo
	@$(MAKE) serve

check: typecheck analyze test ## Run typecheck, static analysis, tests
