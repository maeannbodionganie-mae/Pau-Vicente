'use strict';
const crypto=require('node:crypto');
const knowledge=require('./pau-knowledge.json');
const graph=require('./pau-graph.json');
const ids=new Set(knowledge.facts.map(f=>f.id));
const byId=new Map(graph.nodes.map(n=>[n.id,n]));
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sorted(value[k])])):value;
const fresh=graph.graph.source_sha256===crypto.createHash('sha256').update(JSON.stringify(sorted(knowledge))).digest('hex');
const valid=fresh&&graph.nodes.length===ids.size&&graph.nodes.every(n=>ids.has(n.fact_id))&&(graph.links||[]).every(e=>byId.has(e.source)&&byId.has(e.target));
function retrieve(question,seeds=[]){
  if(!valid)return {facts:knowledge.facts,relationships:knowledge.relationships,source:'approved_snapshot',graphify:'stale_export'};
  const words=question.toLowerCase().match(/[a-z]{3,}/g)||[];
  const stop=new Set(['what','which','the','for','and','how','pau','can','about','does','with','your','this','that']);
  const ranked=graph.nodes.map(n=>({n,score:words.filter(w=>!stop.has(w)&&(`${n.label} ${n.text}`).toLowerCase().includes(w)).length+(seeds.includes(n.fact_id)?20:0)})).filter(v=>v.score>0).sort((a,b)=>b.score-a.score);
  const selected=new Set(ranked.slice(0,5).map(v=>v.n.id));
  // One hop retains explicit relationship evidence without expanding to the whole corpus.
  const frontier=new Set(selected);
  for(const e of graph.links||[])if(frontier.has(e.source)||frontier.has(e.target)){
    if(selected.size<8)selected.add(e.source);if(selected.size<8)selected.add(e.target);
  }
  const factIds=new Set([...selected].map(id=>byId.get(id).fact_id));
  factIds.add('unverified');factIds.add('contact');
  return {facts:knowledge.facts.filter(f=>factIds.has(f.id)),relationships:knowledge.relationships.filter(e=>factIds.has(e.from)&&factIds.has(e.to)),source:'graphify_export',graphify:'export_ready'};
}
module.exports={retrieve,status:()=>valid?'export_ready':'stale_export'};
