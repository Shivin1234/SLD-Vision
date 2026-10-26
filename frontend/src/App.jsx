import React, { useState, useRef, useEffect } from 'react';

// Vibrant neon-accented color mapping for each electrical symbol class
const COMPONENT_COLORS = {
  'CIRCUIT BREAKER': '#38bdf8',                        // Cyber Sky Blue
  'CURRENT TRANSFORMER': '#10b981',                    // Emerald Neon Green
  'ISOLATOR': '#f59e0b',                               // Vivid Amber / Gold
  'HRC FUSE WITH BLOWN FUSE INDICATOR': '#f43f5e',     // Rose Red
  'PHASE INDICATOR LIGHTS': '#a855f7',                 // Electric Purple
  'SINGLE PHASE UNFUSED TAP OFF UNIT': '#ec4899',      // Hot Pink
  'ZERO PHASE SEQUENCE CURRENT TRANSFORMER': '#06b6d4',// Bright Cyan
  'DIGITAL EARTH LEAKAGE RELAY': '#6366f1',            // Indigo
  'EARTH LEAKAGE RELAY': '#14b8a6',                    // Teal
  'TIME DELAY RELAY': '#eab308',                       // Yellow
};

// Canvas Cropper Component for Zoomed Preview Modal
function CroppedSymbolCanvas({ previewUrl, box, compColor, width = 240, height = 240 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!previewUrl || !box || !canvasRef.current) return;
    const img = new Image();
    img.src = previewUrl;
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Add generous margin around the symbol to show wiring context
      const padX = Math.max(16, Math.round(box.w * 0.45));
      const padY = Math.max(16, Math.round(box.h * 0.45));

      const srcX = Math.max(0, box.x - padX);
      const srcY = Math.max(0, box.y - padY);
      const srcW = Math.min(img.width - srcX, box.w + padX * 2);
      const srcH = Math.min(img.height - srcY, box.h + padY * 2);

      // Background
      ctx.fillStyle = '#0a0f1d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw cropped CAD symbol
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);

      // Overlay bounding box on zoomed crop
      const scaleX = canvas.width / srcW;
      const scaleY = canvas.height / srcH;
      const boxRelX = (box.x - srcX) * scaleX;
      const boxRelY = (box.y - srcY) * scaleY;
      const boxRelW = box.w * scaleX;
      const boxRelH = box.h * scaleY;

      ctx.strokeStyle = compColor;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(boxRelX, boxRelY, boxRelW, boxRelH);

      // Soft corner crosshairs
      ctx.fillStyle = compColor;
      const crossSize = 5;
      ctx.fillRect(boxRelX - crossSize / 2, boxRelY - crossSize / 2, crossSize, crossSize);
      ctx.fillRect(boxRelX + boxRelW - crossSize / 2, boxRelY - crossSize / 2, crossSize, crossSize);
      ctx.fillRect(boxRelX - crossSize / 2, boxRelY + boxRelH - crossSize / 2, crossSize, crossSize);
      ctx.fillRect(boxRelX + boxRelW - crossSize / 2, boxRelY + boxRelH - crossSize / 2, crossSize, crossSize);
    };
  }, [previewUrl, box, compColor]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        display: 'block',
        borderRadius: '10px',
        border: `2px solid ${compColor}aa`,
        boxShadow: `0 8px 30px rgba(0, 0, 0, 0.8)`
      }}
    />
  );
}


const MODEL_OPTIONS = [
  { id: 'rtdetrv2', label: 'RT-DETRv2', description: 'Transformer detector', color: '#38bdf8', icon: '⚡' },
  { id: 'frcnn', label: 'Faster R-CNN', description: 'Two-stage detector with tiled inference', color: '#c084fc', icon: '🔬' },
  { id: 'retinanet', label: 'RetinaNet', description: 'One-stage detector', color: '#fbbf24', icon: '🎯' },
  { id: 'rtdetr_sahi', label: 'RT-DETR', description: 'Transformer with sliced inference', color: '#34d399', icon: '🧩' },
];

