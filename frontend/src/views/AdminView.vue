<template>
  <section class="content-grid">
    <div class="panel">
      <h2 class="panel-title">用户与权限</h2>
      <el-table v-loading="usersLoading" :data="users">
        <el-table-column prop="username" label="用户名" />
        <el-table-column prop="name" label="姓名" />
        <el-table-column prop="role" label="角色">
          <template #default="{ row }">
            <el-tag :type="roleTagType(row.role)">{{ roleLabel(row.role) }}</el-tag>
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
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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
import { fetchAlertRules, fetchUsers, toggleAlertRule } from "../services/api";

const users = ref<any[]>([]);
const rules = ref<any[]>([]);
const usersLoading = ref(false);
const rulesLoading = ref(false);

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

onMounted(async () => {
  usersLoading.value = true;
  rulesLoading.value = true;
  try {
    const [userData, ruleData] = await Promise.all([fetchUsers(), fetchAlertRules()]);
    users.value = userData;
    rules.value = ruleData.map((r: any) => ({ ...r, _loading: false }));
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
</style>
