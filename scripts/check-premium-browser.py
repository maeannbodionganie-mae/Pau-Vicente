"""Real-scroll checks for section depth, readable story pages and the animated emoji."""
from pathlib import Path
import contextlib, socket, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
PROOFS=ROOT/"docs/review/premium"
@contextlib.contextmanager
def serve():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1",0));port=sock.getsockname()[1]
    p=subprocess.Popen([sys.executable,"-m","http.server",str(port),"--bind","127.0.0.1","--directory",str(ROOT/"dist")],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    base=f"http://127.0.0.1:{port}"
    try:
        for _ in range(100):
            try:urllib.request.urlopen(base,timeout=1).close();break
            except OSError:time.sleep(.05)
        yield base
    finally:p.terminate();p.wait(timeout=5)

def scroll(page,y):
    page.evaluate("(y)=>scrollTo({top:y,behavior:'instant'})",max(0,y))
    page.wait_for_timeout(750)

def pose(page,selector):
    return page.locator(selector).evaluate("""el=>{
      const s=getComputedStyle(el),m=new DOMMatrixReadOnly(s.transform);
      return {matrix:[...m.toFloat64Array()],opacity:Number(s.opacity)};
    }""")

def overflow(page,label):
    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth+2"),label

PROOFS.mkdir(parents=True,exist_ok=True)
with serve() as base,sync_playwright() as p:
    browser=p.chromium.launch()
    for name,width,height in [("desktop",1440,900),("short",1024,620),("phone",390,844),("small-phone",360,740),("landscape",844,390)]:
        ctx=browser.new_context(viewport={"width":width,"height":height},reduced_motion="no-preference")
        page=ctx.new_page();errors=[];writes=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.on("request",lambda r:writes.append(r.url) if r.method not in ("GET","HEAD") else None)
        page.route("**/api/**",lambda r:r.fulfill(status=200,content_type="application/json",body='{"mode":"portfolio-guide"}'))
        page.goto(base,wait_until="networkidle")
        page.evaluate("()=>document.fonts.ready")
        page.mouse.move(width/2,height/2)
        page.wait_for_function("document.documentElement.classList.contains('immersive')")
        page.wait_for_timeout(850)
        assert page.evaluate("getComputedStyle(document.documentElement).scrollSnapType")=="none"
        assert page.locator("#pau-greeting").is_visible()
        assert page.locator("#pau-greeting").inner_text().startswith("Hi, I’m Pau")
        assert page.locator("#pau-launcher img").count()==4
        assert page.locator("#pau-launcher img").evaluate_all("imgs=>imgs.every(i=>i.complete&&i.naturalWidth===256)")
        assert page.locator(".pau-avatar-stack").evaluate("el=>getComputedStyle(el).animationName")=="pau-head"
        before=page.locator(".pau-avatar-stack").evaluate("el=>getComputedStyle(el).transform")
        page.wait_for_timeout(350)
        after=page.locator(".pau-avatar-stack").evaluate("el=>getComputedStyle(el).transform")
        assert before!=after,"head must actually move in 3D"
        page.evaluate("""()=>{for(const el of document.querySelectorAll('#pau-launcher .pau-emoji-frame')){
          const a=el.getAnimations()[0];a.pause();a.currentTime=0;
        }}""")
        if name in ("desktop","phone"):
            page.screenshot(path=str(PROOFS/f"{name}-welcome.jpg"),type="jpeg",quality=86)
        for state,ms in [("pau-gaze-left",2500),("pau-gaze-right",7000),("pau-blink",2960)]:
            frame=page.locator("#pau-launcher ."+state)
            frame.evaluate("(el,t)=>{el.getAnimations()[0].currentTime=t}",ms)
            assert frame.evaluate("el=>Number(getComputedStyle(el).opacity)")>.95,(name,state)
            if name=="desktop":
                page.locator("#pau-launcher").screenshot(path=str(PROOFS/f"emoji-{state}.png"))
            frame.evaluate("el=>{el.getAnimations()[0].currentTime=0}")
        page.evaluate("""()=>{for(const el of document.querySelectorAll('#pau-launcher .pau-emoji-frame'))el.getAnimations()[0].play()}""")
        page.locator("#pau-greeting-open").click()
        assert page.locator("#pau-chat").is_visible()
        assert not page.locator("#pau-greeting").is_visible()
        page.keyboard.press("Escape")
        assert not page.locator("#pau-chat").is_visible()
        items=page.evaluate("""()=>[...document.querySelectorAll('[data-scroll-section]')].map(el=>({
           id:el.getAttribute('data-scroll-section'),top:el.getBoundingClientRect().top+scrollY
        }))""")
        assert len(items)>=9,(name,"every major section needs depth",items)
        changed=0
        for item in items:
            if item["id"]=="home":continue
            selector='[data-scroll-section="'+item["id"]+'"] [data-depth-content]'
            scroll(page,item["top"]-height*.76);a=pose(page,selector)
            if item["id"]=="about" and name in ("desktop","phone"):
                page.screenshot(path=str(PROOFS/f"{name}-section-entry.jpg"),type="jpeg",quality=86)
            scroll(page,item["top"]-height*.16);b=pose(page,selector)
            assert max(abs(x-y) for x,y in zip(a["matrix"],b["matrix"]))>.01,(name,item["id"],"no scroll-linked section transition",a,b)
            assert b["opacity"]>.9,(name,item["id"],"reading position should be clear",b)
            changed+=1
            overflow(page,(name,item["id"]))
        assert changed>=8
        scroll(page,0)
        page.wait_for_timeout(200)
        geometry=page.evaluate("""()=>({h:innerHeight,next:document.querySelector('#chapter-2').getBoundingClientRect().top+scrollY})""")
        scroll(page,geometry["next"]-height)
        assert page.locator("#chapter-1 .chapter-copy p").last.evaluate("el=>{const r=el.getBoundingClientRect();return r.bottom>0&&r.bottom<innerHeight+3}"),"chapter end must remain readable"
        scroll(page,geometry["next"]-height*.6)
        turn=pose(page,"#chapter-1 .page-inner")
        assert abs(turn["matrix"][6])>.01,(name,"chapter should turn in 3D",turn)
        overflow(page,name+" story")
        if name in ("desktop","phone"):
            page.screenshot(path=str(PROOFS/f"{name}-chapter-turn.jpg"),type="jpeg",quality=86)
        page.emulate_media(reduced_motion="reduce")
        page.wait_for_function("!document.documentElement.classList.contains('immersive')")
        assert page.locator("#chapter-1").evaluate("el=>getComputedStyle(el).position")=="relative"
        assert page.locator(".pau-avatar-stack").evaluate("el=>getComputedStyle(el).animationName")=="none"
        assert page.locator(".moments-view").evaluate("el=>getComputedStyle(el).position")=="relative"
        assert not errors,(name,errors)
        assert not writes,(name,writes)
        ctx.close()
        print(f"PASS: {name}: {changed} sections change depth on scroll, no document snapping, chapter end readable, 3D page turn, moving head/gaze/blink, welcome bubble, reduced motion and overflow.",flush=True)
    browser.close()
