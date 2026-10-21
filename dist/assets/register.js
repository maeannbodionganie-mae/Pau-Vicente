/* Registration preview: validates the form locally and never sends or stores what visitors type. */
(() => {
  'use strict';
  const form = document.getElementById('registration-form');
  const complete = document.getElementById('registration-complete');
  if (!form || !complete || form.dataset.mode !== 'preview') return;
  const summary = document.getElementById('register-summary');
  const restart = document.getElementById('registration-restart');
  const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
  const labels = { name: 'Full name', email: 'Email' };
  const value = (name) => (form.elements[name].value || '').trim();

  function rules() {
    const errors = {};
    if (value('name').length < 2) errors.name = 'Please enter your full name.';
    if (!value('email')) errors.email = 'Please enter your email address.';
    else if (!EMAIL_PATTERN.test(value('email'))) errors.email = 'Please enter an email address like name@example.com.';
    return errors;
  }

  function setError(name, message) {
    const input = form.elements[name];
    const error = document.getElementById(`${input.id}-error`);
    if (message) { input.setAttribute('aria-invalid', 'true'); error.textContent = message; error.hidden = false; }
    else { input.removeAttribute('aria-invalid'); error.textContent = ''; error.hidden = true; }
  }

  for (const name of Object.keys(labels)) {
    const input = form.elements[name];
    const recheck = () => { if (input.getAttribute('aria-invalid') === 'true') setError(name, rules()[name]); };
    input.addEventListener('input', recheck);
    input.addEventListener('blur', recheck);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const errors = rules();
    for (const name of Object.keys(labels)) setError(name, errors[name]);
    const names = Object.keys(errors);
    if (names.length) {
      const heading = document.createElement('p');
      heading.textContent = names.length === 1 ? 'Please fix 1 field:' : `Please fix ${names.length} fields:`;
      const list = document.createElement('ul');
      for (const name of names) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = `#${form.elements[name].id}`;
        link.textContent = `${labels[name]}: ${errors[name]}`;
        link.addEventListener('click', (e) => { e.preventDefault(); form.elements[name].focus(); });
        item.append(link); list.append(item);
      }
      summary.replaceChildren(heading, list);
      summary.hidden = false;
      summary.focus();
      return;
    }
    // Preview mode: nothing leaves the browser. Clear the entries and show the honest completion state.
    summary.hidden = true;
    form.reset();
    form.hidden = true;
    complete.hidden = false;
    complete.focus();
  });

  restart.addEventListener('click', () => {
    complete.hidden = true;
    form.hidden = false;
    form.elements.name.focus();
  });
})();
