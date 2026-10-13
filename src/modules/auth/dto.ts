export type LoginRequest = { email: string; password: string };

export type AuthUser = { id: string; email: string; role: "SUPERUSER" };

export type AuthResponse = {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
};
