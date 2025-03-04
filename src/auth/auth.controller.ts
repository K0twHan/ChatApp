import { Body, Controller, Post } from '@nestjs/common';
import { LoginDto } from './authDto/login.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
    constructor(readonly AuthService : AuthService) {}

    @Post('LogIn')
    async LogIn(@Body() data : LoginDto) : Promise<string> {
        const result = await this.AuthService.signIn(data);
        return JSON.stringify(result);
    }
}
