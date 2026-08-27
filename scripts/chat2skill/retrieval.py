"""Skill retrieval and prompt formatting.

Lightweight SkillRL/SkillX-style retrieval foundation. It prefers stored
embedding vectors and falls back to deterministic lexical similarity.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, List, Optional

from . import similarity
from .models import Skill
from .i18n import LANGUAGES


# Relevance is decided per query, not on an absolute cosine cut. VECTOR_Z_FLOOR
# is the margin (in standard deviations above the query's own mean) a candidate
# must clear; measured on a 1972-memory corpus it separates on-topic prompts
# (mean recall 8.8/12) from off-topic ones (mean recall 0.7/12).
VECTOR_Z_FLOOR = 2.5
VECTOR_Z_SPAN = 2.5
VECTOR_SCORE_BASE = 0.5
# Fallback for populations too small for a z-score (see similarity.MIN_RELATIVE_POPULATION).
ABSOLUTE_VECTOR_FLOOR = 0.55


def _vector_relevance(z_score: float) -> float:
    """Map a per-query z-score onto a 0..1 relevance, or 0 below the floor."""
    if z_score < VECTOR_Z_FLOOR:
        return 0.0
    headroom = min(1.0, (z_score - VECTOR_Z_FLOOR) / VECTOR_Z_SPAN)
    return VECTOR_SCORE_BASE + (1.0 - VECTOR_SCORE_BASE) * headroom


def vector_relevances(
    cosines: List[Optional[float]],
    absolute_floor: float = ABSOLUTE_VECTOR_FLOOR,
) -> List[float]:
    """Convert raw cosines into relevance scores using per-query z-scores.

    Falls back to an absolute floor when the population is too small for a
    z-score to mean anything (few skills, a new project with few memories).
    """
    population = [value for value in cosines if value is not None]
    z_scores = similarity.relative_scores(population)
    if z_scores is None:
        return [
            value if value is not None and value >= absolute_floor else 0.0
            for value in cosines
        ]
    by_index = iter(z_scores)
    return [
        _vector_relevance(next(by_index)) if value is not None else 0.0
        for value in cosines
    ]


@dataclass
class RetrievedSkill:
    skill: Skill
    score: float


@dataclass
class RetrievedMemory:
    memory: dict
    score: float


class SkillRetriever:
    """Retrieve a compact top-k skill set for the current task."""

    TYPE_BUDGET = {
        "atomic": 3,
        "planning": 2,
        "procedure": 2,
        "preference": 3,
        "mistake": 2,
        "success_pattern": 2,
    }

    def __init__(
        self,
        embedding_client=None,
        embedding_model: Optional[str] = None,
        min_vector_score: float = ABSOLUTE_VECTOR_FLOOR,
    ):
        self.embedding_client = embedding_client
        self.embedding_model = embedding_model
        self.min_vector_score = min_vector_score

    def retrieve(
        self,
        task_text: str,
        skills: Iterable[Skill],
        top_k: int = 6,
        active_only: bool = True,
        min_score: float = 0.0,
        query_vector: Optional[List[float]] = None,
    ) -> List[RetrievedSkill]:
        query_tokens = self._tokens(task_text)
        if query_vector is None:
            query_vector = self._embed_query(task_text)
        candidates: List[RetrievedSkill] = []
        type_counts: dict[str, int] = {}

        pool = [
            skill for skill in skills
            if not (active_only and skill.status != "active")
        ]
        texts = [
            skill.embedding_text or f"{skill.name}\n{skill.description}\n{skill.content[:1000]}"
            for skill in pool
        ]
        relevances = vector_relevances(
            [
                similarity.cosine(query_vector, skill.embedding_vector)
                if query_vector and skill.embedding_vector
                else None
                for skill in pool
            ],
            self.min_vector_score,
        )

        for skill, text, vector_relevance in zip(pool, texts, relevances):
            score = self._score(vector_relevance, query_tokens, text)
            if score <= 0 or score < min_score:
                continue
            candidates.append(RetrievedSkill(skill=skill, score=score))

        candidates.sort(key=lambda item: (item.score, item.skill.confidence), reverse=True)

        selected: List[RetrievedSkill] = []
        for candidate in candidates:
            skill_type = candidate.skill.skill_type
            budget = self.TYPE_BUDGET.get(skill_type, 2)
            if type_counts.get(skill_type, 0) >= budget:
                continue
            selected.append(candidate)
            type_counts[skill_type] = type_counts.get(skill_type, 0) + 1
            if len(selected) >= top_k:
                break

        return selected

    def format_for_prompt(self, retrieved: List[RetrievedSkill]) -> str:
        if not retrieved:
            return ""

        sections: dict[str, list[str]] = {}
        for item in retrieved:
            skill = item.skill
            sections.setdefault(skill.skill_type, []).append(
                f"- **{skill.name}** ({item.score:.2f}): {skill.description}"
            )

        labels = {
            "atomic": "Atomic Constraints",
            "planning": "Planning Skills",
            "procedure": "Procedures",
            "preference": "User Preferences",
            "mistake": "Mistakes to Avoid",
            "success_pattern": "Success Patterns",
        }
        parts = []
        for skill_type, lines in sections.items():
            parts.append(f"### {labels.get(skill_type, skill_type.title())}")
            parts.extend(lines)
            parts.append("")
        return "\n".join(parts).strip()

    def _embed_query(self, task_text: str) -> Optional[List[float]]:
        if not self.embedding_client:
            return None
        try:
            embed_query = getattr(self.embedding_client, "embed_query", None)
            if callable(embed_query):
                return embed_query(task_text, model=self.embedding_model)
            if hasattr(self.embedding_client, "embed"):
                return self.embedding_client.embed(task_text, model=self.embedding_model)
        except Exception:
            pass
        return None

    def _score(
        self,
        vector_relevance: float,
        query_tokens: set[str],
        skill_text: str,
    ) -> float:
        lexical_score = similarity.jaccard(query_tokens, self._tokens(skill_text))
        return max(vector_relevance, lexical_score)

    @staticmethod
    def _tokens(text: str) -> set[str]:
        tokens = similarity.tokens(text)
        tokens.update(SkillRetriever._concept_tokens(text))
        return tokens

    @staticmethod
    def _concept_tokens(text: str) -> set[str]:
        lower = (text or "").lower()
        concepts: set[str] = set()
        marker_groups = {
            "concept_plan": "plan_markers",
            "concept_confirm": "confirmation_markers",
            "concept_concise": "concise_markers",
            "concept_no_modify": "no_modification_markers",
            "concept_correction": "correction_markers",
            "concept_constraint": "constraint_markers",
        }
        for concept, attr in marker_groups.items():
            for profile in LANGUAGES.values():
                if any(marker.lower() in lower for marker in getattr(profile, attr)):
                    concepts.add(concept)
                    break
        if "plan-before-action" in lower:
            concepts.update({"concept_plan", "concept_confirm"})
        if "confirm-before-execute" in lower:
            concepts.add("concept_confirm")
        return concepts


class MemoryRetriever:
    """Retrieve compact project memories from the local c2s.db state."""

    TYPE_WEIGHT = {
        "decision": 0.16,
        "procedure": 0.14,
        "warning": 0.13,
        "strategy": 0.12,
        "principle": 0.1,
        "fact": 0.08,
        "exception": 0.08,
        "episodic": 0.03,
    }

    def __init__(
        self,
        embedding_client=None,
        embedding_model: Optional[str] = None,
        min_vector_score: float = ABSOLUTE_VECTOR_FLOOR,
    ):
        self.embedding_client = embedding_client
        self.embedding_model = embedding_model
        self.min_vector_score = min_vector_score

    def retrieve(
        self,
        task_text: str,
        memories: Iterable[dict],
        top_k: int = 12,
        active_only: bool = True,
        min_score: float = 0.0,
        query_vector: Optional[List[float]] = None,
    ) -> List[RetrievedMemory]:
        query_tokens = SkillRetriever._tokens(task_text)
        if query_vector is None:
            query_vector = self._embed_query(task_text)
        candidates: List[RetrievedMemory] = []

        pool = [
            memory for memory in memories
            if not (
                active_only
                and (
                    not memory.get("is_active", True)
                    or memory.get("is_archived", False)
                )
            )
        ]
        relevances = vector_relevances(
            [
                similarity.cosine(query_vector, memory.get("embedding") or [])
                if query_vector and memory.get("embedding")
                else None
                for memory in pool
            ],
            self.min_vector_score,
        )

        for memory, vector_relevance in zip(pool, relevances):
            text = self._memory_text(memory)
            score = self._score(query_tokens, vector_relevance, text)
            if score <= 0 or score < min_score:
                continue
            candidates.append(RetrievedMemory(memory=memory, score=score))

        candidates.sort(
            key=lambda item: (
                item.score,
                float(item.memory.get("salience") or 0.0),
                float(item.memory.get("confidence") or 0.0),
            ),
            reverse=True,
        )
        return _mmr_memory_order(candidates)[: max(0, top_k)]

    def format_for_prompt(self, retrieved: List[RetrievedMemory]) -> str:
        if not retrieved:
            return ""

        lines = []
        for item in retrieved:
            memory = item.memory
            memory_type = str(memory.get("memory_type") or "fact")
            section = str(memory.get("section") or "general")
            content = str(memory.get("content") or "").strip()
            if not content:
                continue
            lines.append(f"- [{memory_type}/{section}] {content}")
        return "\n".join(lines)

    @staticmethod
    def _memory_text(memory: dict) -> str:
        return "\n".join(
            str(part)
            for part in [
                memory.get("memory_type"),
                memory.get("section"),
                memory.get("content"),
                memory.get("source_session"),
            ]
            if part
        )

    def _embed_query(self, task_text: str) -> Optional[List[float]]:
        if not self.embedding_client:
            return None
        try:
            embed_query = getattr(self.embedding_client, "embed_query", None)
            if callable(embed_query):
                return embed_query(task_text, model=self.embedding_model)
            if hasattr(self.embedding_client, "embed"):
                return self.embedding_client.embed(task_text, model=self.embedding_model)
        except Exception:
            pass
        return None

    def _score(
        self,
        query_tokens: set[str],
        vector_relevance: float,
        memory_text: str,
    ) -> float:
        lexical = similarity.jaccard(query_tokens, SkillRetriever._tokens(memory_text))
        exact = self._exact_boost(query_tokens, memory_text)
        lexical_score = min(1.0, lexical + exact)
        base = max(lexical_score, vector_relevance)
        if query_tokens and base <= 0:
            return 0.0
        return base

    @staticmethod
    def _exact_boost(query_tokens: set[str], memory_text: str) -> float:
        lower = memory_text.lower()
        boost = 0.0
        for token in query_tokens:
            if len(token) >= 4 and token in lower:
                boost += 0.02
        return min(boost, 0.2)


def _mmr_memory_order(candidates: List[RetrievedMemory], lambda_: float = 0.72) -> List[RetrievedMemory]:
    remaining = candidates[:64]
    picked: List[RetrievedMemory] = []
    while remaining:
        best_idx = 0
        best_score = -1.0
        for idx, candidate in enumerate(remaining):
            relevance = candidate.score
            vector = candidate.memory.get("embedding") or []
            redundancy = 0.0
            if vector and picked:
                redundancy = max(
                    (
                        similarity.cosine(vector, item.memory.get("embedding") or [])
                        for item in picked
                        if item.memory.get("embedding")
                    ),
                    default=0.0,
                )
            score = lambda_ * relevance - (1 - lambda_) * redundancy
            if score > best_score:
                best_idx = idx
                best_score = score
        picked.append(remaining.pop(best_idx))
    return picked + remaining
