import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { KbArticle, KbArticleSchema } from './kb-article.schema';
import { KbController } from './kb.controller';
import { KbService } from './kb.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KbArticle.name, schema: KbArticleSchema },
    ]),
    UsersModule,
  ],
  controllers: [KbController],
  providers: [KbService],
  exports: [KbService],
})
export class KbModule {}
