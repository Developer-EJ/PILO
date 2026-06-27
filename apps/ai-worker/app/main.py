import os

from fastapi import FastAPI

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
