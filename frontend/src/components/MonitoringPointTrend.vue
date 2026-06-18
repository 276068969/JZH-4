<template>
  <div class="mp-trend">
    <div class="trend-toolbar">
      <el-radio-group v-model="range" size="small" @change="loadTrend">
        <el-radio-button value="7d">近7天</el-radio-button>
        <el-radio-button value="30d">近30天</el-radio-button>
        <el-radio-button value="90d">近90天</el-radio-button>
      </el-radio-group>
      <span v-if="trendData" class="trend-range">{{ trendData.from }} ~ {{ trendData.to }}</span>
    </div>

    <div v-if="loading" class="trend-loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>加载趋势数据…</span>
    </div>

    <template v-else-if="trendData">
      <div class="trend-assessment">
        <div class="assessment-tags">
          <span class="assessment-tag">
            水质
            <el-tag :type="trendTagType(trendData.assessment.waterQualityTrend)" size="small" effect="dark">
              {{ trendTagLabel(trendData.assessment.waterQualityTrend) }}
            </el-tag>
          </span>
          <span class="assessment-tag">
            风速
            <el-tag :type="trendTagType(trendData.assessment.windSpeedTrend)" size="small" effect="dark">
              {{ trendTagLabel(trendData.assessment.windSpeedTrend) }}
            </el-tag>
          </span>
          <span class="assessment-tag">
            温度
            <el-tag :type="trendTagType(trendData.assessment.temperatureTrend)" size="small" effect="dark">
              {{ trendTagLabel(trendData.assessment.temperatureTrend) }}
            </el-tag>
          </span>
        </div>
        <p class="assessment-summary" :class="{ worsening: isWorsening }">
          <el-icon v-if="isWorsening"><WarningFilled /></el-icon>
          {{ trendData.assessment.summary }}
        </p>
      </div>

      <h5 class="chart-title">水质等级趋势</h5>
      <div ref="waterChartRef" class="trend-chart"></div>

      <h5 class="chart-title">气象指标趋势</h5>
      <div ref="weatherChartRef" class="trend-chart"></div>
    </template>

    <div v-else class="trend-empty">暂无趋势数据</div>
  </div>
</template>

<script setup lang="ts">
import * as echarts from "echarts";
import { Loading, WarningFilled } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from "vue";
import {
  fetchMonitoringPointTrend,
  type MonitoringPointTrendResponse,
  type MonitoringTrendSeries,
  AuthError
} from "../services/api";

const props = defineProps<{ pointId: number }>();

const WATER_QUALITY_GRADES = ["I 类", "II 类", "III 类", "IV 类", "V 类", "劣 V 类"];

const range = ref("7d");
const trendData = ref<MonitoringPointTrendResponse | null>(null);
const loading = ref(false);
const waterChartRef = ref<HTMLDivElement | null>(null);
const weatherChartRef = ref<HTMLDivElement | null>(null);

let waterChart: echarts.ECharts | null = null;
let weatherChart: echarts.ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

const isWorsening = computed(() => {
  const a = trendData.value?.assessment;
  if (!a) return false;
  return (
    a.waterQualityTrend === "worsening" ||
    a.windSpeedTrend === "rising" ||
    a.temperatureTrend === "rising"
  );
});

function trendTagType(trend: string) {
  if (trend === "worsening") return "danger";
  if (trend === "rising") return "warning";
  if (trend === "improving" || trend === "falling") return "success";
  return "info";
}

function trendTagLabel(trend: string) {
  const map: Record<string, string> = {
    worsening: "恶化",
    improving: "改善",
    rising: "上升",
    falling: "下降",
    stable: "平稳"
  };
  return map[trend] ?? trend;
}

function findSeries(metric: string): MonitoringTrendSeries | undefined {
  return trendData.value?.series.find((s) => s.metric === metric);
}

function attachResizeObserver() {
  if (!resizeObserver) return;
  try {
    if (waterChartRef.value) resizeObserver.observe(waterChartRef.value);
    if (weatherChartRef.value) resizeObserver.observe(weatherChartRef.value);
  } catch {
    // ignore observe errors
  }
}

function ensureChartInstance(
  refEl: HTMLDivElement | null,
  existing: echarts.ECharts | null
): echarts.ECharts | null {
  if (!refEl) return null;
  if (existing) {
    const dom = existing.getDom();
    if (dom === refEl && document.body.contains(dom)) {
      return existing;
    }
    try {
      existing.dispose();
    } catch {
      // ignore
    }
  }
  try {
    return echarts.init(refEl);
  } catch {
    return null;
  }
}

