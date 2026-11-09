const ACCESS = "accessToken";
const REFRESH = "refreshToken";

export const TokenStorage = {
  getAccess() {
    return localStorage.getItem(ACCESS);
  },

  getRefresh() {
    return localStorage.getItem(REFRESH);
  },

  set(tokens: { accessToken: string; refreshToken: string }) {
    localStorage.setItem(ACCESS, tokens.accessToken);
    localStorage.setItem(REFRESH, tokens.refreshToken);
  },

  clear() {
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
  }
};