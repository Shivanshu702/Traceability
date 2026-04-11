from models import AuditLog

def log_action(db, username, action, details=""):
    log = AuditLog(
        username=username,
        action=action,
        details=details
    )
    db.add(log)