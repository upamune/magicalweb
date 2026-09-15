# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.2.6", "scipy==1.15.3", "soundfile==0.13.1", "opencv-python-headless==4.12.0.88"]
# ///
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import numpy as np
import soundfile as sf
from hybrid.audio import assemble, estimate_sync
from hybrid.faces import expanded_box, pixelate
from hybrid.media import SR, recording_stamp
from hybrid.resolve import create_review_project
from scipy import signal


class AudioTests(unittest.TestCase):
    def test_split_float_audio_and_recording_gap(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wave = np.sin(np.arange(SR * 5 + SR // 2) * 0.1).astype("float32") * 1.7
            files = []
            for stamp in ["100000", "100005", "100020"]:
                f = root / f"20260914_{stamp}.wav"
                sf.write(f, wave, SR, subtype="FLOAT")
                files.append(f)
            rows = assemble(files, root / "combined.wav")
            self.assertEqual([r["startSec"] for r in rows], [0, 5.5, 20])
            x, sr = sf.read(root / "combined.wav", dtype="float32")
            self.assertEqual(sr, SR)
            self.assertEqual(len(x), round(25.5 * SR))
            np.testing.assert_allclose(x[: len(wave)], wave, atol=1e-6)
            self.assertGreater(
                float(x.max()), 1.5
            )  # 32-bit float was not clipped to integer full scale.
            self.assertTrue(np.all(x[11 * SR : 20 * SR] == 0))

    def test_natural_order_and_unknown_names(self):
        from hybrid.media import files_in

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for i in [10, 2, 1]:
                sf.write(
                    root / f"REC_{i}.wav",
                    np.ones(SR, dtype=np.float32) * i / 100,
                    SR,
                    subtype="FLOAT",
                )
            files = files_in(root, {".wav"})
            self.assertEqual([f.stem for f in files], ["REC_1", "REC_2", "REC_10"])
            rows = assemble(files, root / "joined.wav")
            self.assertEqual([r["startSec"] for r in rows], [0, 1, 2])

    def test_sync_positive_negative_offset_and_drift(self):
        rng = np.random.default_rng(73)
        raw = signal.savgol_filter(rng.normal(size=14000), 13, 2)
        for offset, scale in [(7.31, 1), (-4.2, 1), (4.73, 1.001)]:
            ref_time = np.arange(10000) / 100
            target_time = np.arange(9000) / 100
            base_time = np.arange(len(raw)) / 100 - 15
            ref = np.interp(ref_time, base_time, raw)
            target = np.interp(offset + scale * target_time, base_time, raw)
            result = estimate_sync(ref, target)
            self.assertAlmostEqual(result["offsetSec"], offset, delta=0.02)
            self.assertAlmostEqual(result["scale"], scale, delta=0.0003)
            self.assertGreaterEqual(len(result["anchors"]), 3)

    def test_uncorrelated_audio_is_not_synced(self):
        rng = np.random.default_rng(7)
        with self.assertRaises(ValueError):
            estimate_sync(rng.normal(size=10000), rng.normal(size=8000))

    def test_silence_is_not_synced(self):
        with self.assertRaises(ValueError):
            estimate_sync(np.zeros(10000), np.zeros(8000))

    def test_bwf_is_sample_accurate(self):
        info = {
            "format": {
                "tags": {"origination_date": "2026-09-14", "time_reference": "4800123"}
            },
            "streams": [{"codec_type": "audio", "sample_rate": "48000"}],
        }
        stamp, kind = recording_stamp(Path("anything.wav"), info)
        self.assertEqual(kind, "bwf")
        self.assertAlmostEqual(stamp % 86400, 100.0025625, places=5)


class FaceTests(unittest.TestCase):
    def test_expansion_and_anonymization_keep_other_pixels(self):
        frame = np.random.default_rng(1).integers(0, 256, (100, 200, 3), dtype=np.uint8)
        original = frame.copy()
        box = expanded_box([10, 10, 20, 20], 200, 100)
        self.assertEqual(box, [3, 3, 37, 37])
        pixelate(frame, [box])
        self.assertTrue(np.array_equal(original[50:], frame[50:]))
        self.assertLess(
            float(frame[3:37, 3:37].std()), float(original[3:37, 3:37].std()) / 2
        )


class TranscriptTests(unittest.TestCase):
    def test_word_timing_and_mic_speakers_match_master(self):
        from hybrid.transcript import transcribe

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            audio = root / "master.wav"
            sf.write(audio, np.zeros(SR * 4), SR)
            words = [
                SimpleNamespace(word="京都", start=0.5, end=1.0, probability=0.9),
                SimpleNamespace(word="ですね", start=2.0, end=2.5, probability=0.95),
            ]
            whisper = MagicMock()
            whisper.WhisperModel.return_value.transcribe.return_value = (
                iter([SimpleNamespace(words=words, end=2.5)]),
                None,
            )
            levels = [np.ones(400), np.zeros(400)]
            levels[1][200:250] = 2
            with patch.dict("sys.modules", {"faster_whisper": whisper}):
                transcribe(
                    audio, root / "transcript.json", levels, ["michiru", "upamune"]
                )
            data = json.loads((root / "transcript.json").read_text())
            self.assertEqual(
                [s["speaker"] for s in data["segments"]], ["michiru", "upamune"]
            )
            self.assertEqual(data["segments"][1]["words"][0]["start"], 2.0)
            self.assertEqual(data["audioDuration"], 4)
            self.assertEqual(len(data["audioSha256"]), 64)


class ResolveTests(unittest.TestCase):
    def test_project_uses_master_time_and_only_starts_own_render(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "processed").mkdir()
            (root / "ingest-report.json").write_text(
                json.dumps(
                    {
                        "episodeNumber": 9,
                        "masterDurationSec": 90,
                        "camera": [
                            {
                                "file": "cam-clean.mp4",
                                "review": {
                                    "reviewWindows": [
                                        {
                                            "startSec": 20,
                                            "faces": 3,
                                            "zeroFrames": 0,
                                            "lowConfidenceFrames": 1,
                                        }
                                    ]
                                },
                            }
                        ],
                    }
                )
            )
            (root / "manifest.json").write_text(
                json.dumps(
                    {
                        "videoSegments": [
                            {
                                "file": "cam-clean.mp4",
                                "timelineStartSec": 60,
                                "timelineEndSec": 80,
                                "sourceStartSec": 3.8,
                            }
                        ]
                    }
                )
            )
            resolve = MagicMock()
            project = resolve.GetProjectManager().CreateProject.return_value
            pool = project.GetMediaPool.return_value
            pool.ImportMedia.return_value = [MagicMock()]
            pool.AppendToTimeline.return_value = [MagicMock()]
            project.AddRenderJob.return_value = "only-this-job"
            result = create_review_project(resolve, root, "Review H264", True)
            args = pool.AppendToTimeline.call_args_list[1].args[0][0]
            self.assertEqual(args["recordFrame"], 1440)
            self.assertEqual(args["startFrame"], 91)
            self.assertEqual(args["endFrame"], 570)
            self.assertEqual(args["mediaType"], 1)
            project.StartRendering.assert_called_once_with(["only-this-job"])
            self.assertEqual(result["status"], "needs-human-review")


if __name__ == "__main__":
    unittest.main()
