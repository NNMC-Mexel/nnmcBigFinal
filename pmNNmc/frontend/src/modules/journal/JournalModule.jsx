import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import {
  journalLogin,
  journalGetMe,
  journalLogout,
  journalGetLookups,
  journalGetLetters,
  journalGetLetter,
  journalCreateLetter,
  journalUpdateLetter,
  journalDeleteLetter,
  journalGetHistory,
} from '../../api/journalClient';

// ---------- Login Form ----------
function LoginForm({ onLogin }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onLogin(login, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h2 className="font-bold text-gray-900">Журнал приёмной</h2>
            <p className="text-xs text-gray-400">Войдите для работы с журналом</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Логин</label>
            <input type="text" value={login} onChange={(e) => setLogin(e.target.value)} required autoFocus
              placeholder="username" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Пароль</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              placeholder="••••••••" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors" />
          </div>
          {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl">{error}</div>}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-colors disabled:opacity-50">
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------- Combobox ----------
function Combobox({ value, onChange, options, placeholder, fieldKey }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  const storageKey = `journal_custom_${fieldKey}`;
  const [customItems, setCustomItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
  });

  const allOptions = useMemo(() => [...options, ...customItems.filter(c => !options.includes(c))], [options, customItems]);
  const filtered = useMemo(() => {
    if (!search) return allOptions;
    const s = search.toLowerCase();
    return allOptions.filter(o => o.toLowerCase().includes(s));
  }, [allOptions, search]);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleSelect(item) {
    onChange(item);
    setSearch('');
    setOpen(false);
  }

  function handleInputChange(e) {
    setSearch(e.target.value);
    onChange(e.target.value);
    setOpen(true);
  }

  function addCustom() {
    if (search && !allOptions.includes(search)) {
      const updated = [...customItems, search];
      setCustomItems(updated);
      localStorage.setItem(storageKey, JSON.stringify(updated));
      onChange(search);
      setSearch('');
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <input type="text" value={value || search} onChange={handleInputChange} onFocus={() => setOpen(true)}
        placeholder={placeholder} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map(item => (
            <div key={item} onClick={() => handleSelect(item)}
              className="px-3 py-2 text-sm hover:bg-teal-50 cursor-pointer truncate">{item}</div>
          ))}
          {search && !allOptions.includes(search) && (
            <div onClick={addCustom} className="px-3 py-2 text-sm text-teal-600 hover:bg-teal-50 cursor-pointer border-t">
              + Добавить «{search}»
            </div>
          )}
          {filtered.length === 0 && !search && (
            <div className="px-3 py-2 text-sm text-gray-400">Нет элементов</div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Letter List Item ----------
function LetterItem({ letter, isActive, onClick }) {
  const isOverdue = useMemo(() => {
    if (!letter.arrival_date || letter.send_date) return false;
    const diff = (Date.now() - new Date(letter.arrival_date).getTime()) / 86400000;
    return diff > 5;
  }, [letter]);

  return (
    <div onClick={onClick}
      className={`p-3 rounded-xl cursor-pointer transition-all border-2 ${
        isActive ? 'border-teal-500 bg-teal-50/50' : 'border-transparent hover:bg-gray-50'
      }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            {letter.incoming_number && (
              <span className="text-xs font-medium bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                Вх {letter.incoming_number}
              </span>
            )}
            {letter.outgoing_number && (
              <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                Исх {letter.outgoing_number}
              </span>
            )}
            {isOverdue && (
              <span className="text-xs font-medium bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Просрочено</span>
            )}
          </div>
          <div className="text-sm font-medium text-gray-900 truncate">{letter.fio || 'Без имени'}</div>
          {letter.subject && <div className="text-xs text-gray-500 truncate mt-0.5">{letter.subject}</div>}
        </div>
        <div className="text-[11px] text-gray-400 shrink-0">
          {letter.arrival_date ? format(new Date(letter.arrival_date), 'dd.MM.yy') : ''}
        </div>
      </div>
    </div>
  );
}

// ---------- Letter Form ----------
function LetterForm({ letter, lookups, onSave, onDelete, onClear, saving }) {
  const [form, setForm] = useState({});
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showIncoming, setShowIncoming] = useState(true);
  const [showOutgoing, setShowOutgoing] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  useEffect(() => {
    if (letter) {
      setForm({ ...letter });
      setShowIncoming(!!letter.incoming_number || !!letter.incoming_content || !letter.outgoing_number);
      setShowOutgoing(!!letter.outgoing_number || !!letter.outgoing_content);
      setShowTransfer(!!letter.transfer_from || !!letter.transfer_to);
      if (letter.documentId || letter.id) {
        journalGetHistory(letter.documentId || letter.id).then(setHistory).catch(() => setHistory([]));
      }
    } else {
      setForm({});
      setHistory([]);
      setShowIncoming(true);
      setShowOutgoing(false);
      setShowTransfer(false);
    }
  }, [letter]);

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.incoming_number && !form.outgoing_number) {
      alert('Заполните входящий или исходящий номер');
      return;
    }
    if (!form.fio) {
      alert('Заполните ФИО');
      return;
    }
    const direction = form.incoming_number ? 'incoming' : 'outgoing';
    onSave({ ...form, direction });
  }

  const orgEmail = useMemo(() => {
    if (!form.transfer_org || !lookups?.organizations) return '';
    const org = lookups.organizations.find(o => o.name === form.transfer_org);
    return org?.email || '';
  }, [form.transfer_org, lookups]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Title */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          {letter?.id ? (
            <>
              {letter.incoming_number && <span className="text-blue-600">Вх № {letter.incoming_number}</span>}
              {letter.incoming_number && letter.outgoing_number && <span className="text-gray-400"> · </span>}
              {letter.outgoing_number && <span className="text-emerald-600">Исх № {letter.outgoing_number}</span>}
            </>
          ) : 'Новое письмо'}
        </h2>
        <div className="flex gap-2">
          <button type="button" onClick={onClear} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">
            Очистить
          </button>
          {letter?.id && (
            <button type="button" onClick={() => { if (confirm('Удалить письмо?')) onDelete(letter.documentId || letter.id); }}
              className="px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded-lg">
              Удалить
            </button>
          )}
        </div>
      </div>

      {/* Basic fields */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">ФИО *</label>
          <input type="text" value={form.fio || ''} onChange={e => update('fio', e.target.value)} required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Область</label>
          <Combobox value={form.region} onChange={v => update('region', v)} options={lookups?.regions || []} placeholder="Выберите" fieldKey="regions" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Тема</label>
          <input type="text" value={form.subject || ''} onChange={e => update('subject', e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
        </div>
      </div>

      {/* Medical codes grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">МКБ</label>
          <Combobox value={form.mkb} onChange={v => update('mkb', v)} options={lookups?.mkbCodes || []} placeholder="Код" fieldKey="mkb" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Код операции</label>
          <Combobox value={form.operation_code} onChange={v => update('operation_code', v)} options={lookups?.operationCodes || []} placeholder="Код" fieldKey="operation" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Вид помощи</label>
          <Combobox value={form.help_type} onChange={v => update('help_type', v)} options={lookups?.helpTypes || []} placeholder="Выберите" fieldKey="helpType" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Отделение</label>
          <Combobox value={form.department} onChange={v => update('department', v)} options={lookups?.departments || []} placeholder="Выберите" fieldKey="department" />
        </div>
      </div>

      {/* Collapsible sections */}
      {/* Incoming */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <button type="button" onClick={() => setShowIncoming(!showIncoming)}
          className="w-full flex items-center justify-between px-4 py-3 bg-blue-50/50 hover:bg-blue-50 transition-colors">
          <span className="text-sm font-medium text-blue-700">Входящее</span>
          <svg className={`w-4 h-4 text-blue-400 transition-transform ${showIncoming ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showIncoming && (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Вх. номер</label>
                <input type="text" value={form.incoming_number || ''} onChange={e => update('incoming_number', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Дата поступления</label>
                <input type="date" value={form.arrival_date || ''} onChange={e => update('arrival_date', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Содержание входящего</label>
              <textarea value={form.incoming_content || ''} onChange={e => update('incoming_content', e.target.value)} rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" />
            </div>
          </div>
        )}
      </div>

      {/* Outgoing */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <button type="button" onClick={() => setShowOutgoing(!showOutgoing)}
          className="w-full flex items-center justify-between px-4 py-3 bg-emerald-50/50 hover:bg-emerald-50 transition-colors">
          <span className="text-sm font-medium text-emerald-700">Исходящее</span>
          <svg className={`w-4 h-4 text-emerald-400 transition-transform ${showOutgoing ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showOutgoing && (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Исх. номер</label>
                <input type="text" value={form.outgoing_number || ''} onChange={e => update('outgoing_number', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Дата отправки</label>
                <input type="date" value={form.send_date || ''} onChange={e => update('send_date', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Содержание исходящего</label>
              <textarea value={form.outgoing_content || ''} onChange={e => update('outgoing_content', e.target.value)} rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none" />
            </div>
          </div>
        )}
      </div>

      {/* Transfer */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <button type="button" onClick={() => setShowTransfer(!showTransfer)}
          className="w-full flex items-center justify-between px-4 py-3 bg-amber-50/50 hover:bg-amber-50 transition-colors">
          <span className="text-sm font-medium text-amber-700">Перенос</span>
          <svg className={`w-4 h-4 text-amber-400 transition-transform ${showTransfer ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showTransfer && (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Дата от</label>
                <input type="date" value={form.transfer_from || ''} onChange={e => update('transfer_from', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Дата до</label>
                <input type="date" value={form.transfer_to || ''} onChange={e => update('transfer_to', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Организация</label>
              <Combobox value={form.transfer_org} onChange={v => { update('transfer_org', v); if (!form.transfer_email) update('transfer_email', ''); }}
                options={(lookups?.organizations || []).map(o => o.name)} placeholder="Выберите" fieldKey="orgs" />
            </div>
            {(form.transfer_from && form.transfer_to) && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email организации</label>
                <input type="email" value={form.transfer_email || orgEmail} onChange={e => update('transfer_email', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Audit info */}
      {letter?.id && (
        <div className="text-xs text-gray-400 space-y-1">
          {letter.created_by_user?.display_name && <div>Создал: {letter.created_by_user.display_name}</div>}
          {letter.updated_by_user?.display_name && <div>Изменил: {letter.updated_by_user.display_name}</div>}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <button type="button" onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
            <span className="text-sm font-medium text-gray-600">История изменений ({history.length})</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${showHistory ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showHistory && (
            <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
              {history.map((h, i) => (
                <div key={i} className="px-4 py-2 text-xs">
                  <div className="flex justify-between text-gray-400">
                    <span>{h.changed_by_name || 'Система'}</span>
                    <span>{h.changed_at ? format(new Date(h.changed_at), 'dd.MM.yy HH:mm') : ''}</span>
                  </div>
                  <div className="text-gray-600 mt-0.5">
                    <span className="font-medium">{h.field_name}</span>: <span className="line-through text-red-400">{h.old_value || '—'}</span> → <span className="text-emerald-600">{h.new_value || '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Save button */}
      <button type="submit" disabled={saving}
        className="w-full py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-colors disabled:opacity-50">
        {saving ? 'Сохранение...' : letter?.id ? 'Сохранить изменения' : 'Создать письмо'}
      </button>
    </form>
  );
}

// ---------- Main Module ----------
export default function JournalModule() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('journal_token');
    if (!token) { setAuthLoading(false); return; }
    journalGetMe().then(setUser).catch(() => localStorage.removeItem('journal_token')).finally(() => setAuthLoading(false));
  }, []);

  async function handleLogin(login, password) {
    const data = await journalLogin(login, password);
    setUser(data.user);
  }

  function handleLogout() {
    journalLogout();
    setUser(null);
  }

  if (authLoading) return <div className="flex items-center justify-center h-96"><div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" /></div>;
  if (!user) return <LoginForm onLogin={handleLogin} />;
  return <JournalDashboard user={user} onLogout={handleLogout} />;
}

// ---------- Dashboard ----------
function JournalDashboard({ user, onLogout }) {
  const [letters, setLetters] = useState([]);
  const [lookups, setLookups] = useState(null);
  const [activeLetter, setActiveLetter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | incoming | outgoing | overdue

  const loadLetters = useCallback(async () => {
    try {
      const data = await journalGetLetters();
      setLetters(Array.isArray(data) ? data : data?.data || []);
    } catch { setLetters([]); }
  }, []);

  useEffect(() => {
    Promise.all([loadLetters(), journalGetLookups().then(setLookups).catch(() => null)])
      .finally(() => setLoading(false));
  }, [loadLetters]);

  const filteredLetters = useMemo(() => {
    let list = letters;
    if (filter === 'incoming') list = list.filter(l => l.incoming_number);
    else if (filter === 'outgoing') list = list.filter(l => l.outgoing_number);
    else if (filter === 'overdue') list = list.filter(l => {
      if (!l.arrival_date || l.send_date) return false;
      return (Date.now() - new Date(l.arrival_date).getTime()) / 86400000 > 5;
    });
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(l =>
        (l.fio || '').toLowerCase().includes(s) ||
        (l.incoming_number || '').toLowerCase().includes(s) ||
        (l.outgoing_number || '').toLowerCase().includes(s) ||
        (l.subject || '').toLowerCase().includes(s)
      );
    }
    return list;
  }, [letters, filter, search]);

  async function handleSelectLetter(letter) {
    try {
      const full = await journalGetLetter(letter.documentId || letter.id);
      setActiveLetter(full?.data || full);
    } catch {
      setActiveLetter(letter);
    }
  }

  async function handleSave(formData) {
    setSaving(true);
    try {
      if (activeLetter?.id) {
        await journalUpdateLetter(activeLetter.documentId || activeLetter.id, formData);
      } else {
        await journalCreateLetter(formData);
      }
      await loadLetters();
      setActiveLetter(null);
    } catch (err) {
      alert('Ошибка: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await journalDeleteLetter(id);
      setActiveLetter(null);
      await loadLetters();
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  }

  if (loading) return <div className="flex items-center justify-center h-96"><div className="animate-spin w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full" /></div>;

  const filters = [
    { key: 'all', label: 'Все' },
    { key: 'incoming', label: 'Входящие' },
    { key: 'outgoing', label: 'Исходящие' },
    { key: 'overdue', label: 'Просрочено' },
  ];

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Журнал приёмной</h1>
          <p className="text-sm text-gray-500">{user.display_name || user.login}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveLetter({})}
            className="px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-xl hover:bg-teal-700 transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Новое письмо
          </button>
          <button onClick={onLogout} title="Выйти"
            className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-6 h-[calc(100vh-180px)]">
        {/* Left: letter list */}
        <div className="w-80 lg:w-96 flex-shrink-0 flex flex-col bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 space-y-3">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по номеру, ФИО, теме..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
            <div className="flex gap-1">
              {filters.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    filter === f.key ? 'bg-teal-100 text-teal-700' : 'text-gray-500 hover:bg-gray-100'
                  }`}>
                  {f.label}
                  {f.key === 'overdue' && (() => {
                    const count = letters.filter(l => !l.send_date && l.arrival_date && (Date.now() - new Date(l.arrival_date).getTime()) / 86400000 > 5).length;
                    return count > 0 ? <span className="ml-1 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{count}</span> : null;
                  })()}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredLetters.length === 0 ? (
              <div className="text-center py-12 text-sm text-gray-400">Нет писем</div>
            ) : (
              filteredLetters.map(l => (
                <LetterItem key={l.id || l.documentId} letter={l}
                  isActive={(activeLetter?.id || activeLetter?.documentId) === (l.id || l.documentId)}
                  onClick={() => handleSelectLetter(l)} />
              ))
            )}
          </div>
        </div>

        {/* Right: form */}
        <div className="flex-1 min-w-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-y-auto p-6">
          {activeLetter ? (
            <LetterForm
              letter={activeLetter.id ? activeLetter : null}
              lookups={lookups}
              onSave={handleSave}
              onDelete={handleDelete}
              onClear={() => setActiveLetter(null)}
              saving={saving}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm">Выберите письмо или создайте новое</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
