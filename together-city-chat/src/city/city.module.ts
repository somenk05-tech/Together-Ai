import { Module } from '@nestjs/common';
import { CityController } from './city.controller';
import { WeatherService } from './weather.service';
import { ProfileModule } from '../profile/profile.module';

@Module({
  imports: [ProfileModule],
  controllers: [CityController],
  providers: [WeatherService],
})
export class CityModule {}
