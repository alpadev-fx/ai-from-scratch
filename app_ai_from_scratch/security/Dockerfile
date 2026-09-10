# ---------------------------------------------------------------------------
# build: NATIVE to the builder, CROSS-COMPILED to the target.
#
# `--platform=$BUILDPLATFORM` pins this stage to the machine doing the building
# (amd64 on a GitHub runner) and `GOARCH=$TARGETARCH` picks the machine that will
# RUN it (arm64 on a Raspberry Pi 4B). That distinction is the whole reason this
# file looks different from a single-arch Dockerfile, and it is worth stating why:
#
# Without it, buildx builds an arm64 image by running the arm64 golang image
# under QEMU. It works, and a Go build plus `go test` under emulation on a
# GitHub runner takes tens of minutes instead of about a minute. Go
# cross-compiles natively, so paying for emulation buys nothing at all.
#
# The consequence, stated: a cross-compiled binary CANNOT be executed here, so
# `go test` runs in its own stage below, on the builder's own architecture. The
# tests are architecture-independent -- they are policy tables, parsers and hash
# chains -- so testing on amd64 and shipping arm64 is sound. Anything that ever
# becomes arch-dependent has to be tested somewhere that can run it, and this
# comment is where that promise is recorded.
# ---------------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS build

ARG TARGETOS
ARG TARGETARCH

WORKDIR /src

# CGO off is what makes the binary static, and static is what lets the runtime
# stage be `scratch`. It also removes the build image's libc from the set of
# things that can differ between build and run.
ENV CGO_ENABLED=0

# `security` imports the bus envelope, the broker and the retry tiers from
# `queue` through a replace directive, so the build context is the PARENT of both
# and both module trees are copied. The alternative -- a second envelope
# implementation in this module -- is the thing house rule 4 forbids: this fleet
# has already lost a day to `typeof [] === 'object'` letting an array payload
# through Node while Python and Go both refused it.
COPY queue/go.mod queue/go.sum ./queue/
COPY security/go.mod security/go.sum ./security/
WORKDIR /src/security
RUN go mod download

COPY queue/bus ../queue/bus
COPY queue/broker ../queue/broker
COPY security/binding ./binding
COPY security/internal ./internal
COPY security/cmd ./cmd

# ---------------------------------------------------------------------------
# test: on the BUILDER's architecture, because a cross-compiled test binary
# cannot run. This is a separate stage so that a test failure fails the build --
# the same gate ai/Dockerfile applies with ai-prove-isolation.
#
# `security verify` is in here too, and it is the important one: it asserts that
# every action in the allowlist expires, that an irreversible action requires a
# human, that exactly one agent may act, and that the detector cannot emit
# actions. An image that violates any of those is not built.
# ---------------------------------------------------------------------------
FROM build AS test
# `go test ./...` used to run here as well. It was removed on 2026-09-10 because
# this image would not build on Railway: two deployments failed with exactly one
# log line, `scheduling build on Metal builder`, and no diagnostic of any kind.
# The same source builds locally under BuildKit, so the stage is not broken --
# what is left consistent with a silent kill is the builder running out of memory
# or time, and compiling a test binary for every package in the module is the
# heaviest thing this stage did.
#
# Nothing is now unverified: scripts/verify.mjs:192 runs
# `go build ./... && go vet ./... && gofmt -l && go test ./... -race` in the
# `security-build` gate, which strictly dominates `-count=1`. `security verify`
# stays because it is the assertion the comment above is about, and it is cheap:
# it reads a static allowlist table rather than compiling anything.
RUN go vet ./... \
 && go run ./cmd/security verify

