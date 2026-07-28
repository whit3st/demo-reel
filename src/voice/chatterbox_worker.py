"""Persistent Chatterbox TTS worker.

Loads the model once, then serves JSON-line requests over stdin/stdout so the
Node provider pays the model load once per run instead of once per line.

CHATTERBOX_MODEL selects the checkpoint: "turbo" (English only) or
"multilingual" (23 languages, requires language_id on every request).

stdin  -> {"id":"1","text":"...","out":"/tmp/x.wav","audio_prompt_path":null}
stdout -> {"id":"1","ok":true,"path":"/tmp/x.wav","sr":24000}
"""

import contextlib
import json
import os
import sys

# Turbo accepts top_k; the multilingual checkpoint does not.
COMMON_GEN_KWARGS = (
    "exaggeration",
    "cfg_weight",
    "temperature",
    "repetition_penalty",
    "top_p",
    "min_p",
)
TURBO_GEN_KWARGS = COMMON_GEN_KWARGS + ("top_k",)

# Chatterbox intermittently appends a burst of non-speech audio after the
# narration has finished - measured at ~60% of renders on the multilingual
# checkpoint, median 0.8s, up to 1.36s, and loud enough to be obvious
# (worst case 18dB below the speech peak). It is a known upstream bug with
# no fix and no parameter that suppresses it:
# https://github.com/resemble-ai/chatterbox/issues/271
#
# The artifact is always separated from the speech by real silence, so it is
# reliably detectable: find the last sustained silent gap and drop whatever
# follows it.
FRAME_S = 0.02
SILENCE_DB = -50.0  # relative to the clip's peak
MIN_GAP_S = 0.30  # long enough to be a pause, not an inter-word stop
KEEP_TAIL_S = 0.15  # silence left after the speech so the cut is not abrupt


def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def trim_trailing_artifact(wav, sr):
    """Drop hallucinated audio after the final silent gap.

    `wav` is the (1, samples) tensor Chatterbox returns. Returns it unchanged
    when nothing looks like an artifact.
    """
    import numpy as np

    samples = wav.squeeze(0).cpu().numpy()
    win = int(FRAME_S * sr)
    frames = len(samples) // win
    if frames < 2:
        return wav

    rms = np.sqrt(np.mean(samples[: frames * win].reshape(frames, win) ** 2, axis=1))
    db = 20 * np.log10(np.maximum(rms, 1e-10))
    rel = db - db.max()
    loud = rel > SILENCE_DB
    if not loud.any():
        return wav

    last_loud = int(np.flatnonzero(loud)[-1])
    gap_frames = int(MIN_GAP_S / FRAME_S)

    # Walk back from the last loud frame looking for the silence that precedes it.
    i = last_loud
    while i > 0:
        if not loud[i]:
            j = i
            while j > 0 and not loud[j]:
                j -= 1
            if (i - j) >= gap_frames:
                speech_frames = j + 1
                tail_frames = last_loud - i
                # A real closing phrase after a dramatic pause is comparable in
                # length to what came before; a hallucinated tail is short.
                # Only cut when the trailing burst is the smaller of the two.
                if tail_frames >= speech_frames:
                    return wav
                cut = int((speech_frames * FRAME_S + KEEP_TAIL_S) * sr)
                return wav[:, : min(cut, wav.shape[1])]
            i = j
        i -= 1

    return wav


def main():
    device = os.environ.get("CHATTERBOX_DEVICE", "cpu")
    model_name = os.environ.get("CHATTERBOX_MODEL", "turbo")
    multilingual = model_name == "multilingual"
    gen_kwargs = COMMON_GEN_KWARGS if multilingual else TURBO_GEN_KWARGS
    skip_trim = os.environ.get("CHATTERBOX_TRIM") == "0"

    # Model load, HF downloads and tqdm bars all write to stdout; the protocol
    # lives there, so everything noisy gets pushed to stderr.
    with contextlib.redirect_stdout(sys.stderr):
        import torch
        import torchaudio

        threads = int(os.environ.get("CHATTERBOX_THREADS", "0")) or (os.cpu_count() or 8)
        torch.set_num_threads(threads)

        if multilingual:
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS

            model = ChatterboxMultilingualTTS.from_pretrained(device=device)
        else:
            from chatterbox.tts_turbo import ChatterboxTurboTTS

            model = ChatterboxTurboTTS.from_pretrained(device=device)

    emit({"ready": True, "sr": int(model.sr), "threads": threads, "model": model_name})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as exc:
            emit({"ok": False, "error": f"bad request json: {exc}"})
            continue

        if req.get("cmd") == "shutdown":
            break

        try:
            kwargs = {k: req[k] for k in gen_kwargs if req.get(k) is not None}
            if req.get("audio_prompt_path"):
                kwargs["audio_prompt_path"] = req["audio_prompt_path"]

            # The multilingual checkpoint takes language_id as a required
            # positional argument; turbo has no such parameter.
            args = [req["text"]]
            if multilingual:
                args.append(req.get("language_id") or "en")

            with contextlib.redirect_stdout(sys.stderr):
                wav = model.generate(*args, **kwargs)
                trimmed = wav if skip_trim else trim_trailing_artifact(wav, model.sr)
                torchaudio.save(req["out"], trimmed, model.sr)

            emit(
                {
                    "id": req.get("id"),
                    "ok": True,
                    "path": req["out"],
                    "sr": int(model.sr),
                    "trimmedMs": int((wav.shape[1] - trimmed.shape[1]) / model.sr * 1000),
                }
            )
        except Exception as exc:  # noqa: BLE001 - surface every failure to Node
            emit({"id": req.get("id"), "ok": False, "error": f"{type(exc).__name__}: {exc}"})


if __name__ == "__main__":
    main()
