/* ============================================================
   become-disposer.js (agent B — phase 6)
   Wires the "become a disposer" form and submits via apiCreateDisposer.
   ============================================================ */

let _dMethod = 'call';
let _dAvailable = true;

function _wireToggle(rowId, cb) {
  const row = document.getElementById(rowId);
  if (!row) return;
  row.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      row.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('toggle-active'));
      btn.classList.add('toggle-active');
      cb(btn.getAttribute('data-val'));
    });
  });
}

window.addEventListener('DOMContentLoaded', () => {
  _wireToggle('d-method', v => { _dMethod = v; });
  _wireToggle('d-available', v => { _dAvailable = (v === 'on'); });
});

async function submitDisposer() {
  const service_area = document.getElementById('d-area').value.trim();
  const contact_value = document.getElementById('d-contact').value.trim();
  const bio = document.getElementById('d-bio').value.trim();

  if (!service_area || !contact_value) {
    showToast('Service area and contact value are required.');
    return;
  }

  const profile = await apiCreateDisposer({
    service_area,
    contact_method: _dMethod,
    contact_value,
    bio,
    available: _dAvailable,
  });

  showToast('Profile created — welcome to the manifest.');
  window.location.href = `disposer.html?id=${profile.id}`;
}
