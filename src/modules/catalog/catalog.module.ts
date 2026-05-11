import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PackagesController } from './controllers/packages.controller';
import { ServicePackage } from './entities/service-package.entity';
import { ServicePackageRepository } from './repositories/service-package.repository';
import { CatalogService } from './services/catalog.service';

@Module({
  imports: [TypeOrmModule.forFeature([ServicePackage]), CqrsModule],
  controllers: [PackagesController],
  providers: [CatalogService, ServicePackageRepository],
  exports: [CatalogService, ServicePackageRepository],
})
export class CatalogModule {}
