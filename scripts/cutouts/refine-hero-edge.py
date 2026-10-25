"""Refine only the hero's existing transparency; never regenerate photographic pixels."""
from pathlib import Path
import json, io, struct, subprocess
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = Path("dist/assets/photos")
OUT = Path("docs/review/hero-edge")
OUT.mkdir(parents=True, exist_ok=True)
BASE = "c72ea2aa895d558982b704bb851e78fe6f733f45"

def chunks(data):
    assert data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    at = 12
    while at < len(data):
        kind = data[at:at+4]
        size = struct.unpack_from("<I", data, at+4)[0]
        yield kind, data[at+8:at+8+size]
        at += 8 + size + (size % 2)

def replace_alpha(source, image):
    # Encode the mask losslessly, then transplant only its ALPH chunk.
    # The original VP8 photographic bitstream stays byte-for-byte unchanged.
    encoded = io.BytesIO()
    image.save(encoded, format="WEBP", quality=80, alpha_quality=100, method=6)
    alpha = dict(chunks(encoded.getvalue()))[b"ALPH"]
    original_chunks = list(chunks(source))
    assert b"VP8 " in dict(original_chunks) and b"ALPH" in dict(original_chunks)
    body = b"WEBP"
    for kind, payload in original_chunks:
        if kind == b"ALPH":
            payload = alpha
        body += kind + struct.pack("<I", len(payload)) + payload + b"\\0" * (len(payload) % 2)
    result = b"RIFF" + struct.pack("<I", len(body)) + body
    assert dict(chunks(result))[b"VP8 "] == dict(original_chunks)[b"VP8 "]
    return result

report = []
for path in sorted(ROOT.glob("pau-hero-cut*")):
    if path.suffix not in (".png", ".webp"):
        continue
    source = subprocess.check_output(["git", "show", BASE + ":" + path.as_posix()])
    original = Image.open(io.BytesIO(source)).convert("RGBA")
    pixels = np.array(original)
    a = pixels[..., 3].astype(np.float32) / 255
    h, w = a.shape
    scale = w / 1600
    # A signed-distance contour gives a small subpixel contraction without
    # stepping or blurring the opaque subject. Treat hair more gently.
    solid = a > .5
    inside = ndi.distance_transform_edt(solid)
    outside = ndi.distance_transform_edt(~solid)
    band = (inside < 4 * scale + 1) & (outside < 4 * scale + 1)
    filtered = ndi.gaussian_filter(ndi.median_filter(a, size=3), sigma=max(.35, .65 * scale))
    yy = np.arange(h)[:, None] / h
    strength = np.where(yy < .405, .18, .32)
    adjusted = np.clip((filtered - strength) / (1 - strength), 0, 1)
    newa = np.where(band, np.minimum(a, adjusted), a)
    # Remove detached one-pixel crumbs; retain connected flyaway hair.
    labels, _ = ndi.label(newa > .03)
    sizes = np.bincount(labels.ravel())
    crumbs = sizes[labels] < max(3, int(8 * scale * scale))
    newa[crumbs] = 0
    result = pixels.copy()
    result[..., 3] = np.rint(newa * 255).astype(np.uint8)
    # Explicit facial lock: this rectangle is entirely inside the head.
    face = (slice(int(h*.09), int(h*.35)), slice(int(w*.43), int(w*.72)))
    result[face] = pixels[face]
    assert np.array_equal(result[..., :3], pixels[..., :3])
    assert np.array_equal(result[face], pixels[face])
    opaque_core = inside >= 4 * scale + 1
    assert np.array_equal(result[opaque_core], pixels[opaque_core])
    image = Image.fromarray(result)
    if path.suffix == ".webp":
        path.write_bytes(replace_alpha(source, image))
    else:
        image.save(path, optimize=True)
    decoded = np.array(Image.open(path).convert("RGBA"))
    visible = result[..., 3] > 0
    assert np.array_equal(decoded[visible], result[visible])
    report.append({"file": str(path), "rgb_changed": 0, "face_changed": 0,
                   "alpha_pixels_refined": int(np.count_nonzero(result[...,3] != pixels[...,3])),
                   "bytes": path.stat().st_size, "original_bytes": len(source)})
    if w == 1600:
        for name, colour in [("dark", "#2b201a"), ("light", "#eadbc8")]:
            boards = []
            for label, portrait in [("Before", original), ("After", image)]:
                board = Image.new("RGBA", portrait.size, colour)
                board.alpha_composite(portrait)
                board = board.convert("RGB").crop((int(w*.22), 0, w, int(h*.46)))
                board.thumbnail((850, 850))
                canvas = Image.new("RGB", (board.width, board.height+32), colour)
                canvas.paste(board, (0, 32))
                ImageDraw.Draw(canvas).text((10, 10), label, fill="white" if name=="dark" else "black")
                boards.append(canvas)
            review = Image.new("RGB", (sum(b.width for b in boards), max(b.height for b in boards)), colour)
            review.paste(boards[0], (0,0)); review.paste(boards[1], (boards[0].width,0))
            review.save(OUT / (name+".jpg"), quality=94)
(OUT / "verification.json").write_text(json.dumps(report, indent=2)+"\n")
print(json.dumps(report, indent=2))
