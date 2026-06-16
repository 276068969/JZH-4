import { Pool } from "pg";
import type { EventRecord, EventStatusAudit } from "./seed.js";

let pool: Pool | null = null;

export function getPool(): Pool | null {
  return pool;
}

export function isDbAvailable(): boolean {
  return pool !== null;
}

export async function initDatabase(): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("DATABASE_URL not set, event audit runs in-memory (data lost on restart)");
    return false;
  }
  try {
    pool = new Pool({ connectionString: url });
    await pool.query("SELECT 1");
    await ensureEventSchema();
    await seedEventDataIfNeeded();
    console.log("Database connected, event tables ready");
    return true;
  } catch (err) {
    console.warn("Database connection failed, falling back to in-memory mode:", (err as Error).message);
    try { await pool?.end(); } catch { /* ignore */ }
    pool = null;
    return false;
  }
}

async function ensureEventSchema(): Promise<void> {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_records (
      id SERIAL PRIMARY KEY,
      title VARCHAR(180) NOT NULL,
      category VARCHAR(64) NOT NULL,
      sea_area VARCHAR(128) NOT NULL,
      level VARCHAR(32) NOT NULL,
      status VARCHAR(32) NOT NULL,
      reporter VARCHAR(64) NOT NULL,
      assignee VARCHAR(64) NOT NULL,
      source VARCHAR(64) NOT NULL DEFAULT '人工上报',
      disposal_note TEXT DEFAULT '',
      responsible_person VARCHAR(64) DEFAULT '',
      occurred_at TIMESTAMP NOT NULL,
      resolved_at TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_status_audits (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL,
      from_status VARCHAR(32) NOT NULL,
      to_status VARCHAR(32) NOT NULL,
      operator VARCHAR(64) NOT NULL,
      operator_role VARCHAR(32) NOT NULL,
      operated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      remark TEXT DEFAULT ''
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_event_status_audits_event_id ON event_status_audits(event_id)
  `);
}

async function seedEventDataIfNeeded(): Promise<void> {
  if (!pool) return;

  const eventCheck = await pool.query("SELECT COUNT(*)::int AS cnt FROM event_records");
  if (eventCheck.rows[0].cnt === 0) {
    await pool.query(`
      INSERT INTO event_records (title, category, sea_area, level, status, reporter, assignee, source, disposal_note, responsible_person, occurred_at, resolved_at) VALUES
        ('蓝湾排口疑似违法排放', '违法排放', '蓝湾工业岸线', 'high', 'processing', '水质自动监测', '监管人员', '自动监测', '已派遣执法人员前往现场取样', '张伟', '2026-06-11 08:42:00', NULL),
        ('南礁保护区异常船舶停留', '异常船舶', '南礁保护区', 'medium', 'reported', 'AIS 雷达', '未分派', 'AIS 雷达', '', '', '2026-06-11 08:55:00', NULL),
        ('北湾气象站离线', '设备告警', '北湾养殖区', 'low', 'resolved', '设备心跳', '运维值班', '设备心跳', '设备重启后恢复正常运行', '李明', '2026-06-10 22:15:00', '2026-06-11 06:30:00')
    `);
  }

  const auditCheck = await pool.query("SELECT COUNT(*)::int AS cnt FROM event_status_audits");
  if (auditCheck.rows[0].cnt === 0) {
    await pool.query(`
      INSERT INTO event_status_audits (event_id, from_status, to_status, operator, operator_role, operated_at, remark) VALUES
        (1, 'reported', 'processing', '监管人员', 'supervisor', '2026-06-11 09:10:00', '已派遣执法人员前往现场取样'),
        (3, 'reported', 'processing', '运维值班', 'supervisor', '2026-06-10 23:30:00', '接报后安排运维人员远程排查'),
        (3, 'processing', 'resolved', '李明', 'supervisor', '2026-06-11 06:30:00', '设备重启后恢复正常运行')
    `);
  }
}

export function formatTs(val: Date | null | undefined): string | undefined {
  if (!val) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${val.getFullYear()}-${pad(val.getMonth() + 1)}-${pad(val.getDate())} ${pad(val.getHours())}:${pad(val.getMinutes())}`;
}

export function mapEventRow(row: Record<string, unknown>): EventRecord {
  return {
    id: row.id as number,
    title: row.title as string,
    category: row.category as string,
    seaArea: row.sea_area as string,
    level: row.level as EventRecord["level"],
    status: row.status as EventRecord["status"],
    reporter: row.reporter as string,
    assignee: row.assignee as string,
    source: row.source as string,
    disposalNote: (row.disposal_note as string) ?? "",
    responsiblePerson: (row.responsible_person as string) ?? "",
    occurredAt: formatTs(row.occurred_at as Date)!,
    resolvedAt: formatTs(row.resolved_at as Date | null)
  };
}

export function mapAuditRow(row: Record<string, unknown>): EventStatusAudit {
  return {
    id: row.id as number,
    eventId: row.event_id as number,
    fromStatus: row.from_status as string,
    toStatus: row.to_status as string,
    operator: row.operator as string,
    operatorRole: row.operator_role as string,
    operatedAt: formatTs(row.operated_at as Date)!,
    remark: (row.remark as string) ?? ""
  };
}

export async function syncEventsToMemory(eventsArray: EventRecord[]): Promise<void> {
  if (!pool) return;
  const { rows } = await pool.query("SELECT * FROM event_records ORDER BY occurred_at DESC");
  const mapped = rows.map((r) => mapEventRow(r as Record<string, unknown>));
  eventsArray.length = 0;
  eventsArray.push(...mapped);
}

export async function checkPersistence(): Promise<{
  dbConnected: boolean;
  eventCount: number;
  auditCount: number;
  latestAuditAt: string | null;
}> {
  if (!pool) {
    return { dbConnected: false, eventCount: 0, auditCount: 0, latestAuditAt: null };
  }
  try {
    const [evRes, auRes, latestRes] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS cnt FROM event_records"),
      pool.query("SELECT COUNT(*)::int AS cnt FROM event_status_audits"),
      pool.query("SELECT MAX(operated_at) AS latest FROM event_status_audits")
    ]);
    return {
      dbConnected: true,
      eventCount: evRes.rows[0].cnt,
      auditCount: auRes.rows[0].cnt,
      latestAuditAt: latestRes.rows[0].latest ? formatTs(latestRes.rows[0].latest as Date) ?? null : null
    };
  } catch {
    return { dbConnected: false, eventCount: 0, auditCount: 0, latestAuditAt: null };
  }
}
