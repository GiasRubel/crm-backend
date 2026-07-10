import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { UsersService } from '../users/users.service';
import { CreateKbArticleDto } from './dto/create-kb-article.dto';
import { KbFeedbackDto } from './dto/kb-feedback.dto';
import { KbQueryDto, PublicKbQueryDto } from './dto/kb-query.dto';
import {
  KbArticleResponseDto,
  KbStatsDto,
  PublicKbArticleDto,
} from './dto/kb-response.dto';
import { UpdateKbArticleDto } from './dto/update-kb-article.dto';
import { KbArticle, KbArticleDocument } from './kb-article.schema';

/** Escape user input so it can be safely embedded in a RegExp. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "How do I reset my password?" → "how-do-i-reset-my-password" */
function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'article'
  );
}

/** Rows returned to the anonymous FAQ list. */
const PUBLIC_LIST_LIMIT = 100;

@Injectable()
export class KbService {
  private readonly logger = new Logger(KbService.name);

  constructor(
    @InjectModel(KbArticle.name)
    private readonly articleModel: Model<KbArticleDocument>,
    private readonly usersService: UsersService,
  ) {}

  // ── Staff CRUD ──────────────────────────────────────────────────────────

  async create(
    dto: CreateKbArticleDto,
    authorId: string,
  ): Promise<KbArticleResponseDto> {
    const slug = await this.uniqueSlug(slugify(dto.title));
    const status = dto.status ?? 'draft';

    const article = await this.articleModel.create({
      title: dto.title.trim(),
      slug,
      body: dto.body,
      category: dto.category?.trim(),
      tags: this.normalizeTags(dto.tags),
      status,
      visibility: dto.visibility ?? 'internal',
      authorId,
      publishedAt: status === 'published' ? new Date() : undefined,
    });

    this.logger.log(`KB article created: "${article.title}" (${slug})`);
    return this.mapOne(article);
  }

  async findAll(query: KbQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const conditions: Record<string, unknown>[] = [];

    if (query.search?.trim()) {
      const searchRegex = new RegExp(escapeRegExp(query.search.trim()), 'i');
      conditions.push({
        $or: [
          { title: searchRegex },
          { body: searchRegex },
          { tags: searchRegex },
        ],
      });
    }
    if (query.category?.trim()) {
      conditions.push({ category: query.category.trim().toLowerCase() });
    }
    if (query.status) conditions.push({ status: query.status });
    if (query.visibility) conditions.push({ visibility: query.visibility });

    const filter: Record<string, unknown> =
      conditions.length === 0
        ? {}
        : conditions.length === 1
          ? conditions[0]
          : { $and: conditions };

    const sortBy = query.sortBy ?? 'updatedAt';
    const direction = query.sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = {
      [sortBy]: direction,
      _id: direction,
    };

    const [items, total] = await Promise.all([
      this.articleModel.find(filter).sort(sort).skip(skip).limit(limit).exec(),
      this.articleModel.countDocuments(filter).exec(),
    ]);

    return {
      data: await this.mapMany(items),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getStats(): Promise<KbStatsDto> {
    const [byStatus, publicArticles, viewsAgg] = await Promise.all([
      this.articleModel
        .aggregate<{
          _id: string;
          count: number;
        }>([{ $group: { _id: '$status', count: { $sum: 1 } } }])
        .exec(),
      this.articleModel
        .countDocuments({ visibility: 'public', status: 'published' })
        .exec(),
      this.articleModel
        .aggregate<{
          _id: null;
          total: number;
        }>([{ $group: { _id: null, total: { $sum: '$views' } } }])
        .exec(),
    ]);

    const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
    const total = byStatus.reduce((acc, s) => acc + s.count, 0);

    return {
      total,
      published: counts['published'] ?? 0,
      drafts: counts['draft'] ?? 0,
      archived: counts['archived'] ?? 0,
      publicArticles,
      totalViews: viewsAgg[0]?.total ?? 0,
    };
  }

  async findOne(id: string): Promise<KbArticleResponseDto> {
    return this.mapOne(await this.getByIdOrFail(id));
  }

  async update(
    id: string,
    dto: UpdateKbArticleDto,
    editorId: string,
  ): Promise<KbArticleResponseDto> {
    const article = await this.getByIdOrFail(id);

    if (dto.title !== undefined) article.title = dto.title.trim();
    if (dto.body !== undefined) article.body = dto.body;
    if (dto.category !== undefined) article.category = dto.category.trim();
    if (dto.tags !== undefined) article.tags = this.normalizeTags(dto.tags);
    if (dto.visibility !== undefined) article.visibility = dto.visibility;
    if (dto.status !== undefined && dto.status !== article.status) {
      article.status = dto.status;
      if (dto.status === 'published' && !article.publishedAt) {
        article.publishedAt = new Date();
      }
    }
    article.updatedById = editorId;

    await article.save();
    this.logger.log(`KB article updated: ${id}`);
    return this.mapOne(article);
  }

  async remove(id: string): Promise<void> {
    const article = await this.getByIdOrFail(id);
    await this.articleModel.deleteOne({ _id: article._id }).exec();
    this.logger.log(`KB article deleted: ${id} ("${article.title}")`);
  }

  // ── Public FAQ (unauthenticated) ────────────────────────────────────────

  /** Published + public articles only; body omitted from the list. */
  async findPublic(query: PublicKbQueryDto): Promise<PublicKbArticleDto[]> {
    const conditions: Record<string, unknown>[] = [
      { status: 'published', visibility: 'public' },
    ];
    if (query.search?.trim()) {
      const searchRegex = new RegExp(escapeRegExp(query.search.trim()), 'i');
      conditions.push({
        $or: [
          { title: searchRegex },
          { body: searchRegex },
          { tags: searchRegex },
        ],
      });
    }
    if (query.category?.trim()) {
      conditions.push({ category: query.category.trim().toLowerCase() });
    }

    const articles = await this.articleModel
      .find(conditions.length === 1 ? conditions[0] : { $and: conditions })
      .sort({ category: 1, title: 1 })
      .limit(PUBLIC_LIST_LIMIT)
      .exec();

    return articles.map((a) => this.toPublicDto(a, /* includeBody */ false));
  }

  /** Single public article by slug; counts the view. */
  async findPublicBySlug(slug: string): Promise<PublicKbArticleDto> {
    const article = await this.articleModel
      .findOneAndUpdate(
        {
          slug: slug.toLowerCase().trim(),
          status: 'published',
          visibility: 'public',
        },
        { $inc: { views: 1 } },
        { new: true },
      )
      .exec();
    if (!article) {
      throw new NotFoundException('Article not found');
    }
    return this.toPublicDto(article, true);
  }

  /** Anonymous helpful / not-helpful vote. */
  async addFeedback(id: string, dto: KbFeedbackDto): Promise<void> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException('Article not found');
    }
    const result = await this.articleModel
      .updateOne(
        { _id: id, status: 'published', visibility: 'public' },
        { $inc: dto.helpful ? { helpfulCount: 1 } : { notHelpfulCount: 1 } },
      )
      .exec();
    if (result.matchedCount === 0) {
      throw new NotFoundException('Article not found');
    }
  }

