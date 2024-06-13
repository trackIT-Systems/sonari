import createAPI from "@/api";

const api = createAPI({
  baseURL: process.env.NEXT_PUBLIC_WHOMBAT_FOLDER ?? "",
  withCredentials: true,
});

export default api;
