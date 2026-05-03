'use strict';

const STORAGE_KEY = 'laulau-pro';
const UNITS = ['RDC', '1er', '2e', '4e', 'HDJ'];
const DAYS = ['J1', 'J2', 'J3', 'J4'];
const DAY_NAMES_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTH_SHORT = ['jan', 'fév', 'mars', 'avr', 'mai', 'juin', 'jui', 'août', 'sep', 'oct', 'nov', 'déc'];

const SNIPPETS = [
  { id: 'stable', label: 'Stabilité clinique', text: 'Stabilité clinique.' },
];
const SNIPPET_TEXT = Object.fromEntries(SNIPPETS.map(s => [s.id, s.text]));

const OBS_AXES = [
  {
    id: 'contact', title: 'Contact', type: 'radio',
    opts: [
      ['bon', 'Bon contact'],
      ['ret', 'Contact réticent'],
      ['fro', 'Contact froid'],
      ['fam', 'Contact familier'],
      ['etr', 'Contact étrange'],
    ],
  },
  {
    id: 'discours', title: 'Discours', type: 'multi', prefix: 'Discours',
    opts: [
      ['flu', 'Fluide'],
      ['coh', 'Cohérent'],
      ['log', 'Logorrhéique'],
      ['des', 'Désorganisé'],
      ['dif', 'Diffluent'],
      ['pau', 'Pauvre'],
    ],
  },
  {
    id: 'humeur', title: 'Humeur / thymie', type: 'multi', exclusive: 'eut',
    opts: [
      ['eut', 'Euthymie'],
      ['tri', 'Humeur triste'],
      ['ela', `Élation de l'humeur`],
      ['abo', 'Aboulie'],
      ['anh', 'Anhédonie'],
      ['anx', 'Anxiété'],
      ['rum', 'Ruminations anxieuses'],
    ],
  },
  {
    id: 'sommeil', title: 'Sommeil', type: 'multi', exclusive: 'rien',
    opts: [
      ['rien', 'Pas de trouble du sommeil'],
      ['trb', 'Trouble du sommeil'],
      ['end', `Insomnie d'endormissement`],
      ['rev', 'Réveils nocturnes multiples'],
      ['mat', 'Réveil précoce'],
    ],
  },
  {
    id: 'appetit', title: 'Appétit', type: 'radio',
    opts: [
      ['con', 'Appétit conservé'],
      ['hyp', 'Hyporexie'],
      ['hyper', 'Hyperphagie'],
    ],
  },
  {
    id: 'psy', title: 'Symptômes psychotiques', type: 'multi',
    opts: [
      ['del', 'Idées délirantes'],
      ['hal', 'Hallucinations'],
    ],
  },
  {
    id: 'is', title: 'Idées suicidaires', type: 'radio',
    opts: [
      ['no', `Pas d'idées suicidaires`],
      ['yes', 'Idées suicidaires'],
    ],
  },
  {
    id: 'permission', title: 'Demande de permission', type: 'group',
    fields: [
      { id: 'when', label: 'Quand', type: 'radio', opts: [
        ['today', `Aujourd'hui`],
        ['tomorrow', 'Demain'],
        ['weekend', 'Pour le week-end'],
      ]},
      { id: 'resp', label: 'Réponse', type: 'radio', opts: [
        ['ok', 'Acceptée'],
        ['no', 'Refusée'],
      ]},
    ],
    compile: (v) => {
      const w = { today: `aujourd'hui`, tomorrow: 'demain', weekend: 'pour le week-end' }[v.when];
      const r = { ok: 'acceptée', no: 'refusée' }[v.resp];
      if (w && r) return `Demande de permission ${w} : ${r}.`;
      if (w) return `Demande de permission ${w}.`;
      if (r) return `Permission ${r}.`;
      return '';
    },
  },
];

const STATE = {
  startDate: null,
  patients: [],
  view: 'home',
  currentUnit: 'RDC',
  currentPatientId: null,
  currentDayIdx: 0,
  modal: null,
};
let lastViewKey = null;

