# Formal models

TLA+ is used where the failure mode is an interleaving that unit tests do not
reliably hit: the persistent Chatterbox worker can die, reply out of order, or
be shut down while callers are waiting.

## ChatterboxWorker

Models `src/voice/chatterbox.ts` (see the `Models:` header in the spec). It
covers request submission, replies, worker death (clean and failing codes) and
shutdown.

```bash
bash scripts/check-formal.sh
```

The script downloads `tla2tools.jar` v1.8.0 once (SHA256 pinned), runs the
fixed model, then runs the negative model and asserts that it fails for the
intended invariant.

- `ChatterboxWorker_Fixed.cfg` — must pass.
- `ChatterboxWorker_BuggyCleanExit.cfg` — reproduces the historical bug where a
  clean worker exit left pending callers waiting forever. It **must fail** with
  `NoDeadWorkerWithPending`.

Narrowing assumptions are documented in the spec header: request ids are unique
and never reused, stdout chunk framing is covered by protocol tests instead, and
shutdown is modelled as rejecting all pending requests (which the code now
does).
