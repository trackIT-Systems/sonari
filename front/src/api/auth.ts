import { AxiosInstance } from "axios";
import { z } from "zod";

import { UserSchema } from "@/schemas";

import type { User } from "@/types";

const LoginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export type Login = z.input<typeof LoginSchema>;

const DEFAULT_ENDPOINTS = {
  login: "/api/v1/auth/login",
  logout: "/api/v1/auth/logout",
};

export function registerAuthAPI(
  instance: AxiosInstance,
  endpoints: typeof DEFAULT_ENDPOINTS = DEFAULT_ENDPOINTS,
) {
  async function login(data: Login) {
    return await instance.post(endpoints.login, LoginSchema.parse(data), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
  }

  async function logout() {
    return await instance.post(endpoints.logout);
  }

  return { login, logout } as const;
}
