// Wikipedia API lookup service
// Uses the MediaWiki REST API to fetch article extracts

interface WikipediaResult {
  title: string;
  extract: string;
  url: string;
  thumbnail?: string;
}

export async function lookupWikipedia(
  topic: string
): Promise<WikipediaResult | null> {
  const encoded = encodeURIComponent(topic);

  // Use the Wikipedia REST API to search and get an extract
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encoded}&srlimit=1&format=json&origin=*`;

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) return null;

  const searchData = (await searchRes.json()) as {
    query?: { search?: { title: string }[] };
  };

  const firstResult = searchData.query?.search?.[0];
  if (!firstResult) return null;

  const pageTitle = firstResult.title;
  const encodedTitle = encodeURIComponent(pageTitle);

  // Fetch the extract for the found page
  const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodedTitle}&prop=extracts|pageimages&exintro=1&explaintext=1&pithumbsize=200&format=json&origin=*`;

  const extractRes = await fetch(extractUrl);
  if (!extractRes.ok) return null;

  const extractData = (await extractRes.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          title: string;
          extract?: string;
          thumbnail?: { source: string };
        }
      >;
    };
  };

  const pages = extractData.query?.pages;
  if (!pages) return null;

  const page = Object.values(pages)[0];
  if (!page || !page.extract) return null;

  return {
    title: page.title,
    extract: page.extract,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
    thumbnail: page.thumbnail?.source,
  };
}
