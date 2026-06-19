import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { evaluateAllRules } from "./alertEngine.js";
import { checkPersistence, getPool, initDatabase, isDbAvailable, mapAuditRow, mapEventRow, mapPatrolRow, syncEventsToMemory, syncPatrolsToMemory } from "./db.js";
import {
  accounts,
  alertResults,
  alertRules,
  events,
  eventStatusAudits,
  monitoringPoints,
  seaAreas,
  ships,
  shipPositions,
  shipAnomalies,
  protectedAreaIntrusions,
  shipStayRecords,
  patrolRecords,
  type AlertMetric,
  type AlertResult,
  type AlertRule,
  type EventRecord,
  type EventStatusAudit,
  type MonitoringPoint,
  type Ship,
  type ShipPosition,
  type ShipPositionWithShipInfo,
  type ShipAnomaly,
  type ProtectedAreaIntrusion,
  type ShipStayRecord,
  type PatrolRecord,
  type SeaAreaRegulationStats,
  type RegulationStatsResponse,
  type MonitoringPointStats,
  type WaterQualityStats,
  type EventStats,
  type AlertStats
} from "./seed.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 8080);
const jwtSecret = process.env.JWT_SECRET ?? "development-secret";

const AuthErrorCode = {
  PARAMS_MISSING: "AUTH_PARAMS_MISSING",
  ACCOUNT_NOT_FOUND: "AUTH_ACCOUNT_NOT_FOUND",
  PASSWORD_WRONG: "AUTH_PASSWORD_WRONG",
  TOKEN_MISSING: "AUTH_TOKEN_MISSING",
  TOKEN_INVALID: "AUTH_TOKEN_INVALID",
  TOKEN_EXPIRED: "AUTH_TOKEN_EXPIRED"
} as const;

type AuthErrorCodeType = typeof AuthErrorCode[keyof typeof AuthErrorCode];

interface ErrorResponse {
  code: AuthErrorCodeType | string;
  message: string;
  details?: Record<string, unknown>;
}

function sendError(res: express.Response, status: number, code: AuthErrorCodeType | string, message: string, details?: Record<string, unknown>) {
  res.status(status).json({
    code,
    message,
    details
  } as ErrorResponse);
}

app.use(cors());
app.use(express.json());

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

const eventSchema = z.object({
  title: z.string().min(2),
  category: z.string().min(2),
  seaArea: z.string().min(2),
  level: z.enum(["low", "medium", "high"]).default("medium"),
  reporter: z.string().min(2).default("人工上报"),
  source: z.enum(["人工上报", "自动监测", "AIS 雷达", "设备心跳", "群众举报"]).default("人工上报")
});

const pollutionAlertSchema = z.object({
  pollutionType: z.enum(["废水排放", "原油泄漏", "赤潮", "危险化学品", "垃圾倾倒", "其他"]),
  suspectedSource: z.string().min(2),
  seaArea: z.string().min(2),
  level: z.enum(["low", "medium", "high"]),
  description: z.string().min(5)
});

const patrolSchema = z.object({
  seaArea: z.string().min(2, "巡查海域至少2个字符"),
  inspector: z.string().min(2, "巡查人员至少2个字符"),
  patrolTime: z
    .string()
    .refine(isValidDatetimeString, "巡查时间格式必须为 YYYY-MM-DD HH:mm")
    .refine(isNotFutureDatetime, "巡查时间不能是未来时间")
    .optional(),
  problemsFound: z.string().default(""),
  onSiteConclusion: z.string().min(2, "现场结论至少2个字符"),
  relatedEventId: z.number().int().positive().optional()
});

const patrolUpdateSchema = z.object({
  seaArea: z.string().min(2).optional(),
  inspector: z.string().min(2).optional(),
  patrolTime: z
    .string()
    .refine(isValidDatetimeString, "巡查时间格式必须为 YYYY-MM-DD HH:mm")
    .refine(isNotFutureDatetime, "巡查时间不能是未来时间")
    .optional(),
  problemsFound: z.string().optional(),
  onSiteConclusion: z.string().min(2).optional(),
  relatedEventId: z.number().int().positive().nullable().optional()
});

const patrolEscalateSchema = z.object({
  title: z.string().min(2).optional(),
  category: z.string().min(2).optional(),
  level: z.enum(["low", "medium", "high"]).default("medium")
});

const alertConditionSchema = z.object({
  metric: z.enum(["water_quality", "wind_speed", "status", "temperature"]),
  operator: z.enum(["gt", "gte", "lt", "lte", "eq", "neq", "in"]),
  threshold: z.union([z.number(), z.string(), z.array(z.string())]),
  unit: z.string().optional()
});

const alertRuleSchema = z.object({
  name: z.string().min(2),
  target: z.string().min(2),
  condition: z.string().min(2),
  conditionStruct: alertConditionSchema.optional(),
  level: z.enum(["low", "medium", "high"]).default("medium"),
  enabled: z.boolean().default(true)
});

const shipPositionSchema = z.object({
  mmsi: z.string().min(5),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speed: z.number().min(0).max(100).default(0),
  course: z.number().min(0).max(360).optional(),
  heading: z.number().min(0).max(360).optional(),
  seaArea: z.string().optional(),
  status: z.enum(["sailing", "anchored", "stopped", "moored"]).default("sailing")
});

const shipAnomalyStatusSchema = z.object({
  status: z.enum(["active", "acknowledged", "resolved"]),
  disposalNote: z.string().optional()
});

const WATER_QUALITY_GRADES = ["I 类", "II 类", "III 类", "IV 类", "V 类", "劣 V 类"] as const;
const MONITORING_POINT_TYPES = ["水质浮标", "排口监测", "船舶监管", "气象监测"] as const;
const MONITORING_POINT_STATUSES = ["normal", "warning", "offline"] as const;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function getDaysInMonth(year: number, month: number): number {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  return days[month - 1];
}

function isValidDatetimeString(val: string): boolean {
  const regex = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;
  const match = val.match(regex);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > getDaysInMonth(year, month)) return false;
  if (hour < 0 || hour > 23) return false;
  if (minute < 0 || minute > 59) return false;

  return true;
}

function isNotFutureDatetime(val: string): boolean {
  if (!isValidDatetimeString(val)) return false;
  const dt = new Date(val.replace(" ", "T"));
  return dt.getTime() <= Date.now();
}

const monitoringPointSchema = z.object({
  name: z.string().min(2, "监测点名称至少2个字符").max(64, "监测点名称不超过64个字符"),
  seaArea: z.string().min(2, "海域名称至少2个字符").max(128, "海域名称不超过128个字符"),
  type: z.enum(MONITORING_POINT_TYPES, { message: "监测点类型必须是水质浮标、排口监测、船舶监管或气象监测" }),
  latitude: z.number().min(-90, "纬度必须在 -90 到 90 之间").max(90, "纬度必须在 -90 到 90 之间"),
  longitude: z.number().min(-180, "经度必须在 -180 到 180 之间").max(180, "经度必须在 -180 到 180 之间"),
  status: z.enum(MONITORING_POINT_STATUSES, { message: "设备状态必须是 normal、warning 或 offline" }),
  waterQuality: z.enum(WATER_QUALITY_GRADES, { message: "水质等级必须是 I 类 ~ V 类或劣 V 类" }),
  windSpeed: z.number().min(0, "风速不能为负数").max(100, "风速不能超过100 m/s").default(0),
  temperature: z.number().min(-20, "温度不能低于 -20℃").max(50, "温度不能高于 50℃").default(0),
  updatedAt: z
    .string()
    .refine(isValidDatetimeString, "更新时间格式必须为 YYYY-MM-DD HH:mm")
    .refine(isNotFutureDatetime, "更新时间不能是未来时间")
    .optional()
});

function validateMonitoringPoint(point: MonitoringPoint): { valid: boolean; errors: string[]; sanitized: MonitoringPoint } {
  const errors: string[] = [];
  const sanitized = { ...point };

  if (!sanitized.name || sanitized.name.length < 2) {
    errors.push("监测点名称至少2个字符");
  }
  if (sanitized.name && sanitized.name.length > 64) {
    errors.push("监测点名称不超过64个字符");
  }

  if (!sanitized.seaArea || sanitized.seaArea.length < 2) {
    errors.push("海域名称至少2个字符");
  }

  if (!MONITORING_POINT_TYPES.includes(sanitized.type as typeof MONITORING_POINT_TYPES[number])) {
    errors.push(`监测点类型 "${sanitized.type}" 不是合法类型`);
  }

  if (typeof sanitized.latitude !== "number" || sanitized.latitude < -90 || sanitized.latitude > 90) {
    errors.push("纬度必须在 -90 到 90 之间");
  }

  if (typeof sanitized.longitude !== "number" || sanitized.longitude < -180 || sanitized.longitude > 180) {
    errors.push("经度必须在 -180 到 180 之间");
  }

  if (!MONITORING_POINT_STATUSES.includes(sanitized.status as typeof MONITORING_POINT_STATUSES[number])) {
    errors.push(`设备状态 "${sanitized.status}" 不是合法状态`);
  }

  if (!WATER_QUALITY_GRADES.includes(sanitized.waterQuality as typeof WATER_QUALITY_GRADES[number])) {
    errors.push(`水质等级 "${sanitized.waterQuality}" 不是合法等级`);
  }

  if (typeof sanitized.windSpeed !== "number" || sanitized.windSpeed < 0 || sanitized.windSpeed > 100) {
    errors.push("风速必须在 0 到 100 m/s 之间");
  }

  if (typeof sanitized.temperature !== "number" || sanitized.temperature < -20 || sanitized.temperature > 50) {
    errors.push("温度必须在 -20℃ 到 50℃ 之间");
  }

  if (!isValidDatetimeString(sanitized.updatedAt)) {
    errors.push("更新时间格式无效");
  } else if (!isNotFutureDatetime(sanitized.updatedAt)) {
    errors.push("更新时间不能是未来时间");
  }

  return { valid: errors.length === 0, errors, sanitized };
}

