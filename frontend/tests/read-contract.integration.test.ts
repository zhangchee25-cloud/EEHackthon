import { afterAll, describe, expect, it } from 'vitest';
import { api } from '../src/api';
const base = process.env.STUDY_READ_URL;
const nativeFetch = globalThis.fetch;
if (base) globalThis.fetch = (input, init) => nativeFetch(new URL(String(input), base), init);
afterAll(() => { globalThis.fetch = nativeFetch; });
describe.skipIf(!base)('read-only real backend frontend contract', () => {
  it('accepts school, material, state and board responses without modifying data', async () => {
    expect((await api.getState()).revision).toBeGreaterThanOrEqual(0);
    expect((await api.learnStatus()).status).toBe('connected');
    const { semesters } = await api.semesters();
    expect(semesters.length).toBeGreaterThan(0);
    const { courses } = await api.courses(semesters[0].id);
    expect(courses.length).toBeGreaterThan(0);
    const course = courses.find(c => c.name.includes('电路')) || courses[0];
    const catalogue = await api.files(course.courseId);
    expect(catalogue.files.every(f => f.courseId === course.courseId)).toBe(true);
    const library = await api.courseMaterials(course.courseId);
    expect(library.course.courseId).toBe(course.courseId);
    for (const material of library.materials) expect((await api.material(material.materialId)).versionId).toBe(material.versionId);
    expect((await api.getBoard(course.courseId)).courseId).toBe(course.courseId);
    expect((await api.imports(course.courseId)).batches.every(b => b.courseId === course.courseId)).toBe(true);
  }, 90000);
});