function renderCharts() {
  if (!trendData.value) return;
  const wqSeries = findSeries("waterQuality");
  const windSeries = findSeries("windSpeed");
  const tempSeries = findSeries("temperature");
  if (!wqSeries || !windSeries || !tempSeries) return;
  if (wqSeries.points.length === 0) return;

  const dates = wqSeries.points.map((p) => p.timestamp.slice(5));
  const wqRanks = wqSeries.points.map((p) => {
    const r = p.rank;
    return typeof r === "number" && Number.isFinite(r)
      ? Math.max(0, Math.min(WATER_QUALITY_GRADES.length - 1, r))
      : 0;
  });
  const winds = windSeries.points.map((p) => {
    const v = Number(p.value);
    return Number.isFinite(v) ? v : 0;
  });
  const temps = tempSeries.points.map((p) => {
    const v = Number(p.value);
    return Number.isFinite(v) ? v : 0;
  });

  try {
    if (waterChartRef.value) {
      waterChart = ensureChartInstance(waterChartRef.value, waterChart);
      if (waterChart) {
        waterChart.setOption(
          {
            tooltip: {
              trigger: "axis",
              formatter: (params: any) => {
                try {
                  const item = Array.isArray(params) ? params[0] : params;
                  if (!item) return "";
                  const rank = Number(item.value);
                  const grade = Number.isFinite(rank) ? WATER_QUALITY_GRADES[Math.round(rank)] : undefined;
                  return `${item.axisValue ?? ""}<br/>水质等级：<strong>${grade ?? "—"}</strong>`;
                } catch {
                  return "";
                }
              }
            },
            grid: { left: 44, right: 16, top: 12, bottom: 28 },
            xAxis: {
              type: "category",
              data: dates,
              boundaryGap: false,
              axisLabel: { fontSize: 10, hideOverlap: true }
            },
            yAxis: {
              type: "value",
              min: 0,
              max: WATER_QUALITY_GRADES.length - 1,
              interval: 1,
              inverse: true,
              axisLabel: {
                fontSize: 10,
                formatter: (v: number) => {
                  const grade = WATER_QUALITY_GRADES[Math.round(Number(v))];
                  return grade ?? "";
                }
              }
            },
            series: [
              {
                name: "水质等级",
                type: "line",
                step: "middle",
                data: wqRanks,
                symbol: "circle",
                symbolSize: 5,
                lineStyle: { color: "#be185d", width: 2 },
                itemStyle: { color: "#be185d" },
                areaStyle: { color: "rgba(190,24,93,0.1)" }
              }
            ]
          },
          true
        );
      }
    }
  } catch {
    // ignore chart render errors
  }

  try {
    if (weatherChartRef.value) {
      weatherChart = ensureChartInstance(weatherChartRef.value, weatherChart);
      if (weatherChart) {
        weatherChart.setOption(
          {
            tooltip: { trigger: "axis" },
            legend: {
              data: ["风速", "温度"],
              top: 0,
              right: 8,
              textStyle: { fontSize: 11 }
            },
            grid: { left: 40, right: 44, top: 28, bottom: 28 },
            xAxis: {
              type: "category",
              data: dates,
              boundaryGap: false,
              axisLabel: { fontSize: 10, hideOverlap: true }
            },
            yAxis: [
              {
                type: "value",
                name: "m/s",
                nameTextStyle: { fontSize: 10 },
                axisLabel: { fontSize: 10 },
                splitLine: { show: true, lineStyle: { type: "dashed", color: "#eef2f7" } }
              },
              {
                type: "value",
                name: "°C",
                nameTextStyle: { fontSize: 10 },
                axisLabel: { fontSize: 10 },
                splitLine: { show: false }
              }
            ],
            series: [
              {
                name: "风速",
                type: "line",
                smooth: true,
                data: winds,
                yAxisIndex: 0,
                symbol: "none",
                color: "#0ea5e9",
                areaStyle: { color: "rgba(14,165,233,0.1)" }
              },
              {
                name: "温度",
                type: "line",
                smooth: true,
                data: temps,
                yAxisIndex: 1,
                symbol: "none",
                color: "#f97316"
              }
            ]
          },
          true
        );
      }
    }
  } catch {
    // ignore chart render errors
  }

  attachResizeObserver();
  try {
    waterChart?.resize();
    weatherChart?.resize();
  } catch {
    // ignore
  }
}

async function loadTrend() {
  if (!props.pointId) return;
  loading.value = true;
  try {
    trendData.value = await fetchMonitoringPointTrend(props.pointId, range.value);
    await nextTick();
    renderCharts();
    setTimeout(() => renderCharts(), 50);
    setTimeout(() => renderCharts(), 250);
  } catch (error) {
    trendData.value = null;
    if (!(error instanceof AuthError)) {
      try {
        ElMessage.error("加载监测趋势数据失败");
      } catch {
        // ignore
      }
    }
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.pointId,
  () => loadTrend()
);

watch(
  () => trendData.value,
  async () => {
    if (!trendData.value) return;
    await nextTick();
    renderCharts();
  }
);

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    try {
      waterChart?.resize();
      weatherChart?.resize();
    } catch {
      // ignore resize errors
    }
  });
  loadTrend();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  waterChart?.dispose();
  weatherChart?.dispose();
  waterChart = null;
  weatherChart = null;
});
</script>

<style scoped>
.mp-trend {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.trend-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.trend-range {
  font-size: 12px;
  color: #64748b;
}

.trend-loading,
.trend-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 0;
  color: #64748b;
  font-size: 13px;
}

.trend-assessment {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 4px;
}

.assessment-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 8px;
}

.assessment-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #475569;
}

.assessment-summary {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: #334155;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.assessment-summary.worsening {
  color: #b91c1c;
  font-weight: 600;
}

.chart-title {
  margin: 8px 0 2px;
  font-size: 13px;
  font-weight: 600;
  color: #0c5273;
}

.trend-chart {
  width: 100%;
  height: 180px;
}
</style>
