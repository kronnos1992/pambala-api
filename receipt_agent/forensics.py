"""Forense de imagem para deteção de manipulação/adulteração.

Sinais analisados (todos heurísticos e defensáveis):
  - hash SHA-256 do ficheiro (prova de tamper-stop / identidade);
  - assinatura (magic bytes) vs extensão (evita reclassificação de tipo);
  - metadata EXIF/XMP: câmara, software de edição, presença de EXIF;
  - Error Level Analysis (ELA): regiões recomprimidas em qualidade diferente
    indicam zonas editadas/coladas de outra imagem;
  - deteção de screenshot/print ecrã: gestão de uniformidade + cores únicas
    (prints têm superfícies planas; fotos têm ruído de sensor);

Dependência opcional: Pillow (`pip install pillow`). Sem Pillow, a análise
limita-se a hash + magic bytes + metadata do cabeçalho binário, e o agente
deverá escalar para revisão humana (o `analyze()` sinaliza `FORENSICS_UNAVAILABLE`).
"""
from __future__ import annotations

import hashlib
import io
import re
from pathlib import Path
from typing import Any, Dict, List

from . import config

try:
    from PIL import Image as PILImage

    _HAS_PIL = True
except Exception:  # pragma: no cover - ambiente sem pillow
    PILImage = None
    _HAS_PIL = False


# -- utilitários binários --------------------------------------------------

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


_MAGIC = {
    b"\xff\xd8\xff": "jpeg",
    b"\x89PNG\r\n\x1a\n": "png",
    b"%PDF": "pdf",
    b"II*\x00": "tiff",
    b"MM\x00*": "tiff",
    b"GIF8": "gif",
    b"BM": "bmp",
    b"RIFF": "webp",
}


def detect_magic(path: Path) -> Dict[str, Any]:
    with open(path, "rb") as f:
        head = f.read(32)
    for sig, kind in _MAGIC.items():
        if head.startswith(sig):
            return {"detected": kind, "signature": sig.hex(), "ok": True}
    return {"detected": "unknown", "signature": head[:8].hex(), "ok": False}


def extension_kind(filename: str) -> str:
    ext = Path(filename).suffix.lower().lstrip(".") or ""
    return {
        "jpg": "jpeg", "jpeg": "jpeg",
        "png": "png", "pdf": "pdf",
        "heic": "heic", "heif": "heif",
        "webp": "webp",
    }.get(ext, ext)


# -- metadata --------------------------------------------------------------

_EDITOR_KEYS = {
    0x0131: "software",
    0x0110: "make",       # câmara
    0x010F: "model",      # modelo câmara
    0x0132: "datetime",   # data de captura
    0x010E: "description",
}

_COPYRIGHT = 0x8298
_GPS_IFD = 0x8825


def _exif_tags(exif) -> Dict[str, str]:
    tags: Dict[str, str] = {}
    for tag in (0x0110, 0x010F, 0x0131, 0x0132, 0x010E, _COPYRIGHT):
        try:
            value = exif.get(tag)
        except Exception:
            value = None
        if value is not None:
            tags[_EDITOR_KEYS.get(tag, f"exif:{tag:04x}")] = str(value)
    return tags


def metadata(path: Path) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "has_exif": False,
        "camera": None,
        "software": None,
        "datetime": None,
        "gps": False,
        "dimensions": None,
        "dpi": None,
    }
    if not _HAS_PIL:
        return {**out, "error": "pillow_unavailable"}
    try:
        with PILImage.open(path) as im:
            out["dimensions"] = list(im.size)
            out["dpi"] = im.info.get("dpi")
            exif = im.getexif()
            if hasattr(exif, "get_ifd"):
                gps = exif.get_ifd(_GPS_IFD)
                out["gps"] = bool(gps)
            tags = _exif_tags(exif)
            for k, v in tags.items():
                if k in ("make", "model"):
                    out["camera"] = tags.get("make", "").strip() + " " + tags.get("model", "").strip()
                    out["camera"] = out["camera"].strip() or None
                if k == "software":
                    out["software"] = v.strip() or None
                if k == "datetime":
                    out["datetime"] = v
            out["has_exif"] = bool(tags or im.info.get("exif") or im.info.get("photoshop"))
            # XMP / JPG comments podem conter marcas de editores
            if im.info.get("photoshop"):
                lump = str(im.info["photoshop"]).lower()
                for app in config.EDITOR_SIGNATURES:
                    if app in lump:
                        out["software"] = out["software"] or app
    except Exception as e:  # pragma: no cover
        out["error"] = str(e)
    return out