  // ── Cross-module lookups (used by tickets) ──────────────────────────────

  /** Map of article id → title, for denormalizing ticket links. */
  async findTitlesByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const articles = await this.articleModel
      .find({ _id: { $in: ids } })
      .select('title')
      .exec();
    return new Map(articles.map((a) => [a._id.toString(), a.title]));
  }

  /** Existence check for ticket → article links. */
  async existsById(id: string): Promise<boolean> {
    if (!isValidObjectId(id)) return false;
    return (await this.articleModel.exists({ _id: id })) !== null;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private normalizeTags(tags?: string[]): string[] {
    return [
      ...new Set(
        (tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
      ),
    ];
  }

  /** Append -2, -3, … until the slug is free. */
  private async uniqueSlug(base: string): Promise<string> {
    let slug = base;
    for (let i = 2; ; i += 1) {
      const existing = await this.articleModel.exists({ slug }).exec();
      if (!existing) return slug;
      if (i > 50) {
        throw new ConflictException(
          'Could not generate a unique slug for this title',
        );
      }
      slug = `${base}-${i}`;
    }
  }

  private toPublicDto(
    article: KbArticleDocument,
    includeBody: boolean,
  ): PublicKbArticleDto {
    return {
      id: article._id.toString(),
      title: article.title,
      slug: article.slug,
      body: includeBody ? article.body : '',
      category: article.category ?? null,
      tags: article.tags,
      publishedAt: article.publishedAt?.toISOString() ?? null,
      helpfulCount: article.helpfulCount,
      notHelpfulCount: article.notHelpfulCount,
    };
  }

  private async mapOne(
    article: KbArticleDocument,
  ): Promise<KbArticleResponseDto> {
    const [dto] = await this.mapMany([article]);
    return dto;
  }

  private async mapMany(
    articles: KbArticleDocument[],
  ): Promise<KbArticleResponseDto[]> {
    if (articles.length === 0) return [];

    const staffIds = [
      ...new Set(
        articles
          .flatMap((a) => [a.authorId, a.updatedById])
          .filter((v): v is string => !!v),
      ),
    ];
    const staff = await this.usersService.findStaffByKeycloakIds(staffIds);
    const staffNames = new Map(
      staff.map((u) => [
        u.keycloakId,
        `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
      ]),
    );

    return articles.map((a) => ({
      id: a._id.toString(),
      title: a.title,
      slug: a.slug,
      body: a.body,
      category: a.category ?? null,
      tags: a.tags,
      status: a.status,
      visibility: a.visibility,
      authorId: a.authorId,
      authorName: staffNames.get(a.authorId) ?? null,
      updatedById: a.updatedById ?? null,
      updatedByName: (a.updatedById && staffNames.get(a.updatedById)) || null,
      publishedAt: a.publishedAt?.toISOString() ?? null,
      views: a.views,
      helpfulCount: a.helpfulCount,
      notHelpfulCount: a.notHelpfulCount,
      createdAt: a.createdAt?.toISOString() ?? '',
      updatedAt: a.updatedAt?.toISOString() ?? '',
    }));
  }

  /** Load an article by id, rejecting malformed ids with a 404 instead of a Mongoose CastError (500). */
  private async getByIdOrFail(id: string): Promise<KbArticleDocument> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException(`Article with ID ${id} not found`);
    }
    const article = await this.articleModel.findById(id).exec();
    if (!article) {
      throw new NotFoundException(`Article with ID ${id} not found`);
    }
    return article;
  }
}
