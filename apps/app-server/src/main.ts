import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { configureApp } from "./app.config";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  configureApp(app);
  app.enableCors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
  });

  const port = Number(process.env.PORT || 3000);
  await app.listen({ port, host: "0.0.0.0" });
}

bootstrap();