function sanitizeMonitoringPoints(points: MonitoringPoint[]): MonitoringPoint[] {
  return points.filter((point) => validateMonitoringPoint(point).valid);
}

const intrusionStatusSchema = z.object({
  status: z.enum(["active", "resolved"]),
  disposalNote: z.string().optional()
});

function getEnabledRuleIds(): Set<number> {
  return new Set(alertRules.filter((r) => r.enabled).map((r) => r.id));
}

function filterAlertsByEnabledRules(alerts: AlertResult[]): AlertResult[] {
  const enabledRuleIds = getEnabledRuleIds();
  return alerts.filter((a) => enabledRuleIds.has(a.ruleId));
}

function buildMetrics() {
  const validPoints = sanitizeMonitoringPoints(monitoringPoints);
  const warningPoints = validPoints.filter((point) => point.status === "warning").length;
  const offlinePoints = validPoints.filter((point) => point.status === "offline").length;
  const openEvents = events.filter((event) => event.status !== "resolved").length;
  const filteredAlerts = filterAlertsByEnabledRules(alertResults);
  const activeAlerts = filteredAlerts.filter((r) => r.status === "active").length;
  const activeShips = shipPositions.length;
  const abnormalShips = ships.filter((s) => s.status === "abnormal").length;
  const activeIntrusions = protectedAreaIntrusions.filter((i) => i.status === "active").length;
  const overstayShips = shipStayRecords.filter((s) => s.isOverstay && s.status === "staying").length;
  const activeAnomalies = shipAnomalies.filter((a) => a.status === "active").length;

  return {
    seaAreas: 8,
    monitoringPoints: validPoints.length,
    warningPoints,
    offlinePoints,
    shipsOnline: activeShips,
    openEvents,
    activeAlerts,
    waterQualityRate: 91.6,
    abnormalShips,
    activeIntrusions,
    overstayShips,
    activeAnomalies
  };
}

function buildMonitoringPointStats(seaAreaName: string): MonitoringPointStats {
  const validPoints = sanitizeMonitoringPoints(monitoringPoints);
  const points = validPoints.filter((p) => p.seaArea === seaAreaName);
  return {
    total: points.length,
    normal: points.filter((p) => p.status === "normal").length,
    warning: points.filter((p) => p.status === "warning").length,
    offline: points.filter((p) => p.status === "offline").length
  };
}

function buildEventStats(seaAreaName: string): EventStats {
  const areaEvents = events.filter((e) => e.seaArea === seaAreaName);
  return {
    total: areaEvents.length,
    reported: areaEvents.filter((e) => e.status === "reported").length,
    processing: areaEvents.filter((e) => e.status === "processing").length,
    resolved: areaEvents.filter((e) => e.status === "resolved").length,
    high: areaEvents.filter((e) => e.level === "high").length,
    medium: areaEvents.filter((e) => e.level === "medium").length,
    low: areaEvents.filter((e) => e.level === "low").length
  };
}

const WATER_QUALITY_ORDER = ["I 类", "II 类", "III 类", "IV 类", "V 类", "劣 V 类"];

interface WaterQualityIssueLog {
  timestamp: string;
  seaArea: string;
  realGrade: string;
  estimatedGrade: string;
  issue: string;
}

const waterQualityIssueLog: WaterQualityIssueLog[] = [];

function logWaterQualityIssue(seaArea: string, realGrade: string, estimatedGrade: string, issue: string) {
  const entry: WaterQualityIssueLog = {
    timestamp: new Date().toISOString(),
    seaArea,
    realGrade,
    estimatedGrade,
    issue
  };
  waterQualityIssueLog.push(entry);
  console.warn(
    `[水质错级警告] 海域: ${seaArea}, 真实水质: ${realGrade}, 推算水质: ${estimatedGrade}, 问题: ${issue}`
  );
  if (waterQualityIssueLog.length > 100) {
    waterQualityIssueLog.shift();
  }
}

function waterQualityRank(grade: string): number {
  const idx = WATER_QUALITY_ORDER.indexOf(grade);
  return idx === -1 ? 99 : idx;
}

function getEstimatedWaterQualityGrade(mpStats: MonitoringPointStats): string {
  if (mpStats.total === 0) return "—";
  const offlineRatio = mpStats.offline / mpStats.total;
  const warningRatio = mpStats.warning / mpStats.total;

  if (offlineRatio > 0.3) return "劣 V 类";
  if (offlineRatio > 0.15 || warningRatio > 0.4) return "IV 类";
  if (warningRatio > 0.2) return "III 类";
  if (warningRatio > 0.05) return "II 类";
  return "I 类";
}

function buildWaterQualityStats(seaAreaName: string, mpStats: MonitoringPointStats): WaterQualityStats {
  const validPoints = sanitizeMonitoringPoints(monitoringPoints);
  const points = validPoints.filter((p) => p.seaArea === seaAreaName);

  if (points.length === 0) {
    return {
      gradeDistribution: {},
      primaryGrade: "—",
      worstGrade: "—"
    };
  }

  const gradeDistribution: Record<string, number> = {};
  for (const p of points) {
    gradeDistribution[p.waterQuality] = (gradeDistribution[p.waterQuality] ?? 0) + 1;
  }

  let primaryGrade = points[0].waterQuality;
  let maxCount = 0;
  for (const [grade, count] of Object.entries(gradeDistribution)) {
    if (count > maxCount || (count === maxCount && waterQualityRank(grade) > waterQualityRank(primaryGrade))) {
      maxCount = count;
      primaryGrade = grade;
    }
  }

  const worstGrade = points.reduce(
    (worst, p) => (waterQualityRank(p.waterQuality) > waterQualityRank(worst) ? p.waterQuality : worst),
    points[0].waterQuality
  );

  const estimatedGrade = getEstimatedWaterQualityGrade(mpStats);
  if (worstGrade !== estimatedGrade) {
    const realRank = waterQualityRank(worstGrade);
    const estRank = waterQualityRank(estimatedGrade);
    let issue = "";
    if (realRank < estRank) {
      issue = `推算水质比真实水质差 ${estRank - realRank} 个等级（严重低估）`;
    } else if (realRank > estRank) {
      issue = `推算水质比真实水质好 ${realRank - estRank} 个等级（高估）`;
    }
    logWaterQualityIssue(seaAreaName, worstGrade, estimatedGrade, issue);
  }

  return {
    gradeDistribution,
    primaryGrade,
    worstGrade
  };
}

const pointTypeMetricsMap: Record<string, AlertMetric[]> = {
  水质浮标: ["water_quality", "status", "temperature"],
  排口监测: ["water_quality", "status", "temperature"],
  船舶监管: ["status"],
  气象监测: ["wind_speed", "temperature", "status"]
};

function getRuleApplicablePointIds(rule: AlertRule): Set<number> {
  if (!rule.conditionStruct) return new Set();
  const metric = rule.conditionStruct.metric;
  const validPoints = sanitizeMonitoringPoints(monitoringPoints);
  const applicablePointIds = validPoints
    .filter((point) => {
      const metrics = pointTypeMetricsMap[point.type] ?? [];
      return metrics.includes(metric);
    })
    .map((point) => point.id);
  return new Set(applicablePointIds);
}

function buildAlertStats(seaAreaName: string): AlertStats {
  const filteredAlerts = filterAlertsByEnabledRules(alertResults);
  const areaAlerts = filteredAlerts.filter((a) => a.seaArea === seaAreaName);
  const validPoints = sanitizeMonitoringPoints(monitoringPoints);
  const areaPointIds = new Set(
    validPoints.filter((p) => p.seaArea === seaAreaName).map((p) => p.id)
  );
  const areaRules = alertRules.filter((r) => {
    if (!r.conditionStruct) return false;
    const applicablePointIds = getRuleApplicablePointIds(r);
    for (const pointId of applicablePointIds) {
      if (areaPointIds.has(pointId)) return true;
    }
    return false;
  });
  return {
    totalRules: areaRules.length,
    enabledRules: areaRules.filter((r) => r.enabled).length,
    disabledRules: areaRules.filter((r) => !r.enabled).length,
    activeAlerts: areaAlerts.filter((a) => a.status === "active").length,
    acknowledgedAlerts: areaAlerts.filter((a) => a.status === "acknowledged").length,
    resolvedAlerts: areaAlerts.filter((a) => a.status === "resolved").length,
    highActiveAlerts: areaAlerts.filter((a) => a.level === "high" && a.status === "active").length,
    mediumActiveAlerts: areaAlerts.filter((a) => a.level === "medium" && a.status === "active").length,
    lowActiveAlerts: areaAlerts.filter((a) => a.level === "low" && a.status === "active").length
  };
}

function buildRegulationStats(): RegulationStatsResponse {
  const validPoints = sanitizeMonitoringPoints(monitoringPoints);
  const seaAreaStats: SeaAreaRegulationStats[] = seaAreas.map((area) => {
    const mpStats = buildMonitoringPointStats(area.name);
    const wqStats = buildWaterQualityStats(area.name, mpStats);
    const alertStats = buildAlertStats(area.name);
    const hasMonitoringPoints = mpStats.total > 0;
    const hasActiveAlerts = alertStats.activeAlerts > 0;
    return {
      id: area.id,
      name: area.name,
      usageType: area.usageType,
      jurisdiction: area.jurisdiction,
      keyRisks: area.keyRisks,
      hasMonitoringPoints,
      hasActiveAlerts,
      monitoringPoints: mpStats,
      waterQuality: wqStats,
      events: buildEventStats(area.name),
      alerts: alertStats
    };
  });

  const noAlertSeaAreas = seaAreaStats.filter(
    (s) => s.hasMonitoringPoints && !s.hasActiveAlerts
  ).length;
  const emptySeaAreas = seaAreaStats.filter((s) => !s.hasMonitoringPoints).length;

  const filteredAlerts = filterAlertsByEnabledRules(alertResults);
  return {
    summary: {
      totalSeaAreas: seaAreas.length,
      totalMonitoringPoints: validPoints.length,
      totalEvents: events.length,
      totalAlertRules: alertRules.length,
      totalActiveAlerts: filteredAlerts.filter((a) => a.status === "active").length,
      noAlertSeaAreas,
      emptySeaAreas
    },
    seaAreas: seaAreaStats
  };
}

