// C:\SHIVANSH\Traceability\frontend\app\src\components\QRScanner.jsx //

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

/**
 * QRScanner
 */
export default function QRScanner({ onScan, continuousScan = false }) {
  const scannerRef = useRef(null);
  const onScanRef       = useRef(onScan);
  const continuousRef   = useRef(continuousScan);
  const [error,     setError]     = useState("");
  const [torchOn,   setTorchOn]   = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [scanning,  setScanning]  = useState(false);

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => { continuousRef.current = continuousScan; }, [continuousScan]);

  useEffect(() => {
    const scannerId = "qr-reader-" + Math.random().toString(36).slice(2);
    const el = document.getElementById("reader");
    if (el) el.id = scannerId;  // unique ID prevents conflicts on re-mount

    const scanner = new Html5Qrcode(scannerId);
    scannerRef.current = scanner;

    const qrboxSize = Math.min(window.innerWidth - 48, 280);

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: qrboxSize, height: qrboxSize } },
        (decodedText) => {
          onScanRef.current(decodedText);
          if (!continuousRef.current) {
            scanner.stop().catch(() => {});
          }
        },
      )
      .then(() => {
        setScanning(true);
        // Check torch support
        const capabilities = scanner.getRunningTrackCameraCapabilities?.();
        if (capabilities?.torchFeature?.isSupported?.()) {
          setTorchSupported(true);
        }
      })
      .catch((err) => {
        const msg = String(err);
        if (msg.includes("Permission") || msg.includes("permission")) {
          setError("Camera permission denied. Please allow camera access in your browser settings and try again.");
        } else if (msg.includes("NotFound") || msg.includes("Requested device not found")) {
          setError("No camera found on this device.");
        } else {
          setError("Could not start camera. " + msg);
        }
      });

    return () => {
      scanner.stop().catch(() => {});
    };
  }, []);


  async function toggleTorch() {
    if (!scannerRef.current) return;
    try {
      const capabilities = scannerRef.current.getRunningTrackCameraCapabilities?.();
      if (torchOn) {
        await capabilities?.torchFeature?.disable();
        setTorchOn(false);
      } else {
        await capabilities?.torchFeature?.enable();
        setTorchOn(true);
      }
    } catch {
      // Torch not available on this device — hide the button
      setTorchSupported(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      {error ? (
        <div style={{
          background: "rgba(163,45,45,.2)", border: "1px solid rgba(163,45,45,.5)",
          borderRadius: 10, padding: 20, color: "#F09595", fontSize: 13, textAlign: "center",
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>📷</div>
          {error}
        </div>
      ) : (
        <>
          <div id="reader" style={{ width: "100%", borderRadius: 10, overflow: "hidden" }} />

          {/* Torch button — only shown if hardware supports it */}
          {torchSupported && scanning && (
            <button
              onClick={toggleTorch}
              style={{
                position: "absolute", bottom: 12, right: 12,
                background: torchOn ? "#EF9F27" : "#111827",
                color: torchOn ? "#111827" : "#E8EFF8",
                border: "1px solid #1E2D42", borderRadius: 8,
                padding: "8px 14px", fontSize: 13, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {torchOn ? "🔦 Flash on" : "🔦 Flash off"}
            </button>
          )}

          {/* Scanning indicator */}
          {scanning && (
            <div style={{
              textAlign: "center", marginTop: 10, fontSize: 12, color: "#6B7E95",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <span style={{
                display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                background: "#5DCAA5",
                animation: "pulse 1.4s ease-in-out infinite",
              }}/>
              Point camera at QR code
              <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
            </div>
          )}
        </>
      )}
    </div>
  );
}