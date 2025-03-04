import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db/db.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { JwtModule } from '@nestjs/jwt';
import { MessageModule } from './message/message.module';
import { GuardModule } from './guard/guard.module';

@Module({
  imports: [DbModule, UserModule, AuthModule, MessageModule,GuardModule,JwtModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
