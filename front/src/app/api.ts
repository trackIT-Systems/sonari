import createAPI from "@/api";
import { HOST } from "@/api/common";

const api = createAPI({
  baseURL: HOST,
  withCredentials: true,
});

export default api; 