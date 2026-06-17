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

  describe("GET /api/monitoring-points", () => {
    it("返回的数据中所有日期都应该是合法的", async () => {
      const res = await request(app)
        .get("/api/monitoring-points")
        .set("Authorization", `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));

      for (const point of res.body) {
        assert.match(point.updatedAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
        assert.equal(isValidDatetimeString(point.updatedAt), true);
      }
    });

    it("GET /api/monitoring-points/:id/detail 返回的日期应该合法", async () => {
      const listRes = await request(app)
        .get("/api/monitoring-points")
        .set("Authorization", `Bearer ${token}`);

      assert.ok(listRes.body.length > 0);

      const detailRes = await request(app)
        .get(`/api/monitoring-points/${listRes.body[0].id}/detail`)
        .set("Authorization", `Bearer ${token}`);

      assert.equal(detailRes.status, 200);
      assert.ok(detailRes.body.point);
      assert.match(detailRes.body.point.updatedAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    });
  });
});
