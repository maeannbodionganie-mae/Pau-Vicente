"""Tone warm-lit hair to natural dark brown inside a face-parsing hair mask. Skin and everything else untouched."""
import sys, numpy as np, cv2, onnxruntime as ort
from PIL import Image
inp, out = sys.argv[1], sys.argv[2]
im = Image.open(inp).convert('RGBA'); rgba = np.asarray(im).astype(np.float32) / 255.0
rgb, A = rgba[..., :3], rgba[..., 3]
H, W = A.shape
# Square crop around the head: from the top of the figure, centred on it, wide enough to hold hair to the shoulders.
ys, xs = np.where(A > 0.5)
top = ys.min(); band = (ys < top + 0.18 * H)
cx = int(xs[band].mean()); side = int(min(W, H * (float(sys.argv[3]) if len(sys.argv) > 3 else 0.5)))
x0 = int(np.clip(cx - side // 2, 0, max(0, W - side))); y0 = int(max(0, top - side * 0.06))
crop = rgb[y0:y0 + side, x0:x0 + side]
bgc = np.array([0.5, 0.5, 0.5]); comp = crop * A[y0:y0 + side, x0:x0 + side, None] + bgc * (1 - A[y0:y0 + side, x0:x0 + side, None])
x = cv2.resize(comp, (512, 512), interpolation=cv2.INTER_AREA)
x = ((x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]).transpose(2, 0, 1)[None].astype(np.float32)
s = ort.InferenceSession((sys.argv[4] if len(sys.argv) > 4 else 'faceparse.onnx'), providers=['CPUExecutionProvider'])
logits = s.run(None, {'input': x})[0][0]
prob = np.exp(logits - logits.max(0)); prob /= prob.sum(0)
hair = cv2.resize(prob[17], (crop.shape[1], crop.shape[0]), interpolation=cv2.INTER_LINEAR)
skin = cv2.resize(prob[[1, 7, 8, 10, 14]].sum(0), (crop.shape[1], crop.shape[0]), interpolation=cv2.INTER_LINEAR)
Hm = np.zeros((H, W), np.float32); Sk = np.zeros((H, W), np.float32)
Hm[y0:y0 + crop.shape[0], x0:x0 + crop.shape[1]] = hair; Sk[y0:y0 + crop.shape[0], x0:x0 + crop.shape[1]] = skin
# Hair below the crop (long hair over the shoulders): carry the mask down along dark, warm, low-saturation-free pixels is risky; keep crop only.
Hm = np.clip((Hm - 0.35) / 0.4, 0, 1) * np.clip(1 - (Sk - 0.2) / 0.3, 0, 1)
Hm = cv2.GaussianBlur(Hm, (0, 0), 2.5) * (A > 0.01)
lab = cv2.cvtColor((rgb * 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
L, a, b = lab[..., 0] * 100 / 255, lab[..., 1] - 128, lab[..., 2] - 128
chroma = np.hypot(a, b)
warm = np.clip((chroma - 8) / 22, 0, 1) * Hm            # only the coloured (lit) strands move
target_c = 11.0                                          # natural dark brown, still warm
scale = np.where(chroma > 1e-3, np.minimum(1, target_c / np.maximum(chroma, 1e-3)), 1)
k = 1 - warm * (1 - scale)
a2, b2 = a * k, b * k
L2 = L - warm * 0.55 * np.maximum(L - 18, 0)            # calm the glow, keep the strand texture
lab2 = np.dstack([L2 * 255 / 100, a2 + 128, b2 + 128]).clip(0, 255).astype(np.uint8)
rgb2 = cv2.cvtColor(lab2, cv2.COLOR_LAB2RGB).astype(np.float32) / 255
Image.fromarray((np.dstack([rgb2, A]) * 255 + 0.5).astype(np.uint8), 'RGBA').save(out)
Image.fromarray((Hm * 255).astype(np.uint8)).save(out + '.hair.png')
print('graded', out, 'crop', x0, y0, side)
