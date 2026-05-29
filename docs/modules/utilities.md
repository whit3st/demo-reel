# Auth Module

## Purpose

Session-based authentication with save/restore/validate lifecycle. Captures cookies and localStorage from Playwright browser contexts, persists them to disk, and restores them across runs.

## Location

`src/auth.ts`

## Core Types

### SessionData

```ts
export interface SessionData {
  name: string;
  timestamp: number;
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }>;
  localStorage?: Record<string, Record<string, string>>;
}
```

A serializable snapshot of auth state. Stored as JSON in `.demo-reel-sessions/<name>.json`.

### AuthConfig (from schemas)

```ts
interface AuthConfig {
  storage: AuthStorageConfig; // What to capture: cookies, localStorage
  validate: AuthValidateConfig; // How to verify login is valid
  loginSteps: Step[]; // Steps to perform login
  behavior?: AuthBehaviorConfig; // Session reuse behavior
}

interface AuthStorageConfig {
  name: string; // Session name (used as filename)
  types: StorageType[]; // "cookies" | "localStorage"
  file?: string; // Custom file path override
}

interface AuthValidateConfig {
  protectedUrl: string; // URL that requires auth
  successIndicator: SelectorConfig; // Element that indicates logged-in state
}

interface AuthBehaviorConfig {
  autoReauth: boolean; // Auto re-login if session invalid (default: true)
  forceReauth: boolean; // Force re-login even if session exists (default: false)
  clearInvalid: boolean; // Delete invalid session files (default: true)
}
```

## API

### Session Lifecycle

```ts
export async function loadSession(sessionName: string, cwd?: string): Promise<SessionData | null>;
export async function saveSession(sessionData: SessionData, cwd?: string): Promise<void>;
export async function clearSession(sessionName: string, cwd?: string): Promise<void>;
```

**Persistence directory:** `<cwd>/.demo-reel-sessions/<name>.json`

### Capture

```ts
export async function captureSession(
  context: BrowserContext,
  storageConfig: AuthStorageConfig,
): Promise<SessionData>;
export async function captureCookies(context: BrowserContext): Promise<SessionData["cookies"]>;
export async function captureLocalStorage(
  context: BrowserContext,
): Promise<SessionData["localStorage"]>;
```

`captureSession()` selectively captures only the storage types specified in `storageConfig.types`.

### Restore

```ts
export async function restoreSession(
  context: BrowserContext,
  page: Page,
  sessionData: SessionData,
  storageConfig: AuthStorageConfig,
): Promise<void>;
export async function restoreCookies(
  context: BrowserContext,
  cookies: SessionData["cookies"],
): Promise<void>;
export async function restoreLocalStorage(
  page: Page,
  storageData: Record<string, Record<string, string>>,
): Promise<void>;
```

Cookies are restored before navigation. localStorage must be restored after navigation (requires a page on the correct domain).

### Validation

```ts
export async function validateSession(
  page: Page,
  validateConfig: AuthValidateConfig,
  verbose?: boolean,
): Promise<boolean>;
```

**Validation flow:**

1. Navigate to `validateConfig.protectedUrl`
2. Wait for networkidle + 1000ms for redirects
3. Look for `validateConfig.successIndicator` element
4. Wait up to 5000ms for it to become visible
5. Return `true` if found, `false` otherwise

### Legacy API (backward compatibility)

```ts
export async function loadCookies(
  context: BrowserContext,
  cookieFile?: string,
  cwd?: string,
): Promise<boolean>;
export async function saveCookies(
  context: BrowserContext,
  cookieFile?: string,
  cwd?: string,
): Promise<void>;
export async function clearCookies(cookieFile?: string, cwd?: string): Promise<void>;
export async function isAuthenticated(page: Page, loginUrl?: string): Promise<boolean>;
```

These are kept for backward compatibility with existing `.demo.ts` files using the old cookie-based auth.

## Integration with Browser Module

In the new architecture, `BrowserPool` integrates session management:

- On **acquire**: restore session from file
- On **release**: capture and save session
- Auth stages use `handleAuth()` which internally uses these functions

## handleAuth() — From video-handler.ts

```ts
export async function handleAuth(
  context: BrowserContext,
  page: Page,
  authConfig: AuthConfig,
  configPath: string,
  verbose?: boolean,
): Promise<boolean>;
```

The orchestrator function that ties together session management and login:

1. **Force reauth?** → Clear existing session
2. **Existing session?** → Restore + validate. If valid → done
3. **No valid session** → Run `loginSteps` → validate login success → capture + save session
4. **Login failed** → Throw error

Will move to `src/stages/auth.ts` in the new architecture.

---

# Utilities

## Presets (`presets.ts`)

Pre-configured defaults for cursor, motion, typing, and timing behaviors.

| Preset Set      | Options                        | Values               |
| --------------- | ------------------------------ | -------------------- |
| `cursorPresets` | `dot`, `arrow`, `none`         | CursorConfig objects |
| `motionPresets` | `smooth`, `snappy`, `instant`  | MotionConfig objects |
| `typingPresets` | `humanlike`, `fast`, `instant` | TypingConfig objects |
| `timingPresets` | `normal`, `fast`, `instant`    | TimingConfig objects |

Used by `schemas.ts` to resolve preset strings to full config objects during validation.

## Random (`random.ts`)

Seeded pseudo-random number generator for deterministic jitter in mouse movement and typing delays.

```ts
export type RandomSource = () => number; // Returns 0..1

export function createRandom(seed?: string | number): RandomSource;
```

**Algorithm:** Mulberry32 — fast, good distribution, deterministic.
**Default seed:** Random if no seed provided.

Used by `runner/*` for:

- Cursor movement offset jitter (15%)
- Typing delay jitter (15%)

When no randomization config is provided, randomness is real (not seeded).

## Voice Config (`voice-config.ts`)

Resolves voice configuration with Zod validation.

```ts
export const voiceConfigSchema: z.ZodUnion<[...]>  // piper | openai | elevenlabs
export type VoiceConfig = z.infer<typeof voiceConfigSchema>

export function resolveVoiceConfig(overrides?: VoiceConfigOverrides): VoiceConfig
export function getVoiceName(config: VoiceConfig): string
```

**Three providers:**

1. **Piper** — `voice` (model name) or `voicePath` (custom .onnx)
2. **OpenAI** — `voice` (alloy, echo, fable, onyx, nova, shimmer)
3. **ElevenLabs** — `voice` (pre-curated voice ID)

All support: `speed` (0.5-2.0), `pronunciation` (word replacements map).

## Interfaces (`interfaces.ts`)

Minimal type exports for DI:

```ts
export type WriteFile = (path: string, content: string, encoding: string) => Promise<void>;
```

Used by `CommandContext` for filesystem abstraction.

## Types (`types.ts`)

Public type re-exports from `schemas.ts`. The single `export type *` barrel for consumer-facing types.