# -- Error Level Analysis (ELA) --------------------------------------------

def ela(path: Path, quality: int = 92) -> Dict[str, Any]:
    """Deteta regiões editadas comparando erro de recompressão JPEG.

    Re-salva a imagem com a mesma qualidade base e mede o erro por bloco 8x8.
    Regiões que foram editadas num editor e depois re-exportadas tendem a
    apresentar erro de nível significativamente diferente do resto.
    """
    if not _HAS_PIL:
        return {"error": "pillow_unavailable"}
    try:
        with PILImage.open(path) as im:
            if im.mode != "RGB":
                im = im.convert("RGB")
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=quality)
            buf.seek(0)
            with PILImage.open(buf) as re:
                base = re.convert("RGB")
            if im.size != base.size:
                base = base.resize(im.size)
            im_l = im.convert("L")
            base_l = base.convert("L")
            w, h = im_l.size
            px_a = im_l.load()
            px_b = base_l.load()
    except Exception as e:  # pragma: no cover
        return {"error": str(e)}

    block_size = 8
    block_diffs = []
    for by in range(0, h - block_size, block_size):
        for bx in range(0, w - block_size, block_size):
            total = 0.0
            for y in range(by, by + block_size):
                for x in range(bx, bx + block_size):
                    total += abs(px_a[x, y] - px_b[x, y])
            block_diffs.append(total / (block_size * block_size))

    if not block_diffs:
        return {"error": "no_blocks"}
    block_diffs.sort()
    high = [d for d in block_diffs if d >= config.ELA_BLOCK_THRESHOLD]
    suspicious_ratio = round(len(high) / len(block_diffs), 4)
    p95 = block_diffs[int(len(block_diffs) * 0.95)]
    return {
        "max_avg_diff": round(block_diffs[-1], 2),
        "p95_avg_diff": round(p95, 2),
        "suspicious_blocks": len(high),
        "total_blocks": len(block_diffs),
        "suspicious_ratio": suspicious_ratio,
        "edition_signal": suspicious_ratio >= config.ELA_SUSPICIOUS_RATIO,
    }


# -- deteção de screenshot --------------------------------------------------

def detect_screenshot(path: Path) -> Dict[str, Any]:
    """Heurística: prints (screenshots) têm superfícies planas e cores repetidas.

    Fotos tiradas com câmara apresentam ruído de sensor (linhas quase nunca
    adjacentes idênticas), enquanto screenshots têm regiões uniformes grandes.
    """
    if not _HAS_PIL:
        return {"error": "pillow_unavailable"}
    try:
        with PILImage.open(path) as im:
            if im.mode != "L":
                im = im.convert("L")
            w, h = im.size
            sample = im.resize((min(w, 400), min(h, 400)))
            px = sample.load()
            sw, sh = sample.size
    except Exception as e:  # pragma: no cover
        return {"error": str(e)}

    identical_rows = 0
    for y in range(1, sh):
        same = True
        for x in range(sw):
            if px[x, y] != px[x, y - 1]:
                same = False
                break
        if same:
            identical_rows += 1
    uniform_ratio = round(identical_rows / max(1, sh - 1), 4)

    colors = set()
    try:
        with PILImage.open(path) as im:
            w, h = im.size
            q = im.convert("RGB").resize((min(w, 120), min(h, 120)))
            colors = {c for c in q.getdata()}
    except Exception:  # pragma: no cover
        pass
    unique_colors = len(colors)

    score = uniform_ratio
    is_likely = score >= config.SCREENSHOT_UNIFORM_RATIO
    return {
        "uniform_ratio": uniform_ratio,
        "unique_colors_sampled": unique_colors,
        "is_likely_screenshot": is_likely,
    }


