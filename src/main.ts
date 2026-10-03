import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const prefix = config.get<string>('app.apiPrefix', 'api/v1');
  const port = config.get<number>('app.port', 3000);
  const nodeEnv = config.get<string>('app.nodeEnv', 'development');
  const corsOrigins = config.get<string[]>('app.corsOrigins', []);

  app.setGlobalPrefix(prefix);
  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      stopAtFirstError: false,
    }),
  );
  app.enableShutdownHooks();

  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Zengo Account API')
      .setDescription(
        "API de la plateforme SafAlert Solar G1 : comptes multi-tenant, clients, dispositifs IoT, " +
          'alertes et interventions. Voir docs/ARCHITECTURE.md pour la vue d\'ensemble.',
      )
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .addTag('Authentification')
      .addTag('Organisations')
      .addTag('Utilisateurs')
      .addTag('Comptes clients')
      .addTag('Dispositifs SafAlert')
      .addTag('Sante')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(port);
  logger.log(`Zengo Account API demarree sur http://localhost:${port}/${prefix} (${nodeEnv})`);
  if (nodeEnv !== 'production') {
    logger.log(`Documentation OpenAPI : http://localhost:${port}/docs`);
  }
}

void bootstrap();
