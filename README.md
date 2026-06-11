# 海洋监管平台全栈 Web 应用

本项目是一个海洋监管平台全栈 Web 应用，包含前台监管展示端、事件处置工作台、后台管理端和 Docker 一键部署配置。系统当前以内置模拟数据跑通核心流程，同时提供 PostgreSQL 初始化脚本，便于后续切换为真实数据库持久化。

## 核心特点
- 海域基础信息展示：海域分布、监测点、监管区域等。
- 实时/模拟数据监测：水质、气象、船舶、告警等信息展示。
- 事件监管：违法排放、异常船舶、污染预警等事件的上报、处理和追踪。
- 可视化大屏：地图、图表、统计指标综合展示。
- 后台管理：用户管理、角色权限、监测数据、告警规则、事件记录管理。
- 登录认证：区分管理员、监管人员、普通用户权限。

## 技术选型
- 前端：Vue 3 + TypeScript + Element Plus + ECharts + Leaflet
- 后端：Node.js + Express + TypeScript + JWT
- 数据库：PostgreSQL
- 部署：Docker + Docker Compose
- 接口：RESTful API

## 项目结构

```text
.
├── backend/                 # Node.js 后端服务
│   ├── src/server.ts        # REST API 与认证入口
│   └── src/seed.ts          # 模拟业务数据
├── docker/postgres/init.sql # PostgreSQL 初始化脚本
├── frontend/                # Vue 3 前端应用
│   └── src/views/           # 登录、监管大屏、事件、后台页面
├── docker-compose.yml       # 一键部署编排
├── .env.example             # 环境变量模板
└── .gitignore
```

## 功能模块

- 登录认证：基于 JWT 的登录流程，支持管理员、监管人员、普通用户角色。
- 监管大屏：展示监管海域、监测点位、在线船舶、待处置事件等指标。
- 地图展示：使用 Leaflet 展示海域监测点、点位状态和水质信息。
- 图表分析：使用 ECharts 展示告警与事件趋势。
- 事件监管：支持事件列表、人工上报、状态流转。
- 后台管理：提供用户角色、告警规则等管理视图。

## 测试账号
- 管理员：admin / admin123
- 监管人员：supervisor / 123456
- 普通用户：user / 123456

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发环境

```bash
npm run dev
```

默认访问地址：

- 前端：http://localhost:3000
- 后端：http://localhost:8080/api/health

## Docker 一键部署

### 1. 准备环境变量

```bash
cp .env.example .env
```

### 2. 启动服务

```bash
docker compose up --build
```

默认访问地址：

- Web 应用：http://localhost:3000
- API 健康检查：http://localhost:8080/api/health
- PostgreSQL：localhost:5432

## API 概览

- `POST /api/auth/login`：登录并返回 JWT。
- `GET /api/dashboard/metrics`：监管大屏指标。
- `GET /api/monitoring-points`：监测点列表。
- `GET /api/events`：事件列表。
- `POST /api/events`：上报事件。
- `PATCH /api/events/:id/status`：更新事件状态。
- `GET /api/alert-rules`：告警规则。
- `GET /api/admin/users`：用户与角色列表。

## 后续扩展建议

- 将后端模拟数据替换为 PostgreSQL 查询与事务写入。
- 增加 RBAC 权限中间件，限制普通用户访问后台管理接口。
- 增加单元测试、接口测试和端到端测试。
- 接入真实海洋监测设备、AIS 船舶数据和告警规则引擎。
