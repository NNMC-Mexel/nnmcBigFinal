import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Pin,
  PinOff,
  Newspaper,
  Upload,
  X,
  Image as ImageIcon,
  FileText,
  Music,
  Video,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Search,
  Filter,
} from 'lucide-react';
import {
  newsApi,
  NewsPost,
  NewsAttachment,
  getMediaUrl,
  getAuthorName,
  getAuthorInitials,
} from '../../api/news';
import Loader from '../../components/ui/Loader';

// ─── Config ───────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: 'NEWS', label: 'Новость' },
  { value: 'ANNOUNCEMENT', label: 'Объявление' },
  { value: 'EVENT', label: 'Событие' },
  { value: 'UPDATE', label: 'Обновление' },
];

const CATEGORY_COLORS: Record<string, string> = {
  NEWS: 'bg-blue-100 text-blue-700',
  ANNOUNCEMENT: 'bg-amber-100 text-amber-700',
  EVENT: 'bg-emerald-100 text-emerald-700',
  UPDATE: 'bg-purple-100 text-purple-700',
};

const CATEGORY_LABELS: Record<string, string> = {
  NEWS: 'Новость',
  ANNOUNCEMENT: 'Объявление',
  EVENT: 'Событие',
  UPDATE: 'Обновление',
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getAttachmentIcon(mime: string) {
  if (mime?.startsWith('image/')) return <ImageIcon className="w-4 h-4" />;
  if (mime?.startsWith('video/')) return <Video className="w-4 h-4" />;
  if (mime?.startsWith('audio/')) return <Music className="w-4 h-4" />;
  return <FileText className="w-4 h-4" />;
}

// ─── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, type, onDismiss }: { message: string; type: 'success' | 'error'; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm transition-all ${
        type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
      }`}
    >
      {type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
      <span>{message}</span>
      <button onClick={onDismiss} className="ml-auto opacity-70 hover:opacity-100">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── File Uploader ─────────────────────────────────────────────────────────────

function FileDropZone({
  label,
  multiple,
  accept,
  files,
  existingFiles,
  onFilesChange,
  onRemoveExisting,
}: {
  label: string;
  multiple?: boolean;
  accept: string;
  files: File[];
  existingFiles?: NewsAttachment[];
  onFilesChange: (files: File[]) => void;
  onRemoveExisting?: (id: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    onFilesChange(multiple ? [...files, ...dropped] : dropped.slice(0, 1));
  };

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    onFilesChange(multiple ? [...files, ...picked] : picked.slice(0, 1));
    e.target.value = '';
  };

  const removeNew = (idx: number) => {
    onFilesChange(files.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</label>

      {/* Existing files */}
      {existingFiles && existingFiles.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {existingFiles.map((att) => {
            const url = getMediaUrl(att.url);
            const isImage = att.mime?.startsWith('image/');
            return (
              <div key={att.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                {isImage && (
                  <img src={url} alt={att.name} className="w-10 h-10 object-cover rounded" />
                )}
                {!isImage && (
                  <span className="w-10 h-10 flex items-center justify-center bg-white rounded border border-slate-200 text-slate-400">
                    {getAttachmentIcon(att.mime)}
                  </span>
                )}
                <span className="text-xs text-slate-600 flex-1 truncate">{att.name}</span>
                {onRemoveExisting && (
                  <button
                    type="button"
                    onClick={() => onRemoveExisting(att.id)}
                    className="text-red-400 hover:text-red-600 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New files queue */}
      {files.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {files.map((f, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-blue-50 border border-blue-200">
              <span className="text-blue-400">{getAttachmentIcon(f.type)}</span>
              <span className="text-xs text-blue-700 flex-1 truncate">{f.name}</span>
              <button type="button" onClick={() => removeNew(idx)} className="text-blue-400 hover:text-red-500 p-0.5">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      {(multiple || files.length === 0) && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            dragOver
              ? 'border-primary-400 bg-primary-50'
              : 'border-slate-200 bg-slate-50 hover:border-primary-300 hover:bg-primary-50/40'
          }`}
        >
          <Upload className={`w-5 h-5 ${dragOver ? 'text-primary-500' : 'text-slate-400'}`} />
          <p className="text-xs text-slate-500 text-center">
            Перетащите файл или{' '}
            <span className="text-primary-600 font-medium">выберите</span>
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            className="hidden"
            onChange={handlePick}
          />
        </div>
      )}
    </div>
  );
}

// ─── Post Form Modal ───────────────────────────────────────────────────────────

interface FormState {
  title: string;
  excerpt: string;
  content: string;
  category: string;
  pinned: boolean;
  published: boolean;
}

