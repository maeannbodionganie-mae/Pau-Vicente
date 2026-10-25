"""Export the approved generated emoji sheet as aligned lightweight animation frames."""
from pathlib import Path
from PIL import Image
import json, hashlib
root=Path(__file__).resolve().parents[1]
source=root/"source-assets/assistant/pau-emoji-sheet.png"
im=Image.open(source).convert("RGBA")
assert im.width==im.height and im.width%2==0
half=im.width//2
names=["front","left","right","blink"]
report=[]
for i,name in enumerate(names):
    frame=im.crop(((i%2)*half,(i//2)*half,(i%2+1)*half,(i//2+1)*half))
    box=frame.getchannel("A").point(lambda x:255 if x>24 else 0).getbbox()
    assert box and box[2]-box[0]>half*.4 and box[3]-box[1]>half*.6
    frame=frame.crop(box)
    frame.thumbnail((232,232),Image.Resampling.LANCZOS)
    canvas=Image.new("RGBA",(256,256),(0,0,0,0))
    canvas.alpha_composite(frame,((256-frame.width)//2,(256-frame.height)//2))
    path=root/("dist/assets/pau-emoji-"+name+".webp")
    canvas.save(path,format="WEBP",lossless=True,method=6,exact=True)
    assert Image.open(path).size==(256,256)
    report.append({"state":name,"bytes":path.stat().st_size,"sha256":hashlib.sha256(path.read_bytes()).hexdigest()})
assert len({x["sha256"] for x in report})==4
out=root/"docs/review/premium"
out.mkdir(parents=True,exist_ok=True)
(out/"avatar-assets.json").write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps(report,indent=2))
