export type Role = "admin" | "supervisor" | "user";

export type AlertMetric = "water_quality" | "wind_speed" | "status" | "temperature";
export type AlertOperator = "gt" | "gte" | "lt" | "lte" | "eq" | "neq" | "in";

export interface Account {
  id: number;
  username: string;
  password: string;
  role: Role;
  name: string;
  position: string;
  responsibleSeaAreas: string[];
  dataScope: string;
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

export interface AlertCondition {
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number | string | string[];
  unit?: string;
}

export interface AlertRule {
  id: number;
  name: string;
  target: string;
  condition: string;
  conditionStruct?: AlertCondition;
  level: "low" | "medium" | "high";
  enabled: boolean;
}

export interface AlertResult {
  id: number;
  ruleId: number;
  ruleName: string;
  pointId: number;
  pointName: string;
  seaArea: string;
  level: "low" | "medium" | "high";
  message: string;
  metricValue: string | number;
  status: "active" | "acknowledged" | "resolved";
  triggeredAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
}

export interface SeaArea {
  id: number;
  name: string;
  usageType: string;
  jurisdiction: string;
  keyRisks: string[];
  monitoringPointIds: number[];
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
  source: string;
  disposalNote: string;
  responsiblePerson: string;
  occurredAt: string;
  resolvedAt?: string;
}

export const accounts: Account[] = [
  {
    id: 1,
    username: "admin",
    password: "admin123",
    role: "admin",
    name: "系统管理员",
    position: "海洋监管局局长",
    responsibleSeaAreas: ["全部海域"],
    dataScope: "可查看全部海域的监测数据、告警信息和事件记录，拥有系统管理权限"
  },
  {
    id: 2,
    username: "supervisor",
    password: "123456",
    role: "supervisor",
    name: "监管人员",
    position: "海域监管科科员",
    responsibleSeaAreas: ["东港近岸海域", "蓝湾工业岸线", "南礁保护区", "北湾养殖区"],
    dataScope: "可查看所辖海域的监测数据、告警信息和事件记录，可处置告警和事件"
  },
  {
    id: 3,
    username: "user",
    password: "123456",
    role: "user",
    name: "普通用户",
    position: "观测站值班员",
    responsibleSeaAreas: ["北湾养殖区"],
    dataScope: "仅可查看北湾养殖区的监测数据，无告警和事件处置权限"
  }
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
  {
    id: 1,
    name: "水质超标告警",
    target: "水质",
    condition: "水质等级 ≥ IV 类",
    conditionStruct: {
      metric: "water_quality",
      operator: "in",
      threshold: ["IV 类", "V 类", "劣 V 类"],
      unit: ""
    },
    level: "high",
    enabled: true
  },
  {
    id: 2,
    name: "监测点离线告警",
    target: "设备",
    condition: "设备状态 = offline",
    conditionStruct: {
      metric: "status",
      operator: "eq",
      threshold: "offline",
      unit: ""
    },
    level: "medium",
    enabled: true
  },
  {
    id: 3,
    name: "风速超限告警",
    target: "气象",
    condition: "风速 > 10m/s",
    conditionStruct: {
      metric: "wind_speed",
      operator: "gt",
      threshold: 10,
      unit: "m/s"
    },
    level: "low",
    enabled: true
  },
  {
    id: 4,
    name: "设备预警状态",
    target: "设备",
    condition: "设备状态 = warning",
    conditionStruct: {
      metric: "status",
      operator: "eq",
      threshold: "warning",
      unit: ""
    },
    level: "medium",
    enabled: true
  }
];

export const alertResults: AlertResult[] = [];

export const seaAreas: SeaArea[] = [
  {
    id: 1,
    name: "东港近岸海域",
    usageType: "生态保护",
    jurisdiction: "东港市海洋局",
    keyRisks: ["赤潮频发", "近岸水质波动"],
    monitoringPointIds: [1]
  },
  {
    id: 2,
    name: "蓝湾工业岸线",
    usageType: "工业排放监管",
    jurisdiction: "蓝湾经济开发区管委会",
    keyRisks: ["工业废水排放", "重金属超标"],
    monitoringPointIds: [2]
  },
  {
    id: 3,
    name: "南礁保护区",
    usageType: "生态保护",
    jurisdiction: "南礁海洋自然保护区管理处",
    keyRisks: ["非法捕捞", "船舶违规停泊"],
    monitoringPointIds: [3]
  },
  {
    id: 4,
    name: "北湾养殖区",
    usageType: "渔业养殖",
    jurisdiction: "北湾区农业农村局",
    keyRisks: ["养殖密度过高", "水温异常"],
    monitoringPointIds: [4]
  },
  {
    id: 5,
    name: "西渡航运通道",
    usageType: "航运管理",
    jurisdiction: "西渡海事局",
    keyRisks: ["船舶碰撞", "溢油事故"],
    monitoringPointIds: []
  },
  {
    id: 6,
    name: "中央岛礁海域",
    usageType: "生态保护",
    jurisdiction: "中央岛礁管理站",
    keyRisks: ["珊瑚白化", "游客违规活动"],
    monitoringPointIds: []
  },
  {
    id: 7,
    name: "南湾排污区",
    usageType: "工业排放监管",
    jurisdiction: "南湾环保局",
    keyRisks: ["污水排放超标", "底泥污染"],
    monitoringPointIds: []
  },
  {
    id: 8,
    name: "东洲浅滩海域",
    usageType: "渔业养殖",
    jurisdiction: "东洲县海洋渔业局",
    keyRisks: ["潮汐变化", "养殖病害"],
    monitoringPointIds: []
  }
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
    source: "自动监测",
    disposalNote: "已派遣执法人员前往现场取样",
    responsiblePerson: "张伟",
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
    source: "AIS 雷达",
    disposalNote: "",
    responsiblePerson: "",
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
    source: "设备心跳",
    disposalNote: "设备重启后恢复正常运行",
    responsiblePerson: "李明",
    occurredAt: "2026-06-10 22:15",
    resolvedAt: "2026-06-11 06:30"
  }
];

