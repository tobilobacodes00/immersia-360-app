import { AwsClient } from 'aws4fetch';

const UPLOAD_LINK_SECONDS = 3600;

/**
 * A URL the phone can PUT one object to, straight into R2 (videos can be bigger than a Worker request may be).
 * Valid for an hour. The Content-Type is part of the signature, so nothing else can be uploaded with it.
 */
export async function presignPut(env: Env, key: string, contentType: string): Promise<string> {
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });
  const url = new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET_NAME}/${key}`);
  url.searchParams.set('X-Amz-Expires', String(UPLOAD_LINK_SECONDS));
  const signed = await client.sign(
    new Request(url, { method: 'PUT', headers: { 'content-type': contentType } }),
    {
      aws: { signQuery: true, allHeaders: true },
    },
  );
  return signed.url;
}
