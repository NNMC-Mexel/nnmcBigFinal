import { useState } from 'react';
import { Bot, Send, Loader2, X } from 'lucide-react';
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
  const location = useLocation();

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
      <div className="fixed bottom-5 right-5 z-40 flex items-end gap-2">
        {bubbleVisible && (
          <div className="relative hidden sm:flex items-center gap-2 bg-white text-slate-700 pl-3 pr-2 py-2 rounded-2xl shadow-md text-sm max-w-[220px] mb-1 animate-in fade-in">
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
          className="w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg flex items-center justify-center transition-colors"
        >
          <Bot className="w-7 h-7" />
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
