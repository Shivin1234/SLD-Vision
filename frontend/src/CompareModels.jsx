import React from "react";

export default function CompareModels(props) {
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
              <h2 style={sectionTitle}>Four-model benchmark</h2>
              <p style={{ ...muted, fontSize: 12, margin: "6px 0 16px" }}>The same SLD image is sent to all four models. Compare predicted counts and response times; detection count alone does not measure accuracy.</p>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <label style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>SLD image
                  <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: "block", marginTop: 10, maxWidth: 320, width: "100%", padding: 10, border: "1px solid #7dd3fc", borderRadius: 10, background: "#f0f9ff", color: "#334155", fontSize: 12, cursor: "pointer" }} />
                </label>
                {file && <span style={{ fontSize: 12, ...muted }}>{file.name}</span>}
                <Button onClick={() => handleRunDetection("compare")} disabled={!file || loading} style={{ alignSelf: "flex-end" }}>{loading ? "⏳ Running comparison…" : "▶ Run comparison"}</Button>
              </div>
            </section>
            {compareResult && <TabBar tabs={[{ id: "analysis", label: "Analysis" }, { id: "annotated", label: "Annotated images" }, { id: "table", label: "Comparison table" }, { id: "bom", label: "BOM" }]} value={compareView} onChange={setCompareView} />}

            
{compareResult && compareView === "analysis" && (() => {
  const stats = MODELS.map((model) => {
    const r = compareResult.models[model.id];
    const detections = r.detections || [];

    const avg = detections.length
      ? detections.reduce((sum, d) => sum + (Number(d.confidence) || 0), 0) /
        detections.length
      : 0;

    return {
      ...r,
      model,
      detections,
      bom: r.bom || [],
      total: r.total ?? detections.length,
      avgConfidence: avg,
      seconds: (Number(r.latency_ms) || 0) / 1000,
    };
  });

  const components = Array.from(
    new Set(stats.flatMap((s) => s.bom.map((b) => b.component)))
  );

  const totalDetections = stats.reduce((sum, s) => sum + s.total, 0);

  const fastest = stats.reduce((a, b) =>
    a.seconds <= b.seconds ? a : b
  );

  const mostDetections = stats.reduce((a, b) =>
    a.total >= b.total ? a : b
  );

  const highestConfidence = stats.reduce((a, b) =>
    a.avgConfidence >= b.avgConfidence ? a : b
  );

  const panel = {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    padding: 14,
    boxShadow: "0 4px 14px rgba(15,23,42,.04)",
    minWidth: 0,
    minHeight: 0,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
  };

  const titleStyle = {
    fontSize: 14,
    fontWeight: 800,
    color: "#172554",
    margin: "0 0 5px",
  };

  const subStyle = {
    color: "#64748b",
    fontSize: 11,
    margin: "0 0 10px",
    lineHeight: 1.5,
  };

  const componentColors = [
    "#2563eb", "#0d9488", "#9333ea", "#ea580c",
    "#ca8a04", "#db2777", "#0891b2", "#65a30d",
    "#64748b", "#c2410c", "#4f46e5",
  ];

  const getCount = (modelId, component) =>
    compareResult.models[modelId]?.bom?.find(
      (b) => b.component === component
    )?.quantity || 0;

  const getComponentConfidence = (modelId, component) => {
    const value = compareResult.models[modelId]?.bom?.find(
      (b) => b.component === component
    )?.averageConfidence;

    return Number.isFinite(value)
      ? Math.max(0, Math.min(100, value))
      : null;
  };

  const bins = [
    { label: "0–50%", min: 0, max: 50 },
    { label: "50–70%", min: 50, max: 70 },
    { label: "70–80%", min: 70, max: 80 },
    { label: "80–90%", min: 80, max: 90 },
    { label: "90–100%", min: 90, max: 101 },
  ];

  const binCounts = stats.map((s) => ({
    ...s,
    values: bins.map((bin) =>
      s.detections.filter((d) => {
        const confidence = Number(d.confidence) || 0;
        return confidence >= bin.min && confidence < bin.max;
      }).length
    ),
  }));

  const maxComponentCount = Math.max(
    1,
    ...components.flatMap((component) =>
      stats.map((s) => getCount(s.model.id, component))
    )
  );

  const maxLatency = Math.max(
    0.01,
    ...stats.map((s) => s.seconds)
  );

  const lineMax = Math.max(
    1,
    ...binCounts.flatMap((s) => s.values)
  );

  const chartWidth = 560;

  const modelLegend = (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "7px 12px",
        marginBottom: 10,
        flexShrink: 0,
      }}
    >
      {MODELS.map((m) => (
        <span
          key={m.id}
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
              borderRadius: 3,
              background: m.color,
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          {m.label}
        </span>
      ))}
    </div>
  );

  const chartGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
    gap: 14,
    alignItems: "stretch",
    minWidth: 0,
  };

  const firstRowPanel = {
    ...panel,
    gridColumn: "span 3",
    minHeight: 580,
  };

  const secondRowPanel = {
    ...panel,
    gridColumn: "span 2",
    minHeight: 360,
  };

  return (
    <div
      style={{
        display: "grid",
        gap: 14,
        minWidth: 0,
        width: "100%",
      }}
    >
      {/* KPI CARDS */}
      <div
        className="voltai-stats"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
          alignItems: "stretch",
        }}
      >
        {[
          {
            label: "Most detections",
            value: mostDetections.total,
            model: mostDetections.model.label,
            color: "#2563eb",
            icon: "▥",
          },
          {
            label: "Highest average confidence",
            value: `${highestConfidence.avgConfidence.toFixed(1)}%`,
            model: highestConfidence.model.label,
            color: "#0d9488",
            icon: "◉",
          },
          {
            label: "Fastest inference",
            value: `${fastest.seconds.toFixed(2)} s`,
            model: fastest.model.label,
            color: "#7c3aed",
            icon: "◷",
          },
          {
            label: "Total detections",
            value: totalDetections,
            model: "Sum across four model outputs",
            color: "#ea580c",
            icon: "▦",
          },
        ].map((k) => (
          <div
            key={k.label}
            style={{
              ...panel,
              minHeight: 96,
              padding: 12,
              borderTop: `3px solid ${k.color}`,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  flexShrink: 0,
                  display: "grid",
                  placeItems: "center",
                  background: `${k.color}14`,
                  borderRadius: 9,
                  color: k.color,
                  fontSize: 20,
                }}
              >
                {k.icon}
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, color: "#64748b" }}>
                  {k.label}
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    color: k.color,
                    marginTop: 2,
                    overflowWrap: "anywhere",
                  }}
                >
                  {k.value}
                </div>
              </div>
            </div>

            <div
              style={{
                fontSize: 10,
                color: "#475569",
                marginTop: 8,
                fontWeight: 700,
              }}
            >
              {k.model}
            </div>
          </div>
        ))}
      </div>

      {/* CHART GRID */}
      <div
        className="voltai-compare-chart-grid"
        style={chartGridStyle}
      >
        {/* 1. COMPONENT COUNT COMPARISON */}
        <section style={firstRowPanel}>
          <h3 style={titleStyle}>Component count comparison</h3>
          <p style={subStyle}>
            Compare predicted instances of each component class.
          </p>

          {modelLegend}

          {components.length === 0 ? (
            <p style={subStyle}>No component data available.</p>
          ) : (
            <div
              style={{
                width: "100%",
                minWidth: 0,
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-start",
              }}
            >
              {(() => {
                const left = 42;
                const right = 12;
                const top = 14;
                const plotHeight = 250;
                const bottomY = top + plotHeight;
                const plotWidth = chartWidth - left - right;
                const groupWidth = plotWidth / components.length;
                const barGap = 0;

                const barWidth = Math.max(
                  1,
                  Math.min(
                    12,
                    (groupWidth * 0.82 -
                      (MODELS.length - 1) * barGap) /
                      MODELS.length
                  )
                );

                const barsWidth =
                  MODELS.length * barWidth +
                  (MODELS.length - 1) * barGap;

                // Reserve only the space required for component labels.
                const labelLineHeight = 10;
                const maxLabelLines = Math.max(
                  1,
                  ...components.map(
                    (component) => component.split(/\s+/).length
                  )
                );

                const labelAreaHeight =
                  maxLabelLines * labelLineHeight + 8;

                const axisTitleHeight = 24;

                const chartHeight =
                  bottomY +
                  labelAreaHeight +
                  axisTitleHeight;

                const labelStartY = bottomY + 13;
                const axisTitleY = chartHeight - 5;

                return (
                  <svg
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                    width="100%"
                    role="img"
                    aria-label="Component count comparison across models"
                    preserveAspectRatio="none"
                    style={{
                      display: "block",
                      width: "100%",
                      height: "auto",
                      maxHeight: 500,
                      flex: "0 0 auto",
                    }}
                  >
                    {/* Horizontal grid lines and y-axis labels */}
                    {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                      <g key={f}>
                        <line
                          x1={left}
                          y1={top + plotHeight * (1 - f)}
                          x2={chartWidth - right}
                          y2={top + plotHeight * (1 - f)}
                          stroke="#e2e8f0"
                          strokeWidth="1"
                        />

                        <text
                          x={left - 7}
                          y={top + plotHeight * (1 - f) + 4}
                          textAnchor="end"
                          fontSize="9"
                          fill="#64748b"
                        >
                          {Math.round(maxComponentCount * f)}
                        </text>
                      </g>
                    ))}

                    {/* Component bars and wrapped labels */}
                    {components.map((component, ci) => {
                      const center =
                        left + ci * groupWidth + groupWidth / 2;

                      const startX = center - barsWidth / 2;
                      const words = component.split(/\s+/);

                      return (
                        <g key={component}>
                          {MODELS.map((m, mi) => {
                            const value = getCount(m.id, component);
                            const h =
                              (value / maxComponentCount) * plotHeight;

                            return (
                              <rect
                                key={m.id}
                                x={startX + mi * (barWidth + barGap)}
                                y={bottomY - h}
                                width={barWidth}
                                height={Math.max(0, h)}
                                rx={2}
                                fill={m.color}
                              >
                                <title>
                                  {`${m.label} · ${component}: ${value}`}
                                </title>
                              </rect>
                            );
                          })}

                          {words.map((word, wi) => (
                            <text
                              key={`${component}-${wi}`}
                              x={center}
                              y={labelStartY + wi * labelLineHeight}
                              textAnchor="middle"
                              fontSize="8"
                              fill="#475569"
                            >
                              {word}
                            </text>
                          ))}
                        </g>
                      );
                    })}

                    {/* X-axis title positioned directly below labels */}
                    <text
                      x={left + plotWidth / 2}
                      y={axisTitleY}
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
        <section style={firstRowPanel}>
          <h3 style={titleStyle}>Confidence comparison</h3>
          <p style={subStyle}>
            Average confidence by component class for each model.
          </p>

          {modelLegend}

          {components.length === 0 ? (
            <p style={subStyle}>No component data available.</p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateRows: `repeat(${components.length}, minmax(0, 1fr))`,
                gap: 5,
                flex: 1,
                minHeight: 0,
              }}
            >
              {components.map((component) => (
                <div
                  key={component}
                  style={{
                    minHeight: 0,
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
                      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                      gap: 6,
                    }}
                  >
                    {MODELS.map((m) => {
                      const value = getComponentConfidence(
                        m.id,
                        component
                      );

                      return (
                        <div
                          key={m.id}
                          style={{
                            minWidth: 0,
                            textAlign: "center",
                          }}
                        >
                          <div
                            style={{
                              height: 5,
                              borderRadius: 5,
                              background: "#edf2f7",
                              marginBottom: 4,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${value ?? 0}%`,
                                height: "100%",
                                background:
                                  value !== null
                                    ? m.color
                                    : "transparent",
                                borderRadius: 5,
                              }}
                            />
                          </div>

                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              color:
                                value !== null ? m.color : "#94a3b8",
                            }}
                          >
                            {value !== null
                              ? `${value.toFixed(1)}%`
                              : "—"}
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
        <section style={secondRowPanel}>
          <h3 style={titleStyle}>Inference speed</h3>
          <p style={subStyle}>
            Response time for the selected SLD image. Lower is faster.
          </p>

          <div
            style={{
              display: "grid",
              gap: 18,
              flex: 1,
              alignContent: "space-evenly",
              minHeight: 0,
            }}
          >
            {stats.map((s) => (
              <div key={s.model.id}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBottom: 6,
                    fontSize: 11,
                  }}
                >
                  <span
                    style={{
                      color: "#334155",
                      fontWeight: 700,
                    }}
                  >
                    {s.model.label}
                  </span>

                  <strong
                    style={{
                      color: s.model.color,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.seconds.toFixed(2)} s
                  </strong>
                </div>

                <div
                  style={{
                    height: 12,
                    background: "#f1f5f9",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(s.seconds / maxLatency) * 100}%`,
                      background: s.model.color,
                      borderRadius: 4,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 12,
              borderTop: "1px solid #e2e8f0",
              paddingTop: 9,
              color: "#64748b",
              fontSize: 10,
            }}
          >
            Recorded API response duration · seconds
          </div>
        </section>

        {/* 4. COMPONENT DISTRIBUTION */}
        <section style={secondRowPanel}>
          <h3 style={titleStyle}>Component distribution</h3>
          <p style={subStyle}>
            Proportion of each component class in every model's predictions.
          </p>

          <div
            style={{
              display: "grid",
              gap: 15,
              flex: 1,
              alignContent: "space-evenly",
              minHeight: 0,
            }}
          >
            {stats.map((s) => {
              const total = s.bom.reduce(
                (sum, b) => sum + (Number(b.quantity) || 0),
                0
              );

              return (
                <div key={s.model.id}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 6,
                      marginBottom: 6,
                      fontSize: 10,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 800,
                        color: "#334155",
                      }}
                    >
                      {s.model.label}
                    </span>

                    <span
                      style={{
                        color: "#64748b",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {total} parts
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      height: 20,
                      overflow: "hidden",
                      borderRadius: 5,
                      background: "#f1f5f9",
                    }}
                  >
                    {components.map((component, ci) => {
                      const count = getCount(s.model.id, component);

                      if (!count || !total) return null;

                      return (
                        <div
                          key={component}
                          title={`${component}: ${count} (${(
                            (count / total) *
                            100
                          ).toFixed(1)}%)`}
                          style={{
                            width: `${(count / total) * 100}%`,
                            minWidth: 1,
                            background:
                              componentColors[
                                ci % componentColors.length
                              ],
                            height: "100%",
                            borderRight: "1px solid #ffffff80",
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "7px 9px",
              marginTop: 14,
            }}
          >
            {components.map((component, ci) => (
              <span
                key={component}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 5,
                  fontSize: 9,
                  color: "#475569",
                  overflowWrap: "anywhere",
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    marginTop: 2,
                    flexShrink: 0,
                    borderRadius: 2,
                    background:
                      componentColors[ci % componentColors.length],
                  }}
                />
                {component}
              </span>
            ))}
          </div>
        </section>

        {/* 5. CONFIDENCE DISTRIBUTION */}
        <section style={secondRowPanel}>
          <h3 style={titleStyle}>Confidence distribution</h3>
          <p style={subStyle}>
            Detection counts across confidence ranges for all four models.
          </p>

          {modelLegend}

          <div
            style={{
              width: "100%",
              minWidth: 0,
              flex: 1,
              display: "flex",
              alignItems: "center",
            }}
          >
            {(() => {
              const chartHeight = 250;
              const chartTop = 14;
              const chartBottom = 43;
              const plotHeight = chartHeight - chartTop - chartBottom;
              const plotLeft = 36;
              const plotRight = 10;
              const innerWidth = chartWidth - plotLeft - plotRight;

              return (
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  width="100%"
                  role="img"
                  aria-label="Confidence distribution across models"
                  preserveAspectRatio="xMidYMid meet"
                  style={{
                    display: "block",
                    width: "100%",
                    height: "auto",
                  }}
                >
                  {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                    <g key={f}>
                      <line
                        x1={plotLeft}
                        y1={chartTop + plotHeight * (1 - f)}
                        x2={chartWidth - plotRight}
                        y2={chartTop + plotHeight * (1 - f)}
                        stroke="#e2e8f0"
                        strokeDasharray="3 3"
                      />

                      <text
                        x={plotLeft - 6}
                        y={chartTop + plotHeight * (1 - f) + 4}
                        fontSize="10"
                        textAnchor="end"
                        fill="#64748b"
                      >
                        {Math.round(lineMax * f)}
                      </text>
                    </g>
                  ))}

                  {bins.map((bin, bi) => {
                    const x =
                      plotLeft + (bi * innerWidth) / (bins.length - 1);

                    return (
                      <text
                        key={bin.label}
                        x={x}
                        y={chartHeight - 23}
                        fontSize="9"
                        textAnchor="middle"
                        fill="#475569"
                      >
                        {bin.label}
                      </text>
                    );
                  })}

                  {binCounts.map((s) => {
                    const points = s.values.map((value, i) => ({
                      x:
                        plotLeft +
                        (i * innerWidth) / (bins.length - 1),
                      y:
                        chartTop +
                        plotHeight * (1 - value / lineMax),
                      value,
                    }));

                    return (
                      <g key={s.model.id}>
                        <polyline
                          points={points
                            .map((p) => `${p.x},${p.y}`)
                            .join(" ")}
                          fill="none"
                          stroke={s.model.color}
                          strokeWidth="2.5"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />

                        {points.map((p, i) => (
                          <circle
                            key={i}
                            cx={p.x}
                            cy={p.y}
                            r={4}
                            fill={s.model.color}
                            stroke="#fff"
                            strokeWidth="1.5"
                          >
                            <title>
                              {`${s.model.label} · ${bins[i].label}: ${p.value} detections`}
                            </title>
                          </circle>
                        ))}
                      </g>
                    );
                  })}

                  <text
                    x={plotLeft + innerWidth / 2}
                    y={chartHeight - 5}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#64748b"
                  >
                    Confidence range
                  </text>
                </svg>
              );
            })()}
          </div>

          <p
            style={{
              fontSize: 10,
              color: "#64748b",
              margin: "8px 0 0",
              lineHeight: 1.5,
            }}
          >
            Confidence describes prediction certainty; it does not
            independently establish detection correctness.
          </p>
        </section>
      </div>
    </div>
  );
})()}



            {compareResult && compareView === "annotated" && <section style={{ ...card, padding: 18, marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}><div><h2 style={sectionTitle}>Annotated SLDs · all four models</h2><p style={{ ...muted, fontSize: 12, margin: "5px 0 0" }}>Inspect each model side by side. Hover over a box for confidence details; click a box to open the symbol inspector.</p></div><div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><label style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>Confidence ≥ {minConfidence}%<input aria-label="Compare annotation confidence threshold" type="range" min="0" max="95" value={minConfidence} onChange={(e) => { setMinConfidence(Number(e.target.value)); setSelectedDetectionIndex(null); }} style={{ display: "block", width: 150, accentColor: "#0284c7" }} /></label><label style={{ fontSize: 11, color: "#475569", display: "flex", alignItems: "center", gap: 5 }}><input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> Bounding boxes</label><Button variant="secondary" onClick={() => setCompareZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))} disabled={compareZoom <= 0.5}>−</Button><strong style={{ fontSize: 11, minWidth: 42, textAlign: "center" }}>{Math.round(compareZoom * 100)}%</strong><Button variant="secondary" onClick={() => setCompareZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))} disabled={compareZoom >= 3}>+</Button><Button variant="secondary" onClick={() => setCompareZoom(1)} disabled={compareZoom === 1}>Reset zoom</Button><Button variant="success" onClick={() => downloadAnnotatedImage(compareResult.models[compareActiveTab])}>↓ Download selected</Button></div></div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}><button type="button" onClick={() => setSelectedCompareClass("ALL")} style={pillStyle(selectedCompareClass === "ALL", "#0284c7")}>All classes</button>{Array.from(new Set(MODELS.flatMap((m) => compareResult.models[m.id].bom.map((b) => b.component)))).map((name) => <button type="button" key={name} onClick={() => setSelectedCompareClass((old) => old === name ? "ALL" : name)} style={pillStyle(selectedCompareClass === name, getColor(name))}>{name}</button>)}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 16 }} className="voltai-compare-image-grid">
                {MODELS.map((model) => { const r = compareResult.models[model.id]; const detections = r.detections.filter((d) => d.confidence >= minConfidence && (selectedCompareClass === "ALL" || d.name === selectedCompareClass)); return <div key={model.id} className="voltai-chart-card" style={{ border: `1px solid ${model.color}44`, borderTop: `3px solid ${model.color}`, borderRadius: 16, overflow: "hidden", minWidth: 0, background: "#fff", boxShadow: "0 4px 14px rgba(15,23,42,.035)" }}>
                  <div style={{ padding: "11px 13px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", borderBottom: "1px solid #e2e8f0" }}><strong style={{ color: model.color, fontSize: 12 }}>{model.icon} {model.label}</strong><span style={{ fontSize: 10, color: "#64748b" }}>{detections.length}/{r.detections.length} visible · {(r.latency_ms / 1000).toFixed(2)} s</span><Button variant="secondary" onClick={() => { setCompareActiveTab(model.id); setBomActiveModel(model.id); setResult(r); }}>Select model</Button></div>
                  <div style={{ background: "#0f172a", padding: 8, overflow: "auto", maxHeight: 520 }}><div style={{ position: "relative", width: `${100 * compareZoom}%`, lineHeight: 0, minWidth: 280 }}><img src={preview} alt={`${model.label} annotated SLD`} style={{ display: "block", width: "100%", height: "auto", borderRadius: 5 }} />
                    {showBoxes && detections.map((d, i) => { const color = getColor(d.name); const hovered = hoveredDetection === `${model.id}-${i}` || hoveredCategory === d.name; const nearTop = d.box.y < (r.height || 1) * 0.15; return <div key={`${model.id}-${d.id}-${i}`} role="button" tabIndex={0} title={`${d.name} · ${d.confidence.toFixed(1)}%`} onMouseEnter={() => setHoveredDetection(`${model.id}-${i}`)} onMouseLeave={() => setHoveredDetection(null)} onClick={() => { setResult(r); setSelectedDetectionIndex(i); setCompareActiveTab(model.id); }} onKeyDown={(e) => { if (e.key === "Enter") { setResult(r); setSelectedDetectionIndex(i); setCompareActiveTab(model.id); } }} style={{ position: "absolute", left: `${d.box.x / (r.width || 1) * 100}%`, top: `${d.box.y / (r.height || 1) * 100}%`, width: `${d.box.w / (r.width || 1) * 100}%`, height: `${d.box.h / (r.height || 1) * 100}%`, border: `${hovered ? 3 : 1.5}px solid ${color}`, background: hovered ? `${color}35` : `${color}12`, boxSizing: "border-box", cursor: "pointer", zIndex: hovered ? 10 : 1 }}>
                      {hovered && <div style={{ position: "absolute", [nearTop ? "top" : "bottom"]: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)", zIndex: 30, width: 190, padding: "8px 10px", background: "#fff", color: "#0f172a", border: `1px solid ${color}`, borderRadius: 8, boxShadow: "0 8px 22px #0003", fontSize: 10, lineHeight: 1.4, whiteSpace: "normal", pointerEvents: "none" }}><strong>{d.name}</strong><div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}><span>Confidence</span><b style={{ color: "#047857" }}>{d.confidence.toFixed(1)}%</b></div></div>}
                    </div>; })}
                  </div></div><div style={{ padding: "9px 12px", fontSize: 10, color: "#64748b", display: "flex", justifyContent: "space-between", gap: 8 }}><span>{r.bom.length} component classes</span><span>Total: {r.total}</span></div>
                </div>; })}
              </div>
            </section>}

            {compareResult && compareView === "table" && <section style={{ ...card, padding: 18, marginBottom: 18 }}><h2 style={sectionTitle}>Comparison table</h2><p style={{ ...muted, fontSize: 12, margin: "5px 0 0" }}>Compare the measured output from the same input image across all four models.</p><div style={{ overflowX: "auto", marginTop: 14 }}><table style={{ ...tableStyle, minWidth: 680 }}><thead><tr><th style={thStyle}>Metric</th>{MODELS.map((m) => <th key={m.id} style={{ ...thStyle, color: m.color }}>{m.label}</th>)}</tr></thead><tbody>{[["Detected components", (r) => r.total], ["Unique component classes", (r) => r.bom.length], ["Average detection confidence", (r) => `${(r.detections.length ? r.detections.reduce((s, d) => s + d.confidence, 0) / r.detections.length : 0).toFixed(1)}%`], ["Measured request time", (r) => `${(r.latency_ms / 1000).toFixed(2)} s`]].map(([label, value]) => <tr key={label}><td style={{ ...tdStyle, fontWeight: 800 }}>{label}</td>{MODELS.map((m) => <td key={m.id} style={{ ...tdStyle, fontWeight: 900, color: m.color }}>{value(compareResult.models[m.id])}</td>)}</tr>)}</tbody></table></div><p style={{ fontSize: 11, ...muted, lineHeight: 1.6, marginBottom: 0 }}>Request time includes API/network overhead. Confidence is the model-reported score and is not a substitute for validation metrics such as precision, recall, and mAP.</p></section>}

            {compareResult && compareView === "bom" && <section style={{ ...card, padding: 18, marginBottom: 18 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}><div><h2 style={sectionTitle}>Four-model Bill of Materials</h2><p style={{ ...muted, fontSize: 12, margin: "5px 0 0" }}>Select a model to inspect and export its component-wise BOM.</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{MODELS.map((m) => <Button key={m.id} variant={bomActiveModel === m.id ? "soft" : "secondary"} onClick={() => { setBomActiveModel(m.id); setResult(compareResult.models[m.id]); setCompareActiveTab(m.id); }}>{m.label}</Button>)}</div></div>
              {(() => { const r = compareResult.models[bomActiveModel]; return <><div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}><Metric label="Selected model" value={r.model_name} color={activeModelColor(bomActiveModel)} /><Metric label="Total detections" value={r.total} color="#059669" /><Metric label="Unique classes" value={r.bom.length} color="#7c3aed" /><Metric label="Average confidence" value={`${(r.detections.length ? r.detections.reduce((s, d) => s + d.confidence, 0) / r.detections.length : 0).toFixed(1)}%`} color="#d97706" /></div><div style={{ overflowX: "auto" }}><table style={{ ...tableStyle, minWidth: 760 }}><thead><tr><th style={thStyle}>Tag</th><th style={thStyle}>Component name</th><th style={{ ...thStyle, textAlign: "right" }}>Quantity</th><th style={{ ...thStyle, textAlign: "right" }}>Avg. confidence</th><th style={{ ...thStyle, textAlign: "right" }}>Share of detections</th></tr></thead><tbody>{r.bom.map((item) => <tr key={item.component} className="voltai-row"><td style={tdStyle}><b style={{ color: getColor(item.component) }}>{item.tag}</b></td><td style={{ ...tdStyle, fontWeight: 700 }}>{item.component}</td><td style={{ ...tdStyle, textAlign: "right", fontWeight: 900 }}>{item.quantity}</td><td style={{ ...tdStyle, textAlign: "right", color: "#047857", fontWeight: 800 }}>{item.averageConfidence.toFixed(2)}%</td><td style={{ ...tdStyle, textAlign: "right" }}>{item.percentOfDetections.toFixed(1)}%</td></tr>)}<tr style={{ background: "#f8fafc" }}><td style={tdStyle}>ALL</td><td style={{ ...tdStyle, fontWeight: 900 }}>TOTAL DETECTED SYMBOLS</td><td style={{ ...tdStyle, textAlign: "right", fontWeight: 900 }}>{r.total}</td><td style={{ ...tdStyle, textAlign: "right" }}>—</td><td style={{ ...tdStyle, textAlign: "right" }}>100%</td></tr></tbody></table></div><div style={{ marginTop: 14 }}><Button variant="success" onClick={() => downloadCSV(r)}>↓ Export {r.model_name} BOM CSV</Button></div></>; })()}
            </section>}

            {!compareResult && <div style={{ ...card, padding: "54px 20px", textAlign: "center" }}><h2 style={sectionTitle}>No comparison run yet</h2><p style={{ ...muted, fontSize: 13 }}>Choose an SLD image above and run all four models to populate the charts, annotated previews, comparison table, and BOM.</p></div>}
    </>
  );
}
