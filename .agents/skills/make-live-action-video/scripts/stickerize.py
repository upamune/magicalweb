# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.2.6", "pillow==11.3.0", "scipy==1.16.1"]
# [tool.uv]
# exclude-newer = "2026-09-21T06:54:53Z"
# ///
"""Turn a lifted RGBA cut-out into a die-cut sticker: cleaned alpha, white border, thin ink rim, soft shadow."""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

if len(sys.argv) != 3:
    sys.exit("usage: stickerize.py LIFTED.png STICKER.png")
src, dst = sys.argv[1], sys.argv[2]
if Path(dst).exists():
    raise FileExistsError(dst)
LONG, BORDER, RIM, PAD = 900, 24, 3, 40
im = Image.open(src).convert("RGBA")
s = LONG / max(im.size)
im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
a = np.asarray(im)[..., 3].astype(np.float32) / 255
a = np.clip((a - 0.35) / 0.3, 0, 1)
core = a > 0.5
core = ndimage.binary_opening(core, iterations=2)
labels, n = ndimage.label(core)
if n > 1:
    sizes = ndimage.sum(core, labels, range(1, n + 1))
    core = labels == (int(np.argmax(sizes)) + 1)
core = ndimage.binary_fill_holes(core)
H, W = core.shape
canvas = (H + 2 * (BORDER + RIM + PAD), W + 2 * (BORDER + RIM + PAD))
off = BORDER + RIM + PAD
big = np.zeros(canvas, bool); big[off:off + H, off:off + W] = core
dist = ndimage.distance_transform_edt(~big)
white = np.clip(BORDER + 0.5 - dist, 0, 1)
rim = np.clip(BORDER + RIM + 0.5 - dist, 0, 1)
shadow = ndimage.gaussian_filter(np.roll(np.roll(rim, 10, 0), 6, 1), 10) * 0.45
rgb = np.zeros(canvas + (3,), np.float32)
alpha = np.zeros(canvas, np.float32)
ink = np.array([29, 26, 46], np.float32)
alpha[:] = shadow
rgb = rgb * (1 - rim[..., None]) + ink * rim[..., None]; alpha = np.maximum(alpha, rim)
rgb = rgb * (1 - white[..., None]) + 255 * white[..., None]
photo = np.zeros(canvas + (4,), np.float32)
photo[off:off + H, off:off + W] = np.asarray(im).astype(np.float32)
pa = (photo[..., 3] / 255) * big
rgb = rgb * (1 - pa[..., None]) + photo[..., :3] * pa[..., None]
out = np.dstack([np.clip(rgb, 0, 255), np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
img = Image.fromarray(out)
img = img.crop(img.getbbox())
img.save(dst)
print(dst, img.size)
