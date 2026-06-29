FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY apps/ai-worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/ai-worker/app ./app
COPY docs/contracts/schemas/pilo-public-contracts.schema.json ./docs/contracts/schemas/pilo-public-contracts.schema.json

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
