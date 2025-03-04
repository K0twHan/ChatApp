import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/db/db.service';
import { LoginDto } from './authDto/login.dto';
import { jwtConstants } from './costants';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UserService,
    private jwtService: JwtService,
    private DbService : PrismaService
  ) {}

  async signIn(
   data : LoginDto
  ): Promise<{ access_token: string }> {
    const user = await this.DbService.user.findFirst({where : {email : data.email}});
    const passw =await this.usersService.ComparePassword(data.password, user.password);
    if (passw!=true) {
      throw new UnauthorizedException();
    }
    const payload = { sub: user.id, username: user.name+user.lastName };
    return {
      access_token: await this.jwtService.signAsync(payload, {expiresIn : '1h', secret: jwtConstants.secret}),
    };
  }
}