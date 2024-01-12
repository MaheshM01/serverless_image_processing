import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";

const S3 = new S3Client();
const DEST_BUCKET = process.env.DEST_BUCKET;
const THUMBNAIL_WIDTH = 200; // px
const COVER_WIDTH = 800; // px
const PASSPORT_SIZE_WIDTH = 150; // px
const PASSPORT_SIZE_HEIGHT = 200; // px
const SUPPORTED_FORMATS = {
  jpg: true,
  jpeg: true,
  png: true,
};

const BACKGROUND_COLOR = 'white'; // Change to 'blue' or any other color

export const handler = async (event, context) => {
  const { eventTime, s3 } = event.Records[0];
  const srcBucket = s3.bucket.name;

  // Object key may have spaces or unicode non-ASCII characters
  const srcKey = decodeURIComponent(s3.object.key.replace(/\+/g, " "));
  const ext = srcKey.replace(/^.*\./, "").toLowerCase();

  console.log(`${eventTime} - ${srcBucket}/${srcKey}`);

  if (!SUPPORTED_FORMATS[ext]) {
    console.log(`ERROR: Unsupported file type (${ext})`);
    return;
  }

  // Get the image from the source bucket
  try {
    const { Body, ContentType } = await S3.send(
      new GetObjectCommand({
        Bucket: srcBucket,
        Key: srcKey,
      })
    );
    const chunks = [];
    for await (const chunk of Body) {
      chunks.push(chunk);
    }
    const image = Buffer.concat(chunks);
    // Check if the image buffer is not empty and represents a valid image
  if (image.length === 0) {
    console.log("ERROR: Empty image buffer");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Empty image buffer" }),
    };
  }
    // Resize thumbnail
    const thumbnailBuffer = await sharp(image)
      .resize(THUMBNAIL_WIDTH)
      .toBuffer();

    // Resize cover image
    const coverBuffer = await sharp(image).resize(COVER_WIDTH).toBuffer();

    // Resize passport-size image
    const passportBuffer = await sharp(image)
      .resize(PASSPORT_SIZE_WIDTH, PASSPORT_SIZE_HEIGHT)
      .composite([{
        input: Buffer.from([255, 255, 255, 0]), // RGBA values for the background color (white in this example)
        blend: 'dest-in'
      }])
      .toBuffer();

    // Store new thumbnail in the destination bucket
    await S3.send(
      new PutObjectCommand({
        Bucket: DEST_BUCKET,
        Key: `thumbnails/${srcKey}`,
        Body: thumbnailBuffer,
        ContentType,
      })
    );

    // Store new cover image in the destination bucket
    await S3.send(
      new PutObjectCommand({
        Bucket: DEST_BUCKET,
        Key: `covers/${srcKey}`,
        Body: coverBuffer,
        ContentType,
      })
    );

    // Store new passport-size image in the destination bucket
    await S3.send(
      new PutObjectCommand({
        Bucket: DEST_BUCKET,
        Key: `passports/${srcKey}`,
        Body: passportBuffer,
        ContentType,
      })
    );

    const message = `Successfully resized ${srcBucket}/${srcKey} and uploaded thumbnails, covers, and passport-size images to ${DEST_BUCKET}/thumbnails/${srcKey}, ${DEST_BUCKET}/covers/${srcKey}, and ${DEST_BUCKET}/passports/${srcKey}`;
    console.log(message);
    return {
      statusCode: 200,
      body: message,
    };
  } catch (error) {
    console.log(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};
