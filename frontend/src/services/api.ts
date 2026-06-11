import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api",
  timeout: 10000
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("ocean_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function login(username: string, password: string) {
  const { data } = await api.post("/auth/login", { username, password });
  return data;
}

export async function fetchMetrics() {
  const { data } = await api.get("/dashboard/metrics");
  return data;
}

export async function fetchMonitoringPoints() {
  const { data } = await api.get("/monitoring-points");
  return data;
}

export async function fetchEvents() {
  const { data } = await api.get("/events");
  return data;
}

export async function createEvent(payload: Record<string, unknown>) {
  const { data } = await api.post("/events", payload);
  return data;
}

export async function updateEventStatus(id: number, status: string) {
  const { data } = await api.patch(`/events/${id}/status`, { status });
  return data;
}

export async function fetchAlertRules() {
  const { data } = await api.get("/alert-rules");
  return data;
}

export async function fetchUsers() {
  const { data } = await api.get("/admin/users");
  return data;
}
