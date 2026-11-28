--------------------------- MODULE ChatterboxWorker ---------------------------
(*
Models: src/voice/chatterbox.ts

The persistent Chatterbox worker is spawned once per checkpoint and driven over
a JSON-lines protocol. Every request is keyed by a monotonically increasing id
and parked in a pending map until the worker replies or dies. The dangerous
interleaving is worker death: if the close handler fails to reject everything
in flight, callers await a reply that can no longer arrive and the CLI hangs.

This model covers submission, out-of-order replies, worker death and shutdown.
It deliberately does NOT model stdout chunk framing (covered by protocol tests)
or the process-exit hook (covered by process-cleanup tests).

Narrowing assumption: ids are unique and never reused. Production increments a
single counter, so a stale reply cannot be routed to a newer request.
*)
EXTENDS Naturals, TLC

CONSTANTS Ids, FailOnlyOnNonZeroExit

VARIABLES worker, pending, nextId, resolved, exitCode

vars == <<worker, pending, nextId, resolved, exitCode>>

Init ==
  /\ worker = "stopped"
  /\ pending = {}
  /\ nextId = 1
  /\ resolved = [i \in Ids |-> "none"]
  /\ exitCode = "none"

Start ==
  /\ worker = "stopped"
  /\ worker' = "starting"
  /\ UNCHANGED <<pending, nextId, resolved, exitCode>>

Ready ==
  /\ worker = "starting"
  /\ worker' = "ready"
  /\ UNCHANGED <<pending, nextId, resolved, exitCode>>

SpawnError ==
  /\ worker = "starting"
  /\ worker' = "stopped"
  /\ UNCHANGED <<pending, nextId, resolved, exitCode>>

Submit(id) ==
  /\ worker = "ready"
  /\ id = nextId
  /\ id \in Ids
  /\ pending' = pending \cup {id}
  /\ nextId' = nextId + 1
  /\ UNCHANGED <<worker, resolved, exitCode>>

ReplyOk(id) ==
  /\ worker = "ready"
  /\ id \in pending
  /\ pending' = pending \ {id}
  /\ resolved' = [resolved EXCEPT ![id] = "ok"]
  /\ UNCHANGED <<worker, nextId, exitCode>>

ReplyError(id) ==
  /\ worker = "ready"
  /\ id \in pending
  /\ pending' = pending \ {id}
  /\ resolved' = [resolved EXCEPT ![id] = "error"]
  /\ UNCHANGED <<worker, nextId, exitCode>>

(*
The historical bug: failAll ran only for a non-zero exit, so a worker that shut
itself down cleanly mid-request left every pending caller waiting forever.
FailOnlyOnNonZeroExit = TRUE reproduces exactly that.
*)
ShouldFailAll(code) == ~FailOnlyOnNonZeroExit \/ code /= 0

WorkerExit(code) ==
  /\ code \in {0, 1}
  /\ worker \in {"ready", "starting"}
  /\ worker' = "stopped"
  /\ exitCode' = code
  /\ UNCHANGED nextId
  /\ IF ShouldFailAll(code)
       THEN /\ pending' = {}
            /\ resolved' = [i \in Ids |->
                 IF i \in pending THEN "error" ELSE resolved[i]]
       ELSE /\ UNCHANGED pending
            /\ UNCHANGED resolved

Shutdown ==
  /\ worker /= "stopped"
  /\ worker' = "stopped"
  /\ pending' = {}
  /\ resolved' = [i \in Ids |-> IF i \in pending THEN "error" ELSE resolved[i]]
  /\ UNCHANGED <<nextId, exitCode>>

Next ==
  \/ Start
  \/ Ready
  \/ SpawnError
  \/ Shutdown
  \/ \E id \in Ids : Submit(id)
  \/ \E id \in Ids : ReplyOk(id)
  \/ \E id \in Ids : ReplyError(id)
  \/ \E code \in {0, 1} : WorkerExit(code)

Spec == Init /\ [][Next]_vars

(* A worker that is no longer running must have no unresolved requests. *)
NoDeadWorkerWithPending == worker = "stopped" => pending = {}

(* A request is either in flight or resolved, never both. *)
ResolvedAndPendingDisjoint ==
  \A id \in Ids : ~(id \in pending /\ resolved[id] /= "none")

=============================================================================
