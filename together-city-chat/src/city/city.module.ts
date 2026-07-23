import { Module } from '@nestjs/common';
import { CityController } from './city.controller';
import { WeatherService } from './weather.service';

@Module({
  controllers: [CityController],
  providers: [WeatherService],
})
export class CityModule {}
