import importlib.util
import unittest
from pathlib import Path

source = Path(__file__).resolve().parents[1] / "scripts/check-publish.py"
spec = importlib.util.spec_from_file_location("tactics_publish_gate", source)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
SHA = "a" * 40


def run(**overrides):
    result = {
        "id": 7,
        "run_attempt": 1,
        "head_sha": SHA,
        "head_branch": "main",
        "event": "push",
        "status": "completed",
        "conclusion": "success",
    }
    result.update(overrides)
    return result


class PublishGateTests(unittest.TestCase):
    def test_successful_main_push_authorized(self):
        self.assertEqual(gate.decision({"workflow_runs": [run()]}, SHA), "approved")

    def test_unapproved_workflows_are_blocked(self):
        for value in (
            run(head_sha="b" * 40),
            run(head_branch="site"),
            run(event="workflow_dispatch"),
            run(status="in_progress", conclusion=None),
            run(conclusion="failure"),
            run(conclusion="cancelled"),
        ):
            with self.subTest(value=value):
                self.assertTrue(gate.decision({"workflow_runs": [value]}, SHA).startswith("waiting"))

    def test_latest_failed_rerun_blocks_previous_success(self):
        entries = [run(run_attempt=1), run(run_attempt=2, conclusion="failure")]
        self.assertTrue(gate.decision({"workflow_runs": entries}, SHA).startswith("waiting"))

    def test_absent_ci_blocks(self):
        self.assertTrue(gate.decision({"workflow_runs": []}, SHA).startswith("waiting"))

    def test_invalid_sha_rejected(self):
        with self.assertRaises(ValueError):
            gate.decision({"workflow_runs": []}, "bad")


if __name__ == "__main__":
    unittest.main()
