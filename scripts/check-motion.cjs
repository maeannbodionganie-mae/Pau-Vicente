/* Behavior checks for the actual motion controller; no browser or test framework required. */
const fs = require('node:fs');
const path = require('node:path');
const SOURCE = fs.readFileSync(path.join(__dirname, '../dist/assets/motion.js'), 'utf8');
const result = (() => {

function createHarness(options={}) {
 const classes=()=>{const set=new Set();return{add(...v){v.forEach(x=>set.add(x));},remove(...v){v.forEach(x=>set.delete(x));},contains(x){return set.has(x);},toggle(x,v){if(v===undefined)v=!set.has(x);v?set.add(x):set.delete(x);return v;},values(){return [...set];}}};
 function events(target={}) { target.listeners={};target.addEventListener=(t,f)=>{(target.listeners[t] ||= []).push(f)};target.fire=(t,e={})=>{for(const f of target.listeners[t]||[])f(e)};return target; }
 function node(name,box={top:100,bottom:500,height:400}) {const el=events({name,classList:classes(),dataset:{},attributes:{},scrollHeight:500,clientHeight:box.height,offsetHeight:box.height+1,box:{...box}});
   el.style={setProperty(k,v){this[k]=v;},getPropertyValue(k){return this[k]||'';},removeProperty(k){delete this[k];}};
   el.setAttribute=(k,v)=>{el.attributes[k]=v};el.removeAttribute=k=>{delete el.attributes[k]};
   el.getBoundingClientRect=()=>({...el.box});el.querySelector=()=>null;el.querySelectorAll=()=>[];return el;}
 const root=node('root');root.clientHeight=options.height||900;root.clientWidth=options.width||1440;
 const stage=node('stage');const layers=[.35,.6,1].map(n=>{const e=node('layer');e.dataset.layer=String(n);return e});
 stage.querySelectorAll=q=>q==='[data-layer]'?layers:[];
 const photos=[node('photo')];const curtains=[photos[0],stage];
 const pages=options.empty?[]:[0,1,2,3].map((_,i)=>{const el=node('page'+i,{top:i*900,bottom:(i+1)*900,height:900});el.inner=node('inner'+i);el.inner.scrollHeight=options.tall?1100:600;el.querySelector=q=>q==='.page-inner'?el.inner:null;return el;});
 pages.forEach((p,i)=>p.nextElementSibling=pages[i+1]||null);
 const book=options.empty?null:node('book');if(book)book.querySelectorAll=q=>q==='.page'?pages:[];
 const shots=options.empty?[]:[0,1,2].map(i=>{const el=node('shot'+i);el.image=node('image'+i);el.caption=node('caption'+i);el.querySelector=q=>q==='img'?el.image:q==='figcaption'?el.caption:null;return el;});
 const head=node('heading');const cinema=options.empty?null:node('cinema',{top:-1100,bottom:2140,height:3240});if(cinema){cinema.querySelectorAll=q=>q==='.moment'?shots:[];cinema.querySelector=q=>q==='.moments-head'?head:null;}
 const doc=events({documentElement:root,hidden:false});doc.body={appendChild(){}};doc.createElement=()=>node('probe',{top:0,bottom:options.svhHeight||root.clientHeight,height:options.svhHeight||root.clientHeight});doc.querySelector=q=>q==='[data-storybook]'?book:q==='[data-cinema]'?cinema:null;
 doc.querySelectorAll=q=>q==='[data-stage]'?[stage]:q==='.chapter-media .media-stack > .photo, [data-stage]'?curtains:q==='img'?shots.map(x=>x.image):[];
 const media={};function mediaNode(query){if(!media[query])media[query]=events({matches:query.includes('prefers-reduced')?!!options.reduced:query.includes('min-width')?!options.mobile:true});return media[query];}
 const observers=[];class Observer{constructor(cb){this.cb=cb;this.observed=new Set();observers.push(this);}observe(e){this.observed.add(e);}unobserve(e){this.observed.delete(e);}disconnect(){this.observed.clear();}trigger(entries){this.cb(entries);}}
 let next=1,time=0;const pending=new Map();const timers=new Map();
 const win=events({innerHeight:root.clientHeight,innerWidth:root.clientWidth,matchMedia:mediaNode});if(!options.noIO)win.IntersectionObserver=Observer;
 const raf=fn=>{const id=next++;pending.set(id,fn);return id};const cancel=id=>pending.delete(id);
 const setTimer=(fn,ms)=>{const id=next++;timers.set(id,fn);return id};const clearTimer=id=>timers.delete(id);
 const execute=new Function('window','document','IntersectionObserver','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout',SOURCE);
 execute(win,doc,Observer,raf,cancel,setTimer,clearTimer);
 function step(){time+=16;const now=[...pending];pending.clear();for(const [,fn]of now)fn(time);}
 function drain(limit=350){let count=0;while(pending.size&&count++<limit)step();if(pending.size)throw Error('animation never settled');return count;}
 function active(){observers[1].trigger([stage,...pages,...(cinema?[cinema]:[])].map(target=>({target,isIntersecting:true})));}
 function preference(value){const m=mediaNode('(prefers-reduced-motion: reduce)');m.matches=value;m.fire('change',{matches:value});}
 function desktop(value){const m=mediaNode('(min-width: 901px) and (min-height: 620px)');m.matches=value;m.fire('change',{matches:value});}
 return {root,stage,layers,curtains,pages,shots,head,cinema,doc,win,observers,pending,timers,step,drain,active,preference,desktop};
}
function assert(condition,label){if(!condition)throw Error(label);}
let s=createHarness();
s.active();s.drain();
assert(s.root.classList.contains('motion'),'motion enabled');
assert(s.root.classList.contains('story-stacked'),'fitting story stacks');
assert(s.root.classList.contains('cine'),'desktop cinema enabled');
assert(s.layers[2].style.transform.includes('translate3d'),'stage transform applied');
s.win.fire('pointermove',{clientX:1440,clientY:900,pointerType:'mouse'});s.step();
const xFirst=parseFloat(s.layers[2].style.transform.match(/translate3d\(([-\d.]+)/)[1]);
assert(xFirst>0&&xFirst<18,'pointer interpolation, not immediate jump');
s.drain();
const xFinal=parseFloat(s.layers[2].style.transform.match(/translate3d\(([-\d.]+)/)[1]);
assert(Math.abs(xFinal-18)<.05,'pointer reaches its target');
s.win.fire('blur');s.drain();
assert(Math.abs(parseFloat(s.layers[2].style.transform.match(/translate3d\(([-\d.]+)/)[1]))<.05,'blur resets depth');
s.preference(true);
assert(!s.root.classList.contains('motion')&&!s.root.classList.contains('cine')&&!s.root.classList.contains('story-stacked'),'preference disables all motion classes');
assert(s.layers.every(l=>l.style.transform===''),'stage transforms cleared');
assert(s.pages.every(p=>p.inner.style.transform===''&&p.inner.style.opacity===''),'page transforms and dimming cleared');
assert(s.shots.every(p=>p.style.transform===''&&p.image.style.transform===''),'cinema transforms cleared');
assert(s.curtains.every(c=>c.classList.contains('is-revealed')&&!('data-curtain'in c.attributes)),'reduced motion reveals content');
assert(!s.pending.size,'preference cancels frames');
s.preference(false);s.active();s.drain();
assert(s.root.classList.contains('motion'),'runtime re-enable');
s.pages[0].inner.scrollHeight=1100;s.win.fire('resize');s.drain();
assert(s.root.classList.contains('story-stacked'),'long content retains 3D stacking');
s.pages[0].offsetHeight=1101;s.win.fire('resize');s.drain();
assert(s.pages[0].style['--page-stick-top']==='-201.00px','tall chapter pins after its bottom is reachable');
s.desktop(false);s.drain();
assert(!s.root.classList.contains('cine'),'narrow viewport disables cinema');
assert(s.root.classList.contains('story-stacked'),'phone retains storybook depth');
const touchY=parseFloat(s.layers[2].style.transform.match(/px,([-\d.]+)px/)[1]);
assert(Math.abs(touchY)<=22.01,'touch depth stays restrained');
s.doc.hidden=true;s.win.fire('scroll');assert(!s.pending.size,'hidden document does not schedule');
s.doc.fire('visibilitychange');s.doc.hidden=false;s.doc.fire('visibilitychange');s.drain();
assert(!s.pending.size,'resumed frame settles');
let r=createHarness({reduced:true});assert(!r.root.classList.contains('motion'),'initial reduced motion static');
r.preference(false);r.active();r.drain();assert(r.root.classList.contains('motion'),'initial reduced preference can enable later');
let empty=createHarness({empty:true});empty.active();empty.drain();assert(!empty.root.classList.contains('cine')&&!empty.root.classList.contains('story-stacked'),'empty sections handled');
let chrome=createHarness({height:900,svhHeight:820});
chrome.pages.forEach(page=>{page.inner.scrollHeight=870;page.clientHeight=819;page.offsetHeight=820;});
chrome.active();chrome.drain();
assert(chrome.root.classList.contains('story-stacked'),'browser chrome does not disable 3D');
chrome.pages[0].offsetHeight=1000;chrome.win.fire('resize');chrome.drain();
assert(chrome.pages[0].style['--page-stick-top']==='-180.00px','sticky offset uses the actual 100svh measurement');
chrome.pages.forEach(page=>{page.inner.scrollHeight=800;});
chrome.win.fire('resize');chrome.drain();
assert(chrome.root.classList.contains('story-stacked'),'content fitting the actual 100svh page can stack');
let absent=createHarness({noIO:true});assert(absent.observers.length===0&&!absent.pending.size,'missing observer leaves static content');
return 'PASS: initialization, fitting/overflow story layouts, runtime preference toggles, pointer interpolation/reset, mobile limits, cinema cleanup, visibility, empty sections, missing observer, 100svh/browser-chrome mismatch; frames settle.';

})();
console.log(result);
console.log('Mocked DOM only; browser layout, compositing and visual QA run separately.');
