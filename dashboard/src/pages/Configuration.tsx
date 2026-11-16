import React, { useState, useEffect } from 'react';
import { SendIcon, CheckIcon, SettingsIcon, SlidersIcon, BanknoteIcon, CylinderIcon, ActivityIcon } from 'lucide-react';
import { socket } from '../socket';

import type { LiveTelemetry } from '../hooks/useLiveTelemetry';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export function Configuration({ telemetry }: { telemetry: LiveTelemetry }) {
  const [targetPressure, setTargetPressure] = useState<string>('800');
  const [pumpSuccess, setPumpSuccess] = useState<boolean>(false);

  // System Configurations State
  const [windowSize, setWindowSize] = useState<string>('');
  const [minRipples, setMinRipples] = useState<string>('');
  const [noiseMargin, setNoiseMargin] = useState<string>('');
  const [tariffLkr, setTariffLkr] = useState<string>('');
  const [tankVolume, setTankVolume] = useState<string>('');
  const [configSuccess, setConfigSuccess] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Fetch initial config
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/config`)
      .then(res => res.json())
      .then(data => {
        setWindowSize(data.windowSize?.toString() || '20');
        setMinRipples(data.minRipples?.toString() || '4');
        setNoiseMargin(data.noiseMargin?.toString() || '0.5');
        setTariffLkr(data.tariffLkr?.toString() || '40');
        setTankVolume(data.tankVolume?.toString() || '1.5');
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load config', err);
        setLoading(false);
      });
  }, []);

  const handleSetPressure = () => {
    const val = parseFloat(targetPressure);
    if (!isNaN(val) && val > 0) {
      socket.emit('set_pressure', { deviceId: 'esp32-01', targetPressure: val });
      setPumpSuccess(true);
      setTimeout(() => setPumpSuccess(false), 2000);
    }
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSaveConfigs = () => {
    setIsSaving(true);
    fetch(`${BACKEND_URL}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        windowSize: parseFloat(windowSize),
        minRipples: parseFloat(minRipples),
        noiseMargin: parseFloat(noiseMargin),
        tariffLkr: parseFloat(tariffLkr),
        tankVolume: parseFloat(tankVolume)
      })
    })
    .then(async (res) => {
      setIsSaving(false);
      if (!res.ok) throw new Error('Server returned ' + res.status);
      return res.json();
    })
    .then(() => {
      setConfigSuccess(true);
      setTimeout(() => setConfigSuccess(false), 3000);
    })
    .catch(err => {
      setIsSaving(false);
      alert('Failed to save configuration! Ensure the backend is running.');
      console.error(err);
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2 mb-2"><SettingsIcon className="text-signal" /> System Configurations</h2>
        <p className="text-muted text-sm">Manage hardware thresholds, financial constants, and pump controls dynamically.</p>
      </div>

      {/* Pump Control Section */}
      <div className="bg-surface rounded-4xl p-6 ring-1 ring-line shadow-sm">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4"><SlidersIcon className="w-5 h-5 text-signal" /> Hardware Controls</h3>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-semibold text-ink mb-1">Target Pump Cutoff (hPa)</label>
            <p className="text-xs text-muted mb-2">The pressure level at which the compressor automatically turns off.</p>
          </div>
          <div className="flex items-center gap-3">
            <input 
              type="number" 
              step="100"
              value={targetPressure}
              onChange={(e) => setTargetPressure(e.target.value)}
              className="w-32 rounded-xl border-line bg-canvas px-4 py-2 outline-none focus:ring-2 focus:ring-signal"
            />
            <button 
              onClick={handleSetPressure}
              className={`flex items-center justify-center rounded-xl px-5 py-2 font-bold transition ${pumpSuccess ? 'bg-signal text-brand-deep' : 'bg-signal text-brand-deep hover:bg-signal/80'}`}
            >
              {pumpSuccess ? (
                <><CheckIcon className="h-5 w-5 mr-2" /> Saved</>
              ) : (
                <><SendIcon className="h-5 w-5 mr-2" /> Send to ESP</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Engine Configurations Section */}
      <div className="bg-surface rounded-4xl p-6 ring-1 ring-line shadow-sm">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-6"><ActivityIcon className="w-5 h-5 text-signal" /> Ripple Leak Detector</h3>
        
        {loading ? (
          <p className="text-sm text-muted">Loading configurations...</p>
        ) : (
          <div className="space-y-6">
            
            <div className="bg-brand-deep text-white p-4 rounded-2xl flex items-center justify-between shadow-inner">
              <div>
                <p className="text-xs uppercase tracking-wider text-white/60 mb-1">Live Pressure</p>
                <p className="text-sm text-white/80">Use this real-time value to understand current system state.</p>
              </div>
              <div className="flex items-end gap-2 text-signal">
                <span className="text-4xl font-mono font-bold leading-none">{(telemetry.currentPressureKPa * 10).toFixed(1)}</span>
                <span className="text-sm font-semibold pb-1">hPa</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Window Size */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-ink">Window Size (samples)</label>
                <p className="text-xs text-muted mb-2">Number of recent readings to analyze for ripples.</p>
                <input 
                  type="number" 
                  step="1"
                  value={windowSize}
                  onChange={(e) => setWindowSize(e.target.value)}
                  className="w-full rounded-xl border-line bg-canvas px-4 py-2 outline-none focus:ring-2 focus:ring-signal"
                />
              </div>

              {/* Min Ripples */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-ink">Min Ripples</label>
                <p className="text-xs text-muted mb-2">Minimum number of pressure direction changes to flag a leak.</p>
                <input 
                  type="number" 
                  step="1"
                  value={minRipples}
                  onChange={(e) => setMinRipples(e.target.value)}
                  className="w-full rounded-xl border-line bg-canvas px-4 py-2 outline-none focus:ring-2 focus:ring-signal"
                />
              </div>

              {/* Noise Margin */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-ink">Noise Margin (hPa)</label>
                <p className="text-xs text-muted mb-2">Minimum amplitude change to be considered a true movement (ignores jitter).</p>
                <input 
                  type="number" 
                  step="0.1"
                  value={noiseMargin}
                  onChange={(e) => setNoiseMargin(e.target.value)}
                  className="w-full rounded-xl border-line bg-canvas px-4 py-2 outline-none focus:ring-2 focus:ring-signal"
                />
              </div>

              {/* Volume */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-ink flex items-center gap-1"><CylinderIcon className="w-4 h-4" /> Tank Volume (Liters)</label>
                <p className="text-xs text-muted mb-2">Physical volume of the air receiver tank used for leak quantification.</p>
                <input 
                  type="number" 
                  step="0.1"
                  value={tankVolume}
                  onChange={(e) => setTankVolume(e.target.value)}
                  className="w-full rounded-xl border-line bg-canvas px-4 py-2 outline-none focus:ring-2 focus:ring-signal"
                />
              </div>

              {/* Tariff */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-ink flex items-center gap-1"><BanknoteIcon className="w-4 h-4" /> Electricity Unit Price (LKR/kWh)</label>
                <p className="text-xs text-muted mb-2">Current local cost of electricity to calculate financial loss.</p>
                <input 
                  type="number" 
                  step="1"
                  value={tariffLkr}
                  onChange={(e) => setTariffLkr(e.target.value)}
                  className="w-full rounded-xl border-line bg-canvas px-4 py-2 outline-none focus:ring-2 focus:ring-signal"
                />
              </div>

            </div>

            <div className="pt-4 border-t border-line flex justify-end">
              <button 
                onClick={handleSaveConfigs}
                disabled={isSaving}
                className={`flex items-center justify-center rounded-xl px-6 py-2 font-bold transition ${configSuccess ? 'bg-signal text-brand-deep' : 'bg-brand-deep text-white hover:bg-brand-deep/90'} ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {isSaving ? (
                  'Saving...'
                ) : configSuccess ? (
                  <><CheckIcon className="h-5 w-5 mr-2" /> Successfully Saved!</>
                ) : (
                  'Save Engine Parameters'
                )}
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
