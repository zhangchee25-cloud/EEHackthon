export const MATERIAL_ACCEPT = '.pdf,.docx,.pptx,.md,.markdown,.txt,.doc,.ppt';

export function validateMaterialFile(file: Pick<File, 'name' | 'size'>, maxBytes: number): string | null {
  if (!/\.(pdf|docx|pptx|md|markdown|txt|doc|ppt)$/i.test(file.name)) {
    return '请选择 PDF、Word（DOCX）、PPT（PPTX）、Markdown 或 TXT 文件。旧 DOC / PPT 需后端安装 LibreOffice，或先另存为 DOCX / PPTX。';
  }
  if (file.size === 0 || file.size > maxBytes) return `请选择非空且不超过 ${maxBytes / 1024 / 1024} MB 的材料。`;
  return null;
}
