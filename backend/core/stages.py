STAGES = [
    {"id": "CREATED",    "label": "Label Printed",             "next": "RACK1_TOP"},
    {"id": "RACK1_TOP",  "label": "Rack 1 (Top Side)",          "next": "RACK2_BTM"},
    {"id": "RACK2_BTM",  "label": "Rack 2 (Bottom Side)",       "next": "BAT_MOUNT"},  # split trigger
    {"id": "BAT_MOUNT",  "label": "Battery Mounted",            "next": None},          # branch point
    {"id": "BAT_SOL_R",  "label": "Battery Soldered (Robot)",   "next": "RACK3"},
    {"id": "BAT_SOL_M",  "label": "Battery Soldered (Manual)",  "next": "RACK3"},
    {"id": "RACK3",      "label": "Rack 3",                    "next": "DEPANEL_IN"},
    {"id": "DEPANEL_IN", "label": "Depanelising",               "next": "TESTING"},
    {"id": "TESTING",    "label": "Testing",                   "next": "COMPLETE"},
    {"id": "COMPLETE",   "label": "Complete",                  "next": None},
]

STAGE_COLORS = {
    "CREATED":    "#888780",
    "RACK1_TOP":  "#378ADD",
    "RACK2_BTM":  "#7F77DD",
    "BAT_MOUNT":  "#EF9F27",
    "BAT_SOL_R":  "#E24B4A",
    "BAT_SOL_M":  "#5DCAA5",
    "RACK3":      "#D4537E",
    "DEPANEL_IN": "#BA7517",
    "TESTING":    "#185FA5",
    "COMPLETE":   "#3B6D11",
}

# Human-readable scan action notes (mirrors GAS SCAN_ACTIONS)
SCAN_ACTIONS = {
    "CREATED":    "Tray moved to Rack 1 — Top Side SMT",
    "RACK1_TOP":  "Top Side SMT done — tray moved to Rack 2",
    "RACK2_BTM":  "Bottom Side SMT done — tray split into Part A & Part B",
    "BAT_MOUNT":  "Battery mounted — soldering started",
    "BAT_SOL_R":  "Robot soldering done — tray moved to Rack 3",
    "BAT_SOL_M":  "Manual soldering done — tray moved to Rack 3",
    "RACK3":      "Rack 3 done — tray moved to Depanelising",
    "DEPANEL_IN": "Depanelising done — tray moved to Testing",
    "TESTING":    "Testing complete — process finished",
}

# Stage that triggers the tray split
SPLIT_STAGE      = "RACK2_BTM"
# Where both child trays begin after the split
SPLIT_NEXT_STAGE = "BAT_MOUNT"
# Virtual marker written to the parent row
SPLIT_MARKER     = "SPLIT"

# Stage at which operator must choose a branch
BRANCH_STAGE   = "BAT_MOUNT"
BRANCH_OPTIONS = [
    {"id": "BAT_SOL_R", "label": "Battery Soldered by Robot", "icon": "🤖"},
    {"id": "BAT_SOL_M", "label": "Battery Soldered by Hand",  "icon": "✋"},
]

PROJECTS = [
    {"id": "CD2_PRO",  "label": "CD2 PRO",  "panels": 50, "unitsPerPanel": 9},
    {"id": "CD2_PLUS", "label": "CD2 PLUS", "panels": 50, "unitsPerPanel": 9},
    {"id": "CD3",      "label": "CD3",      "panels": 50, "unitsPerPanel": 8},
    {"id": "PD5",      "label": "PD5",      "panels": 50, "unitsPerPanel": 4},
    {"id": "PD6",      "label": "PD6",      "panels": 50, "unitsPerPanel": 4},
    {"id": "PD7",      "label": "PD7",      "panels": 50, "unitsPerPanel": 4},
]

# Thresholds (seconds) for bottleneck detection
STAGE_STUCK_LIMITS = {
    "CREATED":    3600,
    "RACK1_TOP":  7200,
    "RACK2_BTM":  7200,
    "BAT_MOUNT":  3600,
    "BAT_SOL_R":  7200,
    "BAT_SOL_M":  7200,
    "RACK3":      7200,
    "DEPANEL_IN": 10800,
    "TESTING":    14400,
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_stage_def(stage_id: str):
    for s in STAGES:
        if s["id"] == stage_id:
            return s
    for b in BRANCH_OPTIONS:
        if b["id"] == stage_id:
            return b
    return None


def get_units_for_project(project_id: str) -> int:
    for p in PROJECTS:
        if p["id"] == project_id:
            return p["panels"] * p["unitsPerPanel"]
    return 450
