"""Self-authored fixtures: exam evidence isolation, validation and persistence."""
from copy import deepcopy
from dataclasses import replace
import json
import threading
import urllib.request
import unittest
from unittest.mock import patch

from backend.tests import test_courses
from backend.tests.fixtures import make_pdf
from backend.server import create_server
from backend.service import WorkspaceService


class ExamModel:
    def __init__(self):
        self.calls = 0
        self.tamper = None

    def generate(self, question, chunks, system_prompt=None):
        self.calls += 1
        def refs(role):
            return [{'segmentId': c['segmentId'], 'quote': c['text'][:30]} for c in chunks if c['role'] == role][:1]
        output = {'topics': [{'title': 'Additivity', 'analysis': 'The question tests additivity.', 'examSources': refs('exam'), 'knowledgeSources': refs('knowledge')}], 'practice': [{'topicIndex': 0, 'question': 'Given T(x)=2x, check additivity.', 'hint': 'Compare T(a+b) with T(a)+T(b).', 'answer': '2(a+b)=2a+2b, so it is additive.'}], 'limitations': []}
        if self.tamper: self.tamper(output)
        return deepcopy(output), {}


class ExamTests(unittest.TestCase):
    setUp = test_courses.CourseTests.setUp
    tearDown = test_courses.CourseTests.tearDown
    wait = test_courses.CourseTests.wait
    imported = test_courses.CourseTests.imported
    error = test_courses.CourseTests.error

    def prepare(self):
        self.imported()
        mats = self.c.repo.materials(self.cid)
        self.mid = mats[0]['materialId']
        self.c.exams.register(self.cid, {'materialId': self.mid, 'year': '2024', 'examType': 'final'})
        self.w.model = self.model = ExamModel()
        return {'requestId': 'exam-test', 'examMaterialIds': [self.mid], 'practiceCount': 1}

    def test_report_evidence_and_idempotent_restart(self):
        body = self.prepare()
        report = self.c.exams.analyze(self.cid, body)
        self.assertEqual(report, self.c.exams.analyze(self.cid, body))
        self.assertEqual(self.model.calls, 1)
        self.assertEqual(report['topics'][0]['examRefs'][0]['materialId'], self.mid)
        self.assertNotEqual(report['topics'][0]['knowledgeRefs'][0]['materialId'], self.mid)
        self.assertEqual(report['practice'][0]['topicId'], report['topics'][0]['id'])
        self.assertNotIn(self.mid, [m['materialId'] for m in self.c.materials(self.cid)['materials']])
        restored = WorkspaceService(self.config, self.model)
        try:
            self.assertEqual(restored.courses.exams.listing(self.cid)['reports'], [report])
            self.assertEqual(restored.courses.exams.analyze(self.cid, body), report)
        finally: restored.courses.close()
        self.error('REQUEST_ID_CONFLICT', self.c.exams.analyze, self.cid, {**body, 'instruction': 'different'})

    def test_foreign_scope_and_role_swapped_citations_rejected(self):
        body = self.prepare()
        other = self.c.repo.upsert_course('other', 'other', 'other')['courseId']
        self.error('INVALID_SCOPE', self.c.exams.register, other, {'materialId': self.mid, 'examType': 'midterm'})
        self.error('INVALID_SCOPE', self.c.exams.analyze, other, body)
        self.model.tamper = lambda o: o['topics'][0].update(knowledgeSources=o['topics'][0]['examSources'])
        self.error('INVALID_CITATION', self.c.exams.analyze, self.cid, body)
        self.assertEqual(self.c.exams.listing(self.cid)['reports'], [])
        self.model.tamper = lambda o: o['topics'][0]['examSources'][0].update(quote='fabricated source')
        self.error('INVALID_CITATION', self.c.exams.analyze, self.cid, body)

    def test_missing_lectures_bad_practice_and_request_validation(self):
        body = self.prepare()
        for m in self.c.repo.materials(self.cid):
            self.c.exams.register(self.cid, {'materialId': m['materialId'], 'examType': 'midterm'})
        result = self.c.exams.analyze(self.cid, body)
        self.assertFalse(result['topics'][0]['knowledgeRefs'])
        self.assertIn('未找到讲义依据', result['topics'][0]['analysis'])
        self.model.tamper = lambda o: o['practice'][0].update(topicIndex=40)
        self.error('INVALID_EXAM_ANALYSIS', self.c.exams.analyze, self.cid, {**body, 'requestId': 'bad'})
        self.error('INVALID_INPUT', self.c.exams.analyze, self.cid, {**body, 'practiceCount': True})
        self.error('INVALID_SCOPE', self.c.exams.analyze, self.cid, {**body, 'examMaterialIds': [self.mid, self.mid]})

    def test_http_course_upload_register_analyze(self):
        self.w.model = ExamModel()
        server = create_server(self.config, self.w, port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            base = f'http://127.0.0.1:{server.server_port}/api/courses/{self.cid}'
            boundary = 'exam-test-boundary'
            payload = b'--'+boundary.encode()+b'\r\nContent-Disposition: form-data; name="file"; filename="2024-final.pdf"\r\nContent-Type: application/pdf\r\n\r\n'+make_pdf(['Given T(x)=2x, prove additivity.'])+b'\r\n--'+boundary.encode()+b'--\r\n'
            req = urllib.request.Request(base+'/materials', data=payload, headers={'Content-Type': 'multipart/form-data; boundary='+boundary})
            with urllib.request.urlopen(req) as res: material = json.load(res)
            def post(path, data):
                req = urllib.request.Request(base+path, data=json.dumps(data).encode(), headers={'Content-Type':'application/json'})
                with urllib.request.urlopen(req) as res: return json.load(res)
            result = post('/exams', {'materialId': material['materialId'], 'year':'2024', 'examType':'final'})
            self.assertEqual(len(result['exams']), 1)
            report = post('/exams/analyze', {'requestId':'http-report', 'examMaterialIds':[material['materialId']], 'practiceCount':1})
            with urllib.request.urlopen(base+'/exams') as res: self.assertEqual(json.load(res)['reports'], [report])
        finally:
            server.shutdown(); server.server_close(); thread.join(timeout=3)

    def test_no_papers_and_unrecognized_questions(self):
        body = self.prepare()
        self.error('INVALID_SCOPE', self.c.exams.analyze, self.cid, {**body, 'examMaterialIds': []})
        self.error('INVALID_SCOPE', self.c.exams.analyze, self.cid, {**body, 'examMaterialIds': ['missing']})
        self.assertEqual(self.model.calls, 0)
        self.model.tamper = lambda o: o.update(topics=[], practice=[], limitations=['No recognizable questions in the excerpt.'])
        report = self.c.exams.analyze(self.cid, body)
        self.assertEqual(report['topics'], [])
        self.assertEqual(report['practice'], [])
        self.assertIn('No recognizable questions in the excerpt.', report['limitations'])

    def test_budget_covers_multiple_papers_and_discloses_sampling(self):
        body = self.prepare()
        mids = [m['materialId'] for m in self.c.repo.materials(self.cid)]
        for mid in mids:
            self.c.exams.register(self.cid, {'materialId': mid, 'examType': 'final'})
        captured = []
        generate = self.model.generate
        def capture(question, chunks, system_prompt=None):
            captured.extend(chunks)
            return generate(question, chunks, system_prompt)
        original_chunks = self.c.repo.chunks
        def many_chunks(material):
            first = original_chunks(material)[0]
            return [dict(first, segmentId=first['segmentId'] + '_part_' + str(i)) for i in range(50)]
        self.w.config = replace(self.w.config, max_context_chars=2200)
        with patch.object(self.c.repo, 'chunks', side_effect=many_chunks), patch.object(self.model, 'generate', side_effect=capture):
            report = self.c.exams.analyze(self.cid, {**body, 'examMaterialIds': mids})
        self.assertEqual({c['materialId'] for c in captured if c['role'] == 'exam'}, set(mids))
        self.assertLessEqual(len(json.dumps(captured, ensure_ascii=False)), 2200)
        self.assertTrue(any('代表片段' in text for text in report['limitations']))
        self.w.config = replace(self.w.config, max_context_chars=20)
        self.error('EXAM_CONTEXT_TOO_SMALL', self.c.exams.analyze, self.cid, {**body, 'requestId': 'tiny', 'examMaterialIds': mids})
        self.assertEqual(self.model.calls, 1)

    def test_invalid_model_shapes_and_practice_never_persist(self):
        body = self.prepare()
        for index, malformed in enumerate([None, [], 'not-json-object']):
            with patch.object(self.model, 'generate', return_value=(malformed, {})):
                self.error('INVALID_EXAM_ANALYSIS', self.c.exams.analyze, self.cid, {**body, 'requestId': 'shape_' + str(index)})
        mutations = [
            lambda o: o['practice'][0].update(topicIndex=True),
            lambda o: o['practice'][0].update(question=''),
            lambda o: o['practice'][0].update(answer=' '),
            lambda o: o['practice'].append(deepcopy(o['practice'][0])),
            lambda o: o.update(topics=[], limitations=['No questions']),
            lambda o: o['topics'][0].update(examSources=[]),
        ]
        for index, mutate in enumerate(mutations):
            self.model.tamper = mutate
            self.error('INVALID_EXAM_ANALYSIS', self.c.exams.analyze, self.cid, {**body, 'requestId': 'invalid_' + str(index)})
        self.assertEqual(self.c.exams.listing(self.cid)['reports'], [])
        self.assertFalse(self.w.ask_lock.locked())


if __name__ == '__main__': unittest.main()
