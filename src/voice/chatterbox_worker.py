"""Persistent Chatterbox TTS worker.

Loads the model once, then serves JSON-line requests over stdin/stdout so the
Node provider pays the ~15s model load once per run instead of once per line.

stdin  -> {"id":"1","text":"...","out":"/tmp/x.wav","audio_prompt_path":null}
stdout -> {"id":"1","ok":true,"path":"/tmp/x.wav","sr":24000}
"""

import contextlib
import json
import os
import sys

GEN_KWARGS = (
    "exaggeration",
    "cfg_weight",
    "temperature",
    "repetition_penalty",
    "top_p",
    "min_p",
    "top_k",
)


def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def main():
    device = os.environ.get("CHATTERBOX_DEVICE", "cpu")

    # Model load, HF downloads and tqdm bars all write to stdout; the protocol
    # lives there, so everything noisy gets pushed to stderr.
    with contextlib.redirect_stdout(sys.stderr):
        import torch
        import torchaudio
        from chatterbox.tts_turbo import ChatterboxTurboTTS

        threads = int(os.environ.get("CHATTERBOX_THREADS", "0")) or (os.cpu_count() or 8)
        torch.set_num_threads(threads)
        model = ChatterboxTurboTTS.from_pretrained(device=device)

    emit({"ready": True, "sr": int(model.sr), "threads": threads})

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
            kwargs = {k: req[k] for k in GEN_KWARGS if req.get(k) is not None}
            if req.get("audio_prompt_path"):
                kwargs["audio_prompt_path"] = req["audio_prompt_path"]

            with contextlib.redirect_stdout(sys.stderr):
                wav = model.generate(req["text"], **kwargs)
                torchaudio.save(req["out"], wav, model.sr)

            emit({"id": req.get("id"), "ok": True, "path": req["out"], "sr": int(model.sr)})
        except Exception as exc:  # noqa: BLE001 - surface every failure to Node
            emit({"id": req.get("id"), "ok": False, "error": f"{type(exc).__name__}: {exc}"})


if __name__ == "__main__":
    main()
