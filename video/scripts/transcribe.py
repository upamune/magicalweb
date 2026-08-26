# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "faster-whisper>=1.1.0",
# ]
# [tool.uv]
# exclude-newer = "2026-08-26T15:44:01Z"
# ///
"""faster-whisper で単語タイムスタンプ付き文字起こしを行い mlx-whisper 互換 JSON を書く。

    uv run scripts/transcribe.py <audio> <out.json> [--device auto|cpu|cuda]
"""

import argparse
import json


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("out")
    parser.add_argument("--model", default="large-v3-turbo")
    parser.add_argument("--device", default="auto")
    args = parser.parse_args()

    from faster_whisper import WhisperModel

    compute_type = "int8" if args.device == "cpu" else "default"
    model = WhisperModel(args.model, device=args.device, compute_type=compute_type)
    segments_iter, _ = model.transcribe(args.audio, language="ja", word_timestamps=True)

    segments = []
    for seg in segments_iter:
        segments.append(
            {
                "id": seg.id,
                "start": seg.start,
                "end": seg.end,
                "text": seg.text,
                "words": [
                    {"word": w.word, "start": w.start, "end": w.end, "probability": w.probability}
                    for w in (seg.words or [])
                ],
            }
        )
        print(f"[{seg.start:8.2f}] {seg.text}", flush=True)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(
            {"language": "ja", "text": "".join(s["text"] for s in segments), "segments": segments},
            f,
            ensure_ascii=False,
            indent=2,
        )
    print(f"wrote {args.out} ({len(segments)} segments)")


if __name__ == "__main__":
    main()
