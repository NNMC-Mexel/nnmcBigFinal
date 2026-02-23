import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Newspaper,
  Pin,
  Search,
  Settings2,
  Clock,
  FileText,
  X,
  Download,
  Image as ImageIcon,
  Music,
  Video,
  Paperclip,
  RefreshCw,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { useUserRole } from '../../store/authStore';
import {
  newsApi,
  NewsPost,
  getMediaUrl,
  getAuthorName,
  getAuthorInitials,
} from '../../api/news';
import Loader from '../../components/ui/Loader';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'ALL', label: 'Все' },
  { key: 'NEWS', label: 'Новости' },
  { key: 'ANNOUNCEMENT', label: 'Объявления' },
  { key: 'EVENT', label: 'События' },
  { key: 'UPDATE', label: 'Обновления' },
];

const CATEGORY_CONFIG: Record<string, { label: string; color: string; dot: string; gradient: string }> = {
  NEWS: {
    label: 'Новость',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
    gradient: 'from-blue-500 via-blue-600 to-indigo-700',
  },
  ANNOUNCEMENT: {
    label: 'Объявление',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
    gradient: 'from-amber-400 via-orange-500 to-red-500',
  },
  EVENT: {
    label: 'Событие',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    gradient: 'from-emerald-400 via-green-500 to-teal-600',
  },
  UPDATE: {
    label: 'Обновление',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    dot: 'bg-purple-500',
    gradient: 'from-purple-500 via-violet-600 to-indigo-600',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин назад`;
  if (diffHour < 24) return `${diffHour} ч назад`;
  if (diffDay === 1)
    return `вчера в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  if (diffDay < 7) return `${diffDay} дн назад`;

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getAttachmentIcon(mime: string) {
  if (mime.startsWith('image/')) return <ImageIcon className="w-4 h-4" />;
  if (mime.startsWith('video/')) return <Video className="w-4 h-4" />;
  if (mime.startsWith('audio/')) return <Music className="w-4 h-4" />;
  return <FileText className="w-4 h-4" />;
}

function formatFileSize(kb: number): string {
  if (kb < 1024) return `${Math.round(kb)} КБ`;
  return `${(kb / 1024).toFixed(1)} МБ`;
}

// ─── Author Avatar ─────────────────────────────────────────────────────────────

function AuthorAvatar({ author, size = 'sm' }: { author?: NewsPost['author']; size?: 'sm' | 'md' }) {
  const initials = getAuthorInitials(author);
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  return (
    <div
      className={`${sz} rounded-full bg-gradient-to-br from-primary-500 to-medical-500 flex items-center justify-center text-white font-bold flex-shrink-0`}
    >
      {initials || '?'}
    </div>
  );
}

// ─── Post Detail Modal ─────────────────────────────────────────────────────────

function PostDetailModal({ post, onClose }: { post: NewsPost; onClose: () => void }) {
  const cfg = CATEGORY_CONFIG[post.category] || CATEGORY_CONFIG.NEWS;
  const coverUrl = getMediaUrl(post.coverImage?.url);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Cover */}
        {coverUrl ? (
          <div className="relative h-56 flex-shrink-0 overflow-hidden">
            <img src={coverUrl} alt={post.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className={`relative h-20 flex-shrink-0 bg-gradient-to-r ${cfg.gradient}`}>
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Meta row */}
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            {post.pinned && (
              <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-semibold">
                <Pin className="w-3.5 h-3.5" />
                Закреплено
              </span>
            )}
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
            <span className="flex items-center gap-1 text-slate-400 text-xs ml-auto">
              <Clock className="w-3.5 h-3.5" />
              {formatFullDate(post.createdAt)}
            </span>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-slate-900 leading-tight mb-4">{post.title}</h2>

          {/* Author */}
          <div className="flex items-center gap-2.5 mb-5 pb-5 border-b border-slate-100">
            <AuthorAvatar author={post.author} size="md" />
            <div>
              <p className="text-sm font-medium text-slate-800">{getAuthorName(post.author)}</p>
              <p className="text-xs text-slate-400">Автор публикации</p>
            </div>
          </div>

          {/* Excerpt */}
          {post.excerpt && (
            <p className="text-base text-slate-600 font-medium italic mb-4 p-3 bg-slate-50 rounded-lg border-l-4 border-primary-300">
              {post.excerpt}
            </p>
          )}

          {/* Content */}
          {post.content && (
            <div className="prose prose-slate max-w-none text-slate-700 leading-relaxed whitespace-pre-wrap text-sm">
              {post.content}
            </div>
          )}

          {/* Attachments */}
          {post.attachments && post.attachments.length > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-100">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" />
                Вложения ({post.attachments.length})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {post.attachments.map((att) => {
                  const url = getMediaUrl(att.url);
                  const isImage = att.mime?.startsWith('image/');
                  const isVideo = att.mime?.startsWith('video/');
                  const isAudio = att.mime?.startsWith('audio/');

                  return (
                    <div key={att.id} className="border border-slate-200 rounded-xl overflow-hidden">
                      {isImage && (
                        <img
                          src={url}
                          alt={att.name}
                          className="w-full h-32 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => window.open(url, '_blank')}
                        />
                      )}
                      {isVideo && (
                        <video src={url} controls className="w-full h-32 bg-black" />
                      )}
                      {isAudio && (
                        <div className="p-3 bg-slate-50">
                          <audio src={url} controls className="w-full" />
                        </div>
                      )}
                      <div className="flex items-center gap-2 p-2.5">
                        <span className="text-slate-400 flex-shrink-0">
                          {getAttachmentIcon(att.mime)}
                        </span>
                        <span className="text-xs text-slate-600 truncate flex-1">{att.name}</span>
                        <span className="text-xs text-slate-400 flex-shrink-0">
                          {formatFileSize(att.size)}
                        </span>
                        <a
                          href={url}
                          download={att.name}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 text-primary-500 hover:text-primary-700 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── News Card ─────────────────────────────────────────────────────────────────

function NewsCard({ post, onClick }: { post: NewsPost; onClick: () => void }) {
  const cfg = CATEGORY_CONFIG[post.category] || CATEGORY_CONFIG.NEWS;
  const coverUrl = getMediaUrl(post.coverImage?.url);
  const attCount = post.attachments?.length || 0;

  return (
    <article
      onClick={onClick}
      className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-slate-300 transition-all duration-200 cursor-pointer overflow-hidden flex flex-col"
    >
      {/* Cover image / gradient */}
      <div className="relative overflow-hidden" style={{ aspectRatio: '16/9' }}>
        {coverUrl ? (
          <>
            <img
              src={coverUrl}
              alt={post.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          </>
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${cfg.gradient} flex items-center justify-center`}>
            <Newspaper className="w-10 h-10 text-white/40" />
          </div>
        )}

        {/* Badges overlay */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          {post.pinned && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/90 backdrop-blur-sm text-white text-xs font-semibold shadow">
              <Pin className="w-3 h-3" />
              Закреплено
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/90 backdrop-blur-sm text-xs font-semibold shadow border ${cfg.color}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col p-4">
        <h3 className="font-bold text-slate-900 text-base leading-snug line-clamp-2 mb-1.5 group-hover:text-primary-700 transition-colors">
          {post.title}
        </h3>

        {post.excerpt ? (
          <p className="text-sm text-slate-500 line-clamp-3 leading-relaxed flex-1">
            {post.excerpt}
          </p>
        ) : post.content ? (
          <p className="text-sm text-slate-500 line-clamp-3 leading-relaxed flex-1">
            {post.content}
          </p>
        ) : (
          <div className="flex-1" />
        )}

        {/* Footer */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
          <AuthorAvatar author={post.author} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-700 truncate">{getAuthorName(post.author)}</p>
            <p className="text-xs text-slate-400 flex items-center gap-1" title={formatFullDate(post.createdAt)}>
              <Clock className="w-3 h-3" />
              {formatRelativeDate(post.createdAt)}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {attCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Paperclip className="w-3.5 h-3.5" />
                {attCount}
              </span>
            )}
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-primary-400 transition-colors" />
          </div>
        </div>
      </div>
    </article>
  );
}

// ─── Pinned Hero Card ──────────────────────────────────────────────────────────

function PinnedHeroCard({ post, onClick }: { post: NewsPost; onClick: () => void }) {
  const cfg = CATEGORY_CONFIG[post.category] || CATEGORY_CONFIG.NEWS;
  const coverUrl = getMediaUrl(post.coverImage?.url);
  const attCount = post.attachments?.length || 0;

  return (
    <article
      onClick={onClick}
      className="group relative bg-white rounded-2xl border border-amber-200 shadow-md hover:shadow-xl transition-all duration-200 cursor-pointer overflow-hidden"
    >
      {/* Amber top accent */}
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 z-10" />

      <div className="flex flex-col sm:flex-row">
        {/* Cover */}
        <div className="relative sm:w-72 flex-shrink-0 overflow-hidden" style={{ minHeight: 180 }}>
          {coverUrl ? (
            <>
              <img
                src={coverUrl}
                alt={post.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 absolute inset-0"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/20" />
            </>
          ) : (
            <div className={`w-full h-full min-h-[180px] bg-gradient-to-br ${cfg.gradient} flex items-center justify-center`}>
              <Newspaper className="w-14 h-14 text-white/30" />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-bold">
              <Pin className="w-3.5 h-3.5" />
              ЗАКРЕПЛЕНО
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.color}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
          </div>

          <h3 className="font-bold text-slate-900 text-xl leading-snug mb-2 group-hover:text-primary-700 transition-colors line-clamp-2">
            {post.title}
          </h3>

          {(post.excerpt || post.content) && (
            <p className="text-sm text-slate-500 line-clamp-3 leading-relaxed flex-1 mb-3">
              {post.excerpt || post.content}
            </p>
          )}

          <div className="flex items-center gap-2 mt-auto pt-3 border-t border-slate-100">
            <AuthorAvatar author={post.author} size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">{getAuthorName(post.author)}</p>
              <p className="text-xs text-slate-400 flex items-center gap-1" title={formatFullDate(post.createdAt)}>
                <Clock className="w-3 h-3" />
                {formatRelativeDate(post.createdAt)}
              </p>
            </div>
            {attCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Paperclip className="w-3.5 h-3.5" />
                {attCount}
              </span>
            )}
            <span className="text-xs font-medium text-primary-600 flex items-center gap-0.5 group-hover:gap-1 transition-all">
              Читать <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function NewsFeedPage() {
  const navigate = useNavigate();
  const { isAdmin, isSuperAdmin } = useUserRole();
  const canManage = isAdmin || isSuperAdmin;

  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedPost, setSelectedPost] = useState<NewsPost | null>(null);
  const [total, setTotal] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await newsApi.getPublished({
        category: activeCategory,
        search: debouncedSearch,
      });
      setPosts(result.data);
      setTotal(result.total);
    } catch {
      setError('Не удалось загрузить новости. Проверьте подключение к серверу.');
    } finally {
      setIsLoading(false);
    }
  }, [activeCategory, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const pinnedPosts = posts.filter((p) => p.pinned);
  const regularPosts = posts.filter((p) => !p.pinned);

  return (
    <div className="max-w-6xl mx-auto">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-medical-500 flex items-center justify-center">
              <Newspaper className="w-4.5 h-4.5 text-white w-5 h-5" />
            </div>
            Новостная лента
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {total > 0 ? `${total} публикаций` : 'Новости и объявления организации'}
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => navigate('/app/news-admin')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors"
          >
            <Settings2 className="w-4 h-4" />
            Управление
          </button>
        )}
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Category pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                activeCategory === cat.key
                  ? 'bg-primary-600 text-white shadow-sm shadow-primary-200'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-primary-300 hover:text-primary-600'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative sm:ml-auto sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по новостям..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <p className="text-slate-600 font-medium mb-1">Ошибка загрузки</p>
          <p className="text-sm text-slate-400 mb-4">{error}</p>
          <button
            onClick={load}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-50 text-primary-700 text-sm font-medium hover:bg-primary-100 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Повторить
          </button>
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <Newspaper className="w-8 h-8 text-slate-300" />
          </div>
          <p className="text-slate-600 font-medium mb-1">Новостей пока нет</p>
          <p className="text-sm text-slate-400">
            {search || activeCategory !== 'ALL'
              ? 'Попробуйте изменить фильтры'
              : 'Скоро здесь появятся первые публикации'}
          </p>
          {canManage && (
            <button
              onClick={() => navigate('/app/news-admin')}
              className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-50 text-primary-700 text-sm font-medium hover:bg-primary-100 transition-colors"
            >
              Создать первую новость
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pinned posts */}
          {pinnedPosts.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Pin className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
                  Закреплённые
                </span>
                <div className="flex-1 h-px bg-amber-100" />
              </div>
              <div className="space-y-3">
                {pinnedPosts.map((post) => (
                  <PinnedHeroCard key={post.id} post={post} onClick={() => setSelectedPost(post)} />
                ))}
              </div>
            </section>
          )}

          {/* Regular posts grid */}
          {regularPosts.length > 0 && (
            <section>
              {pinnedPosts.length > 0 && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Лента
                  </span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {regularPosts.map((post) => (
                  <NewsCard key={post.id} post={post} onClick={() => setSelectedPost(post)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Post Detail Modal ──────────────────────────────────────────────── */}
      {selectedPost && (
        <PostDetailModal post={selectedPost} onClose={() => setSelectedPost(null)} />
      )}
    </div>
  );
}
