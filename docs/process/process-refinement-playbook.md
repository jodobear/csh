---
title: Process Refinement Playbook
doc_type: reference
status: active
owner: csh
read_when:
  - refining_process
  - aligning_other_repos_to_csh_lessons
  - tightening_review_gates_after_real_failures
depends_on:
  - docs/process/process-control.md
canonical: false
---

# Process Refinement Playbook

Shareable lessons from tightening the `csh` process after real shell, browser, and docs-surface
failures.

Canonical local rules live in
[`process-control.md`](/workspace/projects/csh/docs/process/process-control.md) and
[`implementation-gates.md`](/workspace/projects/csh/docs/process/implementation-gates.md). This
document is for rationale, transfer, and “what helped” context.

## Core Principle

Do not refine the process with vague “be more careful” language.

Instead:
- identify the escaped bug class
- add one small prompt or checklist item that would likely have caught it
- update the canonical control surface coherently
- reclose or re-audit recent work if the gate changed materially

## What Helped In `csh`

### 1. Posture-specific audits beat generic quality review

The failures that mattered here were not abstract “quality” issues. They clustered around:
- shell/browser exposure and trust boundaries
- operator workflow truthfulness
- deployment and resilience assumptions

Explicit postures made the review sharper and the fixes easier to track.

### 2. Process changes should reconcile, not accumulate

The repo improved when process updates rewrote the control surface instead of only appending new
rules. The win was not “more docs.” It was fewer contradictory ones.

### 3. Stable finding IDs make refinement executable

Once findings had stable IDs, packets, handoff, and follow-on work could target exact issues
instead of vague paragraphs.

### 4. Early synchronization touchpoints reduce closeout drift

Declaring up front whether a slice changes teaching surface, audit state, or startup/discovery
docs prevents the common failure mode where code is right but the repo still describes the old
state.

### 5. Handoff must stay state-only

`handoff.md` became more useful when it stopped trying to preserve narrative history. History still
matters, but it belongs in the transcript, decision log, reference docs, or git history.

### 6. When the gate gets smarter, old work may need reclosure

That is not process failure. It is the process finally getting specific enough to be useful.

## Minimal Adoption Pattern

If another repo wants the useful parts without copying `csh` wholesale:

1. Define one canonical control doc.
2. Keep implementation gates separate from the control doc.
3. Use 2-3 repo-specific audit postures.
4. Give findings stable IDs.
5. Make packets declare synchronization touchpoints early.
6. Reconcile the docs surface after each material process change.
