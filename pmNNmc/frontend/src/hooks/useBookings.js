import { useState, useEffect, useCallback, useRef } from 'react';
import { getBookings } from '../api/bookings';

export function useBookings(filters = {}, { skip = false } = {}) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const filterKey = JSON.stringify(filters);

  const refetch = useCallback(() => {
    if (skip) return;
    const currentId = ++requestId.current;
    setLoading(true);
    getBookings(filters)
      .then((data) => {
        if (currentId === requestId.current) {
          setBookings(data);
        }
      })
      .catch((err) => {
        if (currentId === requestId.current) {
          setError(err);
        }
      })
      .finally(() => {
        if (currentId === requestId.current) {
          setLoading(false);
        }
      });
  }, [filterKey, skip]);

  useEffect(() => {
    if (skip) {
      setBookings([]);
      setLoading(false);
      return;
    }
    refetch();
  }, [refetch, skip]);

  return { bookings, loading, error, refetch };
}
