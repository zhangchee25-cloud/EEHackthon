import { writeFileSync, mkdirSync } from 'node:fs';
export function createTestPdf() {
  const pages = [
    ['Capacitors: a short learning note', 'Page 1 - Charge and voltage', 'A capacitor stores charge on two separated conductors.', 'Capacitance is the ratio of stored charge to voltage: C = Q / V.'],
    ['Energy stored in a capacitor', 'Page 2 - Energy', 'Energy is stored in the electric field.', 'The stored energy is U = 1/2 C V^2.', 'Increasing the voltage requires more work for each added charge.'],
    ['Practice and limits', 'Page 3 - Practice', 'At fixed capacitance, doubling voltage quadruples stored energy.', 'This note does not discuss quantum computing or battery chemistry.'],
  ];
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R] /Count 3 >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  for (let i = 0; i < pages.length; i++) {
    const content = 'BT /F1 16 Tf 55 750 Td ' + pages[i].map((text, n) => `${n ? '0 -45 Td ' : ''}(${text.replace(/[()\\]/g, '\\$&')}) Tj`).join('\n') + ' ET';
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`, `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('') + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf);
}
if (process.argv[1]?.endsWith('create-test-pdf.mjs')) {
  const dir = new URL('../../docs/acceptance/', import.meta.url); mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('capacitors-self-authored.pdf', dir), createTestPdf());
  console.log('Created docs/acceptance/capacitors-self-authored.pdf (3 pages, self-authored)');
}
