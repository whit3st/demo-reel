# Execution Flows

## End-to-End Flow

```mermaid
sequenceDiagram
    actor User
    participant CLI as cli.ts
    participant Cmd as Command
    participant Gen as generate()
    participant Pipe as Pipeline
    participant Stages as Stages
    participant Browser as Playwright
    participant FFmpeg as FFmpeg
    participant FS as Filesystem

    User->>CLI: demo-reel onboarding --verbose
    CLI->>CLI: parseArgs()
    CLI->>Cmd: RunSingleCommand.execute(["onboarding"], options, ctx)

    Note over Cmd: loadScenario("onboarding")
    Note over Cmd: loadConfig(path)
    Note over Cmd: generate(config, options)

    Cmd->>Gen: generate(config, { verbose })
    Gen->>Gen: validateConfig(config)
    Gen->>Pipe: runPipeline(stages, ctx)

    Pipe->>Stages: Stage 1: TTSStage
    Stages->>Stages: generateVoiceSegments()
    Stages->>FS: Write narration MP3 + manifest
    Stages-->>Pipe: ctx.narrationManifest = ...

    Note over Pipe: Narration sync happens<br>post-recording in AudioMixStage

    Pipe->>Stages: Stage 2: AuthStage
    Stages->>Browser: startBrowser()
    Stages->>Stages: loadSession()
    Stages->>Browser: validateSession()
    alt session valid
        Stages-->>Pipe: skipped (session OK)
    else session invalid
        Stages->>Browser: run loginSteps
        Stages->>FS: saveSession()
    end

    Pipe->>Stages: Stage 3: PreStepsStage
    Stages->>Browser: runSteps(page, preSteps)
    Stages->>Browser: close browser

    Pipe->>Stages: Stage 4: RecordingStage
    Stages->>Browser: startRecording()
    Stages->>Browser: runDemo(page, config)
    Note over Browser: installCursorOverlay()<br>for each step: runStep()<br>track scene timestamps
    Stages->>Browser: stopRecording()
    Stages-->>Pipe: ctx.tempVideoPath = ...

    Pipe->>Stages: Stage 5: AudioMixStage
    Stages->>FFmpeg: mergeAudioVideo(video, audio)
    Note over Stages: Auto-shift overlapping<br>narration placements forward
    Stages-->>Pipe: ctx.finalPath = ...

    Pipe->>Stages: Stage 6: OutputStage
    Stages->>Stages: buildSubtitleCues()
    Stages->>FS: Write .srt, .vtt, .meta.json
    Stages-->>Pipe: done

    Pipe->>Stages: Stage 7: PostStepsStage
    Stages->>Browser: startBrowser()
    Stages->>Browser: runSteps(page, postSteps, tolerant)
    Stages->>Browser: close browser

    Pipe-->>Gen: done
    Gen-->>Cmd: done
    Cmd-->>CLI: exitCode 0
    CLI-->>User: ✓ Video created (12.5s) → output/onboarding.mp4
```

## CLI Dispatch Flow

```mermaid
flowchart TD
    A[main()] --> B[parseArgs()]
    B --> C{Command?}

    C -->|--help| D[showHelp() → exit 0]
    C -->|init| E[InitCommand]
    C -->|track| F[TrackCommand]
    C -->|script| G[ScriptRouterCommand]
    C -->|--all| H[RunAllCommand]
    C -->|scenario name| I[RunSingleCommand]
    C -->|no args| J[RunDefaultCommand]

    E --> K[registry.find(['init']) → execute()]
    F --> L[TrackCommand.execute()]
    G --> M[ScriptRouterCommand.execute()]
    H --> N[RunAllCommand.execute()]
    I --> O[RunSingleCommand.execute()]
    J --> P[RunDefaultCommand.execute()]

    H --> Q[findScenarioFiles() → for each: loadConfig → runScenario()]
    I --> R[loadScenario(name) → loadConfig(path) → runScenario()]
    J --> S[findScenarioFiles() → if one: runScenario(); if many: error]

    N --> T{shouldGenerateVoice?}
    T -->|yes| U[generate(config)]
    T -->|no| V[runVideoScenario(config)]
```

## Pipeline Stage Flow (New Architecture)

