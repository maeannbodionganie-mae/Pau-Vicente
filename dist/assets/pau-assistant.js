(() => {
  'use strict';
  const widget=document.getElementById('pau-assistant');
  if(!widget||!window.PauEngine||!window.PauNavigator)return;
  const navigator=window.PauNavigator;
  let lastField='';
  function pageContext(){
    const page=location.pathname.startsWith('/events/')?'event':document.body.classList.contains('subpage')?'not-found':'home';
    let section=page==='event'?'event':'home',best=Infinity;
    for(const [id,key] of Object.entries(navigator.sectionIds)){
      if(page!=='home'&&!['main','register'].includes(id))continue;
      if(page==='home'&&['main','register'].includes(id))continue;
      const node=document.getElementById(id);if(!node)continue;
      const box=node.getBoundingClientRect();if(box.bottom<=90||box.top>=innerHeight)continue;
      const distance=Math.abs(box.top-120);if(distance<best){best=distance;section=key;}
    }
    return {page,section,focus:lastField};
  }
  function showLocation(){const node=$('pau-location-label');if(node)node.textContent='Viewing: '+navigator.routes[pageContext().section].title;}
  document.addEventListener('focusin',event=>{if(Object.hasOwn(navigator.fields,event.target?.id||''))lastField=event.target.id;});
  addEventListener('scroll',showLocation,{passive:true});
  const $=id=>document.getElementById(id);
  const launcher=$('pau-launcher'),panel=$('pau-chat'),input=$('pau-question'),form=$('pau-form');
  const messages=$('pau-messages'),status=$('pau-status'),send=$('pau-send');
  const options=$('pau-options'),optionsToggle=$('pau-options-toggle');
  const greeting=$('pau-greeting');
  function hideGreeting(){greeting.hidden=true;try{sessionStorage.setItem('pau-intro-dismissed','1');}catch{}}
  try{greeting.hidden=sessionStorage.getItem('pau-intro-dismissed')==='1';}catch{}
  let knowledge=null,graphReady=false,live=false,busy=false,questions=[],generation=0,drag=null,suppressClick=false;
  const welcome='Hi! I’m Pau’s digital assistant. I can help you explore her talks, plan an event, or guide you through the section you’re viewing. Try “What can I do here?”';
  function mode(isLive){
    live=isLive;
    $('pau-mode').textContent=live?'AI · Gemini':'Portfolio guide';
    $('pau-privacy').textContent=live?'Questions and the section you’re viewing are sent to Google Gemini, using Pau’s public knowledge graph. Questions outside her portfolio may be answered with Google Search, clearly labelled and sourced. Form values are not read. Chat stays in this tab; avoid sensitive information.':'Uses approved portfolio facts; live AI is not active. Chat stays in this tab. Please avoid sensitive information.';
  }
  function append(role,text,sources=[],actions=[],webSources=[]){
    const box=document.createElement('div');box.className='pau-message';box.dataset.role=role;
    const label=document.createElement('span');label.className='pau-message-label';label.textContent=role==='user'?'You':'Pau’s assistant';
    const p=document.createElement('p');p.textContent=text;box.append(label,p);
    const links=document.createElement('div');links.className='pau-source-links';
    for(const source of sources){
      const fact=knowledge?.facts.find(f=>f.id===source.id);if(!fact)continue;
      const a=document.createElement('a');a.href=fact.href.startsWith('#')?(location.pathname==='/'?fact.href:'/'+fact.href):fact.href;a.textContent=fact.title+' ↗';
      a.addEventListener('click',()=>{close(false);if(location.pathname==='/'&&fact.href.startsWith('#'))document.querySelector(fact.href)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});links.append(a);
    }
    for(const source of webSources.slice(0,4)){
      if(typeof source.href!=='string'||!/^https:\/\//.test(source.href))continue;
      const a=document.createElement('a');a.href=source.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=String(source.title||'Web source').slice(0,80)+' ↗';links.append(a);
    }
    if(links.children.length){
      const details=document.createElement('details');details.className='pau-source-details';
      const summary=document.createElement('summary');summary.textContent='View sources ('+links.children.length+')';
      details.append(summary,links);box.append(details);
    }
    for(const action of actions.slice(0,2)){
      const route=navigator.target(action.id,knowledge||{});if(!route)continue;
      const a=document.createElement('a');a.className='pau-navigation-action';a.href=route.href;a.textContent=action.label||('Open '+route.title);
      a.addEventListener('click',event=>{
        const url=new URL(route.href,location.origin);
        if(url.pathname!==location.pathname)return;
        const target=document.getElementById(url.hash.slice(1));if(!target)return;
        event.preventDefault();close(false);target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
        target.setAttribute('tabindex','-1');target.focus({preventScroll:true});target.classList.add('pau-navigation-target');
        setTimeout(()=>target.classList.remove('pau-navigation-target'),3500);
      });box.append(a);
    }
    messages.append(box);while(messages.children.length>40)messages.firstElementChild.remove();
    messages.scrollTop=messages.scrollHeight;
  }
  append('assistant',welcome);
  const ready=(async()=>{
    try {
      const response=await fetch('/assets/pau-knowledge.json',{signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new Error('Unavailable');
      knowledge=await response.json();
      const result=await fetch('/api/pau',{cache:'no-store',signal:AbortSignal.timeout(8000)}).then(r=>r.ok?r.json():null).catch(()=>null);
      mode(result?.mode==='gemini');
      graphReady=result?.graphify==='export_ready';
      if(graphReady)$('pau-mode').textContent+=' · Knowledge graph';
      showLocation();
    } catch {status.textContent='The guide could not load. Open Options to contact Pau.';}
  })();
  function open(){showLocation();hideGreeting();options.open=false;panel.hidden=false;launcher.setAttribute('aria-expanded','true');input.focus({preventScroll:true});}
  function close(focus=true){options.open=false;panel.hidden=true;launcher.setAttribute('aria-expanded','false');if(focus)launcher.focus({preventScroll:true});}
  launcher.addEventListener('click',event=>{if(suppressClick&&event.detail!==0){suppressClick=false;return;}panel.hidden?open():close();});
  $('pau-close').addEventListener('click',()=>close());
  $('pau-greeting-open').addEventListener('click',open);
  $('pau-greeting-dismiss').addEventListener('click',()=>{hideGreeting();launcher.focus({preventScroll:true});});
  widget.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!panel.hidden){
      event.preventDefault();
      if(options.open){options.open=false;optionsToggle.focus({preventScroll:true});}
      else close();
    }
  });
  document.addEventListener('click',event=>{
    if(options.open&&!options.contains(event.target))options.open=false;
  });
  $('pau-clear').addEventListener('click',()=>{options.open=false;generation++;busy=false;send.disabled=false;questions=[];messages.replaceChildren();append('assistant',welcome);status.textContent='Conversation cleared.';input.focus();});
  $('pau-contact').addEventListener('click',()=>close(false));
  async function ask(question){
    if(busy||!question.trim())return;
    options.open=false;input.focus({preventScroll:true});
    question=question.trim().slice(0,1000);busy=true;send.disabled=true;status.textContent='Finding the relevant portfolio details…';
    const token=++generation;append('user',question);input.value='';
    await ready;
    if(token!==generation)return;
    const view=pageContext();
    try {
      if(!knowledge)throw new Error('Knowledge unavailable');
      let result;
      // Without an active AI connection, the guide stays in the browser.
      if(live){
        try{
          const response=await fetch('/api/pau',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:question,history:questions.slice(-6),context:view}),signal:AbortSignal.timeout(23000)});
          if(!response.ok){if(response.status===429)throw new Error('rate-limit');throw new Error('Unavailable');}
          result=await response.json();
          if(typeof result.answer!=='string'||!Array.isArray(result.sources))throw new Error('Invalid response');
        }catch(error){
          result=navigator.guide(question,view,knowledge)||window.PauEngine.render(window.PauEngine.plan(question),knowledge);
          result.notice=error.message==='rate-limit'?'Live AI has reached its request limit. Showing approved portfolio facts.':'Live AI is unavailable. Showing approved portfolio facts.';
        }
      }else result=navigator.guide(question,view,knowledge)||window.PauEngine.render(window.PauEngine.plan(question),knowledge);
      if(token!==generation)return;
      append('assistant',result.answer,result.sources,result.actions||[],Array.isArray(result.webSources)?result.webSources:[]);questions.push(question);questions=questions.slice(-6);
      $('pau-mode').textContent=(result.navigation?'Website guide':result.origin==='web'?'AI · Gemini + web':result.mode==='gemini'?'AI · Gemini':'Portfolio guide')+(graphReady?' · Knowledge graph':'');
      status.textContent=result.notice||'';
    }catch {if(token===generation)status.textContent='The guide is unavailable. Open Options to contact Pau.';}
    finally{if(token===generation){busy=false;send.disabled=false;}}
  }
  form.addEventListener('submit',event=>{event.preventDefault();ask(input.value);});
  $('pau-suggestions').addEventListener('click',event=>{const button=event.target.closest('[data-question]');if(button)ask(button.dataset.question);});
  $('pau-guide-here')?.addEventListener('click',()=>ask('What can I do in this section?'));
  function bounds(){const viewport=window.visualViewport;return {width:viewport?.width||innerWidth,height:viewport?.height||innerHeight};}
  function position(x,y,save=false){
    const {width,height}=bounds(),box=launcher.getBoundingClientRect();
    x=Math.max(8,Math.min(x,width-box.width-8));y=Math.max(8,Math.min(y,height-box.height-8));
    launcher.style.right='auto';launcher.style.bottom='auto';launcher.style.left=x+'px';launcher.style.top=y+'px';
    if(save)hideGreeting();
    if(save)try{localStorage.setItem('pau-launcher-position',JSON.stringify({x,y}));}catch{}
  }
  launcher.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    const box=launcher.getBoundingClientRect();suppressClick=false;
    drag={id:event.pointerId,startX:event.clientX,startY:event.clientY,x:box.left,y:box.top,moved:false};
    launcher.setPointerCapture(event.pointerId);
  });
  launcher.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.id)return;
    const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
    if(Math.hypot(dx,dy)>6)drag.moved=true;
    if(drag.moved){launcher.classList.add('is-dragging');position(drag.x+dx,drag.y+dy);}
  });
  function endDrag(event){
    if(!drag||event.pointerId!==drag.id)return;
    const moved=drag.moved;drag=null;launcher.classList.remove('is-dragging');
    if(moved){suppressClick=true;const box=launcher.getBoundingClientRect();position(box.left,box.top,true);}
    if(launcher.hasPointerCapture(event.pointerId))launcher.releasePointerCapture(event.pointerId);
  }
  launcher.addEventListener('pointerup',endDrag);launcher.addEventListener('pointercancel',endDrag);launcher.addEventListener('lostpointercapture',endDrag);
  launcher.addEventListener('keydown',event=>{
    const offset={ArrowLeft:[-24,0],ArrowRight:[24,0],ArrowUp:[0,-24],ArrowDown:[0,24]}[event.key];
    if(!event.altKey||!offset)return;event.preventDefault();const box=launcher.getBoundingClientRect();position(box.left+offset[0],box.top+offset[1],true);
  });
  $('pau-reset-position').addEventListener('click',()=>{options.open=false;input.focus({preventScroll:true});launcher.removeAttribute('style');try{localStorage.removeItem('pau-launcher-position');}catch{}status.textContent='Icon returned to the lower right.';});
  function keepInView(){widget.style.setProperty?.('--pau-viewport-height',bounds().height+'px');if(launcher.style.left){const box=launcher.getBoundingClientRect();position(box.left,box.top);}}
  addEventListener('resize',keepInView);window.visualViewport?.addEventListener('resize',keepInView);
  try{const saved=JSON.parse(localStorage.getItem('pau-launcher-position'));if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)){hideGreeting();widget.hidden=false;position(saved.x,saved.y);}}catch{}
  // On small screens, tuck the avatar away while a visitor fills in a page form so it never covers fields or buttons.
  const small=window.matchMedia?matchMedia('(max-width: 600px)'):{matches:false};
  document.addEventListener('focusin',event=>{const field=event.target;if(small.matches&&field?.closest&&field.closest('form')&&!widget.contains(field))widget.classList.add('is-tucked');});
  document.addEventListener('focusout',()=>widget.classList.remove('is-tucked'));
  keepInView();
  widget.hidden=false;
})();
