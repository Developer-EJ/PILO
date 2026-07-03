# New Repository Infra TODO

Before the first real deploy, update these values.

## Project Identity

- [x] Keep `pilo` / `PILO` as the project slug/name.
- [x] Keep ECR repositories:
  - `pilo-app-server`
  - `pilo-realtime-server`
  - `pilo-ai-worker`
- [x] Use `Developer-EJ/PILO` for GitHub OIDC settings.

## Terraform State

- [ ] Edit `infra/envs/dev/backend.tf`.
- [ ] Use a new S3 backend bucket/key for this project.
- [ ] Do not reuse another project's `terraform.tfstate`.
- [ ] Keep `terraform.tfvars` uncommitted.

## Services

- [ ] Keep only the services the new project actually uses.
- [ ] If there is no realtime server, remove its workflow and Terraform ECS service entry.
- [ ] If there is no AI worker, remove its workflow, SQS consumer assumptions, and ECS service entry.
- [ ] Ensure Dockerfile paths match the workflows.

## CI Scripts

- [ ] Node services expose `format:check`, `lint`, `test`, and `build`.
- [ ] Python worker has `requirements.txt`, `requirements-dev.txt`, `black`, `ruff`, and `pytest`.
- [ ] Update path filters in `.github/workflows/*.yml` if app paths change.

## Secrets And Variables

- [ ] Put secret values in AWS Secrets Manager or GitHub Secrets, not in Git.
- [ ] Register GitHub repository variables from Terraform outputs:
  - `AWS_GITHUB_ACTIONS_ROLE_ARN`
  - `ECS_CLUSTER_NAME`
  - `ECS_APP_SERVER_SERVICE`
  - `ECS_REALTIME_SERVER_SERVICE`
  - `ECS_AI_WORKER_SERVICE`
  - `FRONTEND_S3_BUCKET`
  - `CLOUDFRONT_DISTRIBUTION_ID`

## Local Development

- [ ] Edit `.env.example`.
- [ ] Edit `docker-compose.dev.yml`.
- [ ] Add new project DB migration mounts only after the schema files exist.
