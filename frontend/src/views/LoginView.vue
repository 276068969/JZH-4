<template>
  <main class="login-page">
    <section class="login-visual">
      <h1>海洋监管平台</h1>
      <p>面向海域、监测点、船舶、告警和事件处置的一体化监管工作台。</p>
    </section>
    <el-form class="login-form" :model="form" @submit.prevent="submit">
      <h2>账号登录</h2>
      <el-form-item>
        <el-input v-model="form.username" placeholder="用户名" />
      </el-form-item>
      <el-form-item>
        <el-input v-model="form.password" placeholder="密码" show-password type="password" />
      </el-form-item>
      <el-button :loading="loading" native-type="submit" type="primary">登录</el-button>
      <p class="hint">admin / admin123，supervisor / 123456，user / 123456</p>
    </el-form>
  </main>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const auth = useAuthStore();
const loading = ref(false);
const form = reactive({
  username: "admin",
  password: "admin123"
});

async function submit() {
  loading.value = true;
  try {
    await auth.signIn(form.username, form.password);
    await router.push("/dashboard");
  } catch {
    ElMessage.error("登录失败，请检查账号密码");
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  display: grid;
  grid-template-columns: 1.2fr 420px;
  min-height: 100vh;
  background: linear-gradient(135deg, rgba(8, 74, 106, 0.86), rgba(16, 117, 105, 0.72)),
    url("https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80");
  background-size: cover;
  background-position: center;
}

.login-visual {
  align-self: end;
  padding: 8vw;
  color: #fff;
}

.login-visual h1 {
  margin: 0;
  font-size: 54px;
}

.login-visual p {
  max-width: 560px;
  font-size: 18px;
  line-height: 1.8;
}

.login-form {
  align-self: center;
  margin-right: 8vw;
  padding: 28px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.68);
}

.login-form h2 {
  margin: 0 0 22px;
}

.login-form .el-button {
  width: 100%;
}

.hint {
  color: #607483;
  font-size: 13px;
}

@media (max-width: 860px) {
  .login-page {
    grid-template-columns: 1fr;
    padding: 24px;
  }

  .login-visual {
    padding: 12vh 0 24px;
  }

  .login-visual h1 {
    font-size: 38px;
  }

  .login-form {
    margin: 0;
  }
}
</style>