/* ---------- Persistence ---------- */
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    STATE.startDate = data.startDate || null;
    STATE.patients = (data.patients || []).map(normalizePatient);
  } catch (e) { console.error('load failed', e); }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    startDate: STATE.startDate,
    patients: STATE.patients,
  }));
}
function defaultObs() { return { snippets: [], axes: {}, libre: '', exportText: '' }; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function normalizePatient(p) {
  const obs = {};
  for (const d of DAYS) {
    const raw = p.obs ? p.obs[d] : null;
    if (raw && typeof raw === 'object') {
      const snippets = Array.isArray(raw.snippets)
        ? raw.snippets.filter(s => SNIPPET_TEXT[s])
        : [];
      const axes = {};
      const rawAxes = (raw.axes && typeof raw.axes === 'object') ? raw.axes : {};
      for (const ax of OBS_AXES) {
        const v = rawAxes[ax.id];
        if (ax.type === 'multi') axes[ax.id] = Array.isArray(v) ? v.filter(x => ax.opts.some(o => o[0] === x)) : [];
        else if (ax.type === 'radio') axes[ax.id] = (typeof v === 'string' && ax.opts.some(o => o[0] === v)) ? v : null;
        else if (ax.type === 'group') {
          const gv = (v && typeof v === 'object') ? v : {};
          const out = {};
          for (const f of ax.fields) {
            const fv = gv[f.id];
            if (f.type === 'radio') out[f.id] = (typeof fv === 'string' && f.opts.some(o => o[0] === fv)) ? fv : null;
            else out[f.id] = Array.isArray(fv) ? fv.filter(x => f.opts.some(o => o[0] === x)) : [];
          }
          axes[ax.id] = out;
        }
      }
      obs[d] = { snippets, axes, libre: raw.libre || '', exportText: raw.exportText || '' };
    } else if (typeof raw === 'string' && raw.trim()) {
      const axes = {};
      for (const ax of OBS_AXES) {
        if (ax.type === 'multi') axes[ax.id] = [];
        else if (ax.type === 'radio') axes[ax.id] = null;
        else if (ax.type === 'group') axes[ax.id] = Object.fromEntries(ax.fields.map(f => [f.id, f.type === 'radio' ? null : []]));
      }
      obs[d] = { snippets: [], axes, libre: raw, exportText: '' };
    } else {
      obs[d] = null;
    }
  }
  const toSee = { J1: false, J2: false, J3: false, J4: false };
  if (p.toSee) DAYS.forEach(d => { toSee[d] = !!p.toSee[d]; });
  else if (p.nextVisit && DAYS.includes(p.nextVisit)) toSee[p.nextVisit] = true;
  return {
    id: p.id || uid(),
    unit: p.unit || 'RDC',
    room: p.room || '',
    name: p.name || '',
    sex: p.sex === 'F' ? 'F' : 'M',
    summary: p.summary || '',
    seen: { J1: !!(p.seen && p.seen.J1), J2: !!(p.seen && p.seen.J2),
            J3: !!(p.seen && p.seen.J3), J4: !!(p.seen && p.seen.J4) },
    toSee,
    obs,
    photoIds: Array.isArray(p.photoIds) ? p.photoIds.filter(x => typeof x === 'string') : [],
  };
}

/* ---------- Date logic ---------- */
function dateForDayIdx(idx) {
  if (!STATE.startDate) return null;
  const d = new Date(STATE.startDate + 'T00:00:00');
  d.setDate(d.getDate() + idx);
  return d;
}
function todayDayIdx() {
  if (!STATE.startDate) return -1;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(STATE.startDate + 'T00:00:00');
  return Math.round((today - start) / 86400000);
}
function formatDateShort(d) {
  if (!d) return '';
  return `${DAY_NAMES_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}
function nextMonday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const offset = day === 1 ? 7 : (8 - day) % 7 || 7;
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

/* ---------- Sex agreement ---------- */
function s(sex, masc, fem) { return sex === 'F' ? fem : masc; }

/* ---------- Observation compilation ---------- */
function joinList(arr) {
  if (arr.length === 0) return '';
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return arr[0] + ' et ' + arr[1];
  return arr.slice(0, -1).join(', ') + ' et ' + arr[arr.length - 1];
}
function compileAxis(axis, value) {
  if (axis.type === 'radio') {
    if (!value) return '';
    const opt = axis.opts.find(o => o[0] === value);
    return opt ? opt[1] + '.' : '';
  }
  if (axis.type === 'multi') {
    if (!Array.isArray(value) || value.length === 0) return '';
    const labels = value.map(id => axis.opts.find(o => o[0] === id)).filter(Boolean).map(o => o[1]);
    if (axis.prefix) {
      const lower = labels.map(l => l.charAt(0).toLowerCase() + l.slice(1));
      return axis.prefix + ' ' + joinList(lower) + '.';
    }
    const adjusted = labels.map((l, i) => i === 0 ? l : l.charAt(0).toLowerCase() + l.slice(1));
    return joinList(adjusted) + '.';
  }
  if (axis.type === 'group') {
    if (!value || typeof value !== 'object') return '';
    return axis.compile(value);
  }
  return '';
}
function compileObs(patient, day) {
  const obs = patient.obs[day];
  if (!obs) return '';
  const parts = [];
  for (const id of (obs.snippets || [])) {
    if (SNIPPET_TEXT[id]) parts.push(SNIPPET_TEXT[id]);
  }
  for (const axis of OBS_AXES) {
    const v = obs.axes ? obs.axes[axis.id] : undefined;
    const line = compileAxis(axis, v);
    if (line) parts.push(line);
  }
  const libre = (obs.libre || '').trim();
  if (libre) parts.push(libre);
  return parts.join('\n');
}
function exportTextFor(p, day) {
  const o = p.obs[day];
  if (!o) return '';
  if (o.exportText && o.exportText.trim()) return o.exportText;
  return compileObs(p, day);
}
function hasObsContent(p, day) {
  const o = p.obs[day];
  if (!o) return false;
  if ((o.exportText || '').trim()) return true;
  if ((o.libre || '').trim()) return true;
  if ((o.snippets || []).length > 0) return true;
  if (o.axes) {
    for (const ax of OBS_AXES) {
      const v = o.axes[ax.id];
      if (ax.type === 'multi' && Array.isArray(v) && v.length > 0) return true;
      if (ax.type === 'radio' && v) return true;
      if (ax.type === 'group' && v && typeof v === 'object') {
        for (const f of ax.fields) {
          const fv = v[f.id];
          if (f.type === 'radio' && fv) return true;
          if (f.type === 'multi' && Array.isArray(fv) && fv.length > 0) return true;
        }
      }
    }
  }
  return false;
}

/* ---------- Render orchestration ---------- */
function render() {
  revokeAllURLs();
  const sy = window.scrollY;
  const oldModal = document.getElementById('modal-bg');
  if (oldModal) oldModal.remove();
  const root = document.getElementById('app');
  const viewKey = `${STATE.view}|${STATE.currentPatientId || ''}|${STATE.currentDayIdx}`;
  if (!STATE.startDate) {
    root.innerHTML = renderSetup();
    bindSetup();
    lastViewKey = viewKey;
    return;
  }
  if (STATE.view === 'patient') {
    root.innerHTML = renderHeader() + renderPatientDetail();
    bindPatientDetail();
  } else if (STATE.view === 'export') {
    root.innerHTML = renderHeader() + renderExport();
    bindExport();
  } else {
    root.innerHTML = renderHeader() + renderHome();
    bindHome();
  }
  if (STATE.modal) renderModal();
  if (viewKey === lastViewKey) window.scrollTo(0, sy);
  else window.scrollTo(0, 0);
  lastViewKey = viewKey;
}

/* ---------- Setup ---------- */
function renderSetup() {
  return `
    <div class="setup">
      <h2>Bienvenue 👋</h2>
      <p>Première utilisation. Quelle est la date du <strong>premier jour</strong> de votre remplacement ?</p>
      <label for="start">Date de début (J1)</label>
      <input type="date" id="start" value="${nextMonday()}">
      <button class="btn btn-primary btn-block" id="setup-go">Commencer</button>
    </div>
  `;
}
function bindSetup() {
  document.getElementById('setup-go').addEventListener('click', () => {
    const v = document.getElementById('start').value;
    if (!v) { toast('Choisis une date'); return; }
    STATE.startDate = v;
    save(); render();
  });
}

/* ---------- Header ---------- */
function renderHeader() {
  const idx = todayDayIdx();
  let badge;
  if (idx < 0) badge = `<span class="day-badge idle">Démarre ${formatDateShort(dateForDayIdx(0))}</span>`;
  else if (idx > 3) badge = `<span class="day-badge idle">Rempla terminé</span>`;
  else badge = `<span class="day-badge">${DAYS[idx]} · ${formatDateShort(dateForDayIdx(idx))}</span>`;
  return `<div class="header"><h1>Laulau <span class="accent">Pro</span></h1>${badge}</div>`;
}

/* ---------- Home ---------- */
function renderHome() {
  const idxToday = todayDayIdx();
  const counts = UNITS.reduce((acc, u) => { acc[u] = STATE.patients.filter(p => p.unit === u).length; return acc; }, {});
  const tabs = UNITS.map(u => `
    <div class="unit-tab ${u === STATE.currentUnit ? 'active' : ''}" data-unit="${u}">
      <span>${u}</span><span class="count">${counts[u]} pt${counts[u] > 1 ? 's' : ''}</span>
    </div>`).join('');
  const patients = STATE.patients
    .filter(p => p.unit === STATE.currentUnit)
    .sort((a, b) => a.room.localeCompare(b.room, 'fr', { numeric: true }));
  const list = patients.length === 0
    ? `<div class="empty">Aucun patient dans cette unité.<br><br><button class="btn btn-primary" id="add-empty">+ Ajouter un patient</button></div>`
    : `<div class="patient-list">${patients.map(p => renderPatientCard(p, idxToday)).join('')}</div>`;
  return `
    <div class="unit-tabs">${tabs}</div>
    <div class="toolbar">
      <div class="toolbar-left"><button class="btn btn-primary" id="btn-add">+ Ajouter patient</button></div>
      <div class="toolbar-right"><button class="btn btn-ghost" id="btn-export">📋 Export du jour</button></div>
    </div>
    ${list}
  `;
}

function renderPatientCard(p, idxToday) {
  const checks = DAYS.map((d, i) => {
    const isSeen = p.seen[d];
    const isToSee = p.toSee[d] && !isSeen;
    const isToday = i === idxToday;
    return `<button class="day-check ${isSeen ? 'checked' : ''} ${isToSee ? 'tosee' : ''} ${isToday ? 'today' : ''}" data-toggle="${p.id}" data-day="${d}">
      <span class="check">${isSeen ? '✓' : (isToSee ? '●' : '')}</span>${d}
    </button>`;
  }).join('');
  const toSeeChips = DAYS.map(d =>
    `<button class="chip chip-tosee ${p.toSee[d] ? 'active' : ''}" data-tosee="${p.id}" data-day="${d}">${d}</button>`
  ).join('');
  const todayKey = (idxToday >= 0 && idxToday <= 3) ? DAYS[idxToday] : null;
  const obsBadge = todayKey && hasObsContent(p, todayKey) ? `<small>📝 obs en cours</small>` : '';
  const sexBadge = p.sex === 'F' ? '♀' : '♂';
  const summaryLine = p.summary ? `<div class="summary">${escapeHtml(p.summary)}</div>` : '';
  const photoCount = (p.photoIds || []).length;
  const photoBtn = photoCount > 0 ? `<button class="photo-badge" data-photo-open="${p.id}" title="Voir les photos">📷 ${photoCount}</button>` : '';
  return `
    <div class="patient-card">
      <div class="patient-room">${escapeHtml(p.room)}</div>
      <div class="patient-name" data-open="${p.id}">
        ${escapeHtml(p.name)} <span class="sex-mini">${sexBadge}</span>
        ${obsBadge}
      </div>
      <div class="patient-actions">
        ${photoBtn}
        <button class="icon-btn" data-edit="${p.id}" title="Modifier">✎</button>
        <button class="icon-btn" data-delete="${p.id}" title="Supprimer">🗑</button>
      </div>
      ${summaryLine ? `<div class="summary-row">${summaryLine}</div>` : ''}
      <div class="patient-row-2">
        <div class="day-checks">${checks}</div>
        <div class="tosee-row"><span class="muted-label">À voir&nbsp;:</span><div class="chip-group chip-group-mini">${toSeeChips}</div></div>
      </div>
    </div>`;
}

function bindHome() {
  document.querySelectorAll('.unit-tab').forEach(el => {
    el.addEventListener('click', () => { STATE.currentUnit = el.dataset.unit; render(); });
  });
  const addBtn = document.getElementById('btn-add');
  if (addBtn) addBtn.addEventListener('click', () => openAddPatient());
  const addEmpty = document.getElementById('add-empty');
  if (addEmpty) addEmpty.addEventListener('click', () => openAddPatient());
  const exportBtn = document.getElementById('btn-export');
  if (exportBtn) exportBtn.addEventListener('click', () => { STATE.view = 'export'; render(); });

  document.querySelectorAll('[data-toggle]').forEach(el => {
    el.addEventListener('click', () => {
      const p = STATE.patients.find(x => x.id === el.dataset.toggle);
      if (!p) return;
      p.seen[el.dataset.day] = !p.seen[el.dataset.day];
      save(); render();
    });
  });
  document.querySelectorAll('[data-tosee]').forEach(el => {
    el.addEventListener('click', () => {
      const p = STATE.patients.find(x => x.id === el.dataset.tosee);
      if (!p) return;
      const d = el.dataset.day;
      p.toSee[d] = !p.toSee[d];
      save(); render();
    });
  });
  document.querySelectorAll('[data-open]').forEach(el => {
    el.addEventListener('click', () => {
      STATE.currentPatientId = el.dataset.open;
      const idx = todayDayIdx();
      STATE.currentDayIdx = (idx >= 0 && idx <= 3) ? idx : 0;
      STATE.view = 'patient';
      render();
    });
  });
  document.querySelectorAll('[data-edit]').forEach(el => {
    el.addEventListener('click', () => openEditPatient(el.dataset.edit));
  });
  document.querySelectorAll('[data-delete]').forEach(el => {
    el.addEventListener('click', () => {
      const p = STATE.patients.find(x => x.id === el.dataset.delete);
      if (!p) return;
      if (confirm(`Supprimer ${p.name} (ch. ${p.room}) ?`)) {
        for (const id of (p.photoIds || [])) deletePhotoFromDB(id).catch(() => {});
        STATE.patients = STATE.patients.filter(x => x.id !== p.id);
        save(); render();
      }
    });
  });
  document.querySelectorAll('[data-photo-open]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const p = STATE.patients.find(x => x.id === el.dataset.photoOpen);
      if (!p || !p.photoIds || p.photoIds.length === 0) return;
      openLightbox(p, p.photoIds[0]);
    });
  });
}

/* ---------- Patient modal ---------- */
function openAddPatient() {
  STATE.modal = { kind: 'patient', patient: { id: null, unit: STATE.currentUnit, room: '', name: '', sex: 'M', summary: '' } };
  render();
}
function openEditPatient(id) {
  const p = STATE.patients.find(x => x.id === id);
  if (!p) return;
  STATE.modal = { kind: 'patient', patient: { id: p.id, unit: p.unit, room: p.room, name: p.name, sex: p.sex, summary: p.summary || '' } };
  render();
}
function closeModal() { STATE.modal = null; render(); }

function renderModal() {
  const m = STATE.modal;
  if (!m) return;
  const wrap = document.createElement('div');
  wrap.className = 'modal-bg';
  wrap.id = 'modal-bg';
  if (m.kind === 'patient') {
    const p = m.patient;
    const isEdit = !!p.id;
    wrap.innerHTML = `
      <div class="modal" role="dialog">
        <h3>${isEdit ? 'Modifier le patient' : 'Nouveau patient'}</h3>
        <div class="field">
          <label>Unité</label>
          <select id="m-unit">
            ${UNITS.map(u => `<option value="${u}" ${u === p.unit ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Sexe</label>
          <div class="chip-group">
            <button type="button" class="chip ${p.sex === 'M' ? 'active' : ''}" data-modal-sex="M">M</button>
            <button type="button" class="chip ${p.sex === 'F' ? 'active' : ''}" data-modal-sex="F">F</button>
          </div>
        </div>
        <div class="field">
          <label>N° de chambre</label>
          <input id="m-room" type="text" inputmode="numeric" value="${escapeAttr(p.room)}" placeholder="ex. 214">
        </div>
        <div class="field">
          <label>Nom</label>
          <input id="m-name" type="text" value="${escapeAttr(p.name)}" placeholder="ex. M. Dupont">
        </div>
        <div class="field">
          <label>Résumé clinique <span class="muted-label">(visible sur la liste)</span></label>
          <textarea id="m-summary" rows="3" placeholder="ex. EDM sévère, IS, sertraline 100mg + lithium 800mg, ECT en cours">${escapeAttr(p.summary || '')}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" id="m-cancel">Annuler</button>
          <button class="btn btn-primary" id="m-save">${isEdit ? 'Enregistrer' : 'Ajouter'}</button>
        </div>
      </div>`;
  }
  document.body.appendChild(wrap);
  wrap.addEventListener('click', e => { if (e.target === wrap) closeModal(); });
  wrap.querySelectorAll('[data-modal-sex]').forEach(b => {
    b.addEventListener('click', () => {
      STATE.modal.patient.sex = b.dataset.modalSex;
      wrap.querySelectorAll('[data-modal-sex]').forEach(x => x.classList.toggle('active', x.dataset.modalSex === b.dataset.modalSex));
    });
  });
  document.getElementById('m-cancel').addEventListener('click', closeModal);
  document.getElementById('m-save').addEventListener('click', () => {
    const unit = document.getElementById('m-unit').value;
    const room = document.getElementById('m-room').value.trim();
    const name = document.getElementById('m-name').value.trim();
    const summary = document.getElementById('m-summary').value.trim();
    const sex = STATE.modal.patient.sex || 'M';
    if (!name) { toast('Nom requis'); return; }
    const mp = STATE.modal.patient;
    if (mp.id) {
      const p = STATE.patients.find(x => x.id === mp.id);
      if (p) { p.unit = unit; p.room = room; p.name = name; p.sex = sex; p.summary = summary; }
    } else {
      STATE.patients.push(normalizePatient({ unit, room, name, sex, summary }));
      STATE.currentUnit = unit;
    }
    save();
    STATE.modal = null;
    render();
  });
  setTimeout(() => { const el = document.getElementById('m-name'); if (el && !el.value) el.focus(); }, 50);
}

/* ---------- Patient detail ---------- */
function ensureObs(p, day) {
  if (!p.obs[day]) p.obs[day] = defaultObs();
  const o = p.obs[day];
  if (!Array.isArray(o.snippets)) o.snippets = [];
  if (typeof o.libre !== 'string') o.libre = '';
  if (typeof o.exportText !== 'string') o.exportText = '';
  if (!o.axes || typeof o.axes !== 'object') o.axes = {};
  for (const ax of OBS_AXES) {
    if (ax.type === 'multi' && !Array.isArray(o.axes[ax.id])) o.axes[ax.id] = [];
    if (ax.type === 'radio' && o.axes[ax.id] === undefined) o.axes[ax.id] = null;
    if (ax.type === 'group') {
      if (!o.axes[ax.id] || typeof o.axes[ax.id] !== 'object') o.axes[ax.id] = {};
      for (const f of ax.fields) {
        if (f.type === 'radio' && o.axes[ax.id][f.id] === undefined) o.axes[ax.id][f.id] = null;
        if (f.type === 'multi' && !Array.isArray(o.axes[ax.id][f.id])) o.axes[ax.id][f.id] = [];
      }
    }
  }
  return o;
}

function renderPatientDetail() {
  const p = STATE.patients.find(x => x.id === STATE.currentPatientId);
  if (!p) { STATE.view = 'home'; return ''; }
  const dayIdx = STATE.currentDayIdx;
  const day = DAYS[dayIdx];
  const obs = ensureObs(p, day);
  const sex = p.sex || 'M';

  const dayTabs = DAYS.map((d, i) => {
    const dt = dateForDayIdx(i);
    return `<button class="day-tab ${i === dayIdx ? 'active' : ''}" data-day-idx="${i}">${d}<small>${dt ? formatDateShort(dt) : ''}</small></button>`;
  }).join('');

  const seenLabel = p.seen[day] ? `✓ ${s(sex, 'Vu', 'Vue')}` : `Marquer comme ${s(sex, 'vu', 'vue')}`;
  const detailToSeeChips = DAYS.map(d =>
    `<button class="chip chip-tosee ${p.toSee[d] ? 'active' : ''}" data-detail-tosee="${d}">${d}</button>`
  ).join('');

  const sexToggle = `
    <div class="inline-sex">
      <span class="muted-label">Sexe :</span>
      <button class="chip ${sex === 'M' ? 'active' : ''}" data-sex="M">M</button>
      <button class="chip ${sex === 'F' ? 'active' : ''}" data-sex="F">F</button>
    </div>`;

  const snippetChips = SNIPPETS.map(sn =>
    `<button class="chip ${(obs.snippets || []).includes(sn.id) ? 'active' : ''}" data-snippet="${sn.id}">${sn.label}</button>`
  ).join('');

  const axesHTML = OBS_AXES.map(ax => {
    const v = obs.axes[ax.id];
    if (ax.type === 'group') {
      const groupVal = v || {};
      const subRows = ax.fields.map(f => {
        const fv = groupVal[f.id];
        const chips = f.opts.map(([id, label]) => {
          const active = f.type === 'radio' ? (fv === id) : (Array.isArray(fv) && fv.includes(id));
          return `<button class="chip ${active ? 'active' : ''}" data-obs-axis="${ax.id}" data-obs-field="${f.id}" data-opt="${id}">${escapeHtml(label)}</button>`;
        }).join('');
        return `<div class="axis-sub-row"><span class="axis-sub-label">${f.label}</span><div class="chip-group">${chips}</div></div>`;
      }).join('');
      return `<div class="axis-mini"><div class="axis-mini-title">${ax.title}</div>${subRows}</div>`;
    }
    const chips = ax.opts.map(([id, label]) => {
      const active = ax.type === 'radio' ? (v === id) : (Array.isArray(v) && v.includes(id));
      return `<button class="chip ${active ? 'active' : ''}" data-obs-axis="${ax.id}" data-opt="${id}">${escapeHtml(label)}</button>`;
    }).join('');
    return `<div class="axis-mini"><div class="axis-mini-title">${ax.title}</div><div class="chip-group">${chips}</div></div>`;
  }).join('');

  const isOverridden = !!(obs.exportText && obs.exportText.trim());
  const previewText = exportTextFor(p, day);

  return `
    <div class="detail-header">
      <button class="back-btn" id="back">←</button>
      <div class="detail-title">
        <h2>${escapeHtml(p.name)}</h2>
        <small>${p.unit} · Chambre ${escapeHtml(p.room)}</small>
      </div>
    </div>

    <div class="detail-card">
      <h3>Jour</h3>
      <div class="day-tabs">${dayTabs}</div>
      <div class="status-row">
        <button class="btn ${p.seen[day] ? 'btn-primary' : 'btn-outline'}" id="toggle-seen">${seenLabel}</button>
        ${sexToggle}
      </div>
      <div class="status-row" style="margin-top:10px;">
        <span class="muted-label">À voir&nbsp;:</span>
        <div class="chip-group chip-group-mini">${detailToSeeChips}</div>
      </div>
    </div>

    ${p.summary ? `<div class="detail-card summary-card"><h3>Résumé clinique</h3><div class="summary-text">${escapeHtml(p.summary)}</div></div>` : ''}

    <div class="detail-card">
      <h3>Photos (${(p.photoIds || []).length})</h3>
      <div class="photo-grid" id="patient-photos"></div>
      <button class="btn btn-outline btn-sm" id="add-photo">+ Ajouter une photo</button>
      <input type="file" accept="image/*" multiple id="photo-input" style="display:none">
      <div class="muted-label">Documents uniquement, stockées localement sur l'iPad. Recadrage proposé à l'ajout.</div>
    </div>

    <div class="detail-card">
      <h3>Observation ${day}</h3>
      <div class="snippet-row">${snippetChips}</div>
      <div class="axes-grid">${axesHTML}</div>
      <textarea id="libre" class="libre-text obs-libre" placeholder="Texte libre (clavier ou stylet via Apple Scribble)…">${escapeHtml(obs.libre || '')}</textarea>
      <div class="muted-label">Active Apple Scribble dans Réglages → Apple Pencil pour écrire au stylet.</div>
    </div>

    <div class="detail-card preview-card">
      <h3>Aperçu (export ${day}) ${isOverridden ? '<span class="muted-label">· modifié manuellement</span>' : ''}</h3>
      <textarea id="export-preview" class="obs-preview-edit">${escapeHtml(previewText)}</textarea>
      ${isOverridden ? `<button class="btn btn-outline btn-sm" id="regen">↻ Régénérer depuis les cases</button>` : `<div class="muted-label">Tu peux modifier directement ce texte ; tes modifs prennent le pas sur les cases pour l'export.</div>`}
    </div>
  `;
}

function bindPatientDetail() {
  const p = STATE.patients.find(x => x.id === STATE.currentPatientId);
  if (!p) return;
  const day = DAYS[STATE.currentDayIdx];
  const obs = ensureObs(p, day);

  document.getElementById('back').addEventListener('click', () => { STATE.view = 'home'; render(); });
  document.querySelectorAll('[data-day-idx]').forEach(el => {
    el.addEventListener('click', () => { STATE.currentDayIdx = parseInt(el.dataset.dayIdx, 10); render(); });
  });
  document.getElementById('toggle-seen').addEventListener('click', () => {
    p.seen[day] = !p.seen[day]; save(); render();
  });
  document.querySelectorAll('[data-detail-tosee]').forEach(el => {
    el.addEventListener('click', () => {
      const d = el.dataset.detailTosee;
      p.toSee[d] = !p.toSee[d];
      save(); render();
    });
  });
  document.querySelectorAll('[data-sex]').forEach(el => {
    el.addEventListener('click', () => { p.sex = el.dataset.sex; save(); render(); });
  });

  document.querySelectorAll('[data-snippet]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.snippet;
      const arr = obs.snippets;
      const i = arr.indexOf(id);
      if (i >= 0) arr.splice(i, 1); else arr.push(id);
      save(); render();
    });
  });

  document.querySelectorAll('[data-obs-axis][data-opt]').forEach(el => {
    el.addEventListener('click', () => {
      const axisId = el.dataset.obsAxis;
      const optId = el.dataset.opt;
      const fieldId = el.dataset.obsField;
      const axis = OBS_AXES.find(a => a.id === axisId);
      if (!axis) return;
      if (axis.type === 'group' && fieldId) {
        const field = axis.fields.find(f => f.id === fieldId);
        if (!field) return;
        const gv = obs.axes[axisId] || (obs.axes[axisId] = {});
        if (field.type === 'radio') {
          gv[fieldId] = (gv[fieldId] === optId) ? null : optId;
        } else {
          let arr = Array.isArray(gv[fieldId]) ? gv[fieldId].slice() : [];
          if (arr.includes(optId)) arr = arr.filter(x => x !== optId);
          else arr.push(optId);
          gv[fieldId] = arr;
        }
      } else if (axis.type === 'radio') {
        obs.axes[axisId] = (obs.axes[axisId] === optId) ? null : optId;
      } else if (axis.type === 'multi') {
        let arr = Array.isArray(obs.axes[axisId]) ? obs.axes[axisId].slice() : [];
        const exclusive = axis.exclusive;
        if (exclusive && optId === exclusive) {
          arr = arr.includes(exclusive) ? [] : [exclusive];
        } else {
          if (arr.includes(optId)) arr = arr.filter(x => x !== optId);
          else { if (exclusive) arr = arr.filter(x => x !== exclusive); arr.push(optId); }
        }
        obs.axes[axisId] = arr;
      }
      save(); render();
    });
  });

  const pv = document.getElementById('export-preview');
  if (pv) {
    let t;
    pv.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { obs.exportText = pv.value; save(); }, 250);
    });
    pv.addEventListener('blur', () => { obs.exportText = pv.value; save(); });
  }
  const regen = document.getElementById('regen');
  if (regen) regen.addEventListener('click', () => {
    obs.exportText = '';
    save(); render();
  });

  const libre = document.getElementById('libre');
  if (libre) {
    let t;
    libre.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        obs.libre = libre.value;
        save();
        const preview = document.getElementById('obs-preview');
        if (preview) preview.textContent = compileObs(p, day);
      }, 250);
    });
    libre.addEventListener('blur', () => {
      obs.libre = libre.value; save();
    });
  }

  const photoInput = document.getElementById('photo-input');
  const addPhoto = document.getElementById('add-photo');
  if (addPhoto && photoInput) {
    addPhoto.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', async () => {
      const files = Array.from(photoInput.files || []);
      photoInput.value = '';
      for (const f of files) await addPhotoFlow(p, f);
      render();
    });
  }
  const photoGrid = document.getElementById('patient-photos');
  if (photoGrid && p.photoIds && p.photoIds.length > 0) {
    loadThumbsInto(photoGrid, p.photoIds, (id) => openLightbox(p, id));
  }
}

/* ---------- Export ---------- */
function buildExportText(dayIdx) {
  const day = DAYS[dayIdx];
  const dt = dateForDayIdx(dayIdx);
  const header = `Observations du ${formatDateShort(dt)} (${day})\n${'='.repeat(40)}\n`;
  const byUnit = {};
  STATE.patients.forEach(p => {
    if (!hasObsContent(p, day)) return;
    if (!byUnit[p.unit]) byUnit[p.unit] = [];
    byUnit[p.unit].push(p);
  });
  let body = '';
  let count = 0;
  UNITS.forEach(u => {
    if (!byUnit[u]) return;
    body += `\n— ${u} —\n\n`;
    byUnit[u]
      .sort((a, b) => a.room.localeCompare(b.room, 'fr', { numeric: true }))
      .forEach(p => {
        body += `Chambre ${p.room} · ${p.name} (${p.sex || 'M'})\n`;
        body += `${exportTextFor(p, day).trim()}\n\n`;
        count++;
      });
  });
  if (count === 0) body = '\n(Aucune observation rédigée pour ce jour.)\n';
  return { text: header + body, count };
}

function renderExport() {
  const idx = todayDayIdx();
  const startIdx = (idx >= 0 && idx <= 3) ? idx : 0;
  const dayBtns = DAYS.map((d, i) => {
    const dt = dateForDayIdx(i);
    return `<button class="day-tab ${i === startIdx ? 'active' : ''}" data-export-day="${i}">${d}<small>${formatDateShort(dt)}</small></button>`;
  }).join('');
  const { text, count } = buildExportText(startIdx);
  return `
    <div class="detail-header">
      <button class="back-btn" id="back">←</button>
      <div class="detail-title">
        <h2>Export des observations</h2>
        <small>Copie le texte puis colle-le dans ton mail</small>
      </div>
    </div>
    <div class="detail-card">
      <h3>Jour à exporter</h3>
      <div class="day-tabs" id="export-day-tabs">${dayBtns}</div>
      <div class="muted-label" id="export-count">${count} observation${count > 1 ? 's' : ''} rédigée${count > 1 ? 's' : ''}</div>
      <textarea class="export-text" id="export-text" readonly>${escapeHtml(text)}</textarea>
      <div class="modal-actions">
        <button class="btn btn-outline" id="copy">📋 Copier</button>
        <button class="btn btn-primary" id="mailto">✉️ Envoyer par mail</button>
      </div>
    </div>`;
}
function bindExport() {
  document.getElementById('back').addEventListener('click', () => { STATE.view = 'home'; render(); });
  const refresh = (idx) => {
    const { text, count } = buildExportText(idx);
    document.getElementById('export-text').value = text;
    document.getElementById('export-count').textContent = `${count} observation${count > 1 ? 's' : ''} rédigée${count > 1 ? 's' : ''}`;
    document.querySelectorAll('[data-export-day]').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.exportDay, 10) === idx);
    });
  };
  document.querySelectorAll('[data-export-day]').forEach(el => {
    el.addEventListener('click', () => refresh(parseInt(el.dataset.exportDay, 10)));
  });
  document.getElementById('copy').addEventListener('click', async () => {
    const ta = document.getElementById('export-text');
    try { await navigator.clipboard.writeText(ta.value); toast('Copié ✓'); }
    catch { ta.select(); document.execCommand('copy'); toast('Copié ✓'); }
  });
  document.getElementById('mailto').addEventListener('click', () => {
    const ta = document.getElementById('export-text');
    const subject = ta.value.split('\n')[0];
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(ta.value)}`;
  });
}

