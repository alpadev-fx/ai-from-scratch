# This directory is being retired

The authoritative Railway desired state now lives in its own repo:

    ~/Desktop/course/infrastructure/.railway/railway.ts

`railway config plan` from there produces an identical change set (verified
2026-09-09: 34 changes, all safe, same summaries).

This copy is still here for one reason only: it is the path the Codex session
applies from, and it is currently the only thing that CAN apply. Delete this
directory as soon as that session is pointed at `infrastructure/`. Until then,
edit ONE of the two — never both. Two live copies of this file already cost a
full afternoon once.
