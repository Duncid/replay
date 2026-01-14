from __future__ import annotations

import zipfile
from pathlib import Path
from xml.etree import ElementTree


class MxlError(RuntimeError):
    pass


def _find_rootfile(zf: zipfile.ZipFile) -> str:
    try:
        container = zf.read("META-INF/container.xml")
    except KeyError as exc:
        raise MxlError("Missing META-INF/container.xml in MXL archive") from exc
    root = ElementTree.fromstring(container)
    for elem in root.iter():
        if elem.tag.endswith("rootfile") and "full-path" in elem.attrib:
            return elem.attrib["full-path"]
    raise MxlError("Unable to locate rootfile in container.xml")


def unpack_mxl(mxl_path: Path, xml_path: Path) -> Path:
    if xml_path.exists():
        return xml_path
    if not mxl_path.exists():
        raise FileNotFoundError(f"Missing MusicXML file: {mxl_path}")
    with zipfile.ZipFile(mxl_path, "r") as zf:
        rootfile = _find_rootfile(zf)
        try:
            data = zf.read(rootfile)
        except KeyError as exc:
            raise MxlError(f"Rootfile {rootfile} missing in archive") from exc
    xml_path.write_bytes(data)
    return xml_path
