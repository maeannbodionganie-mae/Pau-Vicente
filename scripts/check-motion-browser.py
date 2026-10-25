"""Compare the preserved legacy choreography under the shared section enhancements."""
from pathlib import Path
import contextlib, json, socket, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = "3ed47c8b5155cfe131863533c74c127cb3f7dcd2"
PROOFS = ROOT / "docs/review/responsive-motion"
ORIGINAL = {name: subprocess.check_output(["git", "show", BASE + ":dist/assets/" + name]).decode()
            for name in ("motion.js", "style.css")}

@contextlib.contextmanager
def server():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    p = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1",
                          "--directory", str(ROOT / "dist")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    url = f"http://127.0.0.1:{port}"
    try:
        for _ in range(100):
            try:
                urllib.request.urlopen(url, timeout=1).close()
                break
            except OSError:
                time.sleep(.05)
        yield url
    finally:
        p.terminate()
        p.wait(timeout=5)

def open_page(browser, url, width, height, baseline=False, reduced=False):
    ctx = browser.new_context(viewport={"width":width, "height":height},
                              reduced_motion="reduce" if reduced else "no-preference")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    page.route("**/api/**", lambda r: r.fulfill(status=503, content_type="application/json", body='{"status":"unavailable"}'))
    if baseline:
        for filename, source in ORIGINAL.items():
            page.route("**/assets/" + filename, (lambda body, name: lambda r:
                       r.fulfill(status=200, content_type="text/css" if name.endswith(".css") else "text/javascript", body=body))(source, filename))
    page.goto(url, wait_until="networkidle")
    page.evaluate("async () => {await document.fonts.ready; await Promise.all([...document.images].filter(i=>i.complete).map(i=>i.decode().catch(()=>{})));}")
    page.wait_for_timeout(2400)
    return ctx, page, errors

def snapshot(page):
    return page.evaluate("""() => {
      const selected = [...document.querySelectorAll('[data-layer], .page-inner, .moment, .moment img, .moment figcaption')];
      return {scroll:scrollY, cine:document.documentElement.classList.contains('cine'),
              snap:getComputedStyle(document.documentElement).scrollSnapType,
              elements:selected.map(el=>{
                const s=getComputedStyle(el),r=el.getBoundingClientRect();
                return {visible:r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth,transform:s.transform==='none'?[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]:[...new DOMMatrixReadOnly(s.transform).toFloat64Array()],
                        filter:s.filter, clip:s.clipPath, opacity:s.opacity,
                        position:s.position, origin:s.transformOrigin};
              })};
    }""")

def compare(expected, actual, label):
    assert abs(expected["scroll"]-actual["scroll"]) <= 1, (label,"scroll",expected["scroll"],actual["scroll"])
    assert expected["cine"] == actual["cine"] and expected["snap"] == actual["snap"], (label,"mode")
    assert len(expected["elements"]) == len(actual["elements"])
    for i,(before,after) in enumerate(zip(expected["elements"],actual["elements"])):
        if not before["visible"] and not after["visible"]:
            continue  # Offscreen layers deliberately retain their last in-view pose.
        assert before["visible"] == after["visible"],(label,i,"visibility",before,after)
        assert max(abs(a-b) for a,b in zip(before["transform"],after["transform"])) < .002, (label,i,"transform",before,after)
        for prop in ("filter","clip","opacity","position","origin"):
            assert before[prop] == after[prop], (label,i,prop,before[prop],after[prop])

assert (ROOT/"dist/assets/motion.js").read_text() == ORIGINAL["motion.js"], "restore original controller exactly"
current_css=(ROOT/"dist/assets/style.css").read_text()
for start,end in [("/* Motion (", "@media(max-width:1180px)"),
                  (".cine .moments-track", "/* Speaking")]:
    if start in ORIGINAL["style.css"] and end in ORIGINAL["style.css"]:
        expected=ORIGINAL["style.css"].split(start,1)[1].split(end,1)[0]
        actual=current_css.split(start,1)[1].split(end,1)[0]
        assert expected == actual, ("original motion CSS changed", start)

PROOFS.mkdir(parents=True, exist_ok=True)
with server() as url, sync_playwright() as p:
    browser=p.chromium.launch()
    for width,height in [(1440,900),(1024,620),(390,844)]:
        contexts=[open_page(browser,url,width,height,baseline=b) for b in (True,False)]
        pages=[c[1] for c in contexts]
        geometry=pages[0].evaluate("""() => {
          const docTop=el=>el.getBoundingClientRect().top+scrollY;
          const track=document.querySelector('[data-cinema]');
          const travel=track.offsetHeight-innerHeight;
          const chapter=document.querySelector('#chapter-2');
          return [0,docTop(document.querySelector('#about'))+100,
                  docTop(chapter)-innerHeight*.6,docTop(chapter)-innerHeight*.3,
                  ...[.02,.18,.3,.5,.7,.9].map(n=>docTop(track)+Math.max(0,travel)*n)];
        }""")
        changed=False
        previous=None
        for index,y in enumerate(geometry):
            for page in pages:
                page.mouse.move(width / 2, height / 2)
                page.evaluate("(y)=>scrollTo({top:y,behavior:'instant'})",y)
            pages[0].wait_for_timeout(2300)
            expected,actual=map(snapshot,pages)
            compare(expected,actual,f"{width}x{height} scroll sample {index}")
            if previous and expected["elements"] != previous["elements"]:
                changed=True
            previous=expected
            if width==1440 and index in (2,4,6):
                pages[1].screenshot(path=str(PROOFS/f"original-motion-{index}.jpg"),type="jpeg",quality=85)
        assert changed,"scrolling must actually change motion"
        # Real wheel input follows the same original progression too.
        for page in pages:
            page.mouse.wheel(0,-180)
        pages[0].wait_for_timeout(1000)
        compare(snapshot(pages[0]),snapshot(pages[1]),f"{width} wheel scroll")
        for ctx,page,errors in contexts:
            assert not errors,errors
            ctx.close()
        print(f"PASS: {width}x{height}: 10 scroll samples and wheel input match visible preserved layer and cinematic transforms under the shared section enhancements.",flush=True)

    # Keep the fixed scrolled mobile menu reachable.
    ctx,page,errors=open_page(browser,url,390,844)
    page.evaluate("scrollTo({top:600,behavior:'instant'})")
    page.wait_for_timeout(300)
    page.locator(".nav-toggle").click()
    menu=page.locator(".nav-links")
    rect=menu.bounding_box()
    assert rect and rect["height"]>700,rect
    link=page.locator('.nav-links a[href="#speaking-topics"]')
    link.click()
    page.wait_for_timeout(700)
    assert page.evaluate("location.hash")=="#speaking-topics"
    assert page.locator(".nav-toggle").get_attribute("aria-expanded")=="false"
    assert not errors,errors
    ctx.close()
    print("PASS: scrolled mobile menu remains full-height and clickable.",flush=True)

    ctx,page,errors=open_page(browser,url,1440,900,reduced=True)
    assert not page.evaluate("document.documentElement.classList.contains('motion')")
    assert page.locator(".page").first.evaluate("el=>getComputedStyle(el).position")=="relative"
    assert not errors,errors
    ctx.close()
    browser.close()
print("PASS: original controller retained; shared enhancements and static accessibility fallback verified.",flush=True)
