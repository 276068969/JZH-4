export type Role = "admin" | "supervisor" | "user";

export interface Account {
  id: number;
  username: string;
  password: string;
  role: Role;
  name: string;
}

export interface MonitoringPoint {
  id: number;
  name: string;
  seaArea: string;
  type: string;
  latitude: number;
  longitude: number;
  status: "normal" | "warning" | "offline";
  waterQuality: string;
  windSpeed: number;
  temperature: number;
  updatedAt: string;
}

export interface AlertRule {
  id: number;
  name: string;
  target: string;
  condition: string;
  level: "low" | "medium" | "high";
  enabled: boolean;
}

export interface EventRecord {
  id: number;
  title: string;
  category: string;
  seaArea: string;
  level: "low" | "medium" | "high";
  status: "reported" | "processing" | "resolved";
  reporter: string;
  assignee: string;
  occurredAt: string;
}

export const accounts: Account[] = [
  { id: 1, username: "admin", password: "admin123", role: "admin", name: "系统管理员" },
  { id: 2, username: "supervisor", password: "123456", role: "supervisor", name: "监管人员" },
  { id: 3, username: "user", password: "123456", role: "user", name: "普通用户" }
];

export const monitoringPoints: MonitoringPoint[] = [
  {
    id: 1,
    name: "东港 01 号浮标",
    seaArea: "东港近岸海域",
    type: "水质浮标",
    latitude: 30.724,
    longitude: 122.814,
    status: "normal",
    waterQuality: "II 类",
    windSpeed: 5.4,
    temperature: 23.6,
    updatedAt: "2026-06-11 09:30"
  },
  {
    id: 2,
    name: "蓝湾排口监测站",
    seaArea: "蓝湾工业岸线",
    type: "排口监测",
    latitude: 30.512,
    longitude: 122.443,
    status: "warning",
    waterQuality: "IV 类",
    windSpeed: 4.1,
    temperature: 24.2,
    updatedAt: "2026-06-11 09:28"
  },
  {
    id: 3,
    name: "南礁 AIS 雷达",
    seaArea: "南礁保护区",
    type: "船舶监管",
    latitude: 30.193,
    longitude: 122.025,
    status: "normal",
    waterQuality: "I 类",
    windSpeed: 7.8,
    temperature: 22.9,
    updatedAt: "2026-06-11 09:32"
  },
  {
    id: 4,
    name: "北湾气象站",
    seaArea: "北湾养殖区",
    type: "气象监测",
    latitude: 30.971,
    longitude: 121.901,
    status: "offline",
    waterQuality: "III 类",
    windSpeed: 0,
    temperature: 0,
    updatedAt: "2026-06-11 07:10"
  }
];

export const alertRules: AlertRule[] = [
  { id: 1, name: "氨氮浓度超限", target: "水质", condition: "NH3-N > 1.0mg/L", level: "high", enabled: true },
  { id: 2, name: "保护区船舶闯入", target: "船舶", condition: "AIS in protected area", level: "high", enabled: true },
  { id: 3, name: "监测点离线", target: "设备", condition: "offline > 15min", level: "medium", enabled: true },
  { id: 4, name: "风速突增", target: "气象", condition: "wind_speed > 12m/s", level: "low", enabled: false }
];

export const events: EventRecord[] = [
  {
    id: 1001,
    title: "蓝湾排口疑似违法排放",
    category: "违法排放",
    seaArea: "蓝湾工业岸线",
    level: "high",
    status: "processing",
    reporter: "水质自动监测",
    assignee: "监管人员",
    occurredAt: "2026-06-11 08:42"
  },
  {
    id: 1002,
    title: "南礁保护区异常船舶停留",
    category: "异常船舶",
    seaArea: "南礁保护区",
    level: "medium",
    status: "reported",
    reporter: "AIS 雷达",
    assignee: "未分派",
    occurredAt: "2026-06-11 08:55"
  },
  {
    id: 1003,
    title: "北湾气象站离线",
    category: "设备告警",
    seaArea: "北湾养殖区",
    level: "low",
    status: "resolved",
    reporter: "设备心跳",
    assignee: "运维值班",
    occurredAt: "2026-06-10 22:15"
  }
];
