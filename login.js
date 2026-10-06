/* ══════════════════════════════════════════════════════════════
   TA JOURNAL – LOGIN.JS
   Login form logic + localStorage persistence + MongoDB sync

   Copyright (c) 2026 Harsh Anand Badal. All rights reserved.
   Licensed under the MIT License.
   ══════════════════════════════════════════════════════════════ */

'use strict';

const STORAGE_KEY = 'ta_journal_employee';
const API_BASE    = '';   // same origin – server.js serves both

// ── Helper: format date as "03 August 2000" ──
function formatDateLong(dateStr) {
  if (!dateStr) return '';
  const dt = new Date(dateStr + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ══════════════════════════════════════════════════════════════
//  MONGODB SYNC HELPERS
// ══════════════════════════════════════════════════════════════

/**
 * Save employee profile to MongoDB via REST API.
 * Falls back silently on network errors (localStorage is the safety net).
 */
async function saveEmployeeToMongo(data) {
  try {
    const res = await fetch(`${API_BASE}/api/employee`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      console.warn('MongoDB save warning:', payload.message);
    } else {
      console.log('✅ Employee profile saved to MongoDB.');
    }
  } catch (e) {
    console.warn('MongoDB unavailable – using localStorage only:', e.message);
  }
}

/**
 * Fetch employee profile from MongoDB by PF number.
 * Returns the data object or null.
 */
async function fetchEmployeeFromMongo(pf) {
  try {
    const res = await fetch(`${API_BASE}/api/employee/${encodeURIComponent(pf)}`);
    if (!res.ok) return null;
    const payload = await res.json();
    return payload.success ? payload.data : null;
  } catch (e) {
    console.warn('MongoDB unavailable – falling back to localStorage:', e.message);
    return null;
  }
}

// ── Pre-fill from MongoDB (if PF known) then localStorage ──
async function prefill() {
  const saved = localStorage.getItem(STORAGE_KEY);
  let d = null;

  // 1. If we have local data with a PF number, try MongoDB first
  if (saved) {
    try { d = JSON.parse(saved); } catch(e) { d = null; }
    if (d && d.pf) {
      const remote = await fetchEmployeeFromMongo(d.pf);
      if (remote) {
        // Merge remote (newer) data into local storage
        d = remote;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
        showSyncBadge('☁️ Profile loaded from MongoDB');
      }
    }
  }

  if (!d) return;
  applyToForm(d);
}

function applyToForm(d) {
  setVal('l-name',        d.name        || '');
  setVal('l-branch',      d.branch      || '');
  setVal('l-zone',        d.zone        || '');
  setVal('l-division',    d.division    || '');
  setVal('l-hq',          d.hq          || '');
  setVal('l-designation', d.designation || '');
  setVal('l-doa',         d.doa         || '');
  setVal('l-pf',          d.pf          || '');
  setVal('l-basicpay',    d.basicPay    || '');
  setVal('l-level',       d.level       || '');
  setVal('l-gp',          d.gp          || '');
  setVal('l-scale',       d.scale       || '');
  setVal('l-tarate',      d.taRate      || '');

  // Custom designation
  if (d.customDesig) {
    document.getElementById('l-designation').value = 'Custom';
    document.getElementById('custom-desig-field').style.display = 'block';
    setVal('l-custom-desig', d.customDesig);
  }
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

// ── Small cloud-sync badge ───────────────────────────────────
function showSyncBadge(msg) {
  let badge = document.getElementById('syncBadge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'syncBadge';
    badge.style.cssText = [
      'position:fixed', 'bottom:20px', 'right:20px',
      'background:rgba(16,185,129,.92)', 'color:#fff',
      'padding:8px 16px', 'border-radius:999px',
      'font-size:.78rem', 'font-weight:600',
      'box-shadow:0 4px 16px rgba(0,0,0,.25)',
      'z-index:9999', 'transition:opacity .4s ease',
    ].join(';');
    document.body.appendChild(badge);
  }
  badge.textContent = msg;
  badge.style.opacity = '1';
  setTimeout(() => { badge.style.opacity = '0'; }, 3000);
}

// ── Validate single field ──────────────────────────────────────
function validateField(field) {
  const wrap = field.closest('.field');
  if (!wrap) return true;
  const existingMsg = wrap.querySelector('.field-error-msg');
  if (existingMsg) existingMsg.remove();

  const required = field.hasAttribute('required');
  const val = field.value.trim();

  if (required && !val) {
    wrap.classList.add('error');
    wrap.classList.remove('success');
    const msg = document.createElement('span');
    msg.className = 'field-error-msg';
    msg.textContent = 'This field is required.';
    wrap.appendChild(msg);
    return false;
  }

  wrap.classList.remove('error');
  if (val) wrap.classList.add('success');
  else wrap.classList.remove('success');
  return true;
}

// ── Full form validation ───────────────────────────────────────
function validateForm() {
  const requiredIds = ['l-name','l-branch','l-zone','l-division','l-hq',
                       'l-designation','l-doa','l-pf','l-basicpay','l-level','l-tarate'];
  let valid = true;
  requiredIds.forEach(id => {
    const el = document.getElementById(id);
    if (!validateField(el)) valid = false;
  });
  return valid;
}

// ── Save to localStorage + MongoDB, then redirect ─────────────
async function saveAndRedirect(data) {
  // 1. Save to localStorage immediately (offline safety net)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

  // 2. Show loading state
  const btn = document.getElementById('loginBtn');
  btn.classList.add('loading');
  btn.querySelector('.btn-text').textContent = 'Saving…';
  btn.querySelector('.btn-arrow').textContent = '⟳';
  btn.disabled = true;

  // 3. Save to MongoDB
  await saveEmployeeToMongo(data);

  // 4. Redirect
  btn.querySelector('.btn-text').textContent = 'Redirecting…';
  setTimeout(() => {
    window.location.href = 'index.html';
  }, 500);
}

// ── DOM Ready ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Pre-fill from MongoDB (async) then localStorage
  prefill();

  // Custom designation toggle
  document.getElementById('l-designation').addEventListener('change', function () {
    const show = this.value === 'Custom';
    const customField = document.getElementById('custom-desig-field');
    customField.style.display = show ? 'block' : 'none';
    const customInput = document.getElementById('l-custom-desig');
    if (show) customInput.setAttribute('required', '');
    else       customInput.removeAttribute('required');
  });

  // Inline validation on blur
  document.querySelectorAll('#loginForm input, #loginForm select').forEach(el => {
    el.addEventListener('blur', () => validateField(el));
    el.addEventListener('input', () => {
      if (el.closest('.field').classList.contains('error')) validateField(el);
    });
  });

  // Force uppercase for HQ station code
  document.getElementById('l-hq').addEventListener('input', function() {
    this.value = this.value.toUpperCase();
  });

  // Form submit
  document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    if (!validateForm()) {
      const firstError = document.querySelector('.field.error');
      if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const desigEl    = document.getElementById('l-designation');
    const desigVal   = desigEl.value;
    const customDesig = document.getElementById('l-custom-desig').value.trim();
    const finalDesig  = desigVal === 'Custom' ? customDesig : desigVal;

    const doa = document.getElementById('l-doa').value;

    const data = {
      name:         document.getElementById('l-name').value.trim(),
      branch:       document.getElementById('l-branch').value,
      zone:         document.getElementById('l-zone').value,
      division:     document.getElementById('l-division').value.trim(),
      hq:           document.getElementById('l-hq').value.trim().toUpperCase(),
      designation:  finalDesig,
      customDesig:  desigVal === 'Custom' ? customDesig : '',
      doa,
      doaFormatted: formatDateLong(doa),
      pf:           document.getElementById('l-pf').value.trim(),
      basicPay:     document.getElementById('l-basicpay').value.trim(),
      level:        document.getElementById('l-level').value,
      gp:           document.getElementById('l-gp').value.trim(),
      scale:        document.getElementById('l-scale').value.trim(),
      taRate:       document.getElementById('l-tarate').value.trim(),
    };

    await saveAndRedirect(data);
  });

});
