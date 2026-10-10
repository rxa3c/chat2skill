from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import deepseek_harness_adapter


class DeepSeekHarnessAdapterTests(unittest.TestCase):
    def test_normalize_messages_rejects_non_list_inputs(self):
        for value in (None, "not a list", {"role": "user", "content": "hello"}, ()): 
            with self.subTest(value=value):
                self.assertEqual(deepseek_harness_adapter.normalize_messages(value), [])

    def test_normalize_messages_keeps_valid_unicode_messages_and_filters_invalid_items(self):
        value = [
            {"role": "user", "content": "こんにちは 🌍"},
            {"role": "assistant", "content": "Привет"},
            {"role": "user", "content": ""},
            {"role": "", "content": "missing role"},
            {"role": "system", "content": "unsupported role"},
            {"role": "user"},
            "not a message",
        ]

        self.assertEqual(
            deepseek_harness_adapter.normalize_messages(value),
            [
                {"role": "user", "content": "こんにちは 🌍"},
                {"role": "assistant", "content": "Привет"},
            ],
        )

    def test_retrieve_exposes_recall_and_instructions_separately(self):
        materialization = {
            "materialization_id": "mat-1",
            "prompt_contexts": {
                "recall": "## Relevant Project Memories\n- Related memory",
                "instructions": "## Project Skill\n- Follow the project rule",
            },
        }
        with patch.object(deepseek_harness_adapter, "reset_guard_state"):
            with patch.object(
                deepseek_harness_adapter,
                "retrieve_prompt_context",
                return_value=("legacy context", materialization),
            ):
                result = deepseek_harness_adapter.retrieve(
                    {"project_dir": "/repo/project", "prompt": "current task"},
                    {},
                )

        self.assertEqual(result["context"], "legacy context")
        self.assertEqual(result["recall_context"], "## Relevant Project Memories\n- Related memory")
        self.assertEqual(result["instructions_context"], "## Project Skill\n- Follow the project rule")
        self.assertEqual(result["materialization_id"], "mat-1")


if __name__ == "__main__":
    unittest.main()
