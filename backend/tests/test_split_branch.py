
import pytest
from datetime import datetime

from models import Tray, ScanEvent
from services.tray_service import advance_tray, _tray_dict


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_tray(db, tray_id="TRY001", stage="CREATED", project="CD2_PRO",
              tenant_id="default", total_units=450, parent_id=None,
              is_split_parent=False):
    now = datetime.utcnow()
    t = Tray(
        id               = tray_id,
        tenant_id        = tenant_id,
        stage            = stage,
        project          = project,
        shift            = "A",
        created_by       = "test_operator",
        batch_no         = "BATCH001",
        total_units      = total_units,
        parent_id        = parent_id,
        is_split_parent  = is_split_parent,
        is_done          = False,
        created_at       = now,
        last_updated     = now,
        stage_entered_at = now,
    )
    db.add(t)
    db.flush()
    return t


def scan_events_for(db, tray_id):
    return db.query(ScanEvent).filter(ScanEvent.tray_id == tray_id).all()


# ── 1. Split tests ────────────────────────────────────────────────────────────

class TestTraySplit:

    def test_split_marks_parent(self, db, default_pipeline):
        """Parent tray moves to SPLIT stage and is flagged is_split_parent."""
        tray   = make_tray(db, stage="RACK2_BTM")
        result = advance_tray(db, tray, operator="op1", config=default_pipeline)

        assert result["ok"]          is True
        assert result["is_split"]    is True
        assert tray.stage            == "SPLIT"
        assert tray.is_split_parent  is True

    def test_split_creates_two_children(self, db, default_pipeline):
        """Two child trays (suffix -A, -B) are created at BAT_MOUNT."""
        tray = make_tray(db, "TRY100", stage="RACK2_BTM", total_units=450)
        advance_tray(db, tray, config=default_pipeline)
        db.flush()

        child_a = db.query(Tray).filter(Tray.id == "TRY100-A").first()
        child_b = db.query(Tray).filter(Tray.id == "TRY100-B").first()

        assert child_a is not None, "Child A was not created"
        assert child_b is not None, "Child B was not created"
        assert child_a.stage == "BAT_MOUNT"
        assert child_b.stage == "BAT_MOUNT"

    def test_split_unit_counts_even(self, db, default_pipeline):
        """Even total_units splits 50/50."""
        tray = make_tray(db, "TRY101", stage="RACK2_BTM", total_units=100)
        advance_tray(db, tray, config=default_pipeline)
        db.flush()

        a = db.query(Tray).filter(Tray.id == "TRY101-A").first()
        b = db.query(Tray).filter(Tray.id == "TRY101-B").first()
        assert a.total_units + b.total_units == 100
        assert a.total_units == 50
        assert b.total_units == 50

    def test_split_unit_counts_odd(self, db, default_pipeline):
        """Odd total_units: A gets the extra unit (ceiling/floor)."""
        tray = make_tray(db, "TRY102", stage="RACK2_BTM", total_units=451)
        advance_tray(db, tray, config=default_pipeline)
        db.flush()

        a = db.query(Tray).filter(Tray.id == "TRY102-A").first()
        b = db.query(Tray).filter(Tray.id == "TRY102-B").first()
        assert a.total_units + b.total_units == 451
        assert a.total_units == 226   # ceiling
        assert b.total_units == 225   # floor

    def test_split_children_inherit_metadata(self, db, default_pipeline):
        """Children inherit project, shift, batch_no, created_by from parent."""
        tray = make_tray(db, "TRY103", stage="RACK2_BTM", project="PD5")
        tray.shift      = "B"
        tray.batch_no   = "BATCH_XYZ"
        tray.created_by = "alice"
        db.flush()

        advance_tray(db, tray, config=default_pipeline)
        db.flush()

        for suffix in ("A", "B"):
            child = db.query(Tray).filter(Tray.id == f"TRY103-{suffix}").first()
            assert child.project    == "PD5"
            assert child.shift      == "B"
            assert child.batch_no   == "BATCH_XYZ"
            assert child.created_by == "alice"
            assert child.parent_id  == "TRY103"

    def test_split_writes_scan_events(self, db, default_pipeline):
        """A scan event is logged for the parent and for each child."""
        tray = make_tray(db, "TRY104", stage="RACK2_BTM")
        advance_tray(db, tray, operator="op_split", config=default_pipeline)
        db.flush()

        parent_events = scan_events_for(db, "TRY104")
        child_a_events = scan_events_for(db, "TRY104-A")
        child_b_events = scan_events_for(db, "TRY104-B")

        assert len(parent_events)  >= 1, "No scan event for parent"
        assert len(child_a_events) >= 1, "No scan event for child A"
        assert len(child_b_events) >= 1, "No scan event for child B"

        parent_event = parent_events[-1]
        assert parent_event.stage    == "SPLIT"
        assert parent_event.operator == "op_split"

    def test_scanning_split_parent_is_blocked(self, db, default_pipeline):
        """Attempting to scan a split parent returns an error, not an advance."""
        tray = make_tray(db, "TRY105", stage="RACK2_BTM")
        advance_tray(db, tray, config=default_pipeline)
        db.flush()

        # Now try to scan the parent again
        result = advance_tray(db, tray, config=default_pipeline)
        assert "error" in result
        assert result.get("is_split_parent_blocked") is True

    def test_split_result_contains_child_ids(self, db, default_pipeline):
        """The split result dict names the two child IDs."""
        tray   = make_tray(db, "TRY106", stage="RACK2_BTM")
        result = advance_tray(db, tray, config=default_pipeline)

        assert result["child_a"] == "TRY106-A"
        assert result["child_b"] == "TRY106-B"

    def test_split_sets_stage_entered_at_on_children(self, db, default_pipeline):
        """Children get stage_entered_at set at split time for accurate FIFO."""
        tray = make_tray(db, "TRY107", stage="RACK2_BTM")
        advance_tray(db, tray, config=default_pipeline)
        db.flush()

        for suffix in ("A", "B"):
            child = db.query(Tray).filter(Tray.id == f"TRY107-{suffix}").first()
            assert child.stage_entered_at is not None, \
                f"Child {suffix} missing stage_entered_at"


