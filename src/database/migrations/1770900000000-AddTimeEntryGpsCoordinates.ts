import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTimeEntryGpsCoordinates1770900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasLatitude = await queryRunner.hasColumn('time_entries', 'latitude');
    if (!hasLatitude) {
      await queryRunner.addColumn(
        'time_entries',
        new TableColumn({
          name: 'latitude',
          type: 'double precision',
          isNullable: true,
        }),
      );
    }

    const hasLongitude = await queryRunner.hasColumn('time_entries', 'longitude');
    if (!hasLongitude) {
      await queryRunner.addColumn(
        'time_entries',
        new TableColumn({
          name: 'longitude',
          type: 'double precision',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('time_entries', 'latitude')) {
      await queryRunner.dropColumn('time_entries', 'latitude');
    }

    if (await queryRunner.hasColumn('time_entries', 'longitude')) {
      await queryRunner.dropColumn('time_entries', 'longitude');
    }
  }
}
