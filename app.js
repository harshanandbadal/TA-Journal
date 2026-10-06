/* ══════════════════════════════════════════
   TRAVELLING ALLOWANCE JOURNAL – APP.JS
   New Model: auto-generate all days of month,
   inline row editing via sidebar panel.
   MongoDB sync: employee profile + journal rows
   ══════════════════════════════════════════ */
'use strict';

// ── State ──────────────────────────────────────
const STORAGE_KEY = 'ta_journal_employee';
const API_BASE    = '';   // same origin as server.js
let journeyRows   = [];    // one entry per calendar day
let selectedRowIdx = -1;   // index of the row currently being edited
let empData       = {};    // employee data from localStorage / MongoDB

// ══════════════════════════════════════════════
//  MONGODB SYNC HELPERS
// ══════════════════════════════════════════════

/**
 * Save journal rows for the current month to MongoDB.
 * Called automatically after every row save and month generate.
 * Fails silently – localStorage is the offline safety net.
 */
async function syncJournalToMongo() {
  const pf    = empData.pf;
  const month = document.getElementById('journalMonth')?.value;
  if (!pf || !month || !journeyRows.length) return;

  const { totalAmt, workingDays } = computeTotals();

  try {
    const res = await fetch(`${API_BASE}/api/journal`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        pf,
        month,
        rows:        journeyRows,
        monthLabel:  monthLabel(month),
        totalAmount: totalAmt,
        workingDays,
      }),
    });
    if (res.ok) {
      showSyncBadge('☁️ Journal saved to MongoDB');
    } else {
      const payload = await res.json().catch(() => ({}));
      console.warn('Journal MongoDB save warning:', payload.message);
    }
  } catch (e) {
    console.warn('MongoDB unavailable – journal saved locally only:', e.message);
  }
}

/**
 * Load journal rows for a given month from MongoDB.
 * Returns the rows array or null if not found.
 */
async function loadJournalFromMongo(pf, month) {
  if (!pf || !month) return null;
  try {
    const res = await fetch(
      `${API_BASE}/api/journal/${encodeURIComponent(pf)}/${encodeURIComponent(month)}`
    );
    if (!res.ok) return null;
    const payload = await res.json();
    return payload.success && payload.data ? payload.data.rows : null;
  } catch (e) {
    console.warn('MongoDB unavailable – cannot restore journal from cloud:', e.message);
    return null;
  }
}

/** Small floating badge for cloud-sync feedback */
function showSyncBadge(msg) {
  let badge = document.getElementById('mongoSyncBadge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'mongoSyncBadge';
    badge.style.cssText = [
      'position:fixed', 'bottom:20px', 'right:20px',
      'background:rgba(16,185,129,.92)', 'color:#fff',
      'padding:8px 16px', 'border-radius:999px',
      'font-size:.78rem', 'font-weight:600',
      'box-shadow:0 4px 16px rgba(0,0,0,.25)',
      'z-index:9999', 'opacity:1', 'transition:opacity .4s ease',
    ].join(';');
    document.body.appendChild(badge);
  }
  badge.textContent = msg;
  badge.style.opacity = '1';
  clearTimeout(badge._t);
  badge._t = setTimeout(() => { badge.style.opacity = '0'; }, 3000);
}

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════
function fmtDate(dateStr) {
  // dateStr: "2026-08-01" → "01-08-2026"
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return `${d}-${m}-${y}`;
}

function fmt24to12(t) {
  // Display time in 24-hour format (HH:MM)
  if (!t || t === '-') return '-';
  const [h, m] = t.split(':');
  return `${h.padStart(2, '0')}:${(m || '00').padStart(2, '0')}`;
}

function monthLabel(m) {
  if (!m) return '';
  const [y, mo] = m.split('-');
  const names = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];
  return `${names[parseInt(mo) - 1]} ${y}`;
}

function daysInMonth(yearMonth) {
  // yearMonth: "2026-08"
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function toWords(n) {
  n = Math.round(n);
  if (!n || isNaN(n)) return 'Zero';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
                'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
                'Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const conv = (num) => {
    if (num < 20)       return ones[num];
    if (num < 100)      return tens[~~(num/10)] + (num%10 ? ' '+ones[num%10] : '');
    if (num < 1000)     return ones[~~(num/100)] + ' Hundred' + (num%100 ? ' '+conv(num%100) : '');
    if (num < 100000)   return conv(~~(num/1000)) + ' Thousand' + (num%1000 ? ' '+conv(num%1000) : '');
    if (num < 10000000) return conv(~~(num/100000)) + ' Lakh' + (num%100000 ? ' '+conv(num%100000) : '');
    return conv(~~(num/10000000)) + ' Crore' + (num%10000000 ? ' '+conv(num%10000000) : '');
  };
  return conv(n);
}