/* ---------- Utils ---------- */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s); }
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

/* ---------- Photo storage (IndexedDB) ---------- */
const PHOTO_DB_NAME = 'laulau-photos';
const PHOTO_DB_VERSION = 1;
const PHOTO_STORE = 'photos';
let _photoDB = null;

function openPhotoDB() {
  if (_photoDB) return Promise.resolve(_photoDB);
  return new Promise((res, rej) => {
    const req = indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
    };
    req.onsuccess = e => { _photoDB = e.target.result; res(_photoDB); };
    req.onerror = e => rej(e.target.error);
  });
}
async function savePhoto(id, blob, patientId) {
  const db = await openPhotoDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).put({ id, blob, patientId, createdAt: Date.now() });
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function loadPhoto(id) {
  const db = await openPhotoDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(PHOTO_STORE, 'readonly');
    const req = tx.objectStore(PHOTO_STORE).get(id);
    req.onsuccess = () => res(req.result || null);
    req.onerror = () => rej(req.error);
  });
}
async function deletePhotoFromDB(id) {
  const db = await openPhotoDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

const ACTIVE_URLS = new Set();
function blobURL(blob) { const u = URL.createObjectURL(blob); ACTIVE_URLS.add(u); return u; }
function revokeAllURLs() { for (const u of ACTIVE_URLS) URL.revokeObjectURL(u); ACTIVE_URLS.clear(); }

/* ---------- Image processing ---------- */
function loadImageFromBlob(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => res({ img, url });
    img.onerror = e => { URL.revokeObjectURL(url); rej(e); };
    img.src = url;
  });
}
function compressImage(img, crop) {
  const sx = crop ? crop.x : 0;
  const sy = crop ? crop.y : 0;
  const sw = crop ? crop.w : img.naturalWidth;
  const sh = crop ? crop.h : img.naturalHeight;
  const MAX = 1400;
  let dw = sw, dh = sh;
  if (Math.max(sw, sh) > MAX) {
    if (sw >= sh) { dw = MAX; dh = Math.round(sh * MAX / sw); }
    else { dh = MAX; dw = Math.round(sw * MAX / sh); }
  }
  const canvas = document.createElement('canvas');
  canvas.width = dw; canvas.height = dh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
  return new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.82));
}

