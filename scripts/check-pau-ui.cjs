// DOM contract tests; intentionally not a browser/screenshot substitute.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const engine=require('../dist/assets/pau-engine.js');
const knowledge=require('../dist/assets/pau-knowledge.json');
class Element{
  constructor(){this.listeners={};this.children=[];this.attributes={};this.style={};this.dataset={};this.hidden=false;this.value='';this.textContent='';this.capture=new Set();const classes=new Set();this.classList={add:c=>classes.add(c),remove:c=>classes.delete(c)};}
  addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}
  fire(type,event={}){for(const fn of this.listeners[type]||[])fn(event);}
  append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
  replaceChildren(){this.children=[];}
  get firstElementChild(){return this.children[0];}
  remove(){this.parent.children=this.parent.children.filter(n=>n!==this);}
  setAttribute(k,v){this.attributes[k]=v;}
  getAttribute(k){return this.attributes[k];}
  removeAttribute(k){delete this.attributes[k];if(k==='style')this.style={};}
  getBoundingClientRect(){return {left:parseFloat(this.style.left)||280,top:parseFloat(this.style.top)||650,width:88,height:104};}
  setPointerCapture(id){this.capture.add(id);}
  hasPointerCapture(id){return this.capture.has(id);}
  releasePointerCapture(id){this.capture.delete(id);}
  focus(){this.focused=true;}
  scrollIntoView(){this.scrolled=true;}
}
const ids=['assistant','launcher','chat','question','form','messages','status','send','mode','privacy','close','clear','contact','suggestions','reset-position'];
const elements=Object.fromEntries(ids.map(id=>['pau-'+id,new Element()]));
elements['pau-chat'].hidden=true;
const stored=new Map(),requests=[],viewport={width:390,height:844,addEventListener(){}};
const document={getElementById:id=>elements[id],createElement:()=>new Element(),querySelector:()=>new Element()};
const context={document,window:{PauEngine:engine,visualViewport:viewport},innerWidth:390,innerHeight:844,addEventListener(){},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},AbortSignal,matchMedia:()=>({matches:true}),fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>url.includes('knowledge')?knowledge:{mode:'portfolio-guide'}};}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../dist/assets/pau-assistant.js'),'utf8'),context);
const $=id=>elements['pau-'+id];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const text=node=>node.textContent+node.children.map(text).join(' ');
(async()=>{
  await tick();await tick();
  assert.equal($('assistant').hidden,false);assert.equal($('mode').textContent,'Portfolio guide');
  $('launcher').fire('click',{detail:1});assert.equal($('chat').hidden,false);assert($('question').focused);
  $('assistant').fire('keydown',{key:'Escape',preventDefault(){}});assert.equal($('chat').hidden,true);assert($('launcher').focused);
  $('launcher').fire('pointerdown',{button:0,pointerId:1,clientX:300,clientY:670});
  $('launcher').fire('pointermove',{pointerId:1,clientX:-1000,clientY:-1000});
  $('launcher').fire('pointerup',{pointerId:1});
  assert.equal($('launcher').style.left,'8px');assert.equal($('launcher').style.top,'8px');assert(stored.has('pau-launcher-position'));
  $('launcher').fire('click',{detail:1});assert.equal($('chat').hidden,true,'drag must not open chat');
  $('launcher').fire('keydown',{key:'ArrowRight',altKey:true,preventDefault(){}});assert.equal($('launcher').style.left,'32px');
  $('launcher').fire('click',{detail:0});assert.equal($('chat').hidden,false,'keyboard click works after dragging');
  $('question').value='Which talk suits college students starting freelancing?';$('form').fire('submit',{preventDefault(){}});
  await tick();assert.match(text($('messages')),/Freelance 101/);assert.equal($('send').disabled,false);
  assert.equal(requests.filter(r=>r.options?.method==='POST').length,0,'guide mode keeps questions in browser');
  $('question').value='<script>alert(1)</script> What is the weather?';$('form').fire('submit',{preventDefault(){}});await tick();
  assert.match(text($('messages')),/Hindi kasama sa scope/);assert.match(text($('messages')),/<script>/,'visitor text is plain text');
  $('clear').fire('click');assert.equal($('messages').children.length,1);assert(!text($('messages')).includes('<script>'));
  $('reset-position').fire('click');assert.equal($('launcher').style.left,undefined);assert(!stored.has('pau-launcher-position'));
  console.log('PASS: opening/Escape/focus, pointer drag and clamping, drag-click suppression, keyboard movement, reset, local guide answers, scope refusal, plain-text rendering, and clear chat.');
  console.log('DOM harness only; browser viewport screenshots remain unverified.');
})().catch(error=>{console.error(error);process.exitCode=1;});
