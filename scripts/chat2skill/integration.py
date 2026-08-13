"""Shared host-integration helpers for prompt retrieval."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from .context_store import context_key
from .memory_client import materialize_for_prompt
from .storage import record_skill_usage, save_project_memory_materialization


def retrieve_prompt_context(
    config: dict,
    project_dir: str,
    scoped_user_id: str,
    prompt: str,
    materializer: Callable[..., dict[str, Any]] | None = None,
) -> tuple[str, dict[str, Any]]:
    """Materialize and persist one model-facing retrieval context.

    Native hook adapters and external agent adapters must record the same
    materialization metadata. Keeping that bookkeeping here prevents a host
    adapter from becoming a second, subtly different retrieval path.
    """
    result = (materializer or materialize_for_prompt)(
        config,
        project_dir,
        prompt,
        scoped_user_id,
    )
    rendered = str(result.get("rendered_text") or "").strip()
    if not rendered:
        return "", result

    context = (
        "## Chat2Skill Memory and Skills\n"
        "Apply this retrieved project memory, recall summary, and relevant skills when they match the current task:\n\n"
        f"{rendered}\n\n"
        f"Materialization ID: {result.get('materialization_id')}"
    )
    included_skills = (result.get("skills") or {}).get("skills_included") or []
    if included_skills:
        record_skill_usage(scoped_user_id, included_skills)
    save_project_memory_materialization(
        scoped_user_id,
        context_key(project_dir),
        {
            "materialization_id": result.get("materialization_id"),
            "memories_included": (result.get("memory") or {}).get("memories_included") or [],
            "skills_included": included_skills,
            "query": prompt,
            "rendered_prompt": context,
            "token_count": result.get("token_count"),
        },
    )
    return context, result
