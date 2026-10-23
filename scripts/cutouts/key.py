"""Backdrop-difference matting for portraits shot on a smooth studio backdrop.
coarse mask (IS-Net) -> trimap -> background plate B (smooth fill) -> local foreground colour F ->
alpha = projection of (C - B) on (F - B) inside the edge band -> unmix: Fg = (C - (1 - a) B) / a."""
import sys, numpy as np, cv2
from PIL import Image
src, maskp, out = sys.argv[1:4]
C = np.asarray(Image.open(src).convert('RGB'), dtype=np.float32) / 255.0
M = np.asarray(Image.open(maskp).convert('L'), dtype=np.float32) / 255.0
H, W = M.shape

def ncblur(img, w, sigma):
    """Normalized convolution: fill unknown pixels from weighted neighbours."""
    k = int(sigma * 3) | 1
    num = cv2.GaussianBlur(img * w[..., None], (k, k), sigma)
    den = cv2.GaussianBlur(w, (k, k), sigma)[..., None]
    return num / np.maximum(den, 1e-6), den[..., 0]

def disk(r): return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
from scipy import ndimage
outside = cv2.erode((M < 0.03).astype(np.uint8), disk(22)).astype(np.float32)
# Rough backdrop plate from the outside region, used to tell enclosed backdrop pockets from body parts.
_bp, _ = ncblur(C, outside, 80)
S = M > 0.5
# The subject runs off the bottom of the frame: close it there so pockets above the hem count as enclosed.
Sp = np.vstack([S, np.ones((1, W), bool)])
Sf = ndimage.binary_fill_holes(Sp)[:-1]
lab_, n_ = ndimage.label(Sf & ~S)
solid = S.copy()
pockets = np.zeros_like(S)
for i in range(1, n_ + 1):
    comp = lab_ == i
    dist = np.sqrt(((C[comp] - _bp[comp]) ** 2).sum(-1)).mean()
    if dist > 0.2: solid |= comp          # body, clothing or skin the mask missed
    else: pockets |= comp                 # real backdrop seen through a gap
fg_core = cv2.erode(solid.astype(np.uint8), disk(10)).astype(np.float32)
# Near the outline, thin hair lets the backdrop glow through: pixels that still look like backdrop are keyed, not kept.
edge_dist = cv2.distanceTransform(solid.astype(np.uint8), cv2.DIST_L2, 5)
bdist = np.sqrt(((C - _bp) ** 2).sum(-1))
backdropish = ((bdist < 0.24) & (M < 0.9)) | ((bdist < 0.16) & (M < 0.97)) | (bdist < 0.11)
backdropish = cv2.dilate(backdropish.astype(np.uint8), disk(2)).astype(bool)
fg_core = np.where((edge_dist < 90) & backdropish, 0, fg_core).astype(np.float32)
bg_known = np.clip(outside + cv2.erode(pockets.astype(np.uint8), disk(6)).astype(np.float32), 0, 1)
band = 1 - np.clip(fg_core + bg_known, 0, 1)

# Background plate: smooth multi-scale fill from the visible backdrop.
B = C.copy()
for sigma in (120, 60, 30):
    fill, den = ncblur(C, bg_known, sigma)
    B = np.where(bg_known[..., None] > 0, C, fill) if sigma == 120 else np.where(bg_known[..., None] > 0, C, np.where(den[..., None] > 0.02, fill, B))
B = cv2.GaussianBlur(B, (0, 0), 6)
B = np.where(bg_known[..., None] > 0, C, B)

# Local foreground colour, spread outward from the solid subject.
F, den = ncblur(C, fg_core, 10)
F2, _ = ncblur(C, fg_core, 40)
F = np.where(den[..., None] > 0.05, F, F2)

# A second foreground guess biased to the darkest nearby subject colour (hair), for strands next to skin.
lum = C.mean(-1)
wd = fg_core * (1 - lum) ** 4
Fd, dden = ncblur(C, wd, 14)
Fd2, _ = ncblur(C, wd, 50)
Fd = np.where(dden[..., None] > 0.002, Fd, Fd2)
def solve(Fx):
    d = Fx - B; dd = (d * d).sum(-1)
    a = np.clip(((C - B) * d).sum(-1) / np.maximum(dd, 1e-6), 0, 1)
    err = np.sqrt(((C - (a[..., None] * Fx + (1 - a[..., None]) * B)) ** 2).sum(-1))
    return a, err, dd
a1, e1, dd1 = solve(F); a2, e2, dd2 = solve(Fd)
use2 = e2 < e1
a_key = np.where(use2, a2, a1); dd = np.where(use2, dd2, dd1)
F = np.where(use2[..., None], Fd, F)
# Where foreground and backdrop are too alike to separate (warm skin on yellow), trust the coarse mask.
conf = np.clip((np.sqrt(dd) - 0.12) / 0.18, 0, 1)
a_band = conf * a_key + (1 - conf) * M
A = np.where(fg_core > 0, 1.0, np.where(bg_known > 0, 0.0, a_band))
# Keep strands that belong to the subject: limit to a generous zone around the coarse mask.
zone = cv2.dilate((M > 0.08).astype(np.uint8), disk(18)).astype(np.float32)
zone = cv2.GaussianBlur(zone, (0, 0), 4)
A = A * zone
A = np.where(A < 0.05, 0, A)
A = cv2.bilateralFilter(A.astype(np.float32), 5, 0.08, 3)
A = np.clip(A, 0, 1)

# Unmix the backdrop from every edge pixel.
a3 = A[..., None]
Fg = (C - (1 - a3) * B) / np.maximum(a3, 1e-3)
Fg = np.clip(Fg, 0, 1)
w = np.clip((A - 0.08) / 0.4, 0, 1)[..., None]        # faint pixels lean on the local colour (less noise)
Fg = w * Fg + (1 - w) * F
Fg = np.where(fg_core[..., None] > 0, C, Fg)
# Colour clean-up inside the edge band only (never the solid face or blazer).
lab = cv2.cvtColor((Fg * 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
L, aa, bb = lab[..., 0] * 100 / 255, lab[..., 1] - 128, lab[..., 2] - 128
inband = (band > 0) & (A > 0.02)
# 1) Unmixing a warm backdrop out of thin metal leaves a blue-violet cast: return it to neutral metal.
cool = inband & (bb < -4)
aa = np.where(cool, aa * 0.25, aa); bb = np.where(cool, np.maximum(bb * 0.15, -2) + 3, bb)
# 2) Backdrop light still glowing in dark hair strands: calm the orange rim toward natural dark brown.
rim = inband & (L < 58) & (np.hypot(aa, bb) > 12)
k = np.where(rim, 0.4, 1.0)
aa, bb = aa * k, bb * k
# 3) Thin strands that unmix to a pale grey read as ghosting on a dark page: settle them to a soft dark brown.
grey = inband & (np.hypot(aa, bb) < 10) & (L > 40) & (L < 82) & (A < 0.85)
L = np.where(grey, 26 + 0.25 * (L - 40), L)
aa = np.where(grey, aa * 0.5 + 3, aa); bb = np.where(grey, bb * 0.5 + 7, bb)
lab = np.dstack([L * 255 / 100, aa + 128, bb + 128]).clip(0, 255).astype(np.uint8)
Fg = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB).astype(np.float32) / 255.0
Fg = np.where(fg_core[..., None] > 0, C, Fg)
np.save(out + '.alpha.npy', A.astype(np.float16))
rgba = np.dstack([Fg, A])
Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA').save(out)
print('saved', out, W, H)
