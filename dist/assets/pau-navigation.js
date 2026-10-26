/* Shared, allowlisted site navigation. Never reads form values or other tabs. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.PauNavigator=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const routes={
    home:{title:'Welcome',href:'/#home',facts:['profile'],tip:'Meet Pau and explore the sections using the main menu.'},
    about:{title:'About Pau',href:'/#about',facts:['profile','style'],tip:'Read Pau’s introduction and what she helps her audiences achieve.'},
    story:{title:'My Story',href:'/#my-story',facts:['experience','mentoring'],tip:'Follow the four chapters, from corporate work to freelancing and Cross Core.'},
    topics:{title:'Speaking Topics',href:'/#speaking-topics',facts:['freelance','marketing','leadership'],tip:'Compare the three talks. Choose a topic’s inquiry link to discuss it with Pau.'},
    freelance:{title:'Freelance 101',href:'/#topic-one',facts:['freelance'],tip:'Read the beginner topics, then choose the inquiry link to ask about this talk.'},
    marketing:{title:'Social Media Marketing',href:'/#topic-two',facts:['marketing'],tip:'Review the content and branding topics, then use the inquiry link to discuss audience fit.'},
    leadership:{title:'Inspirational Leadership',href:'/#topic-three',facts:['leadership'],tip:'Review the leadership topics and use the inquiry link to discuss your group’s goals.'},
    events:{title:'Events',href:'/#events',facts:['event','registration'],tip:'Check the event status first, then select “View event details” to read the session information.'},
    why:{title:'Why Pau',href:'/#why-pau',facts:['style'],tip:'Read about her speaking style and practical experience before planning an invitation.'},
    contact:{title:'Contact & Invitations',href:'/#contact',facts:['contact'],tip:'1. Enter your name, email, and inquiry type.\n2. Choose a topic and event format if you know them.\n3. Add your preferred date, audience, and goals.\n4. Review the details and select “Send Inquiry.” Pau confirms arrangements directly.'},
    event:{title:'Event details',facts:['event','registration'],tip:'Read the session overview, topics, takeaways, and registration status below.'},
    register:{title:'Registration',facts:['event','registration'],tip:'Read the registration status before continuing. Follow the instructions shown on the event page.'}
  };
  const fields={
    'inq-organization':'Enter your organization or school, if applicable.',
    'inq-location':'Choose Online, Onsite, or Not yet decided for the event location.',
    'inq-size':'Choose an estimated audience size, or leave Not sure yet.',
    'inq-audience':'Describe who will attend, such as college students or a marketing team.',
    'inq-date-status':'Mark the date as tentative, final, or not yet decided. Pau still confirms availability.',
    'inq-date-notes':'Add useful scheduling context or alternative dates, if you have them.',
    'reg-stage':'Choose the description that best fits your starting point, or Prefer not to say.',
    'reg-hopes':'Describe what you hope to learn. Check the registration status before submitting.',
    'inq-name':'Enter the name Pau should use when replying.',
    'inq-email':'Enter an email address where Pau can reach you.',
    'inq-type':'Choose whether you are planning a speaking event or making another inquiry.',
    'inq-topic':'Choose the talk you are interested in, or leave “Not sure yet.”',
    'inq-format':'Choose your event format, such as a webinar or workshop.',
    'inq-date':'Choose a preferred date if you have one. Pau still needs to confirm availability.',
    'inq-message':'Describe your audience, what they should learn, and any useful event details.',
    'reg-name':'Enter your name in the registration form. Check the registration status before submitting.',
    'reg-email':'Enter your email in the registration form. Check the registration status before submitting.'
  };
  const sectionIds={home:'home',about:'about','my-story':'story','chapter-one':'story','chapter-two':'story','chapter-three':'story','chapter-four':'story','speaking-topics':'topics','topic-one':'freelance','topic-two':'marketing','topic-three':'leadership',events:'events','why-pau':'why',contact:'contact',main:'event',register:'register'};
  function context(value){
    if(value===undefined)return {page:'home',section:'home',focus:''};
    if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!['page','section','focus'].includes(k)))throw new Error('Invalid page context');
    if(!['home','event','not-found'].includes(value.page)||!Object.hasOwn(routes,value.section)||typeof value.focus!=='string'||(value.focus&&!Object.hasOwn(fields,value.focus)))throw new Error('Invalid page context');
    return {page:value.page,section:value.section,focus:value.focus};
  }
  function tagalog(q){return /\b(?:saan|nasaan|paano|ano|nandito|dito|nito|ito|ako|ko|mo|naman|nanay|tulungan|dalhin|punta|turuan)\b/i.test(q);}
  function target(id,knowledge){
    const route=routes[id];if(!route)return null;
    if(route.href)return {...route,id};
    const event=knowledge.site?.events?.[0];if(!event)return null;
    return {...route,id,href:'/events/'+event.slug+'/'+(id==='register'?'#register':'')};
  }
  function intent(question,view){
    const q=question.toLowerCase();
    if(!/where|navigate|show me|take me|bring me|go to|how (?:do|can|to)|help.*(?:page|screen|form)|what.*(?:here|section|next)|\btour\b|saan|nasaan|paano|dalhin|punta|turuan|nandito|ano.*(?:dito|nito|ito)|next step|guide me/.test(q))return null;
    if(/(?:my|ng|aking).*(?:mom|mother|nanay|tatay)|password|api.?key|system prompt/.test(q))return null;
    if(/\btour\b|overview.*(?:site|website)/.test(q))return 'home';
    if(/register|registration|sign.?up|mag.?rehistro/.test(q))return 'register';
    if(/contact|inquir|invite|book|form|email|message|imbita|mag.?book/.test(q))return 'contact';
    if(/event|session/.test(q))return 'events';
    if(/social media|marketing|branding/.test(q))return 'marketing';
    if(/leadership/.test(q))return 'leadership';
    if(/freelanc/.test(q))return 'freelance';
    if(/topic|talk|paksa/.test(q))return 'topics';
    if(/story|experience|background|kwento/.test(q))return 'story';
    if(/about|who.*pau|kilala/.test(q))return 'about';
    if(/website|site|page|screen|here|section|tour|dito|nito|ito|nandito|next|guide me|where am i|nasaan ako|navigate/.test(q))return view.section;
    return null;
  }
  function guide(question,rawContext,knowledge,chosen){
    const view=context(rawContext),id=chosen||intent(question,view);if(!id)return null;
    const route=target(id,knowledge);if(!route)return null;
    const tl=tagalog(question),current=routes[view.section];
    let answer=(tl?'Nasa ':'You’re viewing ')+current.title+(tl?' section ka ngayon.':' right now.');
    answer+='\n\n'+(id===view.section&&view.focus&&fields[view.focus]?fields[view.focus]:route.tip);
    if(id==='register'){
      const event=knowledge.site?.events?.[0];
      if(event?.registrationMode==='preview')answer+='\n\n'+(tl?'Preview lang ang registration: walang mare-reserve na seat at walang ipapadala o ise-save.':'Registration is a preview: no seat is reserved and nothing is sent or saved.');
      else if(event?.registrationMode==='closed')answer+='\n\nRegistration is closed. Contact Pau about future sessions.';
    }
    if(/\btour\b/i.test(question))answer+='\n\n1. About: meet Pau.\n2. My Story: read her journey.\n3. Speaking Topics: compare her talks.\n4. Events: check session and registration status.\n5. Contact: send your event inquiry.';
    const actions=[{id,label:(tl?'Pumunta sa ':'Open ')+route.title}];
    if(id===view.section&&id!=='contact')actions.push({id:'contact',label:tl?'Magtanong kay Pau':'Ask Pau about an event'});
    return {answer,actions,sources:route.facts.map(id=>knowledge.facts.find(f=>f.id===id)).filter(Boolean).map(f=>({id:f.id,title:f.title,href:f.href})),mode:'portfolio-guide',navigation:true};
  }
  return {routes,fields,sectionIds,context,target,intent,guide,tagalog};
});
