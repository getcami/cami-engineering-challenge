# Decisions

## Prioritisation

Order of work, and why:

1. **Reproduce CI first** (task 3). It is the cheapest and the most informative: I ran the workflow's
   commands locally on Node 20 against a clean database. Typecheck, tests and build already passed;
   only `Migrate` failed. Root cause: that step overrides `DATABASE_URL` to a `cami_app` database, but the
   Postgres service container only creates `cami`, so the connection is refused. The fix is to delete the
   override so the step uses the job-level `DATABASE_URL`. I also added a `Seed` step so seed/migration
   drift fails CI instead of failing for the next person who runs `docker compose up`.
2. **List performance** (task 1). Measured before changing anything. `RequestsService.list()` did one
   `request_notes` query per request: 1,201 queries for the 1,200 seeded requests.
3. **UI freshness** (task 2). Small, and it interacts with task 5 (classify now also produces history).
4. **Controller layering + history + provider seam** (tasks 4 and 5) together, because the refactor *is*
   the structure the history feature needs. Doing them separately would mean writing the classify flow twice.
5. **Stretch after the core was green:** the persistence seam (task 6) and richer history filters (task 7),
   once the core behaviour was pinned by tests, because the seam is a refactor and a refactor is only safe
   when the behaviour it must preserve is already covered. All 58 tests that existed before the refactor passed
   unchanged after it.
6. **Tests and docs throughout**, against real Postgres for behaviour and against in-memory fakes for service
   logic (see Trade-offs).

Deliberately not done: keyset pagination, pagination of `GET /requests`, and a real LLM provider. See
"What you would do with more time".

## Assumptions

- **"Correct" for the list means byte-for-byte the same response as before.** I checked this against the
  running old and new code on the seeded data: 1,200 rows, identical values and identical order. The only
  change is a deterministic tie-breaker (`id`) on equal `created_at`.
- **Every classification is recorded**, including ad-hoc ones with no `requestId`. History is an audit log
  of provider runs, not a per-request field.
- **The category set is closed** (`support | sales | billing | unknown`) and enforced in three places: the
  TypeScript type, request validation, and a DB `CHECK`. Adding a category is therefore a code change plus a
  migration. I chose integrity over flexibility because a model can hallucinate labels, and I would rather
  reject those than store them.
- **The business rules are provider-agnostic.** Short-message damping and "unknown below 0.55" moved out of
  the controller into a pure `applyClassificationPolicy` and apply to *any* provider, including a future LLM.
  This is an assumption a product owner should confirm: an LLM's confidence may not be calibrated the way the
  keyword scores are, so the same thresholds might not make sense.
- **Validation errors are HTTP 400/404, not `200 { error }`.** The web client already checked `res.ok`, so it
  benefits, but this **is a contract change** for any other client that parsed the error body of a 200.
- **Message length is checked after trimming** (previously before), so `"  hi  "` counts as 2 characters.

## Trade-offs

- **List query: correlated subqueries + a composite index, not `GROUP BY`.** A grouped join is slightly
  better when returning *all* rows; correlated subqueries with an `(request_id, created_at DESC, id DESC)`
  index stay cheap once the endpoint is paginated (the planner can probe just the requested page). Result
  today: one statement, index-only scans, about 4 ms of execution in Postgres. End to end on my machine the
  endpoint went from roughly 0.56 to 0.76 s to 14 to 28 ms. That is a local database with almost no network
  latency; over a real network the 1,200 round trips would have cost far more, so the real gap is larger.
- **Per-query logging is off by default** (`DB_LOGGING=true` turns it back on). Logging 1,201 statements per
  request was itself a cost and hid the N+1.
- **I did not add pagination to `GET /requests`.** The UI shows 25 rows but the API still returns all 1,200
  (about 360 KB). That is the next scaling problem and the index I added already supports it. I left it
  because it changes the API contract and the task said "correct and scales with the seeded notes".
- **Optimistic update for status changes, plain invalidation for classify.** Status is a value the client
  knows, so it can be shown instantly and rolled back on error. For classify the server decides the result
  (category, confidence, and the open to in_progress promotion), so the client waits and refetches rather than
  guessing. Both then invalidate, so the server's copy always wins.
