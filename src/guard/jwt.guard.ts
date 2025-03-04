import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable } from 'rxjs';
import { jwtConstants } from 'src/auth/costants';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['authorization']?.split(' ')[1]; // 'Bearer <token>'

    if (!token) {
      throw new UnauthorizedException('Token not provided');
    }

    try {
      // Token'ı doğrulama
      const decoded = await this.jwtService.verifyAsync(token,{secret : jwtConstants.secret});
      request.user = decoded; // decoded payload'ı request'e ekliyoruz
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
