const API_URL = 'http://192.168.101.25:14000/api/journal';

const LOOKUP_CACHE_KEY = 'journal_lookups_cache_v1';
const DEFAULT_DEPARTMENTS = [
  'Терапия',
  'ИК1',
  'ИК2',
  'Гинекология',
  'Аритмология',
  'Кардиохирургия',
  'Хирургия',
  'Неврология',
  'Урология',
  'Нейрохирургия',
  'Ангиохирургия',
  'ДКХО'
];

let MKB_CODES = [];
let OPERATION_CODES = [];
let ORG_EMAIL_MAP = {};
let ORGANIZATIONS = [];
let REGIONS = [];
let HELP_TYPES = [];
let DEPARTMENTS = [];

async function loadLookups() {
  let cache = null;
  try {
    cache = JSON.parse(localStorage.getItem(LOOKUP_CACHE_KEY) || 'null');
  } catch {
    cache = null;
  }

  if (cache) {
    applyLookups(cache);
  }

  try {
    const res = await fetch(`${API_URL}/lookups`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Failed to load lookups');
    applyLookups(data);
    localStorage.setItem(LOOKUP_CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    if (!cache) {
      console.warn('Failed to load lookups from Strapi:', e.message || e);
    }
  }
}

function applyLookups(data) {
  MKB_CODES = Array.isArray(data?.mkbCodes) ? data.mkbCodes : [];
  OPERATION_CODES = Array.isArray(data?.operationCodes) ? data.operationCodes : [];
  REGIONS = Array.isArray(data?.regions) ? data.regions : [];
  HELP_TYPES = Array.isArray(data?.helpTypes) ? data.helpTypes : [];
  DEPARTMENTS = Array.isArray(data?.departments) && data.departments.length > 0
    ? data.departments
    : DEFAULT_DEPARTMENTS;

  ORG_EMAIL_MAP = {};
  const orgs = Array.isArray(data?.organizations) ? data.organizations : [];
  orgs.forEach((org) => {
    const name = org?.name || '';
    if (!name) return;
    const emails = Array.isArray(org.emails) ? org.emails : [];
    const primary = org.email || (emails.length > 0 ? emails[0] : '');
    ORG_EMAIL_MAP[name] = primary ? [primary, ...emails.filter((e) => e !== primary)] : emails;
  });
  ORGANIZATIONS = Object.keys(ORG_EMAIL_MAP);
}

/* ─── Org ↔ Email unified mapping (predefined + overrides) ─── */

function getOrgEmailOverrides() {
  try { return JSON.parse(localStorage.getItem('org_email_overrides') || '{}'); }
  catch { return {}; }
}

function saveOrgEmailOverride(org, email) {
  if (!org || !email) return;
  const overrides = getOrgEmailOverrides();
  overrides[org] = email;
  localStorage.setItem('org_email_overrides', JSON.stringify(overrides));
}

function removeOrgEmailOverride(org) {
  if (!org) return;
  const overrides = getOrgEmailOverrides();
  delete overrides[org];
  localStorage.setItem('org_email_overrides', JSON.stringify(overrides));
}

function getOrgEmail(orgName) {
  if (!orgName) return '';
  const overrides = getOrgEmailOverrides();
  if (overrides[orgName]) return overrides[orgName];
  const emails = ORG_EMAIL_MAP[orgName];
  if (emails && emails.length > 0) return emails[0];
  return '';
}

/* Migrate old custom_org_email_map → org_email_overrides */
(function migrateOldOrgEmailMap() {
  const old = localStorage.getItem('custom_org_email_map');
  if (!old) return;
  try {
    const oldMap = JSON.parse(old);
    const overrides = getOrgEmailOverrides();
    Object.keys(oldMap).forEach((org) => {
      if (!overrides[org]) overrides[org] = oldMap[org];
    });
    localStorage.setItem('org_email_overrides', JSON.stringify(overrides));
    localStorage.removeItem('custom_org_email_map');
  } catch { /* ignore */ }
})();

let lettersCache = [];
let activeLetterId = null;
let currentDirection = 'incoming';
let currentListFilter = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  const token = getToken();
  if (!token) {
    window.location.href = 'journal-login.html';
    return;
  }

  await loadLookups();
  initSelects();
  initCombobox('mkb', MKB_CODES, 'custom_mkb');
  initCombobox('operation-code', OPERATION_CODES, 'custom_operations');
  initCombobox('department', DEPARTMENTS, 'custom_departments');
  initCombobox('transfer-org', ORGANIZATIONS, 'custom_orgs', (orgName) => {
    const emailInput = document.getElementById('transfer-email');
    const hint = document.getElementById('transfer-email-hint');
    if (!orgName) {
      emailInput.value = '';
      hint.textContent = '';
      return;
    }
    const email = getOrgEmail(orgName);
    emailInput.value = email;
    hint.textContent = email ? '' : 'Введите email для новой организации';
    hint.style.color = 'var(--accent)';
  }, (deletedOrg) => {
    removeOrgEmailOverride(deletedOrg);
    const orgInput = document.getElementById('transfer-org');
    if (orgInput.value === deletedOrg) {
      document.getElementById('transfer-email').value = '';
    }
  });
  initTransferEmailSync();
  document.getElementById('letter-form').addEventListener('submit', saveLetter);
  document.getElementById('new-letter').addEventListener('click', resetForm);
  document.getElementById('reset-form').addEventListener('click', resetForm);
  document.getElementById('delete-letter').addEventListener('click', deleteLetter);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('search').addEventListener('input', renderList);
  document.querySelectorAll('[data-list-filter]').forEach((btn) => {
    btn.addEventListener('click', () => setListFilter(btn.dataset.listFilter || 'all'));
  });
  document.getElementById('transfer-from').addEventListener('change', toggleTransferFields);
  document.getElementById('transfer-to').addEventListener('change', toggleTransferFields);
  document.getElementById('transfer-toggle').addEventListener('click', toggleTransferSection);
  document.getElementById('incoming-toggle').addEventListener('click', toggleIncomingSection);
  document.getElementById('outgoing-toggle').addEventListener('click', toggleOutgoingSection);

  loadUser();
  loadLetters();
});

