# Aegis

AI Incident Response & Autonomous Engineering Platform.

Aegis is being built as an observable, permission-controlled incident workflow: investigate, ground a diagnosis in evidence, request approval for risky actions, execute in a simulator, and verify the result.

## Current Slice

The current MVP slice includes:

- Next.js and TypeScript operational console
- FastAPI incident API with typed Pydantic contracts
- Five controlled simulator scenarios: bad deployment, database failure, memory leak, traffic spike, and dependency failure
- Scenario-specific signals, diagnoses, evidence citations, and registered remediation proposals
- Agent trajectory timeline with expandable evidence chunks
- Human approval and rejection gates with terminal action protection
- Simulated before/after verification metrics
- Generated postmortem with impact, root cause, resolution, prevention, and source IDs
- Measured session metrics through `/api/metrics`
- Focused backend tests and Docker Compose definitions

The current demo uses in-memory state intentionally. PostgreSQL, the simulator service, persistent tool registry, hybrid RAG pipeline, authentication, and evaluation runner are the next implementation slices.

## Run Locally

Backend:

```powershell
Set-Location apps/backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Frontend, in a second terminal:

```powershell
Set-Location apps/frontend
npm run dev
```

Open `http://localhost:3000`. The API is available at `http://localhost:8000/docs`.

Run tests:

```powershell
Set-Location apps/backend
python -m pytest -q
```

Docker Compose is defined in `docker-compose.yml`, but Docker is not installed in the current Windows environment, so it has not been executed here.

## Deployment

The recommended deployment is Vercel for `apps/frontend` and Render for `apps/backend`.

1. In Render, create a Blueprint from `render.yaml`, then set `AEGIS_CORS_ORIGINS` to the final Vercel URL.
2. In Vercel, import this GitHub repository and set the project root directory to `apps/frontend`.
3. Add `NEXT_PUBLIC_API_URL` in Vercel using the Render service URL, for example `https://aegis-api.onrender.com`.
4. Redeploy Vercel after the Render URL is available.

No credentials belong in this repository. Use GitHub OAuth in Vercel and Render, and enter environment values in their dashboards.

## Architecture Direction

```text
Next.js console -> FastAPI gateway -> orchestrator -> explicit tool registry
                                      |              -> simulated logs/metrics/deployments
                                      |              -> RAG with cited evidence
                                      -> approval + audit trail -> verification
```

No LLM-generated shell or SQL is executed. Remediation will remain constrained to registered tools with schemas, risk levels, permissions, and audit events.