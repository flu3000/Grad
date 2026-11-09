import api from "./api";
import { TokenStorage } from "./TokenStorage";
import User from "../interfaces/User";

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

class UserService {

  // ======================
  // ANONYMOUS
  // ======================
  async anonymous(): Promise<User> {
    const { data } = await api.post<AuthResponse>("/auth/anonymous");

    TokenStorage.set(data);
    return data.user;
  }

  // ======================
  // GOOGLE
  // ======================
  async google(idToken: string): Promise<User> {
    const { data } = await api.post<AuthResponse>("/auth/google", { idToken });

    TokenStorage.set(data);
    return data.user;
  }

  // ======================
  // APPLE
  // ======================
  async apple(idToken: string): Promise<User> {
    const { data } = await api.post<AuthResponse>("/auth/apple", { idToken });

    TokenStorage.set(data);
    return data.user;
  }

  // ======================
  // LINK GOOGLE
  // ======================
  async linkGoogle(idToken: string): Promise<User> {
    const { data } = await api.post<AuthResponse>("/auth/link-google", { idToken });

    TokenStorage.set(data);
    return data.user;
  }

  // ======================
  // LINK APPLE
  // ======================
  async linkApple(idToken: string): Promise<User> {
    const { data } = await api.post<AuthResponse>("/auth/link-apple", { idToken });

    TokenStorage.set(data);
    return data.user;
  }

  // ======================
  // REFRESH (manual fallback)
  // ======================
  async refresh() {
    const refreshToken = TokenStorage.getRefresh();
    if (!refreshToken) return null;

    const { data } = await api.post("/auth/refresh", { refreshToken });

    TokenStorage.set(data);
    return data;
  }

  // ======================
  // LOGOUT
  // ======================
  async logout() {
    await api.post("/auth/logout");
    TokenStorage.clear();
  }
}

export default new UserService();