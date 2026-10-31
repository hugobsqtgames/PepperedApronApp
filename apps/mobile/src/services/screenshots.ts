/**
 * "My latest screenshot": the most recent screenshot of the photo library, to import the recipe
 * just captured (a story, a message, a page) in one tap. Read only when the user asks; the
 * photo library is never written to.
 */
export type LatestScreenshot = { uri: string } | { denied: true } | null;

export async function latestScreenshot(): Promise<LatestScreenshot> {
  const ML = await import('expo-media-library/legacy');
  const perm = await ML.requestPermissionsAsync(false, ['photo']);
  if (!perm.granted) return { denied: true };
  const page = await ML.getAssetsAsync({
    first: 1,
    mediaType: ML.MediaType.photo,
    mediaSubtypes: ['screenshot'],
    sortBy: [[ML.SortBy.creationTime, false]],
  });
  const asset = page.assets[0];
  if (!asset) return null;
  const info = await ML.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: true });
  const uri = info.localUri ?? asset.uri;
  return uri ? { uri } : null;
}