function runAlertEvaluation() {
  const validPoints = sanitizeMonitoringPoints(monitoringPoints);
  const newAlerts = evaluateAllRules(alertRules, validPoints, alertResults);
  let nextId = alertResults.length > 0 ? Math.max(...alertResults.map((r) => r.id)) + 1 : 1;
  for (const alert of newAlerts) {
    alert.id = nextId++;
    alertResults.unshift(alert);
  }
  return newAlerts;
}

runAlertEvaluation();

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    sendError(res, 401, AuthErrorCode.TOKEN_MISSING, "未提供认证令牌，请重新登录");
    return;
  }

  try {
    res.locals.user = jwt.verify(token, jwtSecret);
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      sendError(res, 401, AuthErrorCode.TOKEN_EXPIRED, "登录已过期，请重新登录");
    } else if (err instanceof jwt.JsonWebTokenError) {
      sendError(res, 401, AuthErrorCode.TOKEN_INVALID, "令牌无效，请重新登录");
    } else {
      sendError(res, 401, AuthErrorCode.TOKEN_INVALID, "认证失败，请重新登录");
    }
  }
}

app.get("/api/health", async (_req, res) => {
  const persistence = await checkPersistence();
  res.json({
    status: "ok",
    service: "ocean-regulation-backend",
    persistence: isDbAvailable() ? "database" : "in-memory",
    db: persistence.dbConnected ? { eventCount: persistence.eventCount, auditCount: persistence.auditCount } : null
  });
});

app.get("/api/health/persistence", async (_req, res) => {
  const persistence = await checkPersistence();
  if (!persistence.dbConnected) {
    res.status(503).json({
      persistent: false,
      message: "Database not connected, event audit data is in-memory only and will be lost on restart"
    });
    return;
  }
  res.json({
    persistent: true,
    eventCount: persistence.eventCount,
    auditCount: persistence.auditCount,
    latestAuditAt: persistence.latestAuditAt
  });
});

app.post("/api/auth/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    const missingFields: string[] = [];
    for (const issue of parsed.error.issues) {
      if (issue.path.includes("username")) {
        missingFields.push("用户名");
      }
      if (issue.path.includes("password")) {
        missingFields.push("密码");
      }
    }
    sendError(res, 400, AuthErrorCode.PARAMS_MISSING, 
      missingFields.length > 0 ? `${missingFields.join("、")}不能为空` : "请求参数不完整",
      { missingFields }
    );
    return;
  }

  const account = accounts.find((item) => item.username === parsed.data.username);

  if (!account) {
    sendError(res, 401, AuthErrorCode.ACCOUNT_NOT_FOUND, "账号不存在，请检查用户名");
    return;
  }

  if (account.password !== parsed.data.password) {
    sendError(res, 401, AuthErrorCode.PASSWORD_WRONG, "密码错误，请重试");
    return;
  }

  const token = jwt.sign(
    {
      id: account.id,
      username: account.username,
      role: account.role,
      name: account.name,
      position: account.position,
      responsibleSeaAreas: account.responsibleSeaAreas,
      dataScope: account.dataScope
    },
    jwtSecret,
    { expiresIn: "8h" }
  );

  res.json({
    token,
    user: {
      id: account.id,
      username: account.username,
      role: account.role,
      name: account.name,
      position: account.position,
      responsibleSeaAreas: account.responsibleSeaAreas,
      dataScope: account.dataScope
    }
  });
});

app.get("/api/dashboard/metrics", requireAuth, (_req, res) => {
  res.json(buildMetrics());
});

app.get("/api/regulation/stats", requireAuth, (_req, res) => {
  res.json(buildRegulationStats());
});

app.get("/api/regulation/water-quality-issues", requireAuth, (_req, res) => {
  res.json({
    total: waterQualityIssueLog.length,
    issues: waterQualityIssueLog
  });
});

app.get("/api/monitoring-points", requireAuth, (_req, res) => {
  const validPoints = sanitizeMonitoringPoints(monitoringPoints);
  res.json(validPoints);
});

app.get("/api/monitoring-points/:id/detail", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const point = monitoringPoints.find((p) => p.id === id);

  if (!point) {
    res.status(404).json({ message: "监测点不存在" });
    return;
  }

  const validation = validateMonitoringPoint(point);
  if (!validation.valid) {
    res.status(500).json({
      message: "监测点数据校验失败",
      errors: validation.errors
    });
    return;
  }

  const seaArea = seaAreas.find((a) => a.name === point.seaArea);
  const filteredAlerts = filterAlertsByEnabledRules(alertResults);
  const pointAlerts = filteredAlerts.filter((a) => a.pointId === id);
  const recentEvents = events
    .filter((e) => e.seaArea === point.seaArea)
    .slice(0, 5);

  res.json({
    point,
    seaArea: seaArea
      ? {
          name: seaArea.name,
          usageType: seaArea.usageType,
          jurisdiction: seaArea.jurisdiction,
          keyRisks: seaArea.keyRisks
        }
      : null,
    alerts: pointAlerts,
    recentEvents
  });
});

interface MonitoringPointHistoryRecord {
  date: string;
  waterQualityRank: number;
  waterQuality: string;
  windSpeed: number;
  temperature: number;
}

const monitoringPointHistory = new Map<number, MonitoringPointHistoryRecord[]>();

const TREND_RANGES = ["7d", "30d", "90d"] as const;
type TrendRange = (typeof TREND_RANGES)[number];
const TREND_RANGE_DAYS: Record<TrendRange, number> = { "7d": 7, "30d": 30, "90d": 90 };
const HISTORY_WINDOW_DAYS = 90;

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatTrendDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseUpdatedAtToDate(updatedAt: string): Date {
  const [datePart, timePart] = updatedAt.split(" ");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = (timePart ?? "00:00").split(":").map(Number);
  return new Date(y, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0);
}

function seedMonitoringPointHistory(point: MonitoringPoint): MonitoringPointHistoryRecord[] {
  const rng = mulberry32(point.id * 100003 + HISTORY_WINDOW_DAYS * 97);
  const endDate = parseUpdatedAtToDate(point.updatedAt);
  endDate.setHours(0, 0, 0, 0);

  const currentRank = waterQualityRank(point.waterQuality);
  const currentWind = point.windSpeed;
  const currentTemp = point.temperature;
  const isAbnormal = point.status !== "normal";
  const driftScale = point.status === "offline" ? 2.4 : 1.4;

  const records: MonitoringPointHistoryRecord[] = [];
  for (let i = HISTORY_WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const dateStr = formatTrendDate(d);

    const progress = HISTORY_WINDOW_DAYS > 1 ? (HISTORY_WINDOW_DAYS - 1 - i) / (HISTORY_WINDOW_DAYS - 1) : 1;
    const wqDrift = isAbnormal ? (1 - progress) * driftScale : 0;
    let rank = Math.round(currentRank - wqDrift + (rng() - 0.5) * (isAbnormal ? 0.8 : 1.2));
    rank = clampNumber(rank, 0, WATER_QUALITY_ORDER.length - 1);

    const windBase = currentWind - (isAbnormal ? (1 - progress) * Math.max(currentWind * 0.35, 0.6) : 0);
    const wind = clampNumber(Number((windBase + (rng() - 0.5) * 2.2).toFixed(1)), 0, 100);

    const tempBase = currentTemp - (isAbnormal ? (1 - progress) * 2.4 : 0);
    const temp = clampNumber(Number((tempBase + (rng() - 0.5) * 1.6).toFixed(1)), -20, 50);

    records.push({
      date: dateStr,
      waterQualityRank: rank,
      waterQuality: WATER_QUALITY_ORDER[rank],
      windSpeed: wind,
      temperature: temp
    });
  }

  const lastIdx = records.length - 1;
  records[lastIdx] = {
    ...records[lastIdx],
    waterQualityRank: currentRank,
    waterQuality: point.waterQuality,
    windSpeed: currentWind,
    temperature: currentTemp
  };

  monitoringPointHistory.set(point.id, records);
  return records;
}

function appendMonitoringPointHistory(point: MonitoringPoint) {
  const todayStr = formatTrendDate(parseUpdatedAtToDate(point.updatedAt));
  let records = monitoringPointHistory.get(point.id);
  if (!records) {
    records = seedMonitoringPointHistory(point);
  }
  const idx = records.findIndex((r) => r.date === todayStr);
  const record: MonitoringPointHistoryRecord = {
    date: todayStr,
    waterQualityRank: waterQualityRank(point.waterQuality),
    waterQuality: point.waterQuality,
    windSpeed: point.windSpeed,
    temperature: point.temperature
  };
  if (idx >= 0) {
    records[idx] = record;
  } else {
    records.push(record);
    records.sort((a, b) => a.date.localeCompare(b.date));
    if (records.length > HISTORY_WINDOW_DAYS) {
      records.splice(0, records.length - HISTORY_WINDOW_DAYS);
    }
    monitoringPointHistory.set(point.id, records);
  }
}

function initializeAllMonitoringPointHistory() {
  for (const p of monitoringPoints) {
    seedMonitoringPointHistory(p);
  }
}

