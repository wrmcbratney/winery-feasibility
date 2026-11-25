#!/usr/bin/env python3
"""Build dist/index.html: inline the engine files into the page template.

The page is a single self-contained HTML file so it can be published as a Claude artifact.
Engine files are plain browser scripts that also export for Node (tests); the export
lines are stripped here.
"""
import re, pathlib
ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
strip = lambda s: re.sub(r"^if\(typeof module!=='undefined'\)module\.exports=.*$", "", s, flags=re.M)
page = (SRC / "index.src.html").read_text()
for token, name in [("/*CORE*/", "core.js"), ("/*EXC*/", "exceptions.js"), ("/*SUP*/", "supplies.js"), ("/*WINERY*/", "winery.js"), ("/*FIN*/", "fin.js"), ("/*SRC*/", "sources.js"), ("/*FLOW*/", "flow.js")]:
    assert token in page, f"missing placeholder {token}"
    page = page.replace(token, strip((SRC / name).read_text()))
(ROOT / "dist").mkdir(exist_ok=True)
(ROOT / "dist" / "index.html").write_text(page)
if "—" in page:
    print("warning: em dash in page text")
print(f"built dist/index.html ({len(page):,} bytes)")