/* ---------- Cropper ---------- */
function showCropper(img, srcURL) {
  return new Promise((resolve) => {
    const bg = document.createElement('div');
    bg.className = 'cropper-bg';
    bg.innerHTML = `
      <div class="cropper-stage" id="crop-stage">
        <img id="crop-img" alt="">
        <div class="cropper-rect" id="crop-rect">
          <div class="cropper-handle nw" data-h="nw"></div>
          <div class="cropper-handle ne" data-h="ne"></div>
          <div class="cropper-handle sw" data-h="sw"></div>
          <div class="cropper-handle se" data-h="se"></div>
        </div>
      </div>
      <div class="cropper-actions">
        <button class="btn btn-outline" id="crop-cancel">Annuler</button>
        <button class="btn btn-ghost" id="crop-skip">Sans recadrer</button>
        <button class="btn btn-primary" id="crop-confirm">Recadrer</button>
      </div>`;
    document.body.appendChild(bg);
    const stage = bg.querySelector('#crop-stage');
    const dispImg = bg.querySelector('#crop-img');
    const rect = bg.querySelector('#crop-rect');
    dispImg.src = srcURL;

    const init = () => {
      const stageBox = stage.getBoundingClientRect();
      const imgBox = dispImg.getBoundingClientRect();
      const offX = imgBox.left - stageBox.left;
      const offY = imgBox.top - stageBox.top;
      const w = imgBox.width * 0.8;
      const h = imgBox.height * 0.8;
      rect.style.left = (offX + (imgBox.width - w) / 2) + 'px';
      rect.style.top = (offY + (imgBox.height - h) / 2) + 'px';
      rect.style.width = w + 'px';
      rect.style.height = h + 'px';
    };
    if (dispImg.complete && dispImg.naturalWidth) requestAnimationFrame(init);
    else dispImg.onload = () => requestAnimationFrame(init);

    let action = null;
    let start = { x: 0, y: 0 };
    let initR = null;

    const onDown = (e) => {
      const t = e.target;
      action = t.dataset.h ? ('rs-' + t.dataset.h) : 'mv';
      start = { x: e.clientX, y: e.clientY };
      initR = { l: rect.offsetLeft, t: rect.offsetTop, w: rect.offsetWidth, h: rect.offsetHeight };
      rect.setPointerCapture && rect.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!action) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      let l = initR.l, t = initR.t, w = initR.w, h = initR.h;
      if (action === 'mv') { l += dx; t += dy; }
      else if (action === 'rs-nw') { l += dx; t += dy; w -= dx; h -= dy; }
      else if (action === 'rs-ne') { t += dy; w += dx; h -= dy; }
      else if (action === 'rs-sw') { l += dx; w -= dx; h += dy; }
      else if (action === 'rs-se') { w += dx; h += dy; }
      const stageBox = stage.getBoundingClientRect();
      const imgBox = dispImg.getBoundingClientRect();
      const minL = imgBox.left - stageBox.left;
      const minT = imgBox.top - stageBox.top;
      const maxL = minL + imgBox.width;
      const maxT = minT + imgBox.height;
      const minSize = 60;
      if (w < minSize) { if (action === 'rs-nw' || action === 'rs-sw') l = initR.l + initR.w - minSize; w = minSize; }
      if (h < minSize) { if (action === 'rs-nw' || action === 'rs-ne') t = initR.t + initR.h - minSize; h = minSize; }
      if (l < minL) { if (action === 'mv') l = minL; else { w += (l - minL); l = minL; } }
      if (t < minT) { if (action === 'mv') t = minT; else { h += (t - minT); t = minT; } }
      if (l + w > maxL) { if (action === 'mv') l = maxL - w; else w = maxL - l; }
      if (t + h > maxT) { if (action === 'mv') t = maxT - h; else h = maxT - t; }
      rect.style.left = l + 'px'; rect.style.top = t + 'px';
      rect.style.width = w + 'px'; rect.style.height = h + 'px';
    };
    const onUp = (e) => {
      action = null;
      try { rect.releasePointerCapture && rect.releasePointerCapture(e.pointerId); } catch {}
    };
    rect.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      bg.remove();
    };
    bg.querySelector('#crop-cancel').addEventListener('click', () => { cleanup(); resolve({ cancelled: true }); });
    bg.querySelector('#crop-skip').addEventListener('click', () => { cleanup(); resolve({ crop: null }); });
    bg.querySelector('#crop-confirm').addEventListener('click', () => {
      const stageBox = stage.getBoundingClientRect();
      const imgBox = dispImg.getBoundingClientRect();
      const offX = imgBox.left - stageBox.left;
      const offY = imgBox.top - stageBox.top;
      const scale = img.naturalWidth / imgBox.width;
      const cropPx = {
        x: Math.max(0, Math.round((rect.offsetLeft - offX) * scale)),
        y: Math.max(0, Math.round((rect.offsetTop - offY) * scale)),
        w: Math.round(rect.offsetWidth * scale),
        h: Math.round(rect.offsetHeight * scale),
      };
      cropPx.w = Math.min(cropPx.w, img.naturalWidth - cropPx.x);
      cropPx.h = Math.min(cropPx.h, img.naturalHeight - cropPx.y);
      cleanup();
      resolve({ crop: cropPx });
    });
  });
}

