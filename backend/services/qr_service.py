import qrcode
import base64
import io
import os


def generate_qr_base64(tray_id: str) -> str:
    """
    Generates a QR code for a tray scan URL.
    Returns a base64-encoded PNG string ready for <img src="data:image/png;base64,...">
    """
    # The QR code points to the scan page with tray ID pre-filled
    base_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    url = f"{base_url}?scan={tray_id}"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=8,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    return base64.b64encode(buf.getvalue()).decode("utf-8")


def generate_qr_bytes(tray_id: str) -> bytes:
    """Returns raw PNG bytes — used for direct file download."""
    base_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    url = f"{base_url}?scan={tray_id}"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=3,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.getvalue()