export interface Ship {
  id: number;
  mmsi: string;
  name: string;
  type: string;
  flag: string;
  length?: number;
  width?: number;
  draft?: number;
  grossTonnage?: number;
  status: "normal" | "warning" | "abnormal";
  createdAt: string;
  updatedAt: string;
}

export interface ShipPosition {
  id: number;
  shipId: number;
  mmsi: string;
  latitude: number;
  longitude: number;
  speed: number;
  course?: number;
  heading?: number;
  seaArea?: string;
  status: "sailing" | "anchored" | "stopped" | "moored";
  reportedAt: string;
}

export interface ShipPositionWithShipInfo extends ShipPosition {
  shipName?: string;
  shipType?: string;
  shipStatus?: string;
}

export interface ShipAnomaly {
  id: number;
  shipId: number;
  mmsi: string;
  shipName: string;
  anomalyType: string;
  description?: string;
  seaArea?: string;
  latitude?: number;
  longitude?: number;
  level: "low" | "medium" | "high";
  status: "active" | "acknowledged" | "resolved";
  detectedAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  disposalNote?: string;
}

export interface ProtectedAreaIntrusion {
  id: number;
  shipId: number;
  mmsi: string;
  shipName: string;
  protectedArea: string;
  seaArea: string;
  entryLatitude: number;
  entryLongitude: number;
  entryTime: string;
  exitLatitude?: number;
  exitLongitude?: number;
  exitTime?: string;
  durationMinutes?: number;
  status: "active" | "resolved";
  level: "low" | "medium" | "high";
  disposalNote?: string;
  detectedAt: string;
}

export interface ShipStayRecord {
  id: number;
  shipId: number;
  mmsi: string;
  shipName: string;
  seaArea: string;
  areaName: string;
  latitude: number;
  longitude: number;
  arrivalTime: string;
  departureTime?: string;
  durationMinutes?: number;
  isOverstay: boolean;
  maxAllowedMinutes: number;
  status: "staying" | "completed";
  createdAt: string;
}