/* ---------- Add photo flow ---------- */
async function addPhotoFlow(patient, file) {
  if (!file || !file.type || !file.type.startsWith('image/')) return;
  let temp = null;
  try {
    temp = await loadImageFromBlob(file);
    const result = await showCropper(temp.img, temp.url);
    if (result.cancelled) return;
    const blob = await compressImage(temp.img, result.crop);
    if (!blob) { toast('Compression échouée'); return; }
    const id = uid();
    await savePhoto(id, blob, patient.id);
    if (!Array.isArray(patient.photoIds)) patient.photoIds = [];
    patient.photoIds.push(id);
    save();
  } catch (e) {
    console.error('photo error', e);
    toast(`Erreur : ${e.message || e}`);
  } finally {
    if (temp && temp.url) URL.revokeObjectURL(temp.url);
  }
}

/* ---------- Lightbox ---------- */
async function openLightbox(patient, startId) {
  let ids = (patient.photoIds || []).slice();
  if (ids.length === 0) return;
  let idx = ids.indexOf(startId);
  if (idx < 0) idx = 0;
  const bg = document.createElement('div');
  bg.className = 'lightbox-bg';
  bg.innerHTML = `
    <button class="lightbox-close" id="lb-close">×</button>
    <div class="lightbox-img-wrap"><img id="lb-img" alt=""></div>
    <div class="lightbox-actions">
      <button class="lb-btn" id="lb-prev">‹</button>
      <span class="lb-pos" id="lb-pos"></span>
      <button class="lb-btn lb-del" id="lb-del">🗑</button>
      <button class="lb-btn" id="lb-next">›</button>
    </div>`;
  document.body.appendChild(bg);
  const lbImg = bg.querySelector('#lb-img');
  let currentURL = null;
  async function show(i) {
    if (currentURL) { URL.revokeObjectURL(currentURL); ACTIVE_URLS.delete(currentURL); currentURL = null; }
    const photo = await loadPhoto(ids[i]);
    if (!photo) { lbImg.alt = 'Photo introuvable'; return; }
    currentURL = blobURL(photo.blob);
    lbImg.src = currentURL;
    bg.querySelector('#lb-pos').textContent = `${i + 1} / ${ids.length}`;
  }
  show(idx);
  bg.querySelector('#lb-prev').addEventListener('click', () => { idx = (idx - 1 + ids.length) % ids.length; show(idx); });
  bg.querySelector('#lb-next').addEventListener('click', () => { idx = (idx + 1) % ids.length; show(idx); });
  bg.querySelector('#lb-close').addEventListener('click', cleanup);
  bg.querySelector('#lb-del').addEventListener('click', async () => {
    if (!confirm('Supprimer cette photo ?')) return;
    const delId = ids[idx];
    await deletePhotoFromDB(delId);
    patient.photoIds = (patient.photoIds || []).filter(x => x !== delId);
    ids = patient.photoIds.slice();
    save();
    if (ids.length === 0) { cleanup(); render(); return; }
    if (idx >= ids.length) idx = ids.length - 1;
    await show(idx);
    render();
  });

  // Swipe support
  let sx = null;
  bg.addEventListener('pointerdown', e => {
    if (e.target.closest('.lightbox-actions') || e.target.closest('.lightbox-close')) return;
    sx = e.clientX;
  });
  bg.addEventListener('pointerup', e => {
    if (sx === null) return;
    const dx = e.clientX - sx;
    sx = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) { idx = (idx + 1) % ids.length; show(idx); }
    else { idx = (idx - 1 + ids.length) % ids.length; show(idx); }
  });

  function cleanup() {
    if (currentURL) URL.revokeObjectURL(currentURL);
    bg.remove();
  }
}

async function loadThumbsInto(container, ids, onClick) {
  for (const id of ids) {
    const photo = await loadPhoto(id);
    if (!photo) continue;
    const url = blobURL(photo.blob);
    const div = document.createElement('div');
    div.className = 'photo-thumb';
    div.innerHTML = `<img src="${url}" alt="">`;
    div.addEventListener('click', () => onClick(id));
    container.appendChild(div);
  }
}

/* ---------- Boot ---------- */
load();
render();
