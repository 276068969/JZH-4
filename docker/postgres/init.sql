CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(64) UNIQUE NOT NULL,
  password_hash VARCHAR(128) NOT NULL,
  role VARCHAR(32) NOT NULL,
  name VARCHAR(64) NOT NULL,
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
  occurred_at TIMESTAMP NOT NULL
);

INSERT INTO users (username, password_hash, role, name) VALUES
  ('admin', 'admin123', 'admin', '系统管理员'),
  ('supervisor', '123456', 'supervisor', '监管人员'),
  ('user', '123456', 'user', '普通用户')
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

INSERT INTO event_records (title, category, sea_area, level, status, reporter, assignee, occurred_at) VALUES
  ('蓝湾排口疑似违法排放', '违法排放', '蓝湾工业岸线', 'high', 'processing', '水质自动监测', '监管人员', '2026-06-11 08:42:00'),
  ('南礁保护区异常船舶停留', '异常船舶', '南礁保护区', 'medium', 'reported', 'AIS 雷达', '未分派', '2026-06-11 08:55:00'),
  ('北湾气象站离线', '设备告警', '北湾养殖区', 'low', 'resolved', '设备心跳', '运维值班', '2026-06-10 22:15:00');