export const ships: Ship[] = [
  {
    id: 1,
    mmsi: "413300001",
    name: "远洋号",
    type: "货轮",
    flag: "中国",
    length: 220.5,
    width: 32.8,
    draft: 12.5,
    grossTonnage: 65000,
    status: "normal",
    createdAt: "2026-01-15 10:30",
    updatedAt: "2026-06-15 09:30"
  },
  {
    id: 2,
    mmsi: "413300002",
    name: "海巡101",
    type: "执法船",
    flag: "中国",
    length: 85.0,
    width: 12.5,
    draft: 4.2,
    grossTonnage: 2500,
    status: "normal",
    createdAt: "2026-02-20 14:15",
    updatedAt: "2026-06-15 09:28"
  },
  {
    id: 3,
    mmsi: "413300003",
    name: "蓝鲸号",
    type: "油轮",
    flag: "巴拿马",
    length: 330.0,
    width: 58.0,
    draft: 22.5,
    grossTonnage: 150000,
    status: "warning",
    createdAt: "2026-03-10 08:45",
    updatedAt: "2026-06-15 09:32"
  },
  {
    id: 4,
    mmsi: "413300004",
    name: "渔政888",
    type: "渔业船",
    flag: "中国",
    length: 45.0,
    width: 8.5,
    draft: 3.2,
    grossTonnage: 500,
    status: "normal",
    createdAt: "2026-01-05 16:20",
    updatedAt: "2026-06-15 09:25"
  },
  {
    id: 5,
    mmsi: "413300005",
    name: "黑珍珠",
    type: "散货船",
    flag: "利比里亚",
    length: 180.0,
    width: 28.0,
    draft: 10.5,
    grossTonnage: 35000,
    status: "abnormal",
    createdAt: "2026-04-12 11:00",
    updatedAt: "2026-06-15 09:35"
  },
  {
    id: 6,
    mmsi: "413300006",
    name: "东方之星",
    type: "客轮",
    flag: "中国",
    length: 135.0,
    width: 20.0,
    draft: 5.8,
    grossTonnage: 8000,
    status: "normal",
    createdAt: "2026-02-28 09:10",
    updatedAt: "2026-06-15 09:31"
  },
  {
    id: 7,
    mmsi: "413300007",
    name: "探索者号",
    type: "科考船",
    flag: "中国",
    length: 95.0,
    width: 18.0,
    draft: 6.5,
    grossTonnage: 3200,
    status: "normal",
    createdAt: "2026-03-25 13:45",
    updatedAt: "2026-06-15 09:29"
  },
  {
    id: 8,
    mmsi: "413300008",
    name: "幽灵号",
    type: "货轮",
    flag: "塞拉利昂",
    length: 165.0,
    width: 25.0,
    draft: 9.8,
    grossTonnage: 28000,
    status: "abnormal",
    createdAt: "2026-05-01 07:30",
    updatedAt: "2026-06-15 09:33"
  }
];

export const shipPositions: ShipPosition[] = [
  {
    id: 1,
    shipId: 1,
    mmsi: "413300001",
    latitude: 30.724,
    longitude: 122.814,
    speed: 12.5,
    course: 135.0,
    heading: 135.0,
    seaArea: "东港近岸海域",
    status: "sailing",
    reportedAt: "2026-06-15 09:30"
  },
  {
    id: 2,
    shipId: 2,
    mmsi: "413300002",
    latitude: 30.512,
    longitude: 122.443,
    speed: 8.2,
    course: 90.0,
    heading: 92.0,
    seaArea: "蓝湾工业岸线",
    status: "sailing",
    reportedAt: "2026-06-15 09:28"
  },
  {
    id: 3,
    shipId: 3,
    mmsi: "413300003",
    latitude: 30.193,
    longitude: 122.025,
    speed: 0.5,
    course: 0.0,
    heading: 45.0,
    seaArea: "南礁保护区",
    status: "anchored",
    reportedAt: "2026-06-15 09:32"
  },
  {
    id: 4,
    shipId: 4,
    mmsi: "413300004",
    latitude: 30.971,
    longitude: 121.901,
    speed: 3.8,
    course: 270.0,
    heading: 268.0,
    seaArea: "北湾养殖区",
    status: "sailing",
    reportedAt: "2026-06-15 09:25"
  },
  {
    id: 5,
    shipId: 5,
    mmsi: "413300005",
    latitude: 30.205,
    longitude: 122.038,
    speed: 0.2,
    course: 0.0,
    heading: 180.0,
    seaArea: "南礁保护区",
    status: "anchored",
    reportedAt: "2026-06-15 09:35"
  },
  {
    id: 6,
    shipId: 6,
    mmsi: "413300006",
    latitude: 30.65,
    longitude: 122.75,
    speed: 15.2,
    course: 45.0,
    heading: 43.0,
    seaArea: "东港近岸海域",
    status: "sailing",
    reportedAt: "2026-06-15 09:31"
  },
  {
    id: 7,
    shipId: 7,
    mmsi: "413300007",
    latitude: 30.45,
    longitude: 122.35,
    speed: 6.5,
    course: 180.0,
    heading: 178.0,
    seaArea: "蓝湾工业岸线",
    status: "sailing",
    reportedAt: "2026-06-15 09:29"
  },
  {
    id: 8,
    shipId: 8,
    mmsi: "413300008",
    latitude: 30.22,
    longitude: 122.055,
    speed: 0.0,
    course: 0.0,
    heading: 90.0,
    seaArea: "南礁保护区",
    status: "stopped",
    reportedAt: "2026-06-15 09:33"
  }
];

