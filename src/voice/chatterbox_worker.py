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


def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def main():
    device = os.environ.get("CHATTERBOX_DEVICE", "cpu")
    model_name = os.environ.get("CHATTERBOX_MODEL", "turbo")
    multilingual = model_name == "multilingual"
    gen_kwargs = COMMON_GEN_KWARGS if multilingual else TURBO_GEN_KWARGS

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
                torchaudio.save(req["out"], wav, model.sr)

            emit({"id": req.get("id"), "ok": True, "path": req["out"], "sr": int(model.sr)})
        except Exception as exc:  # noqa: BLE001 - surface every failure to Node
            emit({"id": req.get("id"), "ok": False, "error": f"{type(exc).__name__}: {exc}"})


if __name__ == "__main__":
    main()
