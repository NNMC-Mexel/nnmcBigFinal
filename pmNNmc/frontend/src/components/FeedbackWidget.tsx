import { useEffect, useState } from 'react';
import { Send, Loader2, MessageCircle, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import Modal from './ui/Modal';
import client from '../api/client';

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [bubbleVisible, setBubbleVisible] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const handleScroll = () => {
      setIsScrolling(true);
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => setIsScrolling(false), 700);
    };

    document.addEventListener('scroll', handleScroll, true);
    window.addEventListener('touchmove', handleScroll, { passive: true });

    return () => {
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('touchmove', handleScroll);
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await client.post('/feedback', {
        message: message.trim(),
        page: location.pathname,
      });
      setSent(true);
      setMessage('');
      setTimeout(() => {
        setOpen(false);
        setSent(false);
      }, 1500);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Не удалось отправить');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+96px)] right-0 z-20 flex items-end gap-2 sm:bottom-5 sm:right-5 sm:z-30">
        {bubbleVisible && (
          <div className="pointer-events-auto relative hidden sm:flex items-center gap-2 bg-white text-slate-700 pl-3 pr-2 py-2 rounded-2xl shadow-md text-sm max-w-[220px] mb-1 animate-in fade-in">
            <span>Что-то работает не так?<br />Сообщи нам!</span>
            <button
              onClick={() => setBubbleVisible(false)}
              aria-label="Скрыть подсказку"
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <span className="absolute right-[-6px] bottom-3 w-3 h-3 bg-white rotate-45 shadow-md" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }} />
          </div>
        )}
        <button
          onClick={() => setOpen(true)}
          aria-label="Предложить улучшение"
          title="Предложить улучшение"
          className={`flex h-11 w-9 items-center justify-center rounded-l-full bg-white text-indigo-600 shadow-lg ring-1 ring-indigo-100 transition-all duration-200 hover:bg-slate-50 sm:h-16 sm:w-16 sm:rounded-full sm:overflow-hidden sm:ring-2 ${
            isScrolling ? 'pointer-events-none translate-x-6 opacity-0 sm:pointer-events-auto sm:translate-x-0 sm:opacity-100' : 'pointer-events-auto opacity-90 sm:opacity-100'
          }`}
        >
          <MessageCircle className="h-5 w-5 sm:hidden" />
          <img
            src="/feedback-robot.gif"
            alt="Робот-помощник"
            className="hidden h-full w-full object-cover sm:block"
          />
        </button>
      </div>

      <Modal
        isOpen={open}
        onClose={() => !sending && setOpen(false)}
        title="Предложение по улучшению"
        size="md"
      >
        {sent ? (
          <div className="text-center py-4 text-green-600">Спасибо! Отправлено.</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Что улучшить? Что сломано? Что добавить?"
              rows={6}
              maxLength={4000}
              required
              className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            {error && <div className="text-sm text-red-600">{error}</div>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={sending || !message.trim()}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-2"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Отправить
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
