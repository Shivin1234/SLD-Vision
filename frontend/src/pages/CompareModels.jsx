import React from "react";

export default function CompareModels(props) {
  const {
    MODELS, getColor, Button, TabBar, pillStyle,
    card, muted, sectionTitle, tableStyle, thStyle, tdStyle,
    compareResult, compareView, setCompareView,
    file, preview, loading,
    compareActiveTab, setCompareActiveTab,
    selectedCompareClass, setSelectedCompareClass,
    bomActiveModel, setBomActiveModel,
    minConfidence, setMinConfidence,
    showBoxes, setShowBoxes,
    compareZoom, setCompareZoom,
    hoveredDetection, setHoveredDetection,
    hoveredCategory,
    setResult, setSelectedDetectionIndex,
    handleFileChange, handleRunDetection,
    downloadAnnotatedImage, downloadCSV,
  } = props;

  return (
    <>
      {/* Setup section */}
      <section style={{ ...card, padding: 18, marginBottom: 18 }}>
        <h2 style={sectionTitle}>Four-model benchmark</h2>
        <p style={{ ...muted, fontSize: 12, margin: "6px 0 16px" }}>
          The same SLD image is sent to all four models. Compare predicted counts and response times; detection count alone does not measure accuracy.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>
            SLD image
            <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: "block", marginTop: 10, maxWidth: 320, width: "100%", padding: 10, border: "1px solid #7dd3fc", borderRadius: 10, background: "#f0f9ff", color: "#334155", fontSize: 12, cursor: "pointer" }} />
          </label>
          {file && <span style={{ fontSize: 12, ...muted }}>{file.name}</span>}
          <Button onClick={() => handleRunDetection("compare")} disabled={!file || loading} style={{ alignSelf: "flex-end" }}>
            {loading ? "⏳ Running comparison…" : "▶ Run comparison"}
          </Button>
        </div>
      </section>

      {compareResult && (
        <TabBar
          tabs={[
            { id: "analysis", label: "Analysis" },
            { id: "annotated", label: "Annotated images" },
            { id: "table", label: "Comparison table" },
            { id: "bom", label: "BOM" },
          ]}
          value={compareView}
          onChange={setCompareView}
        />
      )}

      {/* Analysis view */}
      {compareResult && compareView === "analysis" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, marginBottom: 16 }} className="voltai-stats">
            {MODELS.map((m) => {
              const r = compareResult.models[m.id];
              return (
                <div key={m.id} style={{ ...card, padding: 15, borderTop: `3px solid ${m.color}` }}>
                  <div style={{ color: m.color, fontSize: 12, fontWeight: 850 }}>{m.icon} {m.label}</div>
                  <div style={{ color: m.color, fontSize: 27, fontWeight: 900, marginTop: 8 }}>{r.total}</div>
                  <div style={{ color: "#64748b", fontSize: 11 }}>detected components</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: "1px solid #e2e8f0", fontSize: 11 }}>
                    <span style={muted}>Classes</span><strong>{r.bom.length}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 11 }}>
                    <span style={muted}>Response time</span><strong>{(r.latency_ms / 1000).toFixed(2)} s</strong>
                  </div>
                </div>
              );
            })}
          </div>

          <section style={{ ...card, padding: 18, marginBottom: 18 }}>
            <div style={{ marginBottom: 16 }}>
              <h2 style={sectionTitle}>Component counts by model</h2>
              <p style={{ ...muted, fontSize: 12, margin: "5px 0 0" }}>Each chart shows the predicted number of components per class for that model.</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 16 }} className="voltai-compare-chart-grid">
              {MODELS.map((model) => {
                const r = compareResult.models[model.id];
                const items = r.bom.slice().sort((a, b) => b.quantity - a.quantity);
                const max = Math.max(1, ...items.map((x) => x.quantity));
                return (
                  <div key={model.id} className="voltai-chart-card" style={{ border: "1px solid #e5eaf2", borderRadius: 18, padding: 16, minWidth: 0, background: "linear-gradient(180deg,#fff,#fbfdff)", boxShadow: "0 4px 14px rgba(15,23,42,.035)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 12 }}>
                      <strong style={{ fontSize: 13, color: model.color }}>{model.icon} {model.label}</strong>
                      <span style={{ fontSize: 11, color: "#64748b" }}>{r.total} detections</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, height: 245, alignItems: "stretch", borderBottom: "1px solid #cbd5e1", padding: "8px 4px 0", overflowX: "auto" }}>
                      {items.map((item) => (
                        <div key={item.component} title={`${item.component}: ${item.quantity} detections`} style={{ flex: "1 0 48px", minWidth: 48, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 7 }}>
                          <strong style={{ fontSize: 11, color: model.color }}>{item.quantity}</strong>
                          <div style={{ width: "min(38px,78%)", height: `${Math.max(5, item.quantity / max * 165)}px`, background: `linear-gradient(180deg,${model.color}88,${model.color})`, borderRadius: "8px 8px 2px 2px", boxShadow: `0 5px 12px ${model.color}22` }} />
                          <span style={{ fontSize: 9, color: "#475569", textAlign: "center", lineHeight: 1.25, overflowWrap: "anywhere", maxWidth: 76 }}>{item.component}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontSize: 10, color: "#64748b", marginTop: 10 }}>
                      <span>X-axis: component name</span>
                      <span>Y-axis: detections</span>
                      <span>Avg. confidence: {r.detections.length ? (r.detections.reduce((s, d) => s + d.confidence, 0) / r.detections.length).toFixed(1) : "0.0"}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 11, ...muted, lineHeight: 1.5, marginBottom: 0, marginTop: 14 }}>
              These visualizations summarize model predictions. Evaluate against labelled ground-truth diagrams using precision, recall, and mAP for accuracy measurement.
            </p>
          </section>
        </>
      )}

      {/* Annotated images view */}
      {compareResult && compareView === "annotated" && (
        <section style={{ ...card, padding: 18, marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <h2 style={sectionTitle}>Annotated SLDs · all four models</h2>
              <p style={{ ...muted, fontSize: 12, margin: "5px 0 0" }}>Inspect each model side by side. Hover over a box for confidence details; click a box to open the symbol inspector.</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>
                Confidence ≥ {minConfidence}%
                <input aria-label="Compare confidence threshold" type="range" min="0" max="95" value={minConfidence} onChange={(e) => { setMinConfidence(Number(e.target.value)); setSelectedDetectionIndex(null); }} style={{ display: "block", width: 150, accentColor: "#0284c7" }} />
              </label>
              <label style={{ fontSize: 11, color: "#475569", display: "flex", alignItems: "center", gap: 5 }}>
                <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> Bounding boxes
              </label>
              <Button variant="secondary" onClick={() => setCompareZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))} disabled={compareZoom <= 0.5}>−</Button>
              <strong style={{ fontSize: 11, minWidth: 42, textAlign: "center" }}>{Math.round(compareZoom * 100)}%</strong>
              <Button variant="secondary" onClick={() => setCompareZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))} disabled={compareZoom >= 3}>+</Button>
              <Button variant="secondary" onClick={() => setCompareZoom(1)} disabled={compareZoom === 1}>Reset zoom</Button>
              <Button variant="success" onClick={() => downloadAnnotatedImage(compareResult.models[compareActiveTab])}>↓ Download selected</Button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
            <button type="button" onClick={() => setSelectedCompareClass("ALL")} style={pillStyle(selectedCompareClass === "ALL", "#0284c7")}>All classes</button>
            {Array.from(new Set(MODELS.flatMap((m) => compareResult.models[m.id].bom.map((b) => b.component)))).map((name) => (
              <button type="button" key={name} onClick={() => setSelectedCompareClass((old) => old === name ? "ALL" : name)} style={pillStyle(selectedCompareClass === name, getColor(name))}>{name}</button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 16 }} className="voltai-compare-image-grid">
            {MODELS.map((model) => {
              const r = compareResult.models[model.id];
              const detections = r.detections.filter((d) => d.confidence >= minConfidence && (selectedCompareClass === "ALL" || d.name === selectedCompareClass));
              return (
                <div key={model.id} className="voltai-chart-card" style={{ border: `1px solid ${model.color}44`, borderTop: `3px solid ${model.color}`, borderRadius: 16, overflow: "hidden", minWidth: 0, background: "#fff", boxShadow: "0 4px 14px rgba(15,23,42,.035)" }}>
                  <div style={{ padding: "11px 13px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", borderBottom: "1px solid #e2e8f0" }}>
                    <strong style={{ color: model.color, fontSize: 12 }}>{model.icon} {model.label}</strong>
                    <span style={{ fontSize: 10, color: "#64748b" }}>{detections.length}/{r.detections.length} visible · {(r.latency_ms / 1000).toFixed(2)} s</span>
                    <Button variant="secondary" onClick={() => { setCompareActiveTab(model.id); setBomActiveModel(model.id); setResult(r); }}>Select model</Button>
                  </div>
                  <div style={{ background: "#0f172a", padding: 8, overflow: "auto", maxHeight: 520 }}>
                    <div style={{ position: "relative", width: `${100 * compareZoom}%`, lineHeight: 0, minWidth: 280 }}>
                      <img src={preview} alt={`${model.label} annotated SLD`} style={{ display: "block", width: "100%", height: "auto", borderRadius: 5 }} />
                      {showBoxes && detections.map((d, i) => {
                        const color = getColor(d.name);
                        const hovered = hoveredDetection === `${model.id}-${i}` || hoveredCategory === d.name;
                        const nearTop = d.box.y < (r.height || 1) * 0.15;
                        return (
                          <div key={`${model.id}-${d.id}-${i}`} role="button" tabIndex={0} title={`${d.name} · ${d.confidence.toFixed(1)}%`}
                            onMouseEnter={() => setHoveredDetection(`${model.id}-${i}`)}
                            onMouseLeave={() => setHoveredDetection(null)}
                            onClick={() => { setResult(r); setSelectedDetectionIndex(i); setCompareActiveTab(model.id); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { setResult(r); setSelectedDetectionIndex(i); setCompareActiveTab(model.id); } }}
                            style={{ position: "absolute", left: `${d.box.x / r.width * 100}%`, top: `${d.box.y / r.height * 100}%`, width: `${d.box.w / r.width * 100}%`, height: `${d.box.h / r.height * 100}%`, border: `${hovered ? 3 : 1.5}px solid ${color}`, background: hovered ? `${color}40` : `${color}15`, cursor: "pointer", zIndex: hovered ? 20 : 2, boxSizing: "border-box" }}>
                            {hovered && (
                              <div style={{ position: "absolute", [nearTop ? "top" : "bottom"]: "calc(100% + 5px)", left: "50%", transform: "translateX(-50%)", background: "#fff", color: "#0f172a", border: `1px solid ${color}`, borderRadius: 8, padding: "8px 10px", minWidth: 170, maxWidth: 240, boxShadow: "0 8px 24px #0f172a22", fontSize: 11, whiteSpace: "normal", pointerEvents: "none", zIndex: 100 }}>
                                <strong>{d.name}</strong>
                                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, color: "#047857", fontWeight: 800 }}><span>Confidence</span><span>{d.confidence.toFixed(1)}%</span></div>
                                <div style={{ height: 6, background: "#e2e8f0", borderRadius: 99, overflow: "hidden", marginTop: 5 }}><div style={{ height: "100%", width: `${d.confidence}%`, background: color, borderRadius: 99 }} /></div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Comparison table view */}
      {compareResult && compareView === "table" && (
        <section style={{ ...card, padding: 18, marginBottom: 18 }}>
          <div style={{ marginBottom: 14 }}>
            <h2 style={sectionTitle}>Cross-model comparison table</h2>
            <p style={{ ...muted, fontSize: 12, margin: "5px 0 0" }}>Component quantities predicted by each model side by side.</p>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ ...tableStyle, minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Component</th>
                  {MODELS.map((m) => <th key={m.id} style={{ ...thStyle, color: m.color }}>{m.icon} {m.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {Array.from(new Set(MODELS.flatMap((m) => compareResult.models[m.id].bom.map((b) => b.component)))).map((component) => (
                  <tr key={component} className="voltai-row">
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{component}</td>
                    {MODELS.map((m) => {
                      const item = compareResult.models[m.id].bom.find((b) => b.component === component);
                      return <td key={m.id} style={{ ...tdStyle, textAlign: "right", color: item ? m.color : "#cbd5e1", fontWeight: 900 }}>{item ? item.quantity : "—"}</td>;
                    })}
                  </tr>
                ))}
                <tr style={{ background: "#f8fafc" }}>
                  <td style={{ ...tdStyle, fontWeight: 900 }}>TOTAL DETECTED</td>
                  {MODELS.map((m) => <td key={m.id} style={{ ...tdStyle, textAlign: "right", fontWeight: 900, color: m.color }}>{compareResult.models[m.id].total}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* BOM view */}
      {compareResult && compareView === "bom" && (
        <section style={{ ...card, padding: 18, marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <h2 style={sectionTitle}>Bill of Materials</h2>
              <p style={{ ...muted, fontSize: 12, margin: "5px 0 0" }}>Component-wise quantities for the selected model.</p>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {MODELS.map((m) => (
                <button key={m.id} onClick={() => { setBomActiveModel(m.id); setResult(compareResult.models[m.id]); setCompareActiveTab(m.id); }} style={pillStyle(bomActiveModel === m.id, m.color)}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
            <Button variant="success" onClick={() => downloadCSV(compareResult.models[bomActiveModel])}>↓ Export BOM CSV</Button>
          </div>
          {compareResult.models[bomActiveModel] && (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Tag</th>
                    <th style={thStyle}>Component</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Quantity</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Avg. Confidence</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {compareResult.models[bomActiveModel].bom.map((item) => (
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
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 900 }}>{compareResult.models[bomActiveModel].total}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>—</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Empty state */}
      {!compareResult && (
        <div style={{ ...card, padding: "58px 22px", textAlign: "center" }}>
          <div style={{ fontSize: 38, marginBottom: 12 }}>⇄</div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#0f172a" }}>Run a four-model comparison</h2>
          <p style={{ color: "#64748b", fontSize: 13, maxWidth: 480, margin: "9px auto 0", lineHeight: 1.6 }}>
            Upload an SLD diagram and click "Run comparison" to benchmark all four detection models simultaneously.
          </p>
        </div>
      )}
    </>
  );
}
