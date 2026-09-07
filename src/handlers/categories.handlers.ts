import { IQuery, IQueryHandler } from "../shared/cqrs";
import { CategoryRepository } from "../shared/repositories/category.repository";
import { NotFoundError } from "../shared/errors";
import { applyLocalized, stripTranslations } from "../shared/mappers";

export class ListCategoriesQuery implements IQuery {
  constructor(public readonly locale?: string) {}
}

export class GetCategoryQuery implements IQuery {
  constructor(
    public readonly idOrSlug: string,
    public readonly locale?: string
  ) {}
}

function localizeCategoryNode(node: any, locale?: string): any {
  const withChildren = (c: any) => ({
    ...c,
    children: (c.children || []).map((ch: any) => {
      const localized = applyLocalized(ch, locale, ["name"]);
      return stripTranslations({ ...localized, children: undefined });
    }),
  });

  const localized = applyLocalized(node, locale, ["name"]);
  const out = withChildren(localized);
  return { ...out, translations: undefined };
}

export class ListCategoriesQueryHandler
  implements IQueryHandler<ListCategoriesQuery, any[]>
{
  constructor(private readonly categories: CategoryRepository) {}

  async handle(query: ListCategoriesQuery) {
    const tree = await this.categories.findTree();
    return tree.map((node: any) => localizeCategoryNode(node, query.locale));
  }
}

export class GetCategoryQueryHandler
  implements IQueryHandler<GetCategoryQuery, any>
{
  constructor(private readonly categories: CategoryRepository) {}

  async handle(query: GetCategoryQuery) {
    const category = await this.categories.findBySlugOrId(query.idOrSlug);

    if (!category) {
      throw new NotFoundError("Categoria não encontrada");
    }

    return localizeCategoryNode(category, query.locale);
  }
}