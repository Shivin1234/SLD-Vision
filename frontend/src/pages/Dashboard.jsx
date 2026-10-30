import React, { useState } from "react";

/* ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
   AnalysisView ΓÇô extracted so React hooks work (can't use inside IIFE)
ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
function AnalysisView({ result, getColor, card, muted }) {
  const [hovBar,  setHovBar]  = useState(null); // hovered bar component name
  const [hovRow,  setHovRow]  = useState(null); // hovered confidence row index
  const [hovPt,   setHovPt]   = useState(null); // hovered line-chart point index
  const [hovLeg,  setHovLeg]  = useState(null); // hovered legend item index

  const detections     = result.detections || [];
  const totalDetections = detections.length;

  const sortedBom = (result.bom || []).slice().sort((a, b) => b.quantity - a.quantity);

  const confidenceBins = [
    { label: "0ΓÇô50%",   min: 0,  max: 50,  color: "#ef4444" },
    { label: "50ΓÇô70%",  min: 50, max: 70,  color: "#f97316" },
    { label: "70ΓÇô80%",  min: 70, max: 80,  color: "#eab308" },
    { label: "80ΓÇô90%",  min: 80, max: 90,  color: "#0ea5e9" },
    { label: "90ΓÇô100%", min: 90, max: 101, color: "#10b981" },
  ].map((bin) => ({
    ...bin,
    count: detections.filter(
      (d) => Number(d.confidence) >= bin.min && Number(d.confidence) < bin.max
    ).length,
  }));

  const confidenceByClass = sortedBom.map((item) => {
    const cd = detections.filter((d) => d.name === item.component);
    return {
      ...item,
      averageConfidence: cd.length
        ? cd.reduce((s, d) => s + Number(d.confidence || 0), 0) / cd.length
        : Number(item.averageConfidence || 0),
    };
  }).sort((a, b) => a.averageConfidence - b.averageConfidence);

  const maxQuantity       = Math.max(1, ...sortedBom.map((i) => i.quantity));
  const maxHistogramCount = Math.max(1, ...confidenceBins.map((b) => b.count));

  const shareStops = [];
  let accumulated = 0;
  sortedBom.forEach((item) => {
    const share = totalDetections ? (item.quantity / totalDetections) * 100 : 0;
    shareStops.push(`${getColor(item.component)} ${accumulated}% ${accumulated + share}%`);
    accumulated += share;
  });
  const donutBackground = shareStops.length ? `conic-gradient(${shareStops.join(", ")})` : "#e2e8f0";

  const panelStyle = { ...card, padding: 18, minWidth: 0, height: "100%", boxSizing: "border-box" };
  const panelTitleStyle = { margin: 0, fontSize: 14, fontWeight: 850, color: "#0f172a" };
  const helperStyle = { ...muted, fontSize: 11, lineHeight: 1.5, margin: "5px 0 0" };
  const chartGridStyle = { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16, alignItems: "stretch" };

  const chartHeight = 235;
  const chartWidth  = 520;

  const confidencePoints = confidenceBins.map((bin, i) => ({
    x: 45 + i * ((chartWidth - 80) / Math.max(1, confidenceBins.length - 1)),
    y: chartHeight - 42 - (bin.count / maxHistogramCount) * (chartHeight - 85),
    ...bin,
  }));
  const confidenceLine = confidencePoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = confidencePoints.length > 0
    ? `${confidenceLine} L ${confidencePoints.at(-1).x} ${chartHeight - 42} L ${confidencePoints[0].x} ${chartHeight - 42} Z`
    : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 18 }}>

      {/* ΓöÇΓöÇ Row 1: Component distribution + Average confidence ΓöÇΓöÇ */}
      <div style={chartGridStyle} className="voltai-compare-chart-grid">

        {/* Component Distribution Bar Chart */}
        <section style={panelStyle}>
          <div style={{ marginBottom: 15 }}>
            <h3 style={panelTitleStyle}>Component distribution</h3>
            <p style={helperStyle}>Detected instances per component class, sorted most to least.</p>
          </div>

          {sortedBom.length ? (
            <div style={{ display: "flex", alignItems: "stretch", gap: 10, height: chartHeight, overflowX: "auto", padding: "8px 3px 0", borderBottom: "1px solid #e2e8f0", boxSizing: "border-box" }}>
              {sortedBom.map((item) => {
                const color = getColor(item.component);
                const isHov = hovBar === item.component;
                const barH  = Math.max(4, (item.quantity / maxQuantity) * 155);
                return (
                  <div
                    key={item.component}
                    onMouseEnter={() => setHovBar(item.component)}
                    onMouseLeave={() => setHovBar(null)}
                    style={{ flex: "1 0 54px", minWidth: 54, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 7, position: "relative", cursor: "default" }}
                  >
                    {/* Tooltip */}
                    {isHov && (
                      <div style={{
                        position: "absolute", bottom: "calc(100% - 24px)", left: "50%",
                        transform: "translateX(-50%)", zIndex: 60, pointerEvents: "none",
                        background: "#0f172a", color: "#f8fafc", borderRadius: 10,
                        padding: "9px 13px", fontSize: 11, fontWeight: 700,
                        whiteSpace: "nowrap", boxShadow: "0 10px 32px rgba(0,0,0,0.35)",
                        border: `1px solid ${color}66`,
                      }}>
                        <div style={{ color, fontWeight: 900, marginBottom: 3 }}>{item.component}</div>
                        <div>{item.quantity} detections</div>
                        <div style={{ color: "#94a3b8", marginTop: 2 }}>
                          {totalDetections ? ((item.quantity / totalDetections) * 100).toFixed(1) : 0}% of total
                        </div>
                        <div style={{ position: "absolute", bottom: -7, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "7px solid transparent", borderRight: "7px solid transparent", borderTop: "7px solid #0f172a" }} />
                      </div>
                    )}

                    {/* Value */}
                    <strong style={{ fontSize: isHov ? 14 : 11, color, fontWeight: 900, transition: "font-size 150ms" }}>
                      {item.quantity}
                    </strong>

                    {/* Bar */}
                    <div style={{
                      width: isHov ? "min(42px,82%)" : "min(34px,75%)",
                      height: `${isHov ? Math.min(barH * 1.2, 178) : barH}px`,
                      background: isHov ? color : `linear-gradient(180deg,${color}77,${color})`,
                      borderRadius: "8px 8px 2px 2px",
                      boxShadow: isHov ? `0 0 0 3px ${color}33, 0 10px 32px ${color}99` : "none",
                      transition: "all 220ms cubic-bezier(.34,1.56,.64,1)",
                    }} />

                    {/* Label */}
                    <span style={{
                      fontSize: 9, color: isHov ? "#1e293b" : "#475569",
                      textAlign: "center", lineHeight: 1.3, overflowWrap: "anywhere",
                      maxWidth: 75, fontWeight: isHov ? 800 : 400, transition: "all 150ms",
                    }}>
                      {item.component}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={helperStyle}>No detections to chart.</p>
          )}
          <p style={helperStyle}>Shows the most and least frequently detected component classes.</p>
        </section>

        {/* Average Confidence by Component */}
        <section style={panelStyle}>
          <div style={{ marginBottom: 15 }}>
            <h3 style={panelTitleStyle}>Average confidence by component</h3>
            <p style={helperStyle}>Mean confidence for each class. Lower values may deserve manual review.</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: chartHeight, overflowY: "auto", paddingRight: 3 }}>
            {confidenceByClass.map((item, i) => {
              const color    = getColor(item.component);
              const isHov    = hovRow === i;
              const confColor = item.averageConfidence < 70 ? "#dc2626" : item.averageConfidence < 85 ? "#d97706" : "#059669";
              return (
                <div
                  key={item.component}
                  onMouseEnter={() => setHovRow(i)}
                  onMouseLeave={() => setHovRow(null)}
                  style={{
                    padding: "8px 11px", borderRadius: 10,
                    background: isHov ? `${color}14` : "transparent",
                    border: `1px solid ${isHov ? color + "44" : "transparent"}`,
                    borderLeft: `3px solid ${isHov ? color : "transparent"}`,
                    transition: "all 190ms ease", cursor: "default",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6, fontSize: 10 }}>
                    <span style={{ color: isHov ? "#0f172a" : "#334155", fontWeight: isHov ? 900 : 700, transition: "all 150ms" }}>
                      {item.component}
                    </span>
                    <strong style={{
                      color: confColor, flexShrink: 0,
                      fontSize: isHov ? 13 : 10,
                      transition: "font-size 150ms",
                    }}>
                      {item.averageConfidence.toFixed(1)}%
                    </strong>
                  </div>
                  <div style={{ height: isHov ? 13 : 8, background: "#edf2f7", borderRadius: 99, overflow: "hidden", transition: "height 200ms ease" }}>
                    <div style={{
                      width: `${Math.max(0, Math.min(100, item.averageConfidence))}%`,
                      height: "100%",
                      background: isHov ? color : `linear-gradient(90deg,${color}88,${color})`,
                      borderRadius: 99,
                      boxShadow: isHov ? `0 0 14px ${color}cc` : "none",
                      transition: "all 200ms ease",
                    }} />
                  </div>
                </div>
              );
            })}
            {!confidenceByClass.length && <p style={helperStyle}>No class confidence data available.</p>}
          </div>
          <p style={{ ...helperStyle, marginTop: 12 }}>Confidence is not the same as correctness.</p>
        </section>
      </div>

      {/* ΓöÇΓöÇ Row 2: Confidence line chart + Component share ΓöÇΓöÇ */}
      <div style={chartGridStyle} className="voltai-compare-chart-grid">

        {/* Confidence Distribution Line Chart */}
        <section style={panelStyle}>
          <div style={{ marginBottom: 15 }}>
            <h3 style={panelTitleStyle}>Confidence distribution</h3>
            <p style={helperStyle}>Number of predictions across confidence ranges, shown as a line chart.</p>
          </div>

          <div style={{ width: "100%", height: chartHeight }}>
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              role="img"
              aria-label="Line chart of detection counts by confidence range"
              style={{ width: "100%", height: "100%", display: "block", overflow: "visible" }}
            >
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#0284c7" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#0284c7" stopOpacity="0.01" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((f) => {
                const y = chartHeight - 42 - f * (chartHeight - 85);
                return (
                  <g key={f}>
                    <line x1="42" y1={y} x2={chartWidth - 25} y2={y} stroke="#e2e8f0" strokeDasharray="4 4" />
                    <text x="34" y={y + 4} textAnchor="end" fontSize="10" fill="#64748b">
                      {Math.round(maxHistogramCount * f)}
                    </text>
                  </g>
                );
              })}

              {/* Filled area */}
              {areaPath && <path d={areaPath} fill="url(#areaGrad)" />}

              {/* Line */}
              <path d={confidenceLine} fill="none" stroke="#0284c7" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />

              {/* Vertical hover crosshair */}
              {hovPt !== null && (
                <line
                  x1={confidencePoints[hovPt].x} y1={chartHeight - 42}
                  x2={confidencePoints[hovPt].x} y2={confidencePoints[hovPt].y + 9}
                  stroke={confidencePoints[hovPt].color}
                  strokeWidth="2" strokeDasharray="4 3" opacity="0.7"
                />
              )}

              {/* Data points */}
              {confidencePoints.map((point, i) => {
                const isHov = hovPt === i;
                return (
                  <g
                    key={point.label}
                    onMouseEnter={() => setHovPt(i)}
                    onMouseLeave={() => setHovPt(null)}
                    style={{ cursor: "default" }}
                  >
                    {/* Glow ring on hover */}
                    {isHov && <circle cx={point.x} cy={point.y} r="18" fill={point.color} opacity="0.13" />}

                    {/* SVG Tooltip */}
                    {isHov && (
                      <g>
                        <rect x={point.x - 60} y={point.y - 52} width={120} height={38} rx={8} ry={8}
                          fill="#0f172a" filter="drop-shadow(0 5px 14px rgba(0,0,0,0.38))" />
                        <text x={point.x} y={point.y - 33} textAnchor="middle" fontSize="10" fontWeight="800" fill={point.color}>
                          {point.label}
                        </text>
                        <text x={point.x} y={point.y - 19} textAnchor="middle" fontSize="12" fontWeight="900" fill="#f8fafc">
                          {point.count} predictions
                        </text>
                        <polygon
                          points={`${point.x - 7},${point.y - 15} ${point.x + 7},${point.y - 15} ${point.x},${point.y - 6}`}
                          fill="#0f172a"
                        />
                      </g>
                    )}

                    {/* Value label (hidden when tooltip visible) */}
                    {!isHov && (
                      <text x={point.x} y={Math.max(13, point.y - 10)} textAnchor="middle" fontSize="11" fontWeight="700" fill={point.color}>
                        {point.count}
                      </text>
                    )}

                    {/* Circle */}
                    <circle
                      cx={point.x} cy={point.y}
                      r={isHov ? 10 : 5}
                      fill={point.color} stroke="#ffffff"
                      strokeWidth={isHov ? 3 : 2}
                    >
                      <title>{`${point.label}: ${point.count} predictions`}</title>
                    </circle>

                    {/* X-axis label */}
                    <text x={point.x} y={chartHeight - 17} textAnchor="middle" fontSize="10"
                      fill={isHov ? point.color : "#64748b"} fontWeight={isHov ? "800" : "400"}>
                      {point.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <p style={helperStyle}>Each point represents the number of detections in that confidence range.</p>
        </section>

        {/* Component Share Donut */}
        <section style={panelStyle}>
          <div style={{ marginBottom: 12 }}>
            <h3 style={panelTitleStyle}>Component share</h3>
            <p style={helperStyle}>Each class as a share of all detected instances.</p>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, flexWrap: "wrap", padding: "5px 0 3px", minHeight: 180 }}>
            {/* Donut */}
            <div style={{
              width: 148, height: 148, flexShrink: 0, borderRadius: "50%",
              background: donutBackground, position: "relative", display: "grid", placeItems: "center",
              transition: "transform 280ms cubic-bezier(.34,1.56,.64,1), box-shadow 280ms ease",
              transform: hovLeg !== null ? "scale(1.06)" : "scale(1)",
              boxShadow: hovLeg !== null && sortedBom[hovLeg]
                ? `0 0 0 4px ${getColor(sortedBom[hovLeg].component)}44, 0 8px 24px ${getColor(sortedBom[hovLeg].component)}33`
                : "none",
            }}>
              <div style={{ width: 86, height: 86, borderRadius: "50%", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 5px #0f172a12" }}>
                {hovLeg !== null && sortedBom[hovLeg] ? (
                  <>
                    <strong style={{ fontSize: 18, color: getColor(sortedBom[hovLeg].component), transition: "color 150ms" }}>
                      {totalDetections ? ((sortedBom[hovLeg].quantity / totalDetections) * 100).toFixed(1) : 0}%
                    </strong>
                    <span style={{ fontSize: 8, color: "#64748b", fontWeight: 800, textAlign: "center", maxWidth: 72, lineHeight: 1.2 }}>
                      {sortedBom[hovLeg].component.split(" ").slice(0, 2).join(" ")}
                    </span>
                  </>
                ) : (
                  <>
                    <strong style={{ fontSize: 22, color: "#0f172a" }}>{totalDetections}</strong>
                    <span style={{ fontSize: 9, color: "#64748b", fontWeight: 800 }}>DETECTIONS</span>
                  </>
                )}
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 120, maxWidth: 220, flex: "1 1 130px" }}>
              {sortedBom.slice(0, 7).map((item, i) => {
                const color  = getColor(item.component);
                const isHov  = hovLeg === i;
                return (
                  <div
                    key={item.component}
                    onMouseEnter={() => setHovLeg(i)}
                    onMouseLeave={() => setHovLeg(null)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, fontSize: 10,
                      padding: "6px 9px", borderRadius: 8, cursor: "default",
                      background: isHov ? `${color}14` : "transparent",
                      border: `1px solid ${isHov ? color + "55" : "transparent"}`,
                      transition: "all 180ms ease",
                    }}
                  >
                    <span style={{
                      width: isHov ? 13 : 8, height: isHov ? 13 : 8,
                      borderRadius: 3, background: color, flexShrink: 0,
                      boxShadow: isHov ? `0 0 10px ${color}cc` : "none",
                      transition: "all 180ms ease",
                    }} />
                    <span style={{ color: isHov ? "#0f172a" : "#475569", flex: 1, minWidth: 0, fontWeight: isHov ? 800 : 400, transition: "all 150ms" }}>
                      {item.component}
                    </span>
                    <strong style={{ color: isHov ? color : "#0f172a", flexShrink: 0, fontSize: isHov ? 11 : 10, transition: "all 150ms" }}>
                      {totalDetections ? ((item.quantity / totalDetections) * 100).toFixed(1) : "0.0"}%
                    </strong>
                  </div>
                );
              })}
              {sortedBom.length > 7 && <span style={{ fontSize: 10, color: "#64748b", padding: "0 9px" }}>+ {sortedBom.length - 7} more classes</span>}
              {!sortedBom.length && <span style={helperStyle}>No class shares available.</span>}
            </div>
          </div>

          <p style={helperStyle}>Shows the proportional makeup of this SLD.</p>
        </section>
      </div>

      <p style={{ ...muted, fontSize: 10, lineHeight: 1.5, margin: "0 2px" }}>
        All values describe this model's predictions on the selected image. Confidence values are descriptive diagnostics, not independently measured accuracy or ground-truth validation metrics.
      </p>
    </div>
  );
}

/* ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
   Main Dashboard component
ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
export default function Dashboard(props) {
  const {
    MODELS, getColor, Button, TabBar, pillStyle,
    card, muted, sectionTitle, tableStyle, thStyle, tdStyle,
    dashboardView, setDashboardView,
    file, preview, loading, selectedModel, setSelectedModel,
    result, setResult, compareResult, setCompareResult,
    minConfidence, setMinConfidence, showBoxes, setShowBoxes,
    zoomLevel, setZoomLevel,
    selectedCategoryFilter, setSelectedCategoryFilter,
    hoveredDetection, setHoveredDetection, hoveredCategory, setHoveredCategory,
    selectedDetectionIndex, setSelectedDetectionIndex,
    isFullscreen, setIsFullscreen, imageRef, viewportRef, filteredDetections,
    handleFileChange, handleRunDetection, resetViewState,
    downloadCSV, downloadAnnotatedImage,
  } = props;

  return (
    <>
      {/* Detection setup */}
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
          {MODELS.map((model) => (
            <button key={model.id} onClick={() => { setSelectedModel(model.id); setResult(null); setCompareResult(null); resetViewState(); }} style={{
              textAlign: "left", padding: 13, borderRadius: 11,
              border: selectedModel === model.id ? `2px solid ${model.color}` : "1px solid #e2e8f0",
              background: selectedModel === model.id ? `${model.color}0d` : "#fff", cursor: "pointer",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>{model.icon}</span>
                <span style={{ fontWeight: 800, fontSize: 12, color: "#1e293b" }}>{model.label}</span>
              </div>
              <div style={{ fontSize: 11, ...muted, marginTop: 7 }}>{model.description}</div>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 13, flexWrap: "wrap" }}>
          <Button onClick={handleRunDetection} disabled={!file || loading}>
            {loading ? "ΓÅ│ Running detectionΓÇª" : `Γû╢ Run ${MODELS.find((m) => m.id === selectedModel)?.label || "model"} detection`}
          </Button>
          <span style={{ ...muted, fontSize: 12 }}>{file ? `Selected: ${file.name}` : "Choose a JPG, PNG, or other browser-supported image."}</span>
        </div>
      </section>

      {result && <TabBar tabs={[{ id: "analysis", label: "Analysis" }, { id: "annotated", label: "Annotated image" }, { id: "bom", label: "BOM" }]} value={dashboardView} onChange={setDashboardView} />}

      {/* Analysis tab ΓÇô uses AnalysisView component so hooks work */}
      {result && dashboardView === "analysis" && (
        <AnalysisView result={result} getColor={getColor} card={card} muted={muted} />
      )}

      {/* BOM tab */}
      {result && dashboardView === "bom" && (
        <section style={{ ...card, padding: 18, marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <h2 style={sectionTitle}>Bill of Materials</h2>
              <p style={{ ...muted, fontSize: 12, margin: "5px 0 0" }}>Component-wise quantities and model confidence.</p>
            </div>
            <Button variant="success" onClick={() => downloadCSV(result)}>Γåô Export BOM CSV</Button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ ...tableStyle, minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Tag</th>
                  <th style={thStyle}>Component name</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Quantity</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Avg. confidence</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Share of detections</th>
                </tr>
              </thead>
              <tbody>
                {result.bom.map((item) => (
                  <tr key={item.component} className="voltai-row">
                    <td style={tdStyle}><span style={{ color: getColor(item.component), fontWeight: 900 }}>{item.tag}</span></td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{item.component}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 900 }}>{item.quantity}</td>
                    <td style={{ ...tdStyle, textAlign: "right", color: "#047857", fontWeight: 800 }}>{item.averageConfidence.toFixed(2)}%</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{item.percentOfDetections.toFixed(1)}%</td>
                  </tr>
                ))}
                <tr style={{ background: "#f8fafc" }}>
                  <td style={tdStyle}>ALL</td>
                  <td style={{ ...tdStyle, fontWeight: 900 }}>TOTAL DETECTED SYMBOLS</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 900 }}>{result.total}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>ΓÇö</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Annotated image tab */}
      {result && dashboardView === "annotated" && (
        <>
          <div className="voltai-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, marginBottom: 18 }}>
            {[
              ["Detected symbols", result.total, "#0284c7"],
              ["Unique classes", result.bom.length, "#059669"],
              ["Request time", `${(result.latency_ms / 1000).toFixed(2)} s`, "#7c3aed"],
              ["Image dimensions", `${result.width} ├ù ${result.height}`, "#d97706"],
            ].map(([label, value, color]) => (
              <div key={label} style={{ ...card, padding: 16 }}>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>{label}</div>
                <div style={{ color, fontSize: 24, fontWeight: 900, marginTop: 8, overflowWrap: "anywhere" }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ ...card, padding: 16, marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <label style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>
                  Confidence threshold <strong style={{ color: "#0284c7" }}>{minConfidence}%</strong>
                  <input aria-label="Confidence threshold" type="range" min="0" max="95" step="1" value={minConfidence} onChange={(e) => { setMinConfidence(Number(e.target.value)); setSelectedDetectionIndex(null); }} style={{ display: "block", width: 210, accentColor: "#0284c7", marginTop: 7 }} />
                </label>
                <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 12, fontWeight: 700, color: "#475569" }}>
                  <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> Bounding boxes
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <Button variant="secondary" onClick={() => setZoomLevel((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}>ΓêÆ</Button>
                  <span style={{ fontSize: 12, fontWeight: 800, minWidth: 42, textAlign: "center" }}>{Math.round(zoomLevel * 100)}%</span>
                  <Button variant="secondary" onClick={() => setZoomLevel((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}>+</Button>
                  <Button variant="secondary" onClick={() => setZoomLevel(1)}>Reset</Button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button variant="secondary" onClick={() => setIsFullscreen(true)}>Γ¢╢ Fullscreen viewer</Button>
                <Button variant="secondary" onClick={() => downloadAnnotatedImage(result)}>Γåô Annotated image</Button>
              </div>
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 7, flexWrap: "wrap" }}>
              <button onClick={() => setSelectedCategoryFilter("ALL")} style={pillStyle(selectedCategoryFilter === "ALL", "#0284c7")}>All ({result.detections.length})</button>
              {result.bom.map((item) => (
                <button key={item.component} onClick={() => setSelectedCategoryFilter(selectedCategoryFilter === item.component ? "ALL" : item.component)} style={pillStyle(selectedCategoryFilter === item.component, getColor(item.component))}>
                  {item.component} ({item.quantity})
                </button>
              ))}
            </div>
          </div>

          <div className="voltai-main-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.65fr) minmax(320px,0.9fr)", gap: 18, alignItems: "start" }}>
            <section style={{ ...card, overflow: "hidden" }}>
              <div style={{ padding: "15px 17px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <h2 style={sectionTitle}>Schematic visualizer</h2>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#059669" }}>{filteredDetections.length} of {result.total} displayed ┬╖ click a box to inspect</span>
              </div>
              <div ref={viewportRef} style={{ maxHeight: isFullscreen ? "none" : "72vh", overflow: "auto", padding: 12, background: "#f8fafc" }}>
                <div style={{ position: "relative", display: "inline-block", minWidth: "100%", transform: `scale(${zoomLevel})`, transformOrigin: "top left" }}>
                  <img ref={imageRef} src={preview} alt="Uploaded SLD drawing" style={{ display: "block", width: "100%", height: "auto", border: "1px solid #e2e8f0" }} />
                  {showBoxes && filteredDetections.map((det, idx) => {
                    const color  = getColor(det.name);
                    const hovered = hoveredDetection === idx || hoveredCategory === det.name;
                    const nearTop = det.box.y < result.height * 0.15;
                    return (
                      <div key={`${det.id}-${idx}`} role="button" tabIndex={0} title="Click to inspect symbol"
                        onClick={() => setSelectedDetectionIndex(idx)}
                        onKeyDown={(e) => { if (e.key === "Enter") setSelectedDetectionIndex(idx); }}
                        onMouseEnter={() => setHoveredDetection(idx)}
                        onMouseLeave={() => setHoveredDetection(null)}
                        style={{ position: "absolute", left: `${det.box.x / result.width * 100}%`, top: `${det.box.y / result.height * 100}%`, width: `${det.box.w / result.width * 100}%`, height: `${det.box.h / result.height * 100}%`, border: `${hovered ? 3 : 1.5}px solid ${color}`, background: hovered ? `${color}30` : `${color}12`, cursor: "pointer", zIndex: hovered ? 20 : 2, boxSizing: "border-box" }}>
                        {hovered && (
                          <div style={{ position: "absolute", [nearTop ? "top" : "bottom"]: "calc(100% + 5px)", left: "50%", transform: "translateX(-50%)", background: "#fff", color: "#0f172a", border: `1px solid ${color}`, borderRadius: 8, padding: "8px 10px", minWidth: 170, maxWidth: 260, boxShadow: "0 8px 24px #0f172a22", fontSize: 11, whiteSpace: "normal", pointerEvents: "none", zIndex: 100 }}>
                            <strong>{det.name}</strong>
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, color: "#047857", fontWeight: 800 }}><span>Confidence</span><span>{det.confidence.toFixed(1)}%</span></div>
                            <div style={{ height: 6, background: "#e2e8f0", borderRadius: 99, overflow: "hidden", marginTop: 5 }}><div style={{ height: "100%", width: `${det.confidence}%`, background: color, borderRadius: 99 }} /></div>
                            <div style={{ color: "#64748b", marginTop: 5 }}>Click to magnify symbol</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section style={{ ...card, overflow: "hidden" }}>
              <div style={{ padding: "15px 17px", borderBottom: "1px solid #e2e8f0" }}>
                <h2 style={sectionTitle}>Components</h2>
              </div>
              <div style={{ padding: 16 }}>
                <p style={{ ...muted, fontSize: 12, lineHeight: 1.5, marginTop: 0 }}>Hover over a component to highlight its boxes.</p>
                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Tag</th>
                        <th style={thStyle}>Component</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Qty</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Avg. confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.bom.map((item) => (
                        <tr key={item.component} className="voltai-row"
                          onMouseEnter={() => setHoveredCategory(item.component)}
                          onMouseLeave={() => setHoveredCategory(null)}
                          onClick={() => setSelectedCategoryFilter(item.component)}
                          style={{ cursor: "pointer", background: hoveredCategory === item.component ? "#f0f9ff" : "#fff" }}>
                          <td style={tdStyle}><span style={{ background: `${getColor(item.component)}15`, color: getColor(item.component), borderRadius: 5, padding: "4px 6px", fontWeight: 900, fontSize: 10 }}>{item.tag}</span></td>
                          <td style={tdStyle}>
                            <div style={{ fontSize: 12, fontWeight: 700 }}>{item.component}</div>
                            <div style={{ height: 3, background: "#e2e8f0", borderRadius: 9, marginTop: 6, maxWidth: 130 }}>
                              <div style={{ height: 3, width: `${item.percentOfDetections}%`, background: getColor(item.component), borderRadius: 9 }} />
                            </div>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 900 }}>{item.quantity}</td>
                          <td style={{ ...tdStyle, textAlign: "right", color: "#047857", fontWeight: 800 }}>{item.averageConfidence.toFixed(1)}%</td>
                        </tr>
                      ))}
                      <tr style={{ background: "#f8fafc" }}>
                        <td style={tdStyle}>ALL</td>
                        <td style={{ ...tdStyle, fontWeight: 900 }}>TOTAL DETECTED SYMBOLS</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 900 }}>{result.total}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>ΓÇö</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      {/* Empty state */}
      {!result && (
        <div style={{ ...card, padding: "58px 22px", textAlign: "center" }}>
          <div style={{ fontSize: 38, marginBottom: 12 }}>Γîü</div>
          <h2 style={sectionTitle}>Start with an SLD drawing</h2>
          <p style={{ ...muted, fontSize: 13, maxWidth: 480, margin: "9px auto 0", lineHeight: 1.6 }}>
            Upload your single-line diagram, choose a detector, and run inference to view component boxes, confidence scores, and the generated bill of materials.
          </p>
        </div>
      )}
    </>
  );
}
