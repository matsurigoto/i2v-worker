export function bufferToDataUrl(buffer: Buffer, contentType: string): string {
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}
