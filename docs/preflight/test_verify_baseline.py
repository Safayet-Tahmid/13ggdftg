"""The scientific baseline check must fail when a protected file changes (Task 2, WP4).
Run: python -m pytest -q docs/preflight. Works on a copy of the protected files, never on the real ones."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def copy_tree(tmp: Path) -> Path:
    m = json.loads((HERE / "baseline_manifest.json").read_text(encoding="utf-8"))
    (tmp / "docs" / "preflight").mkdir(parents=True)
    shutil.copy(HERE / "verify_baseline.py", tmp / "docs" / "preflight")
    shutil.copy(HERE / "baseline_manifest.json", tmp / "docs" / "preflight")
    for rel in m["source_sha256"]:
        (tmp / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(ROOT / rel, tmp / rel)
    return tmp


def run(tmp: Path):
    return subprocess.run([sys.executable, str(tmp / "docs" / "preflight" / "verify_baseline.py")],
                          capture_output=True, text=True, cwd=tmp)


def test_unchanged_files_pass(tmp_path):
    r = run(copy_tree(tmp_path))
    assert r.returncode == 0 and "UNCHANGED" in r.stdout


def test_a_changed_protected_file_fails(tmp_path):
    t = copy_tree(tmp_path)
    p = t / "config" / "settings.yaml"
    p.write_text(p.read_text(encoding="utf-8") + "\n# changed\n", encoding="utf-8")
    r = run(t)
    assert r.returncode == 1 and "CHANGED" in r.stdout and "config/settings.yaml" in r.stdout


def test_a_missing_protected_file_fails(tmp_path):
    t = copy_tree(tmp_path)
    (t / "pipeline" / "shift" / "checks.py").unlink()
    r = run(t)
    assert r.returncode == 1 and "pipeline/shift/checks.py" in r.stdout and "missing" in r.stdout