- **`next/link` instead of `<a>`** in the nav. With full page loads the TanStack cache is thrown away on every
  navigation, which would make cross-page invalidation moot.
- **Integration tests use real Postgres, in a private schema per test file**, built by running the real
  migrations. Slower and it needs a database, but it caught real things a mock would not (see the N+1 test,
  which fails with "expected 1 query, got 151" if the per-row query comes back). Risk: without `DATABASE_URL`
  those suites are *skipped*, not failed, so a contributor could think they ran. CI always has the database.
- **No fallback to the keyword classifier when a provider fails.** See "Failure modes" below.
- **The persistence seam is two ports, not a generic repository layer.** `RequestsRepository` and
  `ClassificationsRepository` are abstract classes (so they double as Nest injection tokens) with one TypeORM
  adapter each. I deliberately did *not* introduce a generic `Repository<T>` or a repository per entity: the
  one operation that matters, "record a classification and apply it to the request", writes to two tables and
  must be atomic, so it is a single port method (`record`) and the transaction stays inside the adapter. A
  per-entity repository would have pushed that transaction up into the service and leaked TypeORM straight
  back into the business logic. Cost: some mapping code, and two things that used to be one file. Payoff: the
  services now run in unit tests against in-memory fakes with no database and no Nest container.
- **Domain rules are data where the port needs to enact them.** The rule "the first classification moves
  `open` to `in_progress`" is a named constant in the port file, and the adapter turns it into one atomic
  `UPDATE ... CASE`. It is not buried in the SQL string, so it can be read, changed and tested in one place.
- **Search uses `ILIKE '%term%'` with wildcards escaped, and no trigram index.** At this size a sequential
  scan is fine and it keeps the migration surface small. At scale, add `pg_trgm` and a GIN index on
  `classifications.message`. Escaping matters: without it, searching for `50%` or `a_b` would silently match
  "50 anything" / "aXb" (there is a test that fails if the escaping is removed).
- **Date filters are a half-open range `[from, to)` on the API and whole days in the UI.** The UI turns the
  inclusive end day into the start of the *following* local day, so the last day is included in full and
  consecutive ranges never overlap or leave gaps. The conversion is a pure function tested under four
  different timezones (UTC, Dubai, Los Angeles, UTC+14). An empty or backwards range is a 400 from the API and
  an inline hint in the UI (no request is sent).
- **New dependencies:** `class-validator` / `class-transformer` (the standard NestJS validation idiom), and
  dev-only `@nestjs/testing`, `supertest`, `unplugin-swc` (Vitest's default transform does not emit the
  decorator metadata Nest's constructor injection needs), `@types/pg`, plus `vitest` for the web app.

## Classification history scope

Implemented:

- **Schema + migration:** `classifications` table (`1710000000002`), append-only. Stores the final
  `category`/`confidence`, the provider's `raw_category`/`raw_confidence` (so a future LLM can be evaluated
  against the policy layer), the `provider` name, and a snapshot of the classified `message`. `request_id` is
  nullable with `ON DELETE SET NULL`: history outlives the request it came from. Check constraints on
  category and confidence range; indexes for the three read paths (recent, by category, by request).
- **Provider interface:** `ClassifierProvider { name; classify(message) }` bound through a Nest injection
  token, so swapping in an LLM is one line in `ClassificationsModule`. `classify` may return a value or a
  promise. `KeywordClassifier` is the default and is unchanged apart from implementing the interface.
- **Service layering:** controller (HTTP only, DTO validation) to `ClassificationsService` (orchestration) to
  provider + pure policy. The history row and the request update happen in **one transaction**, and the
  "open to in_progress" rule is a single atomic SQL `CASE` rather than read-then-write, so a concurrent status
  change cannot be overwritten.
- **`GET /requests/history`:** filters `category`, `requestId`; `limit` (default 50, max 200) / `offset`;
  returns `{ items, total, limit, offset }`. Ordered newest first with an `id` tie-breaker.
