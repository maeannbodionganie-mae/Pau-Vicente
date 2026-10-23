import sys, time, onnxruntime as ort
from PIL import Image
from rembg import new_session
src, out, model = sys.argv[1], sys.argv[2], sys.argv[3]
so = ort.SessionOptions(); so.enable_cpu_mem_arena = False; so.enable_mem_pattern = False; so.intra_op_num_threads = 2

t = time.time(); s = new_session(model, sess_opts=so)
m = s.predict(Image.open(src).convert('RGB'))[0]; m.save(out); print(model, 'done', round(time.time()-t, 1), flush=True)
