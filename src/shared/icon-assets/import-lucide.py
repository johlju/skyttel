"""Build the pinned catalog from a verified official Lucide source archive."""

import hashlib
import json
from pathlib import Path
import sys
import tarfile
import xml.etree.ElementTree as ET

COMMIT = "f53e5bfff0f909f3f451933538744330650d3ce0"
ARCHIVE_SHA256 = "4c73bf2709fe2140e527fb4fd9abd1f7c62b6d847081e02077cfc6ac32415679"
EXPECTED_COUNT = 1854
TAGS = {"path", "circle", "rect", "line", "ellipse", "polyline", "polygon"}
ATTRIBUTES = {"d", "cx", "cy", "r", "rx", "ry", "x", "y", "width", "height",
              "x1", "x2", "y1", "y2", "fill", "points"}


def main():
    archive_path = Path(sys.argv[1])
    output = Path(__file__).resolve().parent
    if hashlib.sha256(archive_path.read_bytes()).hexdigest() != ARCHIVE_SHA256:
        raise ValueError("The archive does not match the pinned Lucide source")
    catalog = []
    with tarfile.open(archive_path) as archive:
        prefix = f"lucide-{COMMIT}/"
        files = sorted(member.name for member in archive.getmembers()
                       if member.name.startswith(prefix + "icons/")
                       and member.name.endswith(".svg"))
        for name in files:
            root = ET.fromstring(archive.extractfile(name).read())
            if root.attrib.get("viewBox") != "0 0 24 24":
                raise ValueError(f"Unexpected viewBox: {name}")
            nodes = []
            for child in root:
                tag = child.tag.rsplit("}", 1)[-1]
                if tag not in TAGS or set(child.attrib) - ATTRIBUTES or len(child):
                    raise ValueError(f"Unsupported SVG node: {name}")
                nodes.append([tag, child.attrib])
            metadata = json.load(archive.extractfile(name[:-4] + ".json"))
            catalog.append({
                "id": Path(name).stem,
                "tags": metadata.get("tags", []),
                "categories": metadata.get("categories", []),
                "aliases": [alias if isinstance(alias, str) else alias["name"]
                            for alias in metadata.get("aliases", [])],
                "nodes": nodes,
            })
        if len(catalog) != EXPECTED_COUNT:
            raise ValueError(f"Expected {EXPECTED_COUNT} icons, received {len(catalog)}")
        license_bytes = archive.extractfile(prefix + "LICENSE").read()
    (output / "lucide-icons.json").write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    (output / "LICENSE-lucide.txt").write_bytes(license_bytes)
    print(f"Generated {len(catalog)} icons and copied the complete upstream license")


if __name__ == "__main__":
    main()