const formatApiResult = (data, fileName, width, height, latencyMs = null) => {
  const detections = (data.detections || []).map((d, index) => {
    let box = d.box;
    // Backend returns [x1, y1, x2, y2]; the existing UI uses x/y/w/h.
    if (Array.isArray(box)) {
      const [x1, y1, x2, y2] = box;
      box = { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
    } else if (box && box.x1 !== undefined) {
      box = { x: box.x1, y: box.y1, w: box.x2 - box.x1, h: box.y2 - box.y1 };
    } else if (box && box.w !== undefined) {
      box = { x: box.x, y: box.y, w: box.w, h: box.h };
    } else {
      box = { x: 0, y: 0, w: 0, h: 0 };
    }

    return {
      ...d,
      id: d.id ?? index + 1,
      name: d.name || d.class_name || d.tag || 'Unknown component',
      confidence: (Number(d.confidence ?? 0) <= 1 ? Number(d.confidence ?? 0) * 100 : Number(d.confidence ?? 0)),
      box,
    };
  });

  const counts = new Map();
  detections.forEach((d) => counts.set(d.name, (counts.get(d.name) || 0) + 1));
  const bom = Array.from(counts.entries()).map(([component, quantity]) => ({
    tag: component.split(' ').map((part) => part[0]).join('').slice(0, 6).toUpperCase(),
    component,
    quantity,
  }));

  return {
    fileName: data.file_name || data.fileName || fileName,
    width,
    height,
    total: data.total_components ?? detections.length,
    detections,
    bom,
    model_name: MODEL_OPTIONS.find((m) => m.id === data.model_name)?.label
      || MODEL_OPTIONS.find((m) => m.id === data.model_name)?.label
      || data.model_name
      || 'Detection model',
    latency_ms: latencyMs,
  };
};

export default function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  // UI Interactive States
  const [selectedModel, setSelectedModel] = useState('rtdetrv2');
  const [compareResult, setCompareResult] = useState(null);
  const [compareActiveTab, setCompareActiveTab] = useState('rtdetrv2');
  const [hoveredDetection, setHoveredDetection] = useState(null);
  const [hoveredCategory, setHoveredCategory] = useState(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');
  const [selectedDetectionIndex, setSelectedDetectionIndex] = useState(null);
  const [minConfidence, setMinConfidence] = useState(45);
  const [showBoxes, setShowBoxes] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const imageRef = useRef(null);
  const viewportRef = useRef(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedDetectionIndex(null);
        if (isFullscreen) setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // 1. Diagram Image Select
  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
      setResult(null);
      setCompareResult(null);
      setHoveredDetection(null);
      setHoveredCategory(null);
      setSelectedCategoryFilter('ALL');
      setSelectedDetectionIndex(null);
      setZoomLevel(1);
    }
  };

  // 2. Call FastAPI. Compare mode calls the same /api/predict endpoint once per model.
  const handleRunDetection = async () => {
    if (!file) return;
    setLoading(true);

    try {
      const imageInfo = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });

      const runModel = async (modelId) => {
        const formData = new FormData();
        formData.append('file', file);
        const startedAt = performance.now();
        const res = await fetch(`/api/predict?model_type=${encodeURIComponent(modelId)}`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`${MODEL_OPTIONS.find((m) => m.id === modelId)?.label || modelId}: ${res.status} ${errorText}`);
        }
        const data = await res.json();
        return {
          ...formatApiResult(data, file.name, imageInfo.width, imageInfo.height, performance.now() - startedAt),
          name: MODEL_OPTIONS.find((m) => m.id === modelId)?.label || modelId,
          modelId,
        };
      };

      if (selectedModel === 'compare') {
        // Run all four model endpoints against the same uploaded image.
        const entries = await Promise.all(
          MODEL_OPTIONS.map(async (model) => [model.id, await runModel(model.id)])
        );
        const modelsResult = Object.fromEntries(entries);
        const compareData = {
          fileName: file.name,
          width: imageInfo.width,
          height: imageInfo.height,
          models: modelsResult,
        };
        setCompareResult(compareData);
        setCompareActiveTab('rtdetrv2');
        setResult(modelsResult.rtdetrv2);
      } else {
        const modelResult = await runModel(selectedModel);
        setResult(modelResult);
        setCompareResult(null);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      alert(`❌ Detection Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 3. Export BOM to CSV
  const downloadCSV = () => {
    if (!result || !result.bom) return;
    let csv = "Tag,Electrical Component Name,Quantity\n";
    result.bom.forEach(item => {
      csv += `${item.tag},"${item.component}",${item.quantity}\n`;
    });
    csv += `[ALL],"TOTAL DETECTED SYMBOLS",${result.total}\n`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BOM_${result.fileName || 'SLD_Report'}.csv`;
    a.click();
  };

  // Filter detections based on category pill & confidence slider
  const filteredDetections = result
    ? result.detections.filter(d => {
        const passConf = d.confidence >= minConfidence;
        const passCat = selectedCategoryFilter === 'ALL' || d.name === selectedCategoryFilter;
        return passConf && passCat;
      })
    : [];

  const getColor = (compName) => COMPONENT_COLORS[compName] || '#38bdf8';

  const selectedDet = (selectedDetectionIndex !== null && filteredDetections[selectedDetectionIndex])
    ? filteredDetections[selectedDetectionIndex]
    : null;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at 15% 15%, #0d1a33 0%, #060912 85%)',
      color: '#f8fafc',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      padding: '24px 32px'
    }}>

      {/* Modern Glassmorphic Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(16px)',
        borderRadius: '16px',
        border: '1px solid rgba(56, 189, 248, 0.15)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px',
            boxShadow: '0 0 20px rgba(6, 182, 212, 0.5)'
          }}>
            ⚡
          </div>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: '22px',
              fontWeight: '800',
              letterSpacing: '-0.5px',
              background: 'linear-gradient(90deg, #f8fafc, #38bdf8)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              VoltAI • SLD CAD Symbol Intelligence
            </h1>
            <p style={{ margin: '2px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>
              Deep Learning Schematics Parser & Real-Time BOM Generation
            </p>
          </div>
        </div>

        {/* Status Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '12px',
            color: '#34d399',
            fontWeight: '600'
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 8px #10b981' }} />
            4 Models Available
          </div>

          <span style={{
            background: selectedModel === 'rtdetrv2'
              ? 'rgba(56, 189, 248, 0.15)'
              : selectedModel === 'frcnn'
              ? 'rgba(168, 85, 247, 0.15)'
              : selectedModel === 'retinanet' ? 'rgba(251, 191, 36, 0.15)' : selectedModel === 'rtdetr_sahi' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(245, 158, 11, 0.15)',
            color: selectedModel === 'rtdetrv2' ? '#38bdf8' : selectedModel === 'frcnn' ? '#c084fc' : selectedModel === 'rtdetr_sahi' ? '#34d399' : '#fbbf24',
            fontSize: '12px',
            fontWeight: '700',
            padding: '6px 14px',
            borderRadius: '20px',
            border: `1px solid ${
              selectedModel === 'rtdetrv2'
                ? 'rgba(56, 189, 248, 0.3)'
                : selectedModel === 'frcnn'
                ? 'rgba(168, 85, 247, 0.3)'
                : 'rgba(245, 158, 11, 0.3)'
            }`
          }}>
            {selectedModel === 'rtdetrv2' && '⚡ RT-DETRv2'}
            {selectedModel === 'frcnn' && '🔬 Faster R-CNN'}
            {selectedModel === 'retinanet' && '🎯 RetinaNet'}
            {selectedModel === 'rtdetr_sahi' && '🧩 RT-DETR'}
            {selectedModel === 'compare' && '⚖️ Four-Model Benchmark Mode'}
          </span>
        </div>
      </header>

      {/* Model Selector Bar */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(14px)',
        borderRadius: '16px',
        border: '1px solid rgba(56, 189, 248, 0.2)',
        padding: '14px 20px',
        marginBottom: '16px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '4px' }}>
            AI Model:
          </span>
          {MODEL_OPTIONS.map((model) => (
            <button
              key={model.id}
              onClick={() => {
                setSelectedModel(model.id);
                setCompareResult(null);
                setResult(null);
                setMinConfidence(0);
              }}
              style={{
                padding: '9px 13px',
                borderRadius: '10px',
                border: selectedModel === model.id ? `1.5px solid ${model.color}` : '1px solid rgba(255,255,255,0.1)',
                background: selectedModel === model.id ? `${model.color}20` : 'rgba(30, 41, 59, 0.6)',
                color: selectedModel === model.id ? model.color : '#94a3b8',
                fontWeight: '700',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {model.icon} {model.label}
            </button>
          ))}
          <button
            onClick={() => setSelectedModel('compare')}
            style={{
              padding: '9px 15px',
              borderRadius: '10px',
              border: selectedModel === 'compare' ? '1.5px solid #fbbf24' : '1px solid rgba(255,255,255,0.1)',
              background: selectedModel === 'compare' ? 'rgba(245,158,11,0.2)' : 'rgba(30,41,59,0.6)',
              color: selectedModel === 'compare' ? '#fbbf24' : '#94a3b8',
              fontWeight: '800',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            ⚖️ Compare All 4
          </button>
        </div>
        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '10px' }}>
          {selectedModel === 'compare'
            ? 'Runs Faster R-CNN, RetinaNet, RT-DETR, and RT-DETRv2 on the same image.'
            : MODEL_OPTIONS.find((model) => model.id === selectedModel)?.description}
        </div>
      </div>

      {/* Action Control Panel */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(14px)',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '16px 22px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '24px',
        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.4)'
      }}>
        
        {/* Upload & Run Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <label style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '11px 20px',
            background: 'rgba(30, 41, 59, 0.8)',
            color: '#f1f5f9',
            borderRadius: '10px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.2s'
          }}>
            📁 {file ? file.name.slice(0, 24) + (file.name.length > 24 ? '...' : '') : 'Choose CAD Blueprint'}
            <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
          </label>

          <button
            onClick={handleRunDetection}
            disabled={!file || loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '11px 26px',
              background: loading
                ? '#475569'
                : selectedModel === 'frcnn'
                ? 'linear-gradient(135deg, #7c3aed, #a855f7)'
                : selectedModel === 'compare'
                ? 'linear-gradient(135deg, #d97706, #f59e0b)'
                : 'linear-gradient(135deg, #0284c7, #06b6d4)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontWeight: '700',
              fontSize: '14px',
              cursor: (!file || loading) ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 4px 20px rgba(6, 182, 212, 0.45)',
              transition: 'all 0.2s'
            }}
          >
            {loading ? (
              <>⏳ Scanning CAD Slices with AI...</>
            ) : selectedModel === 'compare' ? (
              <>⚖️ Run All 4 Models & Compare</>
            ) : selectedModel === 'frcnn' ? (
              <>🚀 Detect with Faster R-CNN</>
            ) : (
              <>🚀 Run Detection</>
            )}
          </button>
        </div>

        {/* Real-time Toggles & Confidence Slider */}
        {result && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
            
            {/* Slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#94a3b8' }}>
              <span>Confidence:</span>
              <input
                type="range"
                min="10"
                max="90"
                step="5"
                value={minConfidence}
                onChange={(e) => setMinConfidence(Number(e.target.value))}
                style={{ width: '100px', accentColor: '#06b6d4', cursor: 'pointer' }}
              />
              <span style={{ color: '#38bdf8', fontWeight: 'bold', minWidth: '35px' }}>{minConfidence}%</span>
            </div>

            {/* Toggle Rectangles */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', color: '#cbd5e1' }}>
              <input
                type="checkbox"
                checked={showBoxes}
                onChange={(e) => setShowBoxes(e.target.checked)}
                style={{ accentColor: '#06b6d4' }}
              />
              Rectangles
            </label>

            {/* Zoom Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(15, 23, 42, 0.8)', padding: '3px 8px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <button
                onClick={() => setZoomLevel(prev => Math.max(0.5, Number((prev - 0.25).toFixed(2))))}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px 8px', fontWeight: 'bold' }}
                title="Zoom Out"
              >-</button>
              <span style={{ fontSize: '12px', minWidth: '40px', textAlign: 'center', color: '#38bdf8', fontWeight: '700' }}>
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => setZoomLevel(prev => Math.min(3, Number((prev + 0.25).toFixed(2))))}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px 8px', fontWeight: 'bold' }}
                title="Zoom In"
              >+</button>
              {zoomLevel !== 1 && (
                <button
                  onClick={() => setZoomLevel(1)}
                  style={{ background: '#1e293b', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: '2px 8px', fontSize: '11px', borderRadius: '4px', marginLeft: '4px' }}
                >Reset</button>
              )}
            </div>

          </div>
        )}

      </div>

      {/* Four-Model Benchmark Comparison Dashboard */}
      {compareResult && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(16px)',
          borderRadius: '16px',
          border: '1.5px solid rgba(245, 158, 11, 0.35)',
          padding: '20px 24px',
          marginBottom: '24px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.5)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#fbbf24' }}>
                ⚖️ Four-Model Detection Benchmark
              </h2>
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                Same image submitted to all four backend models. Counts are detections, not accuracy metrics.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
            {MODEL_OPTIONS.map((model) => {
              const modelResult = compareResult.models[model.id];
              return (
                <button
                  key={model.id}
                  onClick={() => {
                    setCompareActiveTab(model.id);
                    setResult(modelResult);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: compareActiveTab === model.id ? `1px solid ${model.color}` : '1px solid rgba(255,255,255,0.1)',
                    background: compareActiveTab === model.id ? `${model.color}20` : 'transparent',
                    color: compareActiveTab === model.id ? model.color : '#94a3b8',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  {model.icon} {model.label} ({modelResult.total})
                </button>
              );
            })}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '650px' }}>
              <thead>
                <tr style={{ background: 'rgba(30, 41, 59, 0.6)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: '11px 12px', textAlign: 'left', color: '#94a3b8' }}>Metric</th>
                  {MODEL_OPTIONS.map((model) => (
                    <th key={model.id} style={{ padding: '11px 12px', textAlign: 'left', color: model.color }}>{model.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Detected components', value: (r) => r.total },
                  { label: 'Unique classes', value: (r) => r.bom?.length || 0 },
                  { label: 'Measured request time', value: (r) => `${(r.latency_ms / 1000).toFixed(2)} s` },
                ].map((metric) => (
                  <tr key={metric.label} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '12px', color: '#cbd5e1', fontWeight: '600' }}>{metric.label}</td>
                    {MODEL_OPTIONS.map((model) => (
                      <td key={model.id} style={{ padding: '12px', color: model.color, fontWeight: '800' }}>
                        {metric.value(compareResult.models[model.id])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '11px', lineHeight: 1.5, marginBottom: 0 }}>
            Request time is measured by the browser and includes network/API overhead. For model-quality comparison, evaluate precision, recall, and mAP against labelled validation images.
          </p>
        </div>
      )}

      {/* 4 Stat Overview Metric Cards */}
      {result && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
          marginBottom: '24px'
        }}>
          
          <div style={{
            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(15, 23, 42, 0.7))',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '12px',
            padding: '14px 18px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px' }}>
              🎯 Total Detected Symbols
            </div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: '#38bdf8', marginTop: '4px' }}>
              {result.total}
            </div>
            <div style={{ fontSize: '11px', color: '#34d399', marginTop: '2px', fontWeight: '600' }}>
              Model: {result.model_name || 'RT-DETR-L'}
            </div>
          </div>

          <div style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(15, 23, 42, 0.7))',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: '12px',
            padding: '14px 18px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px' }}>
              ⚡ Unique Component Classes
            </div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: '#34d399', marginTop: '4px' }}>
              {result.bom ? result.bom.length : 0}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              Categories Recognized
            </div>
          </div>

          <div style={{
            background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.12), rgba(15, 23, 42, 0.7))',
            border: '1px solid rgba(168, 85, 247, 0.25)',
            borderRadius: '12px',
            padding: '14px 18px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px' }}>
              ⏱️ Inference Latency
            </div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: '#c084fc', marginTop: '4px' }}>
              {result.latency_ms ? `${(result.latency_ms / 1000).toFixed(1)}s` : 'Real-Time'}
            </div>
            <div style={{ fontSize: '11px', color: '#38bdf8', marginTop: '2px' }}>
              {result.model_name?.includes('Faster') ? 'Two-Stage ResNet-50' : 'Transformer Engine'}
            </div>
          </div>

          <div style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(15, 23, 42, 0.7))',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: '12px',
            padding: '14px 18px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px' }}>
              📐 Blueprint Geometry
            </div>
            <div style={{ fontSize: '22px', fontWeight: '800', color: '#fbbf24', marginTop: '4px' }}>
              {result.width} × {result.height} px
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              Native CAD Canvas
            </div>
          </div>

        </div>
      )}

      {/* Interactive Category Filter Pills (Filter by Symbol Type) */}
      {result && result.bom && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '20px'
        }}>
          <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600', marginRight: '6px' }}>
            Filter View:
          </span>

          {/* ALL Pill */}
          <button
            onClick={() => setSelectedCategoryFilter('ALL')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: selectedCategoryFilter === 'ALL' ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
              background: selectedCategoryFilter === 'ALL' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.6)',
              color: selectedCategoryFilter === 'ALL' ? '#38bdf8' : '#cbd5e1',
              fontWeight: '700',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s'
            }}
          >
            <span>[ALL]</span>
            <span style={{ background: '#0f172a', padding: '1px 6px', borderRadius: '10px', fontSize: '10px' }}>
              {result.total}
            </span>
          </button>

          {/* Individual Category Pills */}
          {result.bom.map((cat, i) => {
            const compColor = getColor(cat.component);
            const isSelected = selectedCategoryFilter === cat.component;

            return (
              <button
                key={i}
                onClick={() => setSelectedCategoryFilter(isSelected ? 'ALL' : cat.component)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: isSelected ? `1.5px solid ${compColor}` : '1px solid rgba(255, 255, 255, 0.1)',
                  background: isSelected ? `${compColor}33` : 'rgba(30, 41, 59, 0.6)',
                  color: isSelected ? '#ffffff' : '#cbd5e1',
                  fontWeight: '600',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s'
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: compColor }} />
                <span>{cat.tag} {cat.component}</span>
                <span style={{
                  background: '#0f172a',
                  color: compColor,
                  fontWeight: '800',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  fontSize: '10px'
                }}>
                  {cat.quantity}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Grid: CAD Visualizer (Left) + BOM Details (Right) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 2fr) minmax(360px, 1fr)',
        gap: '24px',
        alignItems: 'start'
      }}>

        {/* LEFT COLUMN: Clean CAD Diagram Canvas */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(16px)',
          borderRadius: '16px',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          
          {/* Canvas Header */}
          <div style={{
            padding: '14px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(11, 17, 32, 0.85)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>📐</span>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#f8fafc', letterSpacing: '-0.3px' }}>
                Schematic Visualizer
              </h2>
              {result && (
                <span style={{
                  fontSize: '11px',
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  padding: '3px 10px',
                  borderRadius: '12px',
                  border: '1px solid rgba(56, 189, 248, 0.3)'
                }}>
                  {result.width} × {result.height} px
                </span>
              )}
            </div>

            {result && (
              <div style={{ fontSize: '12px', color: '#34d399', fontWeight: '700' }}>
                ✨ {filteredDetections.length} of {result.total} Symbols Displayed
                <span style={{ color: '#94a3b8', marginLeft: '6px', fontWeight: '400' }}>(Click box to inspect)</span>
              </div>
            )}
          </div>

          {/* Diagram Viewport */}
          <div
            ref={viewportRef}
            style={{
              position: 'relative',
              maxHeight: isFullscreen ? '90vh' : '720px',
              overflow: 'auto',
              background: '#070b14',
              padding: '18px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start'
            }}
          >
            {preview ? (
              <div
                style={{
                  position: 'relative',
                  display: 'inline-block',
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: 'top left',
                  transition: 'transform 0.15s ease-out'
                }}
              >
                {/* CAD Diagram Image */}
                <img
                  ref={imageRef}
                  src={preview}
                  alt="CAD Drawing"
                  style={{
                    display: 'block',
                    maxWidth: '100%',
                    borderRadius: '0px',
                    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.8)'
                  }}
                />

                {/* Clean Sharp Rectangular Bounding Boxes */}
                {result && showBoxes && filteredDetections.map((det, idx) => {
                  const compColor = getColor(det.name);
                  const isHovered = hoveredDetection === idx;
                  const isCategoryMatch = hoveredCategory === det.name;
                  const isSelected = selectedDetectionIndex === idx;

                  // Percentage Coordinates
                  const left = `${(det.box.x / result.width) * 100}%`;
                  const top = `${(det.box.y / result.height) * 100}%`;
                  const width = `${(det.box.w / result.width) * 100}%`;
                  const height = `${(det.box.h / result.height) * 100}%`;

                  const isNearTop = det.box.y < (result.height * 0.15);
                  const confidenceScore = Math.max(0, Math.min(100, det.confidence));

                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedDetectionIndex(idx)}
                      onMouseEnter={() => setHoveredDetection(idx)}
                      onMouseLeave={() => setHoveredDetection(null)}
                      style={{
                        position: 'absolute',
                        left,
                        top,
                        width,
                        height,
                        borderRadius: '0px',
                        border: isSelected
                          ? `3px solid #ffffff`
                          : (isHovered || isCategoryMatch
                            ? `2.5px solid ${compColor}`
                            : `1.5px solid ${compColor}ee`),
                        backgroundColor: isHovered || isCategoryMatch || isSelected
                          ? `${compColor}45`
                          : `${compColor}18`,
                        boxShadow: isSelected
                          ? `0 0 20px #ffffff, 0 0 30px ${compColor}`
                          : (isHovered || isCategoryMatch
                            ? `0 0 16px ${compColor}`
                            : 'none'),
                        cursor: 'pointer',
                        zIndex: isSelected ? 60 : (isHovered ? 50 : (isCategoryMatch ? 30 : 10)),
                        boxSizing: 'border-box',
                        transition: 'all 0.12s ease'
                      }}
                      title="Click to inspect electrical symbol"
                    >
                      {/* Hover Tooltip Card */}
                      {isHovered && !isSelected && (
                        <div style={{
                          position: 'absolute',
                          ...(isNearTop
                            ? { top: 'calc(100% + 6px)' }
                            : { bottom: 'calc(100% + 6px)' }),
                          left: '50%',
                          transform: 'translateX(-50%)',
                          backgroundColor: '#070b16',
                          color: '#ffffff',
                          border: `1.5px solid ${compColor}`,
                          borderRadius: '8px',
                          padding: '10px 14px',
                          fontSize: '12px',
                          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.9)',
                          whiteSpace: 'nowrap',
                          pointerEvents: 'none',
                          zIndex: 100,
                          minWidth: '200px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span style={{
                              backgroundColor: compColor,
                              color: '#fff',
                              fontSize: '11px',
                              fontWeight: '800',
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}>
                              {det.tag}
                            </span>
                            <span style={{ fontWeight: '700', color: '#f8fafc', fontSize: '13px' }}>
                              {det.name}
                            </span>
                          </div>

                          <div style={{ marginBottom: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                              <span>AI Certainty</span>
                              <span style={{ color: '#34d399', fontWeight: '800', fontSize: '12px' }}>
                                {confidenceScore.toFixed(1)}%
                              </span>
                            </div>
                            <div style={{
                              width: '100%',
                              height: '5px',
                              backgroundColor: '#1e293b',
                              borderRadius: '3px',
                              overflow: 'hidden'
                            }}>
                              <div style={{
                                width: `${confidenceScore}%`,
                                height: '100%',
                                backgroundColor: '#10b981',
                                borderRadius: '3px'
                              }} />
                            </div>
                          </div>

                          <div style={{
                            fontSize: '10px',
                            color: '#38bdf8',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            borderTop: '1px solid #1e293b',
                            paddingTop: '6px',
                            marginTop: '4px'
                          }}>
                            <span>🔍 Click to inspect symbol snapshot</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{
                padding: '90px 40px',
                textAlign: 'center',
                color: '#64748b'
              }}>
                <div style={{ fontSize: '46px', marginBottom: '14px' }}>📊</div>
                <div style={{ fontSize: '17px', fontWeight: '700', color: '#cbd5e1', marginBottom: '6px' }}>
                  No CAD Diagram Loaded
                </div>
                <div style={{ fontSize: '13px', maxWidth: '380px', margin: 'auto' }}>
                  Please upload an Electrical CAD schematic above to trigger AI symbol detection and BOM quantification.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Bill of Materials (BOM) Table */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(16px)',
          borderRadius: '16px',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          
          {/* BOM Header */}
          <div style={{
            padding: '14px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(11, 17, 32, 0.85)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>📋</span>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#f8fafc', letterSpacing: '-0.3px' }}>
                Bill of Materials (BOM)
              </h2>
            </div>

            {result && (
              <button
                onClick={downloadCSV}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  background: 'linear-gradient(135deg, #059669, #10b981)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '700',
                  fontSize: '12px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                  transition: 'all 0.2s'
                }}
              >
                📥 Export CSV
              </button>
            )}
          </div>

          {/* BOM Content */}
          <div style={{ padding: '16px' }}>
            {result ? (
              <>
                <div style={{
                  fontSize: '12px',
                  color: '#94a3b8',
                  marginBottom: '14px',
                  lineHeight: '1.4'
                }}>
                  💡 <em>Hover over any component row to spotlight all its symbols on the CAD diagram:</em>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '13px',
                    textAlign: 'left'
                  }}>
                    <thead>
                      <tr style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#94a3b8',
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.6px'
                      }}>
                        <th style={{ padding: '8px 6px' }}>Tag</th>
                        <th style={{ padding: '8px 6px' }}>Component Name</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right' }}>Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.bom.map((item, idx) => {
                        const compColor = getColor(item.component);
                        const isHovered = hoveredCategory === item.component;
                        const percentOfTotal = Math.round((item.quantity / result.total) * 100);

                        return (
                          <tr
                            key={idx}
                            onMouseEnter={() => setHoveredCategory(item.component)}
                            onMouseLeave={() => setHoveredCategory(null)}
                            onClick={() => setSelectedCategoryFilter(selectedCategoryFilter === item.component ? 'ALL' : item.component)}
                            style={{
                              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                              backgroundColor: isHovered ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                              cursor: 'pointer',
                              transition: 'background 0.15s'
                            }}
                          >
                            <td style={{ padding: '11px 6px' }}>
                              <span style={{
                                backgroundColor: `${compColor}25`,
                                border: `1px solid ${compColor}88`,
                                color: compColor,
                                fontWeight: '800',
                                fontSize: '11px',
                                padding: '3px 7px',
                                borderRadius: '4px'
                              }}>
                                {item.tag}
                              </span>
                            </td>
                            <td style={{ padding: '11px 6px' }}>
                              <div style={{ color: '#f1f5f9', fontWeight: '600' }}>
                                {item.component}
                              </div>
                              {/* Micro Progress Bar */}
                              <div style={{
                                width: '100%',
                                maxWidth: '140px',
                                height: '3px',
                                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                borderRadius: '2px',
                                marginTop: '4px',
                                overflow: 'hidden'
                              }}>
                                <div style={{
                                  width: `${percentOfTotal}%`,
                                  height: '100%',
                                  backgroundColor: compColor
                                }} />
                              </div>
                            </td>
                            <td style={{ padding: '11px 6px', textAlign: 'right', fontWeight: '800', color: '#f8fafc', fontSize: '14px' }}>
                              <span style={{
                                background: 'rgba(15, 23, 42, 0.8)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                padding: '3px 10px',
                                borderRadius: '12px'
                              }}>
                                {item.quantity}
                              </span>
                            </td>
                          </tr>
                        );
                      })}

                      {/* Total Row */}
                      <tr style={{
                        borderTop: '2px solid rgba(56, 189, 248, 0.3)',
                        fontWeight: '800',
                        fontSize: '13px'
                      }}>
                        <td style={{ padding: '14px 6px', color: '#38bdf8' }}>[ALL]</td>
                        <td style={{ padding: '14px 6px', color: '#f8fafc' }}>TOTAL DETECTED SYMBOLS</td>
                        <td style={{ padding: '14px 6px', textAlign: 'right', color: '#34d399', fontSize: '16px' }}>
                          {result.total}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: '#64748b' }}>
                Run detection to auto-generate the Bill of Materials table.
              </div>
            )}
          </div>

        </div>

      </div>

      {/* ========================================================================= */}
      {/* 🔍 CLICK TO INSPECT: CLEAN ZOOMED CROP MODAL */}
      {/* ========================================================================= */}
      {selectedDet && (
        <div
          onClick={() => setSelectedDetectionIndex(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(3, 7, 18, 0.88)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#0c1222',
              border: `1.5px solid ${getColor(selectedDet.name)}`,
              borderRadius: '16px',
              maxWidth: '680px',
              width: '100%',
              boxShadow: `0 24px 60px rgba(0, 0, 0, 0.9), 0 0 35px ${getColor(selectedDet.name)}40`,
              overflow: 'hidden',
              animation: 'fadeIn 0.2s ease-out'
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '16px 24px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(8, 12, 22, 0.95)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  backgroundColor: getColor(selectedDet.name),
                  color: '#fff',
                  fontWeight: '800',
                  fontSize: '12px',
                  padding: '3px 8px',
                  borderRadius: '4px'
                }}>
                  {selectedDet.tag}
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#f8fafc' }}>
                    {selectedDet.name}
                  </h3>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Symbol Inspection Spotlight (Element #{selectedDetectionIndex + 1} of {filteredDetections.length})
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSelectedDetectionIndex(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '18px',
                  cursor: 'pointer',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body: Clean Two Columns */}
            <div style={{
              padding: '24px',
              display: 'grid',
              gridTemplateColumns: '260px 1fr',
              gap: '24px',
              alignItems: 'start'
            }}>
              
              {/* Left Column: Zoomed Cropped Snapshot */}
              <div>
                <div style={{
                  fontSize: '12px',
                  fontWeight: '700',
                  color: '#cbd5e1',
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span>🔍</span> Zoomed CAD Symbol View
                </div>

                <CroppedSymbolCanvas
                  previewUrl={preview}
                  box={selectedDet.box}
                  compColor={getColor(selectedDet.name)}
                  width={260}
                  height={260}
                />
              </div>

              {/* Right Column: Clean Detection Certainty & Coordinates */}
              <div>

                {/* Calibrated AI Confidence Meter */}
                <div style={{
                  background: 'rgba(15, 23, 42, 0.8)',
                  padding: '16px 18px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  marginBottom: '16px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#94a3b8' }}>
                      AI Detection Certainty
                    </span>
                    <span style={{
                      fontSize: '22px',
                      fontWeight: '800',
                      color: '#34d399'
                    }}>
                      {Math.max(0, Math.min(100, selectedDet.confidence)).toFixed(1)}%
                    </span>
                  </div>

                  <div style={{
                    width: '100%',
                    height: '8px',
                    backgroundColor: '#1e293b',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${Math.max(0, Math.min(100, selectedDet.confidence)).toFixed(1)}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #059669, #34d399)',
                      borderRadius: '4px'
                    }} />
                  </div>
                  <div style={{ fontSize: '11px', color: '#34d399', marginTop: '6px', textAlign: 'right', fontWeight: '600' }}>
                    Model-reported confidence score
                  </div>
                </div>

                {/* CAD Coordinates & Dimensions */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px' }}>
                      Symbol Dimensions
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#38bdf8', marginTop: '3px' }}>
                      {selectedDet.box.w} × {selectedDet.box.h} px
                    </div>
                  </div>

                  <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px' }}>
                      CAD Coordinates
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: '#f1f5f9', marginTop: '3px' }}>
                      ({selectedDet.box.x}, {selectedDet.box.y})
                    </div>
                  </div>
                </div>

                {/* Tag Badge */}
                <div style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  marginTop: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Component Type: <strong style={{ color: getColor(selectedDet.name) }}>{selectedDet.name}</strong>
                  </div>
                  <span style={{
                    backgroundColor: getColor(selectedDet.name),
                    color: '#fff',
                    fontWeight: '800',
                    fontSize: '11px',
                    padding: '3px 8px',
                    borderRadius: '4px'
                  }}>
                    {selectedDet.tag}
                  </span>
                </div>

              </div>

            </div>

            {/* Modal Navigation Footer */}
            <div style={{
              padding: '14px 24px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(8, 12, 22, 0.95)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  disabled={selectedDetectionIndex === 0}
                  onClick={() => setSelectedDetectionIndex(prev => Math.max(0, prev - 1))}
                  style={{
                    padding: '8px 14px',
                    backgroundColor: selectedDetectionIndex === 0 ? 'rgba(30, 41, 59, 0.5)' : '#334155',
                    color: selectedDetectionIndex === 0 ? '#64748b' : '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: selectedDetectionIndex === 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  ← Previous Symbol
                </button>
                <button
                  disabled={selectedDetectionIndex >= filteredDetections.length - 1}
                  onClick={() => setSelectedDetectionIndex(prev => Math.min(filteredDetections.length - 1, prev + 1))}
                  style={{
                    padding: '8px 14px',
                    backgroundColor: selectedDetectionIndex >= filteredDetections.length - 1 ? 'rgba(30, 41, 59, 0.5)' : '#334155',
                    color: selectedDetectionIndex >= filteredDetections.length - 1 ? '#64748b' : '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: selectedDetectionIndex >= filteredDetections.length - 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  Next Symbol →
                </button>
              </div>

              <button
                onClick={() => setSelectedDetectionIndex(null)}
                style={{
                  padding: '8px 20px',
                  background: 'linear-gradient(135deg, #0284c7, #06b6d4)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Close Inspector (Esc)
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}