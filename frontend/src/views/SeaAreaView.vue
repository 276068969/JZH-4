<template>
  <section>
    <div class="summary-grid">
      <article v-for="item in summaryCards" :key="item.label" class="metric-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </article>
    </div>

    <div class="panel" style="margin-top: 16px">
      <h2 class="panel-title">海域基础信息</h2>
      <el-table :data="seaAreas" stripe>
        <el-table-column prop="name" label="海域名称" min-width="140" />
        <el-table-column prop="usageType" label="用途类型" width="130">
          <template #default="{ row }">
            <el-tag :type="usageTagType(row.usageType)" size="small" effect="plain">{{ row.usageType }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="jurisdiction" label="管辖范围" min-width="180" />
        <el-table-column label="重点风险" min-width="200">
          <template #default="{ row }">
            <div class="risk-tags">
              <el-tag
                v-for="risk in row.keyRisks"
                :key="risk"
                type="danger"
                size="small"
                effect="light"
              >
                {{ risk }}
              </el-tag>
              <span v-if="row.keyRisks.length === 0" class="text-muted">—</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="关联监测点" min-width="220">
          <template #default="{ row }">
            <div v-if="row.monitoringPoints.length > 0" class="point-list">
              <div v-for="point in row.monitoringPoints" :key="point.id" class="point-item">
                <span class="point-name">{{ point.name }}</span>
                <el-tag :type="pointStatusType(point.status)" size="small" effect="dark">{{ pointStatusLabel(point.status) }}</el-tag>
                <span class="point-quality">{{ point.waterQuality }}</span>
              </div>
            </div>
            <span v-else class="text-muted">暂无监测点</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { fetchSeaAreas } from "../services/api";

interface MonitoringPointBrief {
  id: number;
  name: string;
  type: string;
  status: string;
  waterQuality: string;
}

interface SeaArea {
  id: number;
  name: string;
  usageType: string;
  jurisdiction: string;
  keyRisks: string[];
  monitoringPointIds: number[];
  monitoringPoints: MonitoringPointBrief[];
}

const seaAreas = ref<SeaArea[]>([]);

const summaryCards = computed(() => {
  const total = seaAreas.value.length;
  const types = new Set(seaAreas.value.map((a) => a.usageType));
  const totalPoints = seaAreas.value.reduce((sum, a) => sum + a.monitoringPoints.length, 0);
  const totalRisks = seaAreas.value.reduce((sum, a) => sum + a.keyRisks.length, 0);
  return [
    { label: "监管海域", value: total },
    { label: "用途类型", value: types.size },
    { label: "关联监测点", value: totalPoints },
    { label: "重点风险项", value: totalRisks }
  ];
});

function usageTagType(usageType: string) {
  const map: Record<string, string> = {
    "生态保护": "success",
    "工业排放监管": "danger",
    "渔业养殖": "warning",
    "航运管理": "primary"
  };
  return map[usageType] ?? "info";
}

function pointStatusLabel(status: string) {
  return { normal: "正常", warning: "预警", offline: "离线" }[status] ?? status;
}

function pointStatusType(status: string) {
  return status === "normal" ? "success" : status === "warning" ? "warning" : "info";
}

onMounted(async () => {
  seaAreas.value = await fetchSeaAreas();
});
</script>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  gap: 16px;
}

.risk-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.point-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.point-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.point-name {
  color: #17324d;
  font-weight: 500;
}

.point-quality {
  color: #64748b;
  font-size: 12px;
}

.text-muted {
  color: #909399;
  font-size: 13px;
}

@media (max-width: 960px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
