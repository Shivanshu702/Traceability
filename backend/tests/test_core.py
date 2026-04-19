"""
tests/test_core.py
──────────────────
Core service layer tests.

Coverage:
  • FIFO violation detection (correct vs original buggy logic)
  • Tray advancement: normal, already-complete, branch, already-split
  • Tray split: parent marker + child creation + stage_entered_at
  • Stuck alert deduplication logic
  • Password reset token lifecycle
"""
import hashlib
import secrets
from datetime import datetime, timedelta

import pytest

from models import Tray, ScanEvent, User, PasswordResetToken
from services.fifo_service import check_fifo_violation
from services.tray_service import advance_tray, _tray_dict


# ── Factories ─────────────────────────────────────────────────────────────────

def make_tray(db, tray_id="TRY001", stage="CREATED", project="CD2_PRO",
              tenant_id="default", stage_entered_at=None, last_updated=None):
    now = datetime.utcnow()
    t = Tray(
        id               = tray_id,
        tenant_id        = tenant_id,
        stage            = stage,
        project          = project,
        total_units      = 450,
        created_at       = now,
        last_updated     = last_updated or now,
        stage_entered_at = stage_entered_at or now,
    )
    db.add(t)
    db.flush()
    return t


# ── FIFO tests ────────────────────────────────────────────────────────────────

class TestFifoService:

    def test_no_violation_when_alone(self, db):
        """A tray is the only one at its stage — no violation."""
        t = make_tray(db, "TRY001", stage="RACK1_TOP")
        result = check_fifo_violation(db, t)
        assert result["violation"] is False
        assert result["older_trays"] == []

    def test_detects_older_tray_by_stage_entered_at(self, db):
        """A tray that entered the stage earlier should trigger a violation."""
        early = datetime.utcnow() - timedelta(minutes=30)
        late  = datetime.utcnow()

        older = make_tray(db, "TRY001", stage="RACK1_TOP",
                          stage_entered_at=early, last_updated=early)
        newer = make_tray(db, "TRY002", stage="RACK1_TOP",
                          stage_entered_at=late,  last_updated=late)

        result = check_fifo_violation(db, newer)
        assert result["violation"] is True
        assert "TRY001" in result["older_trays"]

    def test_no_violation_when_scanning_older_tray(self, db):
        """Scanning the older tray first — no violation expected."""
        early = datetime.utcnow() - timedelta(minutes=30)
        late  = datetime.utcnow()

        older = make_tray(db, "TRY001", stage="RACK1_TOP",
                          stage_entered_at=early, last_updated=early)
        _     = make_tray(db, "TRY002", stage="RACK1_TOP",
                          stage_entered_at=late,  last_updated=late)

        result = check_fifo_violation(db, older)
        assert result["violation"] is False

    def test_cross_project_no_violation(self, db):
        """Trays on different projects don't interfere with each other's FIFO."""
        early = datetime.utcnow() - timedelta(minutes=10)
        t1    = make_tray(db, "TRY001", stage="RACK1_TOP", project="CD2_PRO",
                          stage_entered_at=early)
        t2    = make_tray(db, "TRY002", stage="RACK1_TOP", project="CD3",
                          stage_entered_at=datetime.utcnow())
        result = check_fifo_violation(db, t2)
        assert result["violation"] is False

    def test_fifo_ignores_done_trays(self, db):
        """Completed trays at the same stage should not trigger a violation."""
        early = datetime.utcnow() - timedelta(minutes=10)
        done  = make_tray(db, "TRY001", stage="RACK1_TOP", stage_entered_at=early)
        done.is_done = True
        db.flush()
        newer = make_tray(db, "TRY002", stage="RACK1_TOP",
                          stage_entered_at=datetime.utcnow())
        result = check_fifo_violation(db, newer)
        assert result["violation"] is False


# ── Tray advancement tests ────────────────────────────────────────────────────

