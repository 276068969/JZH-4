<template>
  <div class="sea-area-risk-rank">
    <div class="rank-header">
      <h3 class="rank-title">海域风险排行</h3>
      <div class="rank-tabs">
        <button
          v-for="tab in sortOptions"
          :key="tab.key"
          :class="['rank-tab', { active: activeSort === tab.key }]"
          @click="activeSort = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div class="rank-list">
      <div
        v-for="(item, index) in rankedSeaAreas"
        :key="item.id"
        class="rank-item"
      >
        <div class="rank-position" :class="rankPositionClass(index)">
          <span v-if="index < 3" class="rank-badge">{{ index + 1 }}</span>
          <span v-else class="rank-number">{{ index + 1 }}</span>
        </div>

        <div class="rank-info">
          <div class="rank-name-row">
            <span class="rank-name">{{ item.name }}</span>
            <el-tag :type="riskLevelType(item.riskLevel)" size="small" effect="dark">
              {{ riskLevelLabel(item.riskLevel) }}
            </el-tag>
          </div>

          <div class="risk-progress">
            <div class="risk-progress-bar" :style="{ width: item.riskScore + '%' }" :class="riskBarClass(item.riskLevel)">
            </div>
            <span class="risk-score-text">{{ item.riskScore.toFixed(1) }} 分</span>
          </div>

          <div class="rank-metrics">
            <div class="metric-item">
              <span class="metric-label">事件</span>
              <span class="metric-value event-count">{{ item.events.total }}</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">高优告警</span>
              <span class="metric-value alert-count">{{ item.alerts.highActiveAlerts }}</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">离线监测点</span>
              <span class="metric-value offline-count">{{ item.monitoringPoints.offline }}</span>
            </div>
            <div class="metric-item">
              <span class="metric-label">水质</span>
              <span :class="['metric-value', 'water-quality', waterQualityClass(item.waterQualityGrade)]">
                {{ item.waterQualityGrade }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="loading" class="rank-loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>加载中…</span>
    </div>

    <div v-if="!loading && rankedSeaAreas.length === 0" class="rank-empty">
      暂无海域数据
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Loading } from "@element-plus/icons-vue";
import { fetchRegulationStats, type SeaAreaRegulationStats } from "../services/api";

interface RankedSeaArea extends SeaAreaRegulationStats {
  riskScore: number;
  riskLevel: "high" | "medium" | "low";
  waterQualityGrade: string;
}

const seaAreas = ref<SeaAreaRegulationStats[]>([]);
const loading = ref(false);
const activeSort = ref("comprehensive");

const sortOptions = [
  { key: "comprehensive", label: "综合风险" },
  { key: "events", label: "事件数量" },
  { key: "alerts", label: "告警等级" },
  { key: "offline", label: "离线监测" }
];

function waterQualityScore(grade: string): number {
  const scoreMap: Record<string, number> = {
    "I 类": 10,
    "II 类": 25,
    "III 类": 45,
    "IV 类": 70,
    "劣 V 类": 95,
    "—": 50
  };
  return scoreMap[grade] ?? 50;
}

function calculateRiskScore(area: SeaAreaRegulationStats): number {
  const eventScore = Math.min(100, area.events.total * 12 + area.events.high * 8 + area.events.medium * 4);

  const alertScore = Math.min(
    100,
    area.alerts.highActiveAlerts * 20 + area.alerts.mediumActiveAlerts * 10 + area.alerts.lowActiveAlerts * 3
  );

  const totalPoints = area.monitoringPoints.total;
  const offlineScore = totalPoints > 0
    ? Math.min(100, (area.monitoringPoints.offline / totalPoints) * 100 + area.monitoringPoints.warning * 3)
    : 0;

  const wqGrade = area.waterQuality?.worstGrade ?? "—";
  const wqScore = waterQualityScore(wqGrade);

  const weights = {
    events: 0.3,
    alerts: 0.3,
    offline: 0.2,
    waterQuality: 0.2
  };

  return (
    eventScore * weights.events +
    alertScore * weights.alerts +
    offlineScore * weights.offline +
    wqScore * weights.waterQuality
  );
}

