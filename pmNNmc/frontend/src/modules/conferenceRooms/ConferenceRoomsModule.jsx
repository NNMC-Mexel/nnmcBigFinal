import { useState, useCallback, useMemo, useEffect } from 'react';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import Calendar from '../../components/Calendar/Calendar';
import BookingForm from '../../components/BookingForm/BookingForm';
import Modal from '../../components/ui/Modal';
import { useRooms } from '../../hooks/useRooms';
import { confGetMe } from '../../api/confClient';

const ROOM_COLORS = ['bg-room-1', 'bg-room-2'];

function formatDateLabel(dateStr) {
  const date = parseISO(dateStr);
  if (isToday(date)) return 'Сегодня';
  if (isTomorrow(date)) return 'Завтра';
  return format(date, 'd MMMM, EEEE', { locale: ru });
}

// --- Main module ---
export default function ConferenceRoomsModule() {
  const [confUser, setConfUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('conf_token');
    if (!token) {
      setAuthLoading(false);
      return;
    }
    confGetMe()
      .then((me) => setConfUser(me))
      .catch(() => {
        localStorage.removeItem('conf_token');
      })
      .finally(() => setAuthLoading(false));
  }, []);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!confUser) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <p className="text-gray-500 text-sm">Для доступа к конференц-залам необходимо авторизоваться через систему</p>
        </div>
      </div>
    );
  }

  return <BookingDashboard confUser={confUser} />;
}

// --- Booking dashboard (shown after login) ---
function BookingDashboard({ confUser }) {
  const { rooms, loading } = useRooms();
  const [bookingModal, setBookingModal] = useState({ open: false, data: null });
  const [detailModal, setDetailModal] = useState({ open: false, booking: null });
  const [refreshKey, setRefreshKey] = useState(0);
  const [allBookings, setAllBookings] = useState([]);

  const handleSlotClick = useCallback((data) => {
    setBookingModal({ open: true, data });
  }, []);

  const handleBookingClick = useCallback((booking) => {
    setDetailModal({ open: true, booking });
  }, []);

  const handleBookingSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleBookingsLoaded = useCallback((bookings) => {
    setAllBookings(bookings || []);
  }, []);

  const upcomingBookings = useMemo(() => {
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const currentTime = format(now, 'HH:mm');

    return allBookings
      .filter((b) => {
        if (b.isRecurring) return true;
        if (b.date > todayStr) return true;
        if (b.date === todayStr && b.endTime?.slice(0, 5) > currentTime) return true;
        return false;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return (a.startTime || '') < (b.startTime || '') ? -1 : 1;
      })
      .slice(0, 10);
  }, [allBookings]);

  const groupedBookings = useMemo(() => {
    const groups = {};
    upcomingBookings.forEach((b) => {
      if (!groups[b.date]) groups[b.date] = [];
      groups[b.date].push(b);
    });
    return Object.entries(groups);
  }, [upcomingBookings]);

  function getRoomIndex(booking) {
    const roomId = booking.room?.id || booking.room?.data?.id;
    return rooms.findIndex((r) => r.id === roomId);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Конференц-залы</h1>
          <p className="text-sm text-gray-500 mt-1">
            Нажмите на свободный слот, чтобы забронировать
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setBookingModal({ open: true, data: null })}
            className="px-4 py-2.5 text-sm font-medium text-white bg-blue-500 rounded-xl hover:bg-blue-600 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Забронировать
          </button>
        </div>
      </div>

      {/* Room cards */}
      {rooms.length > 0 && (
        <div className="flex gap-4 mb-6">
          {rooms.map((room, idx) => {
            const colors = [
              { border: 'border-room-1', bg: 'bg-room-1/5', text: 'text-room-1', icon: 'text-room-1' },
              { border: 'border-room-2', bg: 'bg-room-2/5', text: 'text-room-2', icon: 'text-room-2' },
            ];
            const c = colors[idx] || colors[0];
            return (
              <div
                key={room.id}
                className={`flex-1 bg-white rounded-2xl border-2 ${c.border} ${c.bg} p-5 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all`}
                onClick={() => setBookingModal({ open: true, data: { roomId: room.id } })}
              >
                <div className={`w-12 h-12 rounded-xl ${c.bg} border ${c.border} flex items-center justify-center shrink-0`}>
                  <svg className={`w-6 h-6 ${c.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 truncate">{room.name}</div>
                  {room.capacity && (
                    <div className="text-xs text-gray-500 mt-0.5">до {room.capacity} чел.</div>
                  )}
                </div>
                <div className={`text-sm font-medium ${c.text} flex items-center gap-1 shrink-0`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Забронировать
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Calendar + sidebar */}
      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <Calendar
            key={refreshKey}
            rooms={rooms}
            onSlotClick={handleSlotClick}
            onBookingClick={handleBookingClick}
            onBookingsLoaded={handleBookingsLoaded}
          />
        </div>

        {/* Upcoming bookings sidebar */}
        <div className="hidden lg:block w-80 flex-shrink-0">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 sticky top-6">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Ближайшие брони</h3>
              <p className="text-xs text-gray-400 mt-0.5">На этой неделе</p>
            </div>
            <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
              {groupedBookings.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500">Нет ближайших бронирований</p>
                </div>
              ) : (
                <div className="p-3 space-y-4">
                  {groupedBookings.map(([date, items]) => (
                    <div key={date}>
                      <div className="text-xs font-medium text-gray-400 uppercase tracking-wide px-2 mb-2">
                        {formatDateLabel(date)}
                      </div>
                      <div className="space-y-1.5">
                        {items.map((booking) => {
                          const roomIdx = getRoomIndex(booking);
                          const roomName = rooms[roomIdx]?.name || 'Зал';
                          return (
                            <div
                              key={booking.id || booking.documentId}
                              className="flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                              onClick={() => handleBookingClick(booking)}
                            >
                              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${ROOM_COLORS[roomIdx] || 'bg-gray-400'}`} />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-gray-900 truncate">
                                  {booking.topic || 'Без темы'}
                                  {booking.isRecurring && (
                                    <span className="ml-1.5 text-[10px] font-medium text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded">
                                      Еженедельно
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {booking.startTime?.slice(0, 5)} — {booking.endTime?.slice(0, 5)} · {roomName}
                                </div>
                                <div className="text-xs text-gray-400 mt-0.5 truncate">
                                  {booking.bookerName} · {booking.department}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Booking form modal */}
      {bookingModal.open && rooms.length > 0 && (
        <BookingForm
          isOpen={bookingModal.open}
          onClose={() => setBookingModal({ open: false, data: null })}
          rooms={rooms}
          initialData={bookingModal.data}
          onSuccess={handleBookingSuccess}
          currentUser={confUser}
        />
      )}

      {/* Booking detail modal */}
      <Modal
        isOpen={detailModal.open}
        onClose={() => setDetailModal({ open: false, booking: null })}
        title="Детали бронирования"
      >
        {detailModal.booking && (
          <div className="space-y-3">
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              {detailModal.booking.isRecurring && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Повторение</span>
                  <span className="text-sm font-medium text-violet-600">Каждую неделю</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Тема</span>
                <span className="text-sm font-medium">{detailModal.booking.topic || 'Без темы'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Время</span>
                <span className="text-sm font-medium">
                  {detailModal.booking.startTime?.slice(0, 5)} — {detailModal.booking.endTime?.slice(0, 5)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Кто забронировал</span>
                <span className="text-sm font-medium">{detailModal.booking.bookerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Отдел</span>
                <span className="text-sm font-medium">{detailModal.booking.department}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
