import { confApi as api } from './confClient';

export async function getBookings(filters = {}) {
  const params = new URLSearchParams();
  params.append('populate', 'room');
  params.append('sort', 'date:asc,startTime:asc');

  if (filters.date) {
    params.append('filters[date][$eq]', filters.date);
  }
  if (filters.dateFrom) {
    params.append('filters[date][$gte]', filters.dateFrom);
  }
  if (filters.dateTo) {
    params.append('filters[date][$lte]', filters.dateTo);
  }
  if (filters.roomId) {
    params.append('filters[room][id][$eq]', filters.roomId);
  }
  if (filters.userId) {
    params.append('filters[userId][$eq]', filters.userId);
  }
  if (filters.isRecurring !== undefined) {
    params.append('filters[isRecurring][$eq]', filters.isRecurring);
  }
  if (filters.recurringDayOfWeek !== undefined) {
    params.append('filters[recurringDayOfWeek][$eq]', filters.recurringDayOfWeek);
  }

  const response = await api.get(`/api/bookings?${params.toString()}`);
  return response.data;
}

// Fetch all bookings for a specific date including recurring ones that match the weekday
export async function getBookingsForDate(date, roomId) {
  const dayOfWeek = new Date(date + 'T00:00:00').getDay();

  const [regular, recurring] = await Promise.all([
    getBookings({ date, roomId }),
    getBookings({ isRecurring: true, recurringDayOfWeek: dayOfWeek, roomId }),
  ]);

  return [
    ...regular,
    ...recurring.map((b) => ({ ...b, date })),
  ];
}

function toStrapiTime(time) {
  if (!time) return time;
  if (time.length === 5) return `${time}:00.000`;
  return time;
}

export async function createBooking(data) {
  const { roomId, startTime, endTime, isRecurring, date, ...fields } = data;

  const payload = {
    ...fields,
    date,
    startTime: toStrapiTime(startTime),
    endTime: toStrapiTime(endTime),
    room: { connect: [{ id: roomId }] },
    isRecurring: isRecurring || false,
    recurringDayOfWeek: isRecurring
      ? new Date(date + 'T00:00:00').getDay()
      : null,
  };

  const response = await api.post('/api/bookings', { data: payload });
  return response.data;
}

export async function deleteBooking(id) {
  await api.delete(`/api/bookings/${id}`);
}
