import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { fail, handle, ok } from '@/lib/api/respond';
import {
  ALLOWED_IMAGE_TYPES,
  MAX_PHOTO_BYTES,
  buildKey,
  putObject,
} from '@/lib/storage';
import { analyzePhoto } from '@/lib/vision/analyze';
import { claimPhotoAnalysis } from '@/lib/billing/entitlements';
import { decodeModel, decodedSummary } from '@/lib/decoder';
import { PhotoKind } from '@prisma/client';

/** `kind` arrives from a multipart form, so it is untrusted input. */
function asPhotoKind(value: unknown): PhotoKind | null {
  return typeof value === 'string' && value in PhotoKind ? (value as PhotoKind) : null;
}

export const maxDuration = 60;

export const POST = handle(async (request: NextRequest) => {
  const user = await requireUser();
  await claimPhotoAnalysis(user.id);

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return fail('No image was uploaded.', 400, 'no_file');

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return fail(
      `That file type (${file.type || 'unknown'}) is not supported. Use a JPEG, PNG, WebP or HEIC photo.`,
      415,
      'unsupported_type',
    );
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return fail(
      `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_PHOTO_BYTES / 1024 / 1024} MB — most phones let you send a smaller version.`,
      413,
      'too_large',
    );
  }

  const sessionId = (form.get('sessionId') as string | null) || null;
  const jobId = (form.get('jobId') as string | null) || null;
  const intent = asPhotoKind(form.get('kind'));

  // A session id from the client is only honoured if it belongs to this user.
  let verifiedSessionId: string | null = null;
  if (sessionId) {
    const owned = await prisma.diagnosticSession.findFirst({
      where: { id: sessionId, userId: user.id },
      select: { id: true },
    });
    verifiedSessionId = owned?.id ?? null;
  }

  // Same for the job. Without this check a photo of one customer's equipment
  // could be attached to another company's job by passing its id, and an
  // unparseable id would surface as a foreign-key error rather than a refusal.
  let verifiedJobId: string | null = null;
  if (jobId) {
    const owned = await prisma.job.findFirst({
      where: {
        id: jobId,
        ...(user.companyId ? { companyId: user.companyId } : { userId: user.id }),
      },
      select: { id: true },
    });
    if (!owned) {
      return fail('That job does not exist, or it belongs to another account.', 404, 'not_found');
    }
    verifiedJobId = owned.id;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = buildKey({ scope: 'photos', ownerId: user.id, filename: file.name || 'photo.jpg' });
  await putObject(key, buffer, file.type);

  const analysis = await analyzePhoto({
    base64: buffer.toString('base64'),
    // HEIC is common from iPhones but not universally supported by vision
    // models; declare it as JPEG only when the bytes actually are JPEG.
    mediaType: file.type === 'image/heic' || file.type === 'image/heif' ? 'image/jpeg' : file.type,
    intent,
    userId: user.id,
    sessionId: verifiedSessionId,
  });

  const photo = await prisma.photo.create({
    data: {
      userId: user.id,
      sessionId: verifiedSessionId,
      jobId: verifiedJobId,
      storageKey: key,
      contentType: file.type,
      bytes: buffer.byteLength,
      kind: analysis.photoKind,
      analysis: analysis as unknown as object,
      analyzedAt: new Date(),
    },
  });

  // A legible model number is immediately worth decoding — that is the whole
  // point of photographing a rating plate.
  const decoded =
    analysis.modelNumber.legible && analysis.modelNumber.value
      ? (() => {
          const d = decodeModel(
            analysis.modelNumber.value!,
            analysis.serialNumber.value,
            analysis.manufacturer.value,
          );
          return { decoded: d, summary: decodedSummary(d) };
        })()
      : null;

  return ok({ photoId: photo.id, analysis, decoded }, 201);
});