# ── 2. Branch tests ───────────────────────────────────────────────────────────

class TestBranch:

    def _make_bat_mount(self, db):
        """Create a tray already at the branch stage (BAT_MOUNT)."""
        return make_tray(db, "TRY200", stage="BAT_MOUNT")

    def test_branch_requires_override(self, db, default_pipeline):
        """Scanning BAT_MOUNT without a next_stage_override returns an error."""
        tray   = self._make_bat_mount(db)
        result = advance_tray(db, tray, config=default_pipeline)
        assert "error" in result
        assert "branch" in result["error"].lower() or "select" in result["error"].lower()

    def test_robot_branch_advances_to_bat_sol_r(self, db, default_pipeline):
        """Choosing BAT_SOL_R moves the tray to that stage."""
        tray   = self._make_bat_mount(db)
        result = advance_tray(
            db, tray,
            operator            = "op_robot",
            next_stage_override = "BAT_SOL_R",
            config              = default_pipeline,
        )
        assert result["ok"]       is True
        assert result["to_stage"] == "BAT_SOL_R"
        assert tray.stage         == "BAT_SOL_R"

    def test_manual_branch_advances_to_bat_sol_m(self, db, default_pipeline):
        """Choosing BAT_SOL_M moves the tray to that stage."""
        tray   = self._make_bat_mount(db)
        result = advance_tray(
            db, tray,
            operator            = "op_manual",
            next_stage_override = "BAT_SOL_M",
            config              = default_pipeline,
        )
        assert result["ok"]       is True
        assert result["to_stage"] == "BAT_SOL_M"
        assert tray.stage         == "BAT_SOL_M"

    def test_invalid_branch_is_rejected(self, db, default_pipeline):
        """An override that is not a valid branch option returns an error."""
        tray   = self._make_bat_mount(db)
        result = advance_tray(
            db, tray,
            next_stage_override = "RACK1_TOP",   # not a valid branch
            config              = default_pipeline,
        )
        assert "error" in result

    def test_branch_writes_correct_scan_event(self, db, default_pipeline):
        """The scan event records the operator and target stage."""
        tray = self._make_bat_mount(db)
        advance_tray(db, tray, operator="alice", next_stage_override="BAT_SOL_R",
                     config=default_pipeline)
        db.flush()

        events = scan_events_for(db, "TRY200")
        assert len(events) >= 1
        last = events[-1]
        assert last.stage    == "BAT_SOL_R"
        assert last.operator == "alice"

    def test_robot_branch_converges_to_rack3(self, db, default_pipeline):
        """After BAT_SOL_R the next stage is RACK3 (both branches converge)."""
        tray = make_tray(db, "TRY201", stage="BAT_SOL_R")
        result = advance_tray(db, tray, config=default_pipeline)
        assert result["ok"]       is True
        assert result["to_stage"] == "RACK3"

    def test_manual_branch_converges_to_rack3(self, db, default_pipeline):
        """After BAT_SOL_M the next stage is also RACK3."""
        tray = make_tray(db, "TRY202", stage="BAT_SOL_M")
        result = advance_tray(db, tray, config=default_pipeline)
        assert result["ok"]       is True
        assert result["to_stage"] == "RACK3"

    def test_branch_updates_stage_entered_at(self, db, default_pipeline):
        """stage_entered_at is refreshed on branch so FIFO stays accurate."""
        tray      = self._make_bat_mount(db)
        before    = tray.stage_entered_at
        advance_tray(db, tray, next_stage_override="BAT_SOL_R", config=default_pipeline)
        # stage_entered_at should have been updated to a new value
        assert tray.stage_entered_at is not None
        assert tray.stage_entered_at >= before


