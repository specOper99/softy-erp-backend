import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrivacyRequest } from './domain/entities';

@Module({
  imports: [TypeOrmModule.forFeature([PrivacyRequest])],
  exports: [TypeOrmModule],
})
export class PrivacyModule {}
