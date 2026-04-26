from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from core.auth import get_current_user, require_admin, tenant
from core.rate_limit import limiter, SCAN_LIMIT
from database import get_db
from models import ScanEvent, Tray
from schemas import BulkDeleteIn, BulkScanIn, ScanIn, TraysCreateIn
from services.audit_service import log_action
from services.email_service import send_fifo_alert
from services.pipeline_service import get_pipeline_config, get_units_for_project_cfg
from services.qr_service import generate_qr_base64, generate_qr_bytes
from services.tray_service import advance_tray, _tray_dict

router = APIRouter(tags=["trays"])

_MAX_PAGE_SIZE = 500


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


# ── Tray CRUD ──────────────────────────────────────────────────────────────────

@router.get("/trays")
def get_all_trays(
    stage:   Optional[str] = None,
    project: Optional[str] = None,
    limit:   int           = Query(default=200, ge=1, le=_MAX_PAGE_SIZE),
    offset:  int           = Query(default=0,   ge=0),
    user:    dict          = Depends(get_current_user),
    db:      Session       = Depends(get_db),
):
    tid = tenant(user)
    q   = db.query(Tray).filter(Tray.tenant_id == tid)
    if stage:   q = q.filter(Tray.stage   == stage)
    if project: q = q.filter(Tray.project == project)

    total = q.count()
    trays = q.order_by(Tray.created_at.desc()).offset(offset).limit(limit).all()

    return {
        "total":  total,
        "limit":  limit,
        "offset": offset,
        "trays":  [_tray_dict(t) for t in trays],
    }


@router.post("/trays/create")
@limiter.limit("30/minute")
def create_trays(
    request: Request,                              # required by slowapi
    payload: TraysCreateIn,
    user:    dict    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    from core.cache import stats_cache
    tid     = tenant(user)
    cfg     = get_pipeline_config(db, tid)
    created = []
    now     = datetime.now(timezone.utc)

    for t in payload.trays:
        tray_id = t.id
        if db.query(Tray).filter(Tray.tenant_id == tid, Tray.id == tray_id).first():
            continue

        units = t.total_units or get_units_for_project_cfg(t.project or "", cfg)
        tray  = Tray(
            id               = tray_id,
            tenant_id        = tid,
            stage            = "CREATED",
            project          = t.project or "",
            shift            = t.shift or "",
            created_by       = t.created_by or user["sub"],
            batch_no         = t.batch_no or "",
            total_units      = units,
            created_at       = now,
            last_updated     = now,
            stage_entered_at = now,
        )
        db.add(tray)
        created.append({**_tray_dict(tray), "qr_base64": generate_qr_base64(tray_id)})

    db.commit()
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

    db.query(ScanEvent).filter(
        ScanEvent.tenant_id == tid,
        ScanEvent.tray_id   == tray.id,
    ).delete(synchronize_session=False)

    db.delete(tray)
    log_action(db, user["sub"], "DELETE_TRAY", tray_id, tid)
    db.commit()
    stats_cache.invalidate_prefix(f"stats:{tid}")
    return {"ok": True}


@router.post("/trays/bulk-delete")
def bulk_delete_trays(
    payload: BulkDeleteIn,
    user:    dict    = Depends(require_admin),
    db:      Session = Depends(get_db),
):
    from core.cache import stats_cache
    tid       = tenant(user)
    deleted   = []
    not_found = []

    for tray_id in payload.ids:
        tray = db.query(Tray).filter(
            Tray.tenant_id == tid, Tray.id == tray_id
        ).first()
        if not tray:
            not_found.append(tray_id)
            continue
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


# ── Scan ───────────────────────────────────────────────────────────────────────

@router.post("/scan")
@limiter.limit(SCAN_LIMIT)
def scan(
    request: Request,
    payload: ScanIn,
    user:    dict    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    from core.cache import stats_cache
    tid     = tenant(user)
    tray_id = payload.id
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
        operator            = payload.operator or user["sub"],
        next_stage_override = payload.next_stage_override,
        config              = cfg,
    )

    if result.get("ok"):
        log_action(db, user["sub"], "SCAN",
                   f"{tray_id}:{result['from_stage']}→{result['to_stage']}", tid)
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
    payload: BulkScanIn,
    user:    dict    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    from core.cache import stats_cache
    tid     = tenant(user)
    cfg     = get_pipeline_config(db, tid)
    results = []

    for tray_id in payload.ids:
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
            results.append({"id": tray_id, "error": "Not found"})
            continue

        r = advance_tray(db, tray, user["sub"], payload.next_stage_override, cfg)
        db.commit()
        results.append(r)

    stats_cache.invalidate_prefix(f"stats:{tid}")
    ok_n = sum(1 for r in results if r.get("ok"))
    return {"ok": True, "total": len(results), "success": ok_n,
            "failed": len(results) - ok_n, "results": results}


# ── History & logs ─────────────────────────────────────────────────────────────

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
    limit:  int     = Query(default=200, ge=1, le=2000),
    offset: int     = Query(default=0,   ge=0),
    user:   dict    = Depends(get_current_user),
    db:     Session = Depends(get_db),
):
    tid    = tenant(user)
    total  = db.query(ScanEvent).filter(ScanEvent.tenant_id == tid).count()
    events = (
        db.query(ScanEvent)
        .filter(ScanEvent.tenant_id == tid)
        .order_by(ScanEvent.timestamp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {"total": total, "limit": limit, "offset": offset,
            "events": [_event_dict(e) for e in events]}