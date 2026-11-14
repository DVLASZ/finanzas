/** Baja la foto a 1000 px de lado largo y la guarda como JPEG: un recibo no necesita más y así pesa poco (unos 100 KB). */
export async function reducirFoto(archivo: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(archivo);
  const escala = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(bmp.width * escala);
  lienzo.height = Math.round(bmp.height * escala);
  lienzo.getContext('2d')!.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  return new Promise((ok, mal) => lienzo.toBlob(b => (b ? ok(b) : mal(new Error('no se pudo'))), 'image/jpeg', 0.7));
}

/** El contenido de un archivo como «data:image/jpeg;base64,...». Se arma por trozos para no pasarse con fotos grandes. */
export async function aDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(bin)}`;
}
