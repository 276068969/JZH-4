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
