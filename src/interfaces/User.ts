
export type AuthProvider = "anonymous" | "google" | "apple";

export default interface User {
  provider: AuthProvider;
  providerId: string;

  email?: string | null;
  name?: string | null;
  avatar?: string | null;

  refreshToken?: string | null;

  createdAt: string; // <- ISO string
  updatedAt: string; // <- ISO string
}