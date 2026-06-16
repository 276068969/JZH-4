import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { evaluateAllRules } from "./alertEngine.js";
import {
  accounts,
  alertResults,
  alertRules,
  events,
  monitoringPoints,
  seaAreas,
  ships,
  shipPositions,
  shipAnomalies,
  protectedAreaIntrusions,
  shipStayRecords,
  type AlertMetric,
  type AlertResult,
  type AlertRule,
  type EventRecord,
  type Ship,
  type ShipPosition,
  type ShipPositionWithShipInfo,
  type ShipAnomaly,
  type ProtectedAreaIntrusion,
  type ShipStayRecord,
  type SeaAreaRegulationStats,
  type RegulationStatsResponse,
  type MonitoringPointStats,
  type EventStats,
  type AlertStats
} from "./seed.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 8080);
const jwtSecret = process.env.JWT_SECRET ?? "development-secret";

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

const intrusionStatusSchema = z.object({
  status: z.enum(["active", "resolved"]),
  disposalNote: z.string().optional()
});

function buildMetrics() {
  const warningPoints = monitoringPoints.filter((point) => point.status === "warning").length;
  const offlinePoints = monitoringPoints.filter((point) => point.status === "offline").length;
  const openEvents = events.filter((event) => event.status !== "resolved").length;
  const activeAlerts = alertResults.filter((r) => r.status === "active").length;
  const activeShips = shipPositions.length;
  const abnormalShips = ships.filter((s) => s.status === "abnormal").length;
  const activeIntrusions = protectedAreaIntrusions.filter((i) => i.status === "active").length;
  const overstayShips = shipStayRecords.filter((s) => s.isOverstay && s.status === "staying").length;
  const activeAnomalies = shipAnomalies.filter((a) => a.status === "active").length;

  return {
    seaAreas: 8,
    monitoringPoints: monitoringPoints.length,
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
  const points = monitoringPoints.filter((p) => p.seaArea === seaAreaName);
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

const pointTypeMetricsMap: Record<string, AlertMetric[]> = {
  水质浮标: ["water_quality", "status", "temperature"],
  排口监测: ["water_quality", "status", "temperature"],
  船舶监管: ["status"],
  气象监测: ["wind_speed", "temperature", "status"]
};

function getRuleApplicablePointIds(rule: AlertRule): Set<number> {
  if (!rule.conditionStruct) return new Set();
  const metric = rule.conditionStruct.metric;
  const applicablePointIds = monitoringPoints
    .filter((point) => {
      const metrics = pointTypeMetricsMap[point.type] ?? [];
      return metrics.includes(metric);
    })
    .map((point) => point.id);
  return new Set(applicablePointIds);
}

function buildAlertStats(seaAreaName: string): AlertStats {
  const areaAlerts = alertResults.filter((a) => a.seaArea === seaAreaName);
  const areaPointIds = new Set(
    monitoringPoints.filter((p) => p.seaArea === seaAreaName).map((p) => p.id)
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
  const seaAreaStats: SeaAreaRegulationStats[] = seaAreas.map((area) => {
    const mpStats = buildMonitoringPointStats(area.name);
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
      events: buildEventStats(area.name),
      alerts: alertStats
    };
  });

  const noAlertSeaAreas = seaAreaStats.filter(
    (s) => s.hasMonitoringPoints && !s.hasActiveAlerts
  ).length;
  const emptySeaAreas = seaAreaStats.filter((s) => !s.hasMonitoringPoints).length;

  return {
    summary: {
      totalSeaAreas: seaAreas.length,
      totalMonitoringPoints: monitoringPoints.length,
      totalEvents: events.length,
      totalAlertRules: alertRules.length,
      totalActiveAlerts: alertResults.filter((a) => a.status === "active").length,
      noAlertSeaAreas,
      emptySeaAreas
    },
    seaAreas: seaAreaStats
  };
}

function runAlertEvaluation() {
  const newAlerts = evaluateAllRules(alertRules, monitoringPoints, alertResults);
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
    res.status(401).json({ message: "未登录或登录已过期" });
    return;
  }

  try {
    res.locals.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ message: "令牌无效" });
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "ocean-regulation-backend" });
});

app.post("/api/auth/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "用户名和密码不能为空" });
    return;
  }

  const account = accounts.find(
    (item) => item.username === parsed.data.username && item.password === parsed.data.password
  );

  if (!account) {
    res.status(401).json({ message: "用户名或密码错误" });
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

app.get("/api/monitoring-points", requireAuth, (_req, res) => {
  res.json(monitoringPoints);
});

app.get("/api/sea-areas", requireAuth, (_req, res) => {
  const result = seaAreas.map((area) => {
    const points = monitoringPoints.filter((p) => area.monitoringPointIds.includes(p.id));
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

  let filtered = [...alertResults];

  if (status) {
    filtered = filtered.filter((a) => a.status === status);
  }
  if (level) {
    filtered = filtered.filter((a) => a.level === level);
  }

  res.json(filtered);
});

app.get("/api/alerts/summary", requireAuth, (_req, res) => {
  const summary = {
    total: alertResults.length,
    active: alertResults.filter((a) => a.status === "active").length,
    acknowledged: alertResults.filter((a) => a.status === "acknowledged").length,
    resolved: alertResults.filter((a) => a.status === "resolved").length,
    high: alertResults.filter((a) => a.level === "high" && a.status === "active").length,
    medium: alertResults.filter((a) => a.level === "medium" && a.status === "active").length,
    low: alertResults.filter((a) => a.level === "low" && a.status === "active").length
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

app.get("/api/events", requireAuth, (req, res) => {
  const category = req.query.category as string | undefined;
  const level = req.query.level as string | undefined;
  const status = req.query.status as string | undefined;
  const seaArea = req.query.seaArea as string | undefined;

  let filtered = [...events];

  if (category) {
    filtered = filtered.filter((e) => e.category === category);
  }
  if (level) {
    filtered = filtered.filter((e) => e.level === level);
  }
  if (status) {
    filtered = filtered.filter((e) => e.status === status);
  }
  if (seaArea) {
    filtered = filtered.filter((e) => e.seaArea === seaArea);
  }

  res.json(filtered);
});

app.post("/api/events", requireAuth, (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "事件信息不完整" });
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

app.patch("/api/events/:id/status", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const statusSchema = z.object({
    status: z.enum(["reported", "processing", "resolved"]),
    disposalNote: z.string().optional(),
    responsiblePerson: z.string().optional()
  });
  const parsed = statusSchema.safeParse(req.body);
  const event = events.find((item) => item.id === id);

  if (!event) {
    res.status(404).json({ message: "事件不存在" });
    return;
  }

  if (!parsed.success) {
    res.status(400).json({ message: "状态值无效" });
    return;
  }

  const { status, disposalNote, responsiblePerson } = parsed.data;

  if (status === "processing") {
    if (!responsiblePerson || responsiblePerson.trim() === "") {
      res.status(400).json({ message: "处理中状态必须填写责任人" });
      return;
    }
    event.responsiblePerson = responsiblePerson;
    if (disposalNote !== undefined) {
      event.disposalNote = disposalNote;
    }
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
    if (responsiblePerson !== undefined) {
      event.responsiblePerson = responsiblePerson;
    }
    event.resolvedAt = new Date().toISOString().slice(0, 16).replace("T", " ");
  }

  event.status = status;
  res.json(event);
});

app.get("/api/admin/users", requireAuth, (_req, res) => {
  res.json(accounts.map(({ password: _password, ...account }) => account));
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

app.listen(port, () => {
  console.log(`Ocean regulation backend listening on http://localhost:${port}`);
});
