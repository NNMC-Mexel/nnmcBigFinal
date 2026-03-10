import { useState, useEffect, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { createBooking } from '../../api/bookings';
import { getBookingsForDate } from '../../api/bookings';
import Modal from '../ui/Modal';

function generateTimeSlots() {
  const slots = [];
  for (let h = 8; h < 20; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  slots.push('20:00');
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

const DAY_NAMES = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];

function isSlotOccupied(slot, bookings) {
  const slotTime = slot + ':00.000';
  return bookings.some((b) => {
    const start = b.startTime;
    const end = b.endTime;
    return slotTime >= start && slotTime < end;
  });
}

function getSlotBooking(slot, bookings) {
  const slotTime = slot + ':00.000';
  return bookings.find((b) => {
    const start = b.startTime;
    const end = b.endTime;
    return slotTime >= start && slotTime < end;
  });
}

export default function BookingForm({ isOpen, onClose, rooms, initialData, onSuccess, currentUser }) {
  const user = currentUser || null;
  const [roomId, setRoomId] = useState(initialData?.roomId || rooms[0]?.id || '');
  const [date, setDate] = useState(initialData?.date || format(new Date(), 'yyyy-MM-dd'));
  const [startSlot, setStartSlot] = useState(
    initialData?.hour ? `${String(initialData.hour).padStart(2, '0')}:00` : null
  );
  const [endSlot, setEndSlot] = useState(
    initialData?.hour ? `${String(initialData.hour + 1).padStart(2, '00')}:00` : null
  );
  const [bookerName, setBookerName] = useState(user?.username || '');
  const [department, setDepartment] = useState('');
  const [topic, setTopic] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [dayBookings, setDayBookings] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectPhase, setSelectPhase] = useState('start');

  const fetchBookings = useCallback(() => {
    if (!roomId || !date) return;
    setLoadingSlots(true);
    getBookingsForDate(date, roomId)
      .then(setDayBookings)
      .catch(() => setDayBookings([]))
      .finally(() => setLoadingSlots(false));
  }, [roomId, date]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    setStartSlot(null);
    setEndSlot(null);
    setSelectPhase('start');
    setError(null);
  }, [roomId, date]);

  const selectableSlots = TIME_SLOTS.slice(0, -1);

  function handleSlotClick(slot) {
    if (isSlotOccupied(slot, dayBookings)) return;

    if (selectPhase === 'start') {
      setStartSlot(slot);
      const idx = TIME_SLOTS.indexOf(slot);
      setEndSlot(TIME_SLOTS[idx + 1] || null);
      setSelectPhase('end');
      setError(null);
    } else {
      if (slot < startSlot) {
        setStartSlot(slot);
        const idx = TIME_SLOTS.indexOf(slot);
        setEndSlot(TIME_SLOTS[idx + 1] || null);
      } else if (slot === startSlot) {
        const idx = TIME_SLOTS.indexOf(slot);
        setEndSlot(TIME_SLOTS[idx + 1] || null);
        setSelectPhase('start');
      } else {
        const startIdx = TIME_SLOTS.indexOf(startSlot);
        const endIdx = TIME_SLOTS.indexOf(slot);
        let blocked = false;
        for (let i = startIdx; i <= endIdx; i++) {
          if (isSlotOccupied(TIME_SLOTS[i], dayBookings)) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          setError('Нельзя выбрать диапазон через занятый слот');
        } else {
          setEndSlot(TIME_SLOTS[endIdx + 1] || TIME_SLOTS[endIdx]);
          setError(null);
        }
        setSelectPhase('start');
      }
    }
  }

  function getSlotState(slot) {
    const occupied = isSlotOccupied(slot, dayBookings);
    if (occupied) return 'occupied';

    if (!startSlot) return 'free';
    if (slot === startSlot && !endSlot) return 'start';
    if (!endSlot) return 'free';

    const endIdx = TIME_SLOTS.indexOf(endSlot);
    const lastSelected = endIdx > 0 ? TIME_SLOTS[endIdx - 1] : endSlot;

    if (slot === startSlot) return 'start';
    if (slot === lastSelected) return 'end';
    if (slot > startSlot && slot < lastSelected) return 'selected';
    return 'free';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!startSlot || !endSlot) {
      setError('Выберите время на сетке');
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      await createBooking({
        roomId,
        date,
        startTime: startSlot,
        endTime: endSlot,
        bookerName,
        department,
        topic,
        userId: user?.id || null,
        isRecurring,
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const selectedDayOfWeek = useMemo(() => {
    if (!date) return null;
    return new Date(date + 'T00:00:00').getDay();
  }, [date]);

  const roomIdx = rooms.findIndex((r) => r.id === roomId);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Забронировать зал">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Room select */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Зал</label>
          <div className="flex gap-2">
            {rooms.map((room, idx) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setRoomId(room.id)}
                className={`flex-1 py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all ${
                  roomId === room.id
                    ? idx === 0
                      ? 'border-room-1 bg-room-1/5 text-room-1'
                      : 'border-room-2 bg-room-2/5 text-room-2'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {room.name}
                {room.capacity && (
                  <span className="block text-xs mt-0.5 opacity-70">
                    до {room.capacity} чел.
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Дата</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={format(new Date(), 'yyyy-MM-dd')}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
        </div>

        {/* Recurring toggle */}
        <div
          className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${
            isRecurring ? 'border-violet-400 bg-violet-50' : 'border-gray-200 bg-white'
          }`}
          onClick={() => setIsRecurring((v) => !v)}
        >
          <div className="flex items-center gap-2.5">
            <svg className={`w-4 h-4 ${isRecurring ? 'text-violet-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <div>
              <div className={`text-sm font-medium ${isRecurring ? 'text-violet-700' : 'text-gray-700'}`}>
                Повторять еженедельно
              </div>
              {isRecurring && selectedDayOfWeek !== null && (
                <div className="text-xs text-violet-500 mt-0.5">
                  Каждый {DAY_NAMES[selectedDayOfWeek]} в {startSlot || '—'}
                </div>
              )}
            </div>
          </div>
          <div className={`w-10 h-6 rounded-full transition-colors relative ${isRecurring ? 'bg-violet-500' : 'bg-gray-200'}`}>
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${isRecurring ? 'translate-x-5' : 'translate-x-1'}`} />
          </div>
        </div>

        {/* Time */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Время</label>

          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1">
              <label className="block text-[11px] text-gray-500 mb-1">С</label>
              <input
                type="time"
                value={startSlot || ''}
                min="08:00"
                max="19:30"
                step="1800"
                onChange={(e) => {
                  const val = e.target.value;
                  setStartSlot(val);
                  if (!endSlot || val >= endSlot) {
                    const [h, m] = val.split(':').map(Number);
                    const endM = m + 30;
                    const endH = h + Math.floor(endM / 60);
                    const newEnd = `${String(endH).padStart(2, '0')}:${String(endM % 60).padStart(2, '0')}`;
                    setEndSlot(newEnd <= '20:00' ? newEnd : '20:00');
                  }
                  setError(null);
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              />
            </div>
            <span className="text-gray-400 mt-5">—</span>
            <div className="flex-1">
              <label className="block text-[11px] text-gray-500 mb-1">До</label>
              <input
                type="time"
                value={endSlot || ''}
                min={startSlot ? startSlot : '08:30'}
                max="20:00"
                step="1800"
                onChange={(e) => {
                  setEndSlot(e.target.value);
                  setError(null);
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              />
            </div>
          </div>

          {loadingSlots ? (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-1.5">
                {selectableSlots.map((slot) => {
                  const state = getSlotState(slot);
                  const booking = state === 'occupied' ? getSlotBooking(slot, dayBookings) : null;

                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={state === 'occupied'}
                      onClick={() => handleSlotClick(slot)}
                      title={
                        state === 'occupied' && booking
                          ? `${booking.bookerName} — ${booking.topic || 'Без темы'}${booking.isRecurring ? ' (еженедельно)' : ''}`
                          : undefined
                      }
                      className={`py-2 px-1 rounded-lg text-xs font-medium transition-all ${
                        state === 'occupied'
                          ? booking?.isRecurring
                            ? 'bg-violet-100 text-violet-400 cursor-not-allowed line-through'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed line-through'
                          : state === 'start'
                          ? 'bg-primary text-white shadow-sm ring-2 ring-primary/30'
                          : state === 'end'
                          ? 'bg-primary text-white shadow-sm ring-2 ring-primary/30'
                          : state === 'selected'
                          ? 'bg-primary/80 text-white'
                          : 'bg-white border border-gray-200 text-gray-700 hover:border-primary hover:text-primary hover:bg-primary/5'
                      }`}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-500">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-white border border-gray-200" />
                  <span>Свободно</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-primary" />
                  <span>Ваш выбор</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-gray-100" />
                  <span>Занято</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-violet-100" />
                  <span>Еженедельно</span>
                </div>
              </div>

              <p className="text-[11px] text-gray-400 mt-1">
                {selectPhase === 'start'
                  ? 'Нажмите на слот начала или введите время вручную'
                  : 'Теперь нажмите на слот окончания'}
              </p>
            </>
          )}
        </div>

        {/* Booker name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Ваше имя</label>
          <input
            type="text"
            value={bookerName}
            onChange={(e) => setBookerName(e.target.value)}
            required
            placeholder="Иван Иванов"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
        </div>

        {/* Department */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Отдел</label>
          <input
            type="text"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            required
            placeholder="Маркетинг"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
        </div>

        {/* Topic */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Тема встречи</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Планёрка (необязательно)"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
          />
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !startSlot || !endSlot}
          className="w-full py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting
            ? 'Бронирование...'
            : startSlot && endSlot
            ? isRecurring
              ? `Забронировать еженедельно ${startSlot} — ${endSlot}`
              : `Забронировать ${startSlot} — ${endSlot}`
            : 'Выберите время'}
        </button>
      </form>
    </Modal>
  );
}
