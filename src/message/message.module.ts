import { Module } from '@nestjs/common';
import { ChatGateway } from './message.gateway';
import { DbModule } from 'src/db/db.module';
import { JwtModule } from '@nestjs/jwt';


@Module({
  imports: [DbModule,JwtModule],
  controllers: [],
  providers: [ChatGateway],
  exports: [ChatGateway]
})
export class MessageModule {}
