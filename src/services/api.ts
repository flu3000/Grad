import axios from "axios";
import { TokenStorage } from "./TokenStorage";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL
});

// adiciona access token
api.interceptors.request.use(config => {
  const token = TokenStorage.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// auto refresh
api.interceptors.response.use(
  res => res,
  async error => {
    if (error.response?.status !== 401) throw error;

    const refreshToken = TokenStorage.getRefresh();
    if (!refreshToken) throw error;

    try {
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL}/auth/refresh`,
        { refreshToken }
      );

      TokenStorage.set(data);

      error.config.headers.Authorization = `Bearer ${data.accessToken}`;
      return axios(error.config);

    } catch {
      TokenStorage.clear();
      window.location.href = "/login";
      throw error;
    }
  }
);

export default api;