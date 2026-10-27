import React, { useEffect, useMemo, useRef, useState } from "react";

const MODELS = [
  { id: "rtdetrv2", label: "RT-DETRv2", color: "#0284c7", icon: "⚡", description: "Transformer detector" },
  { id: "frcnn", label: "Faster R-CNN", color: "#7c3aed", icon: "🔬", description: "Two-stage detector with tiled inference" },
  { id: "retinanet", label: "RetinaNet", color: "#d97706", icon: "🎯", description: "One-stage detector" },
  { id: "rtdetr_sahi", label: "RT-DETR", color: "#059669", icon: "🧩", description: "Transformer with sliced inference" },
];

const COMPONENT_COLORS = {
  "CIRCUIT BREAKER": "#0284c7",
  "CURRENT TRANSFORMER": "#059669",
  ISOLATOR: "#d97706",
  "HRC FUSE WITH BLOWN FUSE INDICATOR": "#e11d48",
  "PHASE INDICATOR LIGHTS": "#7c3aed",
  "SINGLE PHASE UNFUSED TAP OFF UNIT": "#db2777",
  "ZERO PHASE SEQUENCE CURRENT TRANSFORMER": "#0891b2",
  "DIGITAL EARTH LEAKAGE RELAY": "#4f46e5",
  "EARTH LEAKAGE RELAY": "#0d9488",
  "TIME DELAY RELAY": "#ca8a04",
};

const getColor = (name) => COMPONENT_COLORS[name] || "#0284c7";
const activeModelColor = (modelId) => MODELS.find((model) => model.id === modelId)?.color || "#0284c7";
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function normalizeResult(data, fileName, width, height, latencyMs, modelId) {
  const detections = (data.detections || []).map((d, i) => {
    let box = d.box;
    if (Array.isArray(box)) {
      const [x1, y1, x2, y2] = box;
      box = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    } else if (box && box.x1 !== undefined) {
      box = { x: box.x1, y: box.y1, w: box.x2 - box.x1, h: box.y2 - box.y1 };
    } else if (!box || box.w === undefined) {
      box = { x: 0, y: 0, w: 0, h: 0 };
    }
    const rawConfidence = Number(d.confidence ?? d.score ?? 0);
    const confidence = rawConfidence <= 1 ? rawConfidence * 100 : rawConfidence;
    const name = d.name || d.class_name || d.className || d.tag || "Unknown component";
    const tag = d.tag || name.split(/\s+/).map((part) => part[0] || "").join("").slice(0, 6).toUpperCase();
    return { ...d, id: d.id ?? i + 1, name, tag, confidence: clamp(confidence, 0, 100), box };
  });

  const counts = new Map();
  detections.forEach((d) => {
    const current = counts.get(d.name) || { quantity: 0, confidenceTotal: 0 };
    current.quantity += 1;
    current.confidenceTotal += d.confidence;
    counts.set(d.name, current);
  });
  const bom = Array.from(counts.entries()).map(([component, stats]) => ({
    tag: component.split(/\s+/).map((part) => part[0] || "").join("").slice(0, 6).toUpperCase(),
    component,
    quantity: stats.quantity,
    averageConfidence: stats.confidenceTotal / stats.quantity,
    percentOfDetections: detections.length ? (stats.quantity / detections.length) * 100 : 0,
  }));

  const model = MODELS.find((m) => m.id === modelId);
  return {
    fileName: data.file_name || data.fileName || fileName,
    width, height,
    total: data.total_components ?? detections.length,
    detections, bom,
    model_name: model?.label || data.model_name || "Detection model",
    modelId,
    latency_ms: latencyMs,
  };
}

function Button({ children, onClick, variant = "primary", disabled = false, style = {}, title }) {
  const variants = {
    primary: { background: "#0284c7", color: "#fff", border: "1px solid #0284c7" },
    secondary: { background: "#fff", color: "#334155", border: "1px solid #dbe3ed" },
    soft: { background: "#eff6ff", color: "#0369a1", border: "1px solid #bfdbfe" },
    success: { background: "#059669", color: "#fff", border: "1px solid #059669" },
  };
  return <button title={title} disabled={disabled} onClick={onClick} style={{
    ...variants[variant], borderRadius: 9, padding: "9px 13px", fontSize: 13,
    fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1, ...style
  }}>{children}</button>;
}

