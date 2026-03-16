# Implementation Gates

Use this document for any phase that changes running behavior, not just the current shell/browser
phase.

## Purpose

The project already has strong direction-setting controls. These gates exist to add stronger
implementation acceptance controls before a phase is called complete.

They are required whenever work changes:

- executable behavior
- deployment behavior
- remote access behavior
- security posture
- browser or operator-facing surfaces
- persistence, reconnect, or state handling

## Required Gate Categories

Every implementation phase must define and satisfy all categories below before closure.

## Repo-Default Audit Postures

Use one or more of these postures for non-trivial refinement work:

- `security-exposure`
  Identity, authorization, shell exposure, browser exposure, and trust-boundary risks.
- `operator-workflow`
  Real operator flow quality: setup friction, reconnect behavior, error visibility, and usability.
- `deployment-resilience`
  Startup, restart, persistence, cleanup, service behavior, and network-path assumptions.

Use posture-specific finding IDs in the form:

- `<posture>-<area>-<number>`

Example:

- `operator-workflow-shell-01`

When the issue is docs-surface or process-control drift rather than runtime behavior, use:

- `DOC-<area>-<number>`

### 0. Repo State

Before substantial work starts, record and surface basic git state:

- repo initialized or not
- current branch
- HEAD commit or no-commit state
- remotes present or absent
- whether the current work exists only locally

This is a plain startup check, not a separate ceremony.

### 1. Claims And Proof

For each material claim, record:

- claim
- proof command or test
- result
- unproven edge cases

Example claims:

- reconnect works
- browser access is private
- sessions survive disconnect
- state is preserved
- restart behavior is defined

### 2. Environment Matrix

Define where the feature must work.

At minimum, consider:

- local dev path
- target deployment path
- same-host path
- split client/server path
- restart/redeploy path
- wrong-cwd or different-filesystem path when client and server are separate

### 3. Negative Testing

Do not stop at happy-path checks. Test failure cases that could break the phase contract.

Typical negative cases:

- invalid or stale identifiers
- missing dependencies
- wrong working directory assumptions
- disconnected client
- restarted host
- conflicting state from prior runs
- unauthorized caller or spoofed identity
- long-running and high-output sessions

### 4. Trust Boundaries

Explicitly document:

- who is authenticated
- where identity is enforced
- where authorization is enforced
- what data is trusted from the caller
- what behavior depends on transport-specific guarantees

If a security property depends on a transport, proxy, or deployment assumption, state that
explicitly and test that assumption.

### 5. Resource Lifecycle

Define how state is created, reused, cleaned up, and recovered.

At minimum, answer:

- how sessions/resources are created
- how they are closed
- what happens on disconnect
- what happens on crash or restart
- whether state is durable or only process-local
- whether cleanup has TTL/GC/scavenger behavior

### 6. Operator UX

For any operator-facing command or UI, define:

- primary workflow
- reconnect workflow
- scrollback/history behavior
- error visibility
- output/log noise expectations
- unsupported behaviors

### 7. Audit Pass

Before phase closure, run an explicit review focused on:

- correctness bugs
- security and exposure risks
- behavioral regressions
- missing tests
- mismatch between claimed and actually proven behavior

This audit happens after implementation and before the phase is called complete.

### 8. Audit Posture And Finding IDs

For any non-trivial refinement or hardening slice, record:

- which audit posture(s) are being applied
- stable finding IDs for the targeted issues

Finding IDs do not need a complex scheme, but they must be stable enough to reference in prompts,
handoff, and closeout.

Prefer targeting 1 to 3 postures per slice. If a packet starts addressing every posture at once,
the slice is probably too broad.

### 9. Synchronization Touchpoints

Before substantial implementation starts, declare whether the slice changes:

- teaching surface
  README, guides, examples, or operator-facing usage
- audit state
  findings, posture status, accepted-risk state, or review conclusions
- startup/discovery surface
  handoff, docs index, prompts routing, or other startup-path docs

Keep this short. It is a closeout checklist, not a new phase.

### 10. Closeout Consistency

Before calling the phase complete, restore the docs surface to steady state:

- update the targeted findings or note that they are resolved
- update `handoff.md` to reflect the new next work, not the slice that just closed
- update the docs index if the active/control surface changed
- update operator guides if the public workflow changed
- remove finished prompts from the startup path unless they are still active

## Minimum Exit Record

Every implementation phase should leave behind:

- phase prompt with explicit exit criteria
- declared synchronization touchpoints when the slice changes teaching, audit, or startup surfaces
- claims-vs-proof table in the phase artifact or handoff
- named audit posture(s) and target finding IDs for non-trivial refinement work
- recorded open risks
- recorded unsupported behaviors
- docs surface restored to the lean post-closeout state
- updated `handoff.md`

The phase is not closed until those records exist in the repo.

## Current-Phase Addendum Rule

If a phase has unusually sharp risks, add a phase-specific checklist in the phase prompt, but keep
the general gates above intact so future phases inherit them automatically.
