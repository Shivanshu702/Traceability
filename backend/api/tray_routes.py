"""
api/tray_routes.py
──────────────────
Tray creation, scanning, history, and QR code endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session
from database import get_db
from models import Tray, ScanEvent
from core.auth import get_current_user, require_admin, tenant
from core.rate_limit import limiter, SCAN_LIMIT
from services.tray_service import advance_tray, _tray_dict
from services.audit_service import log_action
from services.pipeline_service import get_pipeline_config, get_units_for_project_cfg
from services.qr_service import generate_qr_base64, generate_qr_bytes
from services.email_service import send_fifo_alert
from datetime import datetime
from typing import Optional

router = APIRouter(tags=["trays"])


def _event_dict(e: ScanEvent) -> dict:
    return {
        "id":         e.id,
        "tray_id":    e.tray_id,
        "from_stage": e.from_stage,
        "stage":      e.stage,
        "operator":   e.operator,
        "fifo_flag":  e.fifo_flag,
        "note":       e.note,
        "timestamp":  e.timestamp.isoformat() if e.timestamp else None,
    }


# ── Tray CRUD ─────────────────────────────────────────────────────────────────

@router.get("/trays")
def get_all_trays(
    stage:   Optional[str] = None,
    project: Optional[str] = None,
    user:    dict          = Depends(get_current_user),
    db:      Session       = Depends(get_db),
):
    tid = tenant(user)
    q   = db.query(Tray).filter(Tray.tenant_id == tid)
    if stage:   q = q.filter(Tray.stage   == stage)
    if project: q = q.filter(Tray.project == project)
    return [_tray_dict(t) for t in q.order_by(Tray.created_at.desc()).all()]


@router.post("/trays/create")
def create_trays(
    payload: dict,
    user:    dict    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    from core.cache import pipeline_cache, stats_cache
    tid     = tenant(user)
    cfg     = get_pipeline_config(db, tid)
    created = []

    for t in payload.get("trays", []):
        tray_id = str(t.get("id", "")).strip().upper()
        if not tray_id:
            continue
        if db.query(Tray).filter(Tray.tenant_id == tid, Tray.id == tray_id).first():
            continue

        units = t.get("total_units") or get_units_for_project_cfg(t.get("project", ""), cfg)
        now   = datetime.utcnow()
        tray  = Tray(
            id           = tray_id,
            tenant_id    = tid,
            stage        = "CREATED",
            project      = t.get("project", ""),
            shift        = t.get("shift", ""),
            created_by   = t.get("created_by", user["sub"]),
            batch_no     = t.get("batch_no", ""),
            total_units  = units,
            created_at   = now,
            last_updated = now,
        )
        db.add(tray)
        created.append({**_tray_dict(tray), "qr_base64": generate_qr_base64(tray_id)})

    db.commit()
    # Invalidate stats cache for this tenant after creation
    stats_cache.invalidate_prefix(f"stats:{tid}")
    log_action(db, user["sub"], "CREATE_TRAYS", f"count={len(created)}", tid)
    db.commit()
    return {"ok": True, "count": len(created), "trays": created}


@router.get("/tray/{tray_id}")
def get_tray(
    tray_id: str,
    user:    dict    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    tid  = tenant(user)
    tray = db.query(Tray).filter(
        Tray.tenant_id == tid, Tray.id == tray_id.strip().upper()
    ).first()
    if not tray:
        raise HTTPException(404, f"Tray not found: {tray_id}")
    return _tray_dict(tray)


@router.get("/tray/{tray_id}/qr")
def get_tray_qr(
    tray_id: str,
    user:    dict    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    tid  = tenant(user)
    tray = db.query(Tray).filter(
        Tray.tenant_id == tid, Tray.id == tray_id.strip().upper()
    ).first()
    if not tray:
        raise HTTPException(404, "Tray not found")
    return Response(content=generate_qr_bytes(tray.id), media_type="image/png")


@router.get("/tray/{tray_id}/qr/base64")
def get_tray_qr_b64(
    tray_id: str,
    user:    dict    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    tid  = tenant(user)
    tray = db.query(Tray).filter(
        Tray.tenant_id == tid, Tray.id == tray_id.strip().upper()
    ).first()
    if not tray:
        raise HTTPException(404, "Tray not found")
    return {"tray_id": tray.id, "qr_base64": generate_qr_base64(tray.id)}


@router.delete("/tray/{tray_id}")
def delete_tray(
    tray_id: str,
    user:    dict    = Depends(require_admin),
    db:      Session = Depends(get_db),
):
    from core.cache import stats_cache
    tid  = tenant(user)
    tray = db.query(Tray).filter(
        Tray.tenant_id == tid, Tray.id == tray_id.strip().upper()
    ).first()
    if not tray:
        raise HTTPException(404, "Tray not found")
    db.delete(tray)
    log_action(db, user["sub"], "DELETE_TRAY", tray_id, tid)
    db.commit()
    stats_cache.invalidate_prefix(f"stats:{tid}")
    return {"ok": True}


@router.post("/trays/bulk-delete")
def bulk_delete_trays(
    payload: dict,
    user:    dict    = Depends(require_admin),
    db:      Session = Depends(get_db),
):
    from core.cache import stats_cache
    tid       = tenant(user)
    ids       = [str(i).strip().upper() for i in payload.get("ids", [])]
    deleted   = []
    not_found = []

    for tray_id in ids:
        tray = db.query(Tray).filter(
            Tray.tenant_id == tid, Tray.id == tray_id
        ).first()
        if not tray:
            not_found.append(tray_id); continue
        db.query(ScanEvent).filter(
            ScanEvent.tenant_id == tid, ScanEvent.tray_id == tray_id
        ).delete(synchronize_session=False)
        db.delete(tray)
        deleted.append(tray_id)

    if deleted:
        log_action(
            db, user["sub"], "BULK_DELETE_TRAYS",
            f"count={len(deleted)} ids={','.join(deleted[:10])}", tid,
        )
    db.commit()
    stats_cache.invalidate_prefix(f"stats:{tid}")
    return {"ok": True, "deleted": len(deleted), "not_found": len(not_found), "ids": deleted}


# ── Scan ──────────────────────────────────────────────────────────────────────

@router.post("/scan")
@limiter.limit(SCAN_LIMIT)
def scan(
    request: Request,
    payload: dict,
    user:    dict    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    from core.cache import stats_cache
    tid     = tenant(user)
    tray_id = str(payload.get("id", "")).strip().upper()
    cfg     = get_pipeline_config(db, tid)

    try:
        tray = (
            db.query(Tray)
            .filter(Tray.tenant_id == tid, Tray.id == tray_id)
            .with_for_update()
            .first()
        )
    except Exception:
        tray = db.query(Tray).filter(Tray.tenant_id == tid, Tray.id == tray_id).first()

    if not tray:
        return {"error": f"Tray not found: {tray_id}"}

    result = advance_tray(
        db, tray,
        operator            = user["sub"],
        next_stage_override = payload.get("next_stage_override"),
        config              = cfg,
    )

    if result.get("ok"):
        log_action(db, user["sub"], "SCAN", f"{tray_id}:{tray.stage}", tid)
        stats_cache.invalidate_prefix(f"stats:{tid}")
        if result.get("fifo_vio") and result.get("older_trays"):
            try:
                send_fifo_alert(db, tray_id, result.get("to_stage", ""),
                                user["sub"], result["older_trays"], tid)
            except Exception:
                pass

    db.commit()
    return result


@router.post("/scan/bulk")
@limiter.limit(SCAN_LIMIT)
def bulk_scan(
    request: Request,
    payload: dict,
    user:    dict    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    from core.cache import stats_cache
    tid     = tenant(user)
    cfg     = get_pipeline_config(db, tid)
    results = []

    for raw_id in payload.get("ids", []):
        tray_id = str(raw_id).strip().upper()
        try:
            tray = (
                db.query(Tray)
                .filter(Tray.tenant_id == tid, Tray.id == tray_id)
                .with_for_update()
                .first()
            )
        except Exception:
            tray = db.query(Tray).filter(Tray.tenant_id == tid, Tray.id == tray_id).first()

        if not tray:
            results.append({"id": tray_id, "error": "Not found"}); continue

        r = advance_tray(db, tray, user["sub"], payload.get("next_stage_override"), cfg)
        db.commit()
        results.append(r)

    stats_cache.invalidate_prefix(f"stats:{tid}")
    ok_n = sum(1 for r in results if r.get("ok"))
    return {"ok": True, "total": len(results), "success": ok_n,
            "failed": len(results) - ok_n, "results": results}


# ── History & logs ────────────────────────────────────────────────────────────

@router.get("/history/{tray_id}")
def get_history(
    tray_id: str,
    user:    dict    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    tid    = tenant(user)
    events = (
        db.query(ScanEvent)
        .filter(ScanEvent.tenant_id == tid, ScanEvent.tray_id == tray_id.strip().upper())
        .order_by(ScanEvent.timestamp.asc())
        .all()
    )
    return [_event_dict(e) for e in events]


@router.get("/scan-log")
def get_scan_log(
    limit: int       = 200,
    user:  dict      = Depends(get_current_user),
    db:    Session   = Depends(get_db),
):
    tid    = tenant(user)
    events = (
        db.query(ScanEvent)
        .filter(ScanEvent.tenant_id == tid)
        .order_by(ScanEvent.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [_event_dict(e) for e in events]
