import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";

let app: any;
let isValidDatetimeString: (val: string) => boolean;
let isNotFutureDatetime: (val: string) => boolean;
let isLeapYear: (year: number) => boolean;
let getDaysInMonth: (year: number, month: number) => number;
let monitoringPoints: any[];
let buildMonitoringPointTrend: any;
let TREND_RANGES: readonly string[];

const jwtSecret = process.env.JWT_SECRET ?? "development-secret";

function generateToken(): string {
  return jwt.sign(
    {
      id: 1,
      username: "admin",
      role: "admin",
      name: "系统管理员",
      position: "海洋监管局局长",
      responsibleSeaAreas: ["全部海域"],
      dataScope: "可查看全部海域的监测数据、告警信息和事件记录，拥有系统管理权限"
    },
    jwtSecret,
    { expiresIn: "1h" }
  );
}

before(async () => {
  const mod = await import("../server.js");
  app = mod.app;
  isValidDatetimeString = mod.isValidDatetimeString;
  isNotFutureDatetime = mod.isNotFutureDatetime;
  isLeapYear = mod.isLeapYear;
  getDaysInMonth = mod.getDaysInMonth;
  monitoringPoints = mod.monitoringPoints;
  buildMonitoringPointTrend = mod.buildMonitoringPointTrend;
  TREND_RANGES = mod.TREND_RANGES;
});

describe("日期校验函数 - 严格模式（不依赖 Date 自动进位）", () => {
  describe("isLeapYear - 闰年判断", () => {
    it("2024 是闰年（能被4整除但不能被100整除）", () => {
      assert.equal(isLeapYear(2024), true);
    });

    it("2000 是闰年（能被400整除）", () => {
      assert.equal(isLeapYear(2000), true);
    });

    it("2025 不是闰年（不能被4整除）", () => {
      assert.equal(isLeapYear(2025), false);
    });

    it("1900 不是闰年（能被100整除但不能被400整除）", () => {
      assert.equal(isLeapYear(1900), false);
    });
  });

  describe("getDaysInMonth - 每月天数", () => {
    it("平年2月有28天", () => {
      assert.equal(getDaysInMonth(2025, 2), 28);
    });

    it("闰年2月有29天", () => {
      assert.equal(getDaysInMonth(2024, 2), 29);
    });

    it("4月有30天", () => {
      assert.equal(getDaysInMonth(2026, 4), 30);
    });
  });

  describe("isValidDatetimeString - 非法日期回归测试", () => {
    it("2月30日应该失败（Date自动进位会变成3月2日）", () => {
      assert.equal(isValidDatetimeString("2026-02-30 12:00"), false);
    });

    it("4月31日应该失败（Date自动进位会变成5月1日）", () => {
      assert.equal(isValidDatetimeString("2026-04-31 12:00"), false);
    });

    it("2月29日（非闰年）应该失败", () => {
      assert.equal(isValidDatetimeString("2025-02-29 12:00"), false);
    });

    it("2月29日（闰年）应该成功", () => {
      assert.equal(isValidDatetimeString("2024-02-29 12:00"), true);
    });

    it("13月应该失败", () => {
      assert.equal(isValidDatetimeString("2026-13-01 12:00"), false);
    });

    it("0月应该失败", () => {
      assert.equal(isValidDatetimeString("2026-00-01 12:00"), false);
    });

    it("0日应该失败", () => {
      assert.equal(isValidDatetimeString("2026-01-00 12:00"), false);
    });

    it("24小时应该失败", () => {
      assert.equal(isValidDatetimeString("2026-01-01 24:00"), false);
    });

    it("60分钟应该失败", () => {
      assert.equal(isValidDatetimeString("2026-01-01 12:60"), false);
    });

    it("00:00 应该成功", () => {
      assert.equal(isValidDatetimeString("2026-01-01 00:00"), true);
    });

    it("23:59 应该成功", () => {
      assert.equal(isValidDatetimeString("2026-01-01 23:59"), true);
    });

    it("格式错误（斜杠分隔）应该失败", () => {
      assert.equal(isValidDatetimeString("2026/01/01 12:00"), false);
    });
  });
});

