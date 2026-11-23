import * as ImageManipulator from 'expo-image-manipulator';
import { photosApi } from '@/api/endpoints';
import { uploadFileToPresignedUrl } from '@/api/http';
import type { ItemPhotoResponse, PhotoStage } from '@/types/api';

const MAX_IMAGE_WIDTH = 1280;
const JPEG_COMPRESSION_QUALITY = 0.75;

/**
 * Compresses a captured/picked image client-side (max 1280px width, 75% JPEG quality)
 * and uploads it directly to Cloudflare R2 via Presigned PUT URL.
 */
export async function compressAndUploadItemPhoto(
  orderId: string,
  itemId: string,
  localUri: string,
  stage: PhotoStage
): Promise<ItemPhotoResponse> {
  const manipulated = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: MAX_IMAGE_WIDTH } }],
    {
      compress: JPEG_COMPRESSION_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  const contentType = 'image/jpeg';
  const presigned = await photosApi.presign(orderId, itemId, { stage, contentType });
  await uploadFileToPresignedUrl(presigned.uploadUrl, manipulated.uri, contentType);

  return photosApi.register(orderId, itemId, {
    storageKey: presigned.storageKey,
    stage,
    contentType,
  });
}
