from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Protocol

_SHA256_PATTERN = re.compile(r"^[a-f0-9]{64}$")
_TOKEN_PATTERN = re.compile(r"[0-9A-Za-z가-힣_]+")


@dataclass(frozen=True)
class ToolCapabilityDescriptor:
    tool_name: str
    domain: str
    action: str
    capability_ids: tuple[str, ...]
    when_to_use: str
    must_not_use_for: tuple[str, ...]
    accepted_selector_fields: tuple[str, ...]
    prerequisite_tool_names: tuple[str, ...]
    follow_up_tool_names: tuple[str, ...]
    risk_level: str
    execution_mode: str
    context_surface: str | None


@dataclass(frozen=True)
class ToolCapabilityCatalog:
    version: str
    sha256: str
    descriptors: tuple[ToolCapabilityDescriptor, ...]


@dataclass(frozen=True)
class ToolRetrievalResult:
    tool_names: tuple[str, ...]
    low_confidence: bool
    fallback_reason: str | None


class SemanticReranker(Protocol):
    def score(self, prompt: str, descriptor: ToolCapabilityDescriptor) -> float: ...


def parse_tool_capability_catalog(
    value: object,
    eligible_tool_names: set[str],
) -> ToolCapabilityCatalog | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("Invalid toolCapabilityCatalog")

    version = _required_string(value, "version")
    sha256 = _required_string(value, "sha256").lower()
    raw_descriptors = value.get("descriptors")
    if not _SHA256_PATTERN.fullmatch(sha256) or not isinstance(raw_descriptors, list):
        raise ValueError("Invalid toolCapabilityCatalog")

    descriptors = tuple(_parse_descriptor(item) for item in raw_descriptors)
    tool_names = {descriptor.tool_name for descriptor in descriptors}
    if len(tool_names) != len(descriptors) or tool_names != eligible_tool_names:
        raise ValueError("Invalid toolCapabilityCatalog")

    return ToolCapabilityCatalog(version=version, sha256=sha256, descriptors=descriptors)


def retrieve_tool_shortlist(
    prompt: str,
    catalog: ToolCapabilityCatalog,
    *,
    top_k: int = 8,
    semantic_reranker: SemanticReranker | None = None,
) -> ToolRetrievalResult:
    if top_k < 1:
        raise ValueError("top_k must be positive")

    prompt_tokens = set(_tokens(prompt))
    scored = []
    for descriptor in catalog.descriptors:
        metadata_tokens = set(
            _tokens(
                " ".join(
                    (
                        descriptor.domain,
                        descriptor.action,
                        *descriptor.capability_ids,
                        descriptor.when_to_use,
                    )
                )
            )
        )
        score = float(len(prompt_tokens & metadata_tokens))
        if semantic_reranker:
            score += semantic_reranker.score(prompt, descriptor)
        scored.append((score, descriptor.tool_name))

    ranked = sorted(scored, key=lambda item: (-item[0], item[1]))
    best_score = ranked[0][0] if ranked else 0.0
    if best_score <= 0:
        return ToolRetrievalResult(
            tool_names=tuple(),
            low_confidence=True,
            fallback_reason="no_metadata_match",
        )

    return ToolRetrievalResult(
        tool_names=tuple(name for _, name in ranked[:top_k]),
        low_confidence=False,
        fallback_reason=None,
    )


def _parse_descriptor(value: object) -> ToolCapabilityDescriptor:
    if not isinstance(value, dict):
        raise ValueError("Invalid tool capability descriptor")
    context_surface = value.get("contextSurface")
    if context_surface is not None and not isinstance(context_surface, str):
        raise ValueError("Invalid tool capability descriptor")

    return ToolCapabilityDescriptor(
        tool_name=_required_string(value, "toolName"),
        domain=_required_string(value, "domain"),
        action=_required_string(value, "action"),
        capability_ids=_string_tuple(value, "capabilityIds"),
        when_to_use=_required_string(value, "whenToUse"),
        must_not_use_for=_string_tuple(value, "mustNotUseFor"),
        accepted_selector_fields=_string_tuple(value, "acceptedSelectorFields"),
        prerequisite_tool_names=_string_tuple(value, "prerequisiteToolNames"),
        follow_up_tool_names=_string_tuple(value, "followUpToolNames"),
        risk_level=_required_string(value, "riskLevel"),
        execution_mode=_required_string(value, "executionMode"),
        context_surface=context_surface,
    )


def _required_string(value: dict[object, object], key: str) -> str:
    result = value.get(key)
    if not isinstance(result, str) or not result.strip():
        raise ValueError("Invalid tool capability descriptor")
    return result.strip()


def _string_tuple(value: dict[object, object], key: str) -> tuple[str, ...]:
    result = value.get(key)
    if not isinstance(result, list) or not all(
        isinstance(item, str) and item.strip() for item in result
    ):
        raise ValueError("Invalid tool capability descriptor")
    return tuple(item.strip() for item in result)


def _tokens(value: str) -> tuple[str, ...]:
    return tuple(token.lower() for token in _TOKEN_PATTERN.findall(value))
