/* Public, approved-facts response renderer. Shared by the browser and server. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PauEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const leads = {
    general: 'Here’s what Pau shares in her portfolio:',
    beginner: 'Freelance 101 is a relevant starting point for an audience exploring freelancing. Its beginner-focused topics can help you plan that conversation:',
    marketing: 'For an audience exploring content, branding, and working with businesses, Pau’s Social Media Marketing topic is a relevant option:',
    leadership: 'For a conversation about purpose, resilience, and service, consider Pau’s Inspirational Leadership topic:',
    invitation: 'You can discuss the fit and arrangements directly with Pau:',
    greeting: 'Hi! I’m Pau, the portfolio assistant—not Pau Vicente herself. I can help you explore her experience, speaking topics, and event fit.'
  };
  const decline = 'Ang scope ko ay tungkol lang kay Pau Vicente—her background, qualifications shared in her portfolio, speaking topics, and event inquiries. Hindi kasama sa scope ko ang tanong na iyon. You can ask which Pau talk fits your audience.';
  function render(plan, knowledge, mode = 'portfolio-guide') {
    if (plan.kind === 'off_topic') return {answer:decline,sources:[],mode};
    if (plan.kind === 'greeting') return {answer:leads.greeting,sources:[],mode};
    const facts = new Map(knowledge.facts.map(f => [f.id, f]));
    let ids = Array.isArray(plan.ids) ? [...new Set(plan.ids)].slice(0,3) : [];
    if (plan.kind === 'unknown') ids = ['unverified','contact'];
    if (!ids.length || ids.some(id => !facts.has(id))) throw new Error('Invalid knowledge references');
    const lead = leads[plan.lead] || leads.general;
    return {answer:lead+'\n\n'+ids.map(id => facts.get(id).text).join('\n\n'),sources:ids.map(id => {const f=facts.get(id);return {id,title:f.title,href:f.href};}),mode};
  }
  function guard(question) {
    if (/write.*(?:code|program|essay|poem)|python|javascript|recipe|weather|president|election|stock price|crypto|medical|diagnos|solve.*(?:equation|math)|translate.*(?:text|sentence)|capital of/i.test(question)) return {kind:'off_topic'};
    if (/ignore (?:all |previous |your )?instructions|system prompt|api.?key|password|credentials? leak|pretend (?:you|pau)|jailbreak|bypass|reveal.*(?:secret|prompt)/i.test(question)) return {kind:'off_topic'};
    if (/degree|diploma|certificat|award|graduate[ds]? (?:from|at)|university|school did|years? of experience|ilang taon|client (?:names|count)|how many clients|revenue|guarantee|\bsalary\b|net worth|\b(?:fees?|pricing|rates?)\b|how much|magkano|available (?:on|date)|availability|schedule|travel|duration|session length|capacity|hour.?long/i.test(question)) return {kind:'unknown'};
    return null;
  }
  function plan(question) {
    const blocked=guard(question); if(blocked)return blocked;
    const q=question.toLowerCase();
    if (/^(hi|hello|hey|kumusta|kamusta|thanks|thank you|salamat)[!.\s]*(pau)?[!.\s]*$/i.test(q.trim())) return {kind:'greeting'};
    if (/coaching|bonus|free session|support.*participant/.test(q)) return {kind:'answer',ids:['coaching'],lead:'general'};
    if (/contact|email|mobile|phone|invite|book|inquir|reach|event arrangement/.test(q)) return {kind:'answer',ids:['contact','formats'],lead:'invitation'};
    if (/facebook|linkedin|instagram|social profile/.test(q)) return {kind:'answer',ids:['socials'],lead:'general'};
    if (/leadership|church|purpose|integrity|resilien|youth/.test(q)) return {kind:'answer',ids:['leadership','style'],lead:'leadership'};
    if (/social media|branding|content|marketing/.test(q)) return {kind:'answer',ids:['marketing'],lead:'marketing'};
    if (/student|beginner|career shift|fresh graduate|freelanc.*(?:start|begin)|start.*freelanc|first client|niche|portfolio preparation/.test(q)) return {kind:'answer',ids:['freelance','outcomes'],lead:'beginner'};
    if (/topics?|talks?|speaks? about/.test(q)) return {kind:'answer',ids:['freelance','marketing','leadership'],lead:'general'};
    if (/qualif|experience|background|story|journey|corporate|pandemic/.test(q)) return {kind:'answer',ids:['experience','mentoring','style'],lead:'general'};
    if (/cross core|mentor/.test(q)) return {kind:'answer',ids:['mentoring'],lead:'general'};
    if (/why.*pau|speaking style|good fit|speaker fit|suitable/.test(q)) return {kind:'answer',ids:['style','audiences','formats'],lead:'general'};
    if (/audience|who.*(?:serve|for)|corporate team|entrepreneur|virtual assistant/.test(q)) return {kind:'answer',ids:['audiences'],lead:'general'};
    if (/formats?|webinar|seminar|keynote|workshop|panel|q&a/.test(q)) return {kind:'answer',ids:['formats'],lead:'general'};
    if (/learn|outcome|takeaway/.test(q)) return {kind:'answer',ids:['outcomes'],lead:'general'};
    if (/who is pau|about pau|pau vicente|what does pau do/.test(q)) return {kind:'answer',ids:['profile','style'],lead:'general'};
    return {kind:'off_topic'};
  }
  return {render,plan,guard,leads};
});
