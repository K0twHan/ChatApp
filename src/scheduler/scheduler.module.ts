import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { ChatGateway } from 'src/message/message.gateway';
import { PrismaClient } from '@prisma/client';
import { MessageModule } from 'src/message/message.module';
import { DbModule } from 'src/db/db.module';

@Module({
    imports: [MessageModule,DbModule],
    providers: [SchedulerService],
})
export class SchedulerModule {}
