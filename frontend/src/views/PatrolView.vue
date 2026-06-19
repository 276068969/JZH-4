<template>
  <section class="panel">
    <h2 class="panel-title">
      海域巡查记录
      <el-button type="primary" @click="openCreateDialog">登记巡查</el-button>
    </h2>
    <p class="panel-desc">
      记录巡查海域、巡查人员、发现问题与现场结论，发现问题可一键上报为事件，形成从日常巡查到事件上报的业务链路。
    </p>

    <div class="filter-bar">
      <el-select v-model="filters.seaArea" placeholder="巡查海域" clearable style="width: 160px">
        <el-option v-for="a in seaAreaOptions" :key="a" :label="a" :value="a" />
      </el-select>
      <el-select v-model="filters.inspector" placeholder="巡查人员" clearable filterable style="width: 140px">
        <el-option v-for="i in inspectorOptions" :key="i" :label="i" :value="i" />
      </el-select>
      <el-select v-model="filters.status" placeholder="状态" clearable style="width: 120px">
        <el-option label="已登记" value="recorded" />
        <el-option label="已上报" value="escalated" />
      </el-select>
      <el-select v-model="filters.hasProblem" placeholder="问题筛选" clearable style="width: 140px">
        <el-option label="发现问题" value="true" />
        <el-option label="无问题" value="false" />
      </el-select>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <el-table :data="patrols" stripe v-loading="loading">
      <el-table-column prop="id" label="编号" width="80" />
      <el-table-column prop="seaArea" label="巡查海域" min-width="130" />
      <el-table-column prop="inspector" label="巡查人员" width="110">
        <template #default="{ row }">
          {{ row.inspector }}
          <el-tag size="small" type="info" style="margin-left: 6px">{{ roleLabel(row.inspectorRole) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="patrolTime" label="巡查时间" width="150" />
      <el-table-column label="发现问题" min-width="220">
        <template #default="{ row }">
          <span v-if="row.problemsFound" class="problem-text">{{ row.problemsFound }}</span>
          <span v-else class="text-muted">未发现问题</span>
        </template>
      </el-table-column>
      <el-table-column label="现场结论" min-width="180">
        <template #default="{ row }">
          {{ row.onSiteConclusion || '—' }}
        </template>
      </el-table-column>
      <el-table-column label="关联事件" width="110">
        <template #default="{ row }">
          <el-tag v-if="row.relatedEventId" size="small" type="warning">#{{ row.relatedEventId }}</el-tag>
          <span v-else class="text-muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'escalated' ? 'success' : 'info'">
            {{ row.status === 'escalated' ? '已上报' : '已登记' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button type="info" size="small" plain @click="openDetailDialog(row)">详情</el-button>
          <el-button
            v-if="row.status !== 'escalated' && row.problemsFound"
            type="warning"
            size="small"
            @click="openEscalateDialog(row)"
          >
            上报事件
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="createDialogVisible" title="登记巡查记录" width="560px">
      <el-form :model="form" :rules="formRules" ref="formRef" label-width="100px">
        <el-form-item label="巡查海域" prop="seaArea">
          <el-select v-model="form.seaArea" placeholder="请选择巡查海域" filterable style="width: 100%">
            <el-option v-for="a in seaAreaOptions" :key="a" :label="a" :value="a" />
          </el-select>
        </el-form-item>
        <el-form-item label="巡查人员" prop="inspector">
          <el-input v-model="form.inspector" placeholder="请输入巡查人员姓名" />
        </el-form-item>
        <el-form-item label="巡查时间" prop="patrolTime">
          <el-input v-model="form.patrolTime" placeholder="格式：2026-06-11 08:20" style="width: 100%" />
        </el-form-item>
        <el-form-item label="发现问题" prop="problemsFound">
          <el-input
            v-model="form.problemsFound"
            type="textarea"
            :rows="3"
            placeholder="若发现问题请详细描述，未发现问题可留空"
          />
        </el-form-item>
        <el-form-item label="现场结论" prop="onSiteConclusion">
          <el-input
            v-model="form.onSiteConclusion"
            type="textarea"
            :rows="3"
            placeholder="请填写现场处置结论或后续建议"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCreate">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailDialogVisible" title="巡查记录详情" width="640px">
      <template v-if="detailPatrol">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="编号">#{{ detailPatrol.id }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="detailPatrol.status === 'escalated' ? 'success' : 'info'">
              {{ detailPatrol.status === 'escalated' ? '已上报' : '已登记' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="巡查海域">{{ detailPatrol.seaArea }}</el-descriptions-item>
          <el-descriptions-item label="巡查人员">
            {{ detailPatrol.inspector }}
            <el-tag size="small" type="info" style="margin-left: 6px">{{ roleLabel(detailPatrol.inspectorRole) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="巡查时间">{{ detailPatrol.patrolTime }}</el-descriptions-item>
          <el-descriptions-item label="登记时间">{{ detailPatrol.createdAt }}</el-descriptions-item>
          <el-descriptions-item label="发现问题" :span="2">
            <span v-if="detailPatrol.problemsFound">{{ detailPatrol.problemsFound }}</span>
            <span v-else class="text-muted">未发现问题</span>
          </el-descriptions-item>
          <el-descriptions-item label="现场结论" :span="2">
            {{ detailPatrol.onSiteConclusion || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="关联事件" :span="2">
            <template v-if="detailRelatedEvent">
              <el-tag type="warning" style="margin-right: 8px">事件 #{{ detailRelatedEvent.id }}</el-tag>
              <span>{{ detailRelatedEvent.title }}</span>
              <el-button link type="primary" style="margin-left: 8px" @click="goToEvent(detailRelatedEvent.id)">
                前往处置 &rarr;
              </el-button>
            </template>
            <span v-else class="text-muted">暂无关联事件</span>
          </el-descriptions-item>
        </el-descriptions>
      </template>
    </el-dialog>

    <el-dialog v-model="escalateDialogVisible" title="上报为事件" width="500px">
      <p class="escalate-tip">将巡查发现的问题上报为事件，同步至「事件监管」继续处置。</p>
      <el-form :model="escalateForm" label-width="100px">
        <el-form-item label="事件标题">
          <el-input v-model="escalateForm.title" placeholder="留空将自动生成" />
        </el-form-item>
        <el-form-item label="事件类型">
          <el-select v-model="escalateForm.category" style="width: 100%">
            <el-option label="海域巡查" value="海域巡查" />
            <el-option label="违法排放" value="违法排放" />
            <el-option label="异常船舶" value="异常船舶" />
            <el-option label="污染预警" value="污染预警" />
            <el-option label="溢油事故" value="溢油事故" />
          </el-select>
        </el-form-item>
        <el-form-item label="事件等级">
          <el-radio-group v-model="escalateForm.level">
            <el-radio value="low" border><span style="color: #409eff">低</span></el-radio>
            <el-radio value="medium" border><span style="color: #e6a23c">中</span></el-radio>
            <el-radio value="high" border><span style="color: #f56c6c">高</span></el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="escalateDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitEscalate">确认上报</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, type FormInstance, type FormRules } from "element-plus";
import { useAuthStore } from "../stores/auth";
import { createPatrol, escalatePatrol, fetchPatrolDetail, fetchPatrols } from "../services/api";

const router = useRouter();
const auth = useAuthStore();

interface PatrolRecord {
  id: number;
  seaArea: string;
  inspector: string;
  inspectorRole: string;
  patrolTime: string;
  problemsFound: string;
  onSiteConclusion: string;
  relatedEventId: number | null;
  status: "recorded" | "escalated";
  createdAt: string;
}

interface EventRecord {
  id: number;
  title: string;
  category: string;
  seaArea: string;
  level: string;
  status: string;
  reporter: string;
  source: string;
}

const patrols = ref<PatrolRecord[]>([]);
const loading = ref(false);
const submitting = ref(false);

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

const inspectorOptions = computed(() => {
  const set = new Set<string>();
  patrols.value.forEach((p) => set.add(p.inspector));
  return Array.from(set);
});

const filters = reactive({
  seaArea: "",
  inspector: "",
  status: "",
  hasProblem: ""
});

function buildFilterParams(): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.seaArea) params.seaArea = filters.seaArea;
  if (filters.inspector) params.inspector = filters.inspector;
  if (filters.status) params.status = filters.status;
  if (filters.hasProblem) params.hasProblem = filters.hasProblem;
  return params;
}

function resetFilters() {
  filters.seaArea = "";
  filters.inspector = "";
  filters.status = "";
  filters.hasProblem = "";
}

function roleLabel(role: string) {
  const map: Record<string, string> = { admin: "管理员", supervisor: "监管人员", user: "普通用户" };
  return map[role] ?? role;
}

async function loadPatrols() {
  loading.value = true;
  try {
    patrols.value = await fetchPatrols(buildFilterParams());
  } catch {
    ElMessage.error("加载巡查记录失败");
  } finally {
    loading.value = false;
  }
}

watch(filters, () => {
  loadPatrols();
}, { deep: true });

const createDialogVisible = ref(false);
const formRef = ref<FormInstance>();
const form = reactive({
  seaArea: "",
  inspector: "",
  patrolTime: "",
  problemsFound: "",
  onSiteConclusion: ""
});

const formRules: FormRules = {
  seaArea: [{ required: true, message: "请选择巡查海域", trigger: "change" }],
  inspector: [{ required: true, message: "请填写巡查人员", trigger: "blur" }],
  patrolTime: [{ required: true, message: "请填写巡查时间", trigger: "blur" }]
};

function getNow() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openCreateDialog() {
  form.seaArea = "";
  form.inspector = auth.user?.name || auth.user?.username || "";
  form.patrolTime = getNow();
  form.problemsFound = "";
  form.onSiteConclusion = "";
  createDialogVisible.value = true;
}

async function submitCreate() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    await createPatrol({ ...form });
    ElMessage.success("巡查记录已登记");
    createDialogVisible.value = false;
    await loadPatrols();
  } catch (err: unknown) {
    const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "登记失败";
    ElMessage.error(message);
  } finally {
    submitting.value = false;
  }
}

const detailDialogVisible = ref(false);
const detailPatrol = ref<PatrolRecord | null>(null);
const detailRelatedEvent = ref<EventRecord | null>(null);

async function openDetailDialog(row: PatrolRecord) {
  detailPatrol.value = row;
  detailRelatedEvent.value = null;
  detailDialogVisible.value = true;
  try {
    const result = await fetchPatrolDetail(row.id);
    detailPatrol.value = result.patrol;
    detailRelatedEvent.value = result.relatedEvent;
  } catch {
    ElMessage.error("获取巡查详情失败");
  }
}

function goToEvent(id: number) {
  detailDialogVisible.value = false;
  router.push({ path: "/events", query: { status: "open" } });
  void id;
}

const escalateDialogVisible = ref(false);
const escalateTarget = ref<PatrolRecord | null>(null);
const escalateForm = reactive({
  title: "",
  category: "海域巡查",
  level: "medium"
});

function openEscalateDialog(row: PatrolRecord) {
  escalateTarget.value = row;
  escalateForm.title = "";
  escalateForm.category = "海域巡查";
  escalateForm.level = "medium";
  escalateDialogVisible.value = true;
}

async function submitEscalate() {
  if (!escalateTarget.value) return;
  submitting.value = true;
  try {
    const payload: Record<string, unknown> = {
      category: escalateForm.category,
      level: escalateForm.level
    };
    if (escalateForm.title.trim()) {
      payload.title = escalateForm.title.trim();
    }
    const result = await escalatePatrol(escalateTarget.value.id, payload);
    ElMessage.success(result.message || "已上报为事件");
    escalateDialogVisible.value = false;
    await loadPatrols();
  } catch (err: unknown) {
    const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "上报失败";
    ElMessage.error(message);
  } finally {
    submitting.value = false;
  }
}

onMounted(loadPatrols);
</script>

<style scoped>
.panel-desc {
  color: #606266;
  margin: 0 0 16px 0;
  font-size: 14px;
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

.problem-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.escalate-tip {
  color: #606266;
  font-size: 13px;
  margin: 0 0 16px 0;
}
</style>
