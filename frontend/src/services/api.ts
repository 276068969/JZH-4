import axios, { AxiosError } from "axios";

export const AuthErrorCode = {
  PARAMS_MISSING: "AUTH_PARAMS_MISSING",
  ACCOUNT_NOT_FOUND: "AUTH_ACCOUNT_NOT_FOUND",
  PASSWORD_WRONG: "AUTH_PASSWORD_WRONG",
  TOKEN_MISSING: "AUTH_TOKEN_MISSING",
  TOKEN_INVALID: "AUTH_TOKEN_INVALID",
  TOKEN_EXPIRED: "AUTH_TOKEN_EXPIRED"
} as const;

export type AuthErrorCodeType = typeof AuthErrorCode[keyof typeof AuthErrorCode];

export interface AuthErrorResponse {
  code: AuthErrorCodeType | string;
  message: string;
  details?: Record<string, unknown>;
}

export class AuthError extends Error {
  code: AuthErrorCodeType | string;
  details?: Record<string, unknown>;

  constructor(code: AuthErrorCodeType | string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.details = details;
  }
}

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

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<AuthErrorResponse>) => {
    if (error.response?.data) {
      const { code, message, details } = error.response.data;
      if (code) {
        throw new AuthError(code, message, details);
      }
    }
    throw error;
  }
);

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

export async function fetchMonitoringPointDetail(id: number) {
  const { data } = await api.get(`/monitoring-points/${id}/detail`);
  return data;
}

export interface MonitoringTrendPoint {
  timestamp: string;
  value: number | string;
  rank?: number;
}

export interface MonitoringTrendSeries {
  metric: string;
  unit: string;
  points: MonitoringTrendPoint[];
}

export interface MonitoringTrendAssessment {
  waterQualityTrend: string;
  windSpeedTrend: string;
  temperatureTrend: string;
  summary: string;
}

export interface MonitoringPointTrendResponse {
  pointId: number;
  range: string;
  from: string;
  to: string;
  granularity: string;
  series: MonitoringTrendSeries[];
  assessment: MonitoringTrendAssessment;
}

export async function fetchMonitoringPointTrend(
  id: number,
  range: string
): Promise<MonitoringPointTrendResponse> {
  const { data } = await api.get(`/monitoring-points/${id}/trend`, {
    params: { range }
  });
  return data;
}

export async function fetchEvents(params?: Record<string, string>) {
  const { data } = await api.get("/events", { params });
  return data;
}

export async function createEvent(payload: Record<string, unknown>) {
  const { data } = await api.post("/events", payload);
  return data;
}

export async function reportPollutionAlert(payload: Record<string, unknown>) {
  const { data } = await api.post("/events/pollution-alert", payload);
  return data;
}

export async function updateEventStatus(id: number, payload: Record<string, unknown>) {
  const { data } = await api.patch(`/events/${id}/status`, payload);
  return data;
}

export async function fetchEventAudit(id: number) {
  const { data } = await api.get(`/events/${id}/audit`);
  return data;
}

export async function fetchAlertRules() {
  const { data } = await api.get("/alert-rules");
  return data;
}

export async function createAlertRule(payload: Record<string, unknown>) {
  const { data } = await api.post("/alert-rules", payload);
  return data;
}

export async function updateAlertRule(id: number, payload: Record<string, unknown>) {
  const { data } = await api.patch(`/alert-rules/${id}`, payload);
  return data;
}

export async function toggleAlertRule(id: number) {
  const { data } = await api.patch(`/alert-rules/${id}/toggle`);
  return data;
}

export async function deleteAlertRule(id: number) {
  const { data } = await api.delete(`/alert-rules/${id}`);
  return data;
}

export async function fetchAlerts(params?: Record<string, string>) {
  const { data } = await api.get("/alerts", { params });
  return data;
}

export async function fetchAlertsSummary() {
  const { data } = await api.get("/alerts/summary");
  return data;
}

export async function evaluateAlerts() {
  const { data } = await api.post("/alerts/evaluate");
  return data;
}