function CroppedSymbolCanvas({ previewUrl, box, compColor, width = 300, height = 260 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!previewUrl || !box || !canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const padX = Math.max(16, Math.round(box.w * 0.45));
      const padY = Math.max(16, Math.round(box.h * 0.45));
      const srcX = Math.max(0, box.x - padX);
      const srcY = Math.max(0, box.y - padY);
      const srcW = Math.max(1, Math.min(img.width - srcX, box.w + padX * 2));
      const srcH = Math.max(1, Math.min(img.height - srcY, box.h + padY * 2));
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = compColor;
      ctx.lineWidth = 3;
      ctx.strokeRect((box.x - srcX) * canvas.width / srcW, (box.y - srcY) * canvas.height / srcH,
        box.w * canvas.width / srcW, box.h * canvas.height / srcH);
    };
    img.src = previewUrl;
  }, [previewUrl, box, compColor]);
  return <canvas ref={canvasRef} width={width} height={height} style={{ display: "block", width: "100%", maxWidth: width, borderRadius: 10, border: `2px solid ${compColor}` }} />;
}

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("rtdetrv2");
  const [result, setResult] = useState(null);
  const [compareResult, setCompareResult] = useState(null);
  const [compareActiveTab, setCompareActiveTab] = useState("rtdetrv2");
  const [selectedCompareClass, setSelectedCompareClass] = useState("ALL");
  const [bomActiveModel, setBomActiveModel] = useState("rtdetrv2");
  const [minConfidence, setMinConfidence] = useState(0);
  const [showBoxes, setShowBoxes] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [compareZoom, setCompareZoom] = useState(1);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("ALL");
  const [hoveredDetection, setHoveredDetection] = useState(null);
  const [hoveredCategory, setHoveredCategory] = useState(null);
  const [selectedDetectionIndex, setSelectedDetectionIndex] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const imageRef = useRef(null);
  const viewportRef = useRef(null);

  const activeResult = result;
  const filteredDetections = useMemo(() => activeResult
    ? activeResult.detections.filter((d) =>
      d.confidence >= minConfidence && (selectedCategoryFilter === "ALL" || d.name === selectedCategoryFilter))
    : [], [activeResult, minConfidence, selectedCategoryFilter]);

  const selectedDet = selectedDetectionIndex !== null ? filteredDetections[selectedDetectionIndex] : null;

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setSelectedDetectionIndex(null);
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const resetViewState = () => {
    setSelectedCategoryFilter("ALL");
    setHoveredDetection(null);
    setHoveredCategory(null);
    setSelectedDetectionIndex(null);
    setMinConfidence(0);
    setZoomLevel(1);
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setResult(null);
    setCompareResult(null);
    resetViewState();
  };

  const runModel = async (modelId, imageInfo) => {
    const formData = new FormData();
    formData.append("file", file);
    const startedAt = performance.now();
    const response = await fetch(`/api/predict?model_type=${encodeURIComponent(modelId)}`, {
      method: "POST", body: formData
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${MODELS.find((m) => m.id === modelId)?.label || modelId}: ${response.status} ${body}`);
    }
    const data = await response.json();
    return normalizeResult(data, file.name, imageInfo.width, imageInfo.height, performance.now() - startedAt, modelId);
  };

  const handleRunDetection = async (modeOverride = null) => {
    const modeToRun = modeOverride || selectedModel;
    if (!file) {
      alert("Please choose an SLD image first.");
      return;
    }
    setLoading(true);
    try {
      const imageInfo = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error("Could not read the selected image."));
        img.src = URL.createObjectURL(file);
      });
      if (modeToRun === "compare") {
        const entries = await Promise.all(MODELS.map(async (m) => [m.id, await runModel(m.id, imageInfo)]));
        const models = Object.fromEntries(entries);
        setCompareResult({ fileName: file.name, width: imageInfo.width, height: imageInfo.height, models });
        setCompareActiveTab("rtdetrv2");
        setBomActiveModel("rtdetrv2");
        setResult(models.rtdetrv2);
        setPage("compare");
      } else {
        const modelResult = await runModel(selectedModel, imageInfo);
        setResult(modelResult);
        setCompareResult(null);
        setBomActiveModel(selectedModel);
        setPage("dashboard");
      }
      resetViewState();
    } catch (error) {
      console.error("Detection request failed:", error);
      alert(`Detection failed: ${error.message}\n\nCheck that the FastAPI backend is running and the Vite proxy points to it.`);
    } finally {
      setLoading(false);
    }
  };

  const selectCompareModel = (modelId) => {
    setSelectedCompareClass("ALL");
    setCompareActiveTab(modelId);
    setBomActiveModel(modelId);
    setResult(compareResult?.models?.[modelId] || null);
    resetViewState();
  };

  const downloadCSV = (targetResult = result) => {
    if (!targetResult) return;
    const escapeCSV = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["Tag", "Electrical Component Name", "Quantity", "Average Confidence (%)", "Share of Detections (%)"],
      ...targetResult.bom.map((item) => [item.tag, item.component, item.quantity, item.averageConfidence.toFixed(2), item.percentOfDetections.toFixed(2)]),
      ["ALL", "TOTAL DETECTED SYMBOLS", targetResult.total, "", ""],
      [],
      ["Detection ID", "Component", "Confidence (%)", "X", "Y", "Width", "Height"],
      ...targetResult.detections.map((d, i) => [d.id ?? i + 1, d.name, d.confidence.toFixed(2), d.box.x.toFixed(2), d.box.y.toFixed(2), d.box.w.toFixed(2), d.box.h.toFixed(2)])
    ];
    const csv = rows.map((row) => row.map(escapeCSV).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BOM_${targetResult.model_name.replace(/[^a-z0-9]+/gi, "_")}_${targetResult.fileName || "SLD"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAnnotatedImage = (targetResult = result) => {
    if (!preview || !targetResult) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = targetResult.width || img.naturalWidth;
      canvas.height = targetResult.height || img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      targetResult.detections
        .filter((d) => d.confidence >= minConfidence && (selectedCategoryFilter === "ALL" || d.name === selectedCategoryFilter))
        .forEach((d) => {
          const color = getColor(d.name);
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(2, canvas.width / 900);
          ctx.strokeRect(d.box.x, d.box.y, d.box.w, d.box.h);
          const label = `${d.name} ${d.confidence.toFixed(1)}%`;
          ctx.font = `${Math.max(12, canvas.width / 120)}px Arial`;
          const textWidth = ctx.measureText(label).width;
          const labelY = Math.max(0, d.box.y - 22);
          ctx.fillStyle = color;
          ctx.fillRect(d.box.x, labelY, textWidth + 10, 22);
          ctx.fillStyle = "#fff";
          ctx.fillText(label, d.box.x + 5, labelY + 15);
        });
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Annotated_${targetResult.model_name.replace(/[^a-z0-9]+/gi, "_")}_${targetResult.fileName || "SLD"}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    };
    img.onerror = () => alert("Unable to create annotated image from the selected file.");
    img.src = preview;
  };

  const resultForBom = compareResult ? (compareResult.models[bomActiveModel] || result) : result;
  const pageTitle = page === "dashboard" ? "Dashboard" : page === "compare" ? "Compare models" : "BOM & Export";
  const pageSubtitle = page === "dashboard"
    ? "Run an individual detector and inspect its SLD predictions."
    : page === "compare"
      ? "Run all four models on the same drawing and compare their outputs."
      : "Review model-specific component quantities and confidence scores.";

  const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, boxShadow: "0 3px 12px rgba(15,23,42,0.04)" };
  const muted = { color: "#64748b" };
  const sectionTitle = { margin: 0, fontSize: 15, fontWeight: 800, color: "#0f172a" };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f8fc", color: "#0f172a", fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; }
        button, input { font: inherit; }
        button:focus-visible, input:focus-visible { outline: 3px solid #bae6fd; outline-offset: 2px; }
        .voltai-nav:hover { background: #eff6ff !important; }
        .voltai-row:hover { background: #f8fafc; }
        @media (max-width: 900px) {
          .voltai-shell { flex-direction: column !important; }
          .voltai-sidebar { width: 100% !important; position: static !important; }
          .voltai-main-grid { grid-template-columns: 1fr !important; }
          .voltai-stats { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .voltai-topbar { align-items: flex-start !important; flex-direction: column !important; }
        }
        @media (max-width: 560px) {
          .voltai-stats { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div className="voltai-shell" style={{ display: "flex", minHeight: "100vh" }}>
        <aside className="voltai-sidebar" style={{ width: 248, flexShrink: 0, background: "#fff", borderRight: "1px solid #e2e8f0", padding: "24px 16px", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "0 8px 28px" }}>
            <div style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: 12, color: "#fff", fontSize: 22, background: "linear-gradient(135deg,#0284c7,#38bdf8)" }}>⚡</div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 17, letterSpacing: "-.4px" }}>VoltAI</div>
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>SLD SYMBOL INTELLIGENCE</div>
            </div>
          </div>
          <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 800, letterSpacing: 1, padding: "0 12px 10px" }}>WORKSPACE</div>
          {[
            { id: "dashboard", icon: "▦", label: "Dashboard" },
            { id: "compare", icon: "⇄", label: "Compare Models" },
            { id: "bom", icon: "▤", label: "BOM & Export" },
          ].map((item) => (
            <button key={item.id} className="voltai-nav" onClick={() => setPage(item.id)} style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", border: 0,
              padding: "12px 14px", marginBottom: 5, borderRadius: 10, cursor: "pointer",
              color: page === item.id ? "#0369a1" : "#475569", background: page === item.id ? "#e0f2fe" : "transparent",
              fontWeight: page === item.id ? 800 : 600, fontSize: 13,
            }}>
              <span style={{ fontSize: 18, width: 22, textAlign: "center" }}>{item.icon}</span>{item.label}
              {page === item.id && <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: 99, background: "#0284c7" }} />}
            </button>
          ))}
          <div style={{ marginTop: "auto", padding: "15px 13px", borderRadius: 14, background: "linear-gradient(145deg,#f8fbff,#eff6ff)", border: "1px solid #dbeafe", boxShadow: "0 4px 14px rgba(2,132,199,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 9, height: 9, background: "#10b981", borderRadius: 99, boxShadow: "0 0 0 3px #d1fae5" }} />
              <span style={{ fontSize: 12, fontWeight: 850, color: "#0f172a" }}>4 detection models</span>
              <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 900, letterSpacing: ".4px", color: "#0369a1", background: "#dbeafe", borderRadius: 5, padding: "3px 5px" }}>READY</span>
            </div>
            <p style={{ color: "#64748b", fontSize: 11, lineHeight: 1.55, margin: "10px 0 0" }}>Upload a schematic, inspect detections, and export model-specific BOMs.</p>
          </div>
        </aside>

        <main style={{ minWidth: 0, flex: 1, padding: "28px clamp(16px, 3vw, 38px) 44px" }}>
          <header className="voltai-topbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 11, color: "#0284c7", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 900, marginBottom: 7 }}>VoltAI workspace</div>
              <h1 style={{ fontSize: 27, lineHeight: 1.2, margin: 0, letterSpacing: "-.8px", fontWeight: 900 }}>{pageTitle}</h1>
              <p style={{ ...muted, margin: "8px 0 0", fontSize: 13 }}>{pageSubtitle}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ border: "1px solid #bbf7d0", color: "#047857", background: "#f0fdf4", borderRadius: 99, padding: "7px 11px", fontSize: 11, fontWeight: 800 }}>● SLD Vision Workspace</span>
              {result && <span style={{ border: "1px solid #dbeafe", color: "#1d4ed8", background: "#eff6ff", borderRadius: 99, padding: "7px 11px", fontSize: 11, fontWeight: 800 }}>{result.model_name}</span>}
            </div>
          </header>

          {/* Dashboard: individual model detection and original interactive SLD viewer */}
          {page === "dashboard" && <>
            <section style={{ ...card, padding: 18, marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 15 }}>
                <div>
                  <h2 style={sectionTitle}>Detection setup</h2>
                  <p style={{ ...muted, fontSize: 12, margin: "5px 0 0" }}>Choose one model for an individual analysis. Compare all four on the Compare Models page.</p>
                </div>
                <label style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>SLD image
                  <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: "block", marginTop: 7, maxWidth: 300, width: "100%", padding: 9, border: "1px solid #bae6fd", borderRadius: 10, background: "#f0f9ff", color: "#334155", fontSize: 12, cursor: "pointer" }} />
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 10, marginBottom: 15 }}>
                {MODELS.map((model) => <button key={model.id} onClick={() => { setSelectedModel(model.id); setResult(null); setCompareResult(null); resetViewState(); }} style={{
                  textAlign: "left", padding: 13, borderRadius: 11, border: selectedModel === model.id ? `2px solid ${model.color}` : "1px solid #e2e8f0",
                  background: selectedModel === model.id ? `${model.color}0d` : "#fff", cursor: "pointer"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{model.icon}</span>
                    <span style={{ fontWeight: 800, fontSize: 12, color: "#1e293b" }}>{model.label}</span>
                  </div>
                  <div style={{ fontSize: 11, ...muted, marginTop: 7 }}>{model.description}</div>
                </button>)}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 13, flexWrap: "wrap" }}>
                <Button onClick={handleRunDetection} disabled={!file || loading}>{loading ? "⏳ Running detection…" : `▶ Run ${MODELS.find((m) => m.id === selectedModel)?.label || "model"} detection`}</Button>
                <span style={{ ...muted, fontSize: 12 }}>{file ? `Selected: ${file.name}` : "Choose a JPG, PNG, or other browser-supported image."}</span>
              </div>
            </section>

            {result && <>
              <div className="voltai-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, marginBottom: 18 }}>
                {[
                  ["Detected symbols", result.total, "#0284c7"],
                  ["Unique classes", result.bom.length, "#059669"],
                  ["Request time", `${(result.latency_ms / 1000).toFixed(2)} s`, "#7c3aed"],
                  ["Image dimensions", `${result.width} × ${result.height}`, "#d97706"],
                ].map(([label, value, color]) => <div key={label} style={{ ...card, padding: 16 }}>
                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>{label}</div>
                  <div style={{ color, fontSize: 24, fontWeight: 900, marginTop: 8, overflowWrap: "anywhere" }}>{value}</div>
                </div>)}
              </div>
              <div style={{ ...card, padding: 16, marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <label style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>Confidence threshold <strong style={{ color: "#0284c7" }}>{minConfidence}%</strong>
                      <input aria-label="Confidence threshold" type="range" min="0" max="95" step="1" value={minConfidence} onChange={(e) => { setMinConfidence(Number(e.target.value)); setSelectedDetectionIndex(null); }} style={{ display: "block", width: 210, accentColor: "#0284c7", marginTop: 7 }} />
                    </label>
                    <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 12, fontWeight: 700, color: "#475569" }}><input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> Bounding boxes</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <Button variant="secondary" onClick={() => setZoomLevel((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}>−</Button>
                      <span style={{ fontSize: 12, fontWeight: 800, minWidth: 42, textAlign: "center" }}>{Math.round(zoomLevel * 100)}%</span>
                      <Button variant="secondary" onClick={() => setZoomLevel((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}>+</Button>
                      <Button variant="secondary" onClick={() => setZoomLevel(1)}>Reset</Button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button variant="secondary" onClick={() => setIsFullscreen(true)}>⛶ Fullscreen viewer</Button>
                    <Button variant="secondary" onClick={() => downloadAnnotatedImage(result)}>↓ Annotated image</Button>
                    <Button variant="success" onClick={() => downloadCSV(result)}>↓ Export BOM CSV</Button>
                  </div>
                </div>
                <div style={{ marginTop: 16, display: "flex", gap: 7, flexWrap: "wrap" }}>
                  <button onClick={() => setSelectedCategoryFilter("ALL")} style={pillStyle(selectedCategoryFilter === "ALL", "#0284c7")}>All ({result.detections.length})</button>
                  {result.bom.map((item) => <button key={item.component} onClick={() => setSelectedCategoryFilter(selectedCategoryFilter === item.component ? "ALL" : item.component)} style={pillStyle(selectedCategoryFilter === item.component, getColor(item.component))}>{item.component} ({item.quantity})</button>)}
                </div>
              </div>
              <div className="voltai-main-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.65fr) minmax(320px,0.9fr)", gap: 18, alignItems: "start" }}>
                <section style={{ ...card, overflow: "hidden" }}>
                  <div style={{ padding: "15px 17px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <h2 style={sectionTitle}>Schematic visualizer</h2>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#059669" }}>{filteredDetections.length} of {result.total} displayed · click a box to inspect</span>
                  </div>
                  <div ref={viewportRef} style={{ maxHeight: isFullscreen ? "none" : "72vh", overflow: "auto", padding: 12, background: "#f8fafc" }}>
                    <div style={{ position: "relative", display: "inline-block", minWidth: "100%", transform: `scale(${zoomLevel})`, transformOrigin: "top left" }}>
                      <img ref={imageRef} src={preview} alt="Uploaded SLD drawing" style={{ display: "block", width: "100%", height: "auto", border: "1px solid #e2e8f0" }} />
                      {showBoxes && filteredDetections.map((det, idx) => {
                        const color = getColor(det.name);
                        const hovered = hoveredDetection === idx || hoveredCategory === det.name;
                        const nearTop = det.box.y < result.height * 0.15;
                        return <div key={`${det.id}-${idx}`} role="button" tabIndex={0} title="Click to inspect symbol" onClick={() => setSelectedDetectionIndex(idx)} onKeyDown={(e) => { if (e.key === "Enter") setSelectedDetectionIndex(idx); }} onMouseEnter={() => setHoveredDetection(idx)} onMouseLeave={() => setHoveredDetection(null)} style={{
                          position: "absolute", left: `${det.box.x / result.width * 100}%`, top: `${det.box.y / result.height * 100}%`,
                          width: `${det.box.w / result.width * 100}%`, height: `${det.box.h / result.height * 100}%`,
                          border: `${hovered ? 3 : 1.5}px solid ${color}`, background: hovered ? `${color}30` : `${color}12`,
                          cursor: "pointer", zIndex: hovered ? 20 : 2, boxSizing: "border-box"
                        }}>
                          {hovered && <div style={{ position: "absolute", [nearTop ? "top" : "bottom"]: "calc(100% + 5px)", left: "50%", transform: "translateX(-50%)", background: "#fff", color: "#0f172a", border: `1px solid ${color}`, borderRadius: 8, padding: "8px 10px", minWidth: 170, maxWidth: 260, boxShadow: "0 8px 24px #0f172a22", fontSize: 11, whiteSpace: "normal", pointerEvents: "none", zIndex: 100 }}>
                            <strong>{det.name}</strong><div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, color: "#047857", fontWeight: 800 }}><span>Confidence</span><span>{det.confidence.toFixed(1)}%</span></div><div style={{ height: 6, background: "#e2e8f0", borderRadius: 99, overflow: "hidden", marginTop: 5 }}><div style={{ height: "100%", width: `${det.confidence}%`, background: color, borderRadius: 99 }} /></div><div style={{ color: "#64748b", marginTop: 5 }}>Click to magnify symbol</div>
                          </div>}
                        </div>;
                      })}
                    </div>
                  </div>
                </section>

                <section style={{ ...card, overflow: "hidden" }}>
                  <div style={{ padding: "15px 17px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <h2 style={sectionTitle}>Bill of materials</h2>
                    <Button variant="success" onClick={() => downloadCSV(result)}>Export CSV</Button>
                  </div>
                  <div style={{ padding: 16 }}>
                    <p style={{ ...muted, fontSize: 12, lineHeight: 1.5, marginTop: 0 }}>Hover over a component to highlight its boxes. Confidence is the average model-reported confidence for that class.</p>
                    <div style={{ overflowX: "auto" }}><table style={tableStyle}>
                      <thead><tr><th style={thStyle}>Tag</th><th style={thStyle}>Component</th><th style={{ ...thStyle, textAlign: "right" }}>Qty</th><th style={{ ...thStyle, textAlign: "right" }}>Avg. confidence</th></tr></thead>
                      <tbody>{result.bom.map((item) => <tr key={item.component} className="voltai-row" onMouseEnter={() => setHoveredCategory(item.component)} onMouseLeave={() => setHoveredCategory(null)} onClick={() => setSelectedCategoryFilter(item.component)} style={{ cursor: "pointer", background: hoveredCategory === item.component ? "#f0f9ff" : "#fff" }}>
                        <td style={tdStyle}><span style={{ background: `${getColor(item.component)}15`, color: getColor(item.component), borderRadius: 5, padding: "4px 6px", fontWeight: 900, fontSize: 10 }}>{item.tag}</span></td>
                        <td style={tdStyle}><div style={{ fontSize: 12, fontWeight: 700 }}>{item.component}</div><div style={{ height: 3, background: "#e2e8f0", borderRadius: 9, marginTop: 6, maxWidth: 130 }}><div style={{ height: 3, width: `${item.percentOfDetections}%`, background: getColor(item.component), borderRadius: 9 }} /></div></td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 900 }}>{item.quantity}</td>
                        <td style={{ ...tdStyle, textAlign: "right", color: "#047857", fontWeight: 800 }}>{item.averageConfidence.toFixed(1)}%</td>
                      </tr>)}
                      <tr style={{ background: "#f8fafc" }}><td style={tdStyle}>ALL</td><td style={{ ...tdStyle, fontWeight: 900 }}>TOTAL DETECTED SYMBOLS</td><td style={{ ...tdStyle, textAlign: "right", fontWeight: 900 }}>{result.total}</td><td style={{ ...tdStyle, textAlign: "right" }}>—</td></tr></tbody>
                    </table></div>
                    <h3 style={{ ...sectionTitle, marginTop: 22, marginBottom: 10 }}>Individual detections</h3>
                    <div style={{ maxHeight: 260, overflow: "auto" }}>{filteredDetections.map((det, i) => <button key={`${det.id}-${i}`} onClick={() => setSelectedDetectionIndex(i)} style={{ display: "flex", width: "100%", textAlign: "left", justifyContent: "space-between", alignItems: "center", gap: 10, border: 0, borderBottom: "1px solid #edf2f7", background: "#fff", padding: "10px 2px", cursor: "pointer" }}>
                      <span><span style={{ color: getColor(det.name), fontWeight: 900, marginRight: 7 }}>●</span><span style={{ fontSize: 11, fontWeight: 700 }}>{det.name}</span><span style={{ display: "block", marginLeft: 18, marginTop: 3, fontSize: 10, color: "#94a3b8" }}>Detection #{det.id}</span></span>
                      <strong style={{ fontSize: 12, color: "#047857", whiteSpace: "nowrap" }}>{det.confidence.toFixed(1)}%</strong>
                    </button>)}</div>
                  </div>
                </section>
              </div>
            </>}
            {!result && <div style={{ ...card, padding: "58px 22px", textAlign: "center" }}>
              <div style={{ fontSize: 38, marginBottom: 12 }}>⌁</div><h2 style={sectionTitle}>Start with an SLD drawing</h2><p style={{ ...muted, fontSize: 13, maxWidth: 480, margin: "9px auto 0", lineHeight: 1.6 }}>Upload your single-line diagram, choose a detector, and run inference to view component boxes, confidence scores, and the generated bill of materials.</p>
            </div>}
          </>}

          {/* Compare Models page: keeps the four-model run and benchmark metrics */}
          {page === "compare" && <>
            <section style={{ ...card, padding: 18, marginBottom: 18 }}>
              <h2 style={sectionTitle}>Four-model benchmark</h2>
              <p style={{ ...muted, fontSize: 12, margin: "6px 0 16px" }}>The same image is sent to all four model endpoints. Detection count is not the same as accuracy.</p>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <label style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>SLD image
                  <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: "block", marginTop: 10, maxWidth: 320, width: "100%", padding: 10, border: "1px solid #7dd3fc", borderRadius: 10, background: "#f0f9ff", color: "#334155", fontSize: 12, cursor: "pointer", boxShadow: "0 1px 2px rgba(15,23,42,0.05)" }} />
                </label>
                
                {file && <span style={{ fontSize: 12, ...muted }}>{file.name}</span>}
                <Button
                  onClick={() => handleRunDetection("compare")}
                  disabled={!file || loading}
                  style={{ alignSelf: "flex-end" }}
                >
                  {loading ? "⏳ Running comparison…" : "▶ Run comparison"}
                </Button>
              </div>
            </section>
            {compareResult ? <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 18 }}>
                {MODELS.map((model) => {
                  const r = compareResult.models[model.id];
                  return <div key={model.id} style={{ ...card, padding: 16, borderTop: `3px solid ${model.color}` }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>{model.icon} {model.label}</div>
                    <div style={{ fontSize: 29, fontWeight: 900, color: model.color, marginTop: 12 }}>{r.total}</div>
                    <div style={{ fontSize: 11, ...muted }}>detected components</div>
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={muted}>Unique classes</span><strong>{r.bom.length}</strong></div>
                    <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={muted}>Request time</span><strong>{(r.latency_ms / 1000).toFixed(2)} s</strong></div>
                    <Button variant={compareActiveTab === model.id ? "soft" : "secondary"} onClick={() => selectCompareModel(model.id)} style={{ width: "100%", marginTop: 13 }}>View model results</Button>
                  </div>;
                })}
              </div>
              <section style={{ ...card, padding: 18, marginBottom: 18 }}>
                <h2 style={sectionTitle}>Comparison table</h2>
                <div style={{ overflowX: "auto", marginTop: 14 }}><table style={{ ...tableStyle, minWidth: 650 }}>
                  <thead><tr><th style={thStyle}>Metric</th>{MODELS.map((m) => <th key={m.id} style={{ ...thStyle, color: m.color }}>{m.label}</th>)}</tr></thead>
                  <tbody>{[
                    ["Detected components", (r) => r.total],
                    ["Unique component classes", (r) => r.bom.length],
                    ["Measured request time", (r) => `${(r.latency_ms / 1000).toFixed(2)} s`],
                  ].map(([label, value]) => <tr key={label}><td style={{ ...tdStyle, fontWeight: 800 }}>{label}</td>{MODELS.map((m) => <td key={m.id} style={{ ...tdStyle, fontWeight: 900, color: m.color }}>{value(compareResult.models[m.id])}</td>)}</tr>)}</tbody>
                </table></div>
                <p style={{ fontSize: 11, ...muted, lineHeight: 1.6, marginBottom: 0 }}>Request time is measured in the browser and includes API/network overhead. Use labelled validation data and precision/recall/mAP to compare model quality.</p>
              </section>
              <section style={{ ...card, padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div><h2 style={sectionTitle}>Model-by-model annotated output</h2><p style={{ ...muted, fontSize: 12, margin: "5px 0 0" }}>Select a model below to switch to its own bounding boxes, labels, and component breakdown.</p></div>
                  <Button onClick={() => { setBomActiveModel(compareActiveTab); setResult(compareResult.models[compareActiveTab]); setPage("bom"); }}>Open selected model BOM →</Button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 8, marginTop: 15 }}>
                  {MODELS.map((m) => <button key={m.id} onClick={() => selectCompareModel(m.id)} style={{ ...pillStyle(compareActiveTab === m.id, m.color), padding: "12px 10px", textAlign: "left", borderRadius: 10, minHeight: 64 }}>
                    <span style={{ display: "block", fontWeight: 850 }}>{m.icon} {m.label}</span><span style={{ display: "block", fontSize: 11, marginTop: 5, opacity: .85 }}>{compareResult.models[m.id].total} detections · {compareResult.models[m.id].bom.length} classes</span>
                  </button>)}
                </div>
                {(() => { const active = compareResult.models[compareActiveTab]; const visibleDetections = active.detections.filter((d) => d.confidence >= minConfidence && (selectedCompareClass === "ALL" || d.name === selectedCompareClass)); const visibleComponents = active.bom.filter((item) => item.averageConfidence >= minConfidence); return <>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 16, marginBottom: 12, padding: "12px 14px", border: "1px solid #dbeafe", borderRadius: 11, background: "#f8fbff" }}>
                    <div style={{ minWidth: 175, flex: "0 1 220px" }}><label htmlFor="compare-confidence-threshold" style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, fontWeight: 800, color: "#334155" }}><span>Confidence threshold</span><strong style={{ color: "#0284c7" }}>{minConfidence}%</strong></label><input id="compare-confidence-threshold" aria-label="Compare models confidence threshold" type="range" min="0" max="95" step="1" value={minConfidence} onChange={(e) => { setMinConfidence(Number(e.target.value)); setSelectedDetectionIndex(null); }} style={{display: "block",width: "160px",maxWidth: "100%",accentColor: "#0284c7",marginTop: 8,cursor: "pointer"}} /></div>
                    <div style={{ fontSize: 11, color: "#64748b" }}><strong style={{ color: "#0f172a" }}>{visibleDetections.length}</strong> of {active.detections.length} detections meet this threshold</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.65fr) minmax(250px,0.9fr)", gap: 14, alignItems: "start" }}>
                    <div style={{ border: "1px solid #dbe3ed", borderRadius: 12, overflow: "hidden", minWidth: 0 }}>
                      <div style={{ padding: "12px 14px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <strong style={{ fontSize: 13, color: activeModelColor(compareActiveTab) }}>{active.model_name} · Annotated image</strong><div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}><span style={{ fontSize: 11, ...muted }}>{active.total} detections</span><Button variant="secondary" onClick={() => setCompareZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))} disabled={compareZoom <= 0.5}>−</Button><span style={{ minWidth: 42, textAlign: "center", fontSize: 11, fontWeight: 800, color: "#334155" }}>{Math.round(compareZoom * 100)}%</span><Button variant="secondary" onClick={() => setCompareZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))} disabled={compareZoom >= 3}>+</Button><Button variant="secondary" onClick={() => setCompareZoom(1)} disabled={compareZoom === 1}>Reset</Button></div>
                      </div>
                      <div style={{ padding: 12, background: "#111827" }}>
                        {preview ? <div style={{ width: "100%", overflow: "auto", maxHeight: 720 }}><div style={{ position: "relative", width: `${100 * compareZoom}%`, lineHeight: 0, transformOrigin: "top left" }}>
                          <img src={preview} alt={`${active.model_name} annotated SLD`} style={{ display: "block", width: "100%", height: "auto", borderRadius: 5 }} />
                          {visibleDetections.map((d, i) => {
                            const isHovered = hoveredDetection === `compare-${i}` || hoveredCategory === d.name;
                            const nearTop = d.box.y < (active.height || 1) * 0.15;
                            return <div
                              key={`${compareActiveTab}-${d.id}-${i}`}
                              title={`${d.name} · ${d.confidence.toFixed(1)}%`}
                              onMouseEnter={() => setHoveredDetection(`compare-${i}`)}
                              onMouseLeave={() => setHoveredDetection(null)}
                              onClick={() => { setResult(active); setSelectedDetectionIndex(i); }}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.key === "Enter") { setResult(active); setSelectedDetectionIndex(i); } }}
                              style={{ position: "absolute", left: `${d.box.x / (active.width || 1) * 100}%`, top: `${d.box.y / (active.height || 1) * 100}%`, width: `${d.box.w / (active.width || 1) * 100}%`, height: `${d.box.h / (active.height || 1) * 100}%`, border: `${isHovered ? 3 : 2}px solid ${getColor(d.name)}`, background: isHovered ? `${getColor(d.name)}30` : `${getColor(d.name)}10`, boxSizing: "border-box", cursor: "pointer", zIndex: isHovered ? 30 : 2 }}>
                              <span style={{ position: "absolute", left: -1, top: -17, maxWidth: 160, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", background: getColor(d.name), color: "#fff", fontSize: 9, lineHeight: "15px", fontWeight: 800, padding: "0 3px", borderRadius: 2, pointerEvents: "none" }}>{d.name} {d.confidence.toFixed(0)}%</span>
                              {isHovered && <div style={{ position: "absolute", [nearTop ? "top" : "bottom"]: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", background: "#fff", color: "#0f172a", border: `1px solid ${getColor(d.name)}`, borderRadius: 9, padding: "9px 11px", width: 210, boxShadow: "0 10px 28px #0f172a33", fontSize: 11, lineHeight: 1.4, whiteSpace: "normal", pointerEvents: "none", zIndex: 100 }}>
                                <strong>{d.name}</strong>
                                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, color: "#047857", fontWeight: 800 }}><span>Confidence</span><span>{d.confidence.toFixed(1)}%</span></div>
                                <div style={{ height: 6, background: "#e2e8f0", borderRadius: 99, overflow: "hidden", marginTop: 5 }}><div style={{ height: "100%", width: `${d.confidence}%`, background: getColor(d.name), borderRadius: 99 }} /></div>
                                <div style={{ color: "#64748b", marginTop: 6 }}>Click box to magnify symbol</div>
                              </div>}
                            </div>;
                          })}
                        </div></div> : <div style={{ color: "#cbd5e1", padding: 40, textAlign: "center", lineHeight: 1.5 }}>The source image preview is unavailable. Re-upload the drawing and run the comparison again.</div>}
                      </div>
                      <div style={{ padding: "10px 13px", background: "#f8fafc", fontSize: 11, color: "#64748b" }}>Boxes and labels are rendered from the selected model's detections. Switch models above to inspect their individual outputs.{selectedCompareClass !== "ALL" ? ` Showing only: ${selectedCompareClass}.` : " Click a component class in the list to show only that class on the image."}</div>
                    </div>
                    <div style={{ border: "1px solid #dbe3ed", borderRadius: 12, overflow: "hidden", minWidth: 0 }}>
                      <div style={{ padding: "12px 14px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}><strong style={{ fontSize: 13 }}>Detected components</strong><p style={{ ...muted, fontSize: 11, margin: "4px 0 0" }}>{visibleComponents.length} component classes above threshold · {(active.latency_ms / 1000).toFixed(2)} s request time</p>{selectedCompareClass !== "ALL" && <button onClick={() => setSelectedCompareClass("ALL")} style={{ marginTop: 7, border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, padding: "4px 8px", color: "#334155", fontSize: 10, fontWeight: 800, cursor: "pointer" }}>Show all classes ✕</button>}</div>
                      <div style={{ maxHeight: 440, overflow: "auto", padding: "4px 12px" }}>
                        {visibleComponents.length ? visibleComponents.map((item) => <button key={item.component} type="button" onClick={() => setSelectedCompareClass((current) => current === item.component ? "ALL" : item.component)} title={selectedCompareClass === item.component ? "Click to show all component classes" : `Show only ${item.component} detections`} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "11px 0", border: 0, borderBottom: "1px solid #edf2f7", background: selectedCompareClass === item.component ? "#eff6ff" : "transparent", textAlign: "left", cursor: "pointer", borderRadius: 5 }}>
                          <span style={{ width: 8, height: 8, flex: "0 0 8px", borderRadius: 3, background: getColor(item.component) }} />
                          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 11, fontWeight: 800, color: "#1e293b", lineHeight: 1.4 }}>{item.component}</div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b", marginTop: 6 }}><span>Share of detections</span><span>{item.percentOfDetections.toFixed(1)}%</span></div><div style={{ height: 4, width: "100%", maxWidth: 140, background: "#e8edf4", borderRadius: 5, marginTop: 3, overflow: "hidden" }}><div style={{ height: "100%", width: `${item.percentOfDetections}%`, background: getColor(item.component), borderRadius: 5 }} /></div><div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b", marginTop: 6 }}><span>Avg. confidence</span><strong style={{ color: "#047857" }}>{item.averageConfidence.toFixed(1)}%</strong></div><div style={{ height: 5, width: "100%", maxWidth: 140, background: "#e8edf4", borderRadius: 5, marginTop: 3, overflow: "hidden" }}><div style={{ height: "100%", width: `${item.averageConfidence}%`, background: "#059669", borderRadius: 5 }} /></div></div>
                          <span style={{ minWidth: 27, textAlign: "center", borderRadius: 7, padding: "4px 6px", background: "#f1f5f9", color: "#0f172a", fontSize: 12, fontWeight: 900 }}>{item.quantity}</span>
                        </button>) : <p style={{ ...muted, fontSize: 12, padding: 16 }}>No components detected by this model.</p>}
                      </div>
                      <div style={{ padding: 12, borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 900 }}><span>Total detections</span><span style={{ color: activeModelColor(compareActiveTab) }}>{active.total}</span></div>
                    </div>
                  </div>
                </>; })()}
              </section>
            </> : <div style={{ ...card, padding: "54px 20px", textAlign: "center" }}><h2 style={sectionTitle}>No comparison run yet</h2><p style={{ ...muted, fontSize: 13 }}>Choose an image above and run all four models to populate the comparison.</p></div>}
          </>}

          {/* BOM page: one model after individual run; four tabs after comparison */}
          {page === "bom" && <>
            <section style={{ ...card, padding: 18, marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div><h2 style={sectionTitle}>Bill of Materials & Export</h2><p style={{ ...muted, fontSize: 12, margin: "6px 0 0" }}>{compareResult ? "Choose which model's detections and component confidence scores to inspect." : "Showing the BOM from your most recent individual model run."}</p></div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="secondary" onClick={() => resultForBom && downloadAnnotatedImage(resultForBom)} disabled={!resultForBom || !preview}>↓ Annotated image</Button>
                  <Button variant="success" onClick={() => downloadCSV(resultForBom)} disabled={!resultForBom}>↓ Export BOM CSV</Button>
                </div>
              </div>
              {compareResult && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
                {MODELS.map((m) => <button key={m.id} onClick={() => { setBomActiveModel(m.id); setResult(compareResult.models[m.id]); setSelectedCategoryFilter("ALL"); setMinConfidence(0); setSelectedDetectionIndex(null); }} style={pillStyle(bomActiveModel === m.id, m.color)}>{m.icon} {m.label} ({compareResult.models[m.id].total})</button>)}
              </div>}
            </section>
            {resultForBom ? <section style={{ ...card, padding: 18 }}>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
                <Metric label="Selected model" value={resultForBom.model_name} color="#0284c7" />
                <Metric label="Total detections" value={resultForBom.total} color="#059669" />
                <Metric label="Unique classes" value={resultForBom.bom.length} color="#7c3aed" />
                <Metric label="Average confidence" value={`${(resultForBom.detections.length ? resultForBom.detections.reduce((sum, d) => sum + d.confidence, 0) / resultForBom.detections.length : 0).toFixed(1)}%`} color="#d97706" />
              </div>
              <div style={{ overflowX: "auto" }}><table style={{ ...tableStyle, minWidth: 720 }}>
                <thead><tr><th style={thStyle}>Tag</th><th style={thStyle}>Component name</th><th style={{ ...thStyle, textAlign: "right" }}>Quantity</th><th style={{ ...thStyle, textAlign: "right" }}>Avg. confidence</th><th style={{ ...thStyle, textAlign: "right" }}>Share of detections</th></tr></thead>
                <tbody>{resultForBom.bom.map((item) => <tr key={item.component} className="voltai-row">
                  <td style={tdStyle}><span style={{ color: getColor(item.component), fontWeight: 900 }}>{item.tag}</span></td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{item.component}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 900 }}>{item.quantity}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: "#047857", fontWeight: 800 }}>{item.averageConfidence.toFixed(2)}%</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{item.percentOfDetections.toFixed(1)}%</td>
                </tr>)}
                <tr style={{ background: "#f8fafc" }}><td style={tdStyle}>ALL</td><td style={{ ...tdStyle, fontWeight: 900 }}>TOTAL</td><td style={{ ...tdStyle, textAlign: "right", fontWeight: 900 }}>{resultForBom.total}</td><td style={{ ...tdStyle, textAlign: "right" }}>—</td><td style={{ ...tdStyle, textAlign: "right" }}>100%</td></tr></tbody>
              </table></div>
              <h3 style={{ ...sectionTitle, marginTop: 26, marginBottom: 10 }}>Per-component detection confidence</h3>
              <p style={{ ...muted, fontSize: 12, marginTop: 0 }}>Each row below is one detected symbol. Confidence percentages are the values returned by the model, not an independently measured accuracy score.</p>
              <div style={{ maxHeight: 430, overflow: "auto" }}><table style={{ ...tableStyle, minWidth: 620 }}>
                <thead><tr><th style={thStyle}>#</th><th style={thStyle}>Component</th><th style={{ ...thStyle, textAlign: "right" }}>Confidence</th><th style={thStyle}>Coordinates (x, y)</th></tr></thead>
                <tbody>{resultForBom.detections.map((d, i) => <tr key={`${d.id}-${i}`} className="voltai-row"><td style={tdStyle}>{i + 1}</td><td style={tdStyle}><span style={{ color: getColor(d.name), fontWeight: 800 }}>{d.name}</span></td><td style={{ ...tdStyle, textAlign: "right", color: "#047857", fontWeight: 900 }}>{d.confidence.toFixed(2)}%</td><td style={{ ...tdStyle, color: "#64748b" }}>({d.box.x.toFixed(1)}, {d.box.y.toFixed(1)})</td></tr>)}</tbody>
              </table></div>
            </section> : <div style={{ ...card, padding: "54px 20px", textAlign: "center" }}><h2 style={sectionTitle}>No BOM available yet</h2><p style={{ ...muted, fontSize: 13 }}>Run an individual model from Dashboard or run all four models from Compare Models first.</p><div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}><Button onClick={() => setPage("dashboard")}>Go to Dashboard</Button><Button variant="secondary" onClick={() => setPage("compare")}>Compare Models</Button></div></div>}
          </>}
        </main>
      </div>

      {/* Original click-to-inspect magnification experience retained */}
      {selectedDet && <div onClick={() => setSelectedDetectionIndex(null)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,.62)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: "min(680px,100%)", maxHeight: "92vh", overflow: "auto", background: "#fff", borderRadius: 16, boxShadow: "0 24px 80px #0f172a55", border: `2px solid ${getColor(selectedDet.name)}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
            <div><h2 style={{ margin: 0, fontSize: 16, color: "#0f172a" }}>Symbol inspection</h2><p style={{ margin: "5px 0 0", fontSize: 12, color: "#64748b" }}>{selectedDet.name} · Detection #{selectedDet.id}</p></div>
            <Button variant="secondary" onClick={() => setSelectedDetectionIndex(null)}>✕ Close</Button>
          </div>
          <div style={{ padding: 20, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(180px,.8fr)", gap: 20, alignItems: "start" }}>
            <div><CroppedSymbolCanvas previewUrl={preview} box={selectedDet.box} compColor={getColor(selectedDet.name)} /><p style={{ fontSize: 11, color: "#64748b", marginBottom: 0 }}>Magnified crop with bounding box and surrounding wiring context.</p></div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>AI detection confidence</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: "#059669", margin: "6px 0 10px" }}>{selectedDet.confidence.toFixed(2)}%</div>
              <div style={{ height: 7, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${selectedDet.confidence}%`, height: "100%", background: "#059669" }} /></div>
              <div style={{ marginTop: 20, padding: 12, border: "1px solid #e2e8f0", borderRadius: 9 }}><div style={{ fontSize: 10, color: "#64748b", fontWeight: 800 }}>COMPONENT</div><div style={{ fontSize: 13, fontWeight: 800, marginTop: 5 }}>{selectedDet.name}</div><div style={{ fontSize: 10, color: "#64748b", fontWeight: 800, marginTop: 15 }}>TAG</div><div style={{ fontSize: 13, fontWeight: 800, marginTop: 5, color: getColor(selectedDet.name) }}>{selectedDet.tag}</div><div style={{ fontSize: 10, color: "#64748b", fontWeight: 800, marginTop: 15 }}>DIMENSIONS</div><div style={{ fontSize: 13, fontWeight: 800, marginTop: 5 }}>{selectedDet.box.w.toFixed(1)} × {selectedDet.box.h.toFixed(1)} px</div><div style={{ fontSize: 10, color: "#64748b", fontWeight: 800, marginTop: 15 }}>TOP-LEFT COORDINATE</div><div style={{ fontSize: 13, fontWeight: 800, marginTop: 5 }}>({selectedDet.box.x.toFixed(1)}, {selectedDet.box.y.toFixed(1)})</div></div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "14px 20px", borderTop: "1px solid #e2e8f0" }}>
            <Button variant="secondary" disabled={selectedDetectionIndex <= 0} onClick={() => setSelectedDetectionIndex((i) => Math.max(0, i - 1))}>← Previous symbol</Button>
            <Button disabled={selectedDetectionIndex >= filteredDetections.length - 1} onClick={() => setSelectedDetectionIndex((i) => Math.min(filteredDetections.length - 1, i + 1))}>Next symbol →</Button>
          </div>
        </div>
      </div>}

      {isFullscreen && result && <div style={{ position: "fixed", inset: 0, zIndex: 900, background: "#f5f8fc", padding: 16, overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}><strong>{result.fileName} · {result.model_name}</strong><Button onClick={() => setIsFullscreen(false)}>Close fullscreen ✕</Button></div>
        <div style={{ position: "relative", display: "inline-block", width: "100%" }}><img src={preview} alt="Full-screen SLD" style={{ display: "block", width: "100%", height: "auto" }} />
          {showBoxes && filteredDetections.map((d, i) => <div key={`${d.id}-${i}`} onClick={() => { setIsFullscreen(false); setSelectedDetectionIndex(i); }} style={{ position: "absolute", left: `${d.box.x / result.width * 100}%`, top: `${d.box.y / result.height * 100}%`, width: `${d.box.w / result.width * 100}%`, height: `${d.box.h / result.height * 100}%`, border: `2px solid ${getColor(d.name)}`, cursor: "pointer" }} />)}
        </div>
      </div>}
    </div>
  );
}

function Metric({ label, value, color }) {
  return <div style={{ flex: "1 1 150px", minWidth: 0, padding: 14, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10 }}>
    <div style={{ fontSize: 10, color: "#64748b", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px" }}>{label}</div>
    <div style={{ fontSize: 20, color, fontWeight: 900, marginTop: 7, overflowWrap: "anywhere" }}>{value}</div>
  </div>;
}

function pillStyle(active, color) {
  return {
    padding: "7px 11px", borderRadius: 999, border: `1px solid ${active ? color : "#dbe3ed"}`,
    background: active ? `${color}12` : "#fff", color: active ? color : "#475569",
    fontSize: 11, fontWeight: 800, cursor: "pointer"
  };
}

const tableStyle = { width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 12 };
const thStyle = { padding: "11px 9px", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: ".5px", whiteSpace: "nowrap" };
const tdStyle = { padding: "11px 9px", borderBottom: "1px solid #edf2f7", color: "#334155", verticalAlign: "middle" };
