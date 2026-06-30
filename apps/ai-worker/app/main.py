import os
from typing import Any

from fastapi import FastAPI, HTTPException, Request

from app.workflows.review import run_review_analysis_workflow

app = FastAPI(title="PILO AI Worker")


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "service": "ai-worker",
        "status": "ok",
        "environment": os.getenv("APP_ENV", "local"),
    }


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "PILO AI Worker"}


@app.post("/workflows/review/run")
async def run_review_workflow(request: Request) -> dict[str, Any]:
    try:
        payload = await request.json()
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail="Request body must be valid JSON",
        ) from error

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=400,
            detail="Request body must be a JSON object",
        )

    try:
        return run_review_analysis_workflow(payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
