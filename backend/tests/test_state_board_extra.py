from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import threading
import unittest

from backend.config import Config
from backend.errors import AppError
from backend.service import WorkspaceService, identifier, text_field


class StateBoardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.config = Config(data_dir=Path(self.tmp.name))
        self.w = WorkspaceService(self.config)
        self.repo = self.w.courses.repo
        self.cid = self.repo.upsert_course("term", "one", "课程一")["courseId"]
        self.other = self.repo.upsert_course("term", "two", "课程二")["courseId"]

    def tearDown(self):
        self.w.courses.close()
        self.tmp.cleanup()

    def save_cards(self):
        state = self.w.store.state()
        state["cards"] = [{"id": "card1", "courseId": self.cid, "title": "理解", "body": "本人理解",
                           "sourceRefs": [], "reviewStatus": "to_review"},
                          {"id": "card2", "courseId": self.cid, "title": "推论", "body": "本人推论",
                           "sourceRefs": [], "reviewStatus": "to_review"}]
        return self.w.save_state(state)

    def board(self):
        result = self.repo.board(self.cid)
        result.update(nodes=[{"id": "n1", "cardId": "card1", "x": 1, "y": 2},
                             {"id": "n2", "cardId": "card2", "x": 3, "y": 4}],
                      edges=[{"id": "e1", "source": "n1", "target": "n2", "label": "推导"}])
        return result

    def write_board(self, body):
        return self.repo.save_board(self.cid, body, identifier, text_field)

    def error(self, code, fn, *args):
        with self.assertRaises(AppError) as caught:
            fn(*args)
        self.assertEqual(caught.exception.code, code)
        return caught.exception

    def test_board_bad_types_never_escape_as_runtime_errors(self):
        self.save_cards()
        for body in (None, [], "bad", 5, {"revision": True}):
            with self.subTest(body=body):
                self.error("REVISION_REQUIRED", self.write_board, body)
        for path, bad, code in [(('nodes', 'cardId'), [], "INVALID_BOARD_CARD"),
                                (('nodes', 'x'), 10 ** 400, "INVALID_BOARD"),
                                (('nodes', 'x'), float('inf'), "INVALID_BOARD"),
                                (('nodes', 'y'), True, "INVALID_BOARD"),
                                (('edges', 'source'), {}, "INVALID_BOARD_EDGE"),
                                (('edges', 'target'), [], "INVALID_BOARD_EDGE")]:
            body = self.board()
            body[path[0]][0][path[1]] = bad
            with self.subTest(path=path, bad=bad):
                self.error(code, self.write_board, body)
        self.assertEqual(self.repo.board(self.cid)["revision"], 0)

    def test_concurrent_board_revision_has_exactly_one_winner(self):
        self.save_cards()
        barrier = threading.Barrier(2)
        # Each worker must use the same initial revision even if its read occurs
        # after the other writer finishes.
        body = self.board()
        def same_revision():
            barrier.wait(timeout=5)
            try:
                return self.write_board(deepcopy(body))
            except AppError as exc:
                return exc.code
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: same_revision(), range(2)))
        self.assertEqual(sum(isinstance(r, dict) for r in results), 1)
        self.assertEqual(results.count("BOARD_CONFLICT"), 1)
        self.assertEqual(self.repo.board(self.cid)["revision"], 1)

    def test_card_deletion_prunes_board_and_conflicts_old_draft(self):
        state = self.save_cards()
        board = self.write_board(self.board())
        state["cards"] = state["cards"][1:]
        self.w.save_state(state)
        updated = self.repo.board(self.cid)
        self.assertEqual(updated["revision"], board["revision"] + 1)
        self.assertEqual([n["id"] for n in updated["nodes"]], ["n2"])
        self.assertEqual(updated["edges"], [])
        self.error("BOARD_CONFLICT", self.write_board, board)

    def test_card_move_prunes_only_affected_board(self):
        state = self.save_cards()
        board = self.write_board(self.board())
        state["cards"][0]["courseId"] = self.other
        state = self.w.save_state(state)
        self.assertEqual(self.repo.board(self.cid)["revision"], board["revision"] + 1)
        self.assertEqual(self.repo.board(self.cid)["edges"], [])
        self.w.save_state(state)
        self.assertEqual(self.repo.board(self.cid)["revision"], board["revision"] + 1)

    def test_body_edit_resets_check_and_ignores_client_timestamps(self):
        state = self.save_cards()
        state["cards"][0].update(reviewStatus="self_checked", selfCheckedAt="forged", createdAt="forged")
        state = self.w.save_state(state)
        self.assertNotEqual(state["cards"][0]["selfCheckedAt"], "forged")
        self.assertNotEqual(state["cards"][0]["createdAt"], "forged")
        state["cards"][0].update(body="重新理解", reviewStatus="self_checked")
        changed = self.w.save_state(state)
        self.assertEqual(changed["cards"][0]["reviewStatus"], "to_review")
        self.assertIsNone(changed["cards"][0]["selfCheckedAt"])
        self.error("STATE_CONFLICT", self.w.save_state, state)

    def test_legacy_state_migration_preserves_all_card_data(self):
        state = self.save_cards()
        state.pop("activeCourseId")
        for card in state["cards"]:
            card.pop("courseId")
        with self.w.store.connect() as db:
            db.execute("UPDATE workspace SET body=? WHERE id=1", (json.dumps(state),))
        restarted = WorkspaceService(self.config)
        try:
            migrated = restarted.store.state()
            self.assertIsNone(migrated.pop("activeCourseId"))
            for card in migrated["cards"]:
                self.assertIsNone(card.pop("courseId"))
            self.assertEqual(migrated, state)
        finally:
            restarted.courses.close()

    def test_course_source_membership_and_source_snapshot_are_enforced(self):
        self.w.store.add_material("mat1", "ver1", "讲义", "digest1")
        self.w.store.finish_material("mat1", [{"page": 1, "text": "可核验的原文。"}], [])
        material = self.w.store.material("mat1")
        self.repo.link(self.cid, "f1", material, "digest1")
        citation = {"id": "cit1", "materialId": "mat1", "versionId": "ver1", "title": "讲义",
                    "pageStart": 1, "pageEnd": 1, "quote": "可核验的原文。"}
        self.w.store.save_answer("ans1", "mat1", "问题", "req1", {"citations": [citation]})
        state = self.save_cards()
        state["cards"][0]["sourceRefs"] = [citation]
        state = self.w.save_state(state)
        changed = deepcopy(state)
        changed["cards"][0]["courseId"] = self.other
        self.error("INVALID_SOURCE", self.w.save_state, changed)
        changed = deepcopy(state)
        changed["cards"][0]["sourceRefs"][0]["quote"] = "篡改的摘录"
        self.error("INVALID_SOURCE", self.w.save_state, changed)
        self.assertEqual(self.w.store.state(), state)


if __name__ == "__main__":
    unittest.main()