function PostFormModal({
  post,
  onSave,
  onClose,
}: {
  post: NewsPost | null;
  onSave: () => void;
  onClose: () => void;
}) {
  const isEdit = !!post;
  const [form, setForm] = useState<FormState>({
    title: post?.title || '',
    excerpt: post?.excerpt || '',
    content: post?.content || '',
    category: post?.category || 'NEWS',
    pinned: post?.pinned || false,
    published: post?.published || false,
  });

  const [coverFiles, setCoverFiles] = useState<File[]>([]);
  const [attFiles, setAttFiles] = useState<File[]>([]);
  const [existingCover, setExistingCover] = useState<NewsAttachment | null>(
    post?.coverImage || null
  );
  const [existingAtts, setExistingAtts] = useState<NewsAttachment[]>(
    post?.attachments || []
  );
  const [removedAttIds, setRemovedAttIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Введите заголовок'); return; }
    setSaving(true);
    setError(null);

    try {
      let coverImageId: number | null | undefined = existingCover?.id ?? undefined;
      if (existingCover === null && post?.coverImage) coverImageId = null; // removed

      // Upload cover
      if (coverFiles.length > 0) {
        const uploaded = await newsApi.uploadFiles(coverFiles);
        coverImageId = uploaded[0]?.id;
      }

      // Upload new attachments
      let newAttIds: number[] = [];
      if (attFiles.length > 0) {
        const uploaded = await newsApi.uploadFiles(attFiles);
        newAttIds = uploaded.map((a) => a.id);
      }

      const keptAttIds = existingAtts
        .filter((a) => !removedAttIds.includes(a.id))
        .map((a) => a.id);

      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        excerpt: form.excerpt.trim() || null,
        content: form.content.trim() || null,
        category: form.category,
        pinned: form.pinned,
        published: form.published,
        attachments: [...keptAttIds, ...newAttIds],
      };
      if (coverImageId !== undefined) payload.coverImage = coverImageId;

      if (isEdit && post) {
        await newsApi.update(post.documentId, payload as Partial<NewsPost>);
      } else {
        await newsApi.create(payload as Partial<NewsPost>);
      }

      onSave();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg || 'Ошибка при сохранении');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-2xl max-h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-900">
            {isEdit ? 'Редактировать публикацию' : 'Новая публикация'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Заголовок *
            </label>
            <input
              type="text"
              value={form.title}
              onChange={set('title')}
              placeholder="Введите заголовок публикации"
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 transition-all placeholder-slate-300"
              required
            />
          </div>

          {/* Category + Pinned row */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-36">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Категория
              </label>
              <select
                value={form.category}
                onChange={set('category')}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 transition-all"
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2 pt-6">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div
                  onClick={() => setForm((p) => ({ ...p, pinned: !p.pinned }))}
                  className={`relative w-10 h-5.5 rounded-full transition-colors cursor-pointer h-[22px] ${
                    form.pinned ? 'bg-amber-500' : 'bg-slate-200'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      form.pinned ? 'translate-x-[22px]' : 'translate-x-0.5'
                    }`}
                  />
                </div>
                <span className="text-sm text-slate-700 flex items-center gap-1">
                  <Pin className="w-3.5 h-3.5 text-amber-500" />
                  Закрепить
                </span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div
                  onClick={() => setForm((p) => ({ ...p, published: !p.published }))}
                  className={`relative w-10 h-[22px] rounded-full transition-colors cursor-pointer ${
                    form.published ? 'bg-emerald-500' : 'bg-slate-200'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      form.published ? 'translate-x-[22px]' : 'translate-x-0.5'
                    }`}
                  />
                </div>
                <span className="text-sm text-slate-700 flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5 text-emerald-500" />
                  Опубликовать
                </span>
              </label>
            </div>
          </div>

          {/* Excerpt */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Краткое описание
            </label>
            <textarea
              value={form.excerpt}
              onChange={set('excerpt')}
              placeholder="Короткий анонс, отображается в карточке ленты"
              rows={2}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 transition-all placeholder-slate-300 resize-none"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Полный текст
            </label>
            <textarea
              value={form.content}
              onChange={set('content')}
              placeholder="Текст публикации (поддерживается форматирование абзацев)"
              rows={8}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 transition-all placeholder-slate-300 resize-y"
            />
          </div>

          {/* Cover image */}
          <FileDropZone
            label="Обложка"
            accept="image/*"
            files={coverFiles}
            existingFiles={existingCover ? [existingCover] : []}
            onFilesChange={setCoverFiles}
            onRemoveExisting={() => setExistingCover(null)}
          />

          {/* Attachments */}
          <FileDropZone
            label="Вложения (файлы, видео, аудио)"
            accept="*/*"
            multiple
            files={attFiles}
            existingFiles={existingAtts.filter((a) => !removedAttIds.includes(a.id))}
            onFilesChange={setAttFiles}
            onRemoveExisting={(id) => setRemovedAttIds((prev) => [...prev, id])}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-colors disabled:opacity-60"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Delete Confirm ────────────────────────────────────────────────────────────

function DeleteConfirm({ post, onConfirm, onCancel, loading }: {
  post: NewsPost;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4 mx-auto">
          <Trash2 className="w-6 h-6 text-red-500" />
        </div>
        <h3 className="text-lg font-bold text-center text-slate-900 mb-1">Удалить публикацию?</h3>
        <p className="text-sm text-center text-slate-500 mb-5 line-clamp-2">«{post.title}»</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            Отмена
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Admin Page ───────────────────────────────────────────────────────────

export default function NewsAdminPage() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all');

  const [showForm, setShowForm] = useState(false);
  const [editPost, setEditPost] = useState<NewsPost | null>(null);
  const [deletePost, setDeletePost] = useState<NewsPost | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
  };

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await newsApi.getAll();
      setPosts(data);
    } catch {
      showToast('Ошибка загрузки новостей', 'error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    showToast(editPost ? 'Публикация обновлена' : 'Публикация создана');
    setShowForm(false);
    setEditPost(null);
    await load();
  };

  const handleDelete = async () => {
    if (!deletePost) return;
    setDeleting(true);
    try {
      await newsApi.delete(deletePost.documentId);
      showToast('Публикация удалена');
      setDeletePost(null);
      await load();
    } catch {
      showToast('Ошибка при удалении', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const togglePublish = async (post: NewsPost) => {
    setTogglingId(post.documentId);
    try {
      await newsApi.update(post.documentId, { published: !post.published });
      showToast(post.published ? 'Снято с публикации' : 'Опубликовано');
      await load();
    } catch {
      showToast('Ошибка при изменении статуса', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const togglePin = async (post: NewsPost) => {
    setTogglingId(post.documentId);
    try {
      await newsApi.update(post.documentId, { pinned: !post.pinned });
      showToast(post.pinned ? 'Откреплено' : 'Закреплено');
      await load();
    } catch {
      showToast('Ошибка', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const filtered = posts.filter((p) => {
    const matchSearch =
      !search || p.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      filterStatus === 'all' ||
      (filterStatus === 'published' && p.published) ||
      (filterStatus === 'draft' && !p.published);
    return matchSearch && matchStatus;
  });

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/app/news')}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-primary-500" />
            Управление новостями
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">{posts.length} публикаций всего</p>
        </div>
        <button
          onClick={() => { setEditPost(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold transition-colors shadow-sm shadow-primary-200"
        >
          <Plus className="w-4 h-4" />
          Новая публикация
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по заголовку..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {(['all', 'published', 'draft'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                filterStatus === s
                  ? 'bg-primary-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-primary-300'
              }`}
            >
              {s === 'all' ? 'Все' : s === 'published' ? 'Опубликованные' : 'Черновики'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Всего', value: posts.length, color: 'text-slate-700' },
          { label: 'Опубликовано', value: posts.filter((p) => p.published).length, color: 'text-emerald-600' },
          { label: 'Черновики', value: posts.filter((p) => !p.published).length, color: 'text-amber-600' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3 text-center">
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
            <Newspaper className="w-7 h-7 text-slate-300" />
          </div>
          <p className="text-slate-500 font-medium">
            {search || filterStatus !== 'all' ? 'Ничего не найдено' : 'Публикаций пока нет'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((post) => {
            const coverUrl = getMediaUrl(post.coverImage?.url);
            const catCfg = CATEGORY_LABELS[post.category] || post.category;
            const catColor = CATEGORY_COLORS[post.category] || 'bg-slate-100 text-slate-600';
            const isBusy = togglingId === post.documentId;

            return (
              <div
                key={post.documentId}
                className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all"
              >
                {/* Cover thumbnail */}
                <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
                  {coverUrl ? (
                    <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Newspaper className="w-6 h-6 text-slate-300" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catColor}`}>
                      {catCfg}
                    </span>
                    {post.pinned && (
                      <span className="text-xs text-amber-500 flex items-center gap-0.5 font-medium">
                        <Pin className="w-3 h-3" /> Закреплено
                      </span>
                    )}
                    <span
                      className={`text-xs flex items-center gap-1 font-medium ml-auto ${
                        post.published ? 'text-emerald-600' : 'text-slate-400'
                      }`}
                    >
                      {post.published ? (
                        <><Eye className="w-3.5 h-3.5" />Опубликовано</>
                      ) : (
                        <><EyeOff className="w-3.5 h-3.5" />Черновик</>
                      )}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800 truncate">{post.title}</p>
                  <p className="text-xs text-slate-400">{formatDate(post.createdAt)}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => togglePin(post)}
                    disabled={isBusy}
                    title={post.pinned ? 'Открепить' : 'Закрепить'}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      post.pinned
                        ? 'text-amber-500 bg-amber-50 hover:bg-amber-100'
                        : 'text-slate-400 hover:bg-slate-100 hover:text-amber-500'
                    }`}
                  >
                    {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : post.pinned ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => togglePublish(post)}
                    disabled={isBusy}
                    title={post.published ? 'Снять с публикации' : 'Опубликовать'}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      post.published
                        ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                        : 'text-slate-400 hover:bg-slate-100 hover:text-emerald-500'
                    }`}
                  >
                    {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : post.published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => { setEditPost(post); setShowForm(true); }}
                    title="Редактировать"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setDeletePost(post)}
                    title="Удалить"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <PostFormModal
          post={editPost}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditPost(null); }}
        />
      )}

      {deletePost && (
        <DeleteConfirm
          post={deletePost}
          onConfirm={handleDelete}
          onCancel={() => setDeletePost(null)}
          loading={deleting}
        />
      )}

      {toast && (
        <Toast message={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
