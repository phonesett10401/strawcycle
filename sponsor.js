import { addSponsor, addPack, cleanName, formatTHB, MAX_RAI, PROVINCES, SPONSOR_BAHT } from './shop.js';

const $ = (s) => document.querySelector(s);
const rai = $('#sp-rai'), province = $('#sp-province'), name = $('#sp-name'), status = $('#sp-status');
const clampRai = () => { const n = Math.floor(Number(rai.value)); return Number.isFinite(n) ? Math.min(MAX_RAI, Math.max(1, n)) : 1; };

PROVINCES.forEach((p) => province.append(new Option(p, p)));

function update() {
  const r = clampRai();
  $('#sp-total').textContent = formatTHB(SPONSOR_BAHT * r);
  $('#pv-rai').textContent = `${r} rai`;
  $('#pv-province').textContent = province.value;
  $('#pv-name').textContent = cleanName(name.value) || 'Your name';
}
function clearError() {
  $('#sp-name-err')?.remove();
  name.removeAttribute('aria-invalid'); name.removeAttribute('aria-describedby');
}

rai.addEventListener('input', update);
rai.addEventListener('blur', () => { rai.value = clampRai(); update(); });
province.addEventListener('change', update);
name.addEventListener('input', () => { if (cleanName(name.value)) clearError(); update(); });
document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
  rai.value = Math.min(MAX_RAI, Math.max(1, clampRai() + Number(b.dataset.step)));
  update();
}));

$('#sponsor-form').addEventListener('submit', (e) => {
  e.preventDefault();
  clearError(); status.textContent = '';
  if (!cleanName(name.value)) {
    const err = document.createElement('p');
    err.id = 'sp-name-err'; err.className = 'field-error'; err.setAttribute('role', 'alert');
    err.textContent = 'Enter the name for the certificate.';
    name.setAttribute('aria-invalid', 'true'); name.setAttribute('aria-describedby', err.id);
    name.after(err); name.focus();
    return;
  }
  const r = clampRai();
  rai.value = r;
  window.sc.setBag(addSponsor(window.sc.getBag(), r, province.value, name.value, 's' + Date.now()));
  status.textContent = `Added ${r} rai in ${province.value} to your bag.`;
});

$('#pack-add').addEventListener('click', () => window.sc.setBag(addPack(window.sc.getBag(), 1)));
update();
