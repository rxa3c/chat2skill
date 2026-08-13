#!/usr/bin/env python3
"""JSON bridge used by the DeepSeek Harness Chat2Skill adapter.

The Harness plugin stays thin and delegates to the existing local runtime.
This bridge deliberately reuses the same config, storage, extraction, and
response-guard modules as the native hook adapters; it does not add an API
route or a second learning implementation.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from chat2skill import runner
from chat2skill.config import DATA_HOME, load_config
from chat2skill.hookio import project_user_id
from chat2skill.initializer import ensure_user_home
from chat2skill.integration import retrieve_prompt_context
from chat2skill.response_guard import evaluate_stop_payload, reset_guard_state


PROJECT_SKILL_REBUILD_STATUSES = {"saved", "memory_saved"}
TRANSCRIPT_DIR = DATA_HOME / "deepseek-harness-transcripts"


def main() -> int:
    parser = argparse.ArgumentParser(description="Chat2Skill DeepSeek Harness bridge")
    parser.add_argument("--mode", choices=("retrieve", "learn", "guard"), required=True)
    args = parser.parse_args()

    try:
        ensure_user_home(create_db=True)
        payload = json.load(sys.stdin)
        if not isinstance(payload, dict):
            raise ValueError("bridge input must be a JSON object")
        config = load_config()
        if args.mode == "retrieve":
            result = retrieve(payload, config)
        elif args.mode == "learn":
            result = learn(payload, config)
        else:
            result = guard(payload)
        emit({"ok": True, **result})
    except Exception as exc:  # noqa: BLE001 - the host adapter must fail open
        emit(
            {
                "ok": False,
                "error": f"{type(exc).__name__}: {str(exc)[:500]}",
            }
        )
    return 0


def retrieve(payload: dict[str, Any], config: dict) -> dict[str, Any]:
    project_dir = string_value(payload.get("project_dir"))
    prompt = string_value(payload.get("prompt"))
    scoped_user_id = project_user_id(project_dir)
    reset_guard_state(scoped_user_id)
    context, result = retrieve_prompt_context(
        config,
        project_dir,
        scoped_user_id,
        prompt,
    )
    return {
        "context": context,
        "materialization_id": result.get("materialization_id"),
    }


def learn(payload: dict[str, Any], config: dict) -> dict[str, Any]:
    project_dir = string_value(payload.get("project_dir"))
    scoped_user_id = project_user_id(project_dir)
    messages = normalize_messages(payload.get("messages"))
    if len(messages) < 2:
        return {
            "result": {
                "status": "skipped",
                "mode": "unified",
                "reason": "too_few_messages",
            }
        }

    session_id = string_value(payload.get("session_id")) or "unknown-session"
    session_file = write_transcript(session_id, messages)
    try:
        result = runner.run_extraction(
            session_file,
            scoped_user_id,
            config,
            project_dir=project_dir,
        )
        maintenance = None
        maintenance_error = None
        if result.get("status") == "saved":
            try:
                maintenance = runner.run_maintenance(scoped_user_id)
            except Exception as exc:  # noqa: BLE001 - extraction remains durable
                maintenance_error = f"{type(exc).__name__}: {str(exc)[:500]}"

        project_skill_path = None
        project_skill_error = None
        if result.get("status") in PROJECT_SKILL_REBUILD_STATUSES:
            try:
                project_skill_path = runner.rebuild_project_skill(
                    scoped_user_id,
                    config,
                    messages[-30:],
                )
            except Exception as exc:  # noqa: BLE001 - memory is already durable
                project_skill_error = f"{type(exc).__name__}: {str(exc)[:500]}"

        return {
            "result": result,
            "maintenance": maintenance,
            "maintenance_error": maintenance_error,
            "project_skill_path": str(project_skill_path) if project_skill_path else None,
            "project_skill_error": project_skill_error,
        }
    finally:
        session_file.unlink(missing_ok=True)


def guard(payload: dict[str, Any]) -> dict[str, Any]:
    project_dir = string_value(payload.get("project_dir"))
    message = string_value(payload.get("assistant_message"))
    result = evaluate_stop_payload(
        {
            "cwd": project_dir,
            "last_assistant_message": message,
        }
    )
    return asdict(result)


def write_transcript(session_id: str, messages: list[dict[str, str]]) -> Path:
    TRANSCRIPT_DIR.mkdir(parents=True, exist_ok=True)
    safe_id = re.sub(r"[^A-Za-z0-9_.-]+", "-", session_id).strip("-") or "unknown-session"
    path = TRANSCRIPT_DIR / f"{safe_id}.jsonl"
    with path.open("w", encoding="utf-8") as transcript:
        for message in messages:
            transcript.write(
                json.dumps(
                    {
                        "type": "response_item",
                        "payload": message,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
    return path


def normalize_messages(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    messages: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        role = string_value(item.get("role"))
        content = string_value(item.get("content"))
        if role in {"user", "assistant"} and content:
            messages.append({"role": role, "content": content})
    return messages


def string_value(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def emit(value: dict[str, Any]) -> None:
    json.dump(value, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    raise SystemExit(main())
