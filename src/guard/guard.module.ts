import { Module } from '@nestjs/common';
import { DbModule } from 'src/db/db.module';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt.guard';

@Module({
  imports: [JwtModule],
  providers: [JwtAuthGuard],
  controllers: [],
  exports: [JwtAuthGuard]
})
export class GuardModule {}