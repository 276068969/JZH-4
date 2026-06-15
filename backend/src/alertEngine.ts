import type { AlertCondition, AlertResult, AlertRule, MonitoringPoint } from "./seed.js";

function getMetricValue(point: MonitoringPoint, metric: string): string | number {
  switch (metric) {
    case "water_quality":
      return point.waterQuality;
    case "wind_speed":
      return point.windSpeed;
    case "status":
      return point.status;
    case "temperature":
      return point.temperature;
    default:
      return "";
  }
}

function evaluateCondition(value: string | number, condition: AlertCondition): boolean {
  const { operator, threshold } = condition;

  switch (operator) {
    case "gt":
      return typeof value === "number" && typeof threshold === "number" && value > threshold;
    case "gte":
      return typeof value === "number" && typeof threshold === "number" && value >= threshold;
    case "lt":
      return typeof value === "number" && typeof threshold === "number" && value < threshold;
    case "lte":
      return typeof value === "number" && typeof threshold === "number" && value <= threshold;
    case "eq":
      return value === threshold;
    case "neq":
      return value !== threshold;
    case "in":
      if (Array.isArray(threshold)) {
        return threshold.includes(String(value));
      }
      return false;
    default:
      return false;
  }
}

function buildAlertMessage(
  rule: AlertRule,
  point: MonitoringPoint,
  metricValue: string | number
): string {
  const cs = rule.conditionStruct;
  const value = cs
    ? typeof metricValue === "number" && cs.unit
      ? `${metricValue}${cs.unit}`
      : String(metricValue)
    : String(metricValue);
  return `[${point.name}] ${rule.name}: 当前值 ${value}，触发条件「${rule.condition}」`;
}

export function evaluateRule(
  rule: AlertRule,
  point: MonitoringPoint,
  existingResults: AlertResult[]
): AlertResult | null {
  if (!rule.enabled || !rule.conditionStruct) {
    return null;
  }

  const metricValue = getMetricValue(point, rule.conditionStruct.metric);
  const triggered = evaluateCondition(metricValue, rule.conditionStruct);

  if (!triggered) {
    return null;
  }

  const existingActive = existingResults.find(
    (r) => r.ruleId === rule.id && r.pointId === point.id && r.status === "active"
  );
  if (existingActive) {
    return null;
  }

  const message = buildAlertMessage(rule, point, metricValue);

  return {
    id: 0,
    ruleId: rule.id,
    ruleName: rule.name,
    pointId: point.id,
    pointName: point.name,
    seaArea: point.seaArea,
    level: rule.level,
    message,
    metricValue,
    status: "active",
    triggeredAt: new Date().toISOString().slice(0, 16).replace("T", " ")
  };
}

export function evaluateAllRules(
  rules: AlertRule[],
  points: MonitoringPoint[],
  existingResults: AlertResult[]
): AlertResult[] {
  const newResults: AlertResult[] = [];

  for (const rule of rules) {
    for (const point of points) {
      const result = evaluateRule(rule, point, [...existingResults, ...newResults]);
      if (result) {
        newResults.push(result);
      }
    }
  }

  return newResults;
}

export { getMetricValue, evaluateCondition };
