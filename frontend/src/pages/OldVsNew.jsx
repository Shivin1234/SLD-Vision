import React, { useEffect, useRef, useState } from "react";

function CroppedSymbolCanvas({ previewUrl, box, compColor, width = 300, height = 260 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!previewUrl || !box || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      const pad = Math.max(20, Math.round(Math.max(box.w, box.h) * 0.6));

      const srcX = Math.max(0, box.x - pad);
      const srcY = Math.max(0, box.y - pad);
      const srcW = Math.min(img.naturalWidth - srcX, box.w + pad * 2);
      const srcH = Math.min(img.naturalHeight - srcY, box.h + pad * 2);

      canvas.width = width;
      canvas.height = height;

      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, width, height);

      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, width, height);

      ctx.strokeStyle = compColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(
        (box.x - srcX) * width / srcW,
        (box.y - srcY) * height / srcH,
        box.w * width / srcW,
        box.h * height / srcH
      );
    };

    img.src = previewUrl;
  }, [previewUrl, box, compColor, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        display: "block",
        width: "100%",
        maxWidth: width,
        borderRadius: 10,
        border: `2px solid ${compColor}`
      }}
    />
  );
}

export default function OldVsNew({ file: externalFile, apiBase = "" }) {
  const [localFile, setLocalFile] = useState(null);
  const fileInputRef = useRef(null);
  // A file selected inside this component takes priority over a parent-provided file.
  const file = localFile || externalFile;
  const [previewUrl, setPreviewUrl] = useState("");
  const [minConfidence, setMinConfidence] = useState(0);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("ALL");
  const [showBoxes, setShowBoxes] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedDetectionIndex, setSelectedDetectionIndex] = useState(null);
  const [hoveredDetection, setHoveredDetection] = useState(null);
  const [hoveredCategory, setHoveredCategory] = useState(null);

  useEffect(() => {
    if (!file) { setPreviewUrl(""); return undefined; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const [oldNewArchitecture, setOldNewArchitecture] = useState("frcnn");
  const [oldNewResult, setOldNewResult] = useState(null);
  const [oldNewError, setOldNewError] = useState("");
  const [oldNewLoading, setOldNewLoading] = useState(false);
  const [oldNewVersion, setOldNewVersion] = useState("new");
  const [oldNewTab, setOldNewTab] = useState("analysis");
  const [oldNewBomVersion, setOldNewBomVersion] = useState("new");

  const handleOldNewComparison = async () => {
    if (!file) {
      setOldNewError("Please select an SLD image first.");
      return;
    }

    setOldNewLoading(true);
    setOldNewError("");
    setOldNewResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `${apiBase}/api/compare-old-new/${oldNewArchitecture}`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.error || "Old vs New comparison failed.");
      }

      setOldNewResult(data);
      setOldNewTab("analysis");
    } catch (error) {
      setOldNewError(error.message || "Unable to compare the checkpoints.");
    } finally {
      setOldNewLoading(false);
    }
  };

  const Button = ({ children, onClick, disabled, variant = "primary", style = {} }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: variant === "secondary" ? "1px solid #cbd5e1" : "1px solid #2563eb",
        background: variant === "secondary" ? "#fff" : "#2563eb",
        color: variant === "secondary" ? "#334155" : "#fff",
        borderRadius: 9,
        padding: "10px 14px",
        fontSize: 12,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );

  const TabBar = ({ tabs, value, onChange }) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          style={{
            border: value === tab.id ? "1px solid #2563eb" : "1px solid #e2e8f0",
            background: value === tab.id ? "#eff6ff" : "#fff",
            color: value === tab.id ? "#1d4ed8" : "#64748b",
            borderRadius: 8,
            padding: "9px 13px",
            fontSize: 11,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  const card = {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    boxShadow: "0 4px 16px rgba(15,23,42,.04)",
  };

  const muted = { color: "#64748b" };
  const sectionTitle = { margin: 0, fontSize: 16, fontWeight: 900, color: "#1e293b" };
  const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
  const thStyle = {
    padding: "10px 12px",
    textAlign: "left",
    color: "#64748b",
    background: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
    whiteSpace: "nowrap",
  };
  const tdStyle = {
    padding: "10px 12px",
    color: "#334155",
    borderBottom: "1px solid #edf2f7",
  };
  const getColor = (name) => {
    const palette = ["#0284c7", "#7c3aed", "#059669", "#d97706", "#db2777", "#0891b2"];
    let hash = 0;
    for (let i = 0; i < String(name || "").length; i++) {
      hash = (hash * 31 + String(name)[i].charCodeAt(0)) >>> 0;
    }
    return palette[hash % palette.length];
  };

  const downloadBomCsv = (bom, version) => {
    const rows = [
      ["Tag", "Component", "Quantity"],
      ...(bom || []).map((item) => [item.tag ?? "", item.component ?? "", item.quantity ?? 0]),
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const baseName = String(oldNewResult?.file_name || "sld")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9_-]+/gi, "_");
    link.href = url;
    link.download = `${baseName}_${version}_BOM.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
{/* ===================================================== */}
{/* OLD VS NEW MODEL COMPARISON */}
{/* ===================================================== */}

<section
  style={{
    ...card,
    padding: 18,
    marginTop: 24,
    marginBottom: 18,
  }}
>
  <h2 style={sectionTitle}>Old vs New Model Comparison</h2>

  <p style={{ ...muted, fontSize: 12, margin: "6px 0 18px" }}>
    Compare the original checkpoint against the newly trained
    checkpoint using the same SLD image.
  </p>

  <div style={{
    marginBottom: 16,
    padding: 14,
    border: "1px dashed #93c5fd",
    borderRadius: 12,
    background: "#f8fbff",
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  }}>
    <input
      ref={fileInputRef}
      type="file"
      accept="image/png,image/jpeg,image/jpg,image/webp,image/bmp"
      onChange={(e) => {
        const selectedFile = e.target.files?.[0] || null;
        if (selectedFile) {
          setLocalFile(selectedFile);
          setOldNewResult(null);
          setOldNewError("");
          setOldNewTab("analysis");
        }
        // Allow choosing the same file again after a reset.
        e.target.value = "";
      }}
      style={{ display: "none" }}
    />
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "11px 16px",
        border: "1px solid #2563eb",
        borderRadius: 9,
        background: "#2563eb",
        color: "#fff",
        fontSize: 12,
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      <span aria-hidden="true">↑</span>
      {file ? "Change SLD image" : "Upload SLD image"}
    </button>
    <div style={{ minWidth: 180, flex: "1 1 220px" }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#334155" }}>
        {file ? "Image selected" : "No image selected"}
      </div>
      <div style={{ marginTop: 3, fontSize: 11, color: "#64748b", overflowWrap: "anywhere" }}>
        {file ? file.name : "Choose a PNG, JPG, WEBP or BMP image to compare both checkpoints."}
      </div>
    </div>
    {localFile && externalFile && (
      <button
        type="button"
        onClick={() => {
          setLocalFile(null);
          setOldNewResult(null);
          setOldNewError("");
        }}
        style={{
          padding: "8px 11px",
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          background: "#fff",
          color: "#475569",
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Use parent image
      </button>
    )}
  </div>

  {/* ARCHITECTURE SELECTOR */}
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
      marginBottom: 18,
    }}
  >
    <label
      style={{
        fontSize: 12,
        fontWeight: 800,
        color: "#475569",
      }}
    >
      Select architecture

      <select
        value={oldNewArchitecture}
        onChange={(e) => {
          setOldNewArchitecture(e.target.value);
          setOldNewResult(null);
          setOldNewError("");
          setOldNewVersion("new");
        }}
        style={{
          display: "block",
          marginTop: 7,
          padding: "10px 14px",
          border: "1px solid #cbd5e1",
          borderRadius: 9,
          background: "#fff",
          color: "#334155",
          minWidth: 190,
          fontSize: 12,
        }}
      >
        <option value="frcnn">Faster R-CNN</option>
        <option value="retinanet">RetinaNet</option>
        <option value="rtdetr_sahi">RT-DETR</option>
        <option value="rtdetrv2">RT-DETRv2</option>
      </select>
    </label>

    <Button
      onClick={handleOldNewComparison}
      disabled={!file || oldNewLoading}
      style={{ alignSelf: "flex-end" }}
    >
      {oldNewLoading
        ? "⏳ Comparing models..."
        : "▶ Run Old vs New Comparison"}
    </Button>

    {oldNewResult && (
      <Button
        variant="secondary"
        onClick={() => {
          setOldNewResult(null);
          setOldNewError("");
        }}
        style={{ alignSelf: "flex-end" }}
      >
        Reset comparison
      </Button>
    )}
  </div>


  {/* OLD VS NEW HORIZONTAL TABS */}
  {oldNewResult && (
    <div style={{ marginBottom: 18 }}>
      <TabBar
        tabs={[
          { id: "analysis", label: "Analysis" },
          { id: "annotated", label: "Annotated images" },
          { id: "table", label: "Comparison table" },
          { id: "bom", label: "BOM" }
        ]}
        value={oldNewTab}
        onChange={setOldNewTab}
      />
    </div>
  )}



  {!file && (
    <p style={{ color: "#d97706", fontSize: 12 }}>
      Select an SLD image in the Four-model benchmark section above first.
    </p>
  )}

  {oldNewError && (
    <div
      style={{
        padding: 12,
        background: "#fef2f2",
        border: "1px solid #fecaca",
        borderRadius: 9,
        color: "#b91c1c",
        fontSize: 12,
        marginBottom: 14,
      }}
    >
      {oldNewError}
    </div>
  )}

  {oldNewLoading && (
    <div
      style={{
        padding: 35,
        textAlign: "center",
        color: "#64748b",
        fontSize: 13,
      }}
    >
      Running both checkpoints on the selected image...
    </div>
  )}

  {oldNewResult && (() => {
    const oldResult = oldNewResult.old;
    const newResult = oldNewResult.new;

    const oldDetections = oldResult.detections || [];
    const newDetections = newResult.detections || [];

    const oldBom = oldResult.bom || [];
    const newBom = newResult.bom || [];

    const averageConfidence = (detections) => {
      if (!detections.length) return 0;

      return (
        detections.reduce(
          (sum, detection) =>
            sum + (Number(detection.confidence) || 0),
          0
        ) / detections.length
      ) * 100;
    };

    const oldConfidence = averageConfidence(oldDetections);
    const newConfidence = averageConfidence(newDetections);

    const panelStyle = {
      background: "#fff",
      border: "1px solid #e2e8f0",
      borderRadius: 12,
      padding: 15,
      minWidth: 0,
      boxShadow: "0 3px 12px rgba(15,23,42,.04)",
    };

    const oldColor = "#64748b";
    const newColor = "#2563eb";

    const versionResult =
      oldNewVersion === "old" ? oldResult : newResult;

    const versionLabel =
      oldNewVersion === "old" ? "Old checkpoint" : "New checkpoint";

    const versionColor =
      oldNewVersion === "old" ? oldColor : newColor;

    return (
      <div style={{ display: "grid", gap: 16 }}>

        {/* SELECTED IMAGE */}
        <div
          style={{
            ...panelStyle,
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 11, color: "#64748b" }}>
            Input image
          </span>

          <strong style={{ fontSize: 12, color: "#334155" }}>
            {oldNewResult.file_name}
          </strong>
        </div>

        {/* ===================================== */}
{/* ANALYSIS TAB */}
{/* ===================================== */}

{oldNewTab === "analysis" && (
  <>
    {/* OLD / NEW SELECTOR */}
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
        marginBottom: 16,
      }}
    >
      <strong style={{ fontSize: 12, color: "#475569" }}>
        Highlight version:
      </strong>

      <Button
        variant={oldNewVersion === "old" ? "primary" : "secondary"}
        onClick={() => setOldNewVersion("old")}
      >
        Old Model
      </Button>

      <Button
        variant={oldNewVersion === "new" ? "primary" : "secondary"}
        onClick={() => setOldNewVersion("new")}
      >
        New Model
      </Button>
    </div>

    {(() => {
      const oldDetections = oldResult.detections || [];
      const newDetections = newResult.detections || [];

      const versions = [
        {
          id: "old",
          label: "Old Model",
          data: oldDetections,
          result: oldResult,
          color: oldColor || "#64748b",
        },
        {
          id: "new",
          label: "New Model",
          data: newDetections,
          result: newResult,
          color: newColor || "#0284c7",
        },
      ];

      const components = Array.from(
        new Set([
          ...oldDetections.map((d) => d.name),
          ...newDetections.map((d) => d.name),
        ])
      ).filter(Boolean);

      const getCount = (detections, component) =>
        detections.filter((d) => d.name === component).length;

      // Convert confidence into percentage (0-100).
      const getConfidencePercentage = (detection) => {
        const value = Number(detection.confidence);

        if (!Number.isFinite(value)) return 0;

        return Math.max(
          0,
          Math.min(100, value <= 1 ? value * 100 : value)
        );
      };

      const getAverageConfidence = (detections, component) => {
        const matching = detections.filter(
          (d) => d.name === component
        );

        if (!matching.length) return null;

        return (
          matching.reduce(
            (sum, detection) =>
              sum + getConfidencePercentage(detection),
            0
          ) / matching.length
        );
      };

      const getLatency = (result) =>
        Math.max(0, Number(result.latency_ms) || 0) / 1000;

      const maxComponentCount = Math.max(
        1,
        ...components.flatMap((component) =>
          versions.map((version) =>
            getCount(version.data, component)
          )
        )
      );

      const confidenceBins = [
        { label: "0–50%", min: 0, max: 50 },
        { label: "50–70%", min: 50, max: 70 },
        { label: "70–80%", min: 70, max: 80 },
        { label: "80–90%", min: 80, max: 90 },
        { label: "90–100%", min: 90, max: 100.01 },
      ];

      const getBinCount = (detections, bin) =>
        detections.filter((detection) => {
          const confidence =
            getConfidencePercentage(detection);

          return (
            confidence >= bin.min &&
            confidence < bin.max
          );
        }).length;

      const maxBinCount = Math.max(
        1,
        ...confidenceBins.flatMap((bin) =>
          versions.map((version) =>
            getBinCount(version.data, bin)
          )
        )
      );

      const chartPanel = {
        ...panelStyle,
        padding: 18,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        minHeight: 310,
      };

      const titleStyle = {
        fontSize: 14,
        margin: "0 0 5px",
        color: "#1e293b",
      };

      const subStyle = {
        fontSize: 11,
        color: "#64748b",
        lineHeight: 1.5,
        margin: "0 0 12px",
      };

      const modelLegend = (
        <div
          style={{
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          {versions.map((version) => (
            <span
              key={version.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 10,
                color: "#475569",
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: version.color,
                }}
              />
              {version.label}
            </span>
          ))}
        </div>
      );

      const renderHorizontalBar = (
        value,
        maxValue,
        color
      ) => (
        <div
          style={{
            height: 7,
            width: "100%",
            background: "#edf2f7",
            borderRadius: 5,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.max(
                0,
                Math.min(
                  100,
                  (value / Math.max(1, maxValue)) * 100
                )
              )}%`,
              height: "100%",
              background: color,
              borderRadius: 5,
              transition: "width 0.25s ease",
            }}
          />
        </div>
      );

      const componentColors = [
        "#0284c7",
        "#7c3aed",
        "#059669",
        "#d97706",
        "#db2777",
        "#0891b2",
        "#65a30d",
        "#9333ea",
        "#ea580c",
        "#475569",
      ];

      return (
        <>
          <style>{`
            .voltai-oldnew-chart-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
            .voltai-oldnew-chart-grid > section:nth-child(1),
            .voltai-oldnew-chart-grid > section:nth-child(2) { grid-column: span 3; }
            .voltai-oldnew-chart-grid > section:nth-child(n+3) { grid-column: span 2; }
            @media (max-width: 900px) {
              .voltai-oldnew-chart-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
              .voltai-oldnew-chart-grid > section { grid-column: span 1 !important; }
            }
            @media (max-width: 600px) {
              .voltai-oldnew-chart-grid { grid-template-columns: minmax(0, 1fr) !important; }
            }
            .voltai-oldnew-annotated-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            @media (max-width: 700px) {
              .voltai-oldnew-annotated-grid { grid-template-columns: minmax(0, 1fr) !important; }
            }
          `}</style>
          <div
            className="voltai-oldnew-chart-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
              gap: 14,
              alignItems: "stretch",
            }}
          >
            {/* 1. COMPONENT COUNT COMPARISON */}
            <section style={chartPanel}>
              <h3 style={titleStyle}>
                Component count comparison
              </h3>

              <p style={subStyle}>
                Compare predicted instances of each component class.
              </p>

              {modelLegend}

              {components.length === 0 ? (
                <p style={subStyle}>
                  No component data available.
                </p>
              ) : (
                <div style={{ width: "100%", minWidth: 0 }}>
                  {(() => {
                    const chartWidth = 560;
                    const left = 42;
                    const right = 12;
                    const top = 14;
                    const plotHeight = 210;
                    const bottomY = top + plotHeight;
                    const plotWidth =
                      chartWidth - left - right;

                    const groupWidth =
                      plotWidth / components.length;

                    const barGap = 3;

                    const barWidth = Math.max(
                      3,
                      Math.min(
                        22,
                        (groupWidth * 0.78 - barGap) /
                          versions.length
                      )
                    );

                    const barsWidth =
                      versions.length * barWidth +
                      (versions.length - 1) * barGap;

                    const labelLineHeight = 11;

                    const maxLabelLines = Math.max(
                      1,
                      ...components.map(
                        (component) =>
                          component.split(/\s+/).length
                      )
                    );

                    const labelAreaHeight =
                      maxLabelLines * labelLineHeight + 8;

                    const chartHeight =
                      bottomY + labelAreaHeight + 25;

                    const labelStartY = bottomY + 13;

                    return (
                      <svg
                        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                        width="100%"
                        role="img"
                        aria-label="Old and new checkpoint component count comparison"
                        preserveAspectRatio="none"
                        style={{
                          display: "block",
                          width: "100%",
                          height: "auto",
                          maxHeight: 440,
                        }}
                      >
                        {[0, 0.25, 0.5, 0.75, 1].map(
                          (fraction) => (
                            <g key={fraction}>
                              <line
                                x1={left}
                                y1={
                                  top +
                                  plotHeight * (1 - fraction)
                                }
                                x2={chartWidth - right}
                                y2={
                                  top +
                                  plotHeight * (1 - fraction)
                                }
                                stroke="#e2e8f0"
                                strokeWidth="1"
                              />

                              <text
                                x={left - 7}
                                y={
                                  top +
                                  plotHeight * (1 - fraction) +
                                  4
                                }
                                textAnchor="end"
                                fontSize="10"
                                fill="#64748b"
                              >
                                {Math.round(
                                  maxComponentCount * fraction
                                )}
                              </text>
                            </g>
                          )
                        )}

                        {components.map(
                          (component, componentIndex) => {
                            const center =
                              left +
                              componentIndex * groupWidth +
                              groupWidth / 2;

                            const startX =
                              center - barsWidth / 2;

                            const words =
                              component.split(/\s+/);

                            return (
                              <g key={component}>
                                {versions.map(
                                  (version, versionIndex) => {
                                    const value = getCount(
                                      version.data,
                                      component
                                    );

                                    const height =
                                      (value / maxComponentCount) *
                                      plotHeight;

                                    return (
                                      <rect
                                        key={version.id}
                                        x={
                                          startX +
                                          versionIndex *
                                            (barWidth + barGap)
                                        }
                                        y={bottomY - height}
                                        width={barWidth}
                                        height={Math.max(0, height)}
                                        rx={2}
                                        fill={version.color}
                                        opacity={
                                          oldNewVersion ===
                                          version.id
                                            ? 1
                                            : 0.65
                                        }
                                      >
                                        <title>
                                          {`${version.label} · ${component}: ${value}`}
                                        </title>
                                      </rect>
                                    );
                                  }
                                )}

                                {words.map(
                                  (word, wordIndex) => (
                                    <text
                                      key={`${component}-${wordIndex}`}
                                      x={center}
                                      y={
                                        labelStartY +
                                        wordIndex *
                                          labelLineHeight
                                      }
                                      textAnchor="middle"
                                      fontSize="8"
                                      fill="#475569"
                                    >
                                      {word}
                                    </text>
                                  )
                                )}
                              </g>
                            );
                          }
                        )}

                        <text
                          x={left + plotWidth / 2}
                          y={chartHeight - 5}
                          textAnchor="middle"
                          fontSize="10"
                          fill="#64748b"
                        >
                          Component class
                        </text>
                      </svg>
                    );
                  })()}
                </div>
              )}
            </section>

            {/* 2. CONFIDENCE COMPARISON */}
            <section style={chartPanel}>
              <h3 style={titleStyle}>
                Confidence comparison
              </h3>

              <p style={subStyle}>
                Average confidence by component class for each checkpoint.
              </p>

              {modelLegend}

              {components.length === 0 ? (
                <p style={subStyle}>
                  No confidence data available.
                </p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateRows: `repeat(${components.length}, minmax(0, 1fr))`,
                    gap: 5,
                    flex: 1,
                  }}
                >
                  {components.map((component) => (
                    <div
                      key={component}
                      style={{
                        padding: "5px 0",
                        borderBottom: "1px solid #edf2f7",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: "#334155",
                          marginBottom: 5,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {component}
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(2, minmax(0, 1fr))",
                          gap: 10,
                        }}
                      >
                        {versions.map((version) => {
                          const confidence =
                            getAverageConfidence(
                              version.data,
                              component
                            );

                          return (
                            <div
                              key={version.id}
                              style={{
                                minWidth: 0,
                                textAlign: "center",
                              }}
                            >
                              <div
                                style={{
                                  height: 6,
                                  borderRadius: 5,
                                  background: "#edf2f7",
                                  marginBottom: 4,
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    width: `${confidence ?? 0}%`,
                                    height: "100%",
                                    background:
                                      confidence !== null
                                        ? version.color
                                        : "transparent",
                                    borderRadius: 5,
                                    opacity:
                                      oldNewVersion ===
                                      version.id
                                        ? 1
                                        : 0.65,
                                  }}
                                />
                              </div>

                              <div
                                style={{
                                  fontSize: 10,
                                  fontWeight: 800,
                                  color:
                                    confidence !== null
                                      ? version.color
                                      : "#94a3b8",
                                }}
                              >
                                {confidence !== null
                                  ? `${confidence.toFixed(1)}%`
                                  : "—"}
                              </div>

                              <div
                                style={{
                                  fontSize: 9,
                                  color: "#64748b",
                                  marginTop: 2,
                                }}
                              >
                                {version.label}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  color: "#64748b",
                  fontSize: 10,
                  borderTop: "1px solid #e2e8f0",
                  paddingTop: 7,
                  marginTop: 8,
                }}
              >
                <span>Lower confidence</span>
                <span>Higher confidence</span>
              </div>
            </section>

            {/* 3. INFERENCE SPEED */}
            <section style={chartPanel}>
              <h3 style={titleStyle}>Inference speed</h3>

              <p style={subStyle}>
                Response time for the selected SLD image. Lower is faster.
              </p>

              <div
                style={{
                  display: "grid",
                  gap: 22,
                  flex: 1,
                  alignContent: "center",
                }}
              >
                {versions.map((version) => {
                  const seconds = getLatency(version.result);

                  const maxLatency = Math.max(
                    0.001,
                    ...versions.map((item) =>
                      getLatency(item.result)
                    )
                  );

                  return (
                    <div key={version.id}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          marginBottom: 7,
                          fontSize: 11,
                        }}
                      >
                        <span
                          style={{
                            color: version.color,
                            fontWeight: 700,
                          }}
                        >
                          {version.label}
                        </span>

                        <strong style={{ whiteSpace: "nowrap" }}>
                          {seconds.toFixed(2)} s
                        </strong>
                      </div>

                      <div
                        style={{
                          height: 13,
                          background: "#f1f5f9",
                          borderRadius: 4,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${
                              (seconds / maxLatency) * 100
                            }%`,
                            background: version.color,
                            borderRadius: 4,
                            opacity:
                              oldNewVersion === version.id
                                ? 1
                                : 0.65,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                style={{
                  marginTop: 14,
                  borderTop: "1px solid #e2e8f0",
                  paddingTop: 9,
                  color: "#64748b",
                  fontSize: 10,
                }}
              >
                Recorded inference duration · seconds
              </div>
            </section>

            {/* 4. COMPONENT DISTRIBUTION */}
            <section style={chartPanel}>
              <h3 style={titleStyle}>
                Component distribution
              </h3>

              <p style={subStyle}>
                Proportion of each component class in both checkpoints'
                predictions.
              </p>

              {components.length === 0 ? (
                <p style={subStyle}>
                  No component data available.
                </p>
              ) : (
                <>
                  <div
                    style={{
                      display: "grid",
                      gap: 20,
                      flex: 1,
                      alignContent: "center",
                    }}
                  >
                    {versions.map((version) => {
                      const total = version.data.length;

                      return (
                        <div key={version.id}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 6,
                              marginBottom: 7,
                              fontSize: 10,
                            }}
                          >
                            <strong
                              style={{ color: version.color }}
                            >
                              {version.label}
                            </strong>

                            <span
                              style={{
                                color: "#64748b",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {total} detections
                            </span>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              height: 22,
                              overflow: "hidden",
                              borderRadius: 5,
                              background: "#f1f5f9",
                            }}
                          >
                            {components.map(
                              (component, index) => {
                                const count = getCount(
                                  version.data,
                                  component
                                );

                                if (!count || !total) return null;

                                return (
                                  <div
                                    key={component}
                                    title={`${component}: ${count} (${(
                                      (count / total) *
                                      100
                                    ).toFixed(1)}%)`}
                                    style={{
                                      width: `${
                                        (count / total) * 100
                                      }%`,
                                      minWidth: 1,
                                      background:
                                        componentColors[
                                          index %
                                            componentColors.length
                                        ],
                                      height: "100%",
                                      borderRight:
                                        "1px solid #ffffff80",
                                    }}
                                  />
                                );
                              }
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(2, minmax(0, 1fr))",
                      gap: 8,
                      marginTop: 18,
                      borderTop: "1px solid #e2e8f0",
                      paddingTop: 12,
                    }}
                  >
                    {components.map((component, index) => (
                      <span
                        key={component}
                        style={{
                          fontSize: 10,
                          color: "#475569",
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            flex: "0 0 8px",
                            borderRadius: 2,
                            background:
                              componentColors[
                                index % componentColors.length
                              ],
                          }}
                        />
                        {component}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* 5. CONFIDENCE DISTRIBUTION */}
            <section style={chartPanel}>
              <h3 style={titleStyle}>
                Confidence distribution
              </h3>

              <p style={subStyle}>
                Number of detections across confidence ranges.
              </p>

              {modelLegend}

              <div
                style={{
                  display: "grid",
                  gap: 13,
                  flex: 1,
                  alignContent: "center",
                }}
              >
                {confidenceBins.map((bin) => (
                  <div key={bin.label}>
                    <strong
                      style={{
                        display: "block",
                        fontSize: 10,
                        marginBottom: 6,
                        color: "#334155",
                      }}
                    >
                      {bin.label}
                    </strong>

                    {versions.map((version) => {
                      const count = getBinCount(
                        version.data,
                        bin
                      );

                      return (
                        <div
                          key={version.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "75px minmax(0, 1fr) 28px",
                            gap: 8,
                            alignItems: "center",
                            marginTop: 6,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10,
                              color: version.color,
                            }}
                          >
                            {version.label}
                          </span>

                          {renderHorizontalBar(
                            count,
                            maxBinCount,
                            version.color
                          )}

                          <strong style={{ fontSize: 10 }}>
                            {count}
                          </strong>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          </div>

          <p
            style={{
              fontSize: 11,
              color: "#64748b",
              lineHeight: 1.6,
              marginTop: 12,
            }}
          >
            Note: These graphs describe model predictions on the selected
            image. Detection count and confidence do not establish accuracy.
            Precision, recall, and mAP require ground-truth annotations.
          </p>
        </>
      );
    })()}
  </>
)}
        {/* ===================================== */}
        {/* annootated image */}
        {/* ===================================== */}

{oldNewTab === "annotated" && (
  <div style={{ marginTop: 20 }}>
    {(() => {
      const oldDetections = Array.isArray(oldResult.detections) ? oldResult.detections : [];
      const newDetections = Array.isArray(newResult.detections) ? newResult.detections : [];

      const allDetections = [
        ...oldDetections.map((d) => ({ ...d, _model: "old" })),
        ...newDetections.map((d) => ({ ...d, _model: "new" })),
      ];

      const getName = (d) =>
        d.name || d.class_name || d.component || d.label || "Unknown";

      const getConfidence = (d) => {
        const n = Number(d.confidence);
        return Number.isFinite(n)
          ? Math.max(0, Math.min(100, n <= 1 ? n * 100 : n))
          : 0;
      };

      const categories = [...new Set(allDetections.map(getName))].sort();

      const getDimensions = (result) => ({
        width: Number(
          result.image_width ||
          result.image_size?.width ||
          oldNewResult.image_width ||
          oldNewResult.image_size?.width ||
          result.width ||
          0
        ),
        height: Number(
          result.image_height ||
          result.image_size?.height ||
          oldNewResult.image_height ||
          oldNewResult.image_size?.height ||
          result.height ||
          0
        ),
      });

      const getBox = (d, width, height) => {
        const raw = d.bbox || d.box;
        if (!raw) return null;

        let x1, y1, x2, y2;

        if (Array.isArray(raw) && raw.length === 4) {
          [x1, y1, x2, y2] = raw.map(Number);
        } else if (typeof raw === "object") {
          x1 = Number(raw.x1 ?? raw.x);
          y1 = Number(raw.y1 ?? raw.y);
          x2 = Number(raw.x2 ?? (x1 + Number(raw.w ?? raw.width)));
          y2 = Number(raw.y2 ?? (y1 + Number(raw.h ?? raw.height)));
        } else {
          return null;
        }

        if (![x1, y1, x2, y2].every(Number.isFinite) || x2 <= x1 || y2 <= y1) {
          return null;
        }

        if (x1 >= 0 && y1 >= 0 && x2 <= 1 && y2 <= 1) {
          if (!width || !height) return null;

          return {
            x: x1 * width,
            y: y1 * height,
            w: (x2 - x1) * width,
            h: (y2 - y1) * height,
          };
        }

        return {
          x: x1,
          y: y1,
          w: x2 - x1,
          h: y2 - y1,
        };
      };

      const downloadImage = (result, label) => {
        const link = document.createElement("a");

        if (result?.annotated_image_base64) {
          link.href = `data:image/png;base64,${result.annotated_image_base64}`;
        } else if (previewUrl) {
          link.href = previewUrl;
        } else {
          return;
        }

        const baseName = String(oldNewResult?.file_name || "sld").replace(/\.[^.]+$/, "");
        link.download = `${baseName}_${label}_annotated.png`;

        document.body.appendChild(link);
        link.click();
        link.remove();
      };

      const statCard = (label, value, color) => (
        <div
          key={label}
          style={{
            ...card,
            padding: 11,
            minWidth: 0,
            boxShadow: "none",
          }}
        >
          <div style={{ fontSize: 9, color: "#64748b", fontWeight: 800 }}>
            {label}
          </div>
          <div
            style={{
              color,
              fontSize: 17,
              fontWeight: 900,
              marginTop: 5,
              overflowWrap: "anywhere",
            }}
          >
            {value}
          </div>
        </div>
      );

      const renderModel = (result, label, color, modelKey) => {
        const detections = modelKey === "old" ? oldDetections : newDetections;

        const visible = detections
          .map((d, index) => ({ ...d, _index: index }))
          .filter(
            (d) =>
              getConfidence(d) >= minConfidence &&
              (selectedCategoryFilter === "ALL" ||
                getName(d) === selectedCategoryFilter)
          );

        const { width, height } = getDimensions(result);

        const selectedDetection =
          selectedDetectionIndex &&
          selectedDetectionIndex.startsWith(`${modelKey}-`)
            ? detections[
                Number(selectedDetectionIndex.slice(modelKey.length + 1))
              ]
            : null;

        const selectedDetectionBox = selectedDetection
          ? getBox(selectedDetection, width, height)
          : null;

        const selectedDetectionName = selectedDetection
          ? getName(selectedDetection)
          : "";

        const selectedDetectionConfidence = selectedDetection
          ? getConfidence(selectedDetection)
          : 0;

        const hasBackendImage = Boolean(result?.annotated_image_base64);
        const activeModel = oldNewVersion === modelKey;

        const bomRows = categories
          .map((component) => {
            const matching = detections.filter(
              (d) => getName(d) === component
            );

            return {
              component,
              quantity: matching.length,
              averageConfidence: matching.length
                ? matching.reduce(
                    (sum, d) => sum + getConfidence(d),
                    0
                  ) / matching.length
                : 0,
            };
          })
          .filter((item) => item.quantity > 0)
          .sort((a, b) => b.quantity - a.quantity);

        const filteredCount = visible.length;
        const totalCount = detections.length;

        const avgConfidence = totalCount
          ? detections.reduce(
              (sum, d) => sum + getConfidence(d),
              0
            ) / totalCount
          : 0;

        const viewerId = `oldnew-viewer-${modelKey}`;

        return (
          <section
            key={modelKey}
            style={{
              ...panelStyle,
              minWidth: 0,
              padding: 0,
              overflow: "hidden",
              borderTop: `3px solid ${color}`,
            }}
          >
            <div
              style={{
                padding: "13px 15px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    color,
                    fontSize: 14,
                    fontWeight: 900,
                  }}
                >
                  {label} Model · Annotated SLD
                </h3>
                <p style={{ ...muted, fontSize: 10, margin: "4px 0 0" }}>
                  {result.model_name ||
                    result.checkpoint_name ||
                    `${label} checkpoint predictions`}
                </p>
              </div>              
            </div>

            {/* Model statistics */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,minmax(0,1fr))",
                gap: 7,
                padding: 10,
              }}
            >
              {statCard("DETECTIONS", totalCount, color)}
              {statCard("CLASSES", bomRows.length, "#059669")}
              {statCard("AVG. CONFIDENCE", `${avgConfidence.toFixed(1)}%`, "#7c3aed")}
              {statCard(
                "INFERENCE",
                `${(Math.max(0, Number(result.latency_ms) || 0) / 1000).toFixed(2)} s`,
                "#d97706"
              )}
            </div>

            {/* Schematic visualizer */}
            <div
              id={viewerId}
              style={{
                margin: "0 10px",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                overflow: "hidden",
                background: "#f8fafc",
              }}
            >
              <div
                style={{
                  padding: "9px 11px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  borderBottom: "1px solid #e2e8f0",
                  background: "#fff",
                }}
              >
                <strong style={{ fontSize: 11, color: "#334155" }}>
                  Schematic visualizer
                </strong>

                <span
                  style={{
                    fontSize: 10,
                    color: "#059669",
                    fontWeight: 800,
                  }}
                >
                  {filteredCount} of {totalCount} displayed · click a box to inspect
                </span>
              </div>

              <div
                style={{
                  maxHeight: 520,
                  overflow: "auto",
                  padding: 10,
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    display: "inline-block",
                    width: `${zoomLevel * 100}%`,
                    minWidth: 180,
                    lineHeight: 0,
                  }}
                >
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={`${label} model SLD`}
                      style={{
                        display: "block",
                        width: "100%",
                        height: "auto",
                        border: "1px solid #e2e8f0",
                        borderRadius: 5,
                      }}
                    />
                  ) : hasBackendImage ? (
                    <img
                      src={`data:image/png;base64,${result.annotated_image_base64}`}
                      alt={`${label} annotated SLD`}
                      style={{
                        display: "block",
                        width: "100%",
                        height: "auto",
                        borderRadius: 5,
                      }}
                    />
                  ) : (
                    <div style={{ padding: 30, color: "#64748b", lineHeight: 1.5 }}>
                      Image preview unavailable.
                    </div>
                  )}

                  {showBoxes &&
                    previewUrl &&
                    width > 0 &&
                    height > 0 &&
                    visible.map((d) => {
                      const box = getBox(d, width, height);
                      if (!box) return null;

                      const name = getName(d);
                      const confidence = getConfidence(d);
                      const boxColor = getColor(name);
                      const key = `${modelKey}-${d._index}`;

                      const active =
                        hoveredDetection === key ||
                        selectedDetectionIndex === key ||
                        hoveredCategory === name;

                      const nearTop = box.y < height * 0.15;

                      return (
                        <div
                          key={`${modelKey}-${d.id ?? d._index}`}
                          role="button"
                          tabIndex={0}
                          title={`${name} · ${confidence.toFixed(1)}%`}
                          onMouseEnter={() => setHoveredDetection(key)}
                          onMouseLeave={() => setHoveredDetection(null)}
                          onClick={() => {
                            setSelectedDetectionIndex(key);
                            setOldNewVersion(modelKey);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedDetectionIndex(key);
                              setOldNewVersion(modelKey);
                            }
                          }}
                          style={{
                            position: "absolute",
                            left: `${(box.x / width) * 100}%`,
                            top: `${(box.y / height) * 100}%`,
                            width: `${(box.w / width) * 100}%`,
                            height: `${(box.h / height) * 100}%`,
                            border: `${active ? 3 : 1.5}px solid ${boxColor}`,
                            background: active
                              ? `${boxColor}30`
                              : `${boxColor}12`,
                            boxSizing: "border-box",
                            cursor: "pointer",
                            zIndex: active ? 20 : 2,
                          }}
                        >
                          {active && (
                            <div
                              style={{
                                position: "absolute",
                                [nearTop ? "top" : "bottom"]: "calc(100% + 5px)",
                                left: "50%",
                                transform: "translateX(-50%)",
                                background: "#fff",
                                color: "#0f172a",
                                border: `1px solid ${boxColor}`,
                                borderRadius: 8,
                                padding: "8px 10px",
                                minWidth: 165,
                                maxWidth: 230,
                                boxShadow: "0 8px 24px #0f172a22",
                                fontSize: 10,
                                lineHeight: 1.4,
                                whiteSpace: "normal",
                                pointerEvents: "none",
                                zIndex: 100,
                              }}
                            >
                              <strong>{name}</strong>

                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  marginTop: 5,
                                  color: "#047857",
                                  fontWeight: 800,
                                }}
                              >
                                <span>Confidence</span>
                                <span>{confidence.toFixed(1)}%</span>
                              </div>

                              <div
                                style={{
                                  height: 5,
                                  background: "#e2e8f0",
                                  borderRadius: 99,
                                  overflow: "hidden",
                                  marginTop: 5,
                                }}
                              >
                                <div
                                  style={{
                                    height: "100%",
                                    width: `${confidence}%`,
                                    background: boxColor,
                                  }}
                                />
                              </div>

                              <div style={{ color: "#64748b", marginTop: 5 }}>
                                Click to select this detection
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
                   
              </div>

              <div
                style={{
                  padding: "8px 10px",
                  background: "#fff",
                  borderTop: "1px solid #e2e8f0",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  flexWrap: "wrap",
                  fontSize: 10,
                  color: "#64748b",
                }}
              >
                <span>
                  {width && height
                    ? `${width} × ${height}px`
                    : "Image dimensions unavailable"}
                </span>

                <span>
                  {visible.length} detections meet current filters
                  {showBoxes &&
                  !visible.some((d) => getBox(d, width, height)) &&
                  previewUrl
                    ? " · Bounding-box coordinates unavailable"
                    : ""}
                </span>
              </div>
            </div>                        
          </section>
        );
      };

      const selectedResult = oldNewVersion === "old" ? oldResult : newResult;

// Selected symbol details for the inspection modal
const selectedModelKey = selectedDetectionIndex
  ? selectedDetectionIndex.split("-")[0]
  : null;

const selectedSymbolIndex = selectedDetectionIndex
  ? Number(selectedDetectionIndex.substring(selectedModelKey.length + 1))
  : -1;

const selectedModelResult =
  selectedModelKey === "old"
    ? oldResult
    : selectedModelKey === "new"
    ? newResult
    : null;

const selectedModelDetections =
  selectedModelKey === "old"
    ? oldDetections
    : selectedModelKey === "new"
    ? newDetections
    : [];

const selectedSymbol =
  selectedSymbolIndex >= 0
    ? selectedModelDetections[selectedSymbolIndex]
    : null;

const selectedSymbolName = selectedSymbol
  ? getName(selectedSymbol)
  : "";

const selectedSymbolConfidence = selectedSymbol
  ? getConfidence(selectedSymbol)
  : 0;

const selectedModelDimensions = selectedModelResult
  ? getDimensions(selectedModelResult)
  : { width: 0, height: 0 };

const selectedSymbolBox = selectedSymbol
  ? getBox(
      selectedSymbol,
      selectedModelDimensions.width,
      selectedModelDimensions.height
    )
  : null;

const modalPreviewUrl =
  previewUrl ||
  (selectedModelResult?.annotated_image_base64
    ? `data:image/png;base64,${selectedModelResult.annotated_image_base64}`
    : "");

const navigateSymbol = (direction) => {
  if (!selectedModelDetections.length) return;

  const nextIndex =
    (selectedSymbolIndex + direction + selectedModelDetections.length) %
    selectedModelDetections.length;

  setSelectedDetectionIndex(`${selectedModelKey}-${nextIndex}`);
  setOldNewVersion(selectedModelKey);
};

return (
        <>
          {/* Shared annotated-image controls */}
          <div style={{ ...panelStyle, marginBottom: 14 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h3 style={sectionTitle}>Annotated image controls</h3>
                <p style={{ ...muted, fontSize: 11, margin: "5px 0 0" }}>
                  Apply the same confidence and component filters to both checkpoints.
                </p>
              </div>              
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 14,
                marginTop: 13,
              }}
            >
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#475569",
                }}
              >
                Confidence threshold{" "}
                <strong style={{ color: "#0284c7" }}>
                  {minConfidence}%
                </strong>

                <input
                  aria-label="Confidence threshold"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={minConfidence}
                  onChange={(e) => {
                    setMinConfidence(Number(e.target.value));
                    setSelectedDetectionIndex(null);
                  }}
                  style={{
                    display: "block",
                    width: 190,
                    accentColor: "#0284c7",
                    marginTop: 7,
                  }}
                />
              </label>
              
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#475569",
                }}
              >
                <input
                  type="checkbox"
                  checked={showBoxes}
                  onChange={(e) => setShowBoxes(e.target.checked)}
                />
                Bounding boxes
              </label>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setZoomLevel((z) =>
                      Math.max(0.5, Number((z - 0.25).toFixed(2)))
                    )
                  }
                  disabled={zoomLevel <= 0.5}
                >
                  −
                </Button>

                <strong
                  style={{
                    fontSize: 11,
                    minWidth: 42,
                    textAlign: "center",
                  }}
                >
                  {Math.round(zoomLevel * 100)}%
                </strong>

                <Button
                  variant="secondary"
                  onClick={() =>
                    setZoomLevel((z) =>
                      Math.min(3, Number((z + 0.25).toFixed(2)))
                    )
                  }
                  disabled={zoomLevel >= 3}
                >
                  +
                </Button>

                <Button
                  variant="secondary"
                  onClick={() => setZoomLevel(1)}
                  disabled={zoomLevel === 1}
                >
                  Reset zoom
                </Button>
              </div>              
            </div>

            {/* Component class filter chips */}
            <div
              style={{
                display: "flex",
                gap: 7,
                flexWrap: "wrap",
                marginTop: 14,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setSelectedCategoryFilter("ALL");
                  setSelectedDetectionIndex(null);
                }}
                style={{
                  border: `1px solid ${
                    selectedCategoryFilter === "ALL" ? "#0284c7" : "#cbd5e1"
                  }`,
                  background:
                    selectedCategoryFilter === "ALL" ? "#e0f2fe" : "#fff",
                  color:
                    selectedCategoryFilter === "ALL" ? "#0369a1" : "#475569",
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 10,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                All ({allDetections.length})
              </button>

              {categories.map((category) => {
                const count = allDetections.filter(
                  (d) => getName(d) === category
                ).length;

                const categoryColor = getColor(category);
                const active = selectedCategoryFilter === category;

                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => {
                      setSelectedCategoryFilter(active ? "ALL" : category);
                      setSelectedDetectionIndex(null);
                    }}
                    style={{
                      border: `1px solid ${categoryColor}`,
                      background: active ? `${categoryColor}20` : "#fff",
                      color: categoryColor,
                      borderRadius: 999,
                      padding: "6px 10px",
                      fontSize: 10,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {category} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Old and New model viewers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 18,
              alignItems: "start",
            }}
            className="voltai-oldnew-annotated-grid"
          >
            {renderModel(oldResult, "Old", oldColor, "old")}
            {renderModel(newResult, "New", newColor, "new")}
          </div>

          {/* ============================================== */}
{/* SYMBOL INSPECTION MODAL */}
{/* ============================================== */}

{selectedSymbol && selectedSymbolBox && modalPreviewUrl && (
  <div
    onClick={() => setSelectedDetectionIndex(null)}
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 99999,
      background: "rgba(15, 23, 42, 0.62)",
      backdropFilter: "blur(3px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    }}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="symbol-inspection-title"
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "100%",
        maxWidth: 720,
        maxHeight: "90vh",
        overflowY: "auto",
        background: "#fff",
        border: `2px solid ${getColor(selectedSymbolName)}`,
        borderRadius: 16,
        boxShadow: "0 25px 70px rgba(0,0,0,.3)",
      }}
    >
      {/* MODAL HEADER */}
      <div
        style={{
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <div>
          <h3
            id="symbol-inspection-title"
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 900,
              color: "#0f172a",
            }}
          >
            Symbol Inspection
          </h3>

          <p
            style={{
              margin: "4px 0 0",
              fontSize: 11,
              color: "#64748b",
            }}
          >
            {selectedSymbolName} · Detection #{selectedSymbolIndex + 1} ·{" "}
            {selectedModelKey === "old" ? "Old Model" : "New Model"}
          </p>
        </div>

        <Button
          variant="secondary"
          onClick={() => setSelectedDetectionIndex(null)}
        >
          ✕ Close
        </Button>
      </div>

      {/* MODAL CONTENT */}
      <div
  className="voltai-symbol-modal-content"
  style={{
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.2fr) minmax(220px, 1fr)",
    gap: 20,
    padding: 20,
    alignItems: "start",
  }}
>
        {/* MAGNIFIED CROP */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              border: `2px solid ${getColor(selectedSymbolName)}`,
              borderRadius: 10,
              padding: 8,
              background: "#f8fafc",
            }}
          >
            <CroppedSymbolCanvas
              previewUrl={modalPreviewUrl}
              box={selectedSymbolBox}
              compColor={getColor(selectedSymbolName)}
              width={360}
              height={260}
            />
          </div>

          <p
            style={{
              fontSize: 10,
              color: "#64748b",
              lineHeight: 1.5,
              margin: "9px 0 0",
            }}
          >
            Magnified crop with bounding box and surrounding wiring context.
          </p>
        </div>

        {/* SYMBOL INFORMATION */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 900,
              color: "#64748b",
              marginBottom: 8,
            }}
          >
            AI DETECTION CONFIDENCE
          </div>

          <div
            style={{
              fontSize: 27,
              fontWeight: 900,
              color: "#059669",
              marginBottom: 10,
            }}
          >
            {selectedSymbolConfidence.toFixed(2)}%
          </div>

          <div
            style={{
              height: 7,
              background: "#e2e8f0",
              borderRadius: 99,
              overflow: "hidden",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${selectedSymbolConfidence}%`,
                background: "#059669",
                borderRadius: 99,
              }}
            />
          </div>

          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 10,
              padding: 12,
              display: "grid",
              gap: 13,
            }}
          >
            <div>
              <div style={{ fontSize: 9, color: "#64748b", fontWeight: 900 }}>
                COMPONENT
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: "#0f172a",
                  marginTop: 4,
                  overflowWrap: "anywhere",
                }}
              >
                {selectedSymbolName}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 9, color: "#64748b", fontWeight: 900 }}>
                MODEL
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, marginTop: 4 }}>
                {selectedModelKey === "old" ? "Old checkpoint" : "New checkpoint"}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 9, color: "#64748b", fontWeight: 900 }}>
                DIMENSIONS
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, marginTop: 4 }}>
                {selectedSymbolBox.w.toFixed(1)} ×{" "}
                {selectedSymbolBox.h.toFixed(1)} px
              </div>
            </div>

            <div>
              <div style={{ fontSize: 9, color: "#64748b", fontWeight: 900 }}>
                TOP-LEFT COORDINATE
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, marginTop: 4 }}>
                ({selectedSymbolBox.x.toFixed(1)},{" "}
                {selectedSymbolBox.y.toFixed(1)})
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL FOOTER / NAVIGATION */}
      <div
        style={{
          padding: "13px 20px",
          borderTop: "1px solid #e2e8f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Button
          variant="secondary"
          onClick={() => navigateSymbol(-1)}
          disabled={selectedModelDetections.length <= 1}
        >
          ← Previous symbol
        </Button>

        <Button
          onClick={() => navigateSymbol(1)}
          disabled={selectedModelDetections.length <= 1}
        >
          Next symbol →
        </Button>
      </div>
    </div>
  </div>
)}

          <style>
  {`
    @media (max-width: 900px) {
      .voltai-oldnew-annotated-grid {
        grid-template-columns: minmax(0, 1fr) !important;
      }
    }

    @media (max-width: 650px) {
      .voltai-symbol-modal-content {
        grid-template-columns: minmax(0, 1fr) !important;
      }
    }
  `}
