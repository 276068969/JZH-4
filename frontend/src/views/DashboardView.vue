<template>
  <section>
    <div class="metric-grid">
      <article v-for="item in cards" :key="item.label" class="metric-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
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
          <el-table-column prop="updatedAt" label="更新时间" width="140">
            <template #default="{ row }">
              <span class="update-time">{{ row.updatedAt }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import * as echarts from "echarts";
import L from "leaflet";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { fetchMetrics, fetchMonitoringPoints } from "../services/api";

interface Point {
  id: number;
  name: string;
  seaArea: string;
  type: string;
  latitude: number;
  longitude: number;
  status: string;
  waterQuality: string;
  updatedAt: string;
}

const metrics = ref<Record<string, number>>({});
const points = ref<Point[]>([]);
const chartRef = ref<HTMLDivElement | null>(null);
const activeFilter = ref<string>("all");
const selectedPointId = ref<number | null>(null);

let mapInstance: L.Map | null = null;
const markerMap = new Map<number, L.CircleMarker>();

const cards = computed(() => [
  { label: "监管海域", value: metrics.value.seaAreas ?? 0 },
  { label: "监测点位", value: metrics.value.monitoringPoints ?? 0 },
  { label: "在线船舶", value: metrics.value.shipsOnline ?? 0 },
  { label: "待处置事件", value: metrics.value.openEvents ?? 0 }
]);

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
    const color = statusColor(point.status);

    const marker = L.circleMarker([point.latitude, point.longitude], {
      radius: isWarning ? 10 : 8,
      color,
      fillColor: color,
      fillOpacity: 0.85,
      weight: 2
    }).addTo(mapInstance!);

    marker.bindPopup(
      `<div style="min-width:160px">
        <strong>${point.name}</strong><br/>
        <span style="color:${color}">${statusLabel(point.status)}</span> · ${point.waterQuality}<br/>
        ${point.type} · ${point.updatedAt}
      </div>`
    );

    marker.on("click", () => {
      selectedPointId.value = point.id;
    });

    markerMap.set(point.id, marker);
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
  markerMap.forEach((marker, id) => {
    const isSelected = id === selectedPointId.value;
    const point = points.value.find((p) => p.id === id);
    if (!point) return;
    const color = statusColor(point.status);
    marker.setStyle({
      radius: isSelected ? 13 : point.status === "warning" ? 10 : 8,
      weight: isSelected ? 4 : 2,
      color: isSelected ? "#fff" : color,
      fillColor: color,
      fillOpacity: isSelected ? 1 : 0.85
    });
    if (isSelected) {
      marker.bringToFront();
    }
  });
}

function onRowClick(row: Point) {
  selectedPointId.value = row.id;
  if (mapInstance) {
    mapInstance.flyTo([row.latitude, row.longitude], 10, { duration: 0.8 });
    const marker = markerMap.get(row.id);
    if (marker) marker.openPopup();
  }
}

function renderChart() {
  if (!chartRef.value) return;
  const chart = echarts.init(chartRef.value);
  chart.setOption({
    tooltip: { trigger: "axis" },
    grid: { left: 36, right: 16, top: 24, bottom: 28 },
    xAxis: { type: "category", data: ["06-06", "06-07", "06-08", "06-09", "06-10", "06-11"] },
    yAxis: { type: "value" },
    series: [
      { name: "告警", type: "line", smooth: true, data: [4, 5, 3, 7, 6, 8], color: "#d97706" },
      { name: "事件", type: "bar", data: [2, 3, 2, 4, 3, 5], color: "#0f766e" }
    ]
  });
}

watch(activeFilter, () => {
  syncMarkerVisibility();
  selectedPointId.value = null;
});

watch(selectedPointId, () => {
  highlightSelectedMarker();
});

onMounted(async () => {
  const [metricData, pointData] = await Promise.all([fetchMetrics(), fetchMonitoringPoints()]);
  metrics.value = metricData;
  points.value = pointData;
  await nextTick();
  renderMap();
  renderChart();
});
</script>

<style scoped>
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

.update-time {
  font-size: 12px;
  color: #64748b;
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
</style>
