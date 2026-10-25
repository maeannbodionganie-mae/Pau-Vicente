"""Exercise the compact assistant and save desktop/mobile review screenshots. All APIs mocked."""
from pathlib import Path
import contextlib, json, socket, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
PROOFS=ROOT/"docs/review/assistant"
@contextlib.contextmanager
def serve():
    with socket.socket() as s:
        s.bind(("127.0.0.1",0));port=s.getsockname()[1]
    p=subprocess.Popen([sys.executable,"-m","http.server",str(port),"--bind","127.0.0.1","--directory",str(ROOT/"dist")],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    url=f"http://127.0.0.1:{port}"
    try:
        for _ in range(100):
            try:urllib.request.urlopen(url,timeout=1).close();break
            except OSError:time.sleep(.05)
        yield url
    finally:p.terminate();p.wait(timeout=5)

def ask(page, question):
    page.locator("#pau-question").fill(question)
    page.locator("#pau-send").click()
    page.wait_for_function("!document.getElementById('pau-send').disabled")

def check_layout(page, width, height):
    result=page.evaluate("""() => {
      const chat=document.getElementById('pau-chat').getBoundingClientRect();
      const log=document.getElementById('pau-messages').getBoundingClientRect();
      const input=document.getElementById('pau-form').getBoundingClientRect();
      return {x:chat.x,y:chat.y,right:chat.right,bottom:chat.bottom,height:chat.height,
              logHeight:log.height,inputBottom:input.bottom,inputTop:input.top,
              overflow:document.documentElement.scrollWidth>innerWidth+2};
    }""")
    assert result["x"]>=0 and result["y"]>=0 and result["right"]<=width+1 and result["bottom"]<=height+1,result
    assert result["logHeight"]>=result["height"]*.55,("conversation needs most of the panel",result)
    assert result["inputBottom"]<=result["bottom"] and result["inputTop"]>result["y"],result
    assert not result["overflow"],result

PROOFS.mkdir(parents=True,exist_ok=True)
with serve() as base,sync_playwright() as p:
    browser=p.chromium.launch()
    for name,width,height in [("desktop",1440,900),("phone",390,844),("phone-small",360,740),("landscape",844,390)]:
        context=browser.new_context(viewport={"width":width,"height":height},reduced_motion="reduce")
        page=context.new_page()
        errors=[];posts=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.on("request",lambda r:posts.append(r.url) if r.method not in ("GET","HEAD") else None)
        page.route("**/api/pau",lambda r:r.fulfill(status=200,content_type="application/json",body='{"mode":"portfolio-guide"}'))
        page.goto(base,wait_until="networkidle")
        page.evaluate("() => document.fonts.ready")
        page.wait_for_function("!document.getElementById('pau-assistant').hidden")
        assert page.locator("#pau-launcher .pau-avatar").evaluate("img=>img.complete&&img.naturalWidth>0")
        page.locator("#pau-launcher").click()
        page.wait_for_function("!document.getElementById('pau-chat').hidden")
        check_layout(page,width,height)
        assert not page.locator("#pau-options").evaluate("el=>el.open")
        assert not page.locator("#pau-suggestions").is_visible()
        assert not page.locator("#pau-privacy").is_visible()
        assert page.locator(".pau-message").count()==1
        page.screenshot(path=str(PROOFS/f"{name}-conversation.jpg"),type="jpeg",quality=88)
        page.locator("#pau-options-toggle").focus()
        page.keyboard.press("Enter")
        assert page.locator("#pau-options").evaluate("el=>el.open")
        assert page.locator("#pau-suggestions").is_visible()
        page.screenshot(path=str(PROOFS/f"{name}-options.jpg"),type="jpeg",quality=88)
        page.locator('#pau-suggestions button[data-question^="Which talk"]').click()
        page.wait_for_function("!document.getElementById('pau-send').disabled")
        assert not page.locator("#pau-options").evaluate("el=>el.open")
        assert page.locator("#pau-messages").inner_text().find("Freelance 101")>=0
        sources=page.locator(".pau-source-details").first
        assert sources.count()>0
        assert not sources.evaluate("el=>el.open")
        assert not sources.locator("a").first.is_visible()
        sources.locator("summary").click()
        assert sources.locator("a").first.is_visible()
        sources.locator("summary").click()
        ask(page,"How can I invite Pau to our event?")
        ask(page,"What qualifies Pau as a speaker?")
        check_layout(page,width,height)
        assert page.locator("#pau-messages").evaluate("el=>el.scrollHeight>el.clientHeight")
        page.locator("#pau-options-toggle").click()
        page.keyboard.press("Escape")
        assert not page.locator("#pau-options").evaluate("el=>el.open")
        assert page.locator("#pau-chat").is_visible()
        page.locator("#pau-options-toggle").click()
        page.locator(".pau-chat-heading").click()
        assert not page.locator("#pau-options").evaluate("el=>el.open")
        page.locator("#pau-options-toggle").click()
        page.locator("#pau-clear").click()
        assert page.locator(".pau-message").count()==1
        assert not page.locator("#pau-options").evaluate("el=>el.open")
        page.keyboard.press("Escape")
        assert not page.locator("#pau-chat").is_visible()
        assert page.locator("#pau-launcher").evaluate("el=>el===document.activeElement")
        assert not errors,(name,errors)
        assert not posts,(name,posts)
        context.close()
        print(f"PASS: {name} {width}x{height}: 3D icon loaded, conversation occupies most of panel, options and sources collapse, questions work, Escape/focus and clear work, no overflow or real API writes.",flush=True)
    browser.close()
