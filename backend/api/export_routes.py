
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from database import get_db
from core.auth import get_current_user, require_admin, tenant
from core.rate_limit import limiter, EXPORT_LIMIT
from services.export_service import export_trays_csv, export_scan_log_csv, export_report_xlsx
from datetime import datetime, date
from fastapi import Request

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/trays")
@limiter.limit(EXPORT_LIMIT)
def export_trays(
    request:    Request,
    stage:      str | None = Query(None),
    project:    str | None = Query(None),
    start_date: str | None = Query(None),
    end_date:   str | None = Query(None),
    user:       dict       = Depends(get_current_user),
    db:         Session    = Depends(get_db),
):
    sd         = datetime.fromisoformat(start_date) if start_date else None
    ed         = datetime.fromisoformat(end_date)   if end_date   else None
    csv_bytes  = export_trays_csv(db, tenant(user), stage, project, sd, ed)
    filename   = f"trays_{date.today().isoformat()}.csv"
    return Response(
        content    = csv_bytes,
        media_type = "text/csv",
        headers    = {"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/scan-log")
@limiter.limit(EXPORT_LIMIT)
def export_scan_log(
    request: Request,
    limit:   int     = Query(50_000),
    user:    dict    = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    csv_bytes = export_scan_log_csv(db, tenant(user), limit)
    filename  = f"scan_log_{date.today().isoformat()}.csv"
    return Response(
        content    = csv_bytes,
        media_type = "text/csv",
        headers    = {"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/report")
@limiter.limit(EXPORT_LIMIT)
def export_report(
    request: Request,
    user:    dict    = Depends(require_admin),
    db:      Session = Depends(get_db),
):
    xlsx_bytes = export_report_xlsx(db, tenant(user))
    filename   = f"production_report_{date.today().isoformat()}.xlsx"
    return Response(
        content    = xlsx_bytes,
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers    = {"Content-Disposition": f'attachment; filename="{filename}"'},
    )