# -- análise agregada -------------------------------------------------------

def _pdf_header(path: Path, n: int = 8192) -> Dict[str, Any]:
    """Scan best-effort do cabeçalho PDF (versão/produtor/criador) sem deps."""
    out: Dict[str, Any] = {"version": None, "producer": None, "creator": None}
    try:
        with open(path, "rb") as f:
            head = f.read(n)
    except Exception as e:  # pragma: no cover
        out["error"] = str(e)
        return out
    m = re.match(br"%PDF-(\d+\.\d+)", head)
    if m:
        out["version"] = m.group(1).decode("ascii", "ignore")
    for key in (b"/Producer", b"/Creator"):
        idx = head.find(key)
        if idx == -1:
            continue
        mv = re.match(br"\s*\(([^)]*)\)", head[idx + len(key):])
        if mv:
            out["producer" if key == b"/Producer" else "creator"] = (
                mv.group(1).decode("latin-1", "ignore").strip()
            )
    return out


def analyze(path: Path, filename: str = "") -> Dict[str, Any]:
    """Roda toda a forense e devolve um relatório com flags e sinal."""
    flags: List[str] = []
    reasons: List[str] = []
    signals: Dict[str, Any] = {}

    magic = detect_magic(path)
    signals["magic"] = magic
    ext = extension_kind(filename or path.name)
    if magic["ok"] and ext and ext not in ("heic", "heif", "") and ext != magic["detected"]:
        flags.append("MAGIC_MISMATCH")
        reasons.append(
            f"Extensão {ext!r} não corresponde ao tipo real ({magic['detected']})."
        )

    signals["hash"] = sha256_file(path)

    is_pdf = magic["detected"] == "pdf" or ext == "pdf"
    signals["format"] = "pdf" if is_pdf else "image"
    if is_pdf:
        # PDFs são documentos vetoriais/texto: as heurísticas de imagem
        # (metadata/EXIF, ELA, screenshot, resolução) não se aplicam.
        pdf = _pdf_header(path)
        signals["pdf"] = pdf
        if pdf.get("producer"):
            signals["producer"] = pdf["producer"]
        signals["forensics_available"] = True
        return {
            "flags": flags,
            "reasons": reasons,
            "signals": signals,
        }

    meta = metadata(path)
    signals["metadata"] = meta
    if meta.get("software"):
        sig = meta["software"].lower()
        found = [a for a in config.EDITOR_SIGNATURES if a in sig]
        if found:
            flags.append("EDITOR_METADATA")
            reasons.append(f"Software de edição detetado nos metadados: {', '.join(found)}.")
    if not meta.get("has_exif"):
        flags.append("EXIF_STRIPPED")
        reasons.append(
            "Comprovativo sem metadata EXIF (câmara/software) — comum em ficheiros re-salvos ou screenshots."
        )

    ela_res = ela(path)
    signals["ela"] = ela_res
    if ela_res.get("edition_signal"):
        flags.append("EDITED_REGIONS")
        reasons.append(
            "Regiões com nível de compressão inconsistente (possível edição/colagem)."
        )

    shot = detect_screenshot(path)
    signals["screenshot"] = shot
    if shot.get("is_likely_screenshot"):
        flags.append("SCREENSHOT_LIKE")
        reasons.append(
            "Imagem sem ruído de sensor com superfícies planas — forte indício de screenshot/print."
        )

    dims = meta.get("dimensions")
    if dims:
        signals["dimensions"] = dims
        if min(dims) < config.MIN_IMAGE_SIDE:
            flags.append("LOW_RES")
            reasons.append("Imagem de baixa resolução.")

    signals["forensics_available"] = _HAS_PIL
    if not _HAS_PIL:
        flags.append("FORENSICS_UNAVAILABLE")
        reasons.append("Forense de imagem indisponível (Pillow não instalado).")

    return {
        "flags": flags,
        "reasons": reasons,
        "signals": signals,
    }