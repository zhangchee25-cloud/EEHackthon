"""Real local parser/preview tests; no model requests or private documents."""
from io import BytesIO
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from pypdf import PdfReader
from backend.config import Config
from backend.document_worker import extract
from backend.errors import AppError
from backend.service import WorkspaceService


def package(entries):
    stream = BytesIO()
    with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, value in entries.items():
            archive.writestr(name, value)
    return stream.getvalue()


def docx():
    return package({'[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>期中考试：线性系统满足叠加性。</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>表格知识：傅里叶变换</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'})


def pptx():
    # Intentionally reverse numeric filenames: ordering must come from the presentation.
    slide = '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>{}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
    return package({'[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
        'ppt/presentation.xml': '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>',
        'ppt/_rels/presentation.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>',
        'ppt/slides/slide1.xml': slide.format('第二张：频率响应'), 'ppt/slides/slide2.xml': slide.format('第一张：卷积定理')})


class DocumentFormatsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.service = WorkspaceService(Config(data_dir=Path(self.temp.name)))

    def tearDown(self):
        self.temp.cleanup()

    def check_upload(self, name, content, expected):
        result = self.service.upload(name, content)
        self.assertEqual(result['status'], 'ready')
        material = self.service.store.material(result['materialId'])
        text = '\n'.join(p['text'] for p in material['pages'])
        self.assertIn(expected, text)
        preview, _ = self.service.file(result['materialId'])
        self.assertEqual(len(PdfReader(preview).pages), result['pageCount'])
        original = self.service.store.files_dir / (result['materialId'] + '.original' + Path(name).suffix.lower())
        self.assertEqual(original.read_bytes(), content)
        self.assertTrue(result['warnings'])
        self.assertTrue(self.service.upload(name, content)['deduplicated'])
        restarted = WorkspaceService(self.service.config)
        self.assertEqual(restarted.file(result['materialId'])[0], preview)
        return material

    def test_docx_paragraphs_and_tables(self):
        result = self.check_upload('期中试卷.DOCX', docx(), '线性系统满足叠加性')
        self.assertIn('傅里叶变换', result['pages'][0]['text'])

    def test_pptx_preserves_presentation_order(self):
        result = self.check_upload('课件.pptx', pptx(), '卷积定理')
        self.assertEqual(result['pageCount'], 2)
        self.assertIn('第一张', result['pages'][0]['text'])
        self.assertIn('第二张', result['pages'][1]['text'])

    def test_markdown_and_plaintext_encodings(self):
        self.check_upload('知识.md', '# 傅里叶变换\n\n- 线性系统'.encode('utf-8'), '傅里叶变换')
        self.check_upload('知识.markdown', '# 期末复习'.encode('utf-8-sig'), '期末复习')
        self.check_upload('知识.txt', '信号分析\n时域频域'.encode('gb18030'), '时域频域')
        self.check_upload('知识2.txt', '测试编码'.encode('utf-16'), '测试编码')

    def test_long_text_page_numbers_match_pdf(self):
        result = self.check_upload('长文.txt', '\n'.join('段落 %d 内容' % i for i in range(100)).encode(), '段落 99 内容')
        self.assertEqual(result['pageCount'], 3)
        self.assertEqual([p['page'] for p in result['pages']], [1, 2, 3])

    def test_invalid_binary_empty_and_legacy_documents(self):
        for name, data in [('bad.docx', b'not a zip'), ('bad.pptx', b'%PDF-1.7'), ('bad.txt', b'\x00\x01binary'), ('blank.md', b'   \n')]:
            with self.assertRaises(AppError):
                self.service.upload(name, data)
        path = Path(self.temp.name) / 'old.doc'
        path.write_bytes(b'legacy fixture')
        with patch('backend.document_worker.libreoffice', return_value=None):
            self.assertEqual(extract(path, path.with_suffix('.pdf'))['error'], 'LEGACY_OFFICE_UNSUPPORTED')
        self.assertTrue(all(m['status'] == 'failed' for m in self.service.store.list_materials()))


if __name__ == '__main__':
    unittest.main()