interface TrendPoint {
  timestamp: string;
  value: number | string;
  rank?: number;
}

interface TrendSeries {
  metric: string;
  unit: string;
  points: TrendPoint[];
}

interface TrendAssessment {
  waterQualityTrend: string;
  windSpeedTrend: string;
  temperatureTrend: string;
  summary: string;
}

interface MonitoringPointTrendResponse {
  pointId: number;
  range: string;
  from: string;
  to: string;
  granularity: string;
  series: TrendSeries[];
  assessment: TrendAssessment;
}

function buildMonitoringPointTrend(point: MonitoringPoint, range: string): MonitoringPointTrendResponse {
  const days = TREND_RANGE_DAYS[range as TrendRange] ?? TREND_RANGE_DAYS["7d"];
  let history = monitoringPointHistory.get(point.id);
  if (!history || history.length === 0) {
    history = seedMonitoringPointHistory(point);
  }
  const slice = history.slice(-days);
  if (slice.length === 0) {
    return {
      pointId: point.id,
      range,
      from: "",
      to: "",
      granularity: "daily",
      series: [],
      assessment: {
        waterQualityTrend: "stable",
        windSpeedTrend: "stable",
        temperatureTrend: "stable",
        summary: "暂无历史趋势数据。"
      }
    };
  }

  const dates = slice.map((r) => r.date);
  const wqRanks = slice.map((r) => r.waterQualityRank);
  const winds = slice.map((r) => r.windSpeed);
  const temps = slice.map((r) => r.temperature);
  const actualDays = slice.length;

  const waterQualitySeries: TrendSeries = {
    metric: "waterQuality",
    unit: "",
    points: slice.map((r) => ({ timestamp: r.date, value: r.waterQuality, rank: r.waterQualityRank }))
  };
  const windSpeedSeries: TrendSeries = {
    metric: "windSpeed",
    unit: "m/s",
    points: slice.map((r) => ({ timestamp: r.date, value: r.windSpeed }))
  };
  const temperatureSeries: TrendSeries = {
    metric: "temperature",
    unit: "°C",
    points: slice.map((r) => ({ timestamp: r.date, value: r.temperature }))
  };

  const startRank = wqRanks[0];
  const endRank = wqRanks[actualDays - 1];
  const waterQualityTrend = endRank > startRank ? "worsening" : endRank < startRank ? "improving" : "stable";

  const startWind = winds[0];
  const endWind = winds[actualDays - 1];
  const windSpeedTrend = endWind > startWind * 1.1 ? "rising" : endWind < startWind * 0.9 ? "falling" : "stable";

  const startTemp = temps[0];
  const endTemp = temps[actualDays - 1];
  const temperatureTrend = endTemp > startTemp + 1 ? "rising" : endTemp < startTemp - 1 ? "falling" : "stable";

  const parts: string[] = [];
  if (waterQualityTrend === "worsening") {
    parts.push(`水质由 ${WATER_QUALITY_ORDER[startRank]} 恶化至 ${WATER_QUALITY_ORDER[endRank]}`);
  } else if (waterQualityTrend === "improving") {
    parts.push(`水质由 ${WATER_QUALITY_ORDER[startRank]} 改善至 ${WATER_QUALITY_ORDER[endRank]}`);
  }
  if (windSpeedTrend === "rising") parts.push("风速呈上升趋势");
  else if (windSpeedTrend === "falling") parts.push("风速呈下降趋势");
  if (temperatureTrend === "rising") parts.push("温度呈上升趋势");
  else if (temperatureTrend === "falling") parts.push("温度呈下降趋势");

  const worsening = waterQualityTrend === "worsening" || windSpeedTrend === "rising" || temperatureTrend === "rising";
  const summary = parts.length === 0
    ? `近 ${actualDays} 天各项监测指标基本平稳，未见明显异常波动。`
    : `近 ${actualDays} 天${parts.join("，")}。${worsening ? "呈持续恶化趋势，建议重点关注并研判海域异常是否持续恶化。" : "请结合现场情况综合研判。"}`;

  return {
    pointId: point.id,
    range,
    from: dates[0],
    to: dates[dates.length - 1],
    granularity: "daily",
    series: [waterQualitySeries, windSpeedSeries, temperatureSeries],
    assessment: {
      waterQualityTrend,
      windSpeedTrend,
      temperatureTrend,
      summary
    }
  };
}

app.get("/api/monitoring-points/:id/trend", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const point = monitoringPoints.find((p) => p.id === id);

  if (!point) {
    res.status(404).json({ message: "监测点不存在" });
    return;
  }

  const validation = validateMonitoringPoint(point);
  if (!validation.valid) {
    res.status(500).json({
      message: "监测点数据校验失败",
      errors: validation.errors
    });
    return;
  }

  const range = (req.query.range as string) || "7d";
  if (!TREND_RANGES.includes(range as TrendRange)) {
    res.status(400).json({ message: "时间范围参数无效，支持 7d、30d、90d" });
    return;
  }

  res.json(buildMonitoringPointTrend(point, range));
});

app.post("/api/monitoring-points", requireAuth, (req, res) => {
  const parsed = monitoringPointSchema.safeParse(req.body);
  if (!parsed.success) {
    const errorMessages = parsed.error.issues.map((issue) => issue.message).join("；");
    res.status(400).json({ message: `监测点数据校验失败：${errorMessages}` });
    return;
  }

  const now = new Date().toISOString().slice(0, 16).replace("T", " ");
  const point: MonitoringPoint = {
    id: Math.max(...monitoringPoints.map((p) => p.id), 0) + 1,
    name: parsed.data.name,
    seaArea: parsed.data.seaArea,
    type: parsed.data.type,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    status: parsed.data.status,
    waterQuality: parsed.data.waterQuality,
    windSpeed: parsed.data.windSpeed,
    temperature: parsed.data.temperature,
    updatedAt: parsed.data.updatedAt ?? now
  };

  monitoringPoints.push(point);

  const seaArea = seaAreas.find((a) => a.name === point.seaArea);
  if (seaArea && !seaArea.monitoringPointIds.includes(point.id)) {
    seaArea.monitoringPointIds.push(point.id);
  }

  runAlertEvaluation();
  appendMonitoringPointHistory(point);
  res.status(201).json(point);
});

app.patch("/api/monitoring-points/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const point = monitoringPoints.find((p) => p.id === id);

  if (!point) {
    res.status(404).json({ message: "监测点不存在" });
    return;
  }

  const existingValidation = validateMonitoringPoint(point);
  if (!existingValidation.valid) {
    res.status(500).json({
      message: "监测点存量数据校验失败，拒绝更新",
      errors: existingValidation.errors
    });
    return;
  }

  const parsed = monitoringPointSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    const errorMessages = parsed.error.issues.map((issue) => issue.message).join("；");
    res.status(400).json({ message: `监测点数据校验失败：${errorMessages}` });
    return;
  }

  const now = new Date().toISOString().slice(0, 16).replace("T", " ");
  const updates = { ...parsed.data };
  delete (updates as Partial<MonitoringPoint>).updatedAt;

  Object.assign(point, updates);
  point.updatedAt = parsed.data.updatedAt ?? now;

  if (parsed.data.seaArea) {
    seaAreas.forEach((area) => {
      const idx = area.monitoringPointIds.indexOf(id);
      if (idx !== -1) {
        area.monitoringPointIds.splice(idx, 1);
      }
    });
    const newSeaArea = seaAreas.find((a) => a.name === parsed.data.seaArea);
    if (newSeaArea && !newSeaArea.monitoringPointIds.includes(id)) {
      newSeaArea.monitoringPointIds.push(id);
    }
  }

  runAlertEvaluation();
  appendMonitoringPointHistory(point);
  res.json(point);
});

app.delete("/api/monitoring-points/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const index = monitoringPoints.findIndex((p) => p.id === id);

  if (index === -1) {
    res.status(404).json({ message: "监测点不存在" });
    return;
  }

  monitoringPoints.splice(index, 1);

  seaAreas.forEach((area) => {
    const idx = area.monitoringPointIds.indexOf(id);
    if (idx !== -1) {
      area.monitoringPointIds.splice(idx, 1);
    }
  });

  for (let i = alertResults.length - 1; i >= 0; i--) {
    if (alertResults[i].pointId === id) {
      alertResults.splice(i, 1);
    }
  }

  monitoringPointHistory.delete(id);

  res.json({ message: "监测点已删除" });
});

app.get("/api/sea-areas", requireAuth, (_req, res) => {
  const validPoints = sanitizeMonitoringPoints(monitoringPoints);
  const result = seaAreas.map((area) => {
    const points = validPoints.filter((p) => area.monitoringPointIds.includes(p.id));
    return {
      ...area,
      monitoringPoints: points.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        status: p.status,
        waterQuality: p.waterQuality
      }))
    };
  });
  res.json(result);
});

app.get("/api/alert-rules", requireAuth, (_req, res) => {
  res.json(alertRules);
});

app.post("/api/alert-rules", requireAuth, (req, res) => {
  const parsed = alertRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "告警规则信息不完整" });
    return;
  }

  const rule: AlertRule = {
    id: Math.max(...alertRules.map((r) => r.id)) + 1,
    name: parsed.data.name,
    target: parsed.data.target,
    condition: parsed.data.condition,
    conditionStruct: parsed.data.conditionStruct,
    level: parsed.data.level,
    enabled: parsed.data.enabled
  };

  alertRules.push(rule);
  res.status(201).json(rule);
});

app.patch("/api/alert-rules/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const rule = alertRules.find((r) => r.id === id);

  if (!rule) {
    res.status(404).json({ message: "告警规则不存在" });
    return;
  }

  const parsed = alertRuleSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "参数格式错误" });
    return;
  }

  Object.assign(rule, parsed.data);
  res.json(rule);
});