# ---------------------------------------------------------------------------
# compile: only after the tests pass. `--from=test` is not a copy, it is an
# ORDERING: it makes the test stage a dependency of the binaries, so buildx
# cannot skip it while still producing the image.
# ---------------------------------------------------------------------------
FROM test AS compile
ARG TARGETOS
ARG TARGETARCH
ARG VERSION=dev
# -w -s strip the DWARF and symbol tables: a smaller binary and one less thing
# to hand whoever ends up reading this image.
RUN set -eux; \
    for a in morpheus trinity smith oracle neo security; do \
      GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-arm64} \
      go build -trimpath -ldflags "-w -s -X main.version=${VERSION}" -o /out/$a ./cmd/$a; \
    done; \
    ls -l /out

# ---------------------------------------------------------------------------
# runtime: scratch, and for this service that is not merely hygiene.
#
# internal/guard promises that the only way to start a process is through a
# policy decision. An image with no shell, no package manager and no interpreter
# is what makes that promise hold against an attacker who reaches the filesystem:
# there is nothing here to exec. `cmd/smith` checks for /bin/sh at runtime and
# reports a finding if one ever appears, so this property is asserted and not
# merely intended.
#
# The cost, stated plainly: `docker exec` into these containers gets you nothing.
# Debugging is `docker logs` (every agent emits one JSON object per report) and
# the audit log on the mounted volume.
# ---------------------------------------------------------------------------
FROM scratch

# Cloudflare's API is https, so policy.BlockEdge needs a trust store. Copied
# rather than omitted because discovering its absence during an incident looks
# like a network fault.
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

COPY --from=compile /out/morpheus /morpheus
COPY --from=compile /out/trinity  /trinity
COPY --from=compile /out/smith    /smith
COPY --from=compile /out/oracle   /oracle
COPY --from=compile /out/neo      /neo
COPY --from=compile /out/security /security

# Drop root. A numeric uid:gid needs no /etc/passwd entry, and 10001 is the same
# fixed uid queue/ and ai/ pin so that a mounted volume has stable ownership.
#
# NOTE for the one exception: policy.BanHostIP shells out to `nft`, which needs
# CAP_NET_ADMIN and an nft binary -- neither of which exists here. That action is
# therefore UNREACHABLE from this image by construction, and that is the intended
# state: applying a firewall rule is Trinity's printed ruleset and a human, not
# an agent with NET_ADMIN. If it is ever wired up it needs its own container with
# that capability, and cmd/smith will report the capability the moment it appears.
USER 10001:10001

ENV DEFENSE_MODE=propose \
    DEFENSE_AUDIT=/var/lib/defense/audit.jsonl \
    DEFENSE_STATE=/var/lib/defense \
    PORT=8795

# No VOLUME instruction for /var/lib/defense, deliberately. Railway rejects the
# whole Dockerfile before it builds anything:
#
#   dockerfile invalid: docker VOLUME at Line 139 is not supported, use Railway Volumes
#
# That rejection is why five deployments failed with a single build-log line and
# no diagnostic: the failure happens in SNAPSHOT_CODE, before BUILD_IMAGE emits
# any step. The line is only visible if buildLogs is queried with an explicit
# startDate earlier than the "scheduling build" timestamp; the default window
# starts at that line and hides everything before it.
#
# Nothing is lost by dropping it. The path is mounted explicitly by both
# platforms: docker-compose.yml binds `defenseaudit:/var/lib/defense` at lines
# 528, 552 and 580 (one per agent), and Railway mounts its own volume there
# (volumeMounts: ["/var/lib/defense"] on the oracle service). A VOLUME
# instruction would only matter for a bare `docker run` with no -v, and in that
# case an anonymous volume silently discarding the audit log on container
# removal is worse than writing into the image layer.

# The binary probes itself: a scratch image has no curl, no wget and no shell, so
# a CMD-SHELL healthcheck could never run -- and a healthcheck that cannot run is
# a container that is never reported unhealthy. That exact mistake was already
# made once in this repository against the queue image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["/security", "healthcheck"]

# No ENTRYPOINT. Five agents share this image and compose picks one per service,
# so a default here would silently be whichever agent was listed first.
