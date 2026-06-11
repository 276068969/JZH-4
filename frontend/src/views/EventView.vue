<template>
  <section class="panel">
    <h2 class="panel-title">
      事件监管
      <el-button type="primary" @click="dialogVisible = true">上报事件</el-button>
    </h2>
    <el-table :data="events" stripe>
      <el-table-column prop="id" label="编号" width="90" />
      <el-table-column prop="title" label="事件标题" min-width="190" />
      <el-table-column prop="category" label="类型" width="110" />
      <el-table-column prop="seaArea" label="海域" min-width="140" />
      <el-table-column prop="level" label="等级" width="90">
        <template #default="{ row }">
          <el-tag :type="levelType(row.level)">{{ levelLabel(row.level) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="120">
        <template #default="{ row }">
          <el-select v-model="row.status" size="small" @change="(value: string) => changeStatus(row.id, value)">
            <el-option label="已上报" value="reported" />
            <el-option label="处理中" value="processing" />
            <el-option label="已办结" value="resolved" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column prop="occurredAt" label="发生时间" width="160" />
    </el-table>

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
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">提交</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { createEvent, fetchEvents, updateEventStatus } from "../services/api";

interface EventRecord {
  id: number;
  title: string;
  category: string;
  seaArea: string;
  level: string;
  status: string;
  occurredAt: string;
}

const events = ref<EventRecord[]>([]);
const dialogVisible = ref(false);
const form = reactive({
  title: "",
  category: "污染预警",
  seaArea: "",
  level: "medium"
});

function levelLabel(level: string) {
  return { low: "低", medium: "中", high: "高" }[level] ?? level;
}

function levelType(level: string) {
  return level === "high" ? "danger" : level === "medium" ? "warning" : "info";
}

async function loadEvents() {
  events.value = await fetchEvents();
}

async function submit() {
  await createEvent({ ...form, reporter: "人工上报" });
  ElMessage.success("事件已上报");
  dialogVisible.value = false;
  await loadEvents();
}

async function changeStatus(id: number, status: string) {
  await updateEventStatus(id, status);
  ElMessage.success("状态已更新");
}

onMounted(loadEvents);
</script>
