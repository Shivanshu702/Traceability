from models import AuditLog


def log_action(
    db,
    username:  str,
    action:    str,
    details:   str = "",
    tenant_id: str = "default",
):
    entry = AuditLog(
        tenant_id = tenant_id,
        username  = username,
        action    = action,
        details   = details,
    )
    db.add(entry)
    # Caller is responsible for db.commit()