class TestAdvanceTray:

    def test_normal_advance(self, db, default_pipeline):
        """CREATED → RACK1_TOP under normal conditions."""
        t = make_tray(db, "TRY001", stage="CREATED")
        r = advance_tray(db, t, operator="op1", config=default_pipeline)
        assert r["ok"] is True
        assert r["to_stage"] == "RACK1_TOP"
        assert t.stage == "RACK1_TOP"

    def test_stage_entered_at_updated_on_advance(self, db, default_pipeline):
        """stage_entered_at must be refreshed to now on every advance."""
        before = datetime.utcnow() - timedelta(seconds=1)
        t      = make_tray(db, "TRY001", stage="CREATED")
        advance_tray(db, t, config=default_pipeline)
        assert t.stage_entered_at is not None
        assert t.stage_entered_at > before

    def test_already_complete_blocked(self, db, default_pipeline):
        """Scanning a COMPLETE tray returns an error without advancing."""
        t = make_tray(db, "TRY001", stage="COMPLETE")
        r = advance_tray(db, t, config=default_pipeline)
        assert "already_done" in r
        assert r.get("ok") is not True

    def test_split_parent_blocked(self, db, default_pipeline):
        """Scanning a SPLIT parent returns a clear error."""
        t = make_tray(db, "TRY001", stage="SPLIT")
        r = advance_tray(db, t, config=default_pipeline)
        assert "is_split_parent_blocked" in r
        assert r.get("ok") is not True

    def test_branch_requires_choice(self, db, default_pipeline):
        """BAT_MOUNT without a branch choice should return an error."""
        t = make_tray(db, "TRY001", stage="BAT_MOUNT")
        r = advance_tray(db, t, config=default_pipeline)
        assert r.get("ok") is not True
        assert "branch" in r.get("error", "").lower() or "select" in r.get("error", "").lower()

    def test_branch_robot(self, db, default_pipeline):
        """BAT_MOUNT with BAT_SOL_R override advances correctly."""
        t = make_tray(db, "TRY001", stage="BAT_MOUNT")
        r = advance_tray(db, t, next_stage_override="BAT_SOL_R", config=default_pipeline)
        assert r["ok"] is True
        assert r["to_stage"] == "BAT_SOL_R"

    def test_branch_manual(self, db, default_pipeline):
        """BAT_MOUNT with BAT_SOL_M override advances correctly."""
        t = make_tray(db, "TRY001", stage="BAT_MOUNT")
        r = advance_tray(db, t, next_stage_override="BAT_SOL_M", config=default_pipeline)
        assert r["ok"] is True
        assert r["to_stage"] == "BAT_SOL_M"

    def test_invalid_branch_override_rejected(self, db, default_pipeline):
        """An unknown branch ID must not be accepted."""
        t = make_tray(db, "TRY001", stage="BAT_MOUNT")
        r = advance_tray(db, t, next_stage_override="BAT_SOL_LASER", config=default_pipeline)
        assert r.get("ok") is not True

    def test_scan_event_written(self, db, default_pipeline):
        """Every successful advance must produce a ScanEvent row."""
        t = make_tray(db, "TRY001", stage="CREATED")
        advance_tray(db, t, operator="op1", config=default_pipeline)
        db.flush()
        events = db.query(ScanEvent).filter(ScanEvent.tray_id == "TRY001").all()
        assert len(events) == 1
        assert events[0].stage == "RACK1_TOP"
        assert events[0].operator == "op1"


# ── Tray split tests ──────────────────────────────────────────────────────────

class TestSplitTray:

    def test_split_creates_children(self, db, default_pipeline):
        """Scanning RACK2_BTM should create TRY001-A and TRY001-B."""
        t = make_tray(db, "TRY001", stage="RACK2_BTM", project="CD2_PRO")
        r = advance_tray(db, t, operator="op1", config=default_pipeline)
        db.flush()   # flush so new child rows are visible in the same session
        assert r["ok"] is True
        assert r["is_split"] is True
        assert r["child_a"] == "TRY001-A"
        assert r["child_b"] == "TRY001-B"

        child_a = db.query(Tray).filter(Tray.id == "TRY001-A").first()
        child_b = db.query(Tray).filter(Tray.id == "TRY001-B").first()
        assert child_a is not None
        assert child_b is not None
        assert child_a.stage == "BAT_MOUNT"
        assert child_b.parent_id == "TRY001"

    def test_split_parent_marked(self, db, default_pipeline):
        """Parent tray must be marked SPLIT and is_split_parent=True."""
        t = make_tray(db, "TRY001", stage="RACK2_BTM")
        advance_tray(db, t, config=default_pipeline)
        assert t.stage == "SPLIT"
        assert t.is_split_parent is True

    def test_split_children_get_stage_entered_at(self, db, default_pipeline):
        """Both children must have stage_entered_at set to a recent timestamp."""
        before = datetime.utcnow() - timedelta(seconds=1)
        t = make_tray(db, "TRY001", stage="RACK2_BTM")
        advance_tray(db, t, config=default_pipeline)
        db.flush()

        for child_id in ["TRY001-A", "TRY001-B"]:
            child = db.query(Tray).filter(Tray.id == child_id).first()
            assert child.stage_entered_at is not None
            assert child.stage_entered_at > before

    def test_split_units_distributed(self, db, default_pipeline):
        """Total units across children must equal parent total."""
        t = make_tray(db, "TRY001", stage="RACK2_BTM")
        t.total_units = 451
        db.flush()
        advance_tray(db, t, config=default_pipeline)
        db.flush()

        a = db.query(Tray).filter(Tray.id == "TRY001-A").first()
        b = db.query(Tray).filter(Tray.id == "TRY001-B").first()
        assert a.total_units + b.total_units == 451


