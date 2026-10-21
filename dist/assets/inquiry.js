/* Speaking inquiry form: validation, topic context, duplicate-safe submission and truthful states. */
(() => {
  'use strict';
  const form = document.getElementById('inquiry-form');
  if (!form) return;
  const endpoint = form.dataset.endpoint || '/api/inquiry';
  const submit = document.getElementById('inquiry-submit');
  const status = document.getElementById('inquiry-status');
  const summary = document.getElementById('inquiry-summary');
  const EMAIL = 'pauline.vicente14@gmail.com';
  const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
  const labels = { name: 'Full name', email: 'Email', inquiryType: 'Inquiry type', message: 'Event goals or inquiry details' };
  const newKey = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
  // One key per inquiry: retries of the same inquiry reuse it, so the server records it only once.
  let submissionKey = newKey();
  let busy = false;

  const field = (name) => form.elements[name];
  const value = (name) => (field(name)?.value || '').trim();

  function rules() {
    const errors = {};
    const name = value('name'), email = value('email'), message = value('message');
    if (!name) errors.name = 'Please enter your full name.';
    else if (name.length < 2) errors.name = 'Please enter your full name.';
    if (!email) errors.email = 'Please enter your email address.';
    else if (!EMAIL_PATTERN.test(email)) errors.email = 'Please enter an email address like name@example.com.';
    if (!value('inquiryType')) errors.inquiryType = 'Please choose an inquiry type.';
    if (!message) errors.message = 'Please share your event goals or inquiry details.';
    else if (message.length < 20) errors.message = 'Please add a little more detail (at least 20 characters).';
    return errors;
  }

  function setError(name, message) {
    const input = field(name);
    const error = document.getElementById(`${input.id}-error`);
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      if (error) { error.textContent = message; error.hidden = false; }
    } else {
      input.removeAttribute('aria-invalid');
      if (error) { error.textContent = ''; error.hidden = true; }
    }
  }

  function showErrors(errors) {
    for (const name of Object.keys(labels)) setError(name, errors[name]);
    const names = Object.keys(errors);
    if (!names.length) { summary.hidden = true; summary.replaceChildren(); return true; }
    const heading = document.createElement('p');
    heading.textContent = names.length === 1 ? 'Please fix 1 field before sending:' : `Please fix ${names.length} fields before sending:`;
    const list = document.createElement('ul');
    for (const name of names) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#${field(name).id}`;
      link.textContent = `${labels[name]}: ${errors[name]}`;
      link.addEventListener('click', (event) => { event.preventDefault(); field(name).focus(); });
      item.append(link); list.append(item);
    }
    summary.replaceChildren(heading, list);
    summary.hidden = false;
    summary.focus();
    return false;
  }

  // Re-check a field once the visitor has been told about a problem with it.
  for (const name of Object.keys(labels)) {
    const input = field(name);
    const recheck = () => { if (input.getAttribute('aria-invalid') === 'true') setError(name, rules()[name]); };
    input.addEventListener('input', recheck);
    input.addEventListener('change', recheck);
    input.addEventListener('blur', recheck);
  }

  // Topic buttons carry their context into the form.
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest && event.target.closest('[data-topic]');
    if (!trigger) return;
    const topic = field('topic');
    if ([...topic.options].some((option) => option.value === trigger.dataset.topic)) topic.value = trigger.dataset.topic;
    if (!value('inquiryType')) field('inquiryType').value = 'Speaking invitation';
  });

  function mailtoFromForm() {
    const lines = [
      'Hello Pau,', '',
      `Name: ${value('name')}`, `Email: ${value('email')}`, `Organization: ${value('organization')}`,
      `Inquiry type: ${value('inquiryType')}`, `Topic: ${value('topic')}`, `Event type: ${value('eventType')}`,
      `Preferred date: ${value('preferredDate')}`, `Location or platform: ${value('location')}`,
      `Audience: ${value('audience')}`, `Estimated audience size: ${value('audienceSize')}`, '',
      value('message').slice(0, 1200)
    ];
    return `mailto:${EMAIL}?subject=${encodeURIComponent('Speaking inquiry for Pau Vicente')}&body=${encodeURIComponent(lines.join('\n'))}`;
  }

  function notice(kind, title, paragraphs, extra) {
    const box = document.createElement('div');
    box.className = `notice${kind === 'error' ? ' notice-error' : ''}`;
    box.tabIndex = -1;
    const heading = document.createElement('h3');
    heading.textContent = title;
    box.append(heading);
    for (const text of paragraphs) { const p = document.createElement('p'); p.textContent = text; box.append(p); }
    if (extra) box.append(extra);
    status.replaceChildren(box);
    return box;
  }

  function emailFallback(text) {
    const p = document.createElement('p');
    const link = document.createElement('a');
    link.href = mailtoFromForm();
    link.textContent = text;
    p.append(link, document.createTextNode(` or write to ${EMAIL}.`));
    return p;
  }

  function setBusy(state) {
    busy = state;
    submit.disabled = state;
    form.setAttribute('aria-busy', String(state));
    submit.querySelector('.button-label').textContent = state ? 'Sending' : 'Send Inquiry';
  }

  function payload() {
    const data = { submissionKey };
    for (const name of ['name', 'email', 'organization', 'inquiryType', 'topic', 'eventType', 'preferredDate', 'location', 'audience', 'audienceSize', 'message', 'website']) {
      data[name] = value(name);
    }
    return data;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!showErrors(rules())) return;
    setBusy(true);
    const sending = document.createElement('p');
    sending.className = 'form-sending';
    sending.textContent = 'Sending your inquiry…';
    status.replaceChildren(sending);
    let response = null, data = null;
    try {
      response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload()), signal: AbortSignal.timeout(30000)
      });
      data = await response.json().catch(() => null);
    } catch {
      response = null;
    }
    setBusy(false);

    if (response && response.ok && data && data.status === 'received' && typeof data.id === 'string') {
      const reference = document.createElement('p');
      const code = document.createElement('span');
      code.className = 'reference';
      code.textContent = data.id;
      reference.append(document.createTextNode('Your reference ID: '), code);
      const notified = data.notification === 'sent';
      const box = notice('success', 'Thank you. Your inquiry was received.', [], reference);
      for (const text of [
        notified ? 'Pau has been notified and will reply to the email address you provided.' : 'It has been recorded for Pau to review, and she will reply to the email address you provided.',
        'Please keep the reference ID for any follow-up. Sending an inquiry does not confirm Pau’s availability or a booking.'
      ]) { const p = document.createElement('p'); p.textContent = text; box.append(p); }
      form.reset();
      for (const name of Object.keys(labels)) setError(name, '');
      submissionKey = newKey();
      box.focus();
      return;
    }

    if (response && response.status === 400 && data && data.fields) {
      showErrors(data.fields);
      status.replaceChildren();
      return;
    }

    let box;
    if (response && response.status === 503 && data && data.code === 'not_configured') {
      box = notice('error', 'The online form isn’t available yet.', [
        'Your details are still in the form. You can send them to Pau by email instead.'
      ], emailFallback('Open an email with your details'));
    } else if (response && response.status === 429) {
      box = notice('error', 'Too many attempts in a short time.', [
        'Your details are still in the form. Please wait a minute and try again.'
      ], emailFallback('Or send them by email'));
    } else {
      box = notice('error', 'We couldn’t confirm that your inquiry was received.', [
        'Your details are still in the form. Please try again; a repeated attempt will not create a duplicate inquiry.'
      ], emailFallback('You can also send your details by email'));
    }
    box.focus();
  });
})();
