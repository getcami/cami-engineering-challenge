# AI Usage

## Tools used

- **Claude (Sonnet 5), in an agentic session** with a shell, file editing, a real PostgreSQL 16 instance and a
  headless Chromium. It read the repo, made the changes, and ran them; it did not only suggest code.
- No other AI tools were used.

## How I used AI

- **Exploration and diagnosis.** Read the whole codebase, then *reproduced* each planted problem before
  fixing it: ran the CI steps locally on Node 20 (only `Migrate` failed), counted the queries behind
  `GET /requests` (1,201), and read the mutation handlers to see which ones never invalidated the cache.
- **Implementation** of tasks 1 to 6 and all four directions of task 7 (see `DECISIONS.md`). The stretch work
  came after the core was green and tested, on purpose: the persistence seam is a refactor, and a refactor is
  only safe when the behaviour it has to preserve is already pinned down. The 58 tests that existed before it
  passed unchanged afterwards.
- **Verification, not just generation.** Every claim in `DECISIONS.md` was measured or run:
  - old vs. new list endpoint on the same seeded database (time, query count, and a deep-equality diff of all
    1,200 rows);
  - the whole CI workflow replayed in order from a clean export of the changed files on Node 20, against a
    brand-new database;
  - the two UI flows driven in a real browser (status change and classify appear without a reload; History
    shows the new entry; filter works);
  - **mutation checks** on the regression tests: I reintroduced the N+1 (failed with "expected 1 query,
    got 151"), removed the cache invalidation (failed), removed the LIKE-wildcard escaping (5 tests failed) and
    removed the transaction around "record classification + update request" (the atomicity test failed), then
    restored the code each time;
  - the **Docker path as far as this environment allows**: the Docker daemon would start but the sandbox's
    egress policy blocks the image registry, so I could not build the images. I did not try to route around that.
    Instead I replayed the exact `npm install --workspace=...` lines and start commands from the Dockerfiles,
    with the Dockerfiles' file layout and only the files that would be committed, on a fresh database.
- **Drafting** `DECISIONS.md` and this file.

## What I changed or rejected

Things the AI got wrong or that I corrected during the work:

- **Wrong dependency major.** `npm i @nestjs/testing` resolved to the 12.x line, which needs
  `@nestjs/common` 12, while the repo is on 11. It was caught by npm's peer-dependency error and pinned to
  `^11.1.28`.
- **A typecheck failure that would have turned CI red.** The test helper imports `pg` directly and the
  package has no types. `npm run typecheck` (which includes `test/`) caught it and `@types/pg` was added.
- **A test that could never fail.** The first draft of the "short message confidence floor" test contained a
  tautological assertion. Working through the arithmetic showed the real behaviour is subtler: 0.6 damped to
  0.45, clamped to the 0.5 floor, and then demoted to `unknown` because 0.5 is below the 0.55 trust
  threshold. The test now asserts that.
- **A second test that proved less than it claimed.** The first draft of the "invalidation makes the table
  refetch" test called `fetch()` directly, which always fetches whether or not anything was invalidated. It was
  rewritten around a real active `QueryObserver`, with a control that shows *no* refetch happens without
  invalidation, and confirmed to fail when the invalidation call is removed.
- **A false alarm in my own diff.** The first old-vs-new comparison reported all 1,200 rows as different
  because it compared JSON strings and the two queries emit fields in different orders. Comparing with deep
  equality showed the values and ordering are identical.
- **A sync/async inconsistency in my own code.** `history()` threw synchronously for a bad date range but
  returned a promise otherwise, so a caller using `.catch()` would have missed the throw. Found on review while
  writing its test; made the method `async` and the test now asserts a rejection.
- **Test-harness mistakes that looked like product bugs, each checked before being dismissed:** a browser test
  that assumed rows were still unclassified (not repeatable); a selector that could not match because a
  `<label>` wrapping a `<select>` includes the option text in its accessible name; a "no request fired"
  assertion that counted from before a legitimate request; and a sandbox without `rsync` that silently copied
  nothing, which showed up as a confusing module-not-found error rather than a code problem.
- **An unverified assumption I nearly made about the lockfile.** Installing one workspace rewrites
  `package-lock.json`, which looked like a mismatch. I ran the same command on the untouched starter as a
  control: it rewrites the lockfile too, so it is normal npm behaviour and not a defect in my change.
- **A console "404" I first assumed was the favicon.** I checked instead of assuming: `/favicon.ico` does return
  404 because the starter ships none, and the network log shows no other failed request. The browser test now
  asserts zero failed responses and ignores only that one generic console line.

Design options considered and rejected:

- A separate `ClassificationsController` on the same `/requests` prefix: its `history` route could be
  captured by `GET /requests/:id` depending on registration order. Kept the static routes in
  `RequestsController`, declared before `:id`, and added `ParseUUIDPipe` on `:id` so a mis-ordering fails
  loudly.
- Silently falling back to the keyword classifier when a provider fails: it would mix two classifiers in one
  history with no way to tell them apart. Provider failure is a 502 and persists nothing.
- A generic `Repository<T>` (or one repository per entity) for task 6. The operation that matters writes two
  tables atomically, so I made it a single port method and kept the transaction in the adapter; a per-entity
  repository would have leaked the transaction back up into the service.

Provenance note: the sandbox the AI worked in unexpectedly contained a branch with a ready-made solution to this
challenge, and a Postgres database with leftover tables from it. The AI did not read or use either; all work
was rebuilt from the starter commit and verified against freshly created databases.

**Reviewer's own notes** *(to be completed by the submitter after reading the diff, since I am expected to be able to
explain every change in my own words):* what I re-read, what I would change, and anything I disagree with.

## Trade-offs

- Real-Postgres integration tests are slower and need a database, but they are the only thing that could catch
  the N+1 and the migration/schema mismatches. They are skipped (not failed) when `DATABASE_URL` is unset.
- `docker compose up --build` has **not** been run: image pulls are blocked in the environment I worked in.
  I verified the install and start commands inside the Dockerfiles instead (see above); Alpine/musl native
  modules and Compose networking remain unverified.
- The browser check was a throwaway Playwright script and is not committed.
- I could not run GitHub Actions itself (nothing is pushed); I replayed every workflow step locally from a clean
  export on Node 20 instead.

## Team workflow (optional stretch)

My stance, briefly: treat AI output as a **pull request from a fast, confident junior with no memory**.

- **Reproduce before you fix.** The two most valuable habits here were running the failing CI command locally
  and counting queries before touching the code. AI is very good at plausible fixes for the wrong problem.
- **Ask for evidence, not assurance.** "Tests pass" is weak; "this test fails when I put the bug back" is strong.
  I would make mutation-style checks a norm for regression tests that AI wrote.
- **The author owns the diff.** Whoever opens the PR must be able to explain each hunk unaided, and the PR
  states what AI did and what the human changed. That is what this file is.
- **Keep the AI honest with the repo's own gates**: typecheck, tests and CI are the reviewers that do not get
  tired, so invest in them (this change added a seed step and an integration suite to CI).
- **Be explicit about data.** Do not paste customer data into prompts; note that anything an LLM classifier
  sees is also stored in history, so retention belongs in the design.
