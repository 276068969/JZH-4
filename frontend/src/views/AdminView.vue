<template>
  <section class="content-grid">
    <div class="panel">
      <h2 class="panel-title">用户与权限</h2>
      <el-table v-loading="usersLoading" :data="users">
        <el-table-column prop="username" label="用户名" width="110" />
        <el-table-column prop="name" label="姓名" width="100" />
        <el-table-column prop="position" label="职位" width="140" />
        <el-table-column prop="role" label="角色" width="100">
          <template #default="{ row }">
            <el-tag :type="roleTagType(row.role)">{{ roleLabel(row.role) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="责任海域" min-width="200">
          <template #default="{ row }">
            <div class="sea-area-tags">
              <el-tag
                v-for="area in row.responsibleSeaAreas"
                :key="area"
                size="small"
                type="success"
                effect="light"
                style="margin-right: 4px; margin-bottom: 2px"
              >
                {{ area }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" link @click="openUserEditDialog(row)">
              编辑
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <div class="panel">
      <h2 class="panel-title">
        告警规则
        <span class="panel-subtitle">
          共 {{ rules.length }} 条，启用 {{ enabledCount }} 条
        </span>
      </h2>
      <el-table
        v-loading="rulesLoading"
        :data="rules"
        stripe
        style="width: 100%"
        empty-text="暂无告警规则"
      >
        <template #empty>
          <el-empty description="暂无告警规则" :image-size="80">
            <template #image>
              <el-icon :size="60" color="#dcdfe6">
                <Bell />
              </el-icon>
            </template>
          </el-empty>
        </template>
        <el-table-column prop="name" label="规则名称" min-width="160">
          <template #default="{ row }">
            <div class="rule-name-cell">
              <el-icon :size="18" :color="levelIconColor(row.level)" class="rule-icon">
                <BellFilled v-if="row.level === 'high'" />
                <WarningFilled v-else-if="row.level === 'medium'" />
                <InfoFilled v-else />
              </el-icon>
              <span class="rule-name-text">{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="目标对象" width="120">
          <template #default="{ row }">
            <el-tag :type="targetTagType(row.target)" effect="light" round>
              <el-icon class="target-icon"><component :is="targetIcon(row.target)" /></el-icon>
              <span>{{ targetLabel(row.target) }}</span>
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="condition" label="触发条件" min-width="220">
          <template #default="{ row }">
            <div class="condition-cell">
              <el-icon color="#909399" :size="14"><Setting /></el-icon>
              <code class="condition-text">{{ row.condition || '—' }}</code>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="风险等级" width="110">
          <template #default="{ row }">
            <el-tag :type="levelTagType(row.level)" effect="dark" round>
              <el-icon :size="12"><component :is="levelIcon(row.level)" /></el-icon>
              <span style="margin-left: 4px">{{ levelLabel(row.level) }}</span>
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="启用状态" width="130">
          <template #default="{ row }">
            <div class="status-cell">
              <el-switch
                v-model="row.enabled"
                :loading="row._loading"
                :active-text="row.enabled ? '已启用' : '已停用'"
                inline-prompt
                @change="onRuleToggle(row)"
              />
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <el-dialog v-model="userEditDialogVisible" title="编辑用户" width="520px">
      <el-form :model="userEditForm" label-width="90px">
        <el-form-item label="用户名">
          <el-input v-model="editingUser.username" disabled />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="userEditForm.name" />
        </el-form-item>
        <el-form-item label="职位">
          <el-input v-model="userEditForm.position" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="userEditForm.role" style="width: 100%">
            <el-option label="管理员" value="admin" />
            <el-option label="监管人员" value="supervisor" />
            <el-option label="普通用户" value="user" />
          </el-select>
        </el-form-item>
        <el-form-item label="责任海域">
          <el-select
            v-model="userEditForm.responsibleSeaAreas"
            multiple
            filterable
            placeholder="请选择责任海域"
            style="width: 100%"
          >
            <el-option
              v-for="option in seaAreaOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="数据范围">
          <el-input v-model="userEditForm.dataScope" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userEditDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="userEditSaving" @click="submitUserEdit">
          保存
        </el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  Bell,
  BellFilled,
  WarningFilled,
  InfoFilled,
  Setting,
  Watermelon,
  Monitor,
  Sunny,
  QuestionFilled,
  CircleCheckFilled,
  CircleCloseFilled
} from "@element-plus/icons-vue";
import { fetchAlertRules, fetchSeaAreas, fetchUsers, toggleAlertRule, updateUser } from "../services/api";

const users = ref<any[]>([]);
const rules = ref<any[]>([]);
const seaAreas = ref<any[]>([]);
const usersLoading = ref(false);
const rulesLoading = ref(false);

const userEditDialogVisible = ref(false);
const editingUser = ref<any>(null);
const userEditForm = reactive({
  name: "",
  role: "",
  position: "",
  responsibleSeaAreas: [] as string[],
  dataScope: ""
});
const userEditSaving = ref(false);

const seaAreaOptions = computed(() => {
  const baseOptions = seaAreas.value.map((a: any) => ({ label: a.name, value: a.name }));
  return [{ label: "全部海域", value: "全部海域" }, ...baseOptions];
});

const enabledCount = computed(() => rules.value.filter((r) => r.enabled).length);

function roleLabel(role: string) {
  return { admin: "管理员", supervisor: "监管人员", user: "普通用户" }[role] ?? role;
}

function roleTagType(role: string) {
  return { admin: "danger", supervisor: "warning", user: "info" }[role] ?? "info";
}

function targetLabel(target: string) {
  return { 水质: "水质监测", 设备: "设备状态", 气象: "气象数据" }[target] ?? target;
}

function targetTagType(target: string) {
  return { 水质: "success", 设备: "warning", 气象: "primary" }[target] ?? "info";
}

function targetIcon(target: string) {
  return { 水质: Watermelon, 设备: Monitor, 气象: Sunny }[target] ?? QuestionFilled;
}

function levelLabel(level: string) {
  return { high: "高危", medium: "中危", low: "低危" }[level] ?? level;
}

function levelTagType(level: string) {
  return { high: "danger", medium: "warning", low: "info" }[level] ?? "info";
}

function levelIcon(level: string) {
  return { high: BellFilled, medium: WarningFilled, low: InfoFilled }[level] ?? InfoFilled;
}

function levelIconColor(level: string) {
  return { high: "#f56c6c", medium: "#e6a23c", low: "#909399" }[level] ?? "#909399";
}

function notifyRulesChanged() {
  const key = "ocean_alert_rules_changed";
  localStorage.setItem(key, String(Date.now()));
  localStorage.removeItem(key);
}

async function onRuleToggle(row: any) {
  const originalEnabled = row.enabled;
  try {
    await ElMessageBox.confirm(
      `确定要${row.enabled ? "启用" : "停用"}「${row.name}」吗？${row.enabled ? "启用后将自动触发告警评估。" : "停用后该规则不再产生告警。"}`,
      "操作确认",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: row.enabled ? "warning" : "info",
        confirmButtonClass: row.enabled ? "el-button--warning" : "el-button--primary"
      }
    );
  } catch {
    row.enabled = originalEnabled;
    return;
  }

  row._loading = true;
  try {
    const updated = await toggleAlertRule(row.id);
    row.enabled = updated.enabled;
    notifyRulesChanged();
    ElMessage.success({
      message: `规则已${updated.enabled ? "启用" : "停用"}，监管大屏数据将同步更新`,
      showClose: true,
      duration: 3000
    });
  } catch (err: unknown) {
    row.enabled = originalEnabled;
    const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "操作失败";
    ElMessage.error({
      message,
      showClose: true,
      duration: 4000
    });
  } finally {
    row._loading = false;
  }
}

function openUserEditDialog(row: any) {
  editingUser.value = row;
  userEditForm.name = row.name;
  userEditForm.role = row.role;
  userEditForm.position = row.position;
  userEditForm.responsibleSeaAreas = [...(row.responsibleSeaAreas || [])];
  userEditForm.dataScope = row.dataScope || "";
  userEditDialogVisible.value = true;
}

async function submitUserEdit() {
  if (!editingUser.value) return;
  userEditSaving.value = true;
  try {
    const updated = await updateUser(editingUser.value.id, {
      name: userEditForm.name,
      role: userEditForm.role,
      position: userEditForm.position,
      responsibleSeaAreas: userEditForm.responsibleSeaAreas,
      dataScope: userEditForm.dataScope
    });
    const idx = users.value.findIndex((u) => u.id === updated.id);
    if (idx !== -1) {
      users.value[idx] = { ...users.value[idx], ...updated };
    }
    userEditDialogVisible.value = false;
    ElMessage.success("用户信息已更新");
  } catch (err: unknown) {
    const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "保存失败";
    ElMessage.error(message);
  } finally {
    userEditSaving.value = false;
  }
}

async function loadSeaAreas() {
  try {
    seaAreas.value = await fetchSeaAreas();
  } catch {
    /* ignore */
  }
}

onMounted(async () => {
  usersLoading.value = true;
  rulesLoading.value = true;
  try {
    const [userData, ruleData] = await Promise.all([fetchUsers(), fetchAlertRules()]);
    users.value = userData;
    rules.value = ruleData.map((r: any) => ({ ...r, _loading: false }));
    loadSeaAreas();
  } catch (err: unknown) {
    const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "加载数据失败";
    ElMessage.error(message);
  } finally {
    usersLoading.value = false;
    rulesLoading.value = false;
  }
});
</script>

<style scoped>
.panel-subtitle {
  font-size: 13px;
  font-weight: normal;
  color: #909399;
  margin-left: 12px;
}

.rule-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rule-icon {
  flex-shrink: 0;
}

.rule-name-text {
  font-weight: 500;
  color: #303133;
}

.target-icon {
  margin-right: 4px;
  font-size: 13px;
}

.condition-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.condition-text {
  font-family: "SF Mono", "Monaco", "Inconsolata", "Fira Mono", "Droid Sans Mono", monospace;
  font-size: 13px;
  color: #606266;
  background: #f5f7fa;
  padding: 2px 8px;
  border-radius: 4px;
  line-height: 1.6;
}

.status-cell {
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-text {
  font-size: 13px;
  margin-left: 8px;
}

.status-enabled {
  color: #67c23a;
}

.status-disabled {
  color: #909399;
}

.sea-area-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}
</style>
