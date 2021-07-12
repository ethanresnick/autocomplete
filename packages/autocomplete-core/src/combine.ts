import {
  AutocompleteCollection,
  AutocompleteSource,
  BaseItem,
  InternalAutocompleteSource,
} from './types';
import { noop } from './utils';

type SourceTransformer = (
  collection: AutocompleteCollection<any>,
  collections: Array<AutocompleteCollection<any>>
) => Array<AutocompleteSource<any>>;

export type CombineDescription = {
  $$type: 'combine';
  args: [AutocompleteSource<any>[], SourceTransformer[]];
};

export function isCombineDescription(
  description: any
): description is CombineDescription {
  return description.$$type === 'combine';
}

export function runCombine(
  collections: Array<AutocompleteCollection<any>>,
  transformers: SourceTransformer[]
): Array<AutocompleteCollection<any>> {
  console.log('runCombine', { collections, transformers });

  // @ts-ignore
  return transformers.reduce<Array<AutocompleteCollection<any>>>(
    (rawCollections, transformer) => {
      return rawCollections.flatMap((rawCollection) => {
        const sources = ensureArray(transformer(rawCollection, rawCollections));

        return sources.map((source) => {
          return {
            source,
            items: source.getItems(),
          };
        });
      });
    },
    collections
  );
}

export function combine(
  sources: Array<AutocompleteSource<any>>,
  transformers: SourceTransformer[]
) {
  return {
    $$type: 'combine',
    args: [sources, transformers],
  };
}

type GroupByOptions<TItem extends BaseItem> = {
  getSource(params: { title: string }): Partial<AutocompleteSource<TItem>>;
};

export function groupBy<TItem extends BaseItem>(
  predicate: (value: TItem) => string,
  options: GroupByOptions<TItem>
): SourceTransformer {
  return function runGroupBy({
    items,
  }): Array<InternalAutocompleteSource<TItem>> {
    console.log('groupBy', { items });

    const groupedItems = items.reduce<Record<string, TItem[]>>((acc, item) => {
      const key = predicate(item);

      if (!acc.hasOwnProperty(key)) {
        acc[key] = [];
      }

      acc[key].push(item);

      return acc;
    }, {});

    const titles = Object.keys(groupedItems);

    return titles.map((title) => {
      return createSource<TItem>({
        sourceId: title,
        ...options.getSource({ title }),
        getItems() {
          return groupedItems[title];
        },
      });
    });
  };
}

export function limit(value: number): SourceTransformer {
  return function runLimit({ source, items }) {
    return [
      {
        ...source,
        getItems() {
          return items.slice(0, value);
        },
      },
    ];
  };
}

export function balance(minLimit: number): SourceTransformer {
  return function runBalance({ source, items }, collections) {
    const numberOfItemsPerSection = Math.ceil(
      collections.flatMap((x) => x.items).length / collections.length
    );
    const limit = Math.max(minLimit, numberOfItemsPerSection);
    const isLastSource =
      source.sourceId === collections[collections.length - 1].source.sourceId;

    return [
      {
        ...source,
        getItems() {
          return isLastSource ? items : items.slice(0, limit);
        },
      },
    ];
  };
}

export function createSource<TItem extends BaseItem>(
  source: AutocompleteSource<TItem>
): InternalAutocompleteSource<TItem> {
  return {
    getItemInputValue({ state }) {
      return state.query;
    },
    getItemUrl() {
      return undefined;
    },
    onSelect({ setIsOpen }) {
      setIsOpen(false);
    },
    onActive: noop,
    ...source,
  };
}

function ensureArray<TItem>(maybeArray: TItem | TItem[]): TItem[] {
  return Array.isArray(maybeArray) ? maybeArray : [maybeArray];
}
