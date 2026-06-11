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
            <el-switch v-model="row.enabled" />
          </template>
        </el-table-column>
      </el-table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchAlertRules, fetchUsers } from "../services/api";

const users = ref([]);
const rules = ref([]);

function roleLabel(role: string) {
  return { admin: "管理员", supervisor: "监管人员", user: "普通用户" }[role] ?? role;
}

onMounted(async () => {
  const [userData, ruleData] = await Promise.all([fetchUsers(), fetchAlertRules()]);
  users.value = userData;
  rules.value = ruleData;
});
</script>
