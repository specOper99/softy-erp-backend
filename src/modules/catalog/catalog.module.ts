import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PackagesController } from './api/packages.controller';
import { CatalogService } from './application/catalog.service';
import { ServicePackage } from './domain/entities';
import { PackagePriceChangedHandler } from './infrastructure/package-price-changed.handler';
import { ServicePackageRepository } from './infrastructure/service-package.repository';

@Module({
  imports: [TypeOrmModule.forFeature([ServicePackage]), CqrsModule],
  controllers: [PackagesController],
  providers: [CatalogService, ServicePackageRepository, PackagePriceChangedHandler],
  exports: [CatalogService, ServicePackageRepository],
})
export class CatalogModule {}