app.patch("/api/alert-rules/:id/toggle", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const rule = alertRules.find((r) => r.id === id);

  if (!rule) {
    res.status(404).json({ message: "告警规则不存在" });
    return;
  }

  rule.enabled = !rule.enabled;
  res.json(rule);
});

app.delete("/api/alert-rules/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const index = alertRules.findIndex((r) => r.id === id);

  if (index === -1) {
    res.status(404).json({ message: "告警规则不存在" });
    return;
  }

  alertRules.splice(index, 1);
  res.json({ message: "已删除" });
});

app.get("/api/alerts", requireAuth, (req, res) => {
  const status = req.query.status as string | undefined;
  const level = req.query.level as string | undefined;

  let filtered = filterAlertsByEnabledRules(alertResults);

  if (status) {
    filtered = filtered.filter((a) => a.status === status);
  }
  if (level) {
    filtered = filtered.filter((a) => a.level === level);
  }

  res.json(filtered);
});

app.get("/api/alerts/summary", requireAuth, (_req, res) => {
  const filteredAlerts = filterAlertsByEnabledRules(alertResults);
  const summary = {
    total: filteredAlerts.length,
    active: filteredAlerts.filter((a) => a.status === "active").length,
    acknowledged: filteredAlerts.filter((a) => a.status === "acknowledged").length,
    resolved: filteredAlerts.filter((a) => a.status === "resolved").length,
    high: filteredAlerts.filter((a) => a.level === "high" && a.status === "active").length,
    medium: filteredAlerts.filter((a) => a.level === "medium" && a.status === "active").length,
    low: filteredAlerts.filter((a) => a.level === "low" && a.status === "active").length
  };
  res.json(summary);
});

app.post("/api/alerts/evaluate", requireAuth, (_req, res) => {
  const newAlerts = runAlertEvaluation();
  res.json({
    evaluated: true,
    newCount: newAlerts.length,
    newAlerts
  });
});

app.patch("/api/alerts/:id/status", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const statusSchema = z.object({ status: z.enum(["active", "acknowledged", "resolved"]) });
  const parsed = statusSchema.safeParse(req.body);
  const alert = alertResults.find((a) => a.id === id);

  if (!alert) {
    res.status(404).json({ message: "告警不存在" });
    return;
  }

  if (!parsed.success) {
    res.status(400).json({ message: "状态值无效" });
    return;
  }

  alert.status = parsed.data.status;
  const now = new Date().toISOString().slice(0, 16).replace("T", " ");
  if (parsed.data.status === "acknowledged" && !alert.acknowledgedAt) {
    alert.acknowledgedAt = now;
  }
  if (parsed.data.status === "resolved") {
    alert.resolvedAt = now;
  }

  res.json(alert);
});

app.get("/api/events", requireAuth, async (req, res) => {
  const category = req.query.category as string | undefined;
  const level = req.query.level as string | undefined;
  const status = req.query.status as string | undefined;
  const seaArea = req.query.seaArea as string | undefined;

  if (isDbAvailable()) {
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      if (category) { conditions.push(`category = $${idx++}`); params.push(category); }
      if (level) { conditions.push(`level = $${idx++}`); params.push(level); }
      if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
      if (seaArea) { conditions.push(`sea_area = $${idx++}`); params.push(seaArea); }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const { rows } = await getPool()!.query(`SELECT * FROM event_records ${where} ORDER BY occurred_at DESC`, params);
      res.json(rows.map((r) => mapEventRow(r as Record<string, unknown>)));
    } catch {
      res.status(500).json({ message: "查询事件失败" });
    }
    return;
  }

  let filtered = [...events];
  if (category) filtered = filtered.filter((e) => e.category === category);
  if (level) filtered = filtered.filter((e) => e.level === level);
  if (status) filtered = filtered.filter((e) => e.status === status);
  if (seaArea) filtered = filtered.filter((e) => e.seaArea === seaArea);
  res.json(filtered);
});

app.post("/api/events", requireAuth, async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "事件信息不完整" });
    return;
  }

  if (isDbAvailable()) {
    try {
      const now = new Date();
      const { rows } = await getPool()!.query(
        `INSERT INTO event_records (title, category, sea_area, level, status, reporter, assignee, source, disposal_note, responsible_person, occurred_at)
         VALUES ($1,$2,$3,$4,'reported',$5,'未分派',$6,'','',$7) RETURNING *`,
        [parsed.data.title, parsed.data.category, parsed.data.seaArea, parsed.data.level, parsed.data.reporter, parsed.data.source, now]
      );
      await syncEventsToMemory(events);
      res.status(201).json(mapEventRow(rows[0] as Record<string, unknown>));
    } catch {
      res.status(500).json({ message: "创建事件失败" });
    }
    return;
  }

  const event: EventRecord = {
    id: Math.max(...events.map((item) => item.id)) + 1,
    title: parsed.data.title,
    category: parsed.data.category,
    seaArea: parsed.data.seaArea,
    level: parsed.data.level,
    status: "reported",
    reporter: parsed.data.reporter,
    assignee: "未分派",
    source: parsed.data.source,
    disposalNote: "",
    responsiblePerson: "",
    occurredAt: new Date().toISOString().slice(0, 16).replace("T", " ")
  };
  events.unshift(event);
  res.status(201).json(event);
});

app.post("/api/events/pollution-alert", requireAuth, async (req, res) => {
  const user = res.locals.user as { name?: string; username?: string; role?: string };
  if (user.role !== "admin" && user.role !== "supervisor") {
    res.status(403).json({ message: "无权限上报污染预警" });
    return;
  }

  const parsed = pollutionAlertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "预警信息不完整" });
    return;
  }

  const { pollutionType, suspectedSource, seaArea, level, description } = parsed.data;
  const title = `[污染预警] ${pollutionType} - ${seaArea}`;
  const category = "污染预警";
  const source = "人工上报";

  const reporter = user?.name || user?.username || "监管人员";

  const fullDescription =
    `污染类型：${pollutionType}\n` +
    `疑似来源：${suspectedSource}\n` +
    `现场描述：${description}`;

  if (isDbAvailable()) {
    try {
      const client = await getPool()!.connect();
      try {
        await client.query("BEGIN");
        const now = new Date();
        const { rows } = await client.query(
          `INSERT INTO event_records (title, category, sea_area, level, status, reporter, assignee, source, disposal_note, responsible_person, occurred_at)
           VALUES ($1,$2,$3,$4,'reported',$5,'未分派',$6,$7,'',$8) RETURNING *`,
          [title, category, seaArea, level, reporter, source, fullDescription, now]
        );
        const eventId = rows[0].id as number;

        await client.query(
          `INSERT INTO event_status_audits (event_id, from_status, to_status, operator, operator_role, operated_at, remark)
           VALUES ($1,'reported','reported',$2,$3,$4,$5)`,
          [eventId, reporter, user?.role || "supervisor", now, "污染预警上报"]
        );

        await client.query("COMMIT");
        await syncEventsToMemory(events);

        res.status(201).json({
          eventId,
          title,
          status: "reported",
          message: "污染预警已上报，已同步至事件监管"
        });
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("Pollution alert creation failed:", err);
        res.status(500).json({ message: "预警上报失败" });
      } finally {
        client.release();
      }
    } catch {
      res.status(500).json({ message: "预警上报失败" });
    }
    return;
  }

  const event: EventRecord = {
    id: Math.max(...events.map((item) => item.id)) + 1,
    title,
    category,
    seaArea,
    level,
    status: "reported",
    reporter,
    assignee: "未分派",
    source,
    disposalNote: fullDescription,
    responsiblePerson: "",
    occurredAt: new Date().toISOString().slice(0, 16).replace("T", " ")
  };

  const auditRecord: EventStatusAudit = {
    id: eventStatusAudits.length > 0 ? Math.max(...eventStatusAudits.map((a) => a.id)) + 1 : 1,
    eventId: event.id,
    fromStatus: "reported",
    toStatus: "reported",
    operator: reporter,
    operatorRole: user?.role || "supervisor",
    operatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    remark: "污染预警上报"
  };
  eventStatusAudits.push(auditRecord);

  events.unshift(event);
  res.status(201).json({
    eventId: event.id,
    title,
    status: "reported",
    message: "污染预警已上报，已同步至事件监管"
  });
});