```mermaid
flowchart TD
    subgraph Input
        CONFIG[DemoReelConfig]
        OPTIONS[GenerateOptions]
    end

    subgraph Pipeline["runPipeline(stages, ctx)"]
        direction TB
        S1["TTSStage: Generate narration audio"]
        S2["AuthStage: Login + save session"]
        S3["PreStepsStage: Setup browser steps"]
        S4["RecordingStage: Record the demo"]
        S5["AudioMixStage: Merge audio+video, auto-shift overlaps"]
        S6["OutputStage: Subtitles + metadata"]
        S7["PostStepsStage: Cleanup"]

        S1 -->|ctx.narrationManifest| S2
        S2 -->|ctx.sessionValid| S3
        S3 -->|ctx.setupDone| S4
        S4 -->|ctx.tempVideoPath<br>ctx.sceneTimestamps| S5
        S5 -->|ctx.finalVideoPath| S6
        S6 -->|ctx.outputPath| S7
    end

    subgraph Output
        VIDEO[MP4 video]
        SRT_FILE[SRT subtitles]
        VTT_FILE[VTT subtitles]
        META_FILE[metadata JSON]
    end

    CONFIG --> S1
    OPTIONS --> S1
    S7 --> VIDEO
    S7 --> SRT_FILE
    S7 --> VTT_FILE
    S7 --> META_FILE
```

## RecordingStage Internal Flow

```mermaid
sequenceDiagram
    participant Stage as RecordingStage
    participant Pool as BrowserPool
    participant Runner as runner/*
    participant Page as Playwright Page

    Stage->>Pool: acquire(ctx.config, true)
    Pool->>Pool: launch browser (headless unless --headed)
    Pool->>Page: newContext({ recordVideo })
    Pool->>Page: newPage()
    Pool-->>Stage: BrowserSession { browser, context, page }

    Stage->>Runner: installCursorOverlay(page, cursor)
    Note over Runner: inject CSS + cursor DOM<br>addInitScript for persistence

    loop For each step
        Stage->>Runner: runStep(page, step, config)
        alt is scene boundary
            Stage->>Stage: record scene timestamp
        end
        Runner->>Runner: applyStartDelayIfNeeded()
        Runner->>Runner: applyStepDelay(delayBeforeMs)
        Runner->>Runner: resolveLocator(page, selector)
        Runner->>Runner: moveMouseBezier(current, target)
        Runner->>Page: mouse.click()
        Runner->>Runner: applyStepDelay(delayAfterMs)
    end

    Stage->>Pool: release(session)
    Pool->>Page: close()
    Note over Page: video file is finalized
    Pool->>Pool: close context + browser
    Pool-->>Stage: tempVideoPath
```

## Voice Generation Flow

```mermaid
flowchart TD
    A[DemonReelConfig with voice + narration] --> B{TTS Provider?}
    B -->|piper| C[ensurePiperBinary() + ensurePiperModel()]
    B -->|openai| D[OpenAI TTS API]
    B -->|elevenlabs| E[ElevenLabs TTS API]

    C --> F[Piper CLI: text → WAV]
    D --> G[OpenAI API: text → audio buffer]
    E --> H[ElevenLabs API: text → audio buffer]

    F --> I{Has pronunciation overrides?}
    G --> I
    H --> I

    I -->|yes| J[Run text replacements]
    I -->|no| K[Generate raw audio]

    J --> L[Cached by content hash?]
    K --> L

    L -->|yes| M[Load from cache]
    L -->|no| N[Generate + cache]

    M --> O[concat WAV files via FFmpeg → MP3]
    N --> O

    O --> P[Write narration-manifest.json]
    P --> Q[ctx.narrationManifest = ...]
```

## Narration Auto-Shift Flow (Post-Recording)

```mermaid
flowchart TD
    A[Narration manifest + Scene timestamps] --> B[Build placements from scene.startMs + narrationDelay]
    B --> C[Sort placements by startMs]
    C --> D{Mode?}

    D -->|off| E[Passthrough — no changes]
    D -->|auto| F[Walk placements, check each pair]
    D -->|strict| G[Walk placements, check each pair]

    F --> H{Overlap?}
    H -->|no| I[No shift needed]
    H -->|yes| J[Shift current placement forward to previous.endMs]
    J --> K[Cascade: next pair checked against updated previous]
    K --> L[Pass corrected placements to ffmpeg]

    G --> M{Overlap?}
    M -->|no| N[Pass — all ok]
    M -->|yes| O[Throw error with overlap details]

    style E fill:#e8f5e9
    style O fill:#ffebee
    style J fill:#e3f2fd
```

The default pipeline uses **post-recording auto-shift** instead of the legacy estimate-based
step-padding engine (`narration-sync.ts`). Overlaps are detected from real recorded timestamps,
and narration placements are shifted forward to eliminate overlaps. Subtitles and metadata
use the corrected placements.
