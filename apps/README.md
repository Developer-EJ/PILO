# PILO Applications

이 폴더는 PILO의 배포 대상 애플리케이션을 담는다.

- `frontend`: Next.js static export, S3 + CloudFront 배포
- `app-server`: NestJS API server, ALB `/api/*` 라우팅
- `realtime-server`: NestJS websocket server, ALB `/socket.io/*` 라우팅
- `ai-worker`: FastAPI 기반 AI worker 이미지

## 도메인 구현 경로

- Frontend route: `apps/frontend/app/(workspace)/<domain>`
- Frontend component: `apps/frontend/components/<domain>`
- Frontend shared API/type: `apps/frontend/lib`
- App Server module: `apps/app-server/src/modules/<domain>`
- App Server public read model: `apps/app-server/src/modules/<domain>/public`
- Realtime domain: `apps/realtime-server/src/<domain>`
- AI workflow: `apps/ai-worker/app/workflows/<domain>`

도메인별 상세 지시서는 `docs/agents/README.md`에서 확인한다.

ECS 서비스는 Terraform에서 `desired_count = 0`으로 시작한다. 각 이미지가 ECR에 올라간 뒤 dev 환경에서 필요한 서비스만 `1` 이상으로 올린다.
