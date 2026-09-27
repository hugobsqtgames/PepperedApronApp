import { ApiError, NetworkError, type ApiClient } from './api';
import type { LocalStore } from './store';

/** Platform hook: PUT the local file to the presigned URL. */
export type PutFile = (
  url: string,
  headers: Record<string, string>,
  localUri: string,
  contentType: string,
) => Promise<{ status: number }>;

/**
 * Deferred photo uploads: photos are compressed and saved locally first (the recipe shows them
 * immediately), then uploaded when online. The recipe only references the server key once the
 * upload is confirmed.
 */
export class PhotoUploader {
  private running: Promise<void> | null = null;
  constructor(
    private readonly store: LocalStore,
    private readonly api: ApiClient,
    private readonly putFile: PutFile,
    private readonly onUploaded?: () => void,
  ) {}

  run(): Promise<void> {
    if (!this.running) this.running = this.process().finally(() => (this.running = null));
    return this.running;
  }

  private async process() {
    for (const job of this.store.photoJobs()) {
      if (job.state !== 'pending') continue;
      const recipe = this.store.get('recipe', job.recipeId);
      if (!recipe) {
        await this.store.dropPhoto(job.recipeId);
        continue;
      }
      try {
        const up = await this.api.createUpload(job.contentType, job.size);
        const put = await this.putFile(up.url, up.headers, job.localUri, job.contentType);
        if (put.status < 200 || put.status >= 300)
          throw new ApiError(
            put.status,
            put.status >= 500 ? 'server_unavailable' : 'upload_failed',
          );
        const done = await this.api.completeUpload(up.uploadId);
        const current = this.store.get('recipe', job.recipeId);
        // The user may have replaced/removed the photo while we were uploading.
        if (current && this.store.localPhoto(job.recipeId)?.localUri === job.localUri) {
          await this.store.write(
            'recipe',
            job.recipeId,
            { ...current.data, photoKey: done.key },
            current.ownerId,
          );
          await this.store.dropPhoto(job.recipeId);
          this.onUploaded?.();
        }
      } catch (e) {
        if (e instanceof NetworkError) {
          await this.store.photoFailed(job.recipeId, 'offline', false);
          return;
        }
        const code = e instanceof ApiError ? e.code : 'upload_failed';
        const permanent =
          e instanceof ApiError &&
          e.status >= 400 &&
          e.status < 500 &&
          e.status !== 401 &&
          e.status !== 429;
        await this.store.photoFailed(job.recipeId, code, permanent || job.attempts >= 5);
      }
    }
  }
}
