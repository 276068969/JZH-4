<template>
  <section class="content-grid">
    <div class="panel">
      <h2 class="panel-title">用户与权限</h2>
      <el-table :data="users">
        <el-table-column prop="username" label="用户名" />
        <el-table-column prop="name" label="姓名" />
        <el-table-column prop="role" label="角色">
          <template #default="{ row }">
            <el-tag>{{ roleLabel(row.role) }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <div class="panel">
      <h2 class="panel-title">告警规则</h2>
      <el-table :data="rules">
        <el-table-column prop="name" label="规则" min-width="150" />
        <el-table-column prop="target" label="对象" width="90" />
        <el-table-column prop="level" label="等级" width="90" />
        <el-table-column prop="enabled" label="启用" width="80">
          <template #default="{ row }">
            <el-switch
              v-model="row.enabled"
              :loading="row._loading"
              @change="onRuleToggle(row)"
            />
          </template>
        </el-table-column>
      </el-table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { fetchAlertRules, fetchUsers, toggleAlertRule } from "../services/api";

const users = ref([]);
const rules = ref<any[]>([]);

function roleLabel(role: string) {
  return { admin: "管理员", supervisor: "监管人员", user: "普通用户" }[role] ?? role;
}

async function onRuleToggle(row: any) {
  row._loading = true;
  try {
    const updated = await toggleAlertRule(row.id);
    row.enabled = updated.enabled;
    ElMessage.success(`规则已${updated.enabled ? "启用" : "停用"}，监管大屏数据将同步更新`);
  } catch (err: unknown) {
    row.enabled = !row.enabled;
    const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "操作失败";
    ElMessage.error(message);
  } finally {
    row._loading = false;
  }
}

onMounted(async () => {
  const [userData, ruleData] = await Promise.all([fetchUsers(), fetchAlertRules()]);
  users.value = userData;
  rules.value = ruleData.map((r: any) => ({ ...r, _loading: false }));
});
</script>
