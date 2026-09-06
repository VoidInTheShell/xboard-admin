import type { PercentCrop } from 'react-image-crop'

export const CLIENT_LOGO_SIZE = 256
export function validateLogoFile(file: Pick<File, 'size' | 'type'>) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('请选择 PNG、JPG、JPEG 或 WebP 图片。')
  if (file.size === 0 || file.size > 2 * 1024 * 1024)
    throw new Error('图片不能为空，且不能超过 2 MiB。')
}
export function logoCropBounds(
  width: number,
  height: number,
  crop: PercentCrop,
) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 20_000_000 ||
    width > 16384 ||
    height > 16384
  )
    throw new Error('图片尺寸无效或超过 2000 万像素，请缩小图片后重试。')
  if (
    ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) ||
    crop.width <= 0 ||
    crop.height <= 0 ||
    crop.x < 0 ||
    crop.y < 0 ||
    crop.x + crop.width > 100.01 ||
    crop.y + crop.height > 100.01
  )
    throw new Error('请选择图片范围内的裁剪区域。')
  const x = (crop.x * width) / 100
  const y = (crop.y * height) / 100
  const side = Math.min(
    (crop.width * width) / 100,
    (crop.height * height) / 100,
    width - x,
    height - y,
  )
  if (side < 1) throw new Error('裁剪区域太小，请重新选择。')
  return { x, y, side }
}
export async function cropClientLogo(
  image: HTMLImageElement,
  crop: PercentCrop,
): Promise<File> {
  const { x, y, side } = logoCropBounds(
    image.naturalWidth,
    image.naturalHeight,
    crop,
  )
  const canvas = document.createElement('canvas')
  canvas.width = CLIENT_LOGO_SIZE
  canvas.height = CLIENT_LOGO_SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法打开图片编辑器，请更新浏览器后重试。')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    image,
    x,
    y,
    side,
    side,
    0,
    0,
    CLIENT_LOGO_SIZE,
    CLIENT_LOGO_SIZE,
  )
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new Error('图标转换失败，请重新选择图片。')),
      'image/png',
    ),
  )
  return new File([blob], 'client-icon.png', { type: 'image/png' })
}