export const shipAnomalies: ShipAnomaly[] = [
  {
    id: 1,
    shipId: 5,
    mmsi: "413300005",
    shipName: "黑珍珠",
    anomalyType: "AIS信号异常",
    description: "船舶AIS信号间歇性中断，疑似故意关闭",
    seaArea: "南礁保护区",
    latitude: 30.205,
    longitude: 122.038,
    level: "high",
    status: "active",
    detectedAt: "2026-06-15 08:15"
  },
  {
    id: 2,
    shipId: 8,
    mmsi: "413300008",
    shipName: "幽灵号",
    anomalyType: "非法停泊",
    description: "船舶在保护区核心区域停泊超过6小时",
    seaArea: "南礁保护区",
    latitude: 30.22,
    longitude: 122.055,
    level: "high",
    status: "active",
    detectedAt: "2026-06-15 03:30"
  },
  {
    id: 3,
    shipId: 3,
    mmsi: "413300003",
    shipName: "蓝鲸号",
    anomalyType: "航速异常",
    description: "油轮在禁航区航速低于安全阈值",
    seaArea: "南礁保护区",
    latitude: 30.193,
    longitude: 122.025,
    level: "medium",
    status: "acknowledged",
    detectedAt: "2026-06-14 22:45"
  }
];

export const protectedAreaIntrusions: ProtectedAreaIntrusion[] = [
  {
    id: 1,
    shipId: 5,
    mmsi: "413300005",
    shipName: "黑珍珠",
    protectedArea: "南礁核心保护区",
    seaArea: "南礁保护区",
    entryLatitude: 30.198,
    entryLongitude: 122.03,
    entryTime: "2026-06-15 02:30",
    status: "active",
    level: "high",
    detectedAt: "2026-06-15 02:30"
  },
  {
    id: 2,
    shipId: 8,
    mmsi: "413300008",
    shipName: "幽灵号",
    protectedArea: "南礁核心保护区",
    seaArea: "南礁保护区",
    entryLatitude: 30.215,
    entryLongitude: 122.05,
    entryTime: "2026-06-15 01:15",
    status: "active",
    level: "high",
    detectedAt: "2026-06-15 01:15"
  },
  {
    id: 3,
    shipId: 3,
    mmsi: "413300003",
    shipName: "蓝鲸号",
    protectedArea: "南礁缓冲区",
    seaArea: "南礁保护区",
    entryLatitude: 30.185,
    entryLongitude: 122.015,
    entryTime: "2026-06-14 20:00",
    exitLatitude: 30.19,
    exitLongitude: 122.02,
    exitTime: "2026-06-15 06:00",
    durationMinutes: 600,
    status: "resolved",
    level: "medium",
    disposalNote: "已驱离，船舶已离开保护区",
    detectedAt: "2026-06-14 20:00"
  }
];

