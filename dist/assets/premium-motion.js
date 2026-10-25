/* Continuous section depth layered over the existing storybook and Moments choreography. */
(() => {
  'use strict';
  if (!('IntersectionObserver' in window)) return;
  const root=document.documentElement;
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  const desktop=matchMedia('(min-width: 901px) and (min-height: 620px)');
  const clamp=(x,min=0,max=1)=>Math.max(min,Math.min(max,x));
  const smooth=(a,b,t)=>Math.abs(a-b)<.0005?b:a+(b-a)*t;
  const probe=document.createElement('div');
  probe.setAttribute('aria-hidden','true');
  probe.style.cssText='position:fixed;width:0;height:100vh;height:100svh;visibility:hidden;pointer-events:none;contain:strict';
  document.body.append(probe);
  const sections=[...document.querySelectorAll('main > section')].map(el=>{
    const content=[...el.children].find(child=>child.classList.contains('container'));
    if(!content)return null;
    el.setAttribute('data-scroll-section',el.id||el.classList[0]);
    content.setAttribute('data-depth-content','');
    return {el,content,entry:0,exit:0};
  }).filter(Boolean);
  const pages=[...document.querySelectorAll('[data-storybook] > .page')].map(el=>({
    el,inner:el.querySelector('.page-inner'),next:el.nextElementSibling,covered:0
  }));
  const cinema=document.querySelector('[data-cinema]');
  const active=new Set();
  let frame=0,last=0,enabled=false;
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>entry.isIntersecting?active.add(entry.target):active.delete(entry.target));
    schedule();
  },{rootMargin:'25% 0px'});
  function set(el,key,value){if(el.style.getPropertyValue(key)!==value)el.style.setProperty(key,value);}
  function schedule(){if(enabled&&!document.hidden&&!frame)frame=requestAnimationFrame(apply);}
  function apply(now){
    frame=0;
    if(!enabled||document.hidden)return;
    const amount=1-Math.exp(-Math.min(50,last?now-last:16)/110);last=now;
    const h=probe.getBoundingClientRect().height||innerHeight;
    // Geometry is read before any compositor or sticky-offset updates.
    const boxes=sections.map(s=>({s,box:active.has(s.el)?s.el.getBoundingClientRect():null}));
    const chapterBoxes=pages.map(p=>({p,height:p.el.offsetHeight,next:p.next?.getBoundingClientRect()}));
    const cinemaBox=cinema&&active.has(cinema)?cinema.getBoundingClientRect():null;
    let moving=false;
    for(const {s,box} of boxes){
      s.content.classList.toggle('depth-active',Boolean(box));
      if(!box)continue;
      const editing=s.el.contains(document.activeElement)&&document.activeElement.matches('input,textarea,select');
      const targetEntry=editing?1:clamp((h-box.top)/(h*.82));
      const targetExit=editing?0:clamp(-box.top/(Math.max(h,box.height)*.95));
      s.entry=smooth(s.entry,targetEntry,amount);s.exit=smooth(s.exit,targetExit,amount);
      moving=moving||Math.abs(s.entry-targetEntry)>.0005||Math.abs(s.exit-targetExit)>.0005;
      const enter=1-s.entry;
      set(s.content,'--section-y',(enter*64-s.exit*24).toFixed(2)+'px');
      set(s.content,'--section-z',(-enter*80-s.exit*70).toFixed(2)+'px');
      set(s.content,'--section-tilt',(enter*6+s.exit*2).toFixed(3)+'deg');
      set(s.content,'--section-scale',(1-enter*.045-s.exit*.025).toFixed(5));
      set(s.content,'--section-alpha',(1-enter*.32-s.exit*.1).toFixed(4));
    }
    for(const {p,height,next} of chapterBoxes){
      set(p.el,'--chapter-top',Math.min(0,h-height).toFixed(2)+'px');
      const target=next?clamp(1-next.top/h):0;
      p.covered=smooth(p.covered,target,amount);
      moving=moving||Math.abs(p.covered-target)>.0005;
      // The desktop retains the original page turn; touch gets its own matching depth.
      set(p.inner,'--chapter-tilt',(p.covered*7).toFixed(3)+'deg');
      set(p.inner,'--chapter-scale',(1-p.covered*.065).toFixed(5));
      set(p.inner,'--chapter-light',(1-p.covered*.28).toFixed(4));
    }
    if(cinemaBox&&!desktop.matches){
      const entry=clamp((h-cinemaBox.top)/(h*.88));
      set(cinema,'--print-y',((1-entry)*48).toFixed(2)+'px');
      set(cinema,'--print-tilt',((1-entry)*16).toFixed(3)+'deg');
      set(cinema,'--print-scale',(.92+entry*.08).toFixed(5));
    }
    if(moving)schedule();
  }
  function sync(){
    enabled=!preference.matches;
    cancelAnimationFrame(frame);frame=0;last=0;active.clear();observer.disconnect();
    root.classList.toggle('immersive',enabled);
    sections.forEach(s=>{
      s.content.classList.remove('depth-active');
      for(const key of ['y','z','tilt','scale','alpha'])s.content.style.removeProperty('--section-'+key);
      s.entry=s.exit=0;
      if(enabled)observer.observe(s.el);
    });
    pages.forEach(p=>{
      p.covered=0;p.el.style.removeProperty('--chapter-top');
      for(const key of ['tilt','scale','light'])p.inner.style.removeProperty('--chapter-'+key);
    });
    if(enabled&&cinema)observer.observe(cinema);
    schedule();
  }
  addEventListener('scroll',schedule,{passive:true});
  addEventListener('resize',schedule,{passive:true});
  addEventListener('load',schedule,true);
  document.addEventListener('focusin',schedule);
  document.addEventListener('focusout',schedule);
  document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(frame);frame=0;last=0;schedule();});
  preference.addEventListener('change',sync);
  desktop.addEventListener('change',schedule);
  if('ResizeObserver' in window){
    const sizes=new ResizeObserver(schedule);
    sections.forEach(s=>sizes.observe(s.content));
    pages.forEach(p=>sizes.observe(p.inner));
  }
  document.fonts?.ready.then(schedule);
  sync();
})();
