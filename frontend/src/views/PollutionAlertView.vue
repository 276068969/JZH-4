<template>
  <section class="panel">
    <h2 class="panel-title">污染预警上报</h2>
    <p class="panel-desc">监管人员填写污染预警信息，提交后将自动生成事件记录并同步至「事件监管」继续处置。</p>

    <el-card class="form-card" shadow="never">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px" label-position="right">
        <el-form-item label="污染类型" prop="pollutionType">
          <el-select v-model="form.pollutionType" placeholder="请选择污染类型" style="width: 100%; max-width: 360px">
            <el-option label="废水排放" value="废水排放" />
            <el-option label="原油泄漏" value="原油泄漏" />
            <el-option label="赤潮" value="赤潮" />
            <el-option label="危险化学品" value="危险化学品" />
            <el-option label="垃圾倾倒" value="垃圾倾倒" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>

        <el-form-item label="疑似来源" prop="suspectedSource">
          <el-input
            v-model="form.suspectedSource"
            placeholder="例如：附近工业企业、过往油轮、养殖尾水等"
            style="width: 100%; max-width: 520px"
          />
        </el-form-item>

        <el-form-item label="影响海域" prop="seaArea">
          <el-select v-model="form.seaArea" placeholder="请选择影响海域" style="width: 100%; max-width: 360px">
            <el-option v-for="s in seaAreaOptions" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>

        <el-form-item label="风险等级" prop="level">
          <el-radio-group v-model="form.level">
            <el-radio value="low" border>
              <span style="color: #409eff">低</span>
            </el-radio>
            <el-radio value="medium" border>
              <span style="color: #e6a23c">中</span>
            </el-radio>
            <el-radio value="high" border>
              <span style="color: #f56c6c">高</span>
            </el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="现场描述" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="6"
            placeholder="请详细描述污染现场情况，包括：发现时间、具体位置、污染范围、影响程度等..."
            maxlength="2000"
            show-word-limit
            style="width: 100%; max-width: 640px"
          />
        </el-form-item>

        <el-form-item label="上报人" prop="reporter">
          <el-input v-model="form.reporter" disabled style="width: 100%; max-width: 360px" />
        </el-form-item>

        <el-form-item label="上报时间" prop="occurredAt">
          <el-input v-model="form.occurredAt" disabled style="width: 100%; max-width: 360px" />
        </el-form-item>

        <el-form-item>
          <el-button @click="resetForm">重置</el-button>
          <el-button type="primary" :loading="submitting" @click="submit">提交预警</el-button>
          <el-button link type="primary" @click="goToEvents">前往事件监管 &rarr;</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-dialog v-model="successDialogVisible" title="上报成功" width="420px">
      <el-result icon="success" title="污染预警已上报" :sub-title="successMessage">
        <template #extra>
          <el-button type="primary" @click="goToEvents">立即处置</el-button>
          <el-button @click="successDialogVisible = false">继续上报</el-button>
        </template>
      </el-result>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, type FormInstance, type FormRules } from "element-plus";
import { useAuthStore } from "../stores/auth";
import { reportPollutionAlert } from "../services/api";

const router = useRouter();
const auth = useAuthStore();
const formRef = ref<FormInstance>();
const submitting = ref(false);
const successDialogVisible = ref(false);
const successMessage = ref("");

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

interface PollutionAlertForm {
  pollutionType: string;
  suspectedSource: string;
  seaArea: string;
  level: string;
  description: string;
  reporter: string;
  occurredAt: string;
}

const form = reactive<PollutionAlertForm>({
  pollutionType: "",
  suspectedSource: "",
  seaArea: "",
  level: "medium",
  description: "",
  reporter: "",
  occurredAt: ""
});

const rules: FormRules = {
  pollutionType: [{ required: true, message: "请选择污染类型", trigger: "change" }],
  suspectedSource: [
    { required: true, message: "请填写疑似来源", trigger: "blur" },
    { min: 2, message: "疑似来源至少 2 个字符", trigger: "blur" }
  ],
  seaArea: [{ required: true, message: "请选择影响海域", trigger: "change" }],
  level: [{ required: true, message: "请选择风险等级", trigger: "change" }],
  description: [
    { required: true, message: "请填写现场描述", trigger: "blur" },
    { min: 5, message: "现场描述至少 5 个字符", trigger: "blur" }
  ]
};

function getNow() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function resetForm() {
  formRef.value?.resetFields();
  form.level = "medium";
  form.reporter = auth.user?.name || auth.user?.username || "";
  form.occurredAt = getNow();
}

function goToEvents() {
  successDialogVisible.value = false;
  router.push("/events");
}

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    const result = await reportPollutionAlert({
      pollutionType: form.pollutionType,
      suspectedSource: form.suspectedSource,
      seaArea: form.seaArea,
      level: form.level,
      description: form.description
    });
    successMessage.value = `事件编号 #${result.eventId} 已同步至事件监管，等待处置`;
    successDialogVisible.value = true;
    resetForm();
  } catch (err: unknown) {
    const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "上报失败";
    ElMessage.error(message);
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  resetForm();
});
</script>

<style scoped>
.panel-desc {
  color: #606266;
  margin: 0 0 20px 0;
  font-size: 14px;
}

.form-card {
  max-width: 860px;
  border-radius: 8px;
}

.form-card :deep(.el-card__body) {
  padding: 32px 40px;
}
</style>
