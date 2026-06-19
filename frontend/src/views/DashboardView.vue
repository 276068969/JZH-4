<template>
  <section>
    <div class="metric-grid">
      <article
        v-for="item in cards"
        :key="item.label"
        :class="[
          'metric-card',
          { 'metric-card--abnormal': item.isAbnormal, 'metric-card--clickable': item.clickable }
        ]"
        @click="handleCardClick(item)"
      >
        <div class="metric-card__header">
          <span class="metric-card__label">{{ item.label }}</span>
          <el-icon
            v-if="item.isAbnormal"
            class="metric-card__alert-icon"
            :class="{ 'metric-card__alert-icon--animate': item.isAbnormal }"
          >
            <WarningFilled />
          </el-icon>
        </div>
        <div class="metric-card__value-wrapper">
          <strong
            class="metric-card__value"
            :style="{ color: item.color ?? '#17324d' }"
          >{{ item.displayValue }}</strong>
          <span v-if="item.unit" class="metric-card__unit">{{ item.unit }}</span>
        </div>
        <div v-if="item.isAbnormal && item.hint" class="metric-card__hint">
          <el-icon class="metric-card__hint-icon"><InfoFilled /></el-icon>
          <span>{{ item.hint }}</span>
          <el-icon v-if="item.clickable" class="metric-card__arrow"><ArrowRight /></el-icon>
        </div>
        <div v-else-if="item.clickable" class="metric-card__hint metric-card__hint--normal">
          <span>查看详情</span>
          <el-icon class="metric-card__arrow"><ArrowRight /></el-icon>
        </div>
      </article>
    </div>
    <div class="content-grid">
      <div class="panel">
        <h2 class="panel-title">海域监测地图</h2>
        <div id="map"></div>
      </div>
      <div class="panel">
        <h2 class="panel-title">告警与事件趋势</h2>
        <div ref="chartRef" class="chart"></div>
        <div class="filter-bar">
          <button
            v-for="f in filterOptions"
            :key="f.key"
            :class="['filter-btn', { active: activeFilter === f.key }]"
            @click="activeFilter = f.key"
          >
            <span class="filter-dot" :style="{ background: f.color }"></span>
            {{ f.label }}
            <span class="filter-count">{{ f.count }}</span>
          </button>
        </div>
        <el-table
          :data="filteredPoints"
          size="small"
          highlight-current-row
          :row-class-name="rowClassName"
          @row-click="onRowClick"
        >
          <el-table-column prop="name" label="监测点" min-width="130" />
          <el-table-column prop="type" label="站点类型" width="100">
            <template #default="{ row }">
              <span class="type-badge">{{ row.type }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="waterQuality" label="水质等级" width="80">
            <template #default="{ row }">
              <span :class="['quality-badge', qualityClass(row.waterQuality)]">{{ row.waterQuality }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="statusType(row.status)" size="small" effect="dark">{{ statusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="活跃告警" width="90">
            <template #default="{ row }">
              <el-tag v-if="pointAlertCount(row.id) > 0" type="danger" size="small" effect="plain">
                {{ pointAlertCount(row.id) }}
              </el-tag>
              <span v-else class="text-muted">—</span>
            </template>
          </el-table-column>
          <el-table-column prop="updatedAt" label="更新时间" width="140">
            <template #default="{ row }">
              <span class="update-time">{{ row.updatedAt }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
    <div class="panel" style="margin-top: 16px">
      <h2 class="panel-title">
        最新告警
        <el-tag size="small" type="danger" effect="plain">{{ activeAlerts.length }} 条活跃</el-tag>
        <el-button size="small" style="margin-left: auto" @click="loadAllData">刷新</el-button>
      </h2>
      <el-table :data="activeAlerts.slice(0, 8)" size="small" stripe>
        <el-table-column prop="id" label="编号" width="70" />
        <el-table-column prop="ruleName" label="规则名称" min-width="140" />
        <el-table-column prop="pointName" label="监测点" width="130" />
        <el-table-column prop="seaArea" label="海域" width="120" />
        <el-table-column prop="level" label="等级" width="70">
          <template #default="{ row }">
            <el-tag :type="levelType(row.level)" size="small">{{ levelLabel(row.level) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="告警详情" min-width="220" />
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="alertStatusType(row.status)" size="small" effect="dark">
              {{ alertStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="triggeredAt" label="触发时间" width="140" />
      </el-table>
    </div>

    <el-drawer
      v-model="drawerVisible"
      title="监测点详情"
      size="560px"
      direction="rtl"
      @close="selectedPointId = null"
    >
      <div v-if="detailLoading" class="detail-loading">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>加载中…</span>
      </div>
      <template v-else-if="detailData">
        <div class="detail-header">
          <h3 class="detail-point-name">{{ detailData.point.name }}</h3>
          <el-tag :type="statusType(detailData.point.status)" effect="dark">{{ statusLabel(detailData.point.status) }}</el-tag>
        </div>

        <div class="detail-section">
          <h4 class="detail-section-title">水质数据</h4>
          <div class="detail-row">
            <span class="detail-label">水质等级</span>
            <span :class="['quality-badge', qualityClass(detailData.point.waterQuality)]">{{ detailData.point.waterQuality }}</span>
          </div>
        </div>

        <div class="detail-section">
          <h4 class="detail-section-title">气象数据</h4>
          <div class="detail-row">
            <span class="detail-label">风速</span>
            <span class="detail-value">{{ detailData.point.windSpeed }} m/s</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">温度</span>
            <span class="detail-value">{{ detailData.point.temperature }}°C</span>
          </div>
        </div>

        <div class="detail-section">
          <h4 class="detail-section-title">设备状态</h4>
          <div class="detail-row">
            <span class="detail-label">站点类型</span>
            <span class="detail-value">{{ detailData.point.type }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">坐标</span>
            <span class="detail-value">{{ detailData.point.latitude }}, {{ detailData.point.longitude }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">更新时间</span>
            <span class="detail-value">{{ detailData.point.updatedAt }}</span>
          </div>
        </div>

        <div class="detail-section" v-if="detailData.seaArea">
          <h4 class="detail-section-title">所属海域</h4>
          <div class="detail-row">
            <span class="detail-label">海域名称</span>
            <span class="detail-value">{{ detailData.seaArea.name }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">用途类型</span>
            <span class="detail-value">{{ detailData.seaArea.usageType }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">管辖机构</span>
            <span class="detail-value">{{ detailData.seaArea.jurisdiction }}</span>
          </div>
          <div class="detail-row" v-if="detailData.seaArea.keyRisks?.length">
            <span class="detail-label">主要风险</span>
            <div class="detail-risks">
              <el-tag v-for="risk in detailData.seaArea.keyRisks" :key="risk" size="small" type="warning" effect="plain">{{ risk }}</el-tag>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h4 class="detail-section-title">监测数据历史趋势</h4>
          <MonitoringPointTrend :point-id="detailData.point.id" />
        </div>

        <div class="detail-section" v-if="detailData.alerts?.length">
          <h4 class="detail-section-title">
            活跃告警
            <el-tag size="small" type="danger" effect="plain">{{ detailData.alerts.length }}</el-tag>
          </h4>
          <div v-for="alert in detailData.alerts" :key="alert.id" class="alert-item">
            <div class="alert-header">
              <el-tag :type="levelType(alert.level)" size="small">{{ levelLabel(alert.level) }}</el-tag>
              <span class="alert-name">{{ alert.ruleName }}</span>
            </div>
            <p class="alert-message">{{ alert.message }}</p>
            <span class="alert-time">{{ alert.triggeredAt }}</span>
          </div>
        </div>

        <div class="detail-section" v-if="detailData.recentEvents?.length">
          <h4 class="detail-section-title">最近事件摘要</h4>
          <div v-for="evt in detailData.recentEvents" :key="evt.id" class="event-item">
            <div class="event-header">
              <el-tag :type="eventLevelType(evt.level)" size="small">{{ eventLevelLabel(evt.level) }}</el-tag>
              <span class="event-title">{{ evt.title }}</span>
            </div>
            <div class="event-meta">
              <el-tag :type="eventStatusType(evt.status)" size="small" effect="dark">{{ eventStatusLabel(evt.status) }}</el-tag>
              <span class="event-time">{{ evt.occurredAt }}</span>
            </div>
          </div>
        </div>
      </template>
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import * as echarts from "echarts";
import { Loading, WarningFilled, InfoFilled, ArrowRight } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import L from "leaflet";
import { useRouter } from "vue-router";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  fetchMetrics,
  fetchMonitoringPoints,
  fetchMonitoringPointDetail,
  fetchAlerts,
  fetchAlertsSummary,
  fetchEvents
} from "../services/api";
import MonitoringPointTrend from "../components/MonitoringPointTrend.vue";

const router = useRouter();

interface Point {
  id: number;
  name: string;
  seaArea: string;
  type: string;
  latitude: number;
  longitude: number;
  status: string;
  waterQuality: string;
  windSpeed: number;
  temperature: number;
  updatedAt: string;
}

interface AlertRecord {
  id: number;
  ruleId: number;
  ruleName: string;
  pointId: number;
  pointName: string;
  seaArea: string;
  level: string;
  message: string;
  metricValue: string | number;
  status: string;
  triggeredAt: string;
}

interface AlertSummary {
  total: number;
  active: number;
  acknowledged: number;
  resolved: number;
  high: number;
  medium: number;
  low: number;
}

interface EventRecord {
  id: number;
  title: string;
  category: string;
  seaArea: string;
  level: string;
  status: string;
  occurredAt: string;
}

const metrics = ref<Record<string, number>>({});
const points = ref<Point[]>([]);
const activeAlerts = ref<AlertRecord[]>([]);
const alertSummary = ref<AlertSummary>({
  total: 0, active: 0, acknowledged: 0, resolved: 0,
  high: 0, medium: 0, low: 0
});
const events = ref<EventRecord[]>([]);
const chartRef = ref<HTMLDivElement | null>(null);
const activeFilter = ref<string>("all");
const selectedPointId = ref<number | null>(null);

interface PointDetail {
  point: Point;
  seaArea: {
    name: string;
    usageType: string;
    jurisdiction: string;
    keyRisks: string[];
  } | null;
  alerts: AlertRecord[];
  recentEvents: EventRecord[];
}

const drawerVisible = ref(false);
const detailData = ref<PointDetail | null>(null);
const detailLoading = ref(false);

let mapInstance: L.Map | null = null;
const markerMap = new Map<number, L.CircleMarker>();
let chartInstance: echarts.ECharts | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

const OFFLINE_THRESHOLD = 0;
const OPEN_EVENTS_THRESHOLD = 0;
const WATER_QUALITY_THRESHOLD = 95;
const WARNING_POINTS_THRESHOLD = 0;
const ACTIVE_ALERTS_THRESHOLD = 0;
const ABNORMAL_SHIPS_THRESHOLD = 0;

interface CardItem {
  label: string;
  value: number;
  displayValue: string | number;
  unit?: string;
  color?: string;
  isAbnormal: boolean;
  hint?: string;
  clickable: boolean;
  action?: string;
  query?: { filter?: string; status?: string };
}

const cards = computed<CardItem[]>(() => {
  const monitoringPoints = metrics.value.monitoringPoints ?? 0;
  const offlinePoints = metrics.value.offlinePoints ?? 0;
  const warningPoints = metrics.value.warningPoints ?? 0;
  const openEvents = metrics.value.openEvents ?? 0;
  const activeAlerts = alertSummary.value.active ?? 0;
  const waterQualityRate = metrics.value.waterQualityRate ?? 100;
  const abnormalShips = metrics.value.abnormalShips ?? 0;
  const shipsOnline = metrics.value.shipsOnline ?? 0;

  return [
    {
      label: "监管海域",
      value: metrics.value.seaAreas ?? 0,
      displayValue: metrics.value.seaAreas ?? 0,
      unit: "片",
      isAbnormal: false,
      clickable: true,
      action: "/sea-areas"
    },
    {
      label: "监测点位",
      value: monitoringPoints,
      displayValue: monitoringPoints,
      unit: "个",
      isAbnormal: false,
      clickable: true,
      action: "dashboard",
      query: { filter: "all" }
    },
    {
      label: "离线点位",
      value: offlinePoints,
      displayValue: offlinePoints,
      unit: "个",
      color: "#64748b",
      isAbnormal: offlinePoints > OFFLINE_THRESHOLD,
      hint: offlinePoints > OFFLINE_THRESHOLD ? `有 ${offlinePoints} 个监测点离线，请检查设备状态` : undefined,
      clickable: true,
      action: "dashboard",
      query: { filter: "offline" }
    },
    {
      label: "预警点位",
      value: warningPoints,
      displayValue: warningPoints,
      unit: "个",
      color: "#d97706",
      isAbnormal: warningPoints > WARNING_POINTS_THRESHOLD,
      hint: warningPoints > WARNING_POINTS_THRESHOLD ? `有 ${warningPoints} 个监测点处于预警状态` : undefined,
      clickable: true,
      action: "dashboard",
      query: { filter: "warning" }
    },
    {
      label: "水质达标率",
      value: waterQualityRate,
      displayValue: waterQualityRate.toFixed(1),
      unit: "%",
      color: waterQualityRate < WATER_QUALITY_THRESHOLD ? "#dc2626" : "#0f766e",
      isAbnormal: waterQualityRate < WATER_QUALITY_THRESHOLD,
      hint: waterQualityRate < WATER_QUALITY_THRESHOLD
        ? `水质达标率 ${waterQualityRate.toFixed(1)}% 低于阈值 ${WATER_QUALITY_THRESHOLD}%，请关注`
        : undefined,
      clickable: true,
      action: "/sea-areas"
    },
    {
      label: "在线船舶",
      value: shipsOnline,
      displayValue: shipsOnline,
      unit: "艘",
      isAbnormal: false,
      clickable: true,
      action: "/ships"
    },
    {
      label: "异常船舶",
      value: abnormalShips,
      displayValue: abnormalShips,
      unit: "艘",
      color: "#dc2626",
      isAbnormal: abnormalShips > ABNORMAL_SHIPS_THRESHOLD,
      hint: abnormalShips > ABNORMAL_SHIPS_THRESHOLD ? `发现 ${abnormalShips} 艘异常船舶，建议核查` : undefined,
      clickable: true,
      action: "/ships"
    },
    {
      label: "活跃告警",
      value: activeAlerts,
      displayValue: activeAlerts,
      unit: "条",
      color: "#dc2626",
      isAbnormal: activeAlerts > ACTIVE_ALERTS_THRESHOLD,
      hint: activeAlerts > ACTIVE_ALERTS_THRESHOLD ? `当前有 ${activeAlerts} 条活跃告警待处置` : undefined,
      clickable: true,
      action: "/admin"
    },
    {
      label: "待处置事件",
      value: openEvents,
      displayValue: openEvents,
      unit: "件",
      color: openEvents > OPEN_EVENTS_THRESHOLD ? "#dc2626" : "#17324d",
      isAbnormal: openEvents > OPEN_EVENTS_THRESHOLD,
      hint: openEvents > OPEN_EVENTS_THRESHOLD ? `有 ${openEvents} 件事件待处置，请及时处理` : undefined,
      clickable: true,
      action: "/events",
      query: { status: "open" }
    }
  ];
});

function handleCardClick(item: CardItem) {
  if (!item.clickable) return;

  if (item.action === "dashboard") {
    if (item.query?.filter) {
      activeFilter.value = item.query.filter;
      const target = document.querySelector(".content-grid");
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    return;
  }

  if (item.action) {
    const query: Record<string, string> = {};
    if (item.query?.status) {
      query.status = item.query.status;
    }
    router.push({ path: item.action, query: Object.keys(query).length > 0 ? query : undefined });
  }
}

const pointAlertCountMap = computed(() => {
  const map = new Map<number, number>();
  for (const a of activeAlerts.value) {
    map.set(a.pointId, (map.get(a.pointId) ?? 0) + 1);
  }
  return map;
});

function pointAlertCount(pointId: number): number {
  return pointAlertCountMap.value.get(pointId) ?? 0;
}

const statusCounts = computed(() => {
  const all = points.value.length;
  const normal = points.value.filter((p) => p.status === "normal").length;
  const warning = points.value.filter((p) => p.status === "warning").length;
  const offline = points.value.filter((p) => p.status === "offline").length;
  return { all, normal, warning, offline };
});

const filterOptions = computed(() => [
  { key: "all", label: "全部", color: "#0c5273", count: statusCounts.value.all },
  { key: "normal", label: "正常", color: "#0f766e", count: statusCounts.value.normal },
  { key: "warning", label: "预警", color: "#d97706", count: statusCounts.value.warning },
  { key: "offline", label: "离线", color: "#64748b", count: statusCounts.value.offline }
]);

const filteredPoints = computed(() => {
  if (activeFilter.value === "all") return points.value;
  return points.value.filter((p) => p.status === activeFilter.value);
});

function statusLabel(status: string) {
  return { normal: "正常", warning: "预警", offline: "离线" }[status] ?? status;
}

function statusType(status: string) {
  return status === "normal" ? "success" : status === "warning" ? "warning" : "info";
}

function levelLabel(level: string) {
  return { low: "低", medium: "中", high: "高" }[level] ?? level;
}

function levelType(level: string) {
  return level === "high" ? "danger" : level === "medium" ? "warning" : "info";
}

function alertStatusLabel(status: string) {
  return { active: "活跃", acknowledged: "已确认", resolved: "已解决" }[status] ?? status;
}

function alertStatusType(status: string) {
  return status === "active" ? "danger" : status === "acknowledged" ? "warning" : "success";
}

function qualityClass(quality: string) {
  if (quality.includes("I") && !quality.includes("V") && !quality.includes("IV"))
    return "quality-excellent";
  if (quality.includes("II")) return "quality-good";
  if (quality.includes("III")) return "quality-moderate";
  if (quality.includes("IV")) return "quality-poor";
  return "quality-bad";
}

function rowClassName({ row }: { row: Point }) {
  return row.id === selectedPointId.value ? "row-selected" : "";
}

function statusColor(status: string) {
  return status === "warning" ? "#d97706" : status === "offline" ? "#64748b" : "#0f766e";
}

function renderMap() {
  mapInstance = L.map("map", { zoomControl: false }).setView([30.58, 122.36], 8);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(mapInstance);

  points.value.forEach((point) => {
    const isWarning = point.status === "warning";
    const hasAlert = pointAlertCount(point.id) > 0;
    const color = hasAlert ? "#dc2626" : statusColor(point.status);

    const marker = L.circleMarker([point.latitude, point.longitude], {
      radius: hasAlert ? 12 : isWarning ? 10 : 8,
      color,
      fillColor: color,
      fillOpacity: 0.85,
      weight: hasAlert ? 3 : 2
    }).addTo(mapInstance!);

    const alertInfo = hasAlert
      ? `<br/><span style="color:#dc2626;font-weight:600">${pointAlertCount(point.id)} 条活跃告警</span>`
      : "";

    marker.bindPopup(
      `<div style="min-width:160px">
        <strong>${point.name}</strong><br/>
        <span style="color:${color}">${statusLabel(point.status)}</span> · ${point.waterQuality}<br/>
        ${point.type} · ${point.updatedAt}${alertInfo}
      </div>`
    );

    marker.on("click", () => {
      selectedPointId.value = point.id;
    });

    markerMap.set(point.id, marker);
  });
}

function syncMapMarkers() {
  markerMap.forEach((marker, id) => {
    const point = points.value.find((p) => p.id === id);
    if (!point) return;
    const hasAlert = pointAlertCount(id) > 0;
    const isWarning = point.status === "warning";
    const color = hasAlert ? "#dc2626" : statusColor(point.status);
    const isSelected = id === selectedPointId.value;
    marker.setStyle({
      radius: isSelected ? 13 : hasAlert ? 12 : isWarning ? 10 : 8,
      weight: isSelected ? 4 : hasAlert ? 3 : 2,
      color: isSelected ? "#fff" : color,
      fillColor: color,
      fillOpacity: isSelected ? 1 : 0.85
    });

    const alertInfo = hasAlert
      ? `<br/><span style="color:#dc2626;font-weight:600">${pointAlertCount(id)} 条活跃告警</span>`
      : "";
    marker.setPopupContent(
      `<div style="min-width:160px">
        <strong>${point.name}</strong><br/>
        <span style="color:${color}">${statusLabel(point.status)}</span> · ${point.waterQuality}<br/>
        ${point.type} · ${point.updatedAt}${alertInfo}
      </div>`
    );

    if (isSelected) marker.bringToFront();
  });
}

function syncMarkerVisibility() {
  const visibleIds = new Set(filteredPoints.value.map((p) => p.id));
  markerMap.forEach((marker, id) => {
    if (visibleIds.has(id)) {
      if (!mapInstance!.hasLayer(marker)) marker.addTo(mapInstance!);
    } else {
      if (mapInstance!.hasLayer(marker)) marker.remove();
    }
  });
}

function highlightSelectedMarker() {
  syncMapMarkers();
}

function eventLevelLabel(level: string) {
  return { low: "低", medium: "中", high: "高" }[level] ?? level;
}

function eventLevelType(level: string) {
  return level === "high" ? "danger" : level === "medium" ? "warning" : "info";
}

function eventStatusLabel(status: string) {
  return { reported: "已上报", processing: "处理中", resolved: "已办结" }[status] ?? status;
}

function eventStatusType(status: string) {
  return status === "resolved" ? "success" : status === "processing" ? "warning" : "info";
}

async function openPointDetail(pointId: number) {
  detailLoading.value = true;
  drawerVisible.value = true;
  try {
    detailData.value = await fetchMonitoringPointDetail(pointId);
  } catch (error) {
    detailData.value = null;
    if (error && (error as any).name === "AuthError") {
      // Auth interceptor handles redirect
    } else {
      ElMessage.error("加载监测点详情失败");
    }
  } finally {
    detailLoading.value = false;
  }
}

function onRowClick(row: Point) {
  selectedPointId.value = row.id;
  if (mapInstance) {
    mapInstance.flyTo([row.latitude, row.longitude], 10, { duration: 0.8 });
    const marker = markerMap.get(row.id);
    if (marker) marker.openPopup();
  }
}

function buildTrendSeries() {
  const alertsByDate = new Map<string, number>();
  const eventsByDate = new Map<string, number>();

  for (const a of activeAlerts.value) {
    const day = a.triggeredAt.slice(0, 10);
    alertsByDate.set(day, (alertsByDate.get(day) ?? 0) + 1);
  }

  for (const e of events.value) {
    const day = e.occurredAt.slice(0, 10);
    eventsByDate.set(day, (eventsByDate.get(day) ?? 0) + 1);
  }

  const days: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const alertTrend = days.map((d) => alertsByDate.get(d) ?? 0);
  const eventTrend = days.map((d) => eventsByDate.get(d) ?? 0);
  const labels = days.map((d) => d.slice(5));

  return { labels, alertTrend, eventTrend };
}

function renderChart() {
  if (!chartRef.value) return;
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value);
  }
  const { labels, alertTrend, eventTrend } = buildTrendSeries();
  chartInstance.setOption({
    tooltip: { trigger: "axis" },
    legend: { data: ["告警", "事件"], top: 0, right: 16, textStyle: { fontSize: 12 } },
    grid: { left: 36, right: 16, top: 32, bottom: 28 },
    xAxis: { type: "category", data: labels },
    yAxis: { type: "value", minInterval: 1 },
    series: [
      {
        name: "告警",
        type: "line",
        smooth: true,
        data: alertTrend,
        color: "#dc2626",
        areaStyle: { color: "rgba(220,38,38,0.12)" }
      },
      {
        name: "事件",
        type: "bar",
        data: eventTrend,
        color: "#0f766e",
        barWidth: 16
      }
    ]
  });
}

async function loadAllData() {
  const [metricRes, pointRes, alertsRes, summaryRes, eventsRes] = await Promise.allSettled([
    fetchMetrics(),
    fetchMonitoringPoints(),
    fetchAlerts({ status: "active" }),
    fetchAlertsSummary(),
    fetchEvents()
  ]);
  if (metricRes.status === "fulfilled") metrics.value = metricRes.value;
  if (pointRes.status === "fulfilled") points.value = pointRes.value;
  if (alertsRes.status === "fulfilled") activeAlerts.value = alertsRes.value;
  if (summaryRes.status === "fulfilled") alertSummary.value = summaryRes.value;
  if (eventsRes.status === "fulfilled") events.value = eventsRes.value;

  const firstAuthError = [metricRes, pointRes, alertsRes, summaryRes, eventsRes]
    .map((r) => (r.status === "rejected" ? r.reason : null))
    .find((e) => e && (e as any).name === "AuthError");
  if (firstAuthError) {
    throw firstAuthError;
  }
  const firstError = [metricRes, pointRes, alertsRes, summaryRes, eventsRes]
    .map((r) => (r.status === "rejected" ? r.reason : null))
    .find((e) => e);
  if (firstError) {
    ElMessage.error("部分数据加载失败，可点击刷新重试");
  }
}

watch(activeFilter, () => {
  syncMarkerVisibility();
  selectedPointId.value = null;
});

watch(selectedPointId, (newId) => {
  highlightSelectedMarker();
  if (newId !== null) {
    openPointDetail(newId);
  }
});

watch([() => alertSummary.value.active, () => pointAlertCountMap.value.size, () => events.value.length], () => {
  syncMapMarkers();
  renderChart();
});

const handleStorageChange = (e: StorageEvent) => {
  if (e.key === "ocean_alert_rules_changed") {
    loadAllData();
  }
};

onMounted(async () => {
  try {
    await loadAllData();
  } catch (error) {
    if (error && (error as any).name === "AuthError") {
      return;
    }
    ElMessage.error("首屏数据加载失败，可点击刷新重试");
  }
  try {
    await nextTick();
    renderMap();
    renderChart();
  } catch {
    // ignore render errors on first paint
  }

  refreshTimer = setInterval(async () => {
    try {
      await loadAllData();
    } catch {
      // ignore periodic load errors; user can manually refresh
    }
  }, 30000);
  window.addEventListener("storage", handleStorageChange);
});

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
  window.removeEventListener("storage", handleStorageChange);
});
</script>

<style scoped>
.metric-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid #dde8ee;
  padding: 18px 16px;
  transition: all 0.25s ease;
  position: relative;
  overflow: hidden;
}

.metric-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: linear-gradient(90deg, #0c5273, #0f766e);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.3s ease;
}

.metric-card--clickable {
  cursor: pointer;
}

.metric-card--clickable:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(12, 82, 115, 0.12);
  border-color: #0c5273;
}

.metric-card--clickable:hover::before {
  transform: scaleX(1);
}

.metric-card--abnormal {
  border-color: #fecaca;
  background: linear-gradient(180deg, #fff5f5 0%, #ffffff 60%);
}

.metric-card--abnormal::before {
  background: linear-gradient(90deg, #dc2626, #f97316);
  transform: scaleX(1);
}

.metric-card--abnormal.metric-card--clickable:hover {
  box-shadow: 0 8px 24px rgba(220, 38, 38, 0.15);
  border-color: #dc2626;
}

.metric-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.metric-card__label {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
  letter-spacing: 0.2px;
}

.metric-card__alert-icon {
  color: #dc2626;
  font-size: 18px;
}

.metric-card__alert-icon--animate {
  animation: alert-pulse 1.5s ease-in-out infinite;
}

@keyframes alert-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.2);
    opacity: 0.7;
  }
}

.metric-card__value-wrapper {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 4px;
}

.metric-card__value {
  display: block;
  color: #0c5273;
  font-size: 30px;
  font-weight: 700;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.metric-card__unit {
  font-size: 14px;
  color: #94a3b8;
  font-weight: 500;
}

.metric-card__hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 8px 10px;
  background: #fef2f2;
  border-radius: 6px;
  font-size: 12px;
  color: #b91c1c;
  line-height: 1.5;
  border-left: 3px solid #dc2626;
}

.metric-card__hint--normal {
  background: #f0f7ff;
  color: #0c5273;
  border-left-color: #0c5273;
}

.metric-card__hint-icon {
  flex-shrink: 0;
  font-size: 14px;
}

.metric-card__hint span {
  flex: 1;
  min-width: 0;
}

.metric-card__arrow {
  flex-shrink: 0;
  font-size: 14px;
  opacity: 0.7;
  transition: transform 0.2s ease;
}

.metric-card--clickable:hover .metric-card__arrow {
  transform: translateX(3px);
  opacity: 1;
}

.filter-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 1px solid #dde8ee;
  border-radius: 16px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  color: #17324d;
  transition: all 0.2s;
}

.filter-btn:hover {
  border-color: #0c5273;
}

.filter-btn.active {
  background: #0c5273;
  color: #fff;
  border-color: #0c5273;
}

.filter-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.filter-count {
  font-weight: 700;
  min-width: 16px;
  text-align: center;
}

.type-badge {
  font-size: 12px;
  color: #4b6584;
}

.quality-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}

.quality-excellent {
  background: #e6f7f0;
  color: #0f766e;
}

.quality-good {
  background: #e0f2fe;
  color: #0369a1;
}

.quality-moderate {
  background: #fef9c3;
  color: #a16207;
}

.quality-poor {
  background: #fee2e2;
  color: #b91c1c;
}

.quality-bad {
  background: #fce7f3;
  color: #be185d;
}

.text-muted {
  color: #909399;
  font-size: 13px;
}

.update-time {
  font-size: 12px;
  color: #64748b;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

:deep(.row-selected) {
  background: #e0f2fe !important;
}

:deep(.el-table) {
  --el-table-row-hover-bg-color: #f0f7ff;
}

#map {
  width: 100%;
  height: 420px;
  border-radius: 8px;
}

.chart {
  width: 100%;
  height: 260px;
}

.detail-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 0;
  color: #64748b;
  font-size: 14px;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.detail-point-name {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #17324d;
}

.detail-section {
  margin-bottom: 20px;
}

.detail-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: #0c5273;
  padding-bottom: 6px;
  border-bottom: 1px solid #f1f5f9;
}

.detail-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 13px;
}

.detail-label {
  color: #64748b;
  flex-shrink: 0;
  min-width: 72px;
}

.detail-value {
  color: #17324d;
  text-align: right;
  word-break: break-all;
}

.detail-risks {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
}

.alert-item {
  background: #fef2f2;
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 8px;
}

.alert-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.alert-name {
  font-weight: 600;
  font-size: 13px;
  color: #17324d;
}

.alert-message {
  margin: 0 0 4px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

.alert-time {
  font-size: 11px;
  color: #94a3b8;
}

.event-item {
  background: #f8fafc;
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 8px;
}

.event-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.event-title {
  font-weight: 600;
  font-size: 13px;
  color: #17324d;
}

.event-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #64748b;
}

.event-time {
  font-size: 11px;
  color: #94a3b8;
}
</style>
