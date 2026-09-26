# SENTINEL task runner. Recipes avoid shell-specific syntax so they work from
# Git Bash, PowerShell (cmd fallback) and Linux alike.

BACKEND := uv --directory backend
FRONTEND := pnpm --dir frontend

.PHONY: install install-detector dev dev-api dev-web test lint format gen-types mock-data mock detections precompute

install:  ## Install backend and frontend dependencies
	$(BACKEND) sync
	$(FRONTEND) install

install-detector:  ## Add ultralytics + CUDA torch (~2.5 GB) for the live YOLO detector
	$(BACKEND) sync --extra detector

dev:  ## Run API (:8000) and web (:5173) together
	$(FRONTEND) exec concurrently -k -n api,web -c cyan,magenta "uv --directory ../backend run uvicorn app.main:app --reload --reload-dir app --port 8000" "pnpm dev"

dev-api:
	$(BACKEND) run uvicorn app.main:app --reload --reload-dir app --port 8000

dev-web:
	$(FRONTEND) dev

test:  ## Backend tests (golden test included)
	$(BACKEND) run pytest -q

lint:  ## Lint + typecheck both layers
	$(BACKEND) run ruff check .
	$(BACKEND) run ruff format --check .
	$(BACKEND) run mypy app scripts
	$(FRONTEND) lint
	$(FRONTEND) typecheck

format:
	$(BACKEND) run ruff check --fix .
	$(BACKEND) run ruff format .

gen-types:  ## Pydantic -> OpenAPI -> frontend/src/api/schema.d.ts (no server needed)
	$(BACKEND) run python -m scripts.export_openapi ../frontend/openapi.json
	$(FRONTEND) gen-types

PPTX ?=
mock-data:  ## Synthetic day in organizer formats -> data/stage2_mock (PPTX=deck.pptx for img_000860)
	$(BACKEND) run python -m scripts.generate_mock_data $(if $(PPTX),--pptx "$(PPTX)",)

mock:  ## Run the pipeline on demo frames -> frontend/src/mocks/*.analysis.json
	$(BACKEND) run python -m scripts.build_mock_fixture

detections:  ## Run the YOLO model on every frame -> backend/.cache/detections_<weights>.json
	$(BACKEND) run python -m scripts.precompute_detections

precompute:  ## TODO(P4): batch-analyze all frames into the cache
	$(BACKEND) run python -m scripts.precompute
