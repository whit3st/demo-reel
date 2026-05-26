import type { Page } from "playwright";
import type { CursorConfig } from "../schemas.js";
import type { Point } from "./types.js";
import { clamp } from "./utils.js";

export const resolveCursorStart = (page: Page, start: Point): Point => {
  const viewport = page.viewportSize();
  if (!viewport) {
    return start;
  }

  const maxX = Math.max(0, viewport.width - 1);
  const maxY = Math.max(0, viewport.height - 1);

  return {
    x: clamp(start.x, 0, maxX),
    y: clamp(start.y, 0, maxY),
  };
};

const cursorScript = (cursor: CursorConfig) => {
  const cursorId = "__pw_cursor";
  const styleId = "__pw_cursor_style";
  const storageKey = cursor.persistPosition
    ? cursor.storageKey || "demo-reel.cursor-position"
    : null;

  const readStoredPosition = () => {
    if (!storageKey) {
      return null;
    }

    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) {
        return null;
      }

      const parsed = JSON.parse(stored) as { x?: number; y?: number };
      if (typeof parsed.x !== "number" || typeof parsed.y !== "number") {
        return null;
      }

      return { x: parsed.x, y: parsed.y };
    } catch {
      return null;
    }
  };

  const writeStoredPosition = (x: number, y: number) => {
    if (!storageKey) {
      return;
    }

    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ x, y }));
    } catch {
      return;
    }
  };

  const addCursor = () => {
    if (document.getElementById(cursorId)) {
      return;
    }

    const style = document.createElement("style");
    style.id = styleId;

    const baseStyle = `
* { cursor: none !important; }
#__pw_cursor {
  position: fixed;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 2147483647;
  transform: translate(-100px, -100px);
}
`;

    if (cursor.type === "svg") {
      style.textContent =
        baseStyle +
        `
#__pw_cursor {
  width: ` +
        cursor.svg.width +
        `px;
  height: ` +
        cursor.svg.height +
        `px;
}
#__pw_cursor svg {
  width: 100%;
  height: 100%;
  display: block;
}
`;
    } else {
      style.textContent =
        baseStyle +
        `
#__pw_cursor {
  width: ` +
        cursor.size +
        `px;
  height: ` +
        cursor.size +
        `px;
  border: ` +
        cursor.borderWidth +
        `px solid ` +
        cursor.borderColor +
        `;
  border-radius: 999px;
  box-shadow: 0 0 0 1px ` +
        cursor.shadowColor +
        `;
}
`;
    }

    (document.head || document.documentElement).appendChild(style);

    const cursorEl = document.createElement("div");
    cursorEl.id = cursorId;
    if (cursor.type === "svg") {
      cursorEl.innerHTML = cursor.svg.markup;
    }
    (document.body || document.documentElement).appendChild(cursorEl);

    const offset =
      cursor.type === "svg"
        ? { x: cursor.svg.hotspot.x, y: cursor.svg.hotspot.y }
        : { x: cursor.size / 2, y: cursor.size / 2 };

    const clampLocal = (value: number, min: number, max: number) => {
      return Math.min(max, Math.max(min, value));
    };

    const clampToViewport = (x: number, y: number) => {
      const maxX = Math.max(0, window.innerWidth - 1);
      const maxY = Math.max(0, window.innerHeight - 1);
      return {
        x: clampLocal(x, 0, maxX),
        y: clampLocal(y, 0, maxY),
      };
    };

    const update = (x: number, y: number) => {
      const clamped = clampToViewport(x, y);
      cursorEl.style.transform =
        "translate(" + (clamped.x - offset.x) + "px, " + (clamped.y - offset.y) + "px)";
      writeStoredPosition(clamped.x, clamped.y);
    };

    const stored = readStoredPosition();
    if (stored) {
      update(stored.x, stored.y);
    } else {
      update(cursor.start.x, cursor.start.y);
    }

    document.addEventListener("mousemove", (event: MouseEvent) => {
      update(event.clientX, event.clientY);
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addCursor, { once: true });
  } else {
    addCursor();
  }
};

export const installCursorOverlay = async (page: Page, cursor: CursorConfig) => {
  const resolvedStart = resolveCursorStart(page, cursor.start);
  const resolvedCursor = { ...cursor, start: resolvedStart };
  await page.addInitScript(cursorScript, resolvedCursor);
  await page.evaluate(cursorScript, resolvedCursor);
  return resolvedCursor;
};

export const ensureCursorOverlay = async (page: Page, resolvedCursor: CursorConfig & { start: Point }) => {
  try {
    const cursorExists = await page.evaluate(() => {
      return document.getElementById("__pw_cursor") !== null;
    });
    if (!cursorExists) {
      await page.evaluate(cursorScript, resolvedCursor);
      await page.waitForTimeout(50);
    }
  } catch {
    try {
      await page.waitForTimeout(200);
      await page.evaluate(cursorScript, resolvedCursor);
    } catch {
    }
  }
};
