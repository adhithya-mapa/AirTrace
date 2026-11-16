const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const mqtt = require('mqtt');
require('dotenv').config({ path: require('path').join(__dirname, '../../dashboard/atlas-credentials.env') });

const CFG = require('./config');
const { repo } = require('./db');
const { LeakDetectionEngine, classifySeverity } = require('./engine');
const { FinancialTracker } = require('./finance');
const { AlertManager, ACTION } = require('./alerts');

const engine = new LeakDetectionEngine(CFG);
const finance = new FinancialTracker(CFG);
const alerts = new AlertManager(CFG);

// MQTT topic the backend publishes leak commands to (ESP32 subscribes to this)
const COMMAND_TOPIC = 'sensor/command';

// Track per-device leak state so we only publish when it changes
const lastLeakState = new Map();

const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.get('/api/status/:id', async (req, res) => {
  const data = await repo.latest(req.params.id);
  res.json(data || {});
});

app.get('/api/history/:id', async (req, res) => {
  const data = await repo.getHistory(req.params.id, 200);
  res.json(data.reverse());
});

const fs = require('fs');
const path = require('path');

app.get('/api/config', (req, res) => {
  res.json({
    windowSize: CFG.detection.windowSize,
    minRipples: CFG.detection.minRipples,
    noiseMargin: CFG.detection.noiseMargin,
    tariffLkr: CFG.finance.tariffLkrPerKwh,
    tankVolume: CFG.system.tankVolumeL
  });
});

app.use(express.json());
app.post('/api/config', (req, res) => {
  const { windowSize, minRipples, noiseMargin, tariffLkr, tankVolume } = req.body;
  
  if (windowSize !== undefined) CFG.detection.windowSize = Number(windowSize);
  if (minRipples !== undefined) CFG.detection.minRipples = Number(minRipples);
  if (noiseMargin !== undefined) CFG.detection.noiseMargin = Number(noiseMargin);
  if (tariffLkr !== undefined) CFG.finance.tariffLkrPerKwh = Number(tariffLkr);
  if (tankVolume !== undefined) CFG.system.tankVolumeL = Number(tankVolume);

  const savedConfig = {
    window_size: CFG.detection.windowSize,
    min_ripples: CFG.detection.minRipples,
    noise_margin: CFG.detection.noiseMargin,
    electricity_unit_price: CFG.finance.tariffLkrPerKwh,
    tank_volume_L: CFG.system.tankVolumeL
  };
  fs.writeFileSync(path.join(__dirname, '../config.json'), JSON.stringify(savedConfig, null, 2));
  
  res.json({ success: true });
});

let mqttConnected = false;

io.on('connection', (socket) => {
  socket.emit('mqtt_status', { connected: mqttConnected });

  socket.on('set_pressure', (data) => {
    if (!mqttConnected || !data.deviceId || !data.targetPressure) return;
    const command = JSON.stringify({
      device_id: data.deviceId,
      targetPressure: data.targetPressure,
      ts: Date.now()
    });
    client.publish(COMMAND_TOPIC, command, { qos: 1 }, (err) => {
      if (err) console.error('Failed to publish target pressure:', err);
      else console.log(`Published target pressure to ${data.deviceId}: ${data.targetPressure} hPa`);
    });
  });
});

const client = mqtt.connect(CFG.mqtt.url);
client.on('connect', () => { 
  mqttConnected = true;
  io.emit('mqtt_status', { connected: true });
  client.subscribe(CFG.mqtt.topic); 
  console.log('MQTT connected'); 
});

client.on('offline', () => {
  mqttConnected = false;
  io.emit('mqtt_status', { connected: false });
  console.log('MQTT offline');
});

client.on('error', (err) => {
  mqttConnected = false;
  io.emit('mqtt_status', { connected: false, error: err.message });
  console.error('MQTT error:', err);
});

client.on('message', async (topic, payload) => {
  // Ignore messages on the command topic (we publish those, not consume them)
  if (topic === COMMAND_TOPIC) return;

  let rawMsg;
  try { rawMsg = JSON.parse(payload.toString()); } catch { return; }

  let msg = {};
  if (rawMsg.device_id && rawMsg.pressure !== undefined) {
    msg = {
      deviceId: rawMsg.device_id,
      ts: Date.now(),
      pressure_kPa: rawMsg.pressure / 10,
      temp_C: rawMsg.temperature,
      flow_ml_sec: rawMsg.airflow * (1000 / 60),
      leakDetected: rawMsg.leak_detected || rawMsg.leakDetected || false,
      pumpOn: false,
      emergencyStop: false
    };
  } else {
    msg = rawMsg;
    msg.deviceId = topic.split('/')[1] || 'unknown';
    msg.ts = msg.ts || Date.now();
  }

  if (!Number.isFinite(msg.pressure_kPa) || !Number.isFinite(msg.temp_C)) return;

  const detection = engine.ingest(msg);
  const fin = finance.update(msg.deviceId, detection, msg.ts);
  const rec = {
    deviceId: msg.deviceId, ts: msg.ts, raw: msg,
    detection, finance: fin,
  };

  try {
    await repo.save(rec);
    io.emit('telemetry', rec);
    await alerts.handle(rec);
  } catch (e) { console.error('pipeline error', e); }
});

server.listen(process.env.PORT || 3000, () => console.log('Dashboard API on :' + (process.env.PORT || 3000)));
