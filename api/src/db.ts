import { Global, Module } from '@nestjs/common';
import { Pg } from './pg.js';

@Global()
@Module({ providers: [Pg], exports: [Pg] })
export class DbModule {}
