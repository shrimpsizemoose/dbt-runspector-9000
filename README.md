# dbt-runspector-9000

Visualize dbt `run_results.json` files from GCS with a Chrome extension.

## Architecture

```
┌──────────────┐        ┌─────────────────────────────────────────┐
│   Chrome     │        │  Docker Container                       │
│  Extension   │──────▶ │  google-cloud-sdk + python server       │
│              │  HTTP  │                                         │
│  settings:   │        │  server.py ──▶ gcloud ──▶ GCS           │
│  • host:port │        │      │                                  │
└──────────────┘        │      ▼                                  │
                        │  template.html                          │
                        └─────────────────────────────────────────┘
                              volumes-from: gcloud-config
```

## Server

### Makefile Targets

```
make help        Show available targets
make auth        Setup gcloud authentication (run once)
make run         Start the server container
make stop        Stop the server container
make restart     Restart the server container
make clean       Stop and remove server container
make clean-all   Remove server and gcloud-config containers
make logs        Follow server logs
make status      Show container status
make health      Check server health endpoint
make build       Build Docker image locally
```

### Quick Start

```bash
make auth    # First time: authenticate with GCP
make run     # Start server
make health  # Verify it's running
```

### API

**GET /health**

Returns server status and version info.

```json
{"status": "ok", "version": "1.0", "git_sha": "abc1234"}
```

**POST /**

Request:
```json
{"url": "gs://bucket/path/to/run_results.json"}
```

Response:
```json
{"id": "a1b2c3d4e5f6"}
```

**GET /view/{id}**

Returns the HTML visualization for the given view ID.

**GET /views**

Lists all cached visualizations.

```json
{
  "views": [
    {"id": "a1b2c3d4e5f6", "source": "gs://bucket/path", "created": 1704825600, "expires_in": 3200}
  ]
}
```

## Chrome Extension

### Install

1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` folder

### Configure

1. Click extension icon → Options
2. Set server URL (default: `http://localhost:8765`)
3. Verify connection status shows version info

### Usage

1. On any page (e.g., Cloud Run logs), select a `gs://` URL
2. Right-click → "Inspect dbt run"
3. Visualization opens in new tab

## Development

### Release

1. Create and push a tag:
   ```bash
   git tag 1.0
   git push origin 1.0
   ```

2. GitHub Actions builds and pushes:
   - `shrimpsizemoose/dbt-runspector-9000:1.0`
   - `shrimpsizemoose/dbt-runspector-9000:latest`

### Required GitHub Secrets

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

## Q&A

**Why 9000?**

Any version is over 9000.

**Is it any good?**

YES.
