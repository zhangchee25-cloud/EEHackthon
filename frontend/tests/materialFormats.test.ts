import { describe, expect, it } from 'vitest';
import { MATERIAL_ACCEPT, validateMaterialFile } from '../src/materialFormats';

describe('material upload formats', () => {
  it('allows common text-bearing documents, case insensitive', () => {
    for (const ext of ['pdf', 'DOCX', 'PPTX', 'md', 'markdown', 'txt', 'doc', 'ppt']) {
      expect(validateMaterialFile({ name: `课程期末.${ext}`, size: 100 }, 1024)).toBeNull();
      expect(MATERIAL_ACCEPT).toContain(`.${ext.toLowerCase()}`);
    }
  });
  it('rejects unsupported, empty and oversized uploads before transport', () => {
    expect(validateMaterialFile({ name: 'lecture.pdf.exe', size: 100 }, 1024)).toContain('请选择');
    expect(validateMaterialFile({ name: 'lecture.md', size: 0 }, 1024)).toContain('非空');
    expect(validateMaterialFile({ name: 'lecture.docx', size: 1025 }, 1024)).toContain('不超过');
    expect(validateMaterialFile({ name: 'lecture.pptx', size: 1024 }, 1024)).toBeNull();
  });
});
