from models import AuditLog


def log_action(db, username: str, action: str, details: str = ""):
    entry = AuditLog(
        username = username,
        action   = action,
        details  = details,
    )
    db.add(entry)
    # caller is responsible for db.commit()