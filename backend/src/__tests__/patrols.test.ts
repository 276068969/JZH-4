import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";

let app: any;
let patrolRecords: any[];

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

function pastDatetime(): string {
  const d = new Date(Date.now() - 86400000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

before(async () => {
  const mod = await import("../server.js");
  app = mod.app;
  patrolRecords = mod.patrolRecords;
});

describe("海域巡查记录 API", () => {
  const token = generateToken();

  describe("GET /api/patrols", () => {
    it("未携带令牌应返回 401", async () => {
      const res = await request(app).get("/api/patrols");
      assert.equal(res.status, 401);
    });

    it("返回巡查记录列表", async () => {
      const res = await request(app)
        .get("/api/patrols")
        .set("Authorization", `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.length > 0);
    });

    it("支持按海域过滤", async () => {
      const listRes = await request(app)
        .get("/api/patrols")
        .set("Authorization", `Bearer ${token}`);
      const targetSeaArea = listRes.body[0].seaArea;
      const res = await request(app)
        .get("/api/patrols")
        .query({ seaArea: targetSeaArea })
        .set("Authorization", `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.every((p: any) => p.seaArea === targetSeaArea));
    });

    it("支持按状态过滤", async () => {
      const res = await request(app)
        .get("/api/patrols")
        .query({ status: "escalated" })
        .set("Authorization", `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.every((p: any) => p.status === "escalated"));
    });

    it("支持按是否发现问题过滤", async () => {
      const res = await request(app)
        .get("/api/patrols")
        .query({ hasProblem: "true" })
        .set("Authorization", `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.every((p: any) => p.problemsFound && p.problemsFound.trim() !== ""));
    });
  });

  describe("POST /api/patrols", () => {
    it("缺少巡查海域应返回 400", async () => {
      const res = await request(app)
        .post("/api/patrols")
        .set("Authorization", `Bearer ${token}`)
        .send({
          inspector: "测试巡查员",
          onSiteConclusion: "未发现异常"
        });
      assert.equal(res.status, 400);
      assert.match(res.body.message, /校验失败/);
    });

    it("缺少现场结论应返回 400", async () => {
      const res = await request(app)
        .post("/api/patrols")
        .set("Authorization", `Bearer ${token}`)
        .send({
          seaArea: "东港近岸海域",
          inspector: "测试巡查员"
        });
      assert.equal(res.status, 400);
      assert.match(res.body.message, /校验失败/);
    });

    it("未来巡查时间应返回 400", async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString().slice(0, 16).replace("T", " ");
      const res = await request(app)
        .post("/api/patrols")
        .set("Authorization", `Bearer ${token}`)
        .send({
          seaArea: "东港近岸海域",
          inspector: "测试巡查员",
          patrolTime: futureDate,
          onSiteConclusion: "测试结论"
        });
      assert.equal(res.status, 400);
      assert.match(res.body.message, /校验失败/);
    });

    it("合法数据应创建成功并返回 201", async () => {
      const patrolTime = pastDatetime();
      const res = await request(app)
        .post("/api/patrols")
        .set("Authorization", `Bearer ${token}`)
        .send({
          seaArea: "南礁保护区",
          inspector: "李巡查",
          patrolTime,
          problemsFound: "发现可疑排污口一处",
          onSiteConclusion: "已拍照取证，建议立案"
        });
      assert.equal(res.status, 201);
      assert.equal(res.body.seaArea, "南礁保护区");
      assert.equal(res.body.inspector, "李巡查");
      assert.equal(res.body.patrolTime, patrolTime);
      assert.equal(res.body.problemsFound, "发现可疑排污口一处");
      assert.equal(res.body.status, "recorded");
      assert.equal(res.body.relatedEventId, null);
    });

    it("不传巡查时间时使用当前时间", async () => {
      const res = await request(app)
        .post("/api/patrols")
        .set("Authorization", `Bearer ${token}`)
        .send({
          seaArea: "北湾养殖区",
          inspector: "王巡查",
          onSiteConclusion: "海域正常无异常"
        });
      assert.equal(res.status, 201);
      assert.ok(res.body.patrolTime);
    });
  });

  describe("GET /api/patrols/:id", () => {
    it("不存在的巡查记录应返回 404", async () => {
      const res = await request(app)
        .get("/api/patrols/999999")
        .set("Authorization", `Bearer ${token}`);
      assert.equal(res.status, 404);
      assert.match(res.body.message, /巡查记录不存在/);
    });

    it("返回巡查详情与关联事件", async () => {
      const createRes = await request(app)
        .post("/api/patrols")
        .set("Authorization", `Bearer ${token}`)
        .send({
          seaArea: "西渡航运通道",
          inspector: "详情巡查员",
          patrolTime: pastDatetime(),
          problemsFound: "发现滞留船舶",
          onSiteConclusion: "已登记并上报"
        });
      const id = createRes.body.id;

      const res = await request(app)
        .get(`/api/patrols/${id}`)
        .set("Authorization", `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.patrol);
      assert.equal(res.body.patrol.id, id);
      assert.equal(res.body.patrol.seaArea, "西渡航运通道");
    });
  });

  describe("PATCH /api/patrols/:id", () => {
    it("更新现场结论应成功", async () => {
      const createRes = await request(app)
        .post("/api/patrols")
        .set("Authorization", `Bearer ${token}`)
        .send({
          seaArea: "中央岛礁海域",
          inspector: "更新巡查员",
          patrolTime: pastDatetime(),
          onSiteConclusion: "初始结论"
        });
      const id = createRes.body.id;

      const res = await request(app)
        .patch(`/api/patrols/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ onSiteConclusion: "更新后的结论" });
      assert.equal(res.status, 200);
      assert.equal(res.body.onSiteConclusion, "更新后的结论");
    });

    it("关联不存在的事件应返回 400", async () => {
      const createRes = await request(app)
        .post("/api/patrols")
        .set("Authorization", `Bearer ${token}`)
        .send({
          seaArea: "东洲浅滩海域",
          inspector: "关联巡查员",
          patrolTime: pastDatetime(),
          onSiteConclusion: "测试结论"
        });
      const id = createRes.body.id;

      const res = await request(app)
        .patch(`/api/patrols/${id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ relatedEventId: 999999 });
      assert.equal(res.status, 400);
      assert.match(res.body.message, /关联事件不存在/);
    });
  });

  describe("POST /api/patrols/:id/escalate", () => {
    it("未发现问题的巡查记录不可上报", async () => {
      const createRes = await request(app)
        .post("/api/patrols")
        .set("Authorization", `Bearer ${token}`)
        .send({
          seaArea: "蓝湾工业岸线",
          inspector: "无问题巡查员",
          patrolTime: pastDatetime(),
          onSiteConclusion: "未发现问题"
        });
      const id = createRes.body.id;

      const res = await request(app)
        .post(`/api/patrols/${id}/escalate`)
        .set("Authorization", `Bearer ${token}`)
        .send({ level: "medium" });
      assert.equal(res.status, 400);
      assert.match(res.body.message, /未发现问题/);
    });

    it("发现问题的巡查记录可上报为事件", async () => {
      const createRes = await request(app)
        .post("/api/patrols")
        .set("Authorization", `Bearer ${token}`)
        .send({
          seaArea: "南湾排污区",
          inspector: "上报巡查员",
          patrolTime: pastDatetime(),
          problemsFound: "排口附近水面有异常油膜，疑似工业废水偷排",
          onSiteConclusion: "已取样取证，建议立案调查"
        });
      const id = createRes.body.id;

      const res = await request(app)
        .post(`/api/patrols/${id}/escalate`)
        .set("Authorization", `Bearer ${token}`)
        .send({ level: "high", category: "违法排放" });
      assert.equal(res.status, 201);
      assert.ok(res.body.patrol);
      assert.ok(res.body.event);
      assert.equal(res.body.patrol.status, "escalated");
      assert.equal(res.body.patrol.relatedEventId, res.body.event.id);
      assert.equal(res.body.event.seaArea, "南湾排污区");
      assert.equal(res.body.event.level, "high");
      assert.equal(res.body.event.category, "违法排放");
      assert.equal(res.body.event.source, "海域巡查");
      assert.match(res.body.message, /已同步至事件监管/);
    });

    it("已上报的巡查记录不可重复上报", async () => {
      const createRes = await request(app)
        .post("/api/patrols")
        .set("Authorization", `Bearer ${token}`)
        .send({
          seaArea: "东港近岸海域",
          inspector: "重复上报巡查员",
          patrolTime: pastDatetime(),
          problemsFound: "发现非法采砂行为",
          onSiteConclusion: "已取证"
        });
      const id = createRes.body.id;

      await request(app)
        .post(`/api/patrols/${id}/escalate`)
        .set("Authorization", `Bearer ${token}`)
        .send({ level: "medium" });

      const res = await request(app)
        .post(`/api/patrols/${id}/escalate`)
        .set("Authorization", `Bearer ${token}`)
        .send({ level: "medium" });
      assert.equal(res.status, 400);
      assert.match(res.body.message, /已关联事件/);
    });

    it("上报后事件应出现在事件列表中", async () => {
      const createRes = await request(app)
        .post("/api/patrols")
        .set("Authorization", `Bearer ${token}`)
        .send({
          seaArea: "蓝湾工业岸线",
          inspector: "联动巡查员",
          patrolTime: pastDatetime(),
          problemsFound: "岸线发现疑似违法管线",
          onSiteConclusion: "建议立即排查"
        });
      const id = createRes.body.id;

      const escRes = await request(app)
        .post(`/api/patrols/${id}/escalate`)
        .set("Authorization", `Bearer ${token}`)
        .send({ level: "medium" });
      const eventId = escRes.body.event.id;

      const eventsRes = await request(app)
        .get("/api/events")
        .set("Authorization", `Bearer ${token}`);
      const found = eventsRes.body.find((e: any) => e.id === eventId);
      assert.ok(found, "上报的事件应出现在事件列表中");
      assert.equal(found.source, "海域巡查");
    });
  });

  describe("清理测试数据", () => {
    it("移除测试创建的巡查记录", () => {
      const before = patrolRecords.length;
      for (let i = patrolRecords.length - 1; i >= 0; i--) {
        if (patrolRecords[i].inspector && String(patrolRecords[i].inspector).includes("巡查员")) {
          patrolRecords.splice(i, 1);
        }
      }
      assert.ok(patrolRecords.length <= before);
    });
  });
});
