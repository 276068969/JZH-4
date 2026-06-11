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
        <el-table :data="points" size="small">
          <el-table-column prop="name" label="监测点" min-width="140" />
          <el-table-column prop="waterQuality" label="水质" width="80" />
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
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
import { computed, nextTick, onMounted, ref } from "vue";
import { fetchMetrics, fetchMonitoringPoints } from "../services/api";

interface Point {
  name: string;
  latitude: number;
  longitude: number;
  status: string;
  waterQuality: string;
}

const metrics = ref<Record<string, number>>({});
const points = ref<Point[]>([]);
const chartRef = ref<HTMLDivElement | null>(null);

const cards = computed(() => [
  { label: "监管海域", value: metrics.value.seaAreas ?? 0 },
  { label: "监测点位", value: metrics.value.monitoringPoints ?? 0 },
  { label: "在线船舶", value: metrics.value.shipsOnline ?? 0 },
  { label: "待处置事件", value: metrics.value.openEvents ?? 0 }
]);

function statusLabel(status: string) {
  return { normal: "正常", warning: "预警", offline: "离线" }[status] ?? status;
}

function statusType(status: string) {
  return status === "normal" ? "success" : status === "warning" ? "warning" : "info";
}

function renderMap() {
  const map = L.map("map", { zoomControl: false }).setView([30.58, 122.36], 8);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
  points.value.forEach((point) => {
    L.circleMarker([point.latitude, point.longitude], {
      radius: 8,
      color: point.status === "warning" ? "#d97706" : point.status === "offline" ? "#64748b" : "#0f766e",
      fillOpacity: 0.8
    })
      .addTo(map)
      .bindPopup(`${point.name}<br />${statusLabel(point.status)} · ${point.waterQuality}`);
  });
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

onMounted(async () => {
  const [metricData, pointData] = await Promise.all([fetchMetrics(), fetchMonitoringPoints()]);
  metrics.value = metricData;
  points.value = pointData;
  await nextTick();
  renderMap();
  renderChart();
});
</script>
