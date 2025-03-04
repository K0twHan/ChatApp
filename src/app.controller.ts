import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from './guard/jwt.guard';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}
  
  @Get()
  @ApiBearerAuth("JWT-auth")
  @UseGuards(JwtAuthGuard)
  getHello(): string {
    return this.appService.getHello();
  }
}
