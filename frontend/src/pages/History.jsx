import React, { useEffect, useState } from "react";

const API_BASE = (
  import.meta.env.VITE_API_URL || "http://localhost:8080"
).replace(/\/$/, "");

export default function History(props) {
  const {
    Button,
    card,
    muted,
    sectionTitle,
    tableStyle,
    thStyle,
    tdStyle,
    page,
    setPage,
    historyItems = [],
    historyLoading,
    historyError,
    setHistoryError,
    onRestoreHistory,
    } = props;

  const [selectedRun, setSelectedRun] = useState(null);
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);

  const getAnnotatedImageUrl = (item) =>
    item.annotated_image_url ||
    item.annotatedImageUrl ||
    item.annotated_image ||
    item.annotated_image_path ||
    item.image_url ||
    item.imageUrl ||
    null;

  const getFullAnnotatedImageUrl = (item) => {
  const url = getAnnotatedImageUrl(item);

  if (!url) return null;

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
};



  const getFileName = (item) =>
    item.file_name ||
    item.fileName ||
    item.filename ||
    "annotated_sld";

  const isComparisonRun = (item) => {
  return (
    item.analysis_type === "comparison" ||
    item.analysis_type === "compare" ||
    (Array.isArray(item.models) && item.models.length > 1) ||
    (item.models &&
      typeof item.models === "object" &&
      !Array.isArray(item.models) &&
      Object.keys(item.models).length > 1)
  );
};

  const getModelName = (item) => {
  if (isComparisonRun(item)) {
    return "All 4 Models";
  }

  return (
    item.model_name ||
    item.model ||
    item.model_type ||
    "—"
  );
};

  const getRunId = (item, index) =>
    item.id ?? item.run_id ?? index + 1;

  const formatDate = (value) => {
    if (!value) return "—";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleString();
  };

  useEffect(() => {
    setImageError(false);
    setImageLoading(Boolean(selectedRun && getAnnotatedImageUrl(selectedRun)));
  }, [selectedRun]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setSelectedRun(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const downloadAnnotatedImage = async () => {
    if (!selectedRun) return;

    const imageUrl = getFullAnnotatedImageUrl(selectedRun);

    if (!imageUrl) {
      alert(
        "No annotated image is saved for this run yet. The backend must save the annotated output and return its URL."
      );
      return;
    }

    try {
      const response = await fetch(imageUrl);

      if (!response.ok) {
        throw new Error("Unable to download the image.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = `${getFileName(selectedRun).replace(/\.[^.]+$/, "")}_annotated.png`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error("Annotated image download failed:", error);
      alert(
        "Could not download the annotated image. Check that the image URL is accessible and your backend allows the request."
      );
    }
  };

  return (
    <>
      <section
        className="history-intro"
        style={{ ...card, padding: 22, marginBottom: 18 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={sectionTitle}>Run history</h2>
            <p style={{ ...muted, fontSize: 13, margin: "7px 0 0" }}>
              Previously saved SLD analyses returned by your backend database.
              Click a row to preview its annotated image.
            </p>
          </div>

          <Button
            variant="secondary"
            onClick={() => setPage("dashboard")}
          >
            ＋ New analysis
          </Button>
        </div>
      </section>

      {historyLoading ? (
        <section style={{ ...card, padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 26 }}>◌</div>
          <h2 style={sectionTitle}>Loading history…</h2>
          <p style={muted}>Fetching saved runs from /api/history</p>
        </section>
      ) : historyError ? (
        <section
          style={{
            ...card,
            padding: 28,
            border: "1px solid #fecaca",
            background: "#fffafa",
          }}
        >
          <div style={{ fontSize: 26, marginBottom: 8 }}>⚠</div>
          <h2 style={sectionTitle}>History API is not connected</h2>
          <p style={{ ...muted, fontSize: 13, lineHeight: 1.7 }}>
            {historyError}
          </p>
          <p style={{ ...muted, fontSize: 12, lineHeight: 1.7 }}>
            The UI requests GET /api/history. Your FastAPI backend must return
            saved history records, including the annotated image URL or path.
          </p>
          <Button
            onClick={() => {
              setHistoryError("");
              setPage("dashboard");
            }}
          >
            Back to workspace
          </Button>
        </section>
      ) : historyItems.length ? (
        <section style={{ ...card, padding: 18 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ ...tableStyle, minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Run</th>
                  <th style={thStyle}>Image</th>
                  <th style={thStyle}>Model</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>
                    Detections
                  </th>
                  <th style={{ ...thStyle, textAlign: "right" }}>
                    Classes
                  </th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>

              <tbody>
                {historyItems.map((item, index) => (
                  <tr
                    key={item.id ?? item.run_id ?? index}
                    className="voltai-row"
                    onClick={() => {
                      if (
                        (
                          item.record_type === "analysis_session" ||
                          item.analysis_type === "single" ||
                          item.analysis_type === "comparison" ||
                          item.analysis_type === "compare"
                        ) &&
                        onRestoreHistory
                      ) {
                        setSelectedRun(null);
                        onRestoreHistory(item);
                      } else {
                        setSelectedRun(item);
                        setImageError(false);
                      }
                    }}
                    title={
                      item.record_type === "analysis_session" ||
                      item.analysis_type === "single" ||
                      item.analysis_type === "comparison" ||
                      item.analysis_type === "compare"
                        ? "Click to restore this analysis"
                        : "Click to preview this run"
                    }
                    style={{
                      cursor: "pointer",
                      transition: "background 0.15s ease",
                    }}
                  >
                    <td style={tdStyle}>
                      <strong>#{getRunId(item, index)}</strong>
                    </td>

                    <td style={tdStyle}>
                      {getFileName(item)}
                    </td>

                    <td style={tdStyle}>
                      {getModelName(item)}
                    </td>

                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontWeight: 800,
                      }}
                    >
                      {isComparisonRun(item)
                        ? "—"
                        :item.total_components ??
                         item.total ??
                         item.detection_count ??
                          "—"}
                    </td>

                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      {isComparisonRun(item)
                        ? "—"
                        : item.class_count ?? item.unique_classes ?? "—"}
                    </td>

                    <td style={tdStyle}>
                      {formatDate(item.created_at ?? item.timestamp ?? item.date)}
                    </td>

                    <td style={tdStyle}>
                      <span style={{ color: "#047857", fontWeight: 800 }}>
                        Saved
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p
            style={{
              ...muted,
              fontSize: 11,
              margin: "12px 0 0",
            }}
          >
            Select a row to view its saved analysis.
          </p>
        </section>
      ) : (
        <section style={{ ...card, padding: 44, textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>◷</div>
          <h2 style={sectionTitle}>No saved runs yet</h2>
          <p style={{ ...muted, fontSize: 13 }}>
            Once your backend stores detection results, they will appear here.
          </p>
          <Button onClick={() => setPage("dashboard")}>
            Run your first analysis
          </Button>
        </section>
      )}

      {/* ANNOTATED IMAGE PREVIEW MODAL */}
      {selectedRun && (
        <div
          onClick={() => setSelectedRun(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(15, 23, 42, 0.72)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Annotated image preview"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(100%, 1000px)",
              maxHeight: "92vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 16,
              padding: 20,
              boxShadow: "0 24px 80px rgba(0,0,0,.3)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h2 style={{ ...sectionTitle, margin: 0 }}>
                  Annotated image preview
                </h2>
                <p
                  style={{
                    ...muted,
                    fontSize: 12,
                    margin: "6px 0 0",
                    overflowWrap: "anywhere",
                  }}
                >
                  {getFileName(selectedRun)} · {getModelName(selectedRun)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedRun(null)}
                aria-label="Close preview"
                style={{
                  border: "1px solid #e2e8f0",
                  background: "#fff",
                  borderRadius: 8,
                  width: 36,
                  height: 36,
                  fontSize: 22,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>

            {getAnnotatedImageUrl(selectedRun) && !imageError ? (
              <div
                style={{
                  minHeight: 180,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <img
                  src={getFullAnnotatedImageUrl(selectedRun)}
                  alt={`Annotated ${getFileName(selectedRun)}`}
                  onLoad={() => {
                    setImageLoading(false);
                    setImageError(false);
                  }}
                  onError={() => {
                    setImageLoading(false);
                    setImageError(true);
                  }}
                  style={{
                    display: imageLoading ? "none" : "block",
                    maxWidth: "100%",
                    maxHeight: "65vh",
                    objectFit: "contain",
                  }}
                />

                {imageLoading && (
                  <p style={muted}>Loading annotated image…</p>
                )}
              </div>
            ) : (
              <div
                style={{
                  padding: 36,
                  textAlign: "center",
                  border: "1px dashed #cbd5e1",
                  borderRadius: 10,
                  background: "#f8fafc",
                }}
              >
                <div style={{ fontSize: 34, marginBottom: 10 }}>▧</div>
                <h3 style={{ margin: "0 0 8px", color: "#334155" }}>
                  Annotated image unavailable
                </h3>
                <p style={{ ...muted, fontSize: 13, lineHeight: 1.6 }}>
                  {imageError
                    ? "The saved image URL could not be loaded."
                    : "This history record does not contain an annotated image URL yet. The backend must save the generated image and return its URL."}
                </p>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginTop: 16,
              }}
            >
              <div style={{ ...muted, fontSize: 12 }}>
                Detections:{" "}
                <strong>
                  {selectedRun.total_components ??
                    selectedRun.total ??
                    selectedRun.detection_count ??
                    "—"}
                </strong>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setSelectedRun(null)}
                  style={{
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    color: "#334155",
                    borderRadius: 9,
                    padding: "10px 16px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>

                <button
                  type="button"
                  disabled={
                    !getAnnotatedImageUrl(selectedRun) ||
                    imageError ||
                    imageLoading
                  }
                  onClick={downloadAnnotatedImage}
                  style={{
                    border: "none",
                    background:
                      !getAnnotatedImageUrl(selectedRun) ||
                      imageError ||
                      imageLoading
                        ? "#94a3b8"
                        : "#2563eb",
                    color: "#fff",
                    borderRadius: 9,
                    padding: "10px 16px",
                    fontWeight: 800,
                    cursor:
                      !getAnnotatedImageUrl(selectedRun) ||
                      imageError ||
                      imageLoading
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  ↓ Download annotated image
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}