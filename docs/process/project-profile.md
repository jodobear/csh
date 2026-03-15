# Project Profile

The agent may draft this file from a kickoff prompt and references before the operator edits it.

## Project Identity

- Project Name: csh
- Purpose: remote shell over Nostr with minimum custom code and a strict buy/adapt-over-build posture
- Success Criteria:
  - a private user can reach a real remote shell over Nostr without opening inbound SSH access to the host
  - the first working path is composed mostly from existing projects, with custom code limited to glue
  - the repo contains a clear buy/adapt/build decision record before any greenfield shell implementation begins
- In Scope:
  - Nostr transport and relay choices for private remote shell access
  - evaluation of existing shell servers, gateways, proxies, and clients
  - thin integration or wrapper code only when an existing project leaves a concrete gap
- Out Of Scope:
  - custom shell/session protocol design before an existing-tools bake-off fails
  - custom browser UI before the shell path itself is proven necessary
  - mosh-like optimizations before a simple working shell exists

## Canonical References

- Primary references:
  - `docs/process/buy-before-build.md`
  - `docs/process/process-principles.md`
  - `docs/process/research-workflow.md`
- Secondary references:
  - ContextVM SDK, gateway-cli, proxy-cli, cvmi
  - existing PTY/MCP shell servers
  - candidate Nostr relays
- Reference precedence:
  - local project docs first, then pinned/imported source material

## Technical Profile

- Language/toolchain: undecided; prefer the stack of the adopted upstream tools
- Dependency policy: prefer existing shell servers, relays, and Nostr transport tools; custom code must be glue-only unless a concrete gap is documented
- Architecture constraints:
  - remote shell must run over Nostr or a Nostr-backed transport layer
  - the first implementation should minimize bespoke protocol and UI work
  - private access control is required
- Safety/security/performance constraints:
  - do not claim that Nostr removes all networking or trust concerns; document the remaining relay, key, and host-risk boundaries explicitly

## Verification Profile

- Build commands:
  - to be decided after the buy/adapt/build bake-off
- Test commands:
  - to be decided after the initial candidate selection
- Quality gates:
  - at least one existing-tools-first bake-off is documented
  - chosen path proves open shell, usable input, reconnect posture, and private access control

## Process Profile

- Delivery phases:
  - Phase 0: buy/adapt/build research and candidate bake-off
  - Phase 1: compose the thinnest working shell path
  - Phase 2: close only the specific gaps the bake-off proves real
- Issue tracking method: `br`
- Remote/push policy: keep the repo reviewable; defer extra tooling until the first working path is validated
- Session-end workflow: update `br`, decision log, handoff, and `docs/comms/transcript.md`
