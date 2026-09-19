# Course PDF artifacts

`curso-es.pdf` is the Spanish offline course guide served by `GET /api/pdf/es`.
The API route requires an authenticated account with active paid access.

Release checks:

- 49 pages at 960 x 540 points.
- SHA-256: `d4dd6a20f6724bd18b1008d39c492a1dba292b8d7a88799dd94b6f020a3c332b`.
- In Production the route serves this file from the `prod-files` S3-compatible
  bucket (`api/src/files.ts`), not from the image. This directory stays in git
  only so local dev (no `AWS_*` vars set) has something to serve, and so
  `upload-course-files.mjs` has a source to upload from. After changing this
  file, re-run `pnpm --dir api run files:upload` against Production credentials
  — the bucket does not update itself.

The English route remains intentionally unavailable until `curso-en.pdf` is
reviewed and added as a separate artifact.
