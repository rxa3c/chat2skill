"""Shared similarity primitives and merge thresholds.

Single source of truth for the tokenizer, lexical (Jaccard) and vector
(cosine) similarity used by the proposer, storage merge, replay sampling,
retrieval, and maintenance. The two thresholds are on different scales by
design: cosine compares dense embeddings, Jaccard compares token sets.
"""

from __future__ import annotations

import math
import re
from typing import List, Optional

MERGE_COSINE_THRESHOLD = 0.86
MERGE_LEXICAL_THRESHOLD = 0.62

# Cosine values from the local embedding model sit in a narrow absolute band
# (measured 0.45-0.72 on this corpus), so relevance is a per-query margin over
# that query's own score distribution, not an absolute cut. A z-score needs a
# population large enough to have a meaningful spread; below that the caller
# falls back to an absolute floor.
MIN_RELATIVE_POPULATION = 24


def tokens(text: str) -> set[str]:
    """Word tokens plus CJK unigrams/bigrams, lowercased."""
    result = {
        token
        for token in re.split(r"[^a-zA-Z0-9_一-鿿]+", (text or "").lower())
        if len(token) > 1
    }
    cjk = re.findall(r"[一-鿿]", text or "")
    result.update(cjk)
    result.update("".join(pair) for pair in zip(cjk, cjk[1:]))
    return result


def jaccard(left: set, right: set) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def relative_scores(values: List[float]) -> Optional[List[float]]:
    """Return per-query z-scores, or None when the population is too small.

    Relevance for one query is how far a candidate sits above that query's own
    mean, measured in standard deviations. Returning None tells the caller the
    sample cannot support a relative decision.
    """
    if len(values) < MIN_RELATIVE_POPULATION:
        return None
    mean = sum(values) / len(values)
    deviation = math.sqrt(sum((value - mean) ** 2 for value in values) / len(values))
    if deviation <= 0:
        return None
    return [(value - mean) / deviation for value in values]


def cosine(left: List[float], right: List[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return dot / (left_norm * right_norm)
