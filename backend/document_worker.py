"""Extract local documents and create a readable PDF without external services."""
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tempfile
import textwrap
import xml.etree.ElementTree as ET
import zipfile

SUPPORTED_EXTENSIONS = {'.pdf', '.docx', '.pptx', '.md', '.markdown', '.txt', '.doc', '.ppt'}
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
P = '{http://schemas.openxmlformats.org/presentationml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'


def office_xml(archive, name):
    data = archive.read(name)
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise ValueError('XML entities are not supported')
    return ET.fromstring(data)


def paragraph_text(element, namespace):
    result = []
    for node in element.iter():
        if node.tag == namespace + 't':
            result.append(node.text or '')
        elif node.tag in (namespace + 'br', namespace + 'cr'):
            result.append('\n')
        elif node.tag == namespace + 'tab':
            result.append('    ')
    return ''.join(result)


def text_pages(text):
    # A stable local reading edition: the same page units feed citations and PDF.
    lines = []
    for line in text.replace('\x00', '').splitlines():
        lines.extend(textwrap.wrap(line, width=44, replace_whitespace=False, drop_whitespace=False) or [''])
    return [{'page': i // 42 + 1, 'text': '\n'.join(lines[i:i + 42])} for i in range(0, len(lines), 42)]


def office_pages(path):
    with zipfile.ZipFile(path) as archive:
        if sum(item.file_size for item in archive.infolist()) > 200 * 1024 * 1024:
            raise ValueError('Document expands beyond 200 MB')
        if path.suffix.lower() == '.docx':
            root = office_xml(archive, 'word/document.xml')
            text = '\n'.join(paragraph_text(p, W) for p in root.iter(W + 'p'))
            return text_pages(text)
        presentation = office_xml(archive, 'ppt/presentation.xml')
        relationships = office_xml(archive, 'ppt/_rels/presentation.xml.rels')
        targets = {r.attrib['Id']: r.attrib['Target'] for r in relationships if r.attrib.get('TargetMode') != 'External'}
        pages = []
        for slide in presentation.iter(P + 'sldId'):
            target = targets[slide.attrib[R + 'id']]
            name = target.lstrip('/') if target.startswith('/') else str(PurePosixPath('ppt') / target)
            if '..' in PurePosixPath(name).parts:
                raise ValueError('Invalid slide relationship')
            root = office_xml(archive, name)
            text = '\n'.join(paragraph_text(p, A) for p in root.iter(A + 'p'))
            pages.append({'page': len(pages) + 1, 'text': text.strip()})
        return pages


def render_pdf(pages, destination):
    from reportlab.pdfgen import canvas
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
    pdf = canvas.Canvas(str(destination))
    for page in pages:
        lines = []
        for line in page['text'].splitlines():
            lines.extend(textwrap.wrap(line, width=44, replace_whitespace=False, drop_whitespace=False) or [''])
        # Long slides get a tall page rather than losing text or changing slide numbers.
        height = max(842, 90 + len(lines) * 17)
        pdf.setPageSize((595, height))
        pdf.setFont('STSong-Light', 11)
        pdf.drawString(40, height - 30, f"文字阅读版 · 第 {page['page']} 页")
        for index, line in enumerate(lines):
            pdf.drawString(40, height - 65 - index * 17, line)
        pdf.showPage()
    pdf.save()


def libreoffice():
    candidate = shutil.which('soffice') or shutil.which('libreoffice')
    if candidate:
        return candidate
    for base in (os.environ.get('ProgramFiles', ''), os.environ.get('ProgramFiles(x86)', '')):
        path = Path(base) / 'LibreOffice/program/soffice.exe'
        if base and path.is_file():
            return str(path)
    return None


def extract(path, output):
    try:
        from .pdf_worker import extract as extract_pdf
    except ImportError:
        from pdf_worker import extract as extract_pdf
    suffix = path.suffix.lower()
    if suffix == '.pdf':
        return extract_pdf(path)
    if suffix in ('.doc', '.ppt'):
        executable = libreoffice()
        if not executable:
            return {'error': 'LEGACY_OFFICE_UNSUPPORTED', 'message': '旧版 DOC/PPT 需要本机安装 LibreOffice；请另存为 DOCX/PPTX 或 PDF 后上传。'}
        with tempfile.TemporaryDirectory(prefix='learning-document-') as folder:
            root = Path(folder)
            subprocess.run([executable, '-env:UserInstallation=' + (root / 'profile').as_uri(), '--headless', '--convert-to', 'pdf', '--outdir', str(root), str(path)],
                           capture_output=True, timeout=50, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), check=True)
            converted = root / (path.stem + '.pdf')
            result = extract_pdf(converted)
            if 'error' not in result:
                shutil.copyfile(converted, output)
                result['warnings'].append('旧版 Office 已在本机转换为 PDF，引用页码以转换后的阅读版为准。')
            return result
    if suffix in ('.docx', '.pptx'):
        pages = office_pages(path)
    else:
        raw = path.read_bytes()
        try:
            text = raw.decode('utf-8-sig')
        except UnicodeDecodeError:
            try:
                text = raw.decode('utf-16') if raw.startswith((b'\xff\xfe', b'\xfe\xff')) else raw.decode('gb18030')
            except UnicodeError:
                return {'error': 'TEXT_ENCODING_UNSUPPORTED', 'message': '文本编码无法识别，请保存为 UTF-8 后上传。'}
        if '\x00' in text or any(ord(char) < 32 and char not in '\t\n\r\f' for char in text):
            return {'error': 'DOCUMENT_INVALID', 'message': '文件包含二进制内容，请上传真正的文本文件。'}
        pages = text_pages(text)
    if not any(page['text'].strip() for page in pages):
        return {'error': 'DOCUMENT_NO_TEXT', 'message': '文档没有可提取文字；图片、扫描件和公式识别暂不支持。'}
    warnings = ['此文件展示为文字阅读版，图片、图表、公式和原始排版未完整保留；请结合原件核对。']
    warnings.append('引用页码对应原始幻灯片序号。' if suffix == '.pptx' else '引用页码对应本应用生成的文字阅读版，不是原文件打印页码。')
    warnings.extend(f"第 {page['page']} 页没有可提取文字，未进入问答上下文。" for page in pages if not page['text'].strip())
    render_pdf(pages, output)
    return {'pages': pages, 'warnings': warnings}


if __name__ == '__main__':
    try:
        result = extract(Path(sys.argv[1]), Path(sys.argv[2]))
    except Exception:
        result = {'error': 'DOCUMENT_INVALID', 'message': '文档损坏、格式不匹配或无法解析，请重新导出后上传。'}
    print(json.dumps(result, ensure_ascii=True))