export const shipStayRecords: ShipStayRecord[] = [
  {
    id: 1,
    shipId: 5,
    mmsi: "413300005",
    shipName: "黑珍珠",
    seaArea: "南礁保护区",
    areaName: "核心保护区A区",
    latitude: 30.205,
    longitude: 122.038,
    arrivalTime: "2026-06-15 02:30",
    isOverstay: true,
    maxAllowedMinutes: 120,
    status: "staying",
    createdAt: "2026-06-15 02:30"
  },
  {
    id: 2,
    shipId: 8,
    mmsi: "413300008",
    shipName: "幽灵号",
    seaArea: "南礁保护区",
    areaName: "核心保护区B区",
    latitude: 30.22,
    longitude: 122.055,
    arrivalTime: "2026-06-15 01:15",
    isOverstay: true,
    maxAllowedMinutes: 120,
    status: "staying",
    createdAt: "2026-06-15 01:15"
  },
  {
    id: 3,
    shipId: 3,
    mmsi: "413300003",
    shipName: "蓝鲸号",
    seaArea: "南礁保护区",
    areaName: "缓冲区锚地",
    latitude: 30.193,
    longitude: 122.025,
    arrivalTime: "2026-06-14 20:00",
    departureTime: "2026-06-15 06:00",
    durationMinutes: 600,
    isOverstay: false,
    maxAllowedMinutes: 480,
    status: "completed",
    createdAt: "2026-06-14 20:00"
  },
  {
    id: 4,
    shipId: 1,
    mmsi: "413300001",
    shipName: "远洋号",
    seaArea: "东港近岸海域",
    areaName: "东港锚地",
    latitude: 30.724,
    longitude: 122.814,
    arrivalTime: "2026-06-15 06:00",
    isOverstay: false,
    maxAllowedMinutes: 240,
    status: "staying",
    createdAt: "2026-06-15 06:00"
  }
];

export interface EventStatusAudit {
  id: number;
  eventId: number;
  fromStatus: string;
  toStatus: string;
  operator: string;
  operatorRole: string;
  operatedAt: string;
  remark: string;
}

export const eventStatusAudits: EventStatusAudit[] = [
  {
    id: 1,
    eventId: 1001,
    fromStatus: "reported",
    toStatus: "processing",
    operator: "监管人员",
    operatorRole: "supervisor",
    operatedAt: "2026-06-11 09:10",
    remark: "已派遣执法人员前往现场取样"
  },
  {
    id: 2,
    eventId: 1003,
    fromStatus: "reported",
    toStatus: "processing",
    operator: "运维值班",
    operatorRole: "supervisor",
    operatedAt: "2026-06-10 23:30",
    remark: "接报后安排运维人员远程排查"
  },
  {
    id: 3,
    eventId: 1003,
    fromStatus: "processing",
    toStatus: "resolved",
    operator: "李明",
    operatorRole: "supervisor",
    operatedAt: "2026-06-11 06:30",
    remark: "设备重启后恢复正常运行"
  }
];

export interface MonitoringPointStats {
  total: number;
  normal: number;
  warning: number;
  offline: number;
}

export interface EventStats {
  total: number;
  reported: number;
  processing: number;
  resolved: number;
  high: number;
  medium: number;
  low: number;
}

export interface AlertStats {
  totalRules: number;
  enabledRules: number;
  disabledRules: number;
  activeAlerts: number;
  acknowledgedAlerts: number;
  resolvedAlerts: number;
  highActiveAlerts: number;
  mediumActiveAlerts: number;
  lowActiveAlerts: number;
}

export interface SeaAreaRegulationStats {
  id: number;
  name: string;
  usageType: string;
  jurisdiction: string;
  keyRisks: string[];
  hasMonitoringPoints: boolean;
  hasActiveAlerts: boolean;
  monitoringPoints: MonitoringPointStats;
  events: EventStats;
  alerts: AlertStats;
}

export interface RegulationStatsResponse {
  summary: {
    totalSeaAreas: number;
    totalMonitoringPoints: number;
    totalEvents: number;
    totalAlertRules: number;
    totalActiveAlerts: number;
    noAlertSeaAreas: number;
    emptySeaAreas: number;
  };
  seaAreas: SeaAreaRegulationStats[];
}
