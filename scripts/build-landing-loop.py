"""Make a repeatable 12-bar excerpt without changing the original tune."""
from copy import deepcopy
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src/music/st-louis-blues/output"
DEST = ROOT / "design-assets/landing"
DEST.mkdir(parents=True, exist_ok=True)

# Measures 50–61: a complete 12-bar phrase, resolving to G before returning to G.
START, END, QPM = 96.75, 120.75, 120
source = json.loads((SOURCE / "tune.ns.json").read_text())
notes = [dict(n, startTime=round(n["startTime"] - START, 6),
              endTime=round(min(n["endTime"], END) - START, 6))
         for n in source["notes"] if START <= n["startTime"] < END]
assert notes and notes[0]["pitch"] == notes[-1]["pitch"] == 67
sequence = {"notes": notes, "totalTime": END - START,
            "tempos": [{"time": 0, "qpm": QPM}],
            "timeSignatures": [{"time": 0, "numerator": 4, "denominator": 4}]}
(DEST / "st-louis-blues-loop.ns.json").write_text(json.dumps(sequence, indent=2) + "\n")

tree = ET.parse(SOURCE / "tune.xml")
root = tree.getroot()
root.find("work/work-title").text = "St Louis Blues — Practice Loop"
root.find("movement-title").text = "12-bar practice loop"
part = root.find("part")
attributes = deepcopy(part.find("measure/attributes"))
measures = [deepcopy(m) for m in part.findall("measure") if 50 <= int(m.attrib["number"]) <= 61]
assert len(measures) == 12
for measure in list(part):
    part.remove(measure)
for index, measure in enumerate(measures, 1):
    measure.attrib = {"number": str(index)}
    for layout in list(measure.findall("print")):
        measure.remove(layout)
    if index == 1:
        measure.insert(0, attributes)
        direction = ET.Element("direction", {"placement": "above"})
        metronome = ET.SubElement(ET.SubElement(direction, "direction-type"), "metronome")
        ET.SubElement(metronome, "beat-unit").text = "quarter"
        ET.SubElement(metronome, "per-minute").text = str(QPM)
        ET.SubElement(direction, "sound", {"tempo": str(QPM)})
        measure.insert(1, direction)
        barline = ET.Element("barline", {"location": "left"})
        ET.SubElement(barline, "repeat", {"direction": "forward"})
        measure.insert(2, barline)
    part.append(measure)
ET.indent(tree, space="  ")
tree.write(DEST / "st-louis-blues-loop.musicxml", encoding="utf-8", xml_declaration=True)
with ZipFile(DEST / "st-louis-blues-loop.mxl", "w", compression=ZIP_DEFLATED) as archive:
    archive.writestr("META-INF/container.xml", '<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>')
    archive.write(DEST / "st-louis-blues-loop.musicxml", "score.musicxml")
(DEST / "st-louis-blues-loop.json").write_text(json.dumps({
    "title": "St Louis Blues", "composer": "W. C. Handy", "sourceMeasures": [50, 61],
    "sourceStartSeconds": START, "sourceEndSeconds": END, "durationSeconds": END - START,
    "bpm": QPM, "bars": 12, "captureMode": "scripted player input in the production practice UI",
    "caption": "St Louis Blues · 12-bar practice loop",
}, indent=2) + "\n")
print(f"Built 12 bars, {len(notes)} notes, {END - START:g} seconds at {QPM} BPM.")
