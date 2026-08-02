import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 (S4): el comprobante de transferencia del pago (HU4.3).
 *
 * Reglas duras del mandato S4:
 * - Bucket PRIVADO. Nunca una URL pública ni permanente: para subir y para ver se firman
 *   URLs cortas, siempre después de verificar permisos (la action revalida la membresía y
 *   busca el pago vía withOrg — un pago ajeno ni aparece).
 * - Toda key lleva el scope de la org: `{orgId}/payments/{paymentId}`. El orgId sale de
 *   la SESIÓN (nunca de un input), así que una org no puede ni nombrar una key ajena.
 * - Sin las 4 env vars (`R2_*`), TODO el feature se apaga (`isR2Configured`): la UI no
 *   muestra el campo de foto y las actions responden con error controlado. El pago sin
 *   foto es el flujo principal.
 *
 * El cliente es lazy: no se instancia (ni exige env) hasta el primer uso real.
 */

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET,
  );
}

/** La ÚNICA forma de nombrar un adjunto: el scope de org va en la key, siempre. */
export function paymentAttachmentKey(orgId: string, paymentId: string): string {
  return `${orgId}/payments/${paymentId}`;
}

/** Imágenes de cámara o galería. HEIC/HEIF: lo que sacan los iPhone. */
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB: foto de cámara holgada

/** Validación de tipo y tamaño. Devuelve el mensaje de error, o null si está bien. */
export function validateAttachment(contentType: string, size: number): string | null {
  if (!ALLOWED_TYPES.has(contentType)) {
    return "El comprobante tiene que ser una imagen (JPG, PNG, WebP o HEIC).";
  }
  if (!Number.isFinite(size) || size <= 0) {
    return "No se pudo leer el archivo. Probá de nuevo.";
  }
  if (size > MAX_ATTACHMENT_BYTES) {
    return "La imagen es muy pesada (máximo 10 MB). Probá con una captura o bajale la calidad.";
  }
  return null;
}

let client: S3Client | undefined;

function r2(): S3Client {
  if (!isR2Configured()) {
    throw new Error("R2 no está configurado (faltan las env vars R2_*).");
  }
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return client;
}

/** URL firmada para SUBIR (PUT), 5 minutos, con el content-type clavado en la firma. */
export function presignAttachmentUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  );
}

/** URL firmada para VER (GET), corta a propósito: 60 segundos alcanzan para renderizar. */
export function presignAttachmentView(key: string): Promise<string> {
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }), {
    expiresIn: 60,
  });
}

/** Metadata del objeto subido (para CONFIRMAR tipo y tamaño reales), o null si no existe. */
export async function headAttachment(
  key: string,
): Promise<{ contentType: string; size: number } | null> {
  try {
    const head = await r2().send(
      new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }),
    );
    return { contentType: head.ContentType ?? "", size: head.ContentLength ?? 0 };
  } catch {
    return null;
  }
}

/** Borra el objeto (al eliminar el pago, RN12). Best-effort: un huérfano no rompe nada. */
export async function deleteAttachment(key: string): Promise<void> {
  try {
    await r2().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }));
  } catch {
    // El pago ya se borró de la base; un objeto huérfano en un bucket privado es
    // preferible a fallar la eliminación entera.
  }
}
