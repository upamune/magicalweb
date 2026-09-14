from .media import audio_duration, probe, sha256, write_json


def transcribe(
    master, output, levels, speakers, model_name="large-v3-turbo", device="cpu"
):
    import numpy as np
    from faster_whisper import WhisperModel

    model = WhisperModel(
        model_name, device=device, compute_type="int8" if device == "cpu" else "default"
    )
    chunks, _ = model.transcribe(
        str(master),
        language="ja",
        word_timestamps=True,
        vad_filter=True,
        initial_prompt="マヂカル.fm。うぱ、みちるだ。京都の街歩き。",
    )
    segments = []
    current = None

    def flush():
        nonlocal current
        if current:
            current["id"] = len(segments)
            current["text"] = "".join(w["word"] for w in current["words"])
            segments.append(current)
        current = None

    for chunk in chunks:
        for word in chunk.words or []:
            start, end = (
                max(0, int(word.start * 100)),
                min(
                    len(levels[0]), max(int(word.end * 100), int(word.start * 100) + 1)
                ),
            )
            strength = [
                float(np.mean(l[start:end])) if end > start else 0 for l in levels
            ]
            speaker = speakers[int(strength[1] > strength[0])]
            if current and (
                current["speaker"] != speaker
                or word.start - current["start"] > 8
                or word.start - current["end"] > 0.7
            ):
                flush()
            if current is None:
                current = {
                    "start": word.start,
                    "end": word.end,
                    "speaker": speaker,
                    "words": [],
                }
            current["end"] = word.end
            current["words"].append(
                {
                    "word": word.word,
                    "start": word.start,
                    "end": word.end,
                    "probability": word.probability,
                }
            )
        print(f"transcribed {chunk.end:.1f}s", flush=True)
    flush()
    write_json(
        output,
        {
            "language": "ja",
            "audioDuration": audio_duration(probe(master)),
            "audioSha256": sha256(master),
            "speakerMethod": "relative-normalized-mic-level",
            "segments": segments,
        },
    )
