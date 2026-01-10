.PHONY: auth run stop clean logs status health build restart help tag install-prek-hooks

IMAGE := ghcr.io/shrimpsizemoose/dbt-runspector-9000:latest
CONTAINER := dbt-runspector-9000
PORT := 8765
GCLOUD_CONFIG := $(HOME)/.config/gcloud

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

auth: ## Setup gcloud application-default credentials (via docker)
	docker run -it --rm \
		-v $(GCLOUD_CONFIG):/root/.config/gcloud \
		gcr.io/google.com/cloudsdktool/google-cloud-cli:slim \
		gcloud auth application-default login

run: ## Start the server container
	docker run -d \
		--name $(CONTAINER) \
		-v $(GCLOUD_CONFIG):/root/.config/gcloud:ro \
		-p $(PORT):8765 \
		$(IMAGE)
	@echo "Server running at http://localhost:$(PORT)"

stop: ## Stop the server container
	docker stop $(CONTAINER)

restart: clean run ## Restart the server container

clean: ## Stop and remove server container
	-docker stop $(CONTAINER) 2>/dev/null
	-docker rm $(CONTAINER) 2>/dev/null

logs: ## Follow server logs
	docker logs -f $(CONTAINER)

status: ## Show container status
	@docker ps -a --filter name=$(CONTAINER) --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

health: ## Check server health endpoint
	@curl -s http://localhost:$(PORT)/health || echo "Server not responding"

build: ## Build Docker image locally
	docker build \
		--build-arg GIT_SHA=$$(git rev-parse --short HEAD) \
		-t $(IMAGE) server/

install-prek-hooks: ## Install pre-commit hooks
	prek install --hook-type pre-push

tag: ## Create git tag from manifest.json version
	@version=$$(grep -Po '"version":\s*"\K[^"]+' extension/manifest.json) && \
	echo "Creating tag: $$version" && \
	git tag "$$version" && \
	echo "Run 'git push origin $$version' to push"