# ── 3. Full pipeline walkthrough ──────────────────────────────────────────────

class TestFullPipeline:

    def test_tray_travels_from_created_to_complete_via_robot(self, db, default_pipeline):
        """
        Walk a tray through the entire default pipeline using the robot branch.

        Expected stage sequence for one of the two child trays:
          CREATED → RACK1_TOP → RACK2_BTM
            (split) → BAT_MOUNT (on child)
                    → BAT_SOL_R (robot branch)
                    → RACK3
                    → DEPANEL_IN
                    → TESTING
                    → COMPLETE
        """
        # ── Stages before split ──────────────────────────────────────────────
        parent = make_tray(db, "TRY300", stage="CREATED")

        r1 = advance_tray(db, parent, config=default_pipeline)
        assert r1["to_stage"] == "RACK1_TOP"

        r2 = advance_tray(db, parent, config=default_pipeline)
        assert r2["to_stage"] == "RACK2_BTM"

        # ── Split ────────────────────────────────────────────────────────────
        r3 = advance_tray(db, parent, config=default_pipeline)
        assert r3["is_split"]  is True
        assert parent.stage    == "SPLIT"

        db.flush()
        child_a = db.query(Tray).filter(Tray.id == "TRY300-A").first()
        assert child_a.stage == "BAT_MOUNT"

        # ── Branch on child A (robot) ─────────────────────────────────────
        r4 = advance_tray(db, child_a, next_stage_override="BAT_SOL_R",
                          config=default_pipeline)
        assert r4["to_stage"] == "BAT_SOL_R"

        r5 = advance_tray(db, child_a, config=default_pipeline)
        assert r5["to_stage"] == "RACK3"

        r6 = advance_tray(db, child_a, config=default_pipeline)
        assert r6["to_stage"] == "DEPANEL_IN"

        r7 = advance_tray(db, child_a, config=default_pipeline)
        assert r7["to_stage"] == "TESTING"

        r8 = advance_tray(db, child_a, config=default_pipeline)
        assert r8["to_stage"] == "COMPLETE"

        # ── Final assertions ─────────────────────────────────────────────────
        assert child_a.is_done     is True
        assert child_a.completed_at is not None

    def test_scanning_complete_tray_is_blocked(self, db, default_pipeline):
        """A COMPLETE tray cannot be advanced further."""
        tray = make_tray(db, "TRY301", stage="TESTING")
        advance_tray(db, tray, config=default_pipeline)   # → COMPLETE
        db.flush()

        result = advance_tray(db, tray, config=default_pipeline)
        assert "error" in result
        assert result.get("already_done") is True

    def test_parent_blocked_while_children_in_progress(self, db, default_pipeline):
        """After split the parent cannot be scanned even if children are still WIP."""
        parent = make_tray(db, "TRY302", stage="RACK2_BTM")
        advance_tray(db, parent, config=default_pipeline)   # triggers split
        db.flush()

        # Try scanning the parent – must be blocked.
        result = advance_tray(db, parent, config=default_pipeline)
        assert "error" in result
        assert result.get("is_split_parent_blocked") is True

    def test_both_children_can_complete_independently(self, db, default_pipeline):
        """Children A and B are independent – completing A doesn't affect B."""
        parent = make_tray(db, "TRY303", stage="RACK2_BTM", total_units=100)
        advance_tray(db, parent, config=default_pipeline)
        db.flush()

        child_a = db.query(Tray).filter(Tray.id == "TRY303-A").first()
        child_b = db.query(Tray).filter(Tray.id == "TRY303-B").first()

        # Advance child A all the way to COMPLETE.
        for override in [None, None, "BAT_SOL_M", None, None, None, None]:
            if child_a.stage == "BAT_MOUNT":
                advance_tray(db, child_a, next_stage_override="BAT_SOL_M",
                             config=default_pipeline)
            elif not child_a.is_done:
                advance_tray(db, child_a, config=default_pipeline)

        # Child B should still be at BAT_MOUNT, unaffected.
        db.refresh(child_b)
        assert child_b.stage   == "BAT_MOUNT"
        assert child_b.is_done is False