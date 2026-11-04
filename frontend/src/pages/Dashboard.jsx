import React from "react";

export default function Dashboard(props) {
  const {
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
} = props;
  return (
    <>
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

            {result && <TabBar tabs={[{id:"analysis",label:"Analysis"},{id:"annotated",label:"Annotated image"},{id:"bom",label:"BOM"}]} value={dashboardView} onChange={setDashboardView} />}
            
{result && dashboardView === "analysis" && (() => {
  const detections = result.detections || [];
  const totalDetections = detections.length;

  const sortedBom = (result.bom || [])
    .slice()
    .sort((a, b) => b.quantity - a.quantity);

  const confidenceBins = [
    { label: "0–50%", min: 0, max: 50, color: "#ef4444" },
    { label: "50–70%", min: 50, max: 70, color: "#f97316" },
    { label: "70–80%", min: 70, max: 80, color: "#eab308" },
    { label: "80–90%", min: 80, max: 90, color: "#0ea5e9" },
    { label: "90–100%", min: 90, max: 101, color: "#10b981" },
  ].map((bin) => ({
    ...bin,
    count: detections.filter(
      (d) => Number(d.confidence) >= bin.min &&
             Number(d.confidence) < bin.max
    ).length,
  }));

  const confidenceByClass = sortedBom.map((item) => {
    const classDetections = detections.filter(
      (d) => d.name === item.component
    );

    return {
      ...item,
      averageConfidence: classDetections.length
        ? classDetections.reduce(
            (sum, d) => sum + Number(d.confidence || 0), 0
          ) / classDetections.length
        : Number(item.averageConfidence || 0),
    };
  }).sort((a, b) => a.averageConfidence - b.averageConfidence);

  const maxQuantity = Math.max(
    1, ...sortedBom.map((item) => item.quantity)
  );

  const maxHistogramCount = Math.max(
    1, ...confidenceBins.map((bin) => bin.count)
  );

  const shareStops = [];
  let accumulated = 0;

  sortedBom.forEach((item) => {
    const share = totalDetections
      ? (item.quantity / totalDetections) * 100
      : 0;

    shareStops.push(
      `${getColor(item.component)} ${accumulated}% ${accumulated + share}%`
    );
    accumulated += share;
  });

  const donutBackground = shareStops.length
    ? `conic-gradient(${shareStops.join(", ")})`
    : "#e2e8f0";

  const panelStyle = {
    ...card,
    padding: 18,
    minWidth: 0,
    height: "100%",
    boxSizing: "border-box",
  };

  const panelTitleStyle = {
    margin: 0,
    fontSize: 14,
    fontWeight: 850,
    color: "#0f172a",
  };

  const helperStyle = {
    ...muted,
    fontSize: 11,
    lineHeight: 1.5,
    margin: "5px 0 0",
  };

  const chartGridStyle = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: 16,
    alignItems: "stretch",
  };

  const chartHeight = 235;
  const chartWidth = 520;

  const confidencePoints = confidenceBins.map((bin, index) => ({
    x: 45 + index * ((chartWidth - 80) / Math.max(1, confidenceBins.length - 1)),
    y: chartHeight - 42 -
      (bin.count / maxHistogramCount) * (chartHeight - 85),
    ...bin,
  }));

  const confidenceLine = confidencePoints
    .map((point, index) =>
      `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`
    )
    .join(" ");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        marginBottom: 18,
      }}
    >
      {/* Row 1: Component distribution + Average confidence */}
      <div
        style={chartGridStyle}
        className="voltai-compare-chart-grid"
      >
        <section style={panelStyle}>
          <div style={{ marginBottom: 15 }}>
            <h3 style={panelTitleStyle}>Component distribution</h3>
            <p style={helperStyle}>
              Number of detected instances per component class,
              sorted from most to least common.
            </p>
          </div>

          {sortedBom.length ? (
            <div
              style={{
                display: "flex",
                alignItems: "stretch",
                gap: 10,
                height: chartHeight,
                overflowX: "auto",
                padding: "8px 3px 0",
                borderBottom: "1px solid #e2e8f0",
                boxSizing: "border-box",
              }}
            >
              {sortedBom.map((item) => (
                <div
                  key={item.component}
                  title={`${item.component}: ${item.quantity} detections`}
                  style={{
                    flex: "1 0 54px",
                    minWidth: 54,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: 7,
                  }}
                >
                  <strong
                    style={{
                      fontSize: 11,
                      color: getColor(item.component),
                    }}
                  >
                    {item.quantity}
                  </strong>

                  <div
                    style={{
                      width: "min(34px,75%)",
                      height: `${Math.max(
                        4,
                        (item.quantity / maxQuantity) * 155
                      )}px`,
                      background: `linear-gradient(180deg,${getColor(
                        item.component
                      )}88,${getColor(item.component)})`,
                      borderRadius: "7px 7px 2px 2px",
                    }}
                  />

                  <span
                    style={{
                      fontSize: 9,
                      color: "#475569",
                      textAlign: "center",
                      lineHeight: 1.3,
                      overflowWrap: "anywhere",
                      maxWidth: 75,
                    }}
                  >
                    {item.component}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p style={helperStyle}>No detections to chart.</p>
          )}

          <p style={helperStyle}>
            Shows the most and least frequently detected component classes.
          </p>
        </section>

        <section style={panelStyle}>
          <div style={{ marginBottom: 15 }}>
            <h3 style={panelTitleStyle}>
              Average confidence by component
            </h3>
            <p style={helperStyle}>
              Mean confidence for each class. Lower values may deserve
              manual review.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 13,
              maxHeight: chartHeight,
              overflowY: "auto",
              paddingRight: 3,
            }}
          >
            {confidenceByClass.map((item) => (
              <div key={item.component}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    marginBottom: 5,
                    fontSize: 10,
                  }}
                >
                  <span
                    style={{ color: "#334155", fontWeight: 700 }}
                  >
                    {item.component}
                  </span>

                  <strong
                    style={{
                      color:
                        item.averageConfidence < 70
                          ? "#dc2626"
                          : item.averageConfidence < 85
                          ? "#d97706"
                          : "#059669",
                      flexShrink: 0,
                    }}
                  >
                    {item.averageConfidence.toFixed(1)}%
                  </strong>
                </div>

                <div
                  style={{
                    height: 8,
                    background: "#edf2f7",
                    borderRadius: 99,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(100, item.averageConfidence)
                      )}%`,
                      height: "100%",
                      background: `linear-gradient(90deg,${getColor(
                        item.component
                      )}99,${getColor(item.component)})`,
                      borderRadius: 99,
                    }}
                  />
                </div>
              </div>
            ))}

            {!confidenceByClass.length && (
              <p style={helperStyle}>
                No class confidence data available.
              </p>
            )}
          </div>

          <p style={{ ...helperStyle, marginTop: 12 }}>
            Confidence is not the same as correctness.
          </p>
        </section>
      </div>

      {/* Row 2: Confidence distribution line chart + Component share */}
      <div
        style={chartGridStyle}
        className="voltai-compare-chart-grid"
      >
        <section style={panelStyle}>
          <div style={{ marginBottom: 15 }}>
            <h3 style={panelTitleStyle}>Confidence distribution</h3>
            <p style={helperStyle}>
              Number of predictions across confidence ranges, shown as a line chart.
            </p>
          </div>

          <div style={{ width: "100%", height: chartHeight }}>
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              role="img"
              aria-label="Line chart showing detection counts by confidence range"
              style={{
                width: "100%",
                height: "100%",
                display: "block",
                overflow: "visible",
              }}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
                const y = chartHeight - 42 -
                  fraction * (chartHeight - 85);

                return (
                  <g key={fraction}>
                    <line
                      x1="42"
                      y1={y}
                      x2={chartWidth - 25}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeDasharray="4 4"
                    />
                    <text
                      x="34"
                      y={y + 4}
                      textAnchor="end"
                      fontSize="10"
                      fill="#64748b"
                    >
                      {Math.round(maxHistogramCount * fraction)}
                    </text>
                  </g>
                );
              })}

              <path
                d={confidenceLine}
                fill="none"
                stroke="#0284c7"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {confidencePoints.map((point) => (
                <g key={point.label}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="5"
                    fill={point.color}
                    stroke="#ffffff"
                    strokeWidth="2"
                  >
                    <title>
                      {`${point.label}: ${point.count} predictions`}
                    </title>
                  </circle>

                  <text
                    x={point.x}
                    y={Math.max(13, point.y - 12)}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    fill={point.color}
                  >
                    {point.count}
                  </text>

                  <text
                    x={point.x}
                    y={chartHeight - 17}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#64748b"
                  >
                    {point.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          <p style={helperStyle}>
            Each point represents the number of detections in that confidence range.
          </p>
        </section>

        <section style={panelStyle}>
          <div style={{ marginBottom: 12 }}>
            <h3 style={panelTitleStyle}>Component share</h3>
            <p style={helperStyle}>
              Each class as a share of all detected instances.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 20,
              flexWrap: "wrap",
              padding: "5px 0 3px",
              minHeight: 180,
            }}
          >
            <div
              style={{
                width: 148,
                height: 148,
                flexShrink: 0,
                borderRadius: "50%",
                background: donutBackground,
                position: "relative",
                display: "grid",
                placeItems: "center",
              }}
            >
              <div
                style={{
                  width: 86,
                  height: 86,
                  borderRadius: "50%",
                  background: "#fff",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 1px 5px #0f172a12",
                }}
              >
                <strong style={{ fontSize: 22, color: "#0f172a" }}>
                  {totalDetections}
                </strong>
                <span
                  style={{
                    fontSize: 9,
                    color: "#64748b",
                    fontWeight: 800,
                  }}
                >
                  DETECTIONS
                </span>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                minWidth: 120,
                maxWidth: 220,
                flex: "1 1 130px",
              }}
            >
              {sortedBom.slice(0, 7).map((item) => (
                <div
                  key={item.component}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    fontSize: 10,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 3,
                      background: getColor(item.component),
                      flexShrink: 0,
                    }}
                  />

                  <span
                    style={{
                      color: "#475569",
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {item.component}
                  </span>

                  <strong style={{ color: "#0f172a" }}>
                    {totalDetections
                      ? (
                          (item.quantity / totalDetections) * 100
                        ).toFixed(1)
                      : "0.0"}%
                  </strong>
                </div>
              ))}

              {sortedBom.length > 7 && (
                <span style={{ fontSize: 10, color: "#64748b" }}>
                  + {sortedBom.length - 7} more classes
                </span>
              )}

              {!sortedBom.length && (
                <span style={helperStyle}>
                  No class shares available.
                </span>
              )}
            </div>
          </div>

          <p style={helperStyle}>
            Shows the proportional makeup of this SLD.
          </p>
        </section>
      </div>

      <p
        style={{
          ...muted,
          fontSize: 10,
          lineHeight: 1.5,
          margin: "0 2px",
        }}
      >
        All values describe this model's predictions on the selected image.
        Confidence values are descriptive diagnostics, not independently
        measured accuracy or ground-truth validation metrics.
      </p>
    </div>
  );
})()}

            {result && dashboardView === "bom" && <section style={{...card,padding:18,marginBottom:18}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:14}}><div><h2 style={sectionTitle}>Bill of Materials</h2><p style={{...muted,fontSize:12,margin:"5px 0 0"}}>Component-wise quantities and model confidence.</p></div><Button variant="success" onClick={()=>downloadCSV(result)}>↓ Export BOM CSV</Button></div>
              <div style={{overflowX:"auto"}}><table style={{...tableStyle,minWidth:760}}><thead><tr><th style={thStyle}>Tag</th><th style={thStyle}>Component name</th><th style={{...thStyle,textAlign:"right"}}>Quantity</th><th style={{...thStyle,textAlign:"right"}}>Avg. confidence</th><th style={{...thStyle,textAlign:"right"}}>Share of detections</th></tr></thead><tbody>{result.bom.map(item=><tr key={item.component} className="voltai-row"><td style={tdStyle}><span style={{color:getColor(item.component),fontWeight:900}}>{item.tag}</span></td><td style={{...tdStyle,fontWeight:700}}>{item.component}</td><td style={{...tdStyle,textAlign:"right",fontWeight:900}}>{item.quantity}</td><td style={{...tdStyle,textAlign:"right",color:"#047857",fontWeight:800}}>{item.averageConfidence.toFixed(2)}%</td><td style={{...tdStyle,textAlign:"right"}}>{item.percentOfDetections.toFixed(1)}%</td></tr>)}<tr style={{background:"#f8fafc"}}><td style={tdStyle}>ALL</td><td style={{...tdStyle,fontWeight:900}}>TOTAL DETECTED SYMBOLS</td><td style={{...tdStyle,textAlign:"right",fontWeight:900}}>{result.total}</td><td style={{...tdStyle,textAlign:"right"}}>—</td><td style={{...tdStyle,textAlign:"right"}}>100%</td></tr></tbody></table></div>
            </section>}
            {result && dashboardView === "annotated" && <>
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
                    <h2 style={sectionTitle}>Components</h2>
                    
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
                    
                  </div>
                </section>
              </div>
            </>}
            {!result && <div style={{ ...card, padding: "58px 22px", textAlign: "center" }}>
              <div style={{ fontSize: 38, marginBottom: 12 }}>⌁</div><h2 style={sectionTitle}>Start with an SLD drawing</h2><p style={{ ...muted, fontSize: 13, maxWidth: 480, margin: "9px auto 0", lineHeight: 1.6 }}>Upload your single-line diagram, choose a detector, and run inference to view component boxes, confidence scores, and the generated bill of materials.</p>
            </div>}
    </>
  );
}
