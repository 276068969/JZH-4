CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(64) UNIQUE NOT NULL,
  password_hash VARCHAR(128) NOT NULL,
  role VARCHAR(32) NOT NULL,
  name VARCHAR(64) NOT NULL,
  position VARCHAR(128),
  responsible_sea_areas TEXT[],
  data_scope TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS monitoring_points (
  id SERIAL PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  sea_area VARCHAR(128) NOT NULL,
  type VARCHAR(64) NOT NULL,
  latitude NUMERIC(10, 6) NOT NULL,
  longitude NUMERIC(10, 6) NOT NULL,
  status VARCHAR(32) NOT NULL,
  water_quality VARCHAR(32) NOT NULL,
  wind_speed NUMERIC(8, 2) DEFAULT 0,
  temperature NUMERIC(8, 2) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id SERIAL PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  target VARCHAR(64) NOT NULL,
  condition_text VARCHAR(255) NOT NULL,
  condition_metric VARCHAR(64),
  condition_operator VARCHAR(32),
  condition_threshold VARCHAR(255),
  condition_unit VARCHAR(16),
  level VARCHAR(32) NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alert_results (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER NOT NULL REFERENCES alert_rules(id),
  rule_name VARCHAR(128) NOT NULL,
  point_id INTEGER NOT NULL REFERENCES monitoring_points(id),
  point_name VARCHAR(128) NOT NULL,
  sea_area VARCHAR(128) NOT NULL,
  level VARCHAR(32) NOT NULL,
  message VARCHAR(512) NOT NULL,
  metric_value VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  triggered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMP,
  resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_records (
  id SERIAL PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  category VARCHAR(64) NOT NULL,
  sea_area VARCHAR(128) NOT NULL,
  level VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  reporter VARCHAR(64) NOT NULL,
  assignee VARCHAR(64) NOT NULL,
  source VARCHAR(64) NOT NULL DEFAULT '人工上报',
  disposal_note TEXT DEFAULT '',
  responsible_person VARCHAR(64) DEFAULT '',
  occurred_at TIMESTAMP NOT NULL,
  resolved_at TIMESTAMP
);

INSERT INTO users (username, password_hash, role, name, position, responsible_sea_areas, data_scope) VALUES
  ('admin', 'admin123', 'admin', '系统管理员', '海洋监管局局长', ARRAY['全部海域'], '可查看全部海域的监测数据、告警信息和事件记录，拥有系统管理权限'),
  ('supervisor', '123456', 'supervisor', '监管人员', '海域监管科科员', ARRAY['东港近岸海域', '蓝湾工业岸线', '南礁保护区', '北湾养殖区'], '可查看所辖海域的监测数据、告警信息和事件记录，可处置告警和事件'),
  ('user', '123456', 'user', '普通用户', '观测站值班员', ARRAY['北湾养殖区'], '仅可查看北湾养殖区的监测数据，无告警和事件处置权限')
ON CONFLICT (username) DO NOTHING;

INSERT INTO monitoring_points (name, sea_area, type, latitude, longitude, status, water_quality, wind_speed, temperature, updated_at) VALUES
  ('东港 01 号浮标', '东港近岸海域', '水质浮标', 30.724000, 122.814000, 'normal', 'II 类', 5.4, 23.6, '2026-06-11 09:30:00'),
  ('蓝湾排口监测站', '蓝湾工业岸线', '排口监测', 30.512000, 122.443000, 'warning', 'IV 类', 4.1, 24.2, '2026-06-11 09:28:00'),
  ('南礁 AIS 雷达', '南礁保护区', '船舶监管', 30.193000, 122.025000, 'normal', 'I 类', 7.8, 22.9, '2026-06-11 09:32:00'),
  ('北湾气象站', '北湾养殖区', '气象监测', 30.971000, 121.901000, 'offline', 'III 类', 0, 0, '2026-06-11 07:10:00');

INSERT INTO alert_rules (name, target, condition_text, condition_metric, condition_operator, condition_threshold, condition_unit, level, enabled) VALUES
  ('水质超标告警', '水质', '水质等级 ≥ IV 类', 'water_quality', 'in', 'IV 类,V 类,劣 V 类', '', 'high', TRUE),
  ('监测点离线告警', '设备', '设备状态 = offline', 'status', 'eq', 'offline', '', 'medium', TRUE),
  ('风速超限告警', '气象', '风速 > 10m/s', 'wind_speed', 'gt', '10', 'm/s', 'low', TRUE),
  ('设备预警状态', '设备', '设备状态 = warning', 'status', 'eq', 'warning', '', 'medium', TRUE);

INSERT INTO event_records (title, category, sea_area, level, status, reporter, assignee, source, disposal_note, responsible_person, occurred_at, resolved_at) VALUES
  ('蓝湾排口疑似违法排放', '违法排放', '蓝湾工业岸线', 'high', 'processing', '水质自动监测', '监管人员', '自动监测', '已派遣执法人员前往现场取样', '张伟', '2026-06-11 08:42:00', NULL),
  ('南礁保护区异常船舶停留', '异常船舶', '南礁保护区', 'medium', 'reported', 'AIS 雷达', '未分派', 'AIS 雷达', '', '', '2026-06-11 08:55:00', NULL),
  ('北湾气象站离线', '设备告警', '北湾养殖区', 'low', 'resolved', '设备心跳', '运维值班', '设备心跳', '设备重启后恢复正常运行', '李明', '2026-06-10 22:15:00', '2026-06-11 06:30:00');

CREATE TABLE IF NOT EXISTS ships (
  id SERIAL PRIMARY KEY,
  mmsi VARCHAR(16) UNIQUE NOT NULL,
  name VARCHAR(128) NOT NULL,
  type VARCHAR(64) NOT NULL,
  flag VARCHAR(64) NOT NULL,
  length NUMERIC(8, 2),
  width NUMERIC(8, 2),
  draft NUMERIC(6, 2),
  gross_tonnage INTEGER,
  status VARCHAR(32) NOT NULL DEFAULT 'normal',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ship_positions (
  id SERIAL PRIMARY KEY,
  ship_id INTEGER NOT NULL REFERENCES ships(id),
  mmsi VARCHAR(16) NOT NULL,
  latitude NUMERIC(10, 6) NOT NULL,
  longitude NUMERIC(10, 6) NOT NULL,
  speed NUMERIC(6, 2) DEFAULT 0,
  course NUMERIC(5, 2),
  heading NUMERIC(5, 2),
  sea_area VARCHAR(128),
  status VARCHAR(32) DEFAULT 'sailing',
  reported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ship_anomalies (
  id SERIAL PRIMARY KEY,
  ship_id INTEGER NOT NULL REFERENCES ships(id),
  mmsi VARCHAR(16) NOT NULL,
  ship_name VARCHAR(128) NOT NULL,
  anomaly_type VARCHAR(64) NOT NULL,
  description VARCHAR(512),
  sea_area VARCHAR(128),
  latitude NUMERIC(10, 6),
  longitude NUMERIC(10, 6),
  level VARCHAR(32) NOT NULL DEFAULT 'medium',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  detected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMP,
  resolved_at TIMESTAMP,
  disposal_note TEXT
);

CREATE TABLE IF NOT EXISTS protected_area_intrusions (
  id SERIAL PRIMARY KEY,
  ship_id INTEGER NOT NULL REFERENCES ships(id),
  mmsi VARCHAR(16) NOT NULL,
  ship_name VARCHAR(128) NOT NULL,
  protected_area VARCHAR(128) NOT NULL,
  sea_area VARCHAR(128) NOT NULL,
  entry_latitude NUMERIC(10, 6) NOT NULL,
  entry_longitude NUMERIC(10, 6) NOT NULL,
  entry_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  exit_latitude NUMERIC(10, 6),
  exit_longitude NUMERIC(10, 6),
  exit_time TIMESTAMP,
  duration_minutes INTEGER,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  level VARCHAR(32) NOT NULL DEFAULT 'high',
  disposal_note TEXT,
  detected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ship_stay_records (
  id SERIAL PRIMARY KEY,
  ship_id INTEGER NOT NULL REFERENCES ships(id),
  mmsi VARCHAR(16) NOT NULL,
  ship_name VARCHAR(128) NOT NULL,
  sea_area VARCHAR(128) NOT NULL,
  area_name VARCHAR(128) NOT NULL,
  latitude NUMERIC(10, 6) NOT NULL,
  longitude NUMERIC(10, 6) NOT NULL,
  arrival_time TIMESTAMP NOT NULL,
  departure_time TIMESTAMP,
  duration_minutes INTEGER,
  is_overstay BOOLEAN DEFAULT FALSE,
  max_allowed_minutes INTEGER DEFAULT 120,
  status VARCHAR(32) NOT NULL DEFAULT 'staying',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ship_positions_mmsi ON ship_positions(mmsi);
CREATE INDEX IF NOT EXISTS idx_ship_positions_reported_at ON ship_positions(reported_at);
CREATE INDEX IF NOT EXISTS idx_ship_anomalies_status ON ship_anomalies(status);
CREATE INDEX IF NOT EXISTS idx_intrusions_status ON protected_area_intrusions(status);
CREATE INDEX IF NOT EXISTS idx_stay_records_status ON ship_stay_records(status);

INSERT INTO ships (mmsi, name, type, flag, length, width, draft, gross_tonnage, status) VALUES
  ('413300001', '远洋号', '货轮', '中国', 220.5, 32.8, 12.5, 65000, 'normal'),
  ('413300002', '海巡101', '执法船', '中国', 85.0, 12.5, 4.2, 2500, 'normal'),
  ('413300003', '蓝鲸号', '油轮', '巴拿马', 330.0, 58.0, 22.5, 150000, 'warning'),
  ('413300004', '渔政888', '渔业船', '中国', 45.0, 8.5, 3.2, 500, 'normal'),
  ('413300005', '黑珍珠', '散货船', '利比里亚', 180.0, 28.0, 10.5, 35000, 'abnormal'),
  ('413300006', '东方之星', '客轮', '中国', 135.0, 20.0, 5.8, 8000, 'normal'),
  ('413300007', '探索者号', '科考船', '中国', 95.0, 18.0, 6.5, 3200, 'normal'),
  ('413300008', '幽灵号', '货轮', '塞拉利昂', 165.0, 25.0, 9.8, 28000, 'abnormal')
ON CONFLICT (mmsi) DO NOTHING;

INSERT INTO ship_positions (ship_id, mmsi, latitude, longitude, speed, course, heading, sea_area, status, reported_at) VALUES
  (1, '413300001', 30.724000, 122.814000, 12.5, 135.0, 135.0, '东港近岸海域', 'sailing', '2026-06-15 09:30:00'),
  (2, '413300002', 30.512000, 122.443000, 8.2, 90.0, 92.0, '蓝湾工业岸线', 'sailing', '2026-06-15 09:28:00'),
  (3, '413300003', 30.193000, 122.025000, 0.5, 0.0, 45.0, '南礁保护区', 'anchored', '2026-06-15 09:32:00'),
  (4, '413300004', 30.971000, 121.901000, 3.8, 270.0, 268.0, '北湾养殖区', 'sailing', '2026-06-15 09:25:00'),
  (5, '413300005', 30.205000, 122.038000, 0.2, 0.0, 180.0, '南礁保护区', 'anchored', '2026-06-15 09:35:00'),
  (6, '413300006', 30.650000, 122.750000, 15.2, 45.0, 43.0, '东港近岸海域', 'sailing', '2026-06-15 09:31:00'),
  (7, '413300007', 30.450000, 122.350000, 6.5, 180.0, 178.0, '蓝湾工业岸线', 'sailing', '2026-06-15 09:29:00'),
  (8, '413300008', 30.220000, 122.055000, 0.0, 0.0, 90.0, '南礁保护区', 'stopped', '2026-06-15 09:33:00');

INSERT INTO ship_anomalies (ship_id, mmsi, ship_name, anomaly_type, description, sea_area, latitude, longitude, level, status, detected_at) VALUES
  (5, '413300005', '黑珍珠', 'AIS信号异常', '船舶AIS信号间歇性中断，疑似故意关闭', '南礁保护区', 30.205000, 122.038000, 'high', 'active', '2026-06-15 08:15:00'),
  (8, '413300008', '幽灵号', '非法停泊', '船舶在保护区核心区域停泊超过6小时', '南礁保护区', 30.220000, 122.055000, 'high', 'active', '2026-06-15 03:30:00'),
  (3, '413300003', '蓝鲸号', '航速异常', '油轮在禁航区航速低于安全阈值', '南礁保护区', 30.193000, 122.025000, 'medium', 'acknowledged', '2026-06-14 22:45:00');

INSERT INTO protected_area_intrusions (ship_id, mmsi, ship_name, protected_area, sea_area, entry_latitude, entry_longitude, entry_time, status, level, detected_at) VALUES
  (5, '413300005', '黑珍珠', '南礁核心保护区', '南礁保护区', 30.198000, 122.030000, '2026-06-15 02:30:00', 'active', 'high', '2026-06-15 02:30:00'),
  (8, '413300008', '幽灵号', '南礁核心保护区', '南礁保护区', 30.215000, 122.050000, '2026-06-15 01:15:00', 'active', 'high', '2026-06-15 01:15:00'),
  (3, '413300003', '蓝鲸号', '南礁缓冲区', '南礁保护区', 30.185000, 122.015000, '2026-06-14 20:00:00', 'resolved', 'medium', '2026-06-14 20:00:00');

INSERT INTO ship_stay_records (ship_id, mmsi, ship_name, sea_area, area_name, latitude, longitude, arrival_time, is_overstay, max_allowed_minutes, status) VALUES
  (5, '413300005', '黑珍珠', '南礁保护区', '核心保护区A区', 30.205000, 122.038000, '2026-06-15 02:30:00', true, 120, 'staying'),
  (8, '413300008', '幽灵号', '南礁保护区', '核心保护区B区', 30.220000, 122.055000, '2026-06-15 01:15:00', true, 120, 'staying'),
  (3, '413300003', '蓝鲸号', '南礁保护区', '缓冲区锚地', 30.193000, 122.025000, '2026-06-14 20:00:00', false, 480, 'completed'),
  (1, '413300001', '远洋号', '东港近岸海域', '东港锚地', 30.724000, 122.814000, '2026-06-15 06:00:00', false, 240, 'staying');
