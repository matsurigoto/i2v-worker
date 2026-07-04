import axios from "axios";

export async function downloadToBuffer(url: string): Promise<Buffer> {
  const response = await axios.get<ArrayBuffer>(url, { responseType: "arraybuffer" });
  return Buffer.from(response.data);
}