function showToast(msg, type = 'success') {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = `show toast-${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.className = '', 2800);
}

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}
function setVal(id, v) {
  const el = document.getElementById(id);
  if (el) el.value = v ?? '';
}

// ══════════════════════════════════════════════
//  LOAD FROM LOCALSTORAGE
// ══════════════════════════════════════════════
function loadFromLocalStorage() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return null;
  try {
    empData = JSON.parse(saved);
    // Populate hidden inputs
    setVal('empName',    empData.name);
    setVal('empDesig',   empData.designation);
    setVal('empLevel',   empData.level);
    setVal('empBranch',  empData.branch);
    setVal('empHQ',      empData.hq);
    setVal('empDiv',     empData.division);
    setVal('empBasicPay',empData.basicPay);
    setVal('empScale',   empData.scale);
    setVal('empGP',      empData.gp);
    setVal('empTARate',  empData.taRate);
    setVal('empPF',      empData.pf);
    setVal('empDOA',     empData.doa);
    setVal('empZone',    empData.zone);
    renderProfileCard(empData);
    return empData;
  } catch(e) { return null; }
}

// ══════════════════════════════════════════════
//  RENDER PROFILE CARD
// ══════════════════════════════════════════════
function renderProfileCard(d) {
  const name    = d.name  || '—';
  const desig   = d.designation || '—';
  const initials = name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || 'TA';

  setEl('profileAvatar', initials);
  setEl('profileName',   name);
  setEl('profileDesig',  `${desig}${d.zone ? ' · ' + d.zone : ''}`);

  const detailEl = document.getElementById('profileDetails');
  if (!detailEl) return;

  const row = (lbl, val, full=false, hi=false) => `
    <div class="profile-detail-item${full?' full-width':''}">
      <span class="pd-label">${lbl}</span>
      <span class="pd-value${hi?' highlight':''}">${val||'—'}</span>
    </div>`;

  const doaDisplay = d.doaFormatted || (d.doa ? fmtDate(d.doa) : '—');
  detailEl.innerHTML =
    row('Branch',   d.branch) +
    row('Division', d.division) +
    row('HQ / Stn', d.hq) +
    row('Level',    d.level ? 'Level '+d.level : '—') +
    row('Basic Pay',d.basicPay ? '₹'+Number(d.basicPay).toLocaleString('en-IN'):'—', false, true) +
    row('Grade Pay',d.gp ? '₹'+d.gp : '—') +
    row('Pay Scale',d.scale||'—') +
    row('TA Rate',  d.taRate ? '₹'+d.taRate+'/day':'—', false, true) +
    row('P.F. No.', d.pf,   true) +
    row('Appointed',doaDisplay, true);
}

function setEl(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

// ══════════════════════════════════════════════
//  GENERATE ALL DAYS OF SELECTED MONTH
// ══════════════════════════════════════════════
async function generateMonthRows() {
  const month = val('journalMonth');
  if (!month) { showToast('Please select a month first!', 'error'); return; }

  const taRate   = parseFloat(empData.taRate || 0);
  const numDays  = daysInMonth(month);
  const [y, m]   = month.split('-');

  // ── Try loading saved journal from MongoDB first ──────────
  const pf = empData.pf;
  if (pf) {
    showToast('⏳ Checking MongoDB for saved journal…', 'success');
    const savedRows = await loadJournalFromMongo(pf, month);
    if (savedRows && savedRows.length) {
      journeyRows    = savedRows;
      selectedRowIdx = -1;
      hideRowEditor();
      renderDocument();
      updateToolbar(month);
      showToast(`☁️ Restored ${savedRows.length} rows from MongoDB`, 'success');
      showSyncBadge('☁️ Journal loaded from MongoDB');
      return;
    }
  }

  // ── No saved data – generate blank rows ──────────────────
  journeyRows = [];
  for (let d = 1; d <= numDays; d++) {
    const dd   = String(d).padStart(2,'0');
    const date = `${y}-${m}-${dd}`;
    journeyRows.push({
      date,
      train:     '',
      depart:    '',
      arrival:   '',
      from:      '',
      to:        '',
      dist:      '',
      dayNight:  '100%',
      amount:    taRate ? String(taRate) : '',
      objective: 'A.C. Manning',
    });
  }

  selectedRowIdx = -1;
  hideRowEditor();
  renderDocument();
  updateToolbar(month);
  showToast(`✔ Generated ${numDays} rows for ${monthLabel(month)}`, 'success');
}

function updateToolbar(month) {
  if (!month) return;
  const [y, m] = month.split('-');
  const selM = document.getElementById('selToolbarMonth');
  const selY = document.getElementById('selToolbarYear');
  if (selM && m) selM.value = m;
  if (selY && y) selY.value = y;
}

// ══════════════════════════════════════════════
//  COMPUTE TOTALS
// ══════════════════════════════════════════════
function computeTotals() {
  let totalAmt = 0, totalPct = 0, totalDist = 0;
  const breakdown = {};  // { '30%': {count, total}, ... }
  let workingDays = 0;

  journeyRows.forEach(r => {
    const amt = parseFloat(r.amount) || 0;
    const dist = parseFloat(r.dist)  || 0;
    totalAmt  += amt;
    totalDist += dist;

    if (r.dayNight) {
      const pct    = r.dayNight;
      const pctVal = parseFloat(pct) || 0;
      totalPct += pctVal;
      if (!breakdown[pct]) breakdown[pct] = { count: 0, total: 0 };
      breakdown[pct].count++;
      breakdown[pct].total += amt;
    }

    if (r.objective && r.objective !== 'Rest' && r.objective !== 'Leave') {
      workingDays++;
    }
  });

  return { totalAmt, totalPct, totalDist, breakdown, workingDays };
}

// ══════════════════════════════════════════════
//  RENDER THE TA DOCUMENT
// ══════════════════════════════════════════════
function renderDocument() {
  const doc    = document.getElementById('ta-document');
  if (!doc) return;

  if (!journeyRows.length) {
    doc.innerHTML = `
      <div class="doc-placeholder">
        <div class="placeholder-icon">📄</div>
        <h3>Select a Month to Generate the TA Journal</h3>
        <p>Choose the Journal Period from the left panel, then click <strong>Generate Month Rows</strong>.</p>
      </div>`;
    return;
  }

  const d        = empData;
  const month    = val('journalMonth');
  const { totalAmt, totalPct, totalDist, breakdown, workingDays } = computeTotals();
  const amtWords = toWords(totalAmt);
  const doaDisplay = d.doaFormatted || (d.doa ? fmtDate(d.doa) : '__________');

  // ── Table rows HTML ──
  let rowsHTML = '';
  journeyRows.forEach((r, i) => {
    const isSelected = i === selectedRowIdx;
    const trClass    = `${i%2===0 ? 'row-even':'row-odd'}${isSelected?' row-selected':''}`;
    const td = (v, cls='') => `<td class="${cls}">${v||'-'}</td>`;

    rowsHTML += `
      <tr class="${trClass}" data-idx="${i}" onclick="selectRow(${i})">
        ${td(fmtDate(r.date),'td-date')}
        ${td(r.train)}
        ${td(r.depart ? fmt24to12(r.depart) : '')}
        ${td(r.arrival ? fmt24to12(r.arrival) : '')}
        ${td(r.from)}
        ${td(r.to)}
        ${td(r.dist)}
        ${td(r.dayNight)}
        ${td(r.amount ? Number(r.amount).toLocaleString('en-IN') : '')}
        ${td(r.objective,'td-obj')}
      </tr>`;
  });

  // Total row
  rowsHTML += `
    <tr class="row-total">
      <td colspan="5" style="text-align:right;padding-right:6px"><strong>Total -</strong></td>
      <td><strong>${totalDist || '-'}</strong></td>
      <td><strong>${totalPct}%</strong></td>
      <td><strong>${totalAmt.toLocaleString('en-IN')}</strong></td>
      <td class="td-obj"><strong>Working Days ${workingDays}</strong></td>
    </tr>`;

  // ── Breakdown lines ──
  const pctOrder = ['30%','70%','100%'];
  let breakdownHTML = '';
  pctOrder.forEach(pct => {
    const b = breakdown[pct] || { count: 0, total: 0 };
    breakdownHTML += `
      <div class="total-line">
        <span>${pct} × ${b.count} = Rs. <strong>${b.total.toFixed(2)}</strong></span>
      </div>`;
  });

  // ── Zone display for header ──
  const zoneShort = (d.zone || '').split(' ')[0] || '';  // e.g. "N.E.R."

  doc.innerHTML = `
    <!-- Corner Refs -->
    <div class="doc-corner">
      <span><strong>NER</strong></span>
      <span style="text-align:right">G 37 F/R4<br>S.R. G/G. 1677</span>
    </div>

    <!-- Heading -->
    <div class="doc-heading">
      <div class="doc-h1">TRAVELLING ALLOWANCE JOURNAL</div>
      <div class="doc-h2">RULES BY WHICH GOVERNED</div>
    </div>

    <!-- Employee Info -->
    <table class="doc-info-table">
      <tr>
        <td><strong>COMERCIAL</strong> Branch, <strong>${d.hq||'_______'}</strong></td>
        <td>Division / District Headquarters at</td>
        <td><strong>${d.division||'___'}</strong></td>
        <td>Journal of</td>
      </tr>
      <tr>
        <td>duties performed by <strong>${d.name||'_________'}</strong></td>
        <td>for which Allowance for</td>
        <td colspan="2"><strong>${monthLabel(month)||'__________'}</strong></td>
      </tr>
      <tr>
        <td>is claimed / Designation: <strong>${d.designation||'_____'}</strong></td>
        <td>/ Level: <strong>${d.level||'__'}</strong></td>
        <td colspan="2">/ Date of Appointment: <strong>${doaDisplay}</strong></td>
      </tr>
      <tr>
        <td colspan="4">
          Basic Pay: <strong>${d.basicPay||'_____'}</strong>
          / Scale: <strong>${d.scale||'___________'}</strong>
          / G.P. <strong>${d.gp||'____'}</strong>
          / T.A. Rate: <strong>${d.taRate||'____'}</strong>
          / P.F. No. <strong>${d.pf||'____________'}</strong>
        </td>
      </tr>
    </table>

    <!-- Journey Table -->
    <div class="doc-table-wrap">
      <table class="doc-table" id="docTable">
        <thead>
          <tr>
            <th>Date</th>
            <th>Train No.</th>
            <th>Depar-<br>ture</th>
            <th>Arrival</th>
            <th>From</th>
            <th>To</th>
            <th>Dist.<br>(Km)</th>
            <th>Day /<br>Night</th>
            <th>Rs.</th>
            <th>Objective of<br>Journey</th>
          </tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>

    <!-- Totals Section -->
    <div class="doc-totals">
      <div class="doc-totals-left">
        ${breakdownHTML}
        <div class="total-line" style="margin-top:6px">
          <strong>Total Percentage :</strong>
        </div>
        <div class="total-line"><strong>Total Rupee :</strong></div>
        <div class="total-line total-words">Rs. ${amtWords}</div>
      </div>
      <div class="doc-totals-right">
        <div class="tr-blank"></div>
        <div class="tr-blank"></div>
        <div class="tr-blank"></div>
        <div><strong>${totalPct} %</strong></div>
        <div><strong>Rs.${totalAmt.toLocaleString('en-IN')}</strong></div>
      </div>
    </div>

    <!-- Certificate -->
    <div class="doc-cert">
      I hereby certify that the above mentioned <strong>${d.name||'_______'}</strong>
      was absent on duty from his Headquarters Station during the period charged for
      in the bill on railway business and that the officer performed the journey by
      Railway / Sea / Road / Air and was allowed / not allowed free pass or locomotion
      at the Expenses of Government Local Fund.
    </div>

    <!-- Signatures -->
    <div class="doc-sigs">
      <div class="sig-block">Countersigned</div>
      <div class="sig-block">Controlling Officer</div>
      <div class="sig-block">Signature of Head of Office</div>
      <div class="sig-block">Signature of Officer Claiming T.A.</div>
    </div>

    <!-- Footer -->
    <div class="doc-footer">
      Note :- On T.A. Bills of transfer from one railway to another, a certificate whether
      or not a free pass or locomotion at Government Expenses was allowed should be recorded.
      <div class="doc-footer-note">21/05/114/8; 4-2012; 12.00.000.</div>
    </div>`;

  setTimeout(updatePreviewScale, 0);
}

/**
 * Dynamically scales the live A4 preview document (#ta-document)
 * so that it fits 100% within the screen width on mobile phone & tablet devices.
 */
function updatePreviewScale() {
  const container = document.getElementById('preview-scroll');
  const scaler    = document.getElementById('ta-document-scaler');
  const doc       = document.getElementById('ta-document');
  if (!container || !doc) return;

  if (window.innerWidth <= 900) {
    const padding = window.innerWidth <= 480 ? 12 : 24;
    const availWidth = container.clientWidth - padding;
    const docWidth = 794; // 210mm in px @ 96dpi

    if (availWidth > 0 && availWidth < docWidth) {
      const scale = Math.min(1, availWidth / docWidth);
      const docHeight = doc.offsetHeight || 1123;

      if (scaler) {
        scaler.style.width  = `${docWidth * scale}px`;
        scaler.style.height = `${docHeight * scale}px`;
        scaler.style.margin = '0 auto';
      }

      doc.style.transform       = `scale(${scale})`;
      doc.style.transformOrigin = 'top left';
      return;
    }
  }

  // Reset for desktop / large viewports
  if (scaler) {
    scaler.style.width  = '';
    scaler.style.height = '';
    scaler.style.margin = '';
  }
  doc.style.transform       = '';
  doc.style.transformOrigin = '';
}

// ══════════════════════════════════════════════
//  ROW SELECTION & EDITING
// ══════════════════════════════════════════════
function selectRow(idx) {
  selectedRowIdx = idx;
  const r = journeyRows[idx];

  // Highlight row
  document.querySelectorAll('#docTable tbody tr').forEach((tr, i) => {
    tr.classList.toggle('row-selected', i === idx);
  });

  // Populate editor
  setVal('eTrain',   r.train);
  setVal('eDist',    r.dist);
  setVal('eDepart',  r.depart);
  setVal('eArrival', r.arrival);
  setVal('eFrom',    r.from);
  setVal('eTo',      r.to);
  setVal('eDayNight',r.dayNight);
  setVal('eAmount',  r.amount);

  const objSel = document.getElementById('eObjective');
  const stdOpts = ['A.C. Manning','Inspection','Training','Office Duty','Rest','Leave'];
  if (stdOpts.includes(r.objective)) {
    objSel.value = r.objective;
    document.getElementById('eCustomRow').style.display = 'none';
  } else {
    objSel.value = 'Custom';
    setVal('eCustomObjective', r.objective);
    document.getElementById('eCustomRow').style.display = 'block';
  }

  // Show editor panel
  const editor = document.getElementById('panel-row-editor');
  editor.style.display = 'block';
  setEl('editorDateLabel', fmtDate(r.date));

  // Scroll editor into view
  editor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function saveRow() {
  if (selectedRowIdx < 0) return;
  const r = journeyRows[selectedRowIdx];

  r.train   = val('eTrain');
  r.dist    = val('eDist');
  r.depart  = val('eDepart');
  r.arrival = val('eArrival');
  r.from    = val('eFrom');
  r.to      = val('eTo');
  r.dayNight= val('eDayNight');
  r.amount  = val('eAmount');

  const objSel = document.getElementById('eObjective');
  r.objective = objSel.value === 'Custom'
    ? val('eCustomObjective')
    : objSel.value;

  renderDocument();

  // Re-apply highlight after render
  setTimeout(() => {
    const rows = document.querySelectorAll('#docTable tbody tr');
    if (rows[selectedRowIdx]) rows[selectedRowIdx].classList.add('row-selected');
  }, 0);

  // Auto-sync to MongoDB
  syncJournalToMongo();

  showToast('✔ Row saved', 'success');
}

function resetRow() {
  if (selectedRowIdx < 0) return;
  const taRate = parseFloat(empData.taRate || 0);
  const r = journeyRows[selectedRowIdx];
  r.train = ''; r.dist = ''; r.depart = ''; r.arrival = '';
  r.from = ''; r.to = '';
  r.dayNight = '100%';
  r.amount   = taRate ? String(taRate) : '';
  r.objective = 'A.C. Manning';
  selectRow(selectedRowIdx);
  renderDocument();
  showToast('Row reset to defaults', 'success');
}

function hideRowEditor() {
  const editor = document.getElementById('panel-row-editor');
  if (editor) editor.style.display = 'none';
  selectedRowIdx = -1;
}

// ══════════════════════════════════════════════
//  CLEAR ALL
// ══════════════════════════════════════════════
function clearAll() {
  if (!confirm('Are you sure you want to clear all rows for this journal?')) return;
  journeyRows = [];
  selectedRowIdx = -1;
  hideRowEditor();
  renderDocument();
  syncJournalToMongo();
  showToast('✔ All rows cleared', 'success');
}

// ══════════════════════════════════════════════
//  SAMPLE DATA
// ══════════════════════════════════════════════
function loadSampleData() {
  // Pre-fill month
  setVal('journalMonth', '2026-08');
  updateToolbar('2026-08');

  // Generate all August 2026 rows
  generateMonthRows();

  // Customise a couple of rows
  if (journeyRows[5]) {
    // 06-08-2026
    Object.assign(journeyRows[5], {
      train:'12500', depart:'12:00', arrival:'', from:'BNRS', to:'', dist:'1200'
    });
  }
  if (journeyRows[6]) {
    // 07-08-2026
    Object.assign(journeyRows[6], {
      train:'12500', depart:'', arrival:'12:00', from:'', to:'PRAYAJ', dist:''
    });
  }

  renderDocument();
  showToast('📋 Sample data loaded!', 'success');
}

// ══════════════════════════════════════════════
//  AUTO-AMOUNT FROM DAY/NIGHT %
// ══════════════════════════════════════════════
function autoAmount() {
  const rate = parseFloat(empData.taRate || 0);
  const pct  = parseFloat(val('eDayNight')) || 0;
  if (rate && pct) setVal('eAmount', ((pct/100)*rate).toFixed(2));
}

// ══════════════════════════════════════════════
//  TA ALLOWANCE AUTO-CALCULATION HELPERS
//  Rules:
//    outward / intermediate leg → dash (–)
//    total absence < 6 hrs      → 30%
//    total absence 6–12 hrs     → 70%
//    total absence ≥ 12 hrs     → 100%
// ══════════════════════════════════════════════

/** Convert "HH:MM" to total minutes from midnight. */
function toMins(t) {
  if (!t || t === '-') return null;
  const parts = t.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || 0, 10);
}

/**
 * Compute the TA allowance for a given calendar date by aggregating
 * absence durations across all journey rows on that date.
 *
 * Rules applied per row segment:
 *  - Row has depart but no arrival  → overnight departure; count (depart → 24:00)
 *  - Row has arrival but no depart  → overnight arrival;  count (00:00 → arrival)
 *  - Row has both depart & arrival  → count (depart → arrival)
 *
 * @param {string} date  "YYYY-MM-DD"
 * @returns {{ pct: string, amount: string }}  e.g. { pct: '70%', amount: '700.00' }
 */
function computeDayAllowance(date) {
  const taRate = parseFloat(empData.taRate || 0);
  let totalMins = 0;

  journeyRows.forEach(r => {
    if (r.date !== date) return;
    // Skip non-duty rows
    if (!r.depart && !r.arrival) return;

    const deptMins = r.depart  ? toMins(r.depart)  : null;
    const arrMins  = r.arrival ? toMins(r.arrival) : null;

    if (deptMins !== null && arrMins !== null) {
      // Same-day segment: depart → arrival
      const diff = arrMins - deptMins;
      if (diff > 0) totalMins += diff;
    } else if (deptMins !== null && arrMins === null) {
      // Overnight departure: count from depart to end of day (1440 mins)
      totalMins += (1440 - deptMins);
    } else if (deptMins === null && arrMins !== null) {
      // Overnight arrival: count from midnight to arrival
      totalMins += arrMins;
    }
  });

  let pct, amount;
  if (totalMins < 360) {
    // Less than 6 hours
    pct    = '30%';
    amount = taRate ? (taRate * 0.30).toFixed(2) : '';
  } else if (totalMins < 720) {
    // 6 hours to less than 12 hours
    pct    = '70%';
    amount = taRate ? (taRate * 0.70).toFixed(2) : '';
  } else {
    // 12 hours or more
    pct    = '100%';
    amount = taRate ? String(taRate) : '';
  }

  return { pct, amount };
}

/**
 * Rebalance the Day/Night % and Amount for all journey rows on a given date.
 *
 * - Rows with no journey data (rest/leave/blank) are left untouched.
 * - All journey rows except the LAST one on the date → dash (outward leg).
 * - The LAST journey row on the date → receives the computed allowance.
 *
 * "Journey rows" = rows that have at least a depart or arrival time filled.
 *
 * @param {string} date  "YYYY-MM-DD"
 */
function rebalanceDayAllowances(date) {
  // Collect indices of journey rows on this date (sorted by array position = insertion order)
  const journeyIndices = [];
  journeyRows.forEach((r, i) => {
    if (r.date === date && (r.depart || r.arrival)) {
      journeyIndices.push(i);
    }
  });

  if (!journeyIndices.length) return;

  // All but the last → dash (outward / intermediate leg)
  for (let k = 0; k < journeyIndices.length - 1; k++) {
    const idx = journeyIndices[k];
    journeyRows[idx].dayNight = '';
    journeyRows[idx].amount   = '';
  }

  // Last journey row → compute and assign the day's allowance
  const lastIdx        = journeyIndices[journeyIndices.length - 1];
  const { pct, amount } = computeDayAllowance(date);
  journeyRows[lastIdx].dayNight = pct;
  journeyRows[lastIdx].amount   = amount;
}

// ══════════════════════════════════════════════
//  DOM READY – WIRE UP EVENTS
// ══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

  // Load employee data from localStorage
  loadFromLocalStorage();

  // Edit Profile
  document.getElementById('btnEditProfile')?.addEventListener('click', () => {
    window.location.href = 'login.html';
  });

  // Generate month rows (async – may restore from MongoDB)
  document.getElementById('btnGenerateMonth')?.addEventListener('click', generateMonthRows);

  // Journal month change → update toolbar label only (don't auto-generate to avoid data loss)
  document.getElementById('journalMonth')?.addEventListener('change', function() {
    updateToolbar(this.value);
  });

  // Row editor – save / reset / close
  document.getElementById('btnSaveRow')?.addEventListener('click', saveRow);
  document.getElementById('btnClearRow')?.addEventListener('click', resetRow);
  document.getElementById('btnCloseEditor')?.addEventListener('click', () => {
    hideRowEditor();
    document.querySelectorAll('#docTable tbody tr').forEach(tr => tr.classList.remove('row-selected'));
  });

  // Custom objective toggle in editor
  document.getElementById('eObjective')?.addEventListener('change', function() {
    document.getElementById('eCustomRow').style.display =
      this.value === 'Custom' ? 'block' : 'none';
  });

  // Auto-amount when day/night % changes in editor
  document.getElementById('eDayNight')?.addEventListener('change', autoAmount);

  // Actions
  document.getElementById('btnClearAll')?.addEventListener('click', clearAll);
  document.getElementById('btnLoadSample')?.addEventListener('click', loadSampleData);

  const doPrint = () => window.print();
  document.getElementById('btnPrint')?.addEventListener('click', doPrint);
  document.getElementById('btnPrintTop')?.addEventListener('click', doPrint);

  // ── Ensure JS-applied mobile scaling transforms don't leak into print ──
  // CSS uses !important to override, but inline styles can still cause issues
  // in some browsers. Clean them up explicitly around print.
  function stripScaleForPrint() {
    const scaler = document.getElementById('ta-document-scaler');
    const doc    = document.getElementById('ta-document');
    if (scaler) {
      scaler._savedStyle = scaler.style.cssText;
      scaler.style.cssText = '';
    }
    if (doc) {
      doc._savedStyle = doc.style.cssText;
      doc.style.cssText = '';
    }
  }

  function restoreScaleAfterPrint() {
    const scaler = document.getElementById('ta-document-scaler');
    const doc    = document.getElementById('ta-document');
    if (scaler && scaler._savedStyle !== undefined) {
      scaler.style.cssText = scaler._savedStyle;
      delete scaler._savedStyle;
    }
    if (doc && doc._savedStyle !== undefined) {
      doc.style.cssText = doc._savedStyle;
      delete doc._savedStyle;
    }
  }

  window.addEventListener('beforeprint', stripScaleForPrint);
  window.addEventListener('afterprint', restoreScaleAfterPrint);

  // ══════════════════════════════════════════════
  //  TOOLBAR MONTH / YEAR SELECTS
  // ══════════════════════════════════════════════
  const selM = document.getElementById('selToolbarMonth');
  const selY = document.getElementById('selToolbarYear');

  function onToolbarMonthYearChange() {
    const m = selM?.value;
    const y = selY?.value;
    if (m && y) {
      const monthStr = `${y}-${m}`;
      setVal('journalMonth', monthStr);
      generateMonthRows();
    }
  }

  selM?.addEventListener('change', onToolbarMonthYearChange);
  selY?.addEventListener('change', onToolbarMonthYearChange);

  // ══════════════════════════════════════════════
  //  SIDEBAR TOGGLE (hamburger ☰ & header toggle)
  // ══════════════════════════════════════════════
  const sidebar         = document.getElementById('sidebar');
  const toggleBtnHeader = document.getElementById('btnToggleSidebarHeader');
  const toggleBtn       = document.getElementById('btnToggleSidebar');
  const backdrop        = document.getElementById('sidebar-backdrop');

  function setSidebarOpen(open) {
    const isCurrentlyHidden = sidebar.classList.contains('sidebar-hidden');
    const shouldOpen = typeof open === 'boolean' ? open : isCurrentlyHidden;

    if (shouldOpen) {
      // Show sidebar
      sidebar.classList.remove('sidebar-hidden');
      toggleBtnHeader?.setAttribute('aria-expanded', 'true');
      toggleBtn?.setAttribute('aria-expanded', 'true');
      backdrop?.classList.add('active');
    } else {
      // Hide sidebar
      sidebar.classList.add('sidebar-hidden');
      toggleBtnHeader?.setAttribute('aria-expanded', 'false');
      toggleBtn?.setAttribute('aria-expanded', 'false');
      backdrop?.classList.remove('active');
    }
  }

  toggleBtnHeader?.addEventListener('click', () => setSidebarOpen(false));
  toggleBtn?.addEventListener('click', () => setSidebarOpen());
  backdrop?.addEventListener('click', () => setSidebarOpen(false));

  // Auto-scale live preview on resize / orientation change
  window.addEventListener('resize', updatePreviewScale);
  window.addEventListener('orientationchange', updatePreviewScale);
  updatePreviewScale();

  // Escape key – close sheet first, then sidebar
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.getElementById('entry-overlay')?.classList.contains('active')) {
        closeEntrySheet(); return;
      }
      if (!sidebar.classList.contains('sidebar-hidden')) setSidebarOpen(false);
    }
  });

  // ══════════════════════════════════════════════
  //  FAB + ENTRY SHEET & TABS
  // ══════════════════════════════════════════════
  const fabBtn       = document.getElementById('fab-add');
  const entryOverlay = document.getElementById('entry-overlay');
  const entryClose   = document.getElementById('btnCloseSheet');
  const entryForm    = document.getElementById('entryForm');

  const tabClaim          = document.getElementById('tabClaim');
  const tabNoClaim        = document.getElementById('tabNoClaim');
  const formClaimFields   = document.getElementById('formClaimFields');
  const formNoClaimFields = document.getElementById('formNoClaimFields');
  let activeTab           = 'claim';

  function switchTab(mode) {
    activeTab = mode;
    if (mode === 'claim') {
      tabClaim?.classList.add('active');
      tabNoClaim?.classList.remove('active');
      if (formClaimFields) formClaimFields.style.display = 'block';
      if (formNoClaimFields) formNoClaimFields.style.display = 'none';
      document.getElementById('ef-depart-dt')?.setAttribute('required', '');
      document.getElementById('ef-noclaim-from-date')?.removeAttribute('required');
    } else {
      tabNoClaim?.classList.add('active');
      tabClaim?.classList.remove('active');
      if (formClaimFields) formClaimFields.style.display = 'none';
      if (formNoClaimFields) formNoClaimFields.style.display = 'block';
      document.getElementById('ef-depart-dt')?.removeAttribute('required');
      document.getElementById('ef-noclaim-from-date')?.setAttribute('required', '');
    }
  }

  tabClaim?.addEventListener('click', () => switchTab('claim'));
  tabNoClaim?.addEventListener('click', () => switchTab('noclaim'));

  function openEntrySheet() {
    entryOverlay?.classList.add('active');
    fabBtn?.classList.add('open');
    entryOverlay?.setAttribute('aria-hidden', 'false');
    // Focus first field after animation
    setTimeout(() => {
      if (activeTab === 'claim') {
        document.getElementById('ef-train')?.focus();
      } else {
        document.getElementById('ef-noclaim-from-date')?.focus();
      }
    }, 380);
  }

  function closeEntrySheet() {
    entryOverlay?.classList.remove('active');
    fabBtn?.classList.remove('open');
    entryOverlay?.setAttribute('aria-hidden', 'true');
  }

  fabBtn?.addEventListener('click', openEntrySheet);
  entryClose?.addEventListener('click', closeEntrySheet);

  // Tap backdrop to close
  entryOverlay?.addEventListener('click', (e) => {
    if (e.target === entryOverlay) closeEntrySheet();
  });

  // Entry form submit – Add Entry (Claim or No Claim)
  entryForm?.addEventListener('submit', async function(e) {
    e.preventDefault();

    if (activeTab === 'claim') {
      const departDt  = document.getElementById('ef-depart-dt').value;  // "YYYY-MM-DDTHH:MM"
      const arrivalDt = document.getElementById('ef-arrival-dt').value;

      if (!departDt) {
        showToast('⚠ Please select a Departure date & time.', 'error');
        document.getElementById('ef-depart-dt').focus();
        return;
      }

      const deptDate  = departDt.split('T')[0];              // YYYY-MM-DD
      const deptTime  = departDt.split('T')[1]?.slice(0,5) || '';  // HH:MM
      const arrDate   = arrivalDt ? arrivalDt.split('T')[0] : '';  // YYYY-MM-DD (may differ)
      const arrTime   = arrivalDt ? (arrivalDt.split('T')[1]?.slice(0,5) || '') : '';
      const month     = deptDate.slice(0, 7);                // YYYY-MM
      const taRate    = parseFloat(empData.taRate || 0);
      const trainNo   = document.getElementById('ef-train').value.trim();
      const fromStn   = document.getElementById('ef-from').value.trim().toUpperCase();
      const toStn     = document.getElementById('ef-to').value.trim().toUpperCase();
      const distVal   = document.getElementById('ef-dist').value.trim();
      const objective = document.getElementById('ef-objective').value;

      // Detect overnight train: departure & arrival on different dates
      const isOvernight = arrDate && arrDate !== deptDate;

      // ── Helper: ensure month rows are loaded ──────────────────────
      async function ensureMonthRows(targetMonth) {
        const currentMonth = val('journalMonth');
        if (journeyRows.length && targetMonth === currentMonth) return;
        setVal('journalMonth', targetMonth);
        updateToolbar(targetMonth);

        const pf = empData.pf;
        let loaded = false;
        if (pf) {
          const saved = await loadJournalFromMongo(pf, targetMonth);
          if (saved && saved.length) { journeyRows = saved; loaded = true; }
        }
        if (!loaded) {
          const numDays = daysInMonth(targetMonth);
          const [y, m] = targetMonth.split('-');
          journeyRows = [];
          for (let d = 1; d <= numDays; d++) {
            const dd = String(d).padStart(2, '0');
            journeyRows.push({
              date: `${y}-${m}-${dd}`,
              train: '', depart: '', arrival: '', from: '', to: '',
              dist: '', dayNight: '100%',
              amount: taRate ? String(taRate) : '',
              objective: 'A.C. Manning',
            });
          }
        }
      }

      await ensureMonthRows(month);

      if (isOvernight) {
        // ── OVERNIGHT TRAIN: split across two rows ────────────────
        // Departure-date row: Train No., Departure time, From station
        const deptData = {
          date:      deptDate,
          train:     trainNo,
          depart:    deptTime,
          arrival:   '',          // no arrival on departure date
          from:      fromStn,
          to:        '',          // no destination yet
          dist:      distVal,
          dayNight:  '',          // will be set by rebalanceDayAllowances
          amount:    '',
          objective: objective,
        };

        const deptRowIdx = journeyRows.findIndex(r => r.date === deptDate);
        if (deptRowIdx >= 0) {
          journeyRows[deptRowIdx] = { ...journeyRows[deptRowIdx], ...deptData };
        } else {
          journeyRows.push(deptData);
        }

        // Auto-calculate allowance for the departure date
        rebalanceDayAllowances(deptDate);

        // Arrival-date row may be in a different month – ensure that month is loaded
        const arrMonth = arrDate.slice(0, 7);
        if (arrMonth !== month) {
          // Save current month rows first, then switch
          await syncJournalToMongo();
          await ensureMonthRows(arrMonth);
        }

        // Arrival-date row: Train No., Arrival time, To station
        const arrData = {
          date:      arrDate,
          train:     trainNo,
          depart:    '',          // departure was on the previous date
          arrival:   arrTime,
          from:      '',          // origin was on the previous date
          to:        toStn,
          dist:      '',          // distance recorded on departure row
          dayNight:  '',          // will be set by rebalanceDayAllowances
          amount:    '',
          objective: objective,
        };

        const arrRowIdx = journeyRows.findIndex(r => r.date === arrDate);
        if (arrRowIdx >= 0) {
          journeyRows[arrRowIdx] = { ...journeyRows[arrRowIdx], ...arrData };
        } else {
          journeyRows.push(arrData);
          journeyRows.sort((a, b) => a.date.localeCompare(b.date));
        }

        // Auto-calculate allowance for the arrival date
        rebalanceDayAllowances(arrDate);

        renderDocument();
        syncJournalToMongo();

        // Scroll to & highlight the departure-date row
        setTimeout(() => {
          const idx = journeyRows.findIndex(r => r.date === deptDate);
          if (idx >= 0) {
            selectRow(idx);
            document.querySelectorAll('#docTable tbody tr')[idx]
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 80);

        this.reset();
        switchTab('claim');
        closeEntrySheet();
        showToast(`✔ Overnight train – split across ${fmtDate(deptDate)} & ${fmtDate(arrDate)}`, 'success');

      } else {
        // ── SAME-DAY JOURNEY: single row ─────────────────────────
        const newData = {
          date:      deptDate,
          train:     trainNo,
          depart:    deptTime,
          arrival:   arrTime,
          from:      fromStn,
          to:        toStn,
          dist:      distVal,
          dayNight:  '',          // will be set by rebalanceDayAllowances
          amount:    '',
          objective: objective,
        };

        const rowIdx = journeyRows.findIndex(r => r.date === deptDate);
        if (rowIdx >= 0) {
          journeyRows[rowIdx] = { ...journeyRows[rowIdx], ...newData };
        } else {
          journeyRows.push(newData);
          journeyRows.sort((a, b) => a.date.localeCompare(b.date));
        }

        // Auto-calculate allowance based on total absence on this date
        rebalanceDayAllowances(deptDate);

        renderDocument();
        syncJournalToMongo();

        // Scroll to and highlight the new row
        setTimeout(() => {
          const idx = journeyRows.findIndex(r => r.date === deptDate);
          if (idx >= 0) {
            selectRow(idx);
            document.querySelectorAll('#docTable tbody tr')[idx]
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 80);

        this.reset();
        switchTab('claim');
        closeEntrySheet();
        showToast('✔ Claim entry added successfully!', 'success');
      }

    } else {
      // ── NO CLAIM SUBMISSION ──
      const fromDateVal = document.getElementById('ef-noclaim-from-date').value; // "YYYY-MM-DD"
      let toDateVal     = document.getElementById('ef-noclaim-to-date').value;   // "YYYY-MM-DD"

      if (!fromDateVal) {
        showToast('⚠ Please select From - Date.', 'error');
        document.getElementById('ef-noclaim-from-date').focus();
        return;
      }
      if (!toDateVal || toDateVal < fromDateVal) {
        toDateVal = fromDateVal;
      }

      const month            = fromDateVal.slice(0, 7); // YYYY-MM
      const noclaimObjective = document.getElementById('ef-noclaim-objective').value;

      // ── If month changed or no rows, generate / load month rows ──
      const currentMonth = val('journalMonth');
      if (!journeyRows.length || month !== currentMonth) {
        setVal('journalMonth', month);
        updateToolbar(month);

        const pf = empData.pf;
        let loaded = false;
        if (pf) {
          const saved = await loadJournalFromMongo(pf, month);
          if (saved && saved.length) { journeyRows = saved; loaded = true; }
        }
        if (!loaded) {
          const taRate = parseFloat(empData.taRate || 0);
          const numDays = daysInMonth(month);
          const [y, m] = month.split('-');
          journeyRows = [];
          for (let d = 1; d <= numDays; d++) {
            const dd = String(d).padStart(2, '0');
            journeyRows.push({
              date: `${y}-${m}-${dd}`,
              train: '', depart: '', arrival: '', from: '', to: '',
              dist: '', dayNight: '100%',
              amount: taRate ? String(taRate) : '',
              objective: 'A.C. Manning',
            });
          }
        }
      }

      // Loop dates from fromDateVal to toDateVal
      const dCurr = new Date(fromDateVal + 'T00:00:00');
      const dEnd  = new Date(toDateVal + 'T00:00:00');
      let updatedCount = 0;

      while (dCurr <= dEnd) {
        const yyyy = dCurr.getFullYear();
        const mm   = String(dCurr.getMonth() + 1).padStart(2, '0');
        const dd   = String(dCurr.getDate()).padStart(2, '0');
        const dStr = `${yyyy}-${mm}-${dd}`;

        const rowIdx = journeyRows.findIndex(r => r.date === dStr);
        const noclaimData = {
          date:      dStr,
          train:     '',
          depart:    '',
          arrival:   '',
          from:      '',
          to:        '',
          dist:      '',
          dayNight:  '',
          amount:    '',
          objective: noclaimObjective,
        };

        if (rowIdx >= 0) {
          journeyRows[rowIdx] = { ...journeyRows[rowIdx], ...noclaimData };
        } else {
          journeyRows.push(noclaimData);
        }
        updatedCount++;

        // Advance by 1 day
        dCurr.setDate(dCurr.getDate() + 1);
      }

      journeyRows.sort((a, b) => a.date.localeCompare(b.date));

      renderDocument();
      syncJournalToMongo();

      setTimeout(() => {
        const idx = journeyRows.findIndex(r => r.date === fromDateVal);
        if (idx >= 0) {
          selectRow(idx);
          document.querySelectorAll('#docTable tbody tr')[idx]
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 80);

      this.reset();
      switchTab('claim');
      closeEntrySheet();
      showToast(`✔ No Claim entry added (${updatedCount} day${updatedCount > 1 ? 's' : ''})`, 'success');
    }
  });

});

