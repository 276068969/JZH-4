import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { accounts, alertRules, events, monitoringPoints, type EventRecord } from "./seed.js";

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
  reporter: z.string().min(2).default("人工上报")
});

function buildMetrics() {
  const warningPoints = monitoringPoints.filter((point) => point.status === "warning").length;
  const offlinePoints = monitoringPoints.filter((point) => point.status === "offline").length;
  const openEvents = events.filter((event) => event.status !== "resolved").length;

  return {
    seaAreas: 8,
    monitoringPoints: monitoringPoints.length,
    warningPoints,
    offlinePoints,
    shipsOnline: 126,
    openEvents,
    waterQualityRate: 91.6
  };
}

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

app.get("/api/alert-rules", requireAuth, (_req, res) => {
  res.json(alertRules);
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
    occurredAt: new Date().toISOString().slice(0, 16).replace("T", " ")
  };

  events.unshift(event);
  res.status(201).json(event);
});

app.patch("/api/events/:id/status", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const statusSchema = z.object({ status: z.enum(["reported", "processing", "resolved"]) });
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

  event.status = parsed.data.status;
  res.json(event);
});

app.get("/api/admin/users", requireAuth, (_req, res) => {
  res.json(accounts.map(({ password: _password, ...account }) => account));
});

app.listen(port, () => {
  console.log(`Ocean regulation backend listening on http://localhost:${port}`);
});