function getToken() {
  return localStorage.getItem('journal_token');
}

async function loadUser() {
  try {
    const res = await fetch(`${API_URL}/me`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error('Ошибка авторизации');
    document.getElementById('journal-user').textContent = `Пользователь: ${data.display_name || data.login}`;
  } catch (err) {
    localStorage.removeItem('journal_token');
    window.location.href = 'journal-login.html';
  }
}

async function loadLetters() {
  try {
    const res = await fetch(`${API_URL}/letters`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
    lettersCache = Array.isArray(data) ? data : [];
    renderList();
    if (lettersCache.length > 0) {
      selectLetter(lettersCache[0].id);
    } else {
      resetForm();
    }
  } catch (err) {
    setStatus(err.message, true);
  }
}

function renderList() {
  const listEl = document.getElementById('letters-list');
  const query = document.getElementById('search').value.trim().toLowerCase();
  listEl.innerHTML = '';

  const filtered = lettersCache.filter((l) => {
    if (!matchesListFilter(l)) return false;
    const inNum = l.incoming_number || '';
    const outNum = l.outgoing_number || '';
    const hay = `${inNum} ${outNum} вх ${inNum} исх ${outNum} ${l.fio} ${l.subject || ''}`.toLowerCase();
    return hay.includes(query);
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="small-note" style="padding: 14px;">Писем пока нет</div>`;
    return;
  }

  filtered.forEach((letter) => {
    const overdue = isOverdue(letter.arrival_date, letter.send_date);
    const item = document.createElement('div');
    item.className = `letter-item ${letter.id === activeLetterId ? 'active' : ''}`;
    const inNum = letter.incoming_number ? `Вх № ${escapeHtml(letter.incoming_number)}` : 'Вх № —';
    const outNum = letter.outgoing_number ? `Исх № ${escapeHtml(letter.outgoing_number)}` : 'Исх № —';
    const badge = overdue ? '<span class="alert-badge"><span class="alert-dot"></span>Просрочка</span>' : '';
    item.innerHTML = `
      <div class="letter-title">${inNum} · ${outNum}${badge}</div>
      <div class="letter-meta">${escapeHtml(letter.fio)} • ${formatDate(letter.arrival_date || letter.send_date)}</div>
    `;
    item.addEventListener('click', () => selectLetter(letter.id));
    listEl.appendChild(item);
  });
}


function setListFilter(filter) {
  currentListFilter = filter || 'all';
  updateListFilterButtons();
  renderList();
}

function updateListFilterButtons() {
  document.querySelectorAll('[data-list-filter]').forEach((btn) => {
    btn.classList.toggle('active', (btn.dataset.listFilter || 'all') === currentListFilter);
  });
}

function matchesListFilter(letter) {
  if (currentListFilter === 'incoming') return Boolean(letter?.incoming_number);
  if (currentListFilter === 'outgoing') return Boolean(letter?.outgoing_number);
  if (currentListFilter === 'overdue') return isOverdue(letter?.arrival_date, letter?.send_date);
  return true;
}
async function selectLetter(id) {
  activeLetterId = id;
  renderList();
  try {
    const res = await fetch(`${API_URL}/letters/${id}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
    fillForm(data);
    loadHistory(id);
  } catch (err) {
    setStatus(err.message, true);
  }
}

function fillForm(letter) {
  const titleIn = letter.incoming_number ? `Вх № ${letter.incoming_number}` : 'Вх № —';
  const titleOut = letter.outgoing_number ? `Исх № ${letter.outgoing_number}` : 'Исх № —';
  document.getElementById('detail-title').textContent = `${titleIn} · ${titleOut}`;
  currentDirection = letter.direction || 'incoming';
  document.getElementById('fio').value = letter.fio || '';
  document.getElementById('region').value = letter.region || '';
  document.getElementById('incoming-number').value = letter.incoming_number || '';
  document.getElementById('arrival-date').value = letter.arrival_date || '';
  document.getElementById('outgoing-number').value = letter.outgoing_number || '';
  document.getElementById('send-date').value = letter.send_date || '';
  document.getElementById('incoming-content').value = letter.incoming_content || '';
  document.getElementById('outgoing-content').value = letter.outgoing_content || '';
  document.getElementById('transfer-from').value = letter.transfer_from || '';
  document.getElementById('transfer-to').value = letter.transfer_to || '';
  document.getElementById('transfer-org').value = letter.transfer_org || '';
  document.getElementById('transfer-email').value = letter.transfer_email || '';
  document.getElementById('mkb').value = letter.mkb || letter.mkb_other || '';
  document.getElementById('operation-code').value = letter.operation_code || letter.operation_other || '';
  document.getElementById('department').value = letter.department || letter.department_other || '';
  document.getElementById('help-type').value = letter.help_type || '';
  document.getElementById('subject').value = letter.subject || '';
  const createdBy = letter.created_by_name || '—';
  const updatedBy = letter.updated_by_name || '—';
  document.getElementById('audit-text').textContent = `Создал: ${createdBy} · Последнее изменение: ${updatedBy}`;
  setStatus('');
  toggleTransferFields();
  const hasIncoming = Boolean(
    letter.incoming_number ||
    letter.arrival_date ||
    letter.mkb ||
    letter.mkb_other ||
    letter.operation_code ||
    letter.operation_other ||
    letter.department ||
    letter.department_other ||
    letter.incoming_content
  );
  const hasOutgoing = Boolean(letter.outgoing_number || letter.send_date || letter.outgoing_content);
  const hasTransfer = Boolean(letter.transfer_from || letter.transfer_to || letter.transfer_org || letter.transfer_email);

  hasIncoming ? expandIncomingSection() : collapseIncomingSection();
  hasOutgoing ? expandOutgoingSection() : collapseOutgoingSection();
  hasTransfer ? expandTransferSection() : collapseTransferSection();
}

function resetForm() {
  activeLetterId = null;
  document.getElementById('detail-title').textContent = 'Новое письмо';
  currentDirection = 'incoming';
  document.getElementById('letter-form').reset();
  document.getElementById('audit-text').textContent = '';
  document.getElementById('history-list').innerHTML = '';
  setStatus('');
  toggleTransferFields();
  collapseIncomingSection();
  collapseOutgoingSection();
  collapseTransferSection();
  renderList();
}

async function saveLetter(event) {
  event.preventDefault();
  const incomingNumber = document.getElementById('incoming-number').value.trim();
  const outgoingNumber = document.getElementById('outgoing-number').value.trim();
  let direction = currentDirection;
  if (incomingNumber && !outgoingNumber) direction = 'incoming';
  if (!incomingNumber && outgoingNumber) direction = 'outgoing';

  const mkbValue = document.getElementById('mkb').value.trim();
  const opValue = document.getElementById('operation-code').value.trim();
  const departmentValue = document.getElementById('department').value.trim();
  const mkbIsKnown = MKB_CODES.includes(mkbValue);
  const opIsKnown = OPERATION_CODES.includes(opValue);
  const departmentIsKnown = DEPARTMENTS.includes(departmentValue);

  const payload = {
    letter_number: '',
    incoming_number: incomingNumber,
    outgoing_number: outgoingNumber,
    fio: document.getElementById('fio').value.trim(),
    region: document.getElementById('region').value,
    direction,
    arrival_date: document.getElementById('arrival-date').value || null,
    send_date: document.getElementById('send-date').value || null,
    transfer_from: document.getElementById('transfer-from').value || null,
    transfer_to: document.getElementById('transfer-to').value || null,
    transfer_org: document.getElementById('transfer-org').value.trim() || null,
    transfer_email: document.getElementById('transfer-email').value.trim() || null,
    mkb: mkbValue || null,
    mkb_other: mkbValue && !mkbIsKnown ? mkbValue : null,
    operation_code: opValue || null,
    operation_other: opValue && !opIsKnown ? opValue : null,
    department: departmentValue || null,
    department_other: departmentValue && !departmentIsKnown ? departmentValue : null,
    incoming_content: document.getElementById('incoming-content').value.trim() || null,
    outgoing_content: document.getElementById('outgoing-content').value.trim() || null,
    subject: document.getElementById('subject').value.trim() || null,
    help_type: document.getElementById('help-type').value || null
  };

  if (payload.transfer_org && payload.transfer_email) {
    const currentEmail = getOrgEmail(payload.transfer_org);
    if (currentEmail !== payload.transfer_email) {
      saveOrgEmailOverride(payload.transfer_org, payload.transfer_email);
    }
  }

  if ((!payload.incoming_number && !payload.outgoing_number) || !payload.fio) {
    setStatus('Номер входящего или исходящего и ФИО обязательны', true);
    return;
  }

  const method = activeLetterId ? 'PUT' : 'POST';
  const url = activeLetterId ? `${API_URL}/letters/${activeLetterId}` : `${API_URL}/letters`;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка сохранения');
    setStatus('Сохранено');
    await loadLetters();
    if (activeLetterId) {
      selectLetter(activeLetterId);
    } else if (data.id) {
      selectLetter(data.id);
    }
  } catch (err) {
    setStatus(err.message, true);
  }
}

async function deleteLetter() {
  if (!activeLetterId) {
    setStatus('Сначала выберите письмо', true);
    return;
  }
  const confirmed = await showConfirmDialog({
    title: 'Подтвердите удаление',
    message: 'Удалить письмо без возможности восстановления?',
    confirmText: 'Удалить',
    cancelText: 'Отмена'
  });
  if (!confirmed) return;

  try {
    const res = await fetch(`${API_URL}/letters/${activeLetterId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка удаления');
    setStatus('Удалено');
    await loadLetters();
  } catch (err) {
    setStatus(err.message, true);
  }
}

function setStatus(text, isError = false) {
  const el = document.getElementById('status-text');
  el.textContent = text || '';
  el.style.color = isError ? '#8a2e2e' : '#2a6f5e';
}

function showConfirmDialog({ title, message, confirmText, cancelText }) {
  const dialogTitle = title || 'Подтвердите действие';
  const dialogMessage = message || 'Вы уверены?';
  const okText = confirmText || 'Подтвердить';
  const closeText = cancelText || 'Отмена';

  return new Promise((resolve) => {
    const existing = document.getElementById('journal-confirm-backdrop');
    if (existing) existing.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'journal-confirm-backdrop';
    backdrop.className = 'journal-modal-backdrop';
    backdrop.innerHTML = `
      <div class="journal-modal" role="dialog" aria-modal="true" aria-labelledby="journal-modal-title">
        <h3 id="journal-modal-title" class="journal-modal-title">${escapeHtml(dialogTitle)}</h3>
        <p class="journal-modal-message">${escapeHtml(dialogMessage)}</p>
        <div class="journal-modal-actions">
          <button type="button" class="btn secondary" data-action="cancel">${escapeHtml(closeText)}</button>
          <button type="button" class="btn danger" data-action="confirm">${escapeHtml(okText)}</button>
        </div>
      </div>
    `;

    const cancelBtn = backdrop.querySelector('[data-action="cancel"]');
    const confirmBtn = backdrop.querySelector('[data-action="confirm"]');

    const close = (result) => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('modal-open');
      backdrop.remove();
      resolve(result);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        close(true);
      }
    };

    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close(false);
    });
    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));

    document.body.classList.add('modal-open');
    document.body.appendChild(backdrop);
    document.addEventListener('keydown', onKeyDown);
    cancelBtn.focus();
  });
}

function formatDate(dateStr) {
  if (!dateStr) return 'без даты';
  return dateStr;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function handleLogout() {
  localStorage.removeItem('journal_token');
  localStorage.removeItem('journal_user');
  window.location.href = 'journal-login.html';
}

async function loadHistory(letterId) {
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  try {
    const res = await fetch(`${API_URL}/letters/${letterId}/history`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка загрузки истории');
    if (!Array.isArray(data) || data.length === 0) {
      list.innerHTML = '<div class="history-item">История пока пустая</div>';
      return;
    }
    data.forEach((h) => {
      const item = document.createElement('div');
      const when = h.changed_at ? String(h.changed_at).replace('T', ' ').slice(0, 19) : '—';
      const who = h.changed_by_name || '—';
      const field = fieldLabel(h.field_name);
      const oldVal = shortValue(h.old_value);
      const newVal = shortValue(h.new_value);
      item.className = 'history-item';
      item.innerHTML = `
        <strong>${when}</strong> · ${escapeHtml(who)}<br/>
        ${escapeHtml(field)}: "${escapeHtml(oldVal)}" → "${escapeHtml(newVal)}"
      `;
      list.appendChild(item);
    });
  } catch (err) {
    list.innerHTML = `<div class="history-item">${escapeHtml(err.message)}</div>`;
  }
}

function fieldLabel(name) {
  const map = {
    created: 'Создание',
    letter_number: 'Номер письма (общий)',
    incoming_number: 'Номер входящего',
    outgoing_number: 'Номер исходящего',
    fio: 'ФИО',
    region: 'Область',
    direction: 'Тип',
    arrival_date: 'Дата прибытия',
    send_date: 'Дата отправки',
    transfer_from: 'Перенос (с)',
    transfer_to: 'Перенос (на)',
    transfer_org: 'Мед. организация',
    transfer_email: 'Эл. почта',
    mkb: 'МКБ',
    mkb_other: 'МКБ (другое)',
    operation_code: 'Код операции',
    operation_other: 'Код операции (другое)',
    department: 'Отделение',
    department_other: 'Отделение (другое)',
    incoming_content: 'Содержание входящего',
    outgoing_content: 'Содержание исходящего',
    subject: 'Тема',
    content: 'Содержание',
    help_type: 'Вид помощи'
  };
  return map[name] || name || 'Поле';
}

function shortValue(value) {
  if (value === null || value === undefined) return '—';
  const str = String(value);
  return str.length > 80 ? `${str.slice(0, 80)}…` : str;
}

function initSelects() {
  fillSelect('region', REGIONS);
  fillSelect('help-type', HELP_TYPES);
}

function fillSelect(id, items) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '<option value="">— Не выбрано —</option>';
  (items || []).forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    el.appendChild(opt);
  });
}

/* ─── Combobox ──────────────────────────────────────────── */

function initCombobox(inputId, items, storageKey, onSelect, onDelete) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(inputId + '-dropdown');
  if (!input || !dropdown) return;

  function getCustomItems() {
    if (!storageKey) return [];
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); }
    catch { return []; }
  }

  function saveCustomItem(value) {
    if (!storageKey || !value) return false;
    const custom = getCustomItems();
    if (!custom.includes(value) && !items.includes(value)) {
      custom.push(value);
      localStorage.setItem(storageKey, JSON.stringify(custom));
      return true;
    }
    return false;
  }

  function removeCustomItem(value) {
    if (!storageKey) return;
    const custom = getCustomItems().filter((v) => v !== value);
    localStorage.setItem(storageKey, JSON.stringify(custom));
  }

  function showSaveHint() {
    let hint = input.parentElement.querySelector('.combobox-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'combobox-hint';
      input.parentElement.appendChild(hint);
    }
    hint.textContent = 'Добавлено в список';
    hint.classList.add('visible');
    setTimeout(() => hint.classList.remove('visible'), 2000);
  }

  let highlighted = -1;

  function renderOptions(query) {
    const q = (query || '').trim().toLowerCase();
    const filteredBase = q ? items.filter((v) => String(v).toLowerCase().includes(q)) : items;
    const custom = getCustomItems();
    const filteredCustom = q ? custom.filter((v) => String(v).toLowerCase().includes(q)) : custom;
    dropdown.innerHTML = '';
    highlighted = -1;

    if (filteredBase.length === 0 && filteredCustom.length === 0 && !q && items.length === 0 && custom.length === 0) {
      dropdown.classList.remove('open');
      return;
    }

    filteredBase.forEach((v) => {
      dropdown.appendChild(makeOption(v));
    });

    if (filteredCustom.length > 0) {
      const sep = document.createElement('div');
      sep.className = 'combobox-separator';
      sep.textContent = 'Добавленные:';
      dropdown.appendChild(sep);

      filteredCustom.forEach((v) => {
        const row = makeOption(v);
        row.classList.add('combobox-option-custom');
        const del = document.createElement('span');
        del.className = 'combobox-delete';
        del.textContent = '\u00d7';
        del.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          removeCustomItem(v);
          if (onDelete) onDelete(v);
          if (input.value === v) {
            input.value = '';
            if (onSelect) onSelect(null);
          }
          renderOptions(input.value);
        });
        row.appendChild(del);
        dropdown.appendChild(row);
      });
    }

    const otherOpt = document.createElement('div');
    otherOpt.className = 'combobox-option combobox-option-other';
    otherOpt.textContent = 'Другое...';
    otherOpt.addEventListener('mousedown', (e) => {
      e.preventDefault();
      input.value = '';
      input.placeholder = 'Введите свой вариант...';
      dropdown.classList.remove('open');
      input.focus();
      if (onSelect) onSelect(null);
    });
    dropdown.appendChild(otherOpt);

    dropdown.classList.add('open');
  }

  function makeOption(v) {
    const opt = document.createElement('div');
    opt.className = 'combobox-option';
    if (v === input.value) opt.classList.add('selected');
    opt.textContent = v;
    opt.addEventListener('mousedown', (e) => {
      e.preventDefault();
      input.value = v;
      dropdown.classList.remove('open');
      if (onSelect) onSelect(v);
    });
    return opt;
  }

  input.addEventListener('focus', () => {
    renderOptions(input.value);
  });

  input.addEventListener('input', () => {
    renderOptions(input.value);
  });

  input.addEventListener('blur', () => {
    const val = input.value.trim();
    if (val && saveCustomItem(val)) {
      showSaveHint();
    }
    setTimeout(() => dropdown.classList.remove('open'), 150);
  });

  input.addEventListener('keydown', (e) => {
    const allOpts = dropdown.querySelectorAll('.combobox-option');
    if (!allOpts.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlighted = Math.min(highlighted + 1, allOpts.length - 1);
      updateHighlight(allOpts);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlighted = Math.max(highlighted - 1, 0);
      updateHighlight(allOpts);
    } else if (e.key === 'Enter' && highlighted >= 0) {
      e.preventDefault();
      const sel = allOpts[highlighted];
      if (sel.classList.contains('combobox-option-other')) {
        input.value = '';
        input.placeholder = 'Введите свой вариант...';
        dropdown.classList.remove('open');
        if (onSelect) onSelect(null);
      } else {
        input.value = sel.textContent.replace(/\u00d7$/, '').trim();
        dropdown.classList.remove('open');
        if (onSelect) onSelect(input.value);
      }
    } else if (e.key === 'Escape') {
      dropdown.classList.remove('open');
    }
  });

  function updateHighlight(opts) {
    opts.forEach((opt, i) => {
      opt.classList.toggle('highlighted', i === highlighted);
    });
    if (highlighted >= 0 && opts[highlighted]) {
      opts[highlighted].scrollIntoView({ block: 'nearest' });
    }
  }
}

/* ─── Transfer email sync ──────────────────────────────── */

function initTransferEmailSync() {
  const emailInput = document.getElementById('transfer-email');
  const hint = document.getElementById('transfer-email-hint');

  emailInput.addEventListener('blur', () => {
    const org = document.getElementById('transfer-org').value.trim();
    const email = emailInput.value.trim();
    if (!org || !email) {
      hint.textContent = '';
      return;
    }
    const currentEmail = getOrgEmail(org);
    if (email !== currentEmail) {
      saveOrgEmailOverride(org, email);
      hint.textContent = 'Почта сохранена для этой организации';
      hint.style.color = 'var(--accent)';
      setTimeout(() => { hint.textContent = ''; }, 2500);
    }
  });
}

/* ─── Transfer fields ───────────────────────────────────── */

function toggleTransferFields() {
  const from = document.getElementById('transfer-from').value;
  const to = document.getElementById('transfer-to').value;
  const show = Boolean(from && to);
  document.getElementById('transfer-org-field').classList.toggle('hidden', !show);
  document.getElementById('transfer-email-field').classList.toggle('hidden', !show);
  if (!show) {
    document.getElementById('transfer-org').value = '';
    document.getElementById('transfer-email').value = '';
  }
}

function isOverdue(arrival, send) {
  if (!arrival || send) return false;
  const start = new Date(arrival);
  if (Number.isNaN(start.getTime())) return false;
  const now = new Date();
  const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  return diffDays >= 5;
}

/* ─── Section toggles ───────────────────────────────────── */

function toggleTransferSection() {
  const section = document.getElementById('transfer-section');
  if (section.classList.contains('hidden')) {
    expandTransferSection();
  } else {
    collapseTransferSection();
  }
}

function toggleIncomingSection() {
  const section = document.getElementById('incoming-section');
  if (section.classList.contains('hidden')) {
    expandIncomingSection();
  } else {
    collapseIncomingSection();
  }
}

function toggleOutgoingSection() {
  const section = document.getElementById('outgoing-section');
  if (section.classList.contains('hidden')) {
    expandOutgoingSection();
  } else {
    collapseOutgoingSection();
  }
}

function collapseIncomingSection() {
  document.getElementById('incoming-section').classList.add('hidden');
  document.getElementById('incoming-toggle').textContent = 'Развернуть';
}

function expandIncomingSection() {
  document.getElementById('incoming-section').classList.remove('hidden');
  document.getElementById('incoming-toggle').textContent = 'Скрыть';
}

function collapseOutgoingSection() {
  document.getElementById('outgoing-section').classList.add('hidden');
  document.getElementById('outgoing-toggle').textContent = 'Развернуть';
}

function expandOutgoingSection() {
  document.getElementById('outgoing-section').classList.remove('hidden');
  document.getElementById('outgoing-toggle').textContent = 'Скрыть';
}

function collapseTransferSection() {
  document.getElementById('transfer-section').classList.add('hidden');
  document.getElementById('transfer-toggle').textContent = 'Развернуть';
}

function expandTransferSection() {
  document.getElementById('transfer-section').classList.remove('hidden');
  toggleTransferFields();
  document.getElementById('transfer-toggle').textContent = 'Скрыть';
}
