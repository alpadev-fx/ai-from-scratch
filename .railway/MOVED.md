# This directory is retired

The Railway infrastructure as code lives in its own repository:

**https://github.com/alpadev-fx/ai-from-scratch-infra** — private.

It is also mounted here as a git submodule at [`infrastructure/`](../infrastructure),
so it shows up as a folder when browsing this repository on GitHub. The parent
repo is public and the infra repo is private, so that folder entry 404s for
anyone without access, and `git clone --recursive` fails for them. That is
intended: the infra repo carries project, service and environment IDs and the
operational detail of the deployment, none of which belongs in a public repo.

## Which copy do I edit

The submodule records a pinned commit, so there are now two working copies on
disk and they drift independently:

| path | what it is |
|---|---|
| `~/Desktop/course/infrastructure` | where the work happens. Has the remote, is what `railway config plan` and `apply` are run from. |
| `AIFromScratch/infrastructure` | the submodule checkout. Same repository, pinned to one commit. |

Edit the first one. After pushing there, bump the pin so GitHub shows the new
state:

```bash
cd AIFromScratch/infrastructure && git pull origin main && cd ..
git add infrastructure && git commit -m "chore: bump infrastructure"
```

Skipping the bump is not an error — it means the folder on GitHub keeps showing
an older commit of the infra repo while the deployment follows the newer one.

## Why the old copy is still here

`.railway/railway.ts` in this directory is a stale duplicate. It stays because
the Codex session ran `railway config apply` from here, and deleting it
mid-migration would have broken that. **Edit only one of the two files.** The
one that counts is the one in the infra repo; this one is history.
