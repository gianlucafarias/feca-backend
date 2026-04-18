import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse();
    const request = context.getRequest();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const normalized =
        typeof exceptionResponse === "object" && exceptionResponse !== null
          ? exceptionResponse
          : { message: exceptionResponse };

      const message =
        typeof normalized === "object" &&
        normalized !== null &&
        "message" in normalized
          ? normalized.message
          : "Request failed";

      return response.status(status).json({
        ...(typeof normalized === "object" && normalized !== null ? normalized : {}),
        message,
        statusCode: status,
        path: request.url,
        timestamp: new Date().toISOString(),
      });
    }

    this.logger.error(exception);

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      message: "Internal server error",
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
