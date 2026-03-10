import { useState, useMemo, useEffect } from 'react';
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  format,
  addDays,
  isToday,
  isSameDay,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { useBookings } from '../../hooks/useBookings';
import { getBookings } from '../../api/bookings';

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8:00 — 20:00
const ROOM_COLORS = ['bg-room-1', 'bg-room-2'];

function shortName(name) {
  return name?.split(' ')[0] || name;
}
const ROOM_TEXT_COLORS = ['text-room-1', 'text-room-2'];
const ROOM_BG_LIGHT = ['bg-room-1/10', 'bg-room-2/10'];
const ROOM_BORDER = ['border-room-1/30', 'border-room-2/30'];

export default function Calendar({ rooms, onSlotClick, onBookingClick, onBookingsLoaded }) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );

  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
  const dateFrom = format(currentWeekStart, 'yyyy-MM-dd');
  const dateTo = format(weekEnd, 'yyyy-MM-dd');

  const { bookings } = useBookings({ dateFrom, dateTo });

  // Fetch all recurring bookings once (refetch when component remounts via key)
  const [recurringBookings, setRecurringBookings] = useState([]);
  useEffect(() => {
    getBookings({ isRecurring: true })
      .then((data) => setRecurringBookings(data || []))
      .catch(() => setRecurringBookings([]));
  }, []);

  // Merge regular + synthesized recurring instances for current week
  const allBookings = useMemo(() => {
    const days7 = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
    const instances = [];
    for (const day of days7) {
      const dayOfWeek = day.getDay();
      const dateStr = format(day, 'yyyy-MM-dd');
      for (const rb of recurringBookings) {
        if (rb.recurringDayOfWeek === dayOfWeek) {
          instances.push({ ...rb, date: dateStr, _recurringInstance: true });
        }
      }
    }
    return [...bookings, ...instances];
  }, [bookings, recurringBookings, currentWeekStart]);

  useEffect(() => {
    onBookingsLoaded?.(allBookings);
  }, [allBookings]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  }, [currentWeekStart]);

  const [selectedDay, setSelectedDay] = useState(null);
  const viewDay = selectedDay || new Date();

  function getBookingsForSlot(roomId, date, hour) {
    const dateStr = format(date, 'yyyy-MM-dd');
    return allBookings.filter((b) => {
      const bRoom = b.room?.id || b.room?.data?.id;
      const startHour = parseInt(b.startTime?.split(':')[0], 10);
      const endHour = parseInt(b.endTime?.split(':')[0], 10);
      const endMin = parseInt(b.endTime?.split(':')[1], 10);
      const effectiveEnd = endMin > 0 ? endHour + 1 : endHour;
      return bRoom === roomId && b.date === dateStr && hour >= startHour && hour < effectiveEnd;
    });
  }

  function getBookingsStartingAt(roomId, date, hour) {
    const dateStr = format(date, 'yyyy-MM-dd');
    return allBookings.filter((b) => {
      const bRoom = b.room?.id || b.room?.data?.id;
      const startHour = parseInt(b.startTime?.split(':')[0], 10);
      return bRoom === roomId && b.date === dateStr && startHour === hour;
    });
  }

  function getBookingSpan(booking) {
    const startH = parseInt(booking.startTime?.split(':')[0], 10);
    const startM = parseInt(booking.startTime?.split(':')[1], 10);
    const endH = parseInt(booking.endTime?.split(':')[0], 10);
    const endM = parseInt(booking.endTime?.split(':')[1], 10);
    const startFrac = startM / 60;
    const totalHours = (endH + endM / 60) - (startH + startM / 60);
    return { offsetFrac: startFrac, spanHours: totalHours };
  }

  function renderBookingBlock(booking, idx, heightUnit) {
    const { offsetFrac, spanHours } = getBookingSpan(booking);
    const isRec = booking.isRecurring;
    const bgClass = isRec
      ? idx === 0 ? 'bg-violet-100' : 'bg-violet-100'
      : ROOM_BG_LIGHT[idx];
    const borderClass = isRec
      ? 'border-violet-300'
      : ROOM_BORDER[idx];
    const textClass = isRec ? 'text-violet-700' : ROOM_TEXT_COLORS[idx];

    return (
      <div
        key={(booking.id || booking.documentId) + '_' + booking.date}
        className={`absolute ${idx === 0 ? 'left-0.5 right-1/2' : 'left-1/2 right-0.5'} ${bgClass} ${borderClass} border rounded-lg px-1.5 py-0.5 cursor-pointer hover:shadow-md transition-shadow overflow-hidden z-10`}
        style={{
          top: `${offsetFrac * heightUnit}px`,
          height: `${spanHours * heightUnit - 2}px`,
        }}
        onClick={() => onBookingClick?.(booking)}
      >
        {isRec && (
          <div className="text-[9px] font-semibold text-violet-500 truncate">↻ еженедельно</div>
        )}
        {!isRec && (
          <div className={`text-[10px] font-semibold ${textClass} truncate opacity-70`}>
            {shortName(rooms[idx]?.name)}
          </div>
        )}
        <div className={`text-xs font-medium ${textClass} truncate`}>
          {booking.topic || 'Без темы'}
        </div>
        <div className="text-[10px] text-gray-500 truncate">
          {booking.bookerName} · {booking.department}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Week navigation */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            className="px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/5 rounded-lg transition-colors"
          >
            Сегодня
          </button>
          <button
            onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">
          {format(currentWeekStart, 'd MMM', { locale: ru })} —{' '}
          {format(weekEnd, 'd MMM yyyy', { locale: ru })}
        </h2>
        <div className="flex items-center gap-4">
          {rooms.map((room, idx) => (
            <div key={room.id} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${ROOM_COLORS[idx]}`} />
              <span className="text-sm text-gray-600">{shortName(room.name)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Day selector (mobile) */}
      <div className="sm:hidden flex gap-1 px-4 py-3 overflow-x-auto border-b border-gray-100">
        {days.map((day) => (
          <button
            key={day.toISOString()}
            onClick={() => setSelectedDay(day)}
            className={`shrink-0 flex flex-col items-center px-3 py-2 rounded-xl transition-colors ${
              isSameDay(day, viewDay)
                ? 'bg-primary text-white'
                : isToday(day)
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-gray-100'
            }`}
          >
            <span className="text-xs font-medium uppercase">
              {format(day, 'EEE', { locale: ru })}
            </span>
            <span className="text-lg font-semibold">{format(day, 'd')}</span>
          </button>
        ))}
      </div>

      {/* Desktop: Week grid */}
      <div className="hidden sm:block overflow-x-auto">
        <div className="min-w-200">
          {/* Day headers */}
          <div className="grid grid-cols-[60px_1fr] border-b border-gray-100">
            <div />
            <div className="grid grid-cols-7">
              {days.map((day) => (
                <div
                  key={day.toISOString()}
                  className={`text-center ${isToday(day) ? 'bg-primary/5' : ''}`}
                >
                  <div className="pt-3 pb-1">
                    <div className="text-xs font-medium text-gray-500 uppercase">
                      {format(day, 'EEE', { locale: ru })}
                    </div>
                    <div className={`text-lg font-semibold mt-0.5 ${isToday(day) ? 'text-primary' : 'text-gray-900'}`}>
                      {format(day, 'd')}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 border-t border-gray-100">
                    {rooms.map((room, idx) => (
                      <div
                        key={room.id}
                        className={`flex items-center justify-center gap-1 py-1.5 ${idx === 0 ? '' : 'border-l border-gray-100'}`}
                      >
                        <div className={`w-2 h-2 rounded-full ${ROOM_COLORS[idx]}`} />
                        <span className="text-[10px] font-medium text-gray-400">{shortName(room.name)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Time grid */}
          <div className="grid grid-cols-[60px_1fr]">
            <div>
              {HOURS.map((hour) => (
                <div key={hour} className="h-16 flex items-start justify-end pr-3 pt-0">
                  <span className="text-xs text-gray-400 -mt-2">
                    {String(hour).padStart(2, '0')}:00
                  </span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => (
                <div key={day.toISOString()} className="border-l border-gray-100">
                  {HOURS.map((hour) => {
                    const occupied =
                      getBookingsForSlot(rooms[0]?.id, day, hour).length > 0 ||
                      getBookingsForSlot(rooms[1]?.id, day, hour).length > 0;

                    return (
                      <div key={hour} className="h-16 border-b border-gray-50 relative group">
                        {rooms.map((room, idx) => {
                          const starting = getBookingsStartingAt(room.id, day, hour);
                          return starting.map((booking) =>
                            renderBookingBlock(booking, idx, 64)
                          );
                        })}
                        {!occupied && (
                          <div
                            className="absolute inset-0 cursor-pointer opacity-0 group-hover:opacity-100 bg-primary/5 transition-opacity flex items-center justify-center"
                            onClick={() => onSlotClick?.({ date: format(day, 'yyyy-MM-dd'), hour })}
                          >
                            <svg className="w-4 h-4 text-primary/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: Day view */}
      <div className="sm:hidden">
        <div className="grid grid-cols-[50px_1fr] border-b border-gray-100">
          <div />
          <div className="grid grid-cols-2">
            {rooms.map((room, idx) => (
              <div
                key={room.id}
                className={`flex items-center justify-center gap-1.5 py-2 ${idx === 0 ? '' : 'border-l border-gray-100'}`}
              >
                <div className={`w-2.5 h-2.5 rounded-full ${ROOM_COLORS[idx]}`} />
                <span className="text-xs font-medium text-gray-500">{shortName(room.name)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[50px_1fr]">
          <div>
            {HOURS.map((hour) => (
              <div key={hour} className="h-20 flex items-start justify-end pr-2 pt-0">
                <span className="text-xs text-gray-400 -mt-2">
                  {String(hour).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>
          <div className="relative">
            {HOURS.map((hour) => (
              <div key={hour} className="h-20 border-b border-gray-50 relative">
                {rooms.map((room, idx) => {
                  const starting = getBookingsStartingAt(room.id, viewDay, hour);
                  return starting.map((booking) =>
                    renderBookingBlock(booking, idx, 80)
                  );
                })}
                <div
                  className="absolute inset-0 cursor-pointer"
                  onClick={() => onSlotClick?.({ date: format(viewDay, 'yyyy-MM-dd'), hour })}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