app.patch("/api/events/:id/status", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const statusSchema = z.object({
    status: z.enum(["reported", "processing", "resolved"]),
    disposalNote: z.string().optional(),
    responsiblePerson: z.string().optional()
  });
  const parsed = statusSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ message: "状态值无效" });
    return;
  }

  const { status, disposalNote, responsiblePerson } = parsed.data;

  if (isDbAvailable()) {
    const client = await getPool()!.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query("SELECT * FROM event_records WHERE id = $1 FOR UPDATE", [id]);
      if (rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ message: "事件不存在" });
        return;
      }

      const current = rows[0] as Record<string, unknown>;
      const currentStatus = current.status as string;
      const currentResponsible = (current.responsible_person as string) ?? "";

      if (status === "processing") {
        if (!responsiblePerson || responsiblePerson.trim() === "") {
          await client.query("ROLLBACK");
          res.status(400).json({ message: "处理中状态必须填写责任人" });
          return;
        }
      }

      if (status === "resolved") {
        if (!disposalNote || disposalNote.trim() === "") {
          await client.query("ROLLBACK");
          res.status(400).json({ message: "办结状态必须填写处置说明" });
          return;
        }
        if (!currentResponsible && (!responsiblePerson || responsiblePerson.trim() === "")) {
          await client.query("ROLLBACK");
          res.status(400).json({ message: "办结状态必须指定责任人" });
          return;
        }
      }

      const updates: string[] = ["status = $1"];
      const params: unknown[] = [status];
      let pIdx = 2;

      if (status === "processing") {
        updates.push(`responsible_person = $${pIdx++}`);
        params.push(responsiblePerson);
        if (disposalNote !== undefined) {
          updates.push(`disposal_note = $${pIdx++}`);
          params.push(disposalNote);
        }
      }

      if (status === "resolved") {
        updates.push(`disposal_note = $${pIdx++}`);
        params.push(disposalNote);
        if (responsiblePerson !== undefined) {
          updates.push(`responsible_person = $${pIdx++}`);
          params.push(responsiblePerson);
        }
        const now = new Date();
        updates.push(`resolved_at = $${pIdx++}`);
        params.push(now);
      }

      params.push(id);
      await client.query(`UPDATE event_records SET ${updates.join(", ")} WHERE id = $${pIdx}`, params);

      const user = res.locals.user as { name?: string; username?: string; role?: string };
      await client.query(
        `INSERT INTO event_status_audits (event_id, from_status, to_status, operator, operator_role, operated_at, remark)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, currentStatus, status, user?.name || user?.username || "未知", user?.role || "unknown", new Date(), disposalNote || responsiblePerson || ""]
      );

      await client.query("COMMIT");
      await syncEventsToMemory(events);

      const updated = await client.query("SELECT * FROM event_records WHERE id = $1", [id]);
      res.json(mapEventRow(updated.rows[0] as Record<string, unknown>));
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Event status update failed:", err);
      res.status(500).json({ message: "状态更新失败" });
    } finally {
      client.release();
    }
    return;
  }

  const event = events.find((item) => item.id === id);
  if (!event) {
    res.status(404).json({ message: "事件不存在" });
    return;
  }

  if (status === "processing") {
    if (!responsiblePerson || responsiblePerson.trim() === "") {
      res.status(400).json({ message: "处理中状态必须填写责任人" });
      return;
    }
    event.responsiblePerson = responsiblePerson;
    if (disposalNote !== undefined) { event.disposalNote = disposalNote; }
  }

  if (status === "resolved") {
    if (!disposalNote || disposalNote.trim() === "") {
      res.status(400).json({ message: "办结状态必须填写处置说明" });
      return;
    }
    if (!event.responsiblePerson && (!responsiblePerson || responsiblePerson.trim() === "")) {
      res.status(400).json({ message: "办结状态必须指定责任人" });
      return;
    }
    event.disposalNote = disposalNote;
    if (responsiblePerson !== undefined) { event.responsiblePerson = responsiblePerson; }
    event.resolvedAt = new Date().toISOString().slice(0, 16).replace("T", " ");
  }

  const user = res.locals.user as { name?: string; username?: string; role?: string };
  const auditRecord: EventStatusAudit = {
    id: eventStatusAudits.length > 0 ? Math.max(...eventStatusAudits.map((a) => a.id)) + 1 : 1,
    eventId: id,
    fromStatus: event.status,
    toStatus: status,
    operator: user?.name || user?.username || "未知",
    operatorRole: user?.role || "unknown",
    operatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    remark: disposalNote || responsiblePerson || ""
  };
  eventStatusAudits.push(auditRecord);

  event.status = status;
  res.json(event);
});

app.get("/api/events/:id/audit", requireAuth, async (req, res) => {
  const id = Number(req.params.id);

  if (isDbAvailable()) {
    try {
      const evCheck = await getPool()!.query("SELECT id FROM event_records WHERE id = $1", [id]);
      if (evCheck.rows.length === 0) {
        res.status(404).json({ message: "事件不存在" });
        return;
      }
      const { rows } = await getPool()!.query(
        "SELECT * FROM event_status_audits WHERE event_id = $1 ORDER BY operated_at ASC",
        [id]
      );
      res.json(rows.map((r) => mapAuditRow(r as Record<string, unknown>)));
    } catch {
      res.status(500).json({ message: "查询审计记录失败" });
    }
    return;
  }

  const event = events.find((item) => item.id === id);
  if (!event) {
    res.status(404).json({ message: "事件不存在" });
    return;
  }

  const audits = eventStatusAudits
    .filter((a) => a.eventId === id)
    .sort((a, b) => new Date(a.operatedAt).getTime() - new Date(b.operatedAt).getTime());

  res.json(audits);
});

app.get("/api/patrols", requireAuth, async (req, res) => {
  const seaArea = req.query.seaArea as string | undefined;
  const inspector = req.query.inspector as string | undefined;
  const status = req.query.status as string | undefined;
  const hasProblem = req.query.hasProblem as string | undefined;
  const relatedEventId = req.query.relatedEventId as string | undefined;

  if (isDbAvailable()) {
    try {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      if (seaArea) { conditions.push(`sea_area = $${idx++}`); params.push(seaArea); }
      if (inspector) { conditions.push(`inspector = $${idx++}`); params.push(inspector); }
      if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
      if (hasProblem !== undefined) {
        if (hasProblem === "true") conditions.push(`problems_found <> ''`);
        else conditions.push(`problems_found = ''`);
      }
      if (relatedEventId !== undefined) {
        if (relatedEventId === "null") conditions.push(`related_event_id IS NULL`);
        else { conditions.push(`related_event_id = $${idx++}`); params.push(Number(relatedEventId)); }
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const { rows } = await getPool()!.query(`SELECT * FROM patrol_records ${where} ORDER BY patrol_time DESC`, params);
      res.json(rows.map((r) => mapPatrolRow(r as Record<string, unknown>)));
    } catch {
      res.status(500).json({ message: "查询巡查记录失败" });
    }
    return;
  }

  let filtered = [...patrolRecords];
  if (seaArea) filtered = filtered.filter((p) => p.seaArea === seaArea);
  if (inspector) filtered = filtered.filter((p) => p.inspector === inspector);
  if (status) filtered = filtered.filter((p) => p.status === status);
  if (hasProblem !== undefined) {
    filtered = filtered.filter((p) =>
      hasProblem === "true" ? p.problemsFound.trim() !== "" : p.problemsFound.trim() === ""
    );
  }
  if (relatedEventId !== undefined) {
    const rid = relatedEventId === "null" ? null : Number(relatedEventId);
    filtered = filtered.filter((p) => p.relatedEventId === rid);
  }
  filtered.sort((a, b) => new Date(b.patrolTime.replace(" ", "T")).getTime() - new Date(a.patrolTime.replace(" ", "T")).getTime());
  res.json(filtered);
});

app.post("/api/patrols", requireAuth, async (req, res) => {
  const parsed = patrolSchema.safeParse(req.body);
  if (!parsed.success) {
    const errorMessages = parsed.error.issues.map((issue) => issue.message).join("；");
    res.status(400).json({ message: `巡查记录校验失败：${errorMessages}` });
    return;
  }

  const user = res.locals.user as { name?: string; username?: string; role?: string };
  const inspector = parsed.data.inspector || user?.name || user?.username || "巡查人员";
  const inspectorRole = user?.role || "supervisor";
  const now = new Date();
  const patrolTime = parsed.data.patrolTime ?? now.toISOString().slice(0, 16).replace("T", " ");
  let status: PatrolRecord["status"] = "recorded";
  let relatedEventId: number | null = null;

  if (parsed.data.relatedEventId) {
    const evId = parsed.data.relatedEventId;
    if (isDbAvailable()) {
      const evCheck = await getPool()!.query("SELECT id FROM event_records WHERE id = $1", [evId]);
      if (evCheck.rows.length === 0) {
        res.status(400).json({ message: "关联事件不存在" });
        return;
      }
    } else if (!events.some((e) => e.id === evId)) {
      res.status(400).json({ message: "关联事件不存在" });
      return;
    }
    relatedEventId = evId;
    status = "escalated";
  }

  if (isDbAvailable()) {
    try {
      const { rows } = await getPool()!.query(
        `INSERT INTO patrol_records (sea_area, inspector, inspector_role, patrol_time, problems_found, on_site_conclusion, related_event_id, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [parsed.data.seaArea, inspector, inspectorRole, patrolTime, parsed.data.problemsFound, parsed.data.onSiteConclusion, relatedEventId, status, now]
      );
      res.status(201).json(mapPatrolRow(rows[0] as Record<string, unknown>));
    } catch {
      res.status(500).json({ message: "创建巡查记录失败" });
    }
    return;
  }

  const patrol: PatrolRecord = {
    id: patrolRecords.length > 0 ? Math.max(...patrolRecords.map((p) => p.id)) + 1 : 1,
    seaArea: parsed.data.seaArea,
    inspector,
    inspectorRole,
    patrolTime,
    problemsFound: parsed.data.problemsFound,
    onSiteConclusion: parsed.data.onSiteConclusion,
    relatedEventId,
    status,
    createdAt: now.toISOString().slice(0, 16).replace("T", " ")
  };
  patrolRecords.unshift(patrol);
  res.status(201).json(patrol);
});

app.get("/api/patrols/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);

  if (isDbAvailable()) {
    try {
      const { rows } = await getPool()!.query("SELECT * FROM patrol_records WHERE id = $1", [id]);
      if (rows.length === 0) {
        res.status(404).json({ message: "巡查记录不存在" });
        return;
      }
      const patrol = mapPatrolRow(rows[0] as Record<string, unknown>);
      let relatedEvent = null;
      if (patrol.relatedEventId) {
        const evRes = await getPool()!.query("SELECT * FROM event_records WHERE id = $1", [patrol.relatedEventId]);
        if (evRes.rows.length > 0) {
          relatedEvent = mapEventRow(evRes.rows[0] as Record<string, unknown>);
        }
      }
      res.json({ patrol, relatedEvent });
    } catch {
      res.status(500).json({ message: "查询巡查记录失败" });
    }
    return;
  }

  const patrol = patrolRecords.find((p) => p.id === id);
  if (!patrol) {
    res.status(404).json({ message: "巡查记录不存在" });
    return;
  }
  const relatedEvent = patrol.relatedEventId ? events.find((e) => e.id === patrol.relatedEventId) ?? null : null;
  res.json({ patrol, relatedEvent });
});

