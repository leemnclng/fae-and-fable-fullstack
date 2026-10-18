# Issues Log

## Open Follow-ups

### Runtime verification baseline

- Status: Not verified in this documentation task.
- The functionality map reflects source inspection. Run the checks in [development.md](../development.md) and exercise the main browser flows before recording a verified release baseline.

### Multiple API instances

- Status: Known architecture limitation, documented in `api/src/db.ts`.
- SQLite and uploads currently live on local disk. Running multiple API instances requires a shared database and file-storage design.

## Recording Issues

For each new issue, record the observed behavior, reproduction steps, impact, status, and any verified resolution. Do not treat missing verification as a confirmed application bug.
