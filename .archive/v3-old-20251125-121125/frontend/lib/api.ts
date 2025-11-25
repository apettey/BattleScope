import axios from 'axios';

const BFF_URL = process.env.NEXT_PUBLIC_BFF_URL || 'http://bff-service:3006';

export const api = axios.create({
  baseURL: BFF_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const setAuthToken = (token: string | null) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

export default api;
