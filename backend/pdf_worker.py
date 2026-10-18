"""Run PDF extraction in a disposable process with a parent-enforced timeout."""
import json
from pathlib import Path
import sys


def extract(path, max_pages):
    from pypdf import PdfReader
    reader = PdfReader(path, strict=False)
    if reader.is_encrypted:
        return {"error": "PDF_ENCRYPTED", "message": "不支持加密 PDF，请上传无需密码的文本 PDF。"}
    count = len(reader.pages)
    if not 1 <= count <= max_pages:
        return {"error": "PDF_PAGE_LIMIT", "message": f"PDF 必须为 1–{max_pages} 页，请缩小材料。"}
    pages, warnings, total = [], [], 0
    for index, page in enumerate(reader.pages, 1):
        try:
            text = (page.extract_text() or "").replace(chr(0), "").strip()
        except Exception:
            text = ""
            warnings.append(f"文件第 {index} 页文字提取失败，本页未进入问答上下文。")
        if not text:
            warnings.append(f"文件第 {index} 页没有可提取文字；不支持扫描件、图片或公式识别。")
        total += len(text)
        if total > 300000:
            return {"error": "PDF_TEXT_LIMIT", "message": "PDF 提取文字过多，请拆分为更小的材料。"}
        pages.append({"page": index, "text": text})
    if not any(p["text"] for p in pages):
        return {"error": "PDF_NO_TEXT", "message": "没有可提取文字，可能是扫描件或图片 PDF。请上传文本 PDF。"}
    return {"pages": pages, "warnings": warnings}


if __name__ == "__main__":
    try:
        result = extract(Path(sys.argv[1]), int(sys.argv[2]))
    except Exception:
        result = {"error": "PDF_INVALID", "message": "PDF 已损坏或无法解析，请重新导出文本 PDF 后上传。"}
    print(json.dumps(result, ensure_ascii=True))