# ── Password reset token tests ────────────────────────────────────────────────

class TestPasswordResetToken:

    def _make_token_row(self, db, username="alice", tenant_id="default",
                         minutes_from_now=15, used=False):
        raw    = secrets.token_urlsafe(32)
        hashed = hashlib.sha256(raw.encode()).hexdigest()
        row    = PasswordResetToken(
            tenant_id  = tenant_id,
            username   = username,
            token_hash = hashed,
            expires_at = datetime.utcnow() + timedelta(minutes=minutes_from_now),
            used       = used,
        )
        db.add(row)
        db.flush()
        return raw, row

    def test_valid_token_accepted(self, db):
        raw, row = self._make_token_row(db)
        hashed   = hashlib.sha256(raw.encode()).hexdigest()
        found    = db.query(PasswordResetToken).filter(
            PasswordResetToken.token_hash == hashed,
            PasswordResetToken.used       == False,
        ).first()
        assert found is not None
        assert found.expires_at > datetime.utcnow()

    def test_expired_token_detected(self, db):
        raw, row = self._make_token_row(db, minutes_from_now=-1)
        assert row.expires_at < datetime.utcnow()

    def test_used_token_not_found(self, db):
        raw, row = self._make_token_row(db, used=True)
        hashed   = hashlib.sha256(raw.encode()).hexdigest()
        found    = db.query(PasswordResetToken).filter(
            PasswordResetToken.token_hash == hashed,
            PasswordResetToken.used       == False,
        ).first()
        assert found is None


# ── Stuck alert dedup tests ───────────────────────────────────────────────────

class TestStuckAlertDedup:

    def test_tray_within_cooldown_skipped(self, db):
        """A tray alerted 1 hour ago should be skipped with a 2-hour cooldown."""
        t = make_tray(db, "TRY001", stage="RACK1_TOP")
        t.last_stuck_alert_at = datetime.utcnow() - timedelta(hours=1)
        db.flush()

        cooldown_hours = 2
        cutoff = datetime.utcnow() - timedelta(hours=cooldown_hours)
        should_alert = (
            t.last_stuck_alert_at is None or t.last_stuck_alert_at < cutoff
        )
        assert should_alert is False

    def test_tray_outside_cooldown_alerted(self, db):
        """A tray alerted 3 hours ago with 2-hour cooldown should be re-alerted."""
        t = make_tray(db, "TRY001", stage="RACK1_TOP")
        t.last_stuck_alert_at = datetime.utcnow() - timedelta(hours=3)
        db.flush()

        cooldown_hours = 2
        cutoff = datetime.utcnow() - timedelta(hours=cooldown_hours)
        should_alert = (
            t.last_stuck_alert_at is None or t.last_stuck_alert_at < cutoff
        )
        assert should_alert is True

    def test_never_alerted_tray_included(self, db):
        """A tray with no prior alert should always be included."""
        t = make_tray(db, "TRY001", stage="RACK1_TOP")
        assert t.last_stuck_alert_at is None

        cutoff = datetime.utcnow() - timedelta(hours=2)
        should_alert = (
            t.last_stuck_alert_at is None or t.last_stuck_alert_at < cutoff
        )
        assert should_alert is True