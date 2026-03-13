# DM Log

- 2026-03-12: operator approved direct-host shell, private/pubkey-gated access, `tmux`, poll/ack
  first, Phase 3 browser UI, and deferred containerization as a later hardening phase.
- 2026-03-13: operator asked for the right relay and a test setup for SSH-over-Nostr using
  ContextVM; the final working demo path uses local `strfry` on the server plus `ssh -L` to the
  client, `wss://relay.contextvm.org` remains a same-host smoke path, and Haven is treated as a
  separate private-topology follow-on rather than the default demo relay.