app.patch("/api/patrols/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = patrolUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    const errorMessages = parsed.error.issues.map((issue) => issue.message).join("；");
    res.status(400).json({ message: `巡查记录校验失败：${errorMessages}` });
    return;
  }

  const data = parsed.data;

  if (data.relatedEventId !== undefined && data.relatedEventId !== null) {
    const evId = data.relatedEventId;
    if (isDbAvailable()) {
      const evCheck = await getPool()!.query("SELECT id FROM event_records WHERE id = $1", [evId]);
      if (evCheck.rows.length === 0) {
        res.status(400).json({ message: "关联事件不存在" });
        return;
      }
    } else if (!events.some((e) => e.id === evId)) {
      res.status(400).json({ message: "关联事件不存在" });
      return;
    }
  }

  if (isDbAvailable()) {
    try {
      const check = await getPool()!.query("SELECT id FROM patrol_records WHERE id = $1", [id]);
      if (check.rows.length === 0) {
        res.status(404).json({ message: "巡查记录不存在" });
        return;
      }
      const updates: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      if (data.seaArea !== undefined) { updates.push(`sea_area = $${idx++}`); params.push(data.seaArea); }
      if (data.inspector !== undefined) { updates.push(`inspector = $${idx++}`); params.push(data.inspector); }
      if (data.patrolTime !== undefined) { updates.push(`patrol_time = $${idx++}`); params.push(data.patrolTime); }
      if (data.problemsFound !== undefined) { updates.push(`problems_found = $${idx++}`); params.push(data.problemsFound); }
      if (data.onSiteConclusion !== undefined) { updates.push(`on_site_conclusion = $${idx++}`); params.push(data.onSiteConclusion); }
      if (data.relatedEventId !== undefined) {
        updates.push(`related_event_id = $${idx++}`);
        params.push(data.relatedEventId);
        updates.push(`status = $${idx++}`);
        params.push(data.relatedEventId === null ? "recorded" : "escalated");
      }
      if (updates.length === 0) {
        const { rows } = await getPool()!.query("SELECT * FROM patrol_records WHERE id = $1", [id]);
        res.json(mapPatrolRow(rows[0] as Record<string, unknown>));
        return;
      }
      params.push(id);
      const { rows } = await getPool()!.query(`UPDATE patrol_records SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`, params);
      res.json(mapPatrolRow(rows[0] as Record<string, unknown>));
    } catch {
      res.status(500).json({ message: "更新巡查记录失败" });
    }
    return;
  }

  const patrol = patrolRecords.find((p) => p.id === id);
  if (!patrol) {
    res.status(404).json({ message: "巡查记录不存在" });
    return;
  }
  if (data.seaArea !== undefined) patrol.seaArea = data.seaArea;
  if (data.inspector !== undefined) patrol.inspector = data.inspector;
  if (data.patrolTime !== undefined) patrol.patrolTime = data.patrolTime;
  if (data.problemsFound !== undefined) patrol.problemsFound = data.problemsFound;
  if (data.onSiteConclusion !== undefined) patrol.onSiteConclusion = data.onSiteConclusion;
  if (data.relatedEventId !== undefined) {
    patrol.relatedEventId = data.relatedEventId;
    patrol.status = data.relatedEventId === null ? "recorded" : "escalated";
  }
  res.json(patrol);
});

app.post("/api/patrols/:id/escalate", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = patrolEscalateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "上报参数格式错误" });
    return;
  }

  const user = res.locals.user as { name?: string; username?: string; role?: string };

  if (isDbAvailable()) {
    const client = await getPool()!.connect();
    try {
      await client.query("BEGIN");
      const patrolRes = await client.query("SELECT * FROM patrol_records WHERE id = $1 FOR UPDATE", [id]);
      if (patrolRes.rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ message: "巡查记录不存在" });
        return;
      }
      const patrolRow = patrolRes.rows[0] as Record<string, unknown>;
      if (patrolRow.related_event_id !== null && patrolRow.related_event_id !== undefined) {
        await client.query("ROLLBACK");
        res.status(400).json({ message: "该巡查记录已关联事件，无需重复上报" });
        return;
      }

      const seaArea = patrolRow.sea_area as string;
      const inspector = (patrolRow.inspector as string) ?? user?.name ?? user?.username ?? "巡查人员";
      const problemsFound = (patrolRow.problems_found as string) ?? "";
      if (!problemsFound.trim()) {
        await client.query("ROLLBACK");
        res.status(400).json({ message: "未发现问题的巡查记录无需上报为事件" });
        return;
      }

      const title = parsed.data.title ?? `[海域巡查] ${seaArea} 巡查发现问题`;
      const category = parsed.data.category ?? "海域巡查";
      const level = parsed.data.level;
      const source = "海域巡查";
      const reporter = inspector;
      const disposalNote = `巡查发现：${problemsFound}`;
      const now = new Date();

      const evRes = await client.query(
        `INSERT INTO event_records (title, category, sea_area, level, status, reporter, assignee, source, disposal_note, responsible_person, occurred_at)
         VALUES ($1,$2,$3,$4,'reported',$5,'未分派',$6,$7,'',$8) RETURNING *`,
        [title, category, seaArea, level, reporter, source, disposalNote, now]
      );
      const newEventId = evRes.rows[0].id as number;

      await client.query(
        `INSERT INTO event_status_audits (event_id, from_status, to_status, operator, operator_role, operated_at, remark)
         VALUES ($1,'reported','reported',$2,$3,$4,$5)`,
        [newEventId, reporter, user?.role || "supervisor", now, "由海域巡查记录上报"]
      );

      await client.query(
        "UPDATE patrol_records SET related_event_id = $1, status = 'escalated' WHERE id = $2",
        [newEventId, id]
      );

      await client.query("COMMIT");
      await syncEventsToMemory(events);
      const updatedPatrol = await client.query("SELECT * FROM patrol_records WHERE id = $1", [id]);
      res.status(201).json({
        patrol: mapPatrolRow(updatedPatrol.rows[0] as Record<string, unknown>),
        event: mapEventRow(evRes.rows[0] as Record<string, unknown>),
        message: "巡查问题已上报为事件，已同步至事件监管"
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Patrol escalate failed:", err);
      res.status(500).json({ message: "上报事件失败" });
    } finally {
      client.release();
    }
    return;
  }

  const patrol = patrolRecords.find((p) => p.id === id);
  if (!patrol) {
    res.status(404).json({ message: "巡查记录不存在" });
    return;
  }
  if (patrol.relatedEventId !== null) {
    res.status(400).json({ message: "该巡查记录已关联事件，无需重复上报" });
    return;
  }
  if (!patrol.problemsFound.trim()) {
    res.status(400).json({ message: "未发现问题的巡查记录无需上报为事件" });
    return;
  }

  const title = parsed.data.title ?? `[海域巡查] ${patrol.seaArea} 巡查发现问题`;
  const category = parsed.data.category ?? "海域巡查";
  const level = parsed.data.level;
  const source = "海域巡查";
  const reporter = patrol.inspector;
  const now = new Date();
  const nowStr = now.toISOString().slice(0, 16).replace("T", " ");

  const newEvent: EventRecord = {
    id: events.length > 0 ? Math.max(...events.map((e) => e.id)) + 1 : 1,
    title,
    category,
    seaArea: patrol.seaArea,
    level,
    status: "reported",
    reporter,
    assignee: "未分派",
    source,
    disposalNote: `巡查发现：${patrol.problemsFound}`,
    responsiblePerson: "",
    occurredAt: nowStr
  };
  events.unshift(newEvent);

  const auditRecord: EventStatusAudit = {
    id: eventStatusAudits.length > 0 ? Math.max(...eventStatusAudits.map((a) => a.id)) + 1 : 1,
    eventId: newEvent.id,
    fromStatus: "reported",
    toStatus: "reported",
    operator: reporter,
    operatorRole: user?.role || "supervisor",
    operatedAt: nowStr,
    remark: "由海域巡查记录上报"
  };
  eventStatusAudits.push(auditRecord);

  patrol.relatedEventId = newEvent.id;
  patrol.status = "escalated";

  res.status(201).json({
    patrol,
    event: newEvent,
    message: "巡查问题已上报为事件，已同步至事件监管"
  });
});

const userUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["admin", "supervisor", "user"]).optional(),
  position: z.string().optional(),
  responsibleSeaAreas: z.array(z.string()).optional(),
  dataScope: z.string().optional()
});

app.get("/api/admin/users", requireAuth, (req, res) => {
  const seaArea = req.query.seaArea as string | undefined;
  let filtered = [...accounts];
  if (seaArea) {
    filtered = filtered.filter((u) =>
      u.responsibleSeaAreas.includes(seaArea) ||
      u.responsibleSeaAreas.includes("全部海域")
    );
  }
  res.json(filtered.map(({ password: _password, ...account }) => account));
});

app.patch("/api/admin/users/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const user = accounts.find((u) => u.id === id);
  if (!user) {
    res.status(404).json({ message: "用户不存在" });
    return;
  }

  const parsed = userUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "参数格式错误" });
    return;
  }

  Object.assign(user, parsed.data);
  const { password: _password, ...accountWithoutPassword } = user;
  res.json(accountWithoutPassword);
});

