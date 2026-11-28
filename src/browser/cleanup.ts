import { closeSession } from "./launcher.js";
import type { BrowserSession } from "./types.js";
import { registerCleanupTarget } from "../process-cleanup.js";

/**
 * Close a browser session on process interrupt, unless it was already closed.
 * The unregister function is what keeps a completed stage from leaving a dead
 * target behind for every scenario in a `--all` run.
 */
export function registerSessionCleanup(session: BrowserSession): () => void {
  return registerCleanupTarget(async () => {
    await closeSession(session).catch(() => {});
  });
}
