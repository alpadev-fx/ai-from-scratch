# Railway infrastructure

`railway.ts` is the single desired-state file. It intentionally contains no
secrets. Link the Railway project and environment, run `railway config plan`,
review the diff, then apply only an approved non-destructive plan.
