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
  type AlertResult,
  type AlertRule,
  type EventRecord
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

function buildMetrics() {
  const warningPoints = monitoringPoints.filter((point) => point.status === "warning").length;
  const offlinePoints = monitoringPoints.filter((point) => point.status === "offline").length;
  const openEvents = events.filter((event) => event.status !== "resolved").length;
  const activeAlerts = alertResults.filter((r) => r.status === "active").length;

  return {
    seaAreas: 8,
    monitoringPoints: monitoringPoints.length,
    warningPoints,
    offlinePoints,
    shipsOnline: 126,
    openEvents,
    activeAlerts,
    waterQualityRate: 91.6
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
    { id: account.id, username: account.username, role: account.role, name: account.name },
    jwtSecret,
    { expiresIn: "8h" }
  );

  res.json({
    token,
    user: {
      id: account.id,
      username: account.username,
      role: account.role,
      name: account.name
    }
  });
});

app.get("/api/dashboard/metrics", requireAuth, (_req, res) => {
  res.json(buildMetrics());
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

app.get("/api/events", requireAuth, (_req, res) => {
  res.json(events);
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

app.listen(port, () => {
  console.log(`Ocean regulation backend listening on http://localhost:${port}`);
});
