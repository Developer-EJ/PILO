from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker


class ContractValidationError(ValueError):
    def __init__(self, schema_name: str, errors: list[str]) -> None:
        super().__init__(f"{schema_name} contract validation failed: {errors}")
        self.schema_name = schema_name
        self.errors = errors


def validate_public_contract(schema_name: str, payload: object) -> object:
    validator = _validator_for(schema_name)
    errors = sorted(validator.iter_errors(payload), key=lambda error: error.path)
    if errors:
        messages = [
            f"/{'/'.join(str(part) for part in error.path)}: {error.message}"
            for error in errors
        ]
        raise ContractValidationError(schema_name, messages)
    return payload


def validate_agent_job_message(payload: object) -> object:
    return validate_public_contract("AgentJobMessage", payload)


def validate_agent_result_message(payload: object) -> object:
    return validate_public_contract("AgentResultMessage", payload)


def validate_agent_action(payload: object) -> object:
    return validate_public_contract("AgentAction", payload)


@lru_cache(maxsize=1)
def _public_contract_schema() -> dict[str, Any]:
    return _read_schema(_schema_path())


@lru_cache(maxsize=None)
def _validator_for(schema_name: str) -> Draft202012Validator:
    schema = _public_contract_schema()
    return Draft202012Validator(
        {
            "$schema": schema["$schema"],
            "$defs": schema["$defs"],
            "$ref": f"#/$defs/{schema_name}",
        },
        format_checker=FormatChecker(),
    )


def _read_schema(schema_path: Path) -> dict[str, Any]:
    import json

    return json.loads(schema_path.read_text(encoding="utf-8"))


def _schema_path() -> Path:
    configured_path = os.getenv("PILO_CONTRACT_SCHEMA_PATH")
    if configured_path:
        return Path(configured_path)

    current = Path(__file__).resolve()
    candidates = [
        Path.cwd() / "docs/contracts/schemas/pilo-public-contracts.schema.json",
        Path.cwd().parent.parent
        / "docs/contracts/schemas/pilo-public-contracts.schema.json",
        current.parents[4] / "docs/contracts/schemas/pilo-public-contracts.schema.json",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate

    raise FileNotFoundError(
        "Cannot find pilo-public-contracts.schema.json. "
        "Set PILO_CONTRACT_SCHEMA_PATH."
    )
