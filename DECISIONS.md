# Decisions

## Prioritisation

Tackled tasks in dependency order:

1. **Task 1 (N+1 fix)** — highest impact; a correctness problem masked as a performance
   problem. Addressed first so everything that follows runs on a solid query layer.
2. **Task 4 (provider interface + controller refactor)** — architectural, unblocks Task 5.
3. **Task 5 (classification history)** — new entity, migration, service method, and the
   history endpoint that consumes it.
4. **CI fix** — the `migrate` step used `cami_app` as the DB name while the service and
   `postgres` container both use `cami`; one-line fix.
5. **Frontend cache invalidation** — `statusMutation` and `classifyMutation` were missing
   `onSuccess` handlers, so the table never refreshed after an action. Added invalidation
   and also invalidated `['history']` after classify so the history page stays live.

## Assumptions

- **PostgreSQL-specific syntax is acceptable.** `array_agg(n.body ORDER BY n.created_at DESC)[1]`
  is idiomatic Postgres and the project already targets Postgres 16 (`ci.yml` service image).
  A portable alternative would be a correlated sub-query, which is slower.
- **Classification events are only stored when tied to an existing request.** Anonymous
  classifications (no `requestId`) still return a result but aren't persisted — the schema
  enforces `NOT NULL` on `request_id` which makes the intent explicit and avoids orphaned rows.
- **History endpoint is unauthenticated**, consistent with every other endpoint in the starter.

## Trade-offs

### Single LEFT JOIN vs two queries in `list()`
A raw `getRawMany` with a sub-query join is less ergonomic than TypeORM's `relations`
option but avoids the N+1 while still using the ORM. The downside is that column aliases
(`r_id`, `r_message`, etc.) must be mapped by hand. Accepted because the performance win
is meaningful at any list length > 1.

### Provider interface: sync vs async `classify`
`IClassifierProvider.classify` returns `ClassificationResult | Promise<ClassificationResult>`
to future-proof for an LLM provider that must be `async`. The keyword classifier is still
synchronous; `await` on a plain value is a no-op so no overhead is introduced.

### `ClassificationEvent.requestId` is NOT NULL
If we want to log standalone (request-less) classifications later, the column and entity
need to become nullable. Keeping it `NOT NULL` now matches the actual usage and keeps the
FK constraint enforceable at the DB level.

### History limit of 200 rows
Hard-coded in `listHistory()` to prevent an accidental full-table scan on a large dataset.
A real product would use keyset pagination; that felt out of scope for the timebox.

## Classification history scope

**Implemented:**
- `classification_events` table with FK to `customer_requests`, indexed on `request_id`
  and `category`.
- Migration registered in `data-source.ts` so `migration:run` applies it automatically.
- `listHistory(category?)` service method with optional category filter.
- `GET /requests/history?category=<category>` endpoint.
- History page rewritten from a raw JSON dump to a proper filterable table with colour-coded
  category badges.

**Left out:**
- Pagination (200-row cap used instead).
- Bulk re-classify endpoint.
- Separate `GET /requests/history/:id` detail view.

## What I would do with more time

- Add an LLM-backed provider implementing `IClassifierProvider` and wire it in via an env var.
- Write e2e tests (Playwright) covering the classify → history flow.
- Add keyset pagination to the history endpoint.
- Tighten the CI matrix to also run `migration:run` against a clean schema in a separate
  job to catch migration drift early.
