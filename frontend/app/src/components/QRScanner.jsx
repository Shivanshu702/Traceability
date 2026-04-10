import { useEffect } from "react";
import { Html5Qrcode } from "html5-qrcode";

export default function QRScanner({ onScan }) {
  useEffect(() => {
    const scanner = new Html5Qrcode("reader");

    scanner
      .start(
        { facingMode: "environment" }, // back camera
        {
          fps: 10,
          qrbox: 250,
        },
        (decodedText) => {
          onScan(decodedText);
          scanner.stop(); // stop after scan
        }
      )
      .catch((err) => {
        console.error("Camera error:", err);
      });

    return () => {
      scanner.stop().catch(() => {});
    };
  }, []);

  return <div id="reader" style={{ width: "100%" }} />;
}