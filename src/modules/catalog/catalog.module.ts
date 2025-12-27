import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PackagesController } from './controllers/packages.controller';
import { TaskTypesController } from './controllers/task-types.controller';
import { PackageItem } from './entities/package-item.entity';
import { ServicePackage } from './entities/service-package.entity';
import { TaskType } from './entities/task-type.entity';
import { CatalogService } from './services/catalog.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([ServicePackage, TaskType, PackageItem]),
    ],
    controllers: [PackagesController, TaskTypesController],
    providers: [CatalogService],
    exports: [CatalogService],
})
export class CatalogModule { }