</style>
        </>
      );
    })()}
  </div>
)}
        {/* COMPARISON TABLE TAB */}
        {/* ===================================== */}

        {oldNewTab === "table" && (
          <div style={panelStyle}>
            <h3 style={sectionTitle}>Old vs New Comparison Table</h3>

            <div style={{ overflowX: "auto", marginTop: 14 }}>
              <table style={{ ...tableStyle, minWidth: 520 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Metric</th>

                    <th style={{ ...thStyle, color: oldColor }}>
                      Old Model
                    </th>

                    <th style={{ ...thStyle, color: newColor }}>
                      New Model
                    </th>

                    <th style={thStyle}>Difference</th>
                  </tr>
                </thead>

                <tbody>
                  {[
                    {
                      label: "Total detections",
                      oldValue: oldResult.total_components || 0,
                      newValue: newResult.total_components || 0,
                      format: (v) => v,
                    },
                    {
                      label: "Unique component classes",
                      oldValue: oldBom.length,
                      newValue: newBom.length,
                      format: (v) => v,
                    },
                    {
                      label: "Average confidence",
                      oldValue: oldConfidence,
                      newValue: newConfidence,
                      format: (v) => `${v.toFixed(2)}%`,
                    },
                    {
                      label: "Inference time",
                      oldValue: oldResult.latency_ms || 0,
                      newValue: newResult.latency_ms || 0,
                      format: (v) => `${(v / 1000).toFixed(2)} s`,
                    },
                  ].map((metric) => {
                    const difference =
                      metric.newValue - metric.oldValue;

                    return (
                      <tr key={metric.label}>
                        <td style={{ ...tdStyle, fontWeight: 800 }}>
                          {metric.label}
                        </td>

                        <td style={{ ...tdStyle, color: oldColor }}>
                          {metric.format(metric.oldValue)}
                        </td>

                        <td style={{ ...tdStyle, color: newColor, fontWeight: 800 }}>
                          {metric.format(metric.newValue)}
                        </td>

                        <td
                          style={{
                            ...tdStyle,
                            fontWeight: 800,
                            color:
                              difference > 0
                                ? "#059669"
                                : difference < 0
                                ? "#dc2626"
                                : "#64748b",
                          }}
                        >
                          {difference > 0 ? "+" : ""}
                          {metric.format(Math.abs(difference))}
                          {difference < 0 ? " lower" : difference > 0 ? " higher" : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p
              style={{
                fontSize: 11,
                color: "#64748b",
                lineHeight: 1.6,
                marginBottom: 0,
              }}
            >
              These figures compare model outputs on one image. More
              detections or higher confidence do not automatically mean
              better accuracy. Use ground-truth annotations and validation
              metrics such as precision, recall and mAP for that conclusion.
            </p>
          </div>
        )}

        {/* ===================================== */}
        {/* BOM TAB */}
        {/* ===================================== */}

        {oldNewTab === "bom" && (
          <div style={panelStyle}>
            {(() => {
              const selectedBom = oldNewBomVersion === "old" ? oldBom : newBom;
              const selectedResult = oldNewBomVersion === "old" ? oldResult : newResult;
              const selectedLabel = oldNewBomVersion === "old" ? "Old" : "New";
              return (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <h3 style={sectionTitle}>{selectedLabel} Checkpoint Bill of Materials</h3>
                      <p style={{ ...muted, fontSize: 12, margin: "6px 0 0" }}>
                        BOM generated from the {selectedLabel.toLowerCase()} checkpoint's predictions.
                      </p>
                    </div>
                    <Button onClick={() => downloadBomCsv(selectedBom, selectedLabel.toLowerCase())} disabled={!selectedBom.length}>
                      ↓ Export {selectedLabel} BOM CSV
                    </Button>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                    <Button variant={oldNewBomVersion === "old" ? "primary" : "secondary"} onClick={() => setOldNewBomVersion("old")}>Old BOM</Button>
                    <Button variant={oldNewBomVersion === "new" ? "primary" : "secondary"} onClick={() => setOldNewBomVersion("new")}>New BOM</Button>
                  </div>
                  <div style={{ overflowX: "auto", marginTop: 12 }}>
                    <table style={{ ...tableStyle, minWidth: 520 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Tag</th>
                    <th style={thStyle}>Component</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>
                      Quantity
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {selectedBom.length > 0 ? (
                    selectedBom.map((item, index) => (
                      <tr key={`${item.component}-${index}`}>
                        <td style={tdStyle}>
                          <strong style={{ color: getColor(item.component) }}>
                            {item.tag}
                          </strong>
                        </td>

                        <td style={{ ...tdStyle, fontWeight: 700 }}>
                          {item.component}
                        </td>

                        <td
                          style={{
                            ...tdStyle,
                            textAlign: "right",
                            fontWeight: 900,
                          }}
                        >
                          {item.quantity}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={3}
                        style={{ ...tdStyle, textAlign: "center" }}
                      >
                        No components detected by the selected model.
                      </td>
                    </tr>
                  )}
                </tbody>

                {selectedBom.length > 0 && (
                  <tfoot>
                    <tr style={{ background: "#f8fafc" }}>
                      <td style={tdStyle}>ALL</td>
                      <td style={{ ...tdStyle, fontWeight: 900 }}>
                        TOTAL COMPONENTS
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "right",
                          fontWeight: 900,
                        }}
                      >
                        {selectedResult.total_components}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
                  </div>
                </>
              );
            })()}
          </div>
        )}

      </div>
    );
  })()}
</section>
{/* END OLD VS NEW MODEL COMPARISON */}
  </>
  );
}