describe("监测点 API - 非法日期回归测试", () => {
  const token = generateToken();

  describe("POST /api/monitoring-points", () => {
    it("应该拒绝 2月30日", async () => {
      const res = await request(app)
        .post("/api/monitoring-points")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "测试浮标",
          seaArea: "东港近岸海域",
          type: "水质浮标",
          latitude: 30.724,
          longitude: 122.814,
          status: "normal",
          waterQuality: "II 类",
          windSpeed: 5.4,
          temperature: 23.6,
          updatedAt: "2026-02-30 12:00"
        });

      assert.equal(res.status, 400);
      assert.match(res.body.message, /校验失败/);
    });

    it("应该拒绝 4月31日", async () => {
      const res = await request(app)
        .post("/api/monitoring-points")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "测试浮标",
          seaArea: "东港近岸海域",
          type: "水质浮标",
          latitude: 30.724,
          longitude: 122.814,
          status: "normal",
          waterQuality: "II 类",
          windSpeed: 5.4,
          temperature: 23.6,
          updatedAt: "2026-04-31 12:00"
        });

      assert.equal(res.status, 400);
      assert.match(res.body.message, /校验失败/);
    });

    it("应该拒绝 2月29日（非闰年）", async () => {
      const res = await request(app)
        .post("/api/monitoring-points")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "测试浮标",
          seaArea: "东港近岸海域",
          type: "水质浮标",
          latitude: 30.724,
          longitude: 122.814,
          status: "normal",
          waterQuality: "II 类",
          windSpeed: 5.4,
          temperature: 23.6,
          updatedAt: "2025-02-29 12:00"
        });

      assert.equal(res.status, 400);
      assert.match(res.body.message, /校验失败/);
    });

    it("应该接受 2月29日（闰年）", async () => {
      const res = await request(app)
        .post("/api/monitoring-points")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "闰年测试浮标",
          seaArea: "东港近岸海域",
          type: "水质浮标",
          latitude: 30.724,
          longitude: 122.814,
          status: "normal",
          waterQuality: "II 类",
          windSpeed: 5.4,
          temperature: 23.6,
          updatedAt: "2024-02-29 12:00"
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.updatedAt, "2024-02-29 12:00");
    });

    it("应该拒绝未来时间", async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString().slice(0, 16).replace("T", " ");
      const res = await request(app)
        .post("/api/monitoring-points")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "测试浮标",
          seaArea: "东港近岸海域",
          type: "水质浮标",
          latitude: 30.724,
          longitude: 122.814,
          status: "normal",
          waterQuality: "II 类",
          windSpeed: 5.4,
          temperature: 23.6,
          updatedAt: futureDate
        });

      assert.equal(res.status, 400);
      assert.match(res.body.message, /校验失败/);
    });

    it("应该接受合法日期", async () => {
      const res = await request(app)
        .post("/api/monitoring-points")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "合法日期测试浮标",
          seaArea: "东港近岸海域",
          type: "水质浮标",
          latitude: 30.724,
          longitude: 122.814,
          status: "normal",
          waterQuality: "II 类",
          windSpeed: 5.4,
          temperature: 23.6,
          updatedAt: "2026-06-15 10:30"
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.updatedAt, "2026-06-15 10:30");
    });
  });

  describe("PATCH /api/monitoring-points/:id", () => {
    let testPointId: number;

    it("先创建一个测试点", async () => {
      const res = await request(app)
        .post("/api/monitoring-points")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "PATCH测试浮标",
          seaArea: "东港近岸海域",
          type: "水质浮标",
          latitude: 30.724,
          longitude: 122.814,
          status: "normal",
          waterQuality: "II 类",
          windSpeed: 5.4,
          temperature: 23.6,
          updatedAt: "2026-06-15 10:30"
        });
      testPointId = res.body.id;
      assert.equal(res.status, 201);
    });

    it("应该拒绝更新为 2月30日", async () => {
      const res = await request(app)
        .patch(`/api/monitoring-points/${testPointId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ updatedAt: "2026-02-30 12:00" });

      assert.equal(res.status, 400);
      assert.match(res.body.message, /校验失败/);
    });

    it("应该拒绝更新为 4月31日", async () => {
      const res = await request(app)
        .patch(`/api/monitoring-points/${testPointId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ updatedAt: "2026-04-31 12:00" });

      assert.equal(res.status, 400);
      assert.match(res.body.message, /校验失败/);
    });

    it("应该拒绝更新为 2月29日（非闰年）", async () => {
      const res = await request(app)
        .patch(`/api/monitoring-points/${testPointId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ updatedAt: "2025-02-29 12:00" });

      assert.equal(res.status, 400);
      assert.match(res.body.message, /校验失败/);
    });

    it("应该接受更新为 2月29日（闰年）", async () => {
      const res = await request(app)
        .patch(`/api/monitoring-points/${testPointId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ updatedAt: "2024-02-29 12:00" });

      assert.equal(res.status, 200);
      assert.equal(res.body.updatedAt, "2024-02-29 12:00");
    });

    it("应该接受合法的日期更新", async () => {
      const res = await request(app)
        .patch(`/api/monitoring-points/${testPointId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ updatedAt: "2026-06-16 14:00" });

      assert.equal(res.status, 200);
      assert.equal(res.body.updatedAt, "2026-06-16 14:00");
    });
  });

  describe("GET /api/monitoring-points - 非法日期存量数据回归测试", () => {
    const INVALID_POINT_IDS: number[] = [];

    it("注入非法日期存量点（模拟脏数据）", () => {
      const invalidPoints = [
        {
          id: 99991,
          name: "非法-2月30日浮标",
          seaArea: "东港近岸海域",
          type: "水质浮标" as const,
          latitude: 30.724,
          longitude: 122.814,
          status: "normal" as const,
          waterQuality: "II 类" as const,
          windSpeed: 5.4,
          temperature: 23.6,
          updatedAt: "2026-02-30 12:00"
        },
        {
          id: 99992,
          name: "非法-4月31日浮标",
          seaArea: "东港近岸海域",
          type: "水质浮标" as const,
          latitude: 30.725,
          longitude: 122.815,
          status: "normal" as const,
          waterQuality: "III 类" as const,
          windSpeed: 4.2,
          temperature: 22.1,
          updatedAt: "2026-04-31 08:00"
        },
        {
          id: 99993,
          name: "非法-非闰年2月29日浮标",
          seaArea: "东港近岸海域",
          type: "水质浮标" as const,
          latitude: 30.726,
          longitude: 122.816,
          status: "warning" as const,
          waterQuality: "IV 类" as const,
          windSpeed: 7.8,
          temperature: 25.0,
          updatedAt: "2025-02-29 15:30"
        },
        {
          id: 99994,
          name: "非法-13月浮标",
          seaArea: "东港近岸海域",
          type: "水质浮标" as const,
          latitude: 30.727,
          longitude: 122.817,
          status: "offline" as const,
          waterQuality: "V 类" as const,
          windSpeed: 0,
          temperature: 0,
          updatedAt: "2026-13-01 00:00"
        }
      ];

      for (const p of invalidPoints) {
        monitoringPoints.push(p);
        INVALID_POINT_IDS.push(p.id);
      }

      assert.equal(monitoringPoints.some((p) => p.id === 99991), true);
    });

    it("GET /api/monitoring-points 列表应该过滤掉所有非法日期的存量点", async () => {
      const res = await request(app)
        .get("/api/monitoring-points")
        .set("Authorization", `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));

      for (const invalidId of INVALID_POINT_IDS) {
        const found: any = res.body.find((p: any) => p.id === invalidId);
        assert.equal(found, undefined, `非法日期监测点 id=${invalidId} 不应该出现在列表返回中`);
      }

      for (const point of res.body) {
        assert.equal(
          isValidDatetimeString(point.updatedAt),
          true,
          `返回的监测点 id=${point.id} 的 updatedAt=${point.updatedAt} 应该是合法日期`
        );
      }
    });

    it("GET /api/monitoring-points/:id/detail 对非法日期存量点应该拒绝访问（返回 500）", async () => {
      for (const invalidId of INVALID_POINT_IDS) {
        const res = await request(app)
          .get(`/api/monitoring-points/${invalidId}/detail`)
          .set("Authorization", `Bearer ${token}`);

        assert.equal(
          res.status,
          500,
          `非法日期监测点 id=${invalidId} 访问详情应该返回 500，实际返回 ${res.status}`
        );
        assert.match(res.body.message, /校验失败/);
      }
    });

    it("GET /api/monitoring-points/:id/detail 对合法存量点应该正常返回", async () => {
      const listRes = await request(app)
        .get("/api/monitoring-points")
        .set("Authorization", `Bearer ${token}`);

      assert.ok(listRes.body.length > 0, "列表应该至少返回一个合法监测点");

      const validId = listRes.body[0].id;
      const detailRes = await request(app)
        .get(`/api/monitoring-points/${validId}/detail`)
        .set("Authorization", `Bearer ${token}`);

      assert.equal(detailRes.status, 200);
      assert.ok(detailRes.body.point);
      assert.equal(isValidDatetimeString(detailRes.body.point.updatedAt), true);
    });

    it("清理：移除注入的非法存量点", () => {
      for (const invalidId of INVALID_POINT_IDS) {
        const idx = monitoringPoints.findIndex((p) => p.id === invalidId);
        if (idx !== -1) {
          monitoringPoints.splice(idx, 1);
        }
      }
      assert.equal(monitoringPoints.some((p) => p.id === 99991), false);
    });
  });

  describe("PATCH /api/monitoring-points/:id - 非法日期存量数据回归测试", () => {
    const INVALID_PATCH_ID = 99995;

    it("注入非法日期存量点（模拟脏数据）", () => {
      monitoringPoints.push({
        id: INVALID_PATCH_ID,
        name: "PATCH测试-非法存量点",
        seaArea: "东港近岸海域",
        type: "水质浮标",
        latitude: 30.728,
        longitude: 122.818,
        status: "normal",
        waterQuality: "II 类",
        windSpeed: 3.0,
        temperature: 20.0,
        updatedAt: "2026-02-30 10:00"
      });
      assert.equal(monitoringPoints.some((p) => p.id === INVALID_PATCH_ID), true);
    });

    it("PATCH 非法存量点应该拒绝更新（返回 500）", async () => {
      const res = await request(app)
        .patch(`/api/monitoring-points/${INVALID_PATCH_ID}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "尝试修改名称" });

      assert.equal(res.status, 500);
      assert.match(res.body.message, /存量数据校验失败/);
    });

    it("PATCH 非法存量点即使用合法日期也应该拒绝更新", async () => {
      const res = await request(app)
        .patch(`/api/monitoring-points/${INVALID_PATCH_ID}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ updatedAt: "2026-06-15 10:00" });

      assert.equal(res.status, 500);
      assert.match(res.body.message, /存量数据校验失败/);
    });

    it("清理：移除注入的非法存量点", () => {
      const idx = monitoringPoints.findIndex((p) => p.id === INVALID_PATCH_ID);
      if (idx !== -1) {
        monitoringPoints.splice(idx, 1);
      }
      assert.equal(monitoringPoints.some((p) => p.id === INVALID_PATCH_ID), false);
    });
  });
});

