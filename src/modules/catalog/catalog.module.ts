import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PackagesController } from './controllers/packages.controller';
import { TaskTypesController } from './controllers/task-types.controller';
import { PackageItem } from './entities/package-item.entity';
import { ServicePackage } from './entities/service-package.entity';
import { TaskType } from './entities/task-type.entity';
import { PackageItemRepository } from './repositories/package-item.repository';
import { ServicePackageRepository } from './repositories/service-package.repository';
import { TaskTypeRepository } from './repositories/task-type.repository';
import { CatalogService } from './services/catalog.service';

@Module({
  imports: [TypeOrmModule.forFeature([ServicePackage, TaskType, PackageItem]), CqrsModule],
  controllers: [PackagesController, TaskTypesController],
  providers: [CatalogService, ServicePackageRepository, TaskTypeRepository, PackageItemRepository],
  exports: [CatalogService, ServicePackageRepository],
})
export class CatalogModule {}