- **Web `/history`:** category filter, pagination with the previous page kept on screen while the next loads,
  loading / empty / error states, the provider and original-vs-final confidence visible, and a box to classify
  ad-hoc text so the page is usable by itself.

- **Filters (task 7):** message search (case-insensitive contains), date range, category, and request, all
  combinable, with a debounced search box (typing 8 characters sends 1 request), a "Clear filters" control, and
  an empty state that distinguishes "nothing yet" from "nothing matches these filters".

Left out: keyset pagination (offset paging is fine at this size), sorting options, and an "explain" view of the
raw provider output beyond the tooltip.

## Stretch (if any)

**Done (task 7, all four suggested directions: richer filters/UI, deploy ordering, LLM failure modes, AI workflow stance):**

- **Migration vs. deploy ordering.** Both new migrations are additive. Old code against the new schema is
  fine. New code against the *old* schema is not: classify and history will error (the list keeps working, just
  without the new indexes). So migrations must run before the new API takes traffic. `docker-compose` already
  does this (the API container runs `migration:run` before starting). On multiple replicas, concurrent
  start-up migrations can race, so in production run migrations as a single one-off job. The index
  migration is not `CONCURRENTLY` (TypeORM runs migrations in a transaction). That is fine at this size; on a
  large table it should ship as a separate non-transactional migration.
- **Failure modes for an LLM provider**, handled at the seam so a real provider inherits them:
  a throw, timeout or rejection returns **502** and persists nothing; a malformed answer (unknown label,
  confidence outside 0..1, NaN) is rejected by `assertValidProviderResult` and also returns 502. Nothing is
  written on failure, so history never contains a result we do not trust. There is deliberately **no silent
  fallback** to keywords: it would mix two classifiers in one history, indistinguishable to the reader. If a
  fallback is wanted it should be a separate, recorded provider. The request existence check runs *before*
  the provider call so a bad id does not cost an LLM call.
- **Not covered, but real for an LLM:** timeouts and retry policy (needs a budget and idempotency key),
  rate limiting / cost tracking, prompt-injection from customer text, and retention: the history table stores
  message text, which duplicates customer data and needs a retention/redaction policy.

**Done (task 6): the persistence seam.** See "Trade-offs" for the design. What was verified: the
pre-existing integration tests pass unchanged after the refactor (they go through HTTP into a real database,
so they cannot tell the difference, which is exactly what a behaviour-preserving refactor should look like);
new unit tests exercise both services against in-memory fakes; and two mutation checks confirm the tests bite:
removing the transaction fails the atomicity test (a trigger makes the history insert fail and the test
asserts the request update rolled back too), and removing the wildcard escaping fails five tests.
What the seam does *not* give you: swapping storage engines is still real work (the SQL, the transaction
semantics and the `CHECK` constraints are Postgres-shaped), but the services no longer need to change.

## What you would do with more time

- Paginate `GET /requests` and make the table use it (the index is already there).
- A real (or stubbed HTTP) LLM provider behind the interface, with timeout, retry budget and cost logging.
- Browser-level tests for the UI flows. I verified them by hand with a Playwright script (status change and
  classify appear without reloading; history shows the new entry; search, date range, invalid range and
  clear all behave), but that script is not committed.
- ESLint (the workflow calls `lint --if-present` and there is no lint script), and a `/favicon.ico` (the
  starter app 404s on it, which shows up as a console error).
- **Docker: partly verified, not fully.** I could not pull base images in my environment (the registry is
  blocked), so `docker compose up --build` itself has **not** been run. What I did verify, with the same file
  layout the Dockerfiles use (only the files that would be committed): the exact `npm install --workspace=...`
  line from each Dockerfile succeeds on Node 20 (run without the `|| npm install` fallback so a failure
  cannot hide), and the containers' start commands work end to end on a fresh database (migrate, seed, start
  the API, hit `/requests`, `/requests/classify`, `/requests/history`; start the web app, load `/` and
  `/history`). Not covered: Alpine/musl native modules, Compose networking, and image build caching.
- Keyset pagination for history once it is large, and a retention job for history.