export async function updateAlertStatus(id: number, status: string) {
  const { data } = await api.patch(`/alerts/${id}/status`, { status });
  return data;
}

export async function fetchUsers(params?: Record<string, string>) {
  const { data } = await api.get("/admin/users", { params });
  return data;
}

export async function updateUser(id: number, payload: Record<string, unknown>) {
  const { data } = await api.patch(`/admin/users/${id}`, payload);
  return data;
}

export async function fetchSeaAreas() {
  const { data } = await api.get("/sea-areas");
  return data;
}

export async function fetchShips(params?: Record<string, string>) {
  const { data } = await api.get("/ships", { params });
  return data;
}

export async function fetchShipDetail(id: number) {
  const { data } = await api.get(`/ships/${id}`);
  return data;
}

export async function fetchLatestShipPositions() {
  const { data } = await api.get("/ships/positions/latest");
  return data;
}

export async function reportShipPosition(payload: Record<string, unknown>) {
  const { data } = await api.post("/ships/positions", payload);
  return data;
}

export async function fetchShipAnomalies(params?: Record<string, string>) {
  const { data } = await api.get("/ships/anomalies", { params });
  return data;
}

export async function updateShipAnomalyStatus(id: number, payload: Record<string, unknown>) {
  const { data } = await api.patch(`/ships/anomalies/${id}/status`, payload);
  return data;
}

export async function fetchShipIntrusions(params?: Record<string, string>) {
  const { data } = await api.get("/ships/intrusions", { params });
  return data;
}

export async function updateShipIntrusionStatus(id: number, payload: Record<string, unknown>) {
  const { data } = await api.patch(`/ships/intrusions/${id}/status`, payload);
  return data;
}

export async function fetchShipStayRecords(params?: Record<string, string>) {
  const { data } = await api.get("/ships/stay-records", { params });
  return data;
}

export async function fetchShipSummary() {
  const { data } = await api.get("/ships/summary");
  return data;
}

export interface MonitoringPointStats {
  total: number;
  normal: number;
  warning: number;
  offline: number;
}

export interface WaterQualityStats {
  gradeDistribution: Record<string, number>;
  primaryGrade: string;
  worstGrade: string;
}

export interface EventStats {
  total: number;
  reported: number;
  processing: number;
  resolved: number;
  high: number;
  medium: number;
  low: number;
}

export interface AlertStats {
  totalRules: number;
  enabledRules: number;
  disabledRules: number;
  activeAlerts: number;
  acknowledgedAlerts: number;
  resolvedAlerts: number;
  highActiveAlerts: number;
  mediumActiveAlerts: number;
  lowActiveAlerts: number;
}

export interface SeaAreaRegulationStats {
  id: number;
  name: string;
  usageType: string;
  jurisdiction: string;
  keyRisks: string[];
  hasMonitoringPoints: boolean;
  hasActiveAlerts: boolean;
  monitoringPoints: MonitoringPointStats;
  waterQuality: WaterQualityStats;
  events: EventStats;
  alerts: AlertStats;
}

export interface RegulationStatsResponse {
  summary: {
    totalSeaAreas: number;
    totalMonitoringPoints: number;
    totalEvents: number;
    totalAlertRules: number;
    totalActiveAlerts: number;
    noAlertSeaAreas: number;
    emptySeaAreas: number;
  };
  seaAreas: SeaAreaRegulationStats[];
}

export async function fetchRegulationStats(): Promise<RegulationStatsResponse> {
  const { data } = await api.get("/regulation/stats");
  return data;
}

export interface WaterQualityIssue {
  timestamp: string;
  seaArea: string;
  realGrade: string;
  estimatedGrade: string;
  issue: string;
}

export interface WaterQualityIssuesResponse {
  total: number;
  issues: WaterQualityIssue[];
}

export async function fetchWaterQualityIssues(): Promise<WaterQualityIssuesResponse> {
  const { data } = await api.get("/regulation/water-quality-issues");
  return data;
}
