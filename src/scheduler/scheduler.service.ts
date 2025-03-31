import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChatGateway } from '../message/message.gateway'

@Injectable()
export class SchedulerService {
  constructor(private readonly eventsGateway: ChatGateway) {}

  @Cron('0 */30 * * * *') // Her 30 dakikada bir çalıştır
  handleCron() {
    console.log('WebSocket eventi tetiklendi!');
    this.eventsGateway.handleUserList();
  }
}
