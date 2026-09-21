# /// script
# requires-python = ">=3.12"
# dependencies = ["opencv-python-headless==4.12.0.88", "numpy==2.2.6"]
# [tool.uv]
# exclude-newer = "2026-09-21T06:54:53Z"
# ///
"""Synthetic tests; do not touch episode media or Resolve."""
import importlib.util
import json
import subprocess
import struct
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).parent
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("round_faces", ROOT / "round_faces.py")
round_faces = importlib.util.module_from_spec(spec)
spec.loader.exec_module(round_faces)


def run(*args, check=True):
    result = subprocess.run(list(map(str, args)), capture_output=True, text=True)
    if check and result.returncode:
        raise RuntimeError(result.stderr[-5000:])
    return result


class HelpersTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="live-video-skill-test-")
        cls.folder = Path(cls.temporary.name)
        cls.source = cls.folder / "source.mp4"
        run("ffmpeg", "-v", "error", "-n", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=24000/1001",
            "-frames:v", "96", "-an", "-vf", "setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709", "-c:v", "libx264", "-crf", "18", "-threads", "2",
            "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", cls.source)
        cls.trace = cls.folder / "masks.jsonl"
        cls.rows = [{"frame": n, "boxes": [[70, 40, 140, 130]], "acceptedFaceCores": [[85, 60, 130, 115]]} for n in range(96)]
        cls.trace.write_text("".join(json.dumps(row) + "\n" for row in cls.rows))
        cls.manifest = cls.folder / "manifest.json"
        cls.metadata = {"state": "ready", "frames": 96, "fps": "24000/1001", "width": 320, "height": 180,
                        "sourceSha256": round_faces.digest(cls.source), "traceSha256": round_faces.digest(cls.trace)}
        cls.manifest.write_text(json.dumps(cls.metadata))

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def test_oval_edges_and_centers(self):
        frame = np.random.default_rng(12).integers(0, 256, (180, 320, 3), dtype=np.uint8)
        row = self.rows[0]
        actual = round_faces.oval_blur(frame, row)
        np.testing.assert_array_equal(actual[:20], frame[:20])
        self.assertLess(actual[70:100, 95:120].var(), frame[70:100, 95:120].var() / 10)
        # An offset face core receives a supplemental ellipse.
        displaced = {**row, "acceptedFaceCores": [[180, 50, 210, 90]]}
        shapes = round_faces.ellipses(displaced)
        self.assertGreater(len(shapes), len(displaced["boxes"]))
        self.assertTrue(all(round_faces.covered(p, shapes, .22) for p in round_faces.face_points(displaced["acceptedFaceCores"][0])))
        circles = round_faces.ellipses(displaced, {**round_faces.STYLE, "roundness": 1})
        self.assertTrue(all(rx == ry for _, _, rx, ry in circles))

    def test_hollyland_concat_header_and_samples(self):
        candidates = [
            ROOT.parent.parent / "hollyland-audio/scripts/sync_lavs.py",
            Path.home() / ".agents/skills/hollyland-audio/scripts/sync_lavs.py",
        ]
        helper = next((path for path in candidates if path.exists()), None)
        if helper is None:
            self.skipTest("Optional hollyland-audio skill is not installed")
        spec = importlib.util.spec_from_file_location("lavs_under_test", helper)
        lavs = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = lavs
        spec.loader.exec_module(lavs)
        parts = [np.array([0, .25, 1.4, -.8], dtype="<f4"), np.array([-.7, -.2, 0], dtype="<f4")]
        files = [self.folder / f"split-{i}.wav" for i in range(2)]
        for file, samples in zip(files, parts):
            lavs.write_wav(file, samples, 1)
        destination = self.folder / "joined.wav"
        count, splices = lavs.concat_wav_parts(files, destination)
        raw = destination.read_bytes()
        offset, declared, _ = lavs.parse_wav(destination)
        self.assertEqual(struct.unpack_from("<I", raw, 4)[0], len(raw) - 8)
        self.assertEqual(declared, len(raw) - offset)
        self.assertEqual(raw[offset:], b"".join(samples.tobytes() for samples in parts))
        self.assertEqual((count, splices), (7, [4]))

    def test_incomplete_trace_rejected(self):
        short = self.folder / "short.jsonl"
        short.write_text(json.dumps(self.rows[0]) + "\n")
        with self.assertRaisesRegex(ValueError, "Incomplete trace"):
            round_faces.load_rows(short, 96, 320, 180, 0, 1)

    def test_bad_hash_rejected_without_output(self):
        bad = self.folder / "bad.json"
        bad.write_text(json.dumps({**self.metadata, "sourceSha256": "0" * 64}))
        target = self.folder / "should-not-exist.mp4"
        result = run(sys.executable, ROOT / "round_faces.py", self.source, self.trace, bad, target, "--dry-run", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("hash mismatch", result.stderr)
        self.assertFalse(target.exists())

    def test_nonzero_preview_exact_frame_and_no_overwrite(self):
        output = self.folder / "preview.mp4"
        run(sys.executable, ROOT / "round_faces.py", self.source, self.trace, self.manifest, output, "--first", "35", "--frames", "12")
        metadata = round_faces.probe(output)
        self.assertEqual(metadata["nb_frames"], "12")
        self.assertEqual(metadata["r_frame_rate"], "24000/1001")
        receipt = json.loads(output.with_suffix(".status.json").read_text())
        self.assertTrue(receipt["partial"])
        self.assertEqual(receipt["privacyReview"], "pending-human-review")
        actual = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(output), "-frames:v", "1", "-pix_fmt", "bgr24", "-f", "rawvideo", "-"])
        actual = np.frombuffer(actual, np.uint8).reshape(180, 320, 3).astype(np.float32)
        errors = []
        for n in [34, 35, 36]:
            raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(self.source), "-vf", f"select=eq(n\\,{n})", "-frames:v", "1", "-pix_fmt", "bgr24", "-f", "rawvideo", "-"])
            frame = np.frombuffer(raw, np.uint8).reshape(180, 320, 3)
            expected = round_faces.oval_blur(frame, self.rows[35]).astype(np.float32)
            errors.append(float(np.mean((actual - expected) ** 2)))
        self.assertEqual(int(np.argmin(errors)), 1, errors)
        old_hash = round_faces.digest(output)
        retry = run(sys.executable, ROOT / "round_faces.py", self.source, self.trace, self.manifest, output, check=False)
        self.assertNotEqual(retry.returncode, 0)
        self.assertEqual(round_faces.digest(output), old_hash)

    def test_mastering_mono_and_reject_overwrite(self):
        source, output = self.folder / "mono.wav", self.folder / "master.wav"
        run("ffmpeg", "-v", "error", "-n", "-f", "lavfi", "-i", "anoisesrc=color=pink:r=48000:d=5:seed=42", "-c:a", "pcm_f32le", source)
        run(sys.executable, ROOT / "master_audio.py", source, output, "--highpass", "75")
        receipt = json.loads(output.with_suffix(".loudness.json").read_text())
        self.assertLess(abs(float(receipt["verified"]["input_i"]) + 16), .5)
        self.assertLessEqual(float(receipt["verified"]["input_tp"]), -1)
        result = run(sys.executable, ROOT / "master_audio.py", source, output, check=False)
        self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
