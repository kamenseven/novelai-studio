# Tag dictionary data

`tags.json` contains the top ~20,000 Danbooru tags by post count, plus Chinese annotations.

Each entry is `[name, category, post_count, zh]` where category follows Danbooru:

- 0 general
- 1 artist
- 3 copyright
- 4 character
- 5 meta

Only tag names, categories, post counts and short Chinese labels are stored — no images,
wiki text or aliases. A few NAI-only common tags (e.g. `silver hair`) are added by hand.

## Sources / license

- Tag names, categories and counts: Danbooru public tag API.
- Chinese labels: [DanbooruSearchOnline](https://github.com/SuzumiyaAkizuki/DanbooruSearchOnline)
  `origin_database/tags_enhanced.csv` (GPL-3.0).
- The hand-written supplement is original.

Because the Chinese annotations come from a GPL-3.0 dataset, **`data/tags.json` is distributed
under GPL-3.0** even though the application code is MIT. If you redistribute the app, keep this
notice and comply with GPL-3.0 for the data file.

## Rebuild

```bash
python dev/fetch_tags.py 20        # download top 20k tags
python dev/merge_tag_zh.py         # merge DSO Chinese labels (needs dev/data/tags_enhanced.csv)
python dev/fix_tags_license.py     # keep Danbooru tags + small hand-written supplement
```

The application uses this dictionary for instant local autocomplete (English and Chinese
queries), Chinese annotations under the prompt, and merges the official NovelAI
`suggest-tags` results for long-tail tags.
