.PHONY: auth run stop clean clean-all logs status health build restart help tag hooks

IMAGE := ghcr.io/shrimpsizemoose/dbt-runspector-9000:latest
CONTAINER := dbt-runspector-9000
CONFIG_CONTAINER := gcloud-config
PORT := 8765

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

auth: ## Setup gcloud authentication (run once)
	docker run -it \
		-v ~/.config/gcloud:/root/.config/gcloud \
		--name $(CONFIG_CONTAINER) \
		gcr.io/google.com/cloudsdktool/google-cloud-cli:latest \
		gcloud auth login

run: ## Start the server container
	docker run -d \
		--name $(CONTAINER) \
		--volumes-from $(CONFIG_CONTAINER) \
		-p $(PORT):8765 \
		$(IMAGE)
	@echo "Server running at http://localhost:$(PORT)"

stop: ## Stop the server container
	docker stop $(CONTAINER)

restart: stop run ## Restart the server container

clean: ## Stop and remove server container
	-docker stop $(CONTAINER) 2>/dev/null
	-docker rm $(CONTAINER) 2>/dev/null

clean-all: clean ## Remove server and gcloud-config containers
	-docker rm $(CONFIG_CONTAINER) 2>/dev/null

logs: ## Follow server logs
	docker logs -f $(CONTAINER)

status: ## Show container status
	@docker ps -a --filter name=$(CONTAINER) --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

health: ## Check server health endpoint
	@curl -s http://localhost:$(PORT)/health | python3 -m json.tool || echo "Server not responding"

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
