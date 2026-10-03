import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TariffGroup } from '@database/entities/tariff-group.entity';
import { TariffsController } from '@modules/tariffs/tariffs.controller';
import { TariffsService } from '@modules/tariffs/tariffs.service';

@Module({
  imports: [TypeOrmModule.forFeature([TariffGroup])],
  controllers: [TariffsController],
  providers: [TariffsService],
  exports: [TariffsService],
})
export class TariffsModule {}
