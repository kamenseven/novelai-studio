# Tag dictionary data

`tags.json` contains the top ~20,000 Danbooru tags by post count, fetched from the public
Danbooru API (`https://danbooru.donmai.us/tags.json`) on 2026-11-26.

Each entry is `[name, category, post_count]` where category follows Danbooru:

- 0 general
- 1 artist
- 3 copyright
- 4 character
- 5 meta

Only tag names, categories and post counts are stored — no images, wiki text or aliases.
Regenerate with:

```bash
python dev/fetch_tags.py 20
```

The application uses this dictionary for instant local autocomplete, and merges the
official NovelAI `suggest-tags` results for long-tail tags.
