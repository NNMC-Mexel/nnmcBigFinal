import { useState, useEffect } from 'react';
import { getRooms } from '../api/rooms';

export function useRooms() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getRooms()
      .then(setRooms)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  return { rooms, loading, error };
}
