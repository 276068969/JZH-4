<template>
  <el-container class="page">
    <el-aside width="236px" class="sidebar">
      <div class="brand">海洋监管平台</div>
      <el-menu router :default-active="$route.path" background-color="#12394f" text-color="#d7e8ef" active-text-color="#ffffff">
        <el-menu-item index="/dashboard">监管大屏</el-menu-item>
        <el-menu-item index="/sea-areas">海域基础信息</el-menu-item>
        <el-menu-item index="/events">事件监管</el-menu-item>
        <el-menu-item index="/admin">后台管理</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="topbar">
        <span>{{ auth.user?.name }} · {{ roleLabel }}</span>
        <el-button @click="logout">退出</el-button>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const auth = useAuthStore();
const roleLabel = computed(() => {
  const map = { admin: "管理员", supervisor: "监管人员", user: "普通用户" };
  return auth.user ? map[auth.user.role] : "";
});

async function logout() {
  auth.signOut();
  await router.push("/login");
}
</script>

<style scoped>
.sidebar {
  min-height: 100vh;
  background: #12394f;
}

.brand {
  height: 64px;
  padding: 20px;
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  background: #fff;
  border-bottom: 1px solid #dde8ee;
}

@media (max-width: 760px) {
  .sidebar {
    display: none;
  }
}
</style>
