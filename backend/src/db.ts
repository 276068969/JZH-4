import { Pool } from "pg";
import type { EventRecord, EventStatusAudit, PatrolRecord } from "./seed.js";

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
    await ensurePatrolSchema();
    await seedEventDataIfNeeded();
    await seedPatrolDataIfNeeded();
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

async function ensurePatrolSchema(): Promise<void> {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS patrol_records (
      id SERIAL PRIMARY KEY,
      sea_area VARCHAR(128) NOT NULL,
      inspector VARCHAR(64) NOT NULL,
      inspector_role VARCHAR(32) NOT NULL DEFAULT 'supervisor',
      patrol_time TIMESTAMP NOT NULL,
      problems_found TEXT DEFAULT '',
      on_site_conclusion TEXT DEFAULT '',
      related_event_id INTEGER,
      status VARCHAR(32) NOT NULL DEFAULT 'recorded',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_patrol_records_sea_area ON patrol_records(sea_area)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_patrol_records_related_event_id ON patrol_records(related_event_id)
  `);
}

async function seedPatrolDataIfNeeded(): Promise<void> {
  if (!pool) return;

  const patrolCheck = await pool.query("SELECT COUNT(*)::int AS cnt FROM patrol_records");
  if (patrolCheck.rows[0].cnt === 0) {
    // related_event_id 通过按标题查 event_records 实际主键动态解析，不硬编码主键：
    // 复用旧 PostgreSQL 数据卷时 init.sql 不会重跑，而本函数每次启动都会执行，
    // 若 event_records 主键已非初始序列（如历史插入/删除导致 id≠1/2），硬编码会导致关联错位。
    await pool.query(`
      INSERT INTO patrol_records (sea_area, inspector, inspector_role, patrol_time, problems_found, on_site_conclusion, related_event_id, status, created_at)
      SELECT v.sea_area, v.inspector, v.inspector_role, v.patrol_time, v.problems_found, v.on_site_conclusion, v.related_event_id, v.status, v.created_at
      FROM (VALUES
        ('蓝湾工业岸线', '张伟', 'supervisor', '2026-06-11 08:20:00'::TIMESTAMP, '蓝湾排口附近水面有异常油膜，疑似工业废水偷排', '疑似违法排放，已现场取样并拍照取证，建议立即立案调查', (SELECT id FROM event_records WHERE title = '蓝湾排口疑似违法排放' LIMIT 1), 'escalated', '2026-06-11 08:42:00'::TIMESTAMP),
        ('南礁保护区', '监管人员', 'supervisor', '2026-06-11 08:40:00'::TIMESTAMP, '核心保护区边缘发现一艘未登记船舶长时间停留，AIS 信号间歇中断', '判定为异常船舶停留，存在非法作业嫌疑，已上报事件监管处置', (SELECT id FROM event_records WHERE title = '南礁保护区异常船舶停留' LIMIT 1), 'escalated', '2026-06-11 08:55:00'::TIMESTAMP),
        ('北湾养殖区', '李明', 'supervisor', '2026-06-10 22:00:00'::TIMESTAMP, '', '养殖区水域正常，未发现违规排放与异常船舶，设备运行正常', NULL::INTEGER, 'recorded', '2026-06-10 22:15:00'::TIMESTAMP),
        ('东港近岸海域', '监管人员', 'supervisor', '2026-06-12 09:10:00'::TIMESTAMP, '近岸发现少量漂浮垃圾，未见明显污染源', '属轻度环境问题，已通知保洁船清理，无需上报事件', NULL::INTEGER, 'recorded', '2026-06-12 09:30:00'::TIMESTAMP)
      ) AS v(sea_area, inspector, inspector_role, patrol_time, problems_found, on_site_conclusion, related_event_id, status, created_at)
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

export function mapPatrolRow(row: Record<string, unknown>): PatrolRecord {
  return {
    id: row.id as number,
    seaArea: row.sea_area as string,
    inspector: row.inspector as string,
    inspectorRole: (row.inspector_role as string) ?? "supervisor",
    patrolTime: formatTs(row.patrol_time as Date)!,
    problemsFound: (row.problems_found as string) ?? "",
    onSiteConclusion: (row.on_site_conclusion as string) ?? "",
    relatedEventId: (row.related_event_id as number | null) ?? null,
    status: (row.status as PatrolRecord["status"]) ?? "recorded",
    createdAt: formatTs(row.created_at as Date)!
  };
}

export async function syncEventsToMemory(eventsArray: EventRecord[]): Promise<void> {
  if (!pool) return;
  const { rows } = await pool.query("SELECT * FROM event_records ORDER BY occurred_at DESC");
  const mapped = rows.map((r) => mapEventRow(r as Record<string, unknown>));
  eventsArray.length = 0;
  eventsArray.push(...mapped);
}

export async function syncPatrolsToMemory(patrolsArray: PatrolRecord[]): Promise<void> {
  if (!pool) return;
  const { rows } = await pool.query("SELECT * FROM patrol_records ORDER BY patrol_time DESC");
  const mapped = rows.map((r) => mapPatrolRow(r as Record<string, unknown>));
  patrolsArray.length = 0;
  patrolsArray.push(...mapped);
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