describe("监测点历史趋势 API", () => {
  const token = generateToken();
  let validPointId: number;
  let validPointUpdatedAt: string;
  let validPoint: any;

  it("获取合法监测点用于测试", async () => {
    const res = await request(app)
      .get("/api/monitoring-points")
      .set("Authorization", `Bearer ${token}`);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length > 0);
    validPointId = res.body[0].id;
    validPointUpdatedAt = res.body[0].updatedAt;
    validPoint = res.body[0];
  });

  it("GET /api/monitoring-points/:id/trend 默认返回 7 天趋势", async () => {
    const res = await request(app)
      .get(`/api/monitoring-points/${validPointId}/trend`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.pointId, validPointId);
    assert.equal(res.body.range, "7d");
    assert.equal(res.body.granularity, "daily");
    assert.ok(Array.isArray(res.body.series));
    assert.equal(res.body.series.length, 3);
    const metrics = res.body.series.map((s: any) => s.metric);
    assert.ok(metrics.includes("waterQuality"));
    assert.ok(metrics.includes("windSpeed"));
    assert.ok(metrics.includes("temperature"));
    for (const s of res.body.series) {
      assert.equal(s.points.length, 7, `${s.metric} 应有 7 个数据点`);
    }
    assert.ok(res.body.assessment);
    assert.equal(typeof res.body.assessment.summary, "string");
    assert.ok(res.body.assessment.summary.length > 0);
  });

  it("GET trend range=30d 返回 30 个数据点", async () => {
    const res = await request(app)
      .get(`/api/monitoring-points/${validPointId}/trend?range=30d`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.range, "30d");
    assert.equal(res.body.series[0].points.length, 30);
  });

  it("GET trend range=90d 返回 90 个数据点", async () => {
    const res = await request(app)
      .get(`/api/monitoring-points/${validPointId}/trend?range=90d`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.series[0].points.length, 90);
  });

  it("GET trend 非法 range 应返回 400", async () => {
    const res = await request(app)
      .get(`/api/monitoring-points/${validPointId}/trend?range=1y`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 400);
    assert.match(res.body.message, /时间范围参数无效/);
  });

  it("GET trend 不存在的监测点应返回 404", async () => {
    const res = await request(app)
      .get("/api/monitoring-points/999999/trend")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 404);
    assert.match(res.body.message, /监测点不存在/);
  });

  it("趋势最后一个数据点应与监测点当前值一致（锚定当前值）", async () => {
    const detailRes = await request(app)
      .get(`/api/monitoring-points/${validPointId}/detail`)
      .set("Authorization", `Bearer ${token}`);
    const trendRes = await request(app)
      .get(`/api/monitoring-points/${validPointId}/trend`)
      .set("Authorization", `Bearer ${token}`);
    const windSeries = trendRes.body.series.find((s: any) => s.metric === "windSpeed");
    const tempSeries = trendRes.body.series.find((s: any) => s.metric === "temperature");
    const wqSeries = trendRes.body.series.find((s: any) => s.metric === "waterQuality");
    const lastWind = windSeries.points[windSeries.points.length - 1].value;
    const lastTemp = tempSeries.points[tempSeries.points.length - 1].value;
    const lastWq = wqSeries.points[wqSeries.points.length - 1].value;
    assert.equal(lastWind, detailRes.body.point.windSpeed);
    assert.equal(lastTemp, detailRes.body.point.temperature);
    assert.equal(lastWq, detailRes.body.point.waterQuality);
  });

  it("趋势结束日期应锚定监测点 updatedAt", async () => {
    const res = await request(app)
      .get(`/api/monitoring-points/${validPointId}/trend?range=7d`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(res.body.to, validPointUpdatedAt.slice(0, 10));
  });

  it("趋势数据应确定性可复现（相同参数返回相同结果）", async () => {
    const r1 = await request(app)
      .get(`/api/monitoring-points/${validPointId}/trend?range=7d`)
      .set("Authorization", `Bearer ${token}`);
    const r2 = await request(app)
      .get(`/api/monitoring-points/${validPointId}/trend?range=7d`)
      .set("Authorization", `Bearer ${token}`);
    assert.deepEqual(r1.body.series, r2.body.series);
    assert.deepEqual(r1.body.assessment, r2.body.assessment);
  });

  it("buildMonitoringPointTrend 支持的 range 与 TREND_RANGES 一致", () => {
    for (const range of TREND_RANGES) {
      const trend = buildMonitoringPointTrend(validPoint, range);
      assert.equal(trend.range, range);
      assert.ok(trend.series.length === 3);
      assert.ok(trend.assessment.summary.length > 0);
    }
  });

  it("GET trend 非法日期存量点应返回 500（与 detail 一致）", async () => {
    const invalidId = 99990;
    monitoringPoints.push({
      id: invalidId,
      name: "趋势测试-非法存量点",
      seaArea: "东港近岸海域",
      type: "水质浮标",
      latitude: 30.729,
      longitude: 122.819,
      status: "normal",
      waterQuality: "II 类",
      windSpeed: 3.0,
      temperature: 20.0,
      updatedAt: "2026-02-30 10:00"
    });
    try {
      const res = await request(app)
        .get(`/api/monitoring-points/${invalidId}/trend`)
        .set("Authorization", `Bearer ${token}`);
      assert.equal(res.status, 500);
      assert.match(res.body.message, /校验失败/);
    } finally {
      const idx = monitoringPoints.findIndex((p) => p.id === invalidId);
      if (idx !== -1) monitoringPoints.splice(idx, 1);
    }
  });
});
