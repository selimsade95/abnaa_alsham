import axios from "axios";
import { t } from "@/i18n";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });
export const API_MUTATION_EVENT = "api:mutation";

function dispatchMutationProgress(delta) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(API_MUTATION_EVENT, { detail: delta }),
    );
  }
}

function finishMutation(config) {
  if (!config?._mutationInProgress) return;
  config._mutationInProgress = false;
  dispatchMutationProgress(-1);
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("iqra_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (["post", "put", "patch", "delete"].includes(config.method?.toLowerCase())) {
    config._mutationInProgress = true;
    dispatchMutationProgress(1);
  }
  return config;
});

api.interceptors.response.use(
  (r) => {
    finishMutation(r.config);
    return r;
  },
  (error) => {
    finishMutation(error.config);
    const payload = error.response?.data;
    if (typeof payload?.detail === "string") {
      const permission = payload.detail.match(/^لا تملك صلاحية: (.+)$/)?.[1];
      payload.detail = permission
        ? t("apiErrors.permissionRequired", { permission })
        : t(payload.detail);
    }
    if (error?.response?.status === 401) {
      const path = window.location.pathname;
      if (path !== "/login") {
        localStorage.removeItem("iqra_token");
        localStorage.removeItem("iqra_user");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

export default api;
