const CFG = require('./config');
const { round, linearFit } = require('./helpers');

class LeakDetectionEngine {
  constructor(cfg) { 
    this.cfg = cfg; 
    this.devices = new Map(); 
  }

  _state(id) {
    if (!this.devices.has(id)) {
      this.devices.set(id, {
        samples: [],
      });
    }
    return this.devices.get(id);
  }

  ingest(msg) {
    const s = this._state(msg.deviceId);
    const ts = msg.ts || Date.now();
    const pRaw = msg.pressure_kPa;
    const currentFlow = msg.flow_ml_sec || 0;

    s.samples.push({ ts, p: pRaw, flow: currentFlow });
    const cutoff = ts - 120 * 1000;
    while (s.samples.length && s.samples[0].ts < cutoff) {
      s.samples.shift();
    }

    return this._evaluate(s, msg, ts, pRaw, currentFlow);
  }

  _evaluate(s, msg, ts, pRaw, currentFlow) {
    // The ESP32 is now providing the leak status directly
    const isLeaking = !!msg.leakDetected;

    const out = {
      deviceId: msg.deviceId, 
      ts, 
      pressureKPa: round(pRaw, 3), 
      tempC: msg.temp_C,
      testValid: true, 
      leakDetected: isLeaking, 
      confidence: isLeaking ? 1.000 : 0.000,
      slopeHPaPerSec: 0.000, 
      r2: 0.000, 
      leakRateMlSec: isLeaking ? round(currentFlow, 3) : 0.000,
      indicators: { esp: isLeaking },
    };

    if (s.samples.length > 2) {
      const t0 = s.samples[0].ts;
      const { slope, r2 } = linearFit(s.samples.map(a => ({ x: (a.ts - t0) / 1000, y: a.p * 10 })));
      out.slopeHPaPerSec = round(slope, 3);
      out.r2 = round(r2, 3);
    }

    return out;
  }
}

// Severity logic removed as requested, just a dummy format to not break UI if it expects an object
function classifySeverity(det, msg, cfg = CFG) {
  return null;
}

module.exports = { LeakDetectionEngine, classifySeverity };