app.get("/api/ships", requireAuth, (req, res) => {
  const status = req.query.status as string | undefined;
  const seaArea = req.query.seaArea as string | undefined;
  const keyword = req.query.keyword as string | undefined;

  let filtered = [...ships];

  if (status) {
    filtered = filtered.filter((s) => s.status === status);
  }
  if (seaArea) {
    const shipIdsInArea = shipPositions
      .filter((p) => p.seaArea === seaArea)
      .map((p) => p.shipId);
    filtered = filtered.filter((s) => shipIdsInArea.includes(s.id));
  }
  if (keyword) {
    const kw = keyword.toLowerCase();
    filtered = filtered.filter(
      (s) => s.name.toLowerCase().includes(kw) || s.mmsi.includes(kw) || s.type.toLowerCase().includes(kw)
    );
  }

  const result = filtered.map((ship) => {
    const latestPosition = shipPositions
      .filter((p) => p.shipId === ship.id)
      .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime())[0];
    return {
      ...ship,
      latestPosition
    };
  });

  res.json(result);
});

app.get("/api/ships/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const ship = ships.find((s) => s.id === id);

  if (!ship) {
    res.status(404).json({ message: "船舶不存在" });
    return;
  }

  const latestPosition = shipPositions
    .filter((p) => p.shipId === ship.id)
    .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime())[0];

  const positionHistory = shipPositions
    .filter((p) => p.shipId === ship.id)
    .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime())
    .slice(0, 20);

  const anomalies = shipAnomalies.filter((a) => a.shipId === ship.id);
  const intrusions = protectedAreaIntrusions.filter((i) => i.shipId === ship.id);
  const stayRecords = shipStayRecords.filter((s) => s.shipId === ship.id);

  res.json({
    ship,
    latestPosition,
    positionHistory,
    anomalies,
    intrusions,
    stayRecords
  });
});

app.get("/api/ships/positions/latest", requireAuth, (_req, res) => {
  const latestPositions: ShipPositionWithShipInfo[] = [];
  const seenShipIds = new Set<number>();

  const sortedPositions = [...shipPositions].sort(
    (a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime()
  );

  for (const pos of sortedPositions) {
    if (!seenShipIds.has(pos.shipId)) {
      seenShipIds.add(pos.shipId);
      const ship = ships.find((s) => s.id === pos.shipId);
      latestPositions.push({
        ...pos,
        shipName: ship?.name,
        shipType: ship?.type,
        shipStatus: ship?.status
      });
    }
  }

  res.json(latestPositions);
});

app.post("/api/ships/positions", requireAuth, (req, res) => {
  const parsed = shipPositionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "位置数据格式错误" });
    return;
  }

  let ship = ships.find((s) => s.mmsi === parsed.data.mmsi);
  if (!ship) {
    ship = {
      id: Math.max(...ships.map((s) => s.id)) + 1,
      mmsi: parsed.data.mmsi,
      name: `未知船舶(${parsed.data.mmsi})`,
      type: "未知",
      flag: "未知",
      status: "normal",
      createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
      updatedAt: new Date().toISOString().slice(0, 16).replace("T", " ")
    };
    ships.push(ship);
  }

  const position: ShipPosition = {
    id: Math.max(...shipPositions.map((p) => p.id)) + 1,
    shipId: ship.id,
    mmsi: parsed.data.mmsi,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    speed: parsed.data.speed,
    course: parsed.data.course,
    heading: parsed.data.heading,
    seaArea: parsed.data.seaArea,
    status: parsed.data.status,
    reportedAt: new Date().toISOString().slice(0, 16).replace("T", " ")
  };

  shipPositions.unshift(position);
  ship.updatedAt = position.reportedAt;

  res.status(201).json(position);
});

app.get("/api/ships/anomalies", requireAuth, (req, res) => {
  const status = req.query.status as string | undefined;
  const level = req.query.level as string | undefined;
  const anomalyType = req.query.anomalyType as string | undefined;

  let filtered = [...shipAnomalies];

  if (status) {
    filtered = filtered.filter((a) => a.status === status);
  }
  if (level) {
    filtered = filtered.filter((a) => a.level === level);
  }
  if (anomalyType) {
    filtered = filtered.filter((a) => a.anomalyType === anomalyType);
  }

  res.json(filtered);
});

app.patch("/api/ships/anomalies/:id/status", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const parsed = shipAnomalyStatusSchema.safeParse(req.body);
  const anomaly = shipAnomalies.find((a) => a.id === id);

  if (!anomaly) {
    res.status(404).json({ message: "异常记录不存在" });
    return;
  }

  if (!parsed.success) {
    res.status(400).json({ message: "参数格式错误" });
    return;
  }

  const now = new Date().toISOString().slice(0, 16).replace("T", " ");
  anomaly.status = parsed.data.status;
  if (parsed.data.disposalNote) {
    anomaly.disposalNote = parsed.data.disposalNote;
  }
  if (parsed.data.status === "acknowledged" && !anomaly.acknowledgedAt) {
    anomaly.acknowledgedAt = now;
  }
  if (parsed.data.status === "resolved") {
    anomaly.resolvedAt = now;
  }

  res.json(anomaly);
});

app.get("/api/ships/intrusions", requireAuth, (req, res) => {
  const status = req.query.status as string | undefined;
  const level = req.query.level as string | undefined;
  const protectedArea = req.query.protectedArea as string | undefined;

  let filtered = [...protectedAreaIntrusions];

  if (status) {
    filtered = filtered.filter((i) => i.status === status);
  }
  if (level) {
    filtered = filtered.filter((i) => i.level === level);
  }
  if (protectedArea) {
    filtered = filtered.filter((i) => i.protectedArea === protectedArea);
  }

  res.json(filtered);
});

app.patch("/api/ships/intrusions/:id/status", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const parsed = intrusionStatusSchema.safeParse(req.body);
  const intrusion = protectedAreaIntrusions.find((i) => i.id === id);

  if (!intrusion) {
    res.status(404).json({ message: "闯入记录不存在" });
    return;
  }

  if (!parsed.success) {
    res.status(400).json({ message: "参数格式错误" });
    return;
  }

  intrusion.status = parsed.data.status;
  if (parsed.data.disposalNote) {
    intrusion.disposalNote = parsed.data.disposalNote;
  }
  if (parsed.data.status === "resolved" && !intrusion.exitTime) {
    const now = new Date();
    intrusion.exitTime = now.toISOString().slice(0, 16).replace("T", " ");
    intrusion.exitLatitude = intrusion.entryLatitude + 0.01;
    intrusion.exitLongitude = intrusion.entryLongitude + 0.01;
    const entryTime = new Date(intrusion.entryTime.replace(" ", "T"));
    intrusion.durationMinutes = Math.floor((now.getTime() - entryTime.getTime()) / 60000);
  }

  res.json(intrusion);
});

app.get("/api/ships/stay-records", requireAuth, (req, res) => {
  const status = req.query.status as string | undefined;
  const isOverstay = req.query.isOverstay as string | undefined;
  const seaArea = req.query.seaArea as string | undefined;

  let filtered = [...shipStayRecords];

  if (status) {
    filtered = filtered.filter((s) => s.status === status);
  }
  if (isOverstay !== undefined) {
    filtered = filtered.filter((s) => s.isOverstay === (isOverstay === "true"));
  }
  if (seaArea) {
    filtered = filtered.filter((s) => s.seaArea === seaArea);
  }

  res.json(filtered);
});

app.get("/api/ships/summary", requireAuth, (_req, res) => {
  const summary = {
    totalShips: ships.length,
    normalShips: ships.filter((s) => s.status === "normal").length,
    warningShips: ships.filter((s) => s.status === "warning").length,
    abnormalShips: ships.filter((s) => s.status === "abnormal").length,
    activePositions: shipPositions.length,
    activeAnomalies: shipAnomalies.filter((a) => a.status === "active").length,
    acknowledgedAnomalies: shipAnomalies.filter((a) => a.status === "acknowledged").length,
    resolvedAnomalies: shipAnomalies.filter((a) => a.status === "resolved").length,
    activeIntrusions: protectedAreaIntrusions.filter((i) => i.status === "active").length,
    resolvedIntrusions: protectedAreaIntrusions.filter((i) => i.status === "resolved").length,
    stayingShips: shipStayRecords.filter((s) => s.status === "staying").length,
    overstayShips: shipStayRecords.filter((s) => s.isOverstay && s.status === "staying").length,
    anomalyTypes: [
      { type: "AIS信号异常", count: shipAnomalies.filter((a) => a.anomalyType === "AIS信号异常").length },
      { type: "非法停泊", count: shipAnomalies.filter((a) => a.anomalyType === "非法停泊").length },
      { type: "航速异常", count: shipAnomalies.filter((a) => a.anomalyType === "航速异常").length }
    ]
  };
  res.json(summary);
});

const isTestEnv =
  process.env.NODE_ENV === "test" ||
  process.env.VITEST ||
  process.argv.some((arg) => arg.includes("--test")) ||
  process.argv.some((arg) => arg.includes("vitest"));

if (!isTestEnv) {
  app.listen(port, async () => {
    await initDatabase();
    if (isDbAvailable()) {
      await syncEventsToMemory(events);
      await syncPatrolsToMemory(patrolRecords);
    }
    initializeAllMonitoringPointHistory();
    console.log(`Ocean regulation backend listening on http://localhost:${port}`);
    console.log(`Event persistence: ${isDbAvailable() ? "DATABASE" : "IN-MEMORY (data lost on restart)"}`);
  });
}

export {
  app,
  monitoringPointSchema,
  patrolSchema,
  isValidDatetimeString,
  isNotFutureDatetime,
  validateMonitoringPoint,
  sanitizeMonitoringPoints,
  isLeapYear,
  getDaysInMonth,
  WATER_QUALITY_GRADES,
  MONITORING_POINT_TYPES,
  MONITORING_POINT_STATUSES,
  monitoringPoints,
  patrolRecords,
  TREND_RANGES,
  buildMonitoringPointTrend,
  monitoringPointHistory,
  seedMonitoringPointHistory,
  appendMonitoringPointHistory,
  initializeAllMonitoringPointHistory
};
