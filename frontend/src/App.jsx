import React, { useEffect, useMemo, useRef, useState } from "react";
import Dashboard from "./pages/Dashboard";
import CompareModels from "./pages/CompareModels";
import History from "./pages/History";

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
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [dashboardView, setDashboardView] = useState("analysis");
  const [compareView, setCompareView] = useState("analysis");
  const [sidebarOpen, setSidebarOpen] = useState(true);
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

  useEffect(() => {
    if (page !== "history") return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError("");
    fetch("/api/history")
      .then(async (response) => {
        if (!response.ok) throw new Error(`History API returned ${response.status}. Configure GET /api/history on the backend to read saved runs from your database.`);
        return response.json();
      })
      .then((payload) => {
        if (cancelled) return;
        const rows = Array.isArray(payload) ? payload : (payload.history || payload.items || payload.results || []);
        setHistoryItems(rows);
      })
      .catch((error) => { if (!cancelled) { setHistoryItems([]); setHistoryError(error.message || "Unable to load detection history."); } })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [page]);

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
  const pageTitle = page === "dashboard" ? "Detection workspace" : page === "compare" ? "Model laboratory" : "Detection history";
  const pageSubtitle = page === "dashboard"
    ? "Inspect electrical symbols, confidence scores, and bill of materials."
    : page === "compare"
      ? "Benchmark four detectors against the same single-line diagram."
      : "Review previous analyses saved by the backend database.";

  const card = { background: "rgba(255,255,255,0.96)", border: "1px solid #e5eaf2", borderRadius: 18, boxShadow: "0 8px 24px rgba(15,23,42,0.045), 0 1px 2px rgba(15,23,42,0.025)" };
  const muted = { color: "#64748b" };
  const sectionTitle = { margin: 0, fontSize: 15, fontWeight: 800, color: "#0f172a" };
  const pageProps = {
    MODELS, getColor, activeModelColor, Button, TabBar, Metric, pillStyle,
    card, muted, sectionTitle, tableStyle, thStyle, tdStyle,
    page, setPage,
    historyItems, historyLoading, historyError, setHistoryError,
    dashboardView, setDashboardView, compareView, setCompareView,
    file, preview, loading, selectedModel, setSelectedModel,
    result, setResult, compareResult, setCompareResult,
    compareActiveTab, setCompareActiveTab, selectedCompareClass, setSelectedCompareClass,
    bomActiveModel, setBomActiveModel,
    minConfidence, setMinConfidence, showBoxes, setShowBoxes,
    zoomLevel, setZoomLevel, compareZoom, setCompareZoom,
    selectedCategoryFilter, setSelectedCategoryFilter,
    hoveredDetection, setHoveredDetection, hoveredCategory, setHoveredCategory,
    selectedDetectionIndex, setSelectedDetectionIndex,
    isFullscreen, setIsFullscreen, imageRef, viewportRef, filteredDetections,
    handleFileChange, handleRunDetection, resetViewState, selectCompareModel,
    downloadCSV, downloadAnnotatedImage
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f3f6fb", color: "#0f172a", fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; }
        button, input { font: inherit; }
        button { -webkit-tap-highlight-color: transparent; }
        button:focus-visible, input:focus-visible { outline: 3px solid #bae6fd; outline-offset: 2px; }
        button { transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease; }
        button:active { transform: translateY(1px); }
        .voltai-nav:hover { background: #102b4c !important; color: #ffffff !important; }
        .voltai-row:hover { background: #f5f9ff; }
        .voltai-chart-card { transition: transform 180ms ease, box-shadow 180ms ease; }
        .voltai-chart-card:hover { transform: translateY(-2px); box-shadow: 0 12px 26px rgba(15,23,42,.07); }
        .voltai-tabbar { position: sticky; top: 8px; z-index: 30; backdrop-filter: blur(16px); }
        input[type="range"] { accent-color: #0284c7; }
        input[type="file"] { border-radius: 12px !important; }
        table { border-collapse: separate; border-spacing: 0; }
        th { background: #f8fafc; }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; } }
        @media (max-width: 900px) {
          .voltai-shell { flex-direction: column !important; }
          .voltai-main-grid { grid-template-columns: 1fr !important; }
          .voltai-compare-chart-grid, .voltai-compare-image-grid { grid-template-columns: 1fr !important; }
          .voltai-stats { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .voltai-topbar { align-items: flex-start !important; flex-direction: column !important; }
        }
        @media (max-width: 560px) {
          .voltai-stats { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div className="voltai-shell" style={{ display: "flex", minHeight: "100vh" }}>
        {sidebarOpen && <aside className="voltai-sidebar" style={{ width: 248, flexShrink: 0, background: "#06162b", color: "#f8fafc", borderRight: "1px solid #020b16", padding: "24px 16px", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "0 8px 28px" }}>
            <div style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: 12, color: "#fff", fontSize: 22, background: "linear-gradient(135deg,#0284c7,#38bdf8)" }}>⚡</div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 17, letterSpacing: "-.4px", color: "#f8fafc" }}>VoltAI</div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>SLD SYMBOL INTELLIGENCE</div>
            </div>
          </div>
          <div style={{ color: "#8194ad", fontSize: 10, fontWeight: 800, letterSpacing: 1, padding: "0 12px 10px" }}>WORKSPACE</div>
          {[
            { id: "dashboard", icon: "▦", label: "Dashboard" },
            { id: "compare", icon: "⇄", label: "Compare Models" },
            { id: "history", icon: "◷", label: "History" },
          ].map((item) => (
            <button key={item.id} className="voltai-nav" onClick={() => setPage(item.id)} style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", border: 0,
              padding: "12px 14px", marginBottom: 5, borderRadius: 10, cursor: "pointer",
              color: page === item.id ? "#ffffff" : "#cbd5e1", background: page === item.id ? "#12365d" : "transparent",
              fontWeight: page === item.id ? 800 : 600, fontSize: 13,
            }}>
              <span style={{ fontSize: 18, width: 22, textAlign: "center" }}>{item.icon}</span>{item.label}
              {page === item.id && <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: 99, background: "#38bdf8" }} />}
            </button>
          ))}
          <div style={{ marginTop: "auto", padding: "15px 13px", borderRadius: 14, background: "#0c2340", border: "1px solid #1e3a5f", boxShadow: "0 4px 14px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 9, height: 9, background: "#10b981", borderRadius: 99, boxShadow: "0 0 0 3px #d1fae5" }} />
              <span style={{ fontSize: 12, fontWeight: 850, color: "#f1f5f9" }}>4 detection models</span>
              <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 900, letterSpacing: ".4px", color: "#bae6fd", background: "#12365d", borderRadius: 5, padding: "3px 5px" }}>READY</span>
            </div>
            <p style={{ color: "#a9bad0", fontSize: 11, lineHeight: 1.55, margin: "10px 0 0" }}>Analyze schematics, compare detectors, and revisit saved runs.</p>
          </div>
        </aside>}
        <button type="button" onClick={() => setSidebarOpen((open) => !open)} title={sidebarOpen ? "Hide sidebar" : "Show sidebar"} aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"} style={{position: "fixed",top: "50%",transform: "translateY(-50%)",left: sidebarOpen ? 232 : 0,zIndex: 1000,width: 32,height: 42,display: "grid",placeItems: "center",border: "1px solid rgba(30, 58, 95, 0.65)",borderLeft: 0,borderRadius: "0 9px 9px 0",background: "rgba(2, 13, 28, 0.65)",color: "rgba(226, 232, 240, 0.8)",boxShadow: "0 3px 12px rgba(0,0,0,0.18)",cursor: "pointer",fontSize: 22,transition: "left 180ms ease, background 180ms ease"}}>{sidebarOpen ? "‹" : "›"}</button>

        <main style={{ minWidth: 0, flex: 1, padding: "28px clamp(16px, 3vw, 38px) 44px" }}>
          <header className="voltai-topbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 11, color: "#0284c7", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 900, marginBottom: 7 }}>VoltAI workspace</div>
              <h1 style={{ fontSize: 27, lineHeight: 1.2, margin: 0, letterSpacing: "-.8px", fontWeight: 900 }}>{pageTitle}</h1>
              <p style={{ ...muted, margin: "8px 0 0", fontSize: 13 }}>{pageSubtitle}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ border: "1px solid #bbf7d0", color: "#047857", background: "#f0fdf4", borderRadius: 99, padding: "7px 11px", fontSize: 11, fontWeight: 800 }}>● SLD Vision Workspace</span>
              {page === "dashboard" && result && (<span style={{border: "1px solid #dbeafe",color: "#1d4ed8",background: "#eff6ff",borderRadius: 99,padding: "7px 11px",fontSize: 11,fontWeight: 800}}>{result.model_name}</span>)}
            </div>
          </header>

          {/* Page content is split into dedicated components; all behavior remains in App.jsx. */}
          {page === "dashboard" && <Dashboard {...pageProps} />}
          {page === "compare" && <CompareModels {...pageProps} />}
          {page === "history" && <History {...pageProps} />}

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

function TabBar({ tabs, value, onChange }) {
  return <div className="voltai-tabbar" style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap",padding:5,marginBottom:18,background:"rgba(232,238,247,.82)",border:"1px solid #e0e7f1",borderRadius:16,width:"fit-content",maxWidth:"100%",boxShadow:"0 5px 18px rgba(15,23,42,.045), inset 0 1px 2px rgba(15,23,42,.025)"}}>{tabs.map(tab=><button key={tab.id} type="button" onClick={()=>onChange(tab.id)} style={{border: value===tab.id?"1px solid rgba(255,255,255,.9)":"1px solid transparent",borderRadius:12,padding:"10px 17px",background:value===tab.id?"#ffffff":"transparent",color:value===tab.id?"#075985":"#64748b",fontSize:12,fontWeight:value===tab.id?850:700,cursor:"pointer",boxShadow:value===tab.id?"0 3px 10px rgba(15,23,42,.09), inset 0 0 0 1px #e6edf6":"none",transition:"all 160ms ease"}}>{tab.label}</button>)}</div>;
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
