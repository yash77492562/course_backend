export class ResponseDto<T = any> {
  success: boolean;
  status_code: number;
  message: string;
  data?: T;

  static success<T>(message: string, data?: T, status_code: number = 200): ResponseDto<T> {
    return {
      success: true,
      status_code,
      message,
      data,
    };
  }

  static error(message: string, status_code: number = 500): ResponseDto {
    return {
      success: false,
      status_code,
      message,
    };
  }
}
