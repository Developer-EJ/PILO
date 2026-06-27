# PILO Applications

이 폴더는 PILO의 배포 대상 애플리케이션을 담는다.

- `frontend`: Next.js static export, S3 + CloudFront 배포
- `app-server`: NestJS API server, ALB `/api/*` 라우팅
- `realtime-server`: NestJS websocket server, ALB `/socket.io/*` 라우팅
- `ai-worker`: FastAPI 기반 AI worker 이미지

ECS 서비스는 Terraform에서 `desired_count = 0`으로 시작한다. 각 이미지가 ECR에 올라간 뒤 dev 환경에서 필요한 서비스만 `1` 이상으로 올린다.
