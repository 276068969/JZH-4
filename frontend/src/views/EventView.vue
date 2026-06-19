<template>
  <section class="event-view">
    <div class="event-main panel">
      <h2 class="panel-title">
        事件监管
        <el-button type="primary" @click="dialogVisible = true">上报事件</el-button>
      </h2>

      <div class="filter-bar">
        <el-select v-model="filters.category" placeholder="事件类型" clearable style="width: 140px">
          <el-option v-for="c in categoryOptions" :key="c" :label="c" :value="c" />
        </el-select>
        <el-select v-model="filters.level" placeholder="事件等级" clearable style="width: 120px">
          <el-option label="高" value="high" />
          <el-option label="中" value="medium" />
          <el-option label="低" value="low" />
        </el-select>
        <el-select v-model="filters.status" placeholder="处置状态" clearable style="width: 140px">
          <el-option label="待处置" value="open" />
          <el-option label="已上报" value="reported" />
          <el-option label="处理中" value="processing" />
          <el-option label="已办结" value="resolved" />
        </el-select>
        <el-select v-model="filters.seaArea" placeholder="海域" clearable style="width: 160px">
          <el-option v-for="a in seaAreaOptions" :key="a" :label="a" :value="a" />
        </el-select>
        <el-button @click="resetFilters">重置</el-button>
      </div>

      <el-table :data="eventsViewFiltered" stripe>
        <el-table-column prop="id" label="编号" width="80" />
        <el-table-column prop="title" label="事件标题" min-width="160" />
        <el-table-column prop="category" label="类型" width="100" />
        <el-table-column prop="seaArea" label="海域" min-width="120" />
        <el-table-column prop="level" label="等级" width="80">
          <template #default="{ row }">
            <el-tag :type="levelType(row.level)">{{ levelLabel(row.level) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="source" label="来源" width="100" />
        <el-table-column prop="responsiblePerson" label="责任人" width="100">
          <template #default="{ row }">
            {{ row.responsiblePerson || '—' }}
          </template>
        </el-table-column>
        <el-table-column prop="disposalNote" label="处置说明" min-width="160">
          <template #default="{ row }">
            {{ row.disposalNote || '—' }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="occurredAt" label="发生时间" width="150" />
        <el-table-column prop="resolvedAt" label="办结时间" width="150">
          <template #default="{ row }">
            {{ row.resolvedAt || '—' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'reported'"
              type="warning"
              size="small"
              @click="openDisposalDialog(row, 'processing')"
            >
              处理
            </el-button>
            <el-button
              v-if="row.status === 'processing'"
              type="success"
              size="small"
              @click="openDisposalDialog(row, 'resolved')"
            >
              办结
            </el-button>
            <el-button
              type="info"
              size="small"
              plain
              @click="openAuditDialog(row)"
            >
              审计
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="event-sidebar">
      <SeaAreaRiskRank />
    </div>

    <el-dialog v-model="dialogVisible" title="上报事件" width="460px">
      <el-form :model="form" label-width="86px">
        <el-form-item label="标题"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="类型"><el-input v-model="form.category" /></el-form-item>
        <el-form-item label="海域"><el-input v-model="form.seaArea" /></el-form-item>
        <el-form-item label="等级">
          <el-select v-model="form.level">
            <el-option label="低" value="low" />
            <el-option label="中" value="medium" />
            <el-option label="高" value="high" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="form.source">
            <el-option label="人工上报" value="人工上报" />
            <el-option label="自动监测" value="自动监测" />
            <el-option label="AIS 雷达" value="AIS 雷达" />
            <el-option label="设备心跳" value="设备心跳" />
            <el-option label="群众举报" value="群众举报" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="disposalDialogVisible" :title="disposalDialogTitle" width="480px">
      <el-form :model="disposalForm" label-width="86px">
        <el-form-item label="事件海域">
          <el-tag type="success" effect="light">{{ disposalTargetEvent?.seaArea || '—' }}</el-tag>
          <span class="sea-area-hint">（责任人按所属海域过滤）</span>
        </el-form-item>
        <el-form-item label="责任人" required>
          <el-select
            v-model="disposalForm.responsiblePerson"
            placeholder="请选择责任人"
            filterable
            v-loading="loadingResponsibleUsers"
            style="width: 100%"
          >
            <el-option
              v-for="u in responsibleUserOptions"
              :key="u.id"
              :label="u.name"
              :value="u.name"
            >
              <span style="float: left">{{ u.name }}</span>
              <span style="float: right; color: #8492a6; font-size: 12px">
                {{ u.position || u.role }}
              </span>
            </el-option>
          </el-select>
          <div v-if="responsibleUserOptions.length === 0 && !loadingResponsibleUsers" class="no-responsible-tip">
            <el-icon color="#e6a23c"><WarningFilled /></el-icon>
            该海域暂无匹配的责任人
          </div>
          <div v-else-if="responsiblePersonCleared && !disposalForm.responsiblePerson" class="no-responsible-tip">
            <el-icon color="#e6a23c"><WarningFilled /></el-icon>
            原责任人不在该海域负责范围内，已清空，请重新选择
          </div>
        </el-form-item>
        <el-form-item label="处置说明" :required="disposalTargetStatus === 'resolved'">
          <el-input
            v-model="disposalForm.disposalNote"
            type="textarea"
            :rows="3"
            placeholder="请输入处置说明"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="disposalDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitDisposal">确认</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="auditDialogVisible" title="状态变更审计" width="640px">
      <div v-if="auditRecords.length === 0" class="audit-empty">暂无状态变更记录</div>
      <el-timeline v-else>
        <el-timeline-item
          v-for="record in auditRecords"
          :key="record.id"
          :timestamp="record.operatedAt"
          placement="top"
          :type="auditTimelineType(record.toStatus)"
        >
          <div class="audit-card">
            <div class="audit-status-change">
              <el-tag size="small" :type="statusType(record.fromStatus)">{{ statusLabel(record.fromStatus) }}</el-tag>
              <span class="audit-arrow">→</span>
              <el-tag size="small" :type="statusType(record.toStatus)">{{ statusLabel(record.toStatus) }}</el-tag>
            </div>
            <div class="audit-meta">
              <span>操作人：<strong>{{ record.operator }}</strong></span>
              <el-tag size="small" type="info" style="margin-left: 8px">{{ record.operatorRole }}</el-tag>
            </div>
            <div v-if="record.remark" class="audit-remark">{{ record.remark }}</div>
          </div>
        </el-timeline-item>
      </el-timeline>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { ElMessage } from "element-plus";
import { WarningFilled } from "@element-plus/icons-vue";
import { createEvent, fetchEventAudit, fetchEvents, fetchUsers, updateEventStatus } from "../services/api";
import SeaAreaRiskRank from "../components/SeaAreaRiskRank.vue";

const route = useRoute();

interface EventRecord {
  id: number;
  title: string;
  category: string;
  seaArea: string;
  level: string;
  status: string;
  reporter: string;
  assignee: string;
  source: string;
  disposalNote: string;
  responsiblePerson: string;
  occurredAt: string;
  resolvedAt?: string;
}

interface EventStatusAuditRecord {
  id: number;
  eventId: number;
  fromStatus: string;
  toStatus: string;
  operator: string;
  operatorRole: string;
  operatedAt: string;
  remark: string;
}

const events = ref<EventRecord[]>([]);
const dialogVisible = ref(false);
const form = reactive({
  title: "",
  category: "污染预警",
  seaArea: "",
  level: "medium",
  source: "人工上报"
});

const routeStatus = computed(() => {
  const status = route.query.status as string | undefined;
  if (status === "open") return "open";
  if (status === "reported") return "reported";
  if (status === "processing") return "processing";
  if (status === "resolved") return "resolved";
  return "";
});

const filters = reactive({
  category: "",
  level: "",
  status: routeStatus.value,
  seaArea: ""
});

const eventsViewFiltered = computed(() => {
  if (filters.status === "open") {
    return events.value.filter((e) => e.status === "reported" || e.status === "processing");
  }
  if (filters.status) {
    return events.value.filter((e) => e.status === filters.status);
  }
  return events.value;
});

watch(
  () => route.query.status,
  (newStatus) => {
    filters.status = routeStatus.value;
  },
  { immediate: true }
);

const categoryOptions = [
  "违法排放",
  "异常船舶",
  "设备告警",
  "污染预警",
  "溢油事故",
  "赤潮预警"
];

const seaAreaOptions = [
  "东港近岸海域",
  "蓝湾工业岸线",
  "南礁保护区",
  "北湾养殖区",
  "西渡航运通道",
  "中央岛礁海域",
  "南湾排污区",
  "东洲浅滩海域"
];

function buildFilterParams(): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.category) params.category = filters.category;
  if (filters.level) params.level = filters.level;
  if (filters.status && filters.status !== "open") params.status = filters.status;
  if (filters.seaArea) params.seaArea = filters.seaArea;
  return params;
}

function resetFilters() {
  filters.category = "";
  filters.level = "";
  filters.status = "";
  filters.seaArea = "";
}

const disposalDialogVisible = ref(false);
const disposalTargetStatus = ref<"processing" | "resolved">("processing");
const disposalTargetEvent = ref<EventRecord | null>(null);
const disposalForm = reactive({
  responsiblePerson: "",
  disposalNote: ""
});
const responsibleUserOptions = ref<any[]>([]);
const loadingResponsibleUsers = ref(false);
const responsiblePersonCleared = ref(false);

function isValidResponsiblePerson(name: string): boolean {
  if (!name) return true;
  return responsibleUserOptions.value.some((u) => u.name === name);
}

async function loadResponsibleUsers(seaArea: string) {
  loadingResponsibleUsers.value = true;
  responsiblePersonCleared.value = false;
  try {
    const users = await fetchUsers({ seaArea });
    responsibleUserOptions.value = users;
    const current = disposalForm.responsiblePerson;
    if (current && !isValidResponsiblePerson(current)) {
      disposalForm.responsiblePerson = "";
      responsiblePersonCleared.value = true;
      ElMessage.warning({
        message: `责任人「${current}」不在「${seaArea}」的负责范围内，已自动清空，请重新选择`,
        showClose: true,
        duration: 3500
      });
    }
  } catch {
    responsibleUserOptions.value = [];
  } finally {
    loadingResponsibleUsers.value = false;
  }
}

function levelLabel(level: string) {
  return { low: "低", medium: "中", high: "高" }[level] ?? level;
}

function levelType(level: string) {
  return level === "high" ? "danger" : level === "medium" ? "warning" : "info";
}

function statusLabel(status: string) {
  return { reported: "已上报", processing: "处理中", resolved: "已办结" }[status] ?? status;
}

function statusType(status: string) {
  return status === "resolved" ? "success" : status === "processing" ? "warning" : "info";
}

const disposalDialogTitle = ref("");
async function openDisposalDialog(event: EventRecord, targetStatus: "processing" | "resolved") {
  disposalTargetEvent.value = event;
  disposalTargetStatus.value = targetStatus;
  disposalDialogTitle.value = targetStatus === "processing" ? "开始处理" : "事件办结";
  disposalForm.responsiblePerson = event.responsiblePerson || "";
  disposalForm.disposalNote = event.disposalNote || "";
  disposalDialogVisible.value = true;
  if (event.seaArea) {
    await loadResponsibleUsers(event.seaArea);
  }
}

async function loadEvents() {
  events.value = await fetchEvents(buildFilterParams());
}

watch(filters, () => {
  loadEvents();
}, { deep: true });

async function submit() {
  await createEvent({ ...form, reporter: "人工上报" });
  ElMessage.success("事件已上报");
  dialogVisible.value = false;
  await loadEvents();
}

async function submitDisposal() {
  if (!disposalForm.responsiblePerson.trim()) {
    ElMessage.warning("请选择责任人");
    return;
  }
  if (!isValidResponsiblePerson(disposalForm.responsiblePerson)) {
    ElMessage.warning("责任人不在该海域负责范围内，请重新选择");
    return;
  }
  if (disposalTargetStatus.value === "resolved" && !disposalForm.disposalNote.trim()) {
    ElMessage.warning("办结时必须填写处置说明");
    return;
  }

  const payload: Record<string, unknown> = {
    status: disposalTargetStatus.value,
    responsiblePerson: disposalForm.responsiblePerson
  };
  if (disposalForm.disposalNote.trim()) {
    payload.disposalNote = disposalForm.disposalNote;
  }

  try {
    await updateEventStatus(disposalTargetEvent.value!.id, payload);
    ElMessage.success("状态已更新");
    disposalDialogVisible.value = false;
    await loadEvents();
  } catch (err: unknown) {
    const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "更新失败";
    ElMessage.error(message);
  }
}

const auditDialogVisible = ref(false);
const auditRecords = ref<EventStatusAuditRecord[]>([]);

function auditTimelineType(toStatus: string) {
  return toStatus === "resolved" ? "success" : toStatus === "processing" ? "warning" : "primary";
}

async function openAuditDialog(event: EventRecord) {
  try {
    auditRecords.value = await fetchEventAudit(event.id);
    auditDialogVisible.value = true;
  } catch {
    ElMessage.error("获取审计记录失败");
  }
}

onMounted(loadEvents);
</script>

<style scoped>
.event-view {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 16px;
}

.event-main {
  min-width: 0;
}

.event-sidebar {
  min-width: 0;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.text-muted {
  color: #909399;
  font-size: 13px;
}

.audit-empty {
  text-align: center;
  color: #909399;
  padding: 32px 0;
}

.audit-card {
  padding: 4px 0;
}

.audit-status-change {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.audit-arrow {
  color: #909399;
  font-size: 16px;
}

.audit-meta {
  color: #606266;
  font-size: 13px;
  margin-bottom: 4px;
}

.audit-remark {
  color: #909399;
  font-size: 13px;
  margin-top: 2px;
}

.no-responsible-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 12px;
  color: #e6a23c;
}

.sea-area-hint {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
}

@media (max-width: 1200px) {
  .event-view {
    grid-template-columns: 1fr;
  }
}
</style>
