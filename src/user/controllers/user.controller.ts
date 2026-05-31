import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { UserService } from '../services/user.service';
import { RegisterUserDto, LoginUserDto, RefreshTokenDto } from '../dto/dto';

@Controller()
export class UserController {
  constructor(private readonly userService: UserService) {}

  // Port 3005 - User Registration
  @MessagePattern('user.register')
  async register(@Payload() dto: RegisterUserDto) {
    return this.userService.register(dto);
  }

  // Port 3006 - User Login  
  @MessagePattern('user.login')
  async login(@Payload() dto: LoginUserDto) {
    return this.userService.login(dto);
  }

  // Port 3007 - Get User Details
  @MessagePattern('user.getDetails')
  async getUserDetails(@Payload() data: { userId: string }) {
    return this.userService.getUserDetails(data.userId);
  }

  // Port 3008 - Refresh Token
  @MessagePattern('user.refreshToken')
  async refreshToken(@Payload() dto: RefreshTokenDto) {
    return this.userService.refreshToken(dto.refreshToken);
  }
}