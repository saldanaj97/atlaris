# Codemap generator

Generates `docs/codemap/codemap.json`, `codemap.lock` and `codemap.html` together. Never hand-edit those three files.

```bash
python3 docs/codemap/generator/gen.py              # writes into docs/codemap
python3 docs/codemap/generator/verify.py           # independent check of docs/codemap
python3 docs/codemap/generator/gen.py --out /tmp/x # write somewhere else (then verify.py /tmp/x)
```

- Python 3 standard library only. The repo root is derived from this folder's location.
- The generator reads the working tree plus git, and records any uncommitted paths outside `docs/codemap` in the lock. Commit first, then regenerate, so the lock reflects a clean commit.
- `codemap.lock` stores module fingerprints. Compare it against the repo before regenerating to see which modules changed.
- `model.py` holds the module/flow model and the scope excludes, `render.py` the HTML template, `gen.py` the driver, `verify.py` the checks.
