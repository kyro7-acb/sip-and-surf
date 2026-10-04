import { CONTACT_EMAIL, mailto } from '../lib/config.js';

if (CONTACT_EMAIL) {
  const p = document.getElementById('contact');
  const a = document.createElement('a');
  a.href = mailto('Sip and Surf privacy');
  a.textContent = CONTACT_EMAIL;
  p.replaceChildren('Questions about privacy or your order: ', a, '.');
}
