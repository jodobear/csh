# Buy Before Build

Use this rule when the operator's goal is to solve a problem with the least custom code rather than
to create a novel product implementation.

## Brief

- Goal: state the user-visible outcome in one sentence.
- Hard rule: prefer buy/adapt over build.
- Non-goal: do not invent core protocol, backend, UI, or deployment layers that existing projects
  already cover well.
- Flexibility: treat named technologies as candidates unless the operator marks them mandatory.
- Deliverable first: before coding, produce a buy/adapt/build matrix and recommend the thinnest
  path.

## Default Instruction

Assume custom code is glue unless the operator explicitly asks for greenfield implementation.

If an existing project covers most of the requirement, default to:

1. adopt it directly
2. adapt it with thin wrappers or configuration
3. build only the missing gap

Do not build a custom substitute for an existing project unless the repo documents a concrete gap,
licensing problem, trust-boundary problem, or integration blocker.

## Communication Template

Use this template when the operator wants a thin, existing-tools-first approach:

```md
Goal: <one-sentence outcome>
Hard rule: prefer existing tools; custom code must be glue only
Non-goals: <what not to build>
Flexibility: <which named tools are optional candidates versus hard requirements>
Deliverable first: give me a buy/adapt/build matrix before coding
```
