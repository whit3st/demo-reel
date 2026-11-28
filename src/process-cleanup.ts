type CleanupTarget = () => void | Promise<void>;

const targets = new Set<CleanupTarget>();
let installed = false;
let shutdownRequested = false;

/**
 * Register a teardown action for process-level interrupts.
 *
 * The CLI installs the signal handlers once; anything holding a long-lived
 * resource (a browser, a persistent worker) registers here so a Ctrl-C closes
 * it. Returns an unregister function for the normal completion path.
 */
export function registerCleanupTarget(target: CleanupTarget): () => void {
  targets.add(target);
  return () => {
    targets.delete(target);
  };
}

/**
 * Run and clear every registered target. Never rejects.
 *
 * Drains in a loop: a target may register another target while it runs (an
 * acquire that resolved during the drain), and exiting before that one runs
 * would orphan the resource it holds.
 */
export async function runCleanupTargets(): Promise<void> {
  shutdownRequested = true;
  while (targets.size > 0) {
    const pending = [...targets];
    targets.clear();
    await Promise.allSettled(pending.map((target) => target()));
  }
}

export function isShuttingDown(): boolean {
  return shutdownRequested;
}

export function cleanupTargetCount(): number {
  return targets.size;
}

export interface SignalCleanupOptions {
  /** Injected for tests; defaults to process.exit. */
  exit?: (code: number) => void;
  /** Upper bound on teardown before forcing the exit. */
  timeoutMs?: number;
}

/**
 * Install SIGINT/SIGTERM handlers that drain the cleanup registry.
 *
 * Idempotent: a second CLI entry point in the same process does not stack
 * handlers on top of the first.
 */
export function installSignalCleanup(options: SignalCleanupOptions = {}): void {
  if (installed) return;
  installed = true;

  const exit = options.exit ?? ((code: number) => process.exit(code));
  const timeoutMs = options.timeoutMs ?? 2000;

  const handle = (code: number) => {
    const timeout = setTimeout(() => exit(code), timeoutMs);
    void runCleanupTargets().finally(() => {
      clearTimeout(timeout);
      exit(code);
    });
  };

  process.once("SIGINT", () => handle(130));
  process.once("SIGTERM", () => handle(0));
}
