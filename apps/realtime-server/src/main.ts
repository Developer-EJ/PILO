import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  const corsOrigin = process.env.CORS_ORIGIN || "*";

  app.enableCors({
    origin: corsOrigin === "*" ? true : corsOrigin,
    credentials: true,
  });

  const port = Number(process.env.PORT || 4001);
  await app.listen({ port, host: "0.0.0.0" });
}

bootstrap();
