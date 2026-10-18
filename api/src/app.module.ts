import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.js';
import { config } from './config.js';
import { CatalogPageController } from './catalog/page.js';
import { ProductsController } from './catalog/products.js';
import { ContentController } from './content.js';
import { DbModule } from './db.js';
import { StorageModule } from './storage/storage.module.js';
import { ShowcasesController } from './showcases.js';
import { AdminEventsController, ClientController, EventsService, GuestController, PublicEventsController } from './events.js';

@Module({
  imports: [DbModule, StorageModule, JwtModule.register({ global: true, secret: config.jwtSecret })],
  controllers: [AuthController, ContentController, AdminEventsController, GuestController, ClientController, PublicEventsController, ShowcasesController, ProductsController, CatalogPageController],
  providers: [EventsService],
})
export class AppModule {}