function getRiskLevel(score: number): "high" | "medium" | "low" {
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

function riskLevelLabel(level: string) {
  return { high: "高风险", medium: "中风险", low: "低风险" }[level] ?? level;
}

function riskLevelType(level: string) {
  return { high: "danger", medium: "warning", low: "success" }[level] ?? "info";
}

function rankPositionClass(index: number) {
  if (index === 0) return "rank-top rank-first";
  if (index === 1) return "rank-top rank-second";
  if (index === 2) return "rank-top rank-third";
  return "rank-normal";
}

function riskBarClass(level: string) {
  return {
    "risk-bar-high": level === "high",
    "risk-bar-medium": level === "medium",
    "risk-bar-low": level === "low"
  };
}

function waterQualityClass(grade: string) {
  if (grade === "I 类" || grade === "II 类") return "quality-good";
  if (grade === "III 类") return "quality-moderate";
  if (grade === "IV 类") return "quality-poor";
  if (grade === "劣 V 类") return "quality-bad";
  return "quality-unknown";
}

const rankedSeaAreas = computed<RankedSeaArea[]>(() => {
  const ranked = seaAreas.value.map((area) => {
    const riskScore = calculateRiskScore(area);
    return {
      ...area,
      riskScore,
      riskLevel: getRiskLevel(riskScore),
      waterQualityGrade: area.waterQuality?.worstGrade ?? "—"
    };
  });

  switch (activeSort.value) {
    case "events":
      return ranked.sort((a, b) => b.events.total - a.events.total);
    case "alerts":
      return ranked.sort((a, b) => b.alerts.highActiveAlerts - a.alerts.highActiveAlerts);
    case "offline":
      return ranked.sort((a, b) => b.monitoringPoints.offline - a.monitoringPoints.offline);
    case "comprehensive":
    default:
      return ranked.sort((a, b) => b.riskScore - a.riskScore);
  }
});

async function loadData() {
  loading.value = true;
  try {
    const data = await fetchRegulationStats();
    seaAreas.value = data.seaAreas;
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);
</script>

<style scoped>
.sea-area-risk-rank {
  background: #fff;
  border: 1px solid #dde8ee;
  border-radius: 8px;
  padding: 16px;
}

.rank-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f1f5f9;
}

.rank-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #17324d;
}

.rank-tabs {
  display: flex;
  gap: 4px;
}

.rank-tab {
  padding: 4px 10px;
  border: 1px solid #dde8ee;
  border-radius: 14px;
  background: #fff;
  font-size: 12px;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
}

.rank-tab:hover {
  border-color: #0c5273;
  color: #0c5273;
}

.rank-tab.active {
  background: #0c5273;
  color: #fff;
  border-color: #0c5273;
}

.rank-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rank-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
  transition: background 0.2s;
}

.rank-item:hover {
  background: #f0f7ff;
}

.rank-position {
  flex-shrink: 0;
  width: 36px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 2px;
}

.rank-badge {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-weight: 700;
  font-size: 14px;
  color: #fff;
  background: #94a3b8;
}

.rank-first .rank-badge {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  box-shadow: 0 2px 8px rgba(217, 119, 6, 0.4);
}

.rank-second .rank-badge {
  background: linear-gradient(135deg, #94a3b8, #64748b);
  box-shadow: 0 2px 8px rgba(100, 116, 139, 0.4);
}

.rank-third .rank-badge {
  background: linear-gradient(135deg, #cd7f32, #a0522d);
  box-shadow: 0 2px 8px rgba(160, 82, 45, 0.4);
}

.rank-number {
  font-size: 14px;
  font-weight: 600;
  color: #94a3b8;
}

.rank-info {
  flex: 1;
  min-width: 0;
}

.rank-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.rank-name {
  font-size: 14px;
  font-weight: 600;
  color: #17324d;
}

.risk-progress {
  position: relative;
  height: 8px;
  background: #e2e8f0;
  border-radius: 4px;
  margin-bottom: 10px;
  overflow: visible;
}

.risk-progress-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.risk-bar-high {
  background: linear-gradient(90deg, #fecaca, #dc2626);
}

.risk-bar-medium {
  background: linear-gradient(90deg, #fde68a, #d97706);
}

.risk-bar-low {
  background: linear-gradient(90deg, #a7f3d0, #059669);
}

.risk-score-text {
  position: absolute;
  right: 0;
  top: -18px;
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
}

.rank-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.metric-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric-label {
  font-size: 11px;
  color: #94a3b8;
}

.metric-value {
  font-size: 14px;
  font-weight: 600;
  color: #17324d;
}

.metric-value.event-count {
  color: #0c5273;
}

.metric-value.alert-count {
  color: #dc2626;
}

.metric-value.offline-count {
  color: #64748b;
}

.metric-value.water-quality {
  font-size: 12px;
}

.quality-good {
  color: #059669;
}

.quality-moderate {
  color: #d97706;
}

.quality-poor {
  color: #ea580c;
}

.quality-bad {
  color: #dc2626;
}

.quality-unknown {
  color: #94a3b8;
}

.rank-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 0;
  color: #64748b;
  font-size: 14px;
}

.rank-empty {
  text-align: center;
  color: #94a3b8;
  padding: 40px 0;
  font-size: 13px;
}

@media (max-width: 480px) {
  .rank-metrics {
    grid-template-columns: repeat(2, 1fr);
  }

  .rank-tabs {
    display: none;
  }
}
</style>
