export const getWikiImage = async (productName: string): Promise<string | null> => {
  if (!productName || productName.trim() === '') return null;
  const keyword = productName.trim();
  
  try {
    // Try Bengali Wikipedia first
    const bnUrl = `https://bn.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(keyword)}&gsrlimit=1&prop=pageimages&piprop=thumbnail&pithumbsize=400&format=json&origin=*`;
    const bnRes = await fetch(bnUrl);
    const bnData = await bnRes.json();
    
    if (bnData?.query?.pages) {
      const pages = Object.values(bnData.query.pages) as any[];
      if (pages.length > 0 && pages[0].thumbnail?.source) {
        return pages[0].thumbnail.source;
      }
    }
  } catch (e) {
    console.error("Wiki BN fetch error", e);
  }

  try {
    // Try English Wikipedia as fallback
    const enUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(keyword)}&gsrlimit=1&prop=pageimages&piprop=thumbnail&pithumbsize=400&format=json&origin=*`;
    const enRes = await fetch(enUrl);
    const enData = await enRes.json();
    
    if (enData?.query?.pages) {
      const pages = Object.values(enData.query.pages) as any[];
      if (pages.length > 0 && pages[0].thumbnail?.source) {
        return pages[0].thumbnail.source;
      }
    }
  } catch (e) {
    console.error("Wiki EN fetch error", e);
  }

  return null;
};
