import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  code?: string;
  path: string;
  timestamp: string;
  requestId?: string;
}

/** Normalise toutes les erreurs HTTP sortantes. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Erreur interne du serveur.';
    let error = 'Internal Server Error';
    let code: string | undefined;

    if (isHttpException) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
        error = exception.name;
      } else if (typeof payload === 'object' && payload !== null) {
        const objectPayload = payload as Record<string, unknown>;
        message = (objectPayload.message as string | string[]) ?? exception.message;
        error = (objectPayload.error as string) ?? exception.name;
        code = typeof objectPayload.code === 'string' ? objectPayload.code : undefined;
      }
    } else if (exception instanceof Error) {
      error = exception.name;
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorBody = {
      statusCode: status,
      message,
      error,
      ...(code ? { code } : {}),
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
      requestId: (request.headers['x-request-id'] as string) ?? undefined,
    };

    response.status(status).json(body);
  }
}
