<template>
  <div class="ship-monitor">
    <el-row :gutter="16" class="stats-row">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-icon normal">
            <el-icon><Ship /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-label">船舶总数</div>
            <div class="stat-value">{{ summary?.totalShips || 0 }}</div>
            <div class="stat-sub">
              <span class="text-success">正常 {{ summary?.normalShips || 0 }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-icon warning">
            <el-icon><Warning /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-label">异常船舶</div>
            <div class="stat-value text-warning">{{ summary?.abnormalShips || 0 }}</div>
            <div class="stat-sub">
              <span class="text-warning">预警 {{ summary?.warningShips || 0 }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-icon danger">
            <el-icon><Lock /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-label">保护区闯入</div>
            <div class="stat-value text-danger">{{ summary?.activeIntrusions || 0 }}</div>
            <div class="stat-sub">
              <span class="text-danger">活跃 {{ summary?.activeIntrusions || 0 }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-icon info">
            <el-icon><Timer /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-label">超时停留</div>
            <div class="stat-value text-info">{{ summary?.overstayShips || 0 }}</div>
            <div class="stat-sub">
              <span class="text-info">停留中 {{ summary?.stayingShips || 0 }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-tabs v-model="activeTab" class="main-tabs">
      <el-tab-pane label="船舶列表" name="ships">
        <div class="filter-bar">
          <el-input
            v-model="filters.keyword"
            placeholder="搜索船名/MMSI/类型"
            clearable
            style="width: 240px"
            @input="loadShips"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select v-model="filters.status" placeholder="船舶状态" clearable style="width: 140px" @change="loadShips">
            <el-option label="正常" value="normal" />
            <el-option label="预警" value="warning" />
            <el-option label="异常" value="abnormal" />
          </el-select>
          <el-select v-model="filters.seaArea" placeholder="所属海域" clearable style="width: 160px" @change="loadShips">
            <el-option
              v-for="area in seaAreas"
              :key="area"
              :label="area"
              :value="area"
            />
          </el-select>
          <el-button type="primary" @click="openPositionDialog">
            <el-icon><Location /></el-icon>
            上报位置
          </el-button>
        </div>

        <el-table :data="ships" stripe>
          <el-table-column prop="mmsi" label="MMSI" width="120" />
          <el-table-column prop="name" label="船名" min-width="120" />
          <el-table-column prop="type" label="船舶类型" width="100" />
          <el-table-column prop="flag" label="船籍" width="80" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="shipStatusType(row.status)" size="small">
                {{ shipStatusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="最新位置" min-width="160">
            <template #default="{ row }">
              <div v-if="row.latestPosition">
              <div class="position-text">
                {{ row.latestPosition.latitude }}, {{ row.latestPosition.longitude }}
              </div>
              <div class="position-meta">
                {{ row.latestPosition.seaArea || '未知海域' }} · 
                航速 {{ row.latestPosition.speed }}节
              </div>
            </div>
            <span v-else class="text-muted">暂无位置数据</span>
          </template>
          </el-table-column>
          <el-table-column prop="updatedAt" label="更新时间" width="150" />
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="viewShipDetail(row)">
                <el-icon><View /></el-icon>
                详情
              </el-button>
              <el-button size="small" type="primary" @click="locateShip(row)">
                <el-icon><Location /></el-icon>
                定位
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="异常船舶" name="anomalies">
        <div class="filter-bar">
          <el-select v-model="anomalyFilters.status" placeholder="异常状态" clearable style="width: 140px" @change="loadAnomalies">
            <el-option label="待处理" value="active" />
            <el-option label="处理中" value="acknowledged" />
            <el-option label="已解决" value="resolved" />
          </el-select>
          <el-select v-model="anomalyFilters.level" placeholder="告警等级" clearable style="width: 140px" @change="loadAnomalies">
            <el-option label="低" value="low" />
            <el-option label="中" value="medium" />
            <el-option label="高" value="high" />
          </el-select>
          <el-select v-model="anomalyFilters.anomalyType" placeholder="异常类型" clearable style="width: 160px" @change="loadAnomalies">
            <el-option label="AIS信号异常" value="AIS信号异常" />
            <el-option label="非法停泊" value="非法停泊" />
            <el-option label="航速异常" value="航速异常" />
          </el-select>
        </div>

        <el-table :data="anomalies" stripe>
          <el-table-column prop="id" label="编号" width="70" />
          <el-table-column prop="shipName" label="船舶名称" min-width="120" />
          <el-table-column prop="mmsi" label="MMSI" width="120" />
          <el-table-column prop="anomalyType" label="异常类型" width="120">
            <template #default="{ row }">
              <el-tag :type="anomalyTypeTag(row.anomalyType)" size="small">
                {{ row.anomalyType }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="异常描述" min-width="200" />
          <el-table-column prop="seaArea" label="海域" width="140" />
          <el-table-column label="等级" width="80">
            <template #default="{ row }">
              <el-tag :type="levelType(row.level)" size="small">{{ levelLabel(row.level) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="anomalyStatusType(row.status)" size="small">
                {{ anomalyStatusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="detectedAt" label="发现时间" width="150" />
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.status === 'active'"
                size="small"
                type="warning"
                @click="openAnomalyDispose(row, 'acknowledged')"
              >
                确认
              </el-button>
              <el-button
                v-if="row.status === 'acknowledged'"
                size="small"
                type="success"
                @click="openAnomalyDispose(row, 'resolved')"
              >
                解决
              </el-button>
              <el-button size="small" @click="locateByPosition(row.latitude, row.longitude)">
                定位
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="保护区闯入" name="intrusions">
        <div class="filter-bar">
          <el-select v-model="intrusionFilters.status" placeholder="闯入状态" clearable style="width: 140px" @change="loadIntrusions">
            <el-option label="闯入中" value="active" />
            <el-option label="已驱离" value="resolved" />
          </el-select>
          <el-select v-model="intrusionFilters.level" placeholder="告警等级" clearable style="width: 140px" @change="loadIntrusions">
            <el-option label="低" value="low" />
            <el-option label="中" value="medium" />
            <el-option label="高" value="high" />
          </el-select>
        </div>

        <el-table :data="intrusions" stripe>
          <el-table-column prop="id" label="编号" width="70" />
          <el-table-column prop="shipName" label="船舶名称" min-width="120" />
          <el-table-column prop="mmsi" label="MMSI" width="120" />
          <el-table-column prop="protectedArea" label="保护区" min-width="140" />
          <el-table-column prop="seaArea" label="所属海域" width="140" />
          <el-table-column label="闯入位置" min-width="180">
            <template #default="{ row }">
              <div>{{ row.entryLatitude }}, {{ row.entryLongitude }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="entryTime" label="闯入时间" width="150" />
          <el-table-column label="持续时间" width="120">
            <template #default="{ row }">
              <span v-if="row.durationMinutes">
                {{ formatDuration(row.durationMinutes) }}
              </span>
              <span v-else class="text-warning">
                {{ formatDuration(calculateDuration(row.entryTime)) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="等级" width="80">
            <template #default="{ row }">
              <el-tag :type="levelType(row.level)" size="small">{{ levelLabel(row.level) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'danger' : 'success'" size="small">
                {{ row.status === 'active' ? '闯入中' : '已驱离' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.status === 'active'"
                size="small"
                type="danger"
                @click="openIntrusionResolve(row)"
              >
                驱离
              </el-button>
              <el-button size="small" @click="locateByPosition(row.entryLatitude, row.entryLongitude)">
                定位
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="停留记录" name="stay-records">
        <div class="filter-bar">
          <el-select v-model="stayFilters.status" placeholder="停留状态" clearable style="width: 140px" @change="loadStayRecords">
            <el-option label="停留中" value="staying" />
            <el-option label="已离开" value="completed" />
          </el-select>
          <el-select v-model="stayFilters.isOverstay" placeholder="是否超时" clearable style="width: 140px" @change="loadStayRecords">
            <el-option label="超时" value="true" />
            <el-option label="正常" value="false" />
          </el-select>
        </div>

        <el-table :data="stayRecords" stripe>
          <el-table-column prop="id" label="编号" width="70" />
          <el-table-column prop="shipName" label="船舶名称" min-width="120" />
          <el-table-column prop="mmsi" label="MMSI" width="120" />
          <el-table-column prop="seaArea" label="海域" width="140" />
          <el-table-column prop="areaName" label="区域名称" min-width="140" />
          <el-table-column label="位置" min-width="160">
            <template #default="{ row }">
              <div>{{ row.latitude }}, {{ row.longitude }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="arrivalTime" label="到达时间" width="150" />
          <el-table-column prop="departureTime" label="离开时间" width="150">
            <template #default="{ row }">
              {{ row.departureTime || '—' }}
            </template>
          </el-table-column>
          <el-table-column label="停留时长" width="130">
            <template #default="{ row }">
              <span v-if="row.durationMinutes">
                {{ formatDuration(row.durationMinutes) }}
              </span>
              <span v-else class="text-warning">
                {{ formatDuration(calculateDuration(row.arrivalTime)) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="超时" width="80">
            <template #default="{ row }">
              <el-tag :type="row.isOverstay ? 'danger' : 'success'" size="small">
                {{ row.isOverstay ? '超时' : '正常' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'staying' ? 'warning' : 'info'" size="small">
                {{ row.status === 'staying' ? '停留中' : '已离开' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="locateByPosition(row.latitude, row.longitude)">
                定位
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="地图监控" name="map">
        <div ref="mapContainer" class="map-container"></div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="positionDialogVisible" title="上报船舶位置" width="480px">
      <el-form :model="positionForm" label-width="90px">
        <el-form-item label="MMSI" required>
          <el-input v-model="positionForm.mmsi" placeholder="请输入船舶MMSI" />
        </el-form-item>
        <el-form-item label="纬度" required>
          <el-input-number v-model="positionForm.latitude" :min="-90" :max="90" :precision="6" placeholder="-90 ~ 90" />
        </el-form-item>
        <el-form-item label="经度" required>
          <el-input-number v-model="positionForm.longitude" :min="-180" :max="180" :precision="6" placeholder="-180 ~ 180" />
        </el-form-item>
        <el-form-item label="航速">
          <el-input-number v-model="positionForm.speed" :min="0" :max="100" :precision="1" placeholder="节" />
        </el-form-item>
        <el-form-item label="航向">
          <el-input-number v-model="positionForm.course" :min="0" :max="360" :precision="1" placeholder="0 ~ 360°" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="positionForm.status" style="width: 100%">
            <el-option label="航行中" value="sailing" />
            <el-option label="锚泊" value="anchored" />
            <el-option label="停船" value="stopped" />
            <el-option label="系泊" value="moored" />
          </el-select>
        </el-form-item>
        <el-form-item label="海域">
          <el-select v-model="positionForm.seaArea" clearable style="width: 100%">
            <el-option v-for="area in seaAreas" :key="area" :label="area" :value="area" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="positionDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitPosition">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="anomalyDisposeVisible" :title="anomalyDisposeTitle" width="480px">
      <el-form :model="anomalyDisposeForm" label-width="90px">
        <el-form-item label="处置说明" :required="anomalyDisposeTarget === 'resolved'">
          <el-input
            v-model="anomalyDisposeForm.disposalNote"
            type="textarea"
            :rows="4"
            placeholder="请输入处置说明"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="anomalyDisposeVisible = false">取消</el-button>
        <el-button type="primary" @click="submitAnomalyDispose">确认</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="intrusionResolveVisible" title="驱离确认" width="480px">
      <el-form :model="intrusionResolveForm" label-width="90px">
        <el-form-item label="处置说明" required>
          <el-input
            v-model="intrusionResolveForm.disposalNote"
            type="textarea"
            :rows="4"
            placeholder="请输入驱离处置说明"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="intrusionResolveVisible = false">取消</el-button>
        <el-button type="primary" @click="submitIntrusionResolve">确认驱离</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="shipDetailVisible" title="船舶详情" width="720px">
      <div v-if="shipDetail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="船名">{{ shipDetail.ship.name }}</el-descriptions-item>
          <el-descriptions-item label="MMSI">{{ shipDetail.ship.mmsi }}</el-descriptions-item>
          <el-descriptions-item label="船舶类型">{{ shipDetail.ship.type }}</el-descriptions-item>
          <el-descriptions-item label="船籍">{{ shipDetail.ship.flag }}</el-descriptions-item>
          <el-descriptions-item label="船长">{{ shipDetail.ship.length }} m</el-descriptions-item>
          <el-descriptions-item label="船宽">{{ shipDetail.ship.width }} m</el-descriptions-item>
          <el-descriptions-item label="吃水">{{ shipDetail.ship.draft }} m</el-descriptions-item>
          <el-descriptions-item label="总吨位">{{ shipDetail.ship.grossTonnage }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="shipStatusType(shipDetail.ship.status)">
              {{ shipStatusLabel(shipDetail.ship.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ shipDetail.ship.updatedAt }}</el-descriptions-item>
        </el-descriptions>

        <h4 class="detail-section">最新位置</h4>
        <el-descriptions :column="2" border v-if="shipDetail.latestPosition">
          <el-descriptions-item label="纬度">{{ shipDetail.latestPosition.latitude }}</el-descriptions-item>
          <el-descriptions-item label="经度">{{ shipDetail.latestPosition.longitude }}</el-descriptions-item>
          <el-descriptions-item label="航速">{{ shipDetail.latestPosition.speed }} 节</el-descriptions-item>
          <el-descriptions-item label="航向">{{ shipDetail.latestPosition.course }}°</el-descriptions-item>
          <el-descriptions-item label="航行状态">
            {{ navigationStatusLabel(shipDetail.latestPosition.status) }}
          </el-descriptions-item>
          <el-descriptions-item label="海域">{{ shipDetail.latestPosition.seaArea || '未知' }}</el-descriptions-item>
          <el-descriptions-item label="上报时间" :span="2">
            {{ shipDetail.latestPosition.reportedAt }}
          </el-descriptions-item>
        </el-descriptions>
        <el-empty v-else description="暂无位置数据" :image-size="80" />

        <h4 class="detail-section">异常记录</h4>
        <el-table :data="shipDetail.anomalies" stripe size="small" v-if="shipDetail.anomalies.length">
          <el-table-column prop="anomalyType" label="异常类型" />
          <el-table-column prop="description" label="描述" />
          <el-table-column label="等级">
            <template #default="{ row }">
              <el-tag :type="levelType(row.level)" size="small">{{ levelLabel(row.level) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="detectedAt" label="发现时间" />
          <el-table-column label="状态">
            <template #default="{ row }">
              <el-tag :type="anomalyStatusType(row.status)" size="small">
                {{ anomalyStatusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="无异常记录" :image-size="80" />

        <h4 class="detail-section">闯入记录</h4>
        <el-table :data="shipDetail.intrusions" stripe size="small" v-if="shipDetail.intrusions.length">
          <el-table-column prop="protectedArea" label="保护区" />
          <el-table-column prop="seaArea" label="海域" />
          <el-table-column prop="entryTime" label="闯入时间" />
          <el-table-column label="状态">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'danger' : 'success'" size="small">
                {{ row.status === 'active' ? '闯入中' : '已驱离' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="无闯入记录" :image-size="80" />
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, onUnmounted, nextTick } from "vue";
import { ElMessage } from "element-plus";
import {
  Ship, Warning, Lock, Timer, Search, Location, View } from "@element-plus/icons-vue";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  fetchShips,
  fetchShipAnomalies,
  fetchShipIntrusions,
  fetchShipStayRecords,
  fetchShipSummary,
  fetchLatestShipPositions,
  fetchShipDetail,
  reportShipPosition,
  updateShipAnomalyStatus,
  updateShipIntrusionStatus,
  fetchSeaAreas
} from "../services/api";

interface ShipSummary {
  totalShips: number;
  normalShips: number;
  warningShips: number;
  abnormalShips: number;
  activePositions: number;
  activeAnomalies: number;
  acknowledgedAnomalies: number;
  resolvedAnomalies: number;
  activeIntrusions: number;
  resolvedIntrusions: number;
  stayingShips: number;
  overstayShips: number;
}

interface ShipItem {
  id: number;
  mmsi: string;
  name: string;
  type: string;
  flag: string;
  status: string;
  updatedAt: string;
  latestPosition?: {
    latitude: number;
    longitude: number;
    speed: number;
    course: number;
    seaArea: string;
    status: string;
    reportedAt: string;
  };
}

interface ShipAnomalyItem {
  id: number;
  shipId: number;
  mmsi: string;
  shipName: string;
  anomalyType: string;
  description: string;
  seaArea: string;
  latitude: number;
  longitude: number;
  level: string;
  status: string;
  detectedAt: string;
  disposalNote?: string;
}

interface IntrusionItem {
  id: number;
  shipId: number;
  mmsi: string;
  shipName: string;
  protectedArea: string;
  seaArea: string;
  entryLatitude: number;
  entryLongitude: number;
  entryTime: string;
  durationMinutes?: number;
  level: string;
  status: string;
}

interface StayRecordItem {
  id: number;
  shipId: number;
  mmsi: string;
  shipName: string;
  seaArea: string;
  areaName: string;
  latitude: number;
  longitude: number;
  arrivalTime: string;
  durationMinutes?: number;
  isOverstay: boolean;
  maxAllowedMinutes: number;
  status: string;
}

interface LatestShipPosition {
  id: number;
  shipId: number;
  mmsi: string;
  latitude: number;
  longitude: number;
  speed: number;
  course?: number;
  heading?: number;
  seaArea?: string;
  status: string;
  reportedAt: string;
  shipName?: string;
  shipType?: string;
  shipStatus?: string;
}

const activeTab = ref("ships");
const summary = ref<ShipSummary | null>(null);
const ships = ref<ShipItem[]>([]);
const anomalies = ref<ShipAnomalyItem[]>([]);
const intrusions = ref<IntrusionItem[]>([]);
const stayRecords = ref<StayRecordItem[]>([]);
const seaAreas = ref<string[]>([]);
const latestPositions = ref<LatestShipPosition[]>([]);

const filters = reactive({
  keyword: "",
  status: "",
  seaArea: ""
});

const anomalyFilters = reactive({
  status: "",
  level: "",
  anomalyType: ""
});

const intrusionFilters = reactive({
  status: "",
  level: ""
});

const stayFilters = reactive({
  status: "",
  isOverstay: ""
});

const positionDialogVisible = ref(false);
const positionForm = reactive({
  mmsi: "",
  latitude: 30.5,
  longitude: 122.5,
  speed: 0,
  course: 0,
  status: "sailing",
  seaArea: ""
});

const anomalyDisposeVisible = ref(false);
const anomalyDisposeTitle = ref("");
const anomalyDisposeTarget = ref<"acknowledged" | "resolved">("acknowledged");
const anomalyDisposeTargetItem = ref<ShipAnomalyItem | null>(null);
const anomalyDisposeForm = reactive({
  disposalNote: ""
});

const intrusionResolveVisible = ref(false);
const intrusionResolveTargetItem = ref<IntrusionItem | null>(null);
const intrusionResolveForm = reactive({
  disposalNote: ""
});

const shipDetailVisible = ref(false);
const shipDetail = ref<any>(null);

const mapContainer = ref<HTMLElement | null>(null);
let map: L.Map | null = null;
let markers: L.CircleMarker[] = [];

function shipStatusLabel(status: string) {
  return { normal: "正常", warning: "预警", abnormal: "异常" }[status] || status;
}

function shipStatusType(status: string) {
  return status === "abnormal" ? "danger" : status === "warning" ? "warning" : "success";
}

function navigationStatusLabel(status: string) {
  return { sailing: "航行中", anchored: "锚泊", stopped: "停船", moored: "系泊" }[status] || status;
}

function levelLabel(level: string) {
  return { low: "低", medium: "中", high: "高" }[level] || level;
}

function levelType(level: string) {
  return level === "high" ? "danger" : level === "medium" ? "warning" : "info";
}

function anomalyTypeTag(type: string) {
  if (type.includes("信号")) return "danger";
  if (type.includes("停泊")) return "warning";
  return "info";
}

function anomalyStatusLabel(status: string) {
  return { active: "待处理", acknowledged: "处理中", resolved: "已解决" }[status] || status;
}

function anomalyStatusType(status: string) {
  return status === "active" ? "danger" : status === "acknowledged" ? "warning" : "success";
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours} 小时 ${mins} 分钟`;
}

function calculateDuration(time: string) {
  const start = new Date(time.replace(" ", "T"));
  const now = new Date();
  return Math.floor((now.getTime() - start.getTime()) / 60000);
}

async function loadSummary() {
  summary.value = await fetchShipSummary();
}

async function loadShips() {
  const params: Record<string, string> = {};
  if (filters.keyword) params.keyword = filters.keyword;
  if (filters.status) params.status = filters.status;
  if (filters.seaArea) params.seaArea = filters.seaArea;
  ships.value = await fetchShips(params);
}

async function loadAnomalies() {
  const params: Record<string, string> = {};
  if (anomalyFilters.status) params.status = anomalyFilters.status;
  if (anomalyFilters.level) params.level = anomalyFilters.level;
  if (anomalyFilters.anomalyType) params.anomalyType = anomalyFilters.anomalyType;
  anomalies.value = await fetchShipAnomalies(params);
}

async function loadIntrusions() {
  const params: Record<string, string> = {};
  if (intrusionFilters.status) params.status = intrusionFilters.status;
  if (intrusionFilters.level) params.level = intrusionFilters.level;
  intrusions.value = await fetchShipIntrusions(params);
}

async function loadStayRecords() {
  const params: Record<string, string> = {};
  if (stayFilters.status) params.status = stayFilters.status;
  if (stayFilters.isOverstay) params.isOverstay = stayFilters.isOverstay;
  stayRecords.value = await fetchShipStayRecords(params);
}

async function loadSeaAreasList() {
  const areas = await fetchSeaAreas();
  seaAreas.value = areas.map((a: any) => a.name);
}

async function loadLatestPositions() {
  latestPositions.value = await fetchLatestShipPositions();
  updateMapMarkers();
}

function openPositionDialog() {
  positionForm.mmsi = "";
  positionForm.latitude = 30.5;
  positionForm.longitude = 122.5;
  positionForm.speed = 0;
  positionForm.course = 0;
  positionForm.status = "sailing";
  positionForm.seaArea = "";
  positionDialogVisible.value = true;
}

async function submitPosition() {
  if (!positionForm.mmsi.trim()) {
    ElMessage.warning("请输入船舶MMSI");
    return;
  }
  try {
    await reportShipPosition({ ...positionForm });
    ElMessage.success("位置上报成功");
    positionDialogVisible.value = false;
    await Promise.all([loadShips(), loadLatestPositions(), loadSummary()]);
  } catch (err: unknown) {
    const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "上报失败";
    ElMessage.error(message);
  }
}

function openAnomalyDispose(anomaly: ShipAnomalyItem, target: "acknowledged" | "resolved") {
  anomalyDisposeTargetItem.value = anomaly;
  anomalyDisposeTarget.value = target;
  anomalyDisposeTitle.value = target === "acknowledged" ? "确认异常" : "解决异常";
  anomalyDisposeForm.disposalNote = anomaly.disposalNote || "";
  anomalyDisposeVisible.value = true;
}

async function submitAnomalyDispose() {
  if (anomalyDisposeTarget.value === "resolved" && !anomalyDisposeForm.disposalNote.trim()) {
    ElMessage.warning("请填写处置说明");
    return;
  }
  try {
    await updateShipAnomalyStatus(anomalyDisposeTargetItem.value!.id, {
      status: anomalyDisposeTarget.value,
      disposalNote: anomalyDisposeForm.disposalNote
    });
    ElMessage.success("状态已更新");
    anomalyDisposeVisible.value = false;
    await Promise.all([loadAnomalies(), loadSummary()]);
  } catch (err: unknown) {
    const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "更新失败";
    ElMessage.error(message);
  }
}

function openIntrusionResolve(intrusion: IntrusionItem) {
  intrusionResolveTargetItem.value = intrusion;
  intrusionResolveForm.disposalNote = "";
  intrusionResolveVisible.value = true;
}

async function submitIntrusionResolve() {
  if (!intrusionResolveForm.disposalNote.trim()) {
    ElMessage.warning("请填写处置说明");
    return;
  }
  try {
    await updateShipIntrusionStatus(intrusionResolveTargetItem.value!.id, {
      status: "resolved",
      disposalNote: intrusionResolveForm.disposalNote
    });
    ElMessage.success("已标记为驱离");
    intrusionResolveVisible.value = false;
    await Promise.all([loadIntrusions(), loadSummary()]);
  } catch (err: unknown) {
    const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "更新失败";
    ElMessage.error(message);
  }
}

async function viewShipDetail(ship: ShipItem) {
  shipDetail.value = await fetchShipDetail(ship.id);
  shipDetailVisible.value = true;
}

function locateShip(ship: ShipItem) {
  if (ship.latestPosition) {
    locateByPosition(ship.latestPosition.latitude, ship.latestPosition.longitude);
  } else {
    ElMessage.warning("该船舶暂无位置数据");
  }
}

function locateByPosition(lat: number, lng: number) {
  activeTab.value = "map";
  nextTick(() => {
    if (map) {
      map.setView([lat, lng], 12);
    }
  });
}

function initMap() {
  if (!mapContainer.value) return;

  map = L.map(mapContainer.value).setView([30.5, 122.5], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors"
  }).addTo(map);
}

function updateMapMarkers() {
  if (!map) return;

  markers.forEach((m) => map!.removeLayer(m));
  markers = [];

  latestPositions.value.forEach((pos) => {
    const iconColor = pos.shipStatus === "abnormal"
      ? "red"
      : pos.shipStatus === "warning"
      ? "orange"
      : "blue";

    const marker = L.circleMarker([pos.latitude, pos.longitude], {
      radius: 8,
      fillColor: iconColor,
      color: "#fff",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8
    }).addTo(map!);

    marker.bindPopup(`
      <strong>${pos.shipName || "未知船舶"}</strong><br>
      MMSI: ${pos.mmsi}<br>
      类型: ${pos.shipType || "未知"}<br>
      航速: ${pos.speed} 节<br>
      状态: ${navigationStatusLabel(pos.status)}<br>
      海域: ${pos.seaArea || "未知"}<br>
      更新: ${pos.reportedAt}
    `);

    markers.push(marker);
  });
}

onMounted(async () => {
  await Promise.all([
    loadSummary(),
    loadShips(),
    loadAnomalies(),
    loadIntrusions(),
    loadStayRecords(),
    loadSeaAreasList(),
    loadLatestPositions()
  ]);

  nextTick(() => {
    initMap();
    updateMapMarkers();
  });
});

onUnmounted(() => {
  if (map) {
    map.remove();
    map = null;
  }
});
</script>

<style scoped>
.ship-monitor {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stats-row {
  margin-bottom: 8px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 0;
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: #fff;
}

.stat-icon.normal {
  background: linear-gradient(135deg, #67c23a, #85ce61);
}

.stat-icon.warning {
  background: linear-gradient(135deg, #e6a23c, #f0c78a);
}

.stat-icon.danger {
  background: linear-gradient(135deg, #f56c6c, #f89898);
}

.stat-icon.info {
  background: linear-gradient(135deg, #409eff, #79bbff);
}

.stat-content {
  flex: 1;
}

.stat-label {
  font-size: 13px;
  color: #909399;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #303133;
  line-height: 1.2;
}

.stat-sub {
  font-size: 12px;
  margin-top: 4px;
}

.text-success {
  color: #67c23a;
}

.text-warning {
  color: #e6a23c;
}

.text-danger {
  color: #f56c6c;
}

.text-info {
  color: #409eff;
}

.text-muted {
  color: #909399;
}

.main-tabs {
  background: #fff;
  border-radius: 4px;
  padding: 0 16px;
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.position-text {
  font-size: 13px;
  color: #303133;
}

.position-meta {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.detail-section {
  margin: 20px 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.map-container {
  height: 600px;
  border-radius: 4px;
  overflow: hidden;
}
</style>
