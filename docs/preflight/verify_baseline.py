"""Check that the scientific code, the settings and (optionally) the published data are unchanged
since the preflight baseline (docs/preflight/baseline_manifest.json).

Usage, from the repository root:
    python docs/preflight/verify_baseline.py                      # code and settings
    python docs/preflight/verify_baseline.py --zip site_data.zip  # also the released data file

Exit code 0 means everything matches. Any difference is printed and the exit code is 1.
Standard library only. It reads files and prints hashes, never secrets.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = Path(__file__).with_name("baseline_manifest.json")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", help="path to a downloaded site_data.zip to compare with the release digest")
    args = ap.parse_args()
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    bad = []
    for rel, want in m["source_sha256"].items():
        p = ROOT / rel
        got = sha256(p) if p.exists() else "missing"
        if got != want:
            bad.append(f"{rel}: baseline {want[:12]} now {got[:12]}")
    if args.zip:
        want = m["published_data"]["sha256_computed_locally"]
        got = sha256(Path(args.zip))
        if got != want:
            bad.append(f"site_data.zip: baseline {want[:12]} now {got[:12]}")
    checked = len(m["source_sha256"]) + (1 if args.zip else 0)
    if bad:
        print(f"CHANGED: {len(bad)} of {checked} files differ from the baseline ({m['baseline_commit'][:7]}):")
        for line in bad:
            print("  " + line)
        return 1
    print(f"UNCHANGED: all {checked} files match the baseline ({m['baseline_commit'][:7]}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
