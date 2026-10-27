# AI Usage

## Tools used

- **Claude (Anthropic)** — primary assistant throughout the challenge.

## How I used AI

Used Claude to accelerate three specific areas where the cognitive overhead is high but the
decisions are still mine:

1. **Codebase orientation** — asked Claude to summarise the existing service and controller
   before touching anything, so I could spot the N+1 pattern and the missing provider
   seam quickly rather than tracing every file manually.
2. **TypeORM query syntax** — `createQueryBuilder` with a sub-query lateral join and
   `array_agg` is verbose; Claude drafted the builder chain and I verified the generated
   SQL matched my intent.
3. **Boilerplate for the new entity and migration** — entity decorators and the
   `MigrationInterface` skeleton are pure boilerplate; having a draft to critique is faster
   than writing it from scratch.

## What I changed or rejected

- **Initial draft of `classify` controller logic** kept confidence adjustments inside the
  controller. I moved them there intentionally (they are policy, not persistence) but kept
  them in the controller rather than the service to preserve the separation: the service
  knows nothing about classification policy, only about storage.
- Claude initially suggested making `requestId` nullable at the entity level to support
  anonymous classifications. I kept it non-nullable because the current contract only
  persists events tied to a request, and a weaker constraint would need to be tightened
  later anyway.
- Suggested using `synchronize: true` as a quick shortcut in dev. Rejected — the project
  already has a migrations workflow and mixing the two causes drift.

## Trade-offs

The main trade-off of using AI for the query builder was the need to mentally verify the
generated SQL rather than writing it line by line. I mitigated this by reading the TypeORM
`getRawMany` docs and checking that column aliases matched the mapped type.

## Team workflow

For a team I'd establish a few norms:

- AI-generated code is reviewed at the same bar as human-written code; "the AI wrote it"
  is not a reason to skip review.
- Commit messages should note when a non-trivial block was AI-assisted, so reviewers
  know to scrutinise it more carefully.
- Keep AI out of security-sensitive paths (auth, PII handling) unless the team has
  reviewed the output with a security lens.
