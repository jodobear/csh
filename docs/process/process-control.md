---
title: Process Control
doc_type: policy
status: active
owner: csh
read_when:
  - refining_process
  - reducing_doc_bloat_without_losing_rigor
  - updating_control_docs
canonical: true
---

# Process Control

Canonical repo rules for keeping `csh` rigorous without letting the active docs surface drift into
append-only history.

For transferable lessons and cross-repo rationale, use
[`process-refinement-playbook.md`](/workspace/projects/csh/docs/process/process-refinement-playbook.md).

## Core Rule

Do not treat a material process change as additive by default.

When the process changes materially:
1. identify the affected control docs
2. review them together as one control surface
3. remove or rewrite superseded wording
4. add only the minimum new wording that still needs to exist
5. verify startup docs, state docs, templates, and audits now agree

## Doc Roles

- `index`
  Routes readers to the canonical owner or next required doc.
- `policy`
  Canonical rules and gates.
- `state`
  Current lane, next work, repo state, and active gaps.
- `packet`
  Phase- or slice-specific execution context.
- `audit`
  Posture-specific live findings with stable IDs.
- `reference`
  Stable background and reusable guidance.
- `log`
  Append-only history or communication that is not startup-critical.
- `archive`
  Historical provenance that no longer controls current work.

## Canonical Owners

- [`docs/README.md`](/workspace/projects/csh/docs/README.md)
  Docs routing and role separation.
- [`AGENTS.md`](/workspace/projects/csh/AGENTS.md)
  Session startup and agent operating rules.
- [`docs/process/process-control.md`](/workspace/projects/csh/docs/process/process-control.md)
  Control-surface ownership and process-change reconciliation.
- [`docs/process/process-principles.md`](/workspace/projects/csh/docs/process/process-principles.md)
  Frozen defaults and canonical process decisions.
- [`docs/process/implementation-gates.md`](/workspace/projects/csh/docs/process/implementation-gates.md)
  Canonical implementation and refinement gate.
- [`docs/prompts/README.md`](/workspace/projects/csh/docs/prompts/README.md)
  Active packet routing.
- [`handoff.md`](/workspace/projects/csh/handoff.md)
  Current repo state and next work.
- [`docs/plans/decision-log.md`](/workspace/projects/csh/docs/plans/decision-log.md)
  Accepted decisions and reversal triggers.

If another active doc starts owning one of those roles, slim it, merge it, or reclassify it.

## Process-Change Rule

When a process lesson appears:
- add one narrow rule, prompt, checklist item, or audit question that targets the escaped bug class
- prefer that over broader cautionary prose
- keep the full local rule in its canonical owner instead of repeating it everywhere
- if the gate changed materially, re-audit or re-close recent work before continuing

## Docs-Surface Audit Rule

When the problem is control-surface drift rather than runtime behavior, use stable docs-surface
finding IDs:

- `DOC-<area>-<number>`

Open a docs-surface audit when:
- startup docs disagree about the current process
- active docs repeat the same rule in multiple places
- the startup path becomes heavy again
- packet or handoff routing still points at a completed slice

## Packet Rule

Packets should stay delta-oriented.

They should mostly contain:
- scope delta
- targeted findings or open questions
- slice-specific seam constraints
- synchronization touchpoints
- closeout conditions

They should not restate the full gate or the full process.

## Synchronization Rule

When a new implementation or refinement slice starts, declare early whether it changes:

- teaching surface
  README, guides, examples, or operator-facing usage
- audit state
  findings, posture status, accepted-risk state, or review conclusions
- startup/discovery surface
  handoff, docs index, prompts routing, or other startup-path docs

This should stay short and act as a closeout checklist, not as a new workflow phase.

## Steady-State Rule

After a refinement or process change lands:
- startup docs should still be lean
- handoff should stay state-oriented
- packets should no longer dominate routing once they close
- audits should describe the live state, not pre-fix wording
- historical narrative should move to transcript, reference docs, archive, or git history

If a rule is only understandable by rereading several active docs, the control surface is not yet
steady.